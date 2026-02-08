import type { ComplaintType, ComplaintTemplate, ConversationMessage } from '../complaints/types.js';
import { getAllTemplates, getTemplate } from '../complaints/templates/index.js';

export function buildClassificationPrompt(userMessage: string, history: ConversationMessage[]): string {
  const templateInfo = getAllTemplates()
    .map(t => {
      const fields = [...t.requiredFields, ...t.optionalFields]
        .map(f => f.name)
        .join(', ');
      return `- ${t.type}: ${t.description} (fields: ${fields})`;
    })
    .join('\n');

  const historyText = history.length > 0
    ? `\nConversation so far:\n${history.map(m => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  return `You are a NYC 311 complaint assistant. Your job is to help users file complaints.

Available complaint types with their field names:
${templateInfo}

${historyText}
User's message: "${userMessage}"

Analyze the user's message and respond with a JSON object:
{
  "complaintType": "<type or null if unclear>",
  "confidence": <0.0 to 1.0>,
  "extractedFields": {
    "<use exact field names from the complaint type>": "<value>"
  },
  "needsClarification": <true/false>,
  "clarificationQuestion": "<question to ask if needsClarification is true>"
}

IMPORTANT: Use the exact field names listed above (e.g., "address" not "location", "locationType" not "type").

If the user is asking about complaint history or status, respond with:
{
  "intent": "history",
  "query": "<what they're asking about>"
}

If the user wants to cancel or abandon the current complaint:
{
  "intent": "cancel"
}

Only respond with the JSON object, nothing else.`;
}

export function buildFollowUpPrompt(
  template: ComplaintTemplate,
  gatheredFields: Record<string, string | boolean | null>,
  history: ConversationMessage[]
): string {
  const required = template.requiredFields
    .filter(f => gatheredFields[f.name] === undefined || gatheredFields[f.name] === null)
    .map(f => {
      if (f.type === 'select' && f.options) {
        return `- ${f.label} (options: ${f.options.join(', ')})`;
      }
      return `- ${f.label}`;
    });

  const optional = template.optionalFields
    .filter(f => gatheredFields[f.name] === undefined || gatheredFields[f.name] === null)
    .map(f => `- ${f.label} (optional)`);

  const gathered = Object.entries(gatheredFields)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      const field = [...template.requiredFields, ...template.optionalFields].find(f => f.name === k);
      return `- ${field?.label || k}: ${v}`;
    });

  const historyText = history.slice(-6) // Last 6 messages for context
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  return `You are a NYC 311 complaint assistant helping gather information for a ${template.displayName} complaint.

Information gathered so far:
${gathered.length > 0 ? gathered.join('\n') : '(none yet)'}

Still needed (required):
${required.length > 0 ? required.join('\n') : '(all required fields collected!)'}

Optional information:
${optional.length > 0 ? optional.join('\n') : '(none)'}

Recent conversation:
${historyText}

Generate a natural, conversational follow-up question to gather the next piece of missing required information.
If all required fields are collected, ask if they want to add any optional information or if they're ready to review and submit.
Keep it brief and friendly.

Respond with just the question text, no JSON or formatting.`;
}

export function buildExtractionPrompt(
  template: ComplaintTemplate,
  userMessage: string,
  gatheredFields: Record<string, string | boolean | null>
): string {
  const allFields = [...template.requiredFields, ...template.optionalFields];
  const fieldDescriptions = allFields.map(f => {
    if (f.type === 'select' && f.options) {
      return `- ${f.name}: ${f.label} (valid values: ${f.options.join(', ')})`;
    }
    return `- ${f.name}: ${f.label}`;
  });

  return `Extract information from this user message for a ${template.displayName} complaint.

Available fields:
${fieldDescriptions.join('\n')}

Already gathered:
${JSON.stringify(gatheredFields, null, 2)}

User message: "${userMessage}"

Extract any new or updated field values from the message.
For select fields, match to the closest valid option.
Respond with a JSON object of field names to values. Only include fields that were mentioned or can be inferred.

IMPORTANT: Use exact field names from the list above.

Example for illegal-parking: {"location": "45th and 9th Ave", "violationType": "Blocking fire hydrant"}
Example for snow-ice: {"address": "135th and Riverside", "locationType": "Sidewalk"}`;
}

export function buildConfirmationSummary(
  template: ComplaintTemplate,
  fields: Record<string, string | boolean | null>
): string {
  const lines: string[] = [
    `\n${'='.repeat(50)}`,
    `📋 ${template.displayName} Complaint`,
    `${'='.repeat(50)}`,
  ];

  for (const field of template.requiredFields) {
    const value = fields[field.name];
    lines.push(`${field.label}: ${value ?? '(not provided)'}`);
  }

  const optionalWithValues = template.optionalFields.filter(f => fields[f.name]);
  if (optionalWithValues.length > 0) {
    lines.push('');
    lines.push('Additional info:');
    for (const field of optionalWithValues) {
      lines.push(`  ${field.label}: ${fields[field.name]}`);
    }
  }

  lines.push(`${'='.repeat(50)}`);
  lines.push('');
  lines.push('Type "submit" to file this complaint, or "edit" to make changes.');

  return lines.join('\n');
}
