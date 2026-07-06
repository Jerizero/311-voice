import type { ComplaintTemplate } from '../types.js';

export const graffitiTemplate: ComplaintTemplate = {
  type: 'graffiti',
  displayName: 'Graffiti',
  description: 'Report graffiti on a building or public property',
  requiredFields: [
    {
      name: 'address',
      label: 'Address',
      required: true,
      type: 'text',
    },
    {
      name: 'surface',
      label: 'Surface type',
      required: true,
      type: 'select',
      options: ['Residential building', 'Commercial building', 'Public property', 'Other'],
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
  portalCategory: 'Graffiti',
};
