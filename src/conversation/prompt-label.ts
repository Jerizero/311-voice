import { getTemplate } from '../complaints/templates/index.js';
import type { ConversationState } from '../complaints/types.js';

// The prompt says what the app is waiting for, so the user always knows the next move.
export function promptLabel(state: ConversationState): string {
  if (state.awaitingSubmissionNumber) return 'SR number, or skip> ';
  if (state.awaitingConfirmation) return 'yes / edit / cancel> ';
  const type = state.currentComplaint?.type;
  if (type) return `${getTemplate(type).displayName}> `;
  return '> ';
}
