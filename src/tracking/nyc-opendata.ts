/**
 * NYC 311 status tracking via NYC Open Data (Socrata dataset erm2-nwe9).
 *
 * NYC has no submission API and the portal's SR reference number (311-XXXXXXXX)
 * is a DIFFERENT identifier than this dataset's `unique_key`, so we can't look a
 * filing up by its SR number. Instead we match on what we do know: complaint
 * date window + location proximity. The dataset updates roughly daily, so a
 * just-filed request won't appear immediately.
 */

const DATASET_URL = 'https://data.cityofnewyork.us/resource/erm2-nwe9.json';

export interface TrackedSR {
  uniqueKey: string;
  createdDate: string;
  complaintType: string;
  descriptor?: string;
  agency?: string;
  status: string;
  resolutionDescription?: string;
  incidentAddress?: string;
  latitude?: number;
  longitude?: number;
  /** Distance from the queried location, when both have coordinates. */
  distanceMeters?: number;
}

interface SocrataRow {
  unique_key: string;
  created_date: string;
  complaint_type: string;
  descriptor?: string;
  agency?: string;
  status: string;
  resolution_description?: string;
  incident_address?: string;
  latitude?: string;
  longitude?: string;
}

export interface FindCandidatesOptions {
  latitude?: number;
  longitude?: number;
  /** Uppercase borough name as NYC stores it, e.g. 'MANHATTAN'. */
  borough?: string;
  /** Only consider requests created at or after this instant. */
  filedAfter: Date;
  /** Size of the created_date window, in days (default 3). */
  windowDays?: number;
  limit?: number;
}

function toFloatingTimestamp(d: Date): string {
  // Socrata floating timestamps have no timezone suffix.
  return d.toISOString().replace(/\.\d{3}Z$/, '');
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function rowToTrackedSR(row: SocrataRow): TrackedSR {
  return {
    uniqueKey: row.unique_key,
    createdDate: row.created_date,
    complaintType: row.complaint_type,
    descriptor: row.descriptor,
    agency: row.agency,
    status: row.status,
    resolutionDescription: row.resolution_description,
    incidentAddress: row.incident_address,
    latitude: row.latitude ? Number(row.latitude) : undefined,
    longitude: row.longitude ? Number(row.longitude) : undefined,
  };
}

const SELECT_FIELDS =
  'unique_key,created_date,complaint_type,descriptor,agency,status,' +
  'resolution_description,incident_address,latitude,longitude';

async function fetchRows(params: Record<string, string>): Promise<SocrataRow[]> {
  const url = new URL(DATASET_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`NYC Open Data error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SocrataRow[];
}

/**
 * Find service requests that plausibly match a filing, ranked by location
 * proximity (when coordinates are available) and recency. Callers should treat
 * the top result as a best guess, not a confirmed identity.
 */
export async function findCandidates(opts: FindCandidatesOptions): Promise<TrackedSR[]> {
  const windowDays = opts.windowDays ?? 3;
  const limit = opts.limit ?? 5;
  const start = opts.filedAfter;
  const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const whereParts = [
    `created_date between '${toFloatingTimestamp(start)}' and '${toFloatingTimestamp(end)}'`,
  ];
  if (opts.borough) whereParts.push(`borough='${opts.borough.toUpperCase()}'`);

  const rows = await fetchRows({
    $select: SELECT_FIELDS,
    $where: whereParts.join(' and '),
    $order: 'created_date ASC',
    $limit: '1000',
  });

  let candidates = rows.map(rowToTrackedSR);

  if (opts.latitude !== undefined && opts.longitude !== undefined) {
    const lat = opts.latitude;
    const lng = opts.longitude;
    for (const c of candidates) {
      if (c.latitude !== undefined && c.longitude !== undefined) {
        c.distanceMeters = haversineMeters(lat, lng, c.latitude, c.longitude);
      }
    }
    candidates = candidates
      .filter((c) => c.distanceMeters !== undefined)
      .sort((a, b) => (a.distanceMeters! - b.distanceMeters!));
  }

  return candidates.slice(0, limit);
}

/** Refresh a specific service request by its dataset unique_key. */
export async function getStatusByUniqueKey(uniqueKey: string): Promise<TrackedSR | null> {
  const rows = await fetchRows({
    $select: SELECT_FIELDS,
    $where: `unique_key='${uniqueKey}'`,
    $limit: '1',
  });
  return rows.length > 0 ? rowToTrackedSR(rows[0]) : null;
}
