import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, cleanTestDb, teardownTestDb } from '../helpers/db-setup.js';
import {
  createComplaint,
  getComplaint,
  updateComplaint,
  listComplaints,
  deleteComplaint,
} from '../../src/storage/complaints.js';

describe('complaints storage', () => {
  before(() => setupTestDb());
  afterEach(() => cleanTestDb());
  after(() => teardownTestDb());

  it('creates and retrieves a complaint', () => {
    const c = createComplaint('snow-ice', { address: '123 Main St', locationType: 'Sidewalk' });
    assert.ok(c.id);
    assert.equal(c.type, 'snow-ice');
    assert.equal(c.status, 'draft');
    assert.equal(c.fields.address, '123 Main St');
    assert.equal(c.fields.locationType, 'Sidewalk');
    assert.ok(c.createdAt instanceof Date);
    assert.equal(c.submittedAt, null);

    const fetched = getComplaint(c.id!);
    assert.ok(fetched);
    assert.equal(fetched.type, 'snow-ice');
    assert.deepEqual(fetched.fields, { address: '123 Main St', locationType: 'Sidewalk' });
  });

  it('returns null for missing complaint', () => {
    const fetched = getComplaint(9999);
    assert.equal(fetched, null);
  });

  it('updates complaint status and confirmation', () => {
    const c = createComplaint('illegal-parking', { location: '5th Ave', violationType: 'Double parked' });
    const updated = updateComplaint(c.id!, {
      status: 'confirmed',
      confirmationNumber: 'C1-1-1234567890',
      submittedAt: new Date('2026-02-08'),
    });
    assert.ok(updated);
    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.confirmationNumber, 'C1-1-1234567890');
    assert.ok(updated.submittedAt);
  });

  it('updates complaint fields', () => {
    const c = createComplaint('snow-ice', { address: 'Old St' });
    const updated = updateComplaint(c.id!, {
      fields: { address: 'New St', locationType: 'Bus stop' },
    });
    assert.ok(updated);
    assert.equal(updated.fields.address, 'New St');
    assert.equal(updated.fields.locationType, 'Bus stop');
  });

  it('noop update returns current complaint', () => {
    const c = createComplaint('snow-ice', { address: 'X' });
    const same = updateComplaint(c.id!, {});
    assert.ok(same);
    assert.equal(same.fields.address, 'X');
  });

  it('lists complaints with filters', () => {
    createComplaint('snow-ice', { address: 'A' });
    createComplaint('snow-ice', { address: 'B' });
    createComplaint('illegal-parking', { location: 'C' });

    const all = listComplaints();
    assert.equal(all.length, 3);

    const snowOnly = listComplaints({ type: 'snow-ice' });
    assert.equal(snowOnly.length, 2);

    const limited = listComplaints({ limit: 1 });
    assert.equal(limited.length, 1);
  });

  it('lists complaints ordered by created_at DESC', () => {
    const c1 = createComplaint('snow-ice', { address: 'First' });
    const c2 = createComplaint('snow-ice', { address: 'Second' });
    const list = listComplaints();
    assert.equal(list.length, 2);
    // Most recent first
    assert.equal(list[0].fields.address, 'Second');
    assert.equal(list[1].fields.address, 'First');
  });

  it('filters by status', () => {
    const c = createComplaint('snow-ice', { address: 'A' });
    updateComplaint(c.id!, { status: 'submitted' });
    createComplaint('snow-ice', { address: 'B' }); // still draft

    const submitted = listComplaints({ status: 'submitted' });
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].fields.address, 'A');
  });

  it('deletes a complaint', () => {
    const c = createComplaint('snow-ice', { address: 'Delete me' });
    const deleted = deleteComplaint(c.id!);
    assert.equal(deleted, true);
    assert.equal(getComplaint(c.id!), null);
  });

  it('delete returns false for missing ID', () => {
    assert.equal(deleteComplaint(9999), false);
  });

  it('round-trips JSON fields correctly', () => {
    const fields = {
      address: '123 "Quoted" St',
      locationType: 'Sidewalk',
      hasIssue: true,
      notes: null,
    };
    const c = createComplaint('snow-ice', fields);
    const fetched = getComplaint(c.id!);
    assert.ok(fetched);
    assert.equal(fetched.fields.address, '123 "Quoted" St');
    assert.equal(fetched.fields.hasIssue, true);
    assert.equal(fetched.fields.notes, null);
  });
});
