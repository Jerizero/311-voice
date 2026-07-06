import { getDb } from './db.js';
import type { ComplaintData, ComplaintType, ComplaintStatus } from '../complaints/types.js';

interface DbComplaint {
  id: number;
  type: string;
  status: string;
  fields: string;
  confirmation_number: string | null;
  created_at: string;
  submitted_at: string | null;
  latitude: number | null;
  longitude: number | null;
  borough: string | null;
  nyc_unique_key: string | null;
  nyc_status: string | null;
  nyc_checked_at: string | null;
}

function toComplaintData(row: DbComplaint): ComplaintData {
  return {
    id: row.id,
    type: row.type as ComplaintType,
    status: row.status as ComplaintStatus,
    fields: JSON.parse(row.fields),
    confirmationNumber: row.confirmation_number,
    createdAt: new Date(row.created_at),
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
    latitude: row.latitude,
    longitude: row.longitude,
    borough: row.borough,
    nycUniqueKey: row.nyc_unique_key,
    nycStatus: row.nyc_status,
    nycCheckedAt: row.nyc_checked_at ? new Date(row.nyc_checked_at) : null,
  };
}

export function createComplaint(
  type: ComplaintType,
  fields: Record<string, string | boolean | null>
): ComplaintData {
  const stmt = getDb().prepare(`
    INSERT INTO complaints (type, status, fields)
    VALUES (?, 'draft', ?)
  `);
  const result = stmt.run(type, JSON.stringify(fields));

  return getComplaint(result.lastInsertRowid as number)!;
}

export function getComplaint(id: number): ComplaintData | null {
  const stmt = getDb().prepare('SELECT * FROM complaints WHERE id = ?');
  const row = stmt.get(id) as DbComplaint | undefined;
  return row ? toComplaintData(row) : null;
}

export function updateComplaint(
  id: number,
  updates: Partial<{
    status: ComplaintStatus;
    fields: Record<string, string | boolean | null>;
    confirmationNumber: string;
    submittedAt: Date;
    latitude: number;
    longitude: number;
    borough: string;
    nycUniqueKey: string;
    nycStatus: string;
    nycCheckedAt: Date;
  }>
): ComplaintData | null {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.fields !== undefined) {
    sets.push('fields = ?');
    values.push(JSON.stringify(updates.fields));
  }
  if (updates.confirmationNumber !== undefined) {
    sets.push('confirmation_number = ?');
    values.push(updates.confirmationNumber);
  }
  if (updates.submittedAt !== undefined) {
    sets.push('submitted_at = ?');
    values.push(updates.submittedAt.toISOString());
  }
  if (updates.latitude !== undefined) {
    sets.push('latitude = ?');
    values.push(updates.latitude);
  }
  if (updates.longitude !== undefined) {
    sets.push('longitude = ?');
    values.push(updates.longitude);
  }
  if (updates.borough !== undefined) {
    sets.push('borough = ?');
    values.push(updates.borough);
  }
  if (updates.nycUniqueKey !== undefined) {
    sets.push('nyc_unique_key = ?');
    values.push(updates.nycUniqueKey);
  }
  if (updates.nycStatus !== undefined) {
    sets.push('nyc_status = ?');
    values.push(updates.nycStatus);
  }
  if (updates.nycCheckedAt !== undefined) {
    sets.push('nyc_checked_at = ?');
    values.push(updates.nycCheckedAt.toISOString());
  }

  if (sets.length === 0) return getComplaint(id);

  values.push(id);
  const stmt = getDb().prepare(`UPDATE complaints SET ${sets.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return getComplaint(id);
}

export function listComplaints(filters?: {
  type?: ComplaintType;
  status?: ComplaintStatus;
  limit?: number;
}): ComplaintData[] {
  let query = 'SELECT * FROM complaints WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters?.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY created_at DESC, id DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = getDb().prepare(query);
  const rows = stmt.all(...params) as DbComplaint[];
  return rows.map(toComplaintData);
}

export function deleteComplaint(id: number): boolean {
  const stmt = getDb().prepare('DELETE FROM complaints WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}
