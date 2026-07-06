export type ComplaintType =
  | 'illegal-parking'
  | 'heat-hot-water'
  | 'traffic-signal'
  | 'snow-ice'
  | 'missed-collection'
  | 'blocked-sidewalk';

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
  /** Portal SR reference the user pasted back (311-XXXXXXXX). */
  confirmationNumber: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  // Location + NYC Open Data tracking (all optional; populated as available).
  latitude?: number | null;
  longitude?: number | null;
  borough?: string | null;
  /** Matched NYC Open Data unique_key (distinct from the portal SR number). */
  nycUniqueKey?: string | null;
  /** Last-known status from NYC Open Data. */
  nycStatus?: string | null;
  nycCheckedAt?: Date | null;
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
  /** After handoff, we're waiting for the user to paste an SR number or skip. */
  awaitingSubmissionNumber: boolean;
  /** The saved complaint id awaiting an SR number. */
  pendingComplaintId: number | null;
}
