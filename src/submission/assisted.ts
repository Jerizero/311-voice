import { spawn } from 'child_process';
import type { ComplaintType } from '../complaints/types.js';
import { getTemplate } from '../complaints/templates/index.js';
import { geocodeNYCLocation } from '../geo/nyc-geocoder.js';
import { isNonTraditionalAddress } from './portal-helpers.js';
import { PORTAL_URLS } from './selectors.js';
import { logger } from '../utils/logger.js';

const DEFAULT_PORTAL = 'https://portal.311.nyc.gov';

/** Field names, across templates, that hold the incident location. */
const LOCATION_FIELD_KEYS = ['address', 'location', 'intersection', 'crossStreets'];

/** Geocoder location types that the portal can't pin from a text search alone. */
const MANUAL_PIN_TYPES = ['intersection', 'bridge', 'landmark', 'park'];

export interface HandoffField {
  label: string;
  value: string;
}

/**
 * Everything the user needs to finish filing in their own browser.
 * NYC has no submission API and forces a manual map-pin for most locations,
 * so we prepare and hand off rather than pretend to auto-submit.
 */
export interface HandoffPacket {
  type: ComplaintType;
  displayName: string;
  portalUrl: string;
  /** What to type into the portal's address search box (null if no location given). */
  locationInput: string | null;
  /** Intersection/bridge/landmark: the portal needs a manual map click. */
  needsManualPin: boolean;
  latitude?: number;
  longitude?: number;
  borough?: string;
  formattedAddress?: string;
  geocodeConfidence: number;
  /** Copy-paste-ready description for the portal's details box. */
  description: string;
  fields: HandoffField[];
}

function getLocationValue(fields: Record<string, string | boolean | null>): string | null {
  for (const key of LOCATION_FIELD_KEYS) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function buildDescription(
  displayName: string,
  template: ReturnType<typeof getTemplate>,
  fields: Record<string, string | boolean | null>,
  ctx: { locationInput: string | null; formattedAddress?: string }
): string {
  const loc = ctx.formattedAddress || ctx.locationInput;
  let desc = loc ? `${displayName} at ${loc}.` : `${displayName}.`;

  // Append any detail fields that aren't the location itself.
  const detailParts: string[] = [];
  for (const f of [...template.requiredFields, ...template.optionalFields]) {
    if (LOCATION_FIELD_KEYS.includes(f.name)) continue;
    const v = fields[f.name];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      detailParts.push(`${f.label}: ${v}`);
    }
  }
  if (detailParts.length > 0) desc += ' ' + detailParts.join('. ') + '.';

  if (ctx.locationInput) {
    const lower = ctx.locationInput.toLowerCase();
    if (lower.includes('bridge')) {
      desc += ' Note: this is a pedestrian bridge/walkway requiring city maintenance.';
    } else if (isNonTraditionalAddress(ctx.locationInput)) {
      desc += ' Note: this is an intersection/non-standard location.';
    }
  }
  return desc;
}

/**
 * Geocode the location and assemble a handoff packet. No browser and no request
 * to NYC's portal, so it stays cheap and reliable. Geocoding failure degrades
 * gracefully to text-only guidance.
 */
export async function prepareHandoff(
  type: ComplaintType,
  fields: Record<string, string | boolean | null>
): Promise<HandoffPacket> {
  const template = getTemplate(type);
  const portalUrl = PORTAL_URLS[type] || DEFAULT_PORTAL;
  const locationInput = getLocationValue(fields);

  let latitude: number | undefined;
  let longitude: number | undefined;
  let borough: string | undefined;
  let formattedAddress: string | undefined;
  let geocodeConfidence = 0;
  let needsManualPin = false;

  if (locationInput) {
    needsManualPin = isNonTraditionalAddress(locationInput);
    try {
      const geo = await geocodeNYCLocation(locationInput);
      if (geo.success && geo.location) {
        latitude = geo.location.latitude;
        longitude = geo.location.longitude;
        borough = geo.location.borough;
        formattedAddress = geo.location.formattedAddress;
        geocodeConfidence = geo.location.confidence;
        if (MANUAL_PIN_TYPES.includes(geo.location.locationType)) needsManualPin = true;
      }
    } catch (error) {
      logger.debug('  → Geocoding failed, continuing without coordinates:', error);
    }
  }

  const fieldSummary: HandoffField[] = [];
  for (const f of [...template.requiredFields, ...template.optionalFields]) {
    const v = fields[f.name];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      fieldSummary.push({ label: f.label, value: String(v) });
    }
  }

  const description = buildDescription(template.displayName, template, fields, {
    locationInput,
    formattedAddress,
  });

  return {
    type,
    displayName: template.displayName,
    portalUrl,
    locationInput,
    needsManualPin,
    latitude,
    longitude,
    borough,
    formattedAddress,
    geocodeConfidence,
    description,
    fields: fieldSummary,
  };
}

/** Open a URL in the user's default browser (their real session, not automation). */
export function openInBrowser(url: string): boolean {
  try {
    let cmd: string;
    let args: string[];
    if (process.platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (process.platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '', url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (error) {
    logger.debug('  → Could not open browser:', error);
    return false;
  }
}

/** Render a handoff packet as the message shown to the user in the CLI. */
export function formatHandoff(packet: HandoffPacket, browserOpened: boolean): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Everything's ready to file your ${packet.displayName} complaint.`);
  lines.push('');
  lines.push(
    browserOpened
      ? '1. I opened the NYC 311 form in your browser.'
      : `1. Open the NYC 311 form: ${packet.portalUrl}`
  );

  // Location step
  if (packet.locationInput) {
    const where = packet.formattedAddress || packet.locationInput;
    if (packet.needsManualPin) {
      lines.push(
        `2. In the address box, search "${where}", then drop/confirm the map pin ` +
          `(this location needs a manual pin).`
      );
      if (packet.latitude && packet.longitude) {
        lines.push(`   Pin coordinates: ${packet.latitude}, ${packet.longitude}`);
      }
    } else {
      lines.push(`2. In the address box, enter "${where}" and pick the matching result.`);
    }
  } else {
    lines.push('2. Enter the location on the form.');
  }

  lines.push('3. Paste this into the description box:');
  lines.push(`   "${packet.description}"`);
  lines.push('4. Review and Submit.');
  lines.push('');
  lines.push('When you get the SR number (looks like 311-XXXXXXXX), paste it here so I can');
  lines.push('track it. Or type "skip" if you\'re not filing right now.');
  return lines.join('\n');
}
