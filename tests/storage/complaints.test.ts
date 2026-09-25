import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb, cleanTestDb, teardownTestDb } from '../helpers/db-setup.js';
import {
  createComplaint,
  getComplaint,
  updateComplaint,
} from '../../src/storage/complaints.js';

describe('complaints storage', () => {
  before(() => setupTestDb());
  afterEach(() => cleanTestDb());
  after(() => teardownTestDb());

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
