import type { ComplaintTemplate } from '../types.js';

export const rodentTemplate: ComplaintTemplate = {
  type: 'rodent',
  displayName: 'Rat or Mouse Sighting',
  description: 'Report rats, mice, or conditions that attract rodents',
  requiredFields: [
    {
      name: 'address',
      label: 'Address',
      required: true,
      type: 'text',
    },
    {
      name: 'sightingType',
      label: 'What you saw',
      required: true,
      type: 'select',
      options: ['Rats', 'Mice', 'Rat droppings/signs', 'Conditions attracting rodents'],
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
  portalCategory: 'Rodent',
};
