import type { ComplaintTemplate, ComplaintType } from '../types.js';
import { illegalParkingTemplate } from './illegal-parking.js';
import { heatHotWaterTemplate } from './heat-hot-water.js';
import { trafficSignalTemplate } from './traffic-signal.js';
import { snowIceTemplate } from './snow-ice.js';
import { missedCollectionTemplate } from './missed-collection.js';
import { blockedSidewalkTemplate } from './blocked-sidewalk.js';
import { noiseResidentialTemplate } from './noise-residential.js';
import { rodentTemplate } from './rodent.js';
import { potholeTemplate } from './pothole.js';
import { graffitiTemplate } from './graffiti.js';

export const templates: Record<ComplaintType, ComplaintTemplate> = {
  'illegal-parking': illegalParkingTemplate,
  'heat-hot-water': heatHotWaterTemplate,
  'traffic-signal': trafficSignalTemplate,
  'snow-ice': snowIceTemplate,
  'missed-collection': missedCollectionTemplate,
  'blocked-sidewalk': blockedSidewalkTemplate,
  'noise-residential': noiseResidentialTemplate,
  'rodent': rodentTemplate,
  'pothole': potholeTemplate,
  'graffiti': graffitiTemplate,
};

export function getTemplate(type: ComplaintType): ComplaintTemplate {
  return templates[type];
}

export function getAllTemplates(): ComplaintTemplate[] {
  return Object.values(templates);
}
