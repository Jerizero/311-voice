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

/** Malformed response (not valid JSON) */
export const MALFORMED_RESPONSE = 'Sure, I can help with that! Let me classify...';
