import type { ComplaintTemplate } from '../types.js';

export const snowIceTemplate: ComplaintTemplate = {
  type: 'snow-ice',
  displayName: 'Snow or Ice on Sidewalk',
  description: 'Report uncleared snow or ice on a sidewalk',
  requiredFields: [
    {
      name: 'address',
      label: 'Address or intersection',
      required: true,
      type: 'text',
    },
    {
      name: 'locationType',
      label: 'Location type',
      required: true,
      type: 'select',
      options: [
        'Sidewalk',
        'Corner crossing/crosswalk',
        'Fire hydrant',
        'Bus stop',
      ],
    },
  ],
  optionalFields: [
    {
      name: 'extendedArea',
      label: 'Extended area description (if covering multiple blocks)',
      required: false,
      type: 'text',
    },
  ],
  portalCategory: 'Snow or Ice',
};
