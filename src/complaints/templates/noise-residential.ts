import type { ComplaintTemplate } from '../types.js';

export const noiseResidentialTemplate: ComplaintTemplate = {
  type: 'noise-residential',
  displayName: 'Residential Noise',
  description: 'Report noise from a residence (loud music, party, banging, talking)',
  requiredFields: [
    {
      name: 'address',
      label: 'Address',
      required: true,
      type: 'text',
    },
    {
      name: 'noiseType',
      label: 'Type of noise',
      required: true,
      type: 'select',
      options: ['Loud music/party', 'Banging/pounding', 'Loud talking', 'Construction'],
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
  portalCategory: 'Residential Noise',
};
