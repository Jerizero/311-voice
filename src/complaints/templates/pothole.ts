import type { ComplaintTemplate } from '../types.js';

export const potholeTemplate: ComplaintTemplate = {
  type: 'pothole',
  displayName: 'Pothole',
  description: 'Report a pothole or street surface defect',
  requiredFields: [
    {
      name: 'location',
      label: 'Street location or intersection',
      required: true,
      type: 'text',
    },
    {
      name: 'surface',
      label: 'Where',
      required: true,
      type: 'select',
      options: ['Street/roadway', 'Bike lane', 'Crosswalk'],
    },
  ],
  optionalFields: [
    {
      name: 'details',
      label: 'Additional details',
      required: false,
      type: 'text',
    },
  ],
  portalCategory: 'Street Condition',
};
