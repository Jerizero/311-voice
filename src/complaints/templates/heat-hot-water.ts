import type { ComplaintTemplate } from '../types.js';

export const heatHotWaterTemplate: ComplaintTemplate = {
  type: 'heat-hot-water',
  displayName: 'No Heat or Hot Water',
  description: 'Report lack of heat or hot water in a residential building',
  requiredFields: [
    {
      name: 'buildingAddress',
      label: 'Building address',
      required: true,
      type: 'text',
    },
    {
      name: 'apartmentNumber',
      label: 'Apartment number',
      required: true,
      type: 'text',
    },
    {
      name: 'issueType',
      label: 'What is missing',
      required: true,
      type: 'select',
      options: ['Heat', 'Hot water', 'Both heat and hot water'],
    },
    {
      name: 'scope',
      label: 'Scope of issue',
      required: true,
      type: 'select',
      options: ['My apartment only', 'Entire building'],
    },
  ],
  optionalFields: [
    {
      name: 'contactPhone',
      label: 'Contact phone number (for HPD inspector)',
      required: false,
      type: 'text',
    },
    {
      name: 'landlordContacted',
      label: 'Have you contacted your landlord?',
      required: false,
      type: 'boolean',
    },
  ],
  portalCategory: 'Heat or Hot Water',
};
