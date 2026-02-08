import type { SubmissionResult } from '../types.js';
import { PORTAL_URLS } from '../selectors.js';
import type { ComplaintType } from '../../complaints/types.js';

const DISPLAY_NAMES: Record<string, string> = {
  'illegal-parking': 'Illegal Parking',
  'heat-hot-water': 'No Heat or Hot Water',
  'traffic-signal': 'Traffic Signal Issue',
  'missed-collection': 'Missed Garbage/Recycling Collection',
};

export function notImplemented(type: ComplaintType): SubmissionResult {
  const name = DISPLAY_NAMES[type] || type;
  const url = PORTAL_URLS[type] || 'https://portal.311.nyc.gov';
  return {
    success: false,
    error: `${name} browser submission is not yet implemented. ` +
      `Please submit manually at: ${url}`,
  };
}
