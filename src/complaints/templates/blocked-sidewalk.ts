import type { ComplaintTemplate } from '../types.js';

export const blockedSidewalkTemplate: ComplaintTemplate = {
  type: 'blocked-sidewalk',
  displayName: 'Blocked Sidewalk',
  description: 'Report a sidewalk, crosswalk entrance, or pedestrian space that is blocked by an object (like a garbage can) preventing easy navigation.',
  portalCategory: 'Sidewalk Condition',
  requiredFields: [
    {
      name: 'address',
      label: 'Location (address or intersection)',
      required: true,
      type: 'text',
    },
    {
      name: 'blockageType',
      label: 'What is blocking the sidewalk?',
      required: true,
      type: 'text',
    }
  ],
  optionalFields: [
    {
      name: 'additionalDetails',
      label: 'Any additional details about the blockage or location?',
      required: false,
      type: 'text',
    }
  ],
};
