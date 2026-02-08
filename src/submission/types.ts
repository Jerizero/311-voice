import type { Page } from 'playwright';

export interface SubmissionResult {
  success: boolean;
  confirmationNumber?: string;
  error?: string;
  screenshot?: string;
}

export interface FormHandler {
  submit(page: Page, fields: Record<string, string | boolean | null>): Promise<SubmissionResult>;
}
