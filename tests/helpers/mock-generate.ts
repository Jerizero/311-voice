import type { GenerateFn } from '../../src/conversation/manager.js';

/** Create a mock generate function that returns canned responses in order */
export function mockGenerate(responses: string[]): GenerateFn {
  let index = 0;
  return async (_prompt: string) => {
    if (index >= responses.length) {
      throw new Error(`Mock generate ran out of responses (called ${index + 1} times, only ${responses.length} responses provided)`);
    }
    return responses[index++];
  };
}

/** Standard classification response for snow-ice */
export const CLASSIFY_SNOW_ICE = JSON.stringify({
  complaintType: 'snow-ice',
  confidence: 0.95,
  extractedFields: {
    address: '123 Main Street',
    locationType: 'Sidewalk',
  },
});

/** Classification with missing fields */
export const CLASSIFY_SNOW_ICE_PARTIAL = JSON.stringify({
  complaintType: 'snow-ice',
  confidence: 0.9,
  extractedFields: {
    address: '456 Broadway',
  },
});

/** Classification asking for clarification */
export const CLASSIFY_UNCLEAR = JSON.stringify({
  needsClarification: true,
  clarificationQuestion: 'Could you tell me more about the issue?',
});

/** History intent */
export const INTENT_HISTORY = JSON.stringify({
  intent: 'history',
  query: 'recent complaints',
});

/** Cancel intent */
export const INTENT_CANCEL = JSON.stringify({
  intent: 'cancel',
});

/** Extraction response for location type */
export const EXTRACT_LOCATION_TYPE = JSON.stringify({
  locationType: 'Sidewalk',
});

/** Follow-up question */
export const FOLLOW_UP_LOCATION = 'What type of location is this? Options: Sidewalk, Corner crossing/crosswalk, Fire hydrant, Bus stop';

/** Malformed response (not valid JSON) */
export const MALFORMED_RESPONSE = 'Sure, I can help with that! Let me classify...';

/** Markdown-wrapped JSON response */
export const MARKDOWN_WRAPPED = '```json\n' + CLASSIFY_SNOW_ICE + '\n```';
