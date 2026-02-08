export type ComplaintType =
  | 'illegal-parking'
  | 'heat-hot-water'
  | 'traffic-signal'
  | 'snow-ice'
  | 'missed-collection';

export type ComplaintStatus = 'draft' | 'submitted' | 'confirmed';

export interface Field {
  name: string;
  label: string;
  required: boolean;
  type: 'text' | 'select' | 'boolean';
  options?: string[]; // For select fields
}

export interface ComplaintTemplate {
  type: ComplaintType;
  displayName: string;
  description: string;
  requiredFields: Field[];
  optionalFields: Field[];
  portalCategory: string;
}

export interface ComplaintData {
  id?: number;
  type: ComplaintType;
  status: ComplaintStatus;
  fields: Record<string, string | boolean | null>;
  confirmationNumber: string | null;
  createdAt: Date;
  submittedAt: Date | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  currentComplaint: Partial<ComplaintData> | null;
  gatheredFields: Record<string, string | boolean | null>;
  messages: ConversationMessage[];
  awaitingConfirmation: boolean;
}
