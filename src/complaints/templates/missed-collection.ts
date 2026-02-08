import type { ComplaintTemplate } from '../types.js';

export const missedCollectionTemplate: ComplaintTemplate = {
  type: 'missed-collection',
  displayName: 'Missed Garbage/Recycling Collection',
  description: 'Report trash, recycling, or compost that was not collected',
  requiredFields: [
    {
      name: 'address',
      label: 'Address',
      required: true,
      type: 'text',
    },
    {
      name: 'collectionType',
      label: 'Type of collection missed',
      required: true,
      type: 'select',
      options: ['Trash', 'Recycling', 'Compost'],
    },
  ],
  optionalFields: [
    {
      name: 'scheduledDay',
      label: 'Scheduled collection day',
      required: false,
      type: 'text',
    },
  ],
  portalCategory: 'Missed Collection',
};
