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
import { prepareHandoff, openInBrowser, formatHandoff } from '../submission/assisted.js';
import { findCandidates, getStatusByUniqueKey } from '../tracking/nyc-opendata.js';
import type { ComplaintData } from '../complaints/types.js';
import { logger } from '../utils/logger.js';

/** Parse an NYC 311 SR reference (311-XXXXXXXX) or a bare digit run. */
function parseServiceRequestNumber(text: string): string | null {
  const match = text.match(/\b(311-\d{5,}|\d{7,})\b/i);
  return match ? match[1] : null;
}

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
      awaitingSubmissionNumber: false,
      pendingComplaintId: null,
    };
  }

  private async generate(prompt: string): Promise<string> {
    return this.generateFn(prompt);
  }

  async processMessage(userMessage: string): Promise<string> {
    this.state.messages.push({ role: 'user', content: userMessage });

    if (this.state.awaitingSubmissionNumber) {
      return this.handleSubmissionNumberResponse(userMessage);
    }

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

  /**
   * NYC has no submission API and forces a manual map-pin, so we prepare the
   * filing, open the portal in the user's own browser, and hand off the final
   * pin + submit. The complaint stays a local draft until the user comes back
   * with an SR number, at which point it becomes 'submitted'.
   */
  private async submitComplaint(): Promise<string> {
    const type = this.state.currentComplaint!.type as ComplaintType;

    const complaint = createComplaint(type, this.state.gatheredFields);
    const packet = await prepareHandoff(type, this.state.gatheredFields);

    // Persist geocoded location for later status tracking.
    updateComplaint(complaint.id!, {
      ...(packet.latitude !== undefined ? { latitude: packet.latitude } : {}),
      ...(packet.longitude !== undefined ? { longitude: packet.longitude } : {}),
      ...(packet.borough ? { borough: packet.borough } : {}),
    });

    let browserOpened = false;
    if (this.useBrowser) {
      browserOpened = openInBrowser(packet.portalUrl);
    }

    const message = formatHandoff(packet, browserOpened);

    // Await the SR number instead of pretending the complaint was filed.
    this.state.awaitingConfirmation = false;
    this.state.awaitingSubmissionNumber = true;
    this.state.pendingComplaintId = complaint.id!;
    this.state.messages.push({ role: 'assistant', content: message });
    return message;
  }

  private handleSubmissionNumberResponse(userMessage: string): string {
    const id = this.state.pendingComplaintId;
    const lower = userMessage.toLowerCase().trim();

    if (lower === 'skip' || lower === 'later' || lower === 'cancel' || lower === 'no') {
      const message =
        `No problem. It's saved as a draft (#${id}). ` +
        `Type "history" to find it later, or file it and paste the SR number then.\n\n` +
        `What else can I help you with?`;
      this.reset();
      this.state.messages.push({ role: 'assistant', content: message });
      return message;
    }

    const srNumber = parseServiceRequestNumber(userMessage);
    if (!srNumber) {
      return (
        `I didn't catch an SR number in that. It looks like "311-XXXXXXXX" on the ` +
        `confirmation page. Paste it here, or type "skip" to save this as a draft.`
      );
    }

    if (id !== null) {
      updateComplaint(id, {
        status: 'submitted',
        confirmationNumber: srNumber,
        submittedAt: new Date(),
      });
    }

    const message =
      `Filed and logged (#${id}, SR ${srNumber}).\n` +
      `Type "track" in a day or two to check its status with NYC.\n\n` +
      `What else can I help you with?`;
    this.reset();
    this.state.messages.push({ role: 'assistant', content: message });
    return message;
  }

  private handleHistoryQuery(_query: string): string {
    return this.showHistory();
  }

  /** Format the recent-complaints list with honest, per-status labels. */
  showHistory(): string {
    const complaints = listComplaints({ limit: 15 });

    if (complaints.length === 0) {
      return "You haven't started any complaints yet.";
    }

    const lines = ['Your recent complaints:\n'];
    for (const c of complaints) {
      const template = getTemplate(c.type);
      const date = c.createdAt.toLocaleDateString();
      lines.push(`#${c.id} - ${template.displayName} - ${this.statusLabel(c)} (${date})`);
      if (c.confirmationNumber) {
        lines.push(`   SR: ${c.confirmationNumber}`);
      }
    }
    return lines.join('\n');
  }

  private statusLabel(c: ComplaintData): string {
    if (c.nycStatus) return `NYC status: ${c.nycStatus}`;
    if (c.status === 'submitted') return 'Filed (awaiting NYC status)';
    if (c.status === 'confirmed') return 'Confirmed';
    return 'Draft (not filed)';
  }

  /**
   * Check filed complaints against NYC Open Data. Since the portal SR number is
   * not the dataset key, we match by location + date window and surface the best
   * candidate. The dataset lags roughly a day, so recent filings may not appear.
   */
  async trackComplaints(): Promise<string> {
    const filed = listComplaints({ status: 'submitted' });
    if (filed.length === 0) {
      return 'No filed complaints to track yet. File one and paste its SR number, then check back.';
    }

    const lines: string[] = ['Checking NYC Open Data...\n'];
    for (const c of filed) {
      const template = getTemplate(c.type);
      const label = `#${c.id} ${template.displayName}${c.confirmationNumber ? ` (SR ${c.confirmationNumber})` : ''}`;

      try {
        // Already linked to a dataset record: just refresh it.
        if (c.nycUniqueKey) {
          const sr = await getStatusByUniqueKey(c.nycUniqueKey);
          if (sr) {
            updateComplaint(c.id!, { nycStatus: sr.status, nycCheckedAt: new Date() });
            lines.push(`${label}: ${sr.status}`);
            if (sr.resolutionDescription) lines.push(`   ${sr.resolutionDescription}`);
            continue;
          }
        }

        if (c.latitude == null || c.longitude == null) {
          lines.push(`${label}: can't auto-match (no saved coordinates). Check status on the NYC portal.`);
          continue;
        }

        const candidates = await findCandidates({
          latitude: c.latitude,
          longitude: c.longitude,
          borough: c.borough ?? undefined,
          filedAfter: c.submittedAt ?? c.createdAt,
          windowDays: 3,
          limit: 3,
        });

        const best = candidates[0];
        // Confident single match: within 120m and clearly closer than the runner-up.
        if (best && best.distanceMeters !== undefined && best.distanceMeters <= 120) {
          updateComplaint(c.id!, {
            nycUniqueKey: best.uniqueKey,
            nycStatus: best.status,
            nycCheckedAt: new Date(),
          });
          lines.push(`${label}: ${best.status} - ${best.complaintType} (${Math.round(best.distanceMeters)}m away)`);
          if (best.resolutionDescription) lines.push(`   ${best.resolutionDescription}`);
        } else if (candidates.length > 0) {
          lines.push(`${label}: no confident match yet. Nearby candidates:`);
          for (const cand of candidates) {
            const dist = cand.distanceMeters !== undefined ? `${Math.round(cand.distanceMeters)}m` : 'unknown dist';
            lines.push(`   - ${cand.complaintType} (${cand.status}, ${dist})`);
          }
        } else {
          lines.push(`${label}: not in NYC Open Data yet (it updates ~daily). Try again tomorrow.`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown error';
        lines.push(`${label}: couldn't reach NYC Open Data (${msg}).`);
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
      awaitingSubmissionNumber: false,
      pendingComplaintId: null,
    };
  }

  getState(): ConversationState {
    return { ...this.state };
  }
}
