import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  ComplaintType,
  ConversationState,
  ConversationMessage,
} from '../complaints/types.js';
import { getTemplate, getAllTemplates } from '../complaints/templates/index.js';
import {
  buildClassificationPrompt,
  buildFollowUpPrompt,
  buildExtractionPrompt,
  buildConfirmationSummary,
} from './prompts.js';
import { createComplaint, updateComplaint, listComplaints } from '../storage/complaints.js';
import { getSubmitter, closeSubmitter } from '../submission/playwright.js';
import { logger } from '../utils/logger.js';

const MODEL_NAME = 'gemini-3.1-pro-preview';

export type GenerateFn = (prompt: string) => Promise<string>;

/** Parse a JSON response from the LLM, stripping markdown fences and validating. */
export function parseJsonResponse<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    logger.debug('  → Failed to parse LLM response as JSON. Raw text:', text.substring(0, 200));
    return null;
  }
}

export class ConversationManager {
  private generateFn: GenerateFn;
  private state: ConversationState;
  private useBrowser: boolean;

  constructor(apiKey?: string, useBrowser = true, generateFn?: GenerateFn) {
    if (generateFn) {
      this.generateFn = generateFn;
    } else {
      const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) {
        throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable required');
      }
      const genAI = new GoogleGenerativeAI(key);
      this.generateFn = async (prompt: string) => {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        return result.response.text();
      };
    }
    this.useBrowser = useBrowser;
    this.state = {
      currentComplaint: null,
      gatheredFields: {},
      messages: [],
      awaitingConfirmation: false,
    };
  }

  private async generate(prompt: string): Promise<string> {
    return this.generateFn(prompt);
  }

  async processMessage(userMessage: string): Promise<string> {
    this.state.messages.push({ role: 'user', content: userMessage });

    if (this.state.awaitingConfirmation) {
      return this.handleConfirmationResponse(userMessage);
    }

    if (!this.state.currentComplaint?.type) {
      return this.classifyAndStart(userMessage);
    }

    return this.continueGathering(userMessage);
  }

  private async classifyAndStart(userMessage: string): Promise<string> {
    const prompt = buildClassificationPrompt(userMessage, this.state.messages);
    const responseText = await this.generate(prompt);

    const parsed = parseJsonResponse<{
      complaintType?: ComplaintType | null;
      confidence?: number;
      extractedFields?: Record<string, string>;
      needsClarification?: boolean;
      clarificationQuestion?: string;
      intent?: 'history' | 'cancel';
      query?: string;
    }>(responseText);

    if (!parsed) {
      return "I couldn't understand that. Could you describe what you'd like to report?";
    }

    if (parsed.intent === 'history') {
      return this.handleHistoryQuery(parsed.query || '');
    }

    if (parsed.intent === 'cancel') {
      this.reset();
      return 'Okay, cancelled. What would you like to do?';
    }

    if (parsed.needsClarification && parsed.clarificationQuestion) {
      const clarification = parsed.clarificationQuestion;
      this.state.messages.push({ role: 'assistant', content: clarification });
      return clarification;
    }

    if (parsed.complaintType && parsed.confidence && parsed.confidence > 0.5) {
      this.state.currentComplaint = { type: parsed.complaintType };
      this.state.gatheredFields = parsed.extractedFields || {};

      if (this.hasAllRequiredFields()) {
        return this.showConfirmation();
      }

      const followUp = await this.generateFollowUp();
      this.state.messages.push({ role: 'assistant', content: followUp });
      return followUp;
    }

    const types = getAllTemplates().map(t => `• ${t.displayName}`).join('\n');
    const helpMessage = `I can help you file these types of complaints:\n${types}\n\nWhat would you like to report?`;
    this.state.messages.push({ role: 'assistant', content: helpMessage });
    return helpMessage;
  }

  private async continueGathering(userMessage: string): Promise<string> {
    const template = getTemplate(this.state.currentComplaint!.type as ComplaintType);

    const lower = userMessage.toLowerCase();
    if (lower === 'cancel' || lower === 'nevermind' || lower === 'never mind') {
      this.reset();
      return 'Okay, cancelled. What would you like to do?';
    }

    const extractPrompt = buildExtractionPrompt(template, userMessage, this.state.gatheredFields);
    const responseText = await this.generate(extractPrompt);

    const extracted = parseJsonResponse<Record<string, string>>(responseText);
    if (extracted) {
      Object.assign(this.state.gatheredFields, extracted);
    }

    if (this.hasAllRequiredFields()) {
      return this.showConfirmation();
    }

    const followUp = await this.generateFollowUp();
    this.state.messages.push({ role: 'assistant', content: followUp });
    return followUp;
  }

  private hasAllRequiredFields(): boolean {
    if (!this.state.currentComplaint?.type) return false;

    const template = getTemplate(this.state.currentComplaint.type as ComplaintType);
    return template.requiredFields.every(
      (f) => this.state.gatheredFields[f.name] !== undefined && this.state.gatheredFields[f.name] !== null
    );
  }

  private async generateFollowUp(): Promise<string> {
    const template = getTemplate(this.state.currentComplaint!.type as ComplaintType);
    const prompt = buildFollowUpPrompt(template, this.state.gatheredFields, this.state.messages);
    const response = await this.generate(prompt);
    return response.trim() || 'Could you provide more details?';
  }

  private showConfirmation(): string {
    const template = getTemplate(this.state.currentComplaint!.type as ComplaintType);
    const summary = buildConfirmationSummary(template, this.state.gatheredFields);
    this.state.awaitingConfirmation = true;
    this.state.messages.push({ role: 'assistant', content: summary });
    return summary;
  }

  private async handleConfirmationResponse(userMessage: string): Promise<string> {
    const lower = userMessage.toLowerCase().trim();

    if (lower === 'submit' || lower === 'yes' || lower === 'confirm') {
      return this.submitComplaint();
    }

    if (lower === 'edit' || lower === 'change') {
      this.state.awaitingConfirmation = false;
      const editPrompt = 'What would you like to change?';
      this.state.messages.push({ role: 'assistant', content: editPrompt });
      return editPrompt;
    }

    if (lower === 'cancel' || lower === 'no') {
      this.reset();
      return 'Okay, cancelled. What would you like to do?';
    }

    this.state.awaitingConfirmation = false;
    return this.continueGathering(userMessage);
  }

  private async submitComplaint(): Promise<string> {
    const type = this.state.currentComplaint!.type as ComplaintType;
    const template = getTemplate(type);

    const complaint = createComplaint(type, this.state.gatheredFields);

    let successMessage: string;

    if (this.useBrowser) {
      console.log('\n  Opening browser to submit to NYC 311...\n');

      try {
        const submitter = await getSubmitter(false);
        const result = await submitter.submit(type, this.state.gatheredFields);

        if (result.success) {
          updateComplaint(complaint.id!, {
            status: 'confirmed',
            confirmationNumber: result.confirmationNumber || undefined,
            submittedAt: new Date(),
          });

          successMessage = `\n${template.displayName} complaint submitted to NYC 311!\n\nLocal ID: ${complaint.id}`;
          if (result.confirmationNumber) {
            successMessage += `\n311 Reference: ${result.confirmationNumber}`;
          }
          successMessage += '\n\nWhat else can I help you with?';
        } else {
          updateComplaint(complaint.id!, {
            status: 'submitted',
            submittedAt: new Date(),
          });

          successMessage = `\nBrowser submission encountered an issue: ${result.error}\n\nComplaint saved locally (ID: ${complaint.id})\nYou can manually submit at: https://portal.311.nyc.gov\n\nWhat else can I help you with?`;
        }

        await closeSubmitter();
      } catch (error) {
        updateComplaint(complaint.id!, {
          status: 'submitted',
          submittedAt: new Date(),
        });

        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        successMessage = `\nCould not open browser: ${errorMsg}\n\nComplaint saved locally (ID: ${complaint.id})\n\nWhat else can I help you with?`;
      }
    } else {
      updateComplaint(complaint.id!, {
        status: 'submitted',
        submittedAt: new Date(),
      });

      successMessage = `\n${template.displayName} complaint saved locally!\n\nComplaint ID: ${complaint.id}\n(Browser submission disabled)\n\nWhat else can I help you with?`;
    }

    this.reset();
    this.state.messages.push({ role: 'assistant', content: successMessage });
    return successMessage;
  }

  private handleHistoryQuery(_query: string): string {
    const complaints = listComplaints({ limit: 10 });

    if (complaints.length === 0) {
      return "You haven't filed any complaints yet.";
    }

    const lines = ['Your recent complaints:\n'];
    for (const c of complaints) {
      const template = getTemplate(c.type);
      const status = c.status === 'submitted' ? 'Submitted' : 'Draft';
      const date = c.createdAt.toLocaleDateString();
      lines.push(`${status} #${c.id} - ${template.displayName} (${date})`);
      if (c.confirmationNumber) {
        lines.push(`   311 Ref: ${c.confirmationNumber}`);
      }
    }

    return lines.join('\n');
  }

  reset(): void {
    this.state = {
      currentComplaint: null,
      gatheredFields: {},
      messages: [],
      awaitingConfirmation: false,
    };
  }

  getState(): ConversationState {
    return { ...this.state };
  }
}
