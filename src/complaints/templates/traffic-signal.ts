import type { ComplaintTemplate } from '../types.js';

export const trafficSignalTemplate: ComplaintTemplate = {
  type: 'traffic-signal',
  displayName: 'Traffic Signal Issue',
  description: 'Report a problem with a traffic light or pedestrian signal',
  requiredFields: [
    {
      name: 'intersection',
      label: 'Intersection (cross streets)',
      required: true,
      type: 'text',
    },
    {
      name: 'problemType',
      label: 'Type of problem',
      required: true,
      type: 'select',
      options: [
        'Signal timing too short',
        'Signal timing too long',
        'Light is out/not working',
        'All lights out',
        'Signal knocked down',
        'Pedestrian signal not working',
        'Request new signal',
        'Other',
      ],
    },
  ],
  optionalFields: [
    {
      name: 'direction',
      label: 'Direction of travel affected',
      required: false,
      type: 'text',
    },
    {
      name: 'timeObserved',
      label: 'Time of day when issue was observed',
      required: false,
      type: 'text',
    },
  ],
  portalCategory: 'Traffic Signal',
};
