import type { ComplaintTemplate } from '../types.js';

export const illegalParkingTemplate: ComplaintTemplate = {
  type: 'illegal-parking',
  displayName: 'Illegal Parking',
  description: 'Report a vehicle parked illegally on public property',
  requiredFields: [
    {
      name: 'location',
      label: 'Location',
      required: true,
      type: 'text',
    },
    {
      name: 'violationType',
      label: 'Type of violation',
      required: true,
      type: 'select',
      options: [
        'Blocking fire hydrant',
        'Double parked',
        'In bike lane',
        'Blocking crosswalk',
        'Blocking bus stop',
        'In disabled parking without permit',
        'Blocking driveway',
        'Other',
      ],
    },
  ],
  optionalFields: [
    {
      name: 'licensePlate',
      label: 'License plate number',
      required: false,
      type: 'text',
    },
    {
      name: 'vehicleDescription',
      label: 'Vehicle description (make, model, color)',
      required: false,
      type: 'text',
    },
  ],
  portalCategory: 'Illegal Parking',
};
