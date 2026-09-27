import { describe, it, before, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';

// Keep the assisted-submission geocode step offline and deterministic.
process.env.GEO_OFFLINE = '1';

import { setupTestDb, cleanTestDb, teardownTestDb } from '../helpers/db-setup.js';
import { ConversationManager, parseJsonResponse } from '../../src/conversation/manager.js';
import { listComplaints } from '../../src/storage/complaints.js';
import {
  mockGenerate,
  CLASSIFY_SNOW_ICE,
  CLASSIFY_SNOW_ICE_PARTIAL,
  EXTRACT_LOCATION_TYPE,
  FOLLOW_UP_LOCATION,
  MALFORMED_RESPONSE,
} from '../helpers/mock-generate.js';

describe('parseJsonResponse', () => {
  it('strips markdown code blocks', () => {
    const result = parseJsonResponse<{ foo: string }>('```json\n{"foo": "bar"}\n```');
    assert.deepEqual(result, { foo: 'bar' });
  });
});

describe('ConversationManager', () => {
  before(() => setupTestDb());
  afterEach(() => cleanTestDb());
  after(() => teardownTestDb());

  it('handles malformed LLM response gracefully', async () => {
    const gen = mockGenerate([MALFORMED_RESPONSE]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('ice on sidewalk');
    assert.ok(response.includes("couldn't understand"));
  });

  it('continues gathering fields after partial extraction', async () => {
    const gen = mockGenerate([
      CLASSIFY_SNOW_ICE_PARTIAL,    // classify: snow-ice, address only
      FOLLOW_UP_LOCATION,           // follow-up question
      EXTRACT_LOCATION_TYPE,        // extract locationType from user response
    ]);
    const mgr = new ConversationManager(undefined, false, gen);

    // First message: classify. A missing required field must be asked for, not confirmed.
    await mgr.processMessage('Snow at 456 Broadway');
    assert.equal(mgr.getState().currentComplaint?.type, 'snow-ice');
    assert.ok(!mgr.getState().awaitingConfirmation);

    // Second message: provide missing field
    await mgr.processMessage('it is on the sidewalk');
    // Should now have all fields and show confirmation
    assert.ok(mgr.getState().awaitingConfirmation);
  });

  it('submit hands off and awaits an SR number', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    // Classify and confirm
    await mgr.processMessage('Ice on sidewalk at 123 Main Street');
    assert.ok(mgr.getState().awaitingConfirmation);

    const response = await mgr.processMessage('submit');
    // Assisted flow: prepares the filing and waits for the SR number.
    assert.ok(response.toLowerCase().includes('ready to file'), `got: ${response}`);
    assert.ok(mgr.getState().awaitingSubmissionNumber);
    assert.ok(mgr.getState().pendingComplaintId !== null);
  });

  it('captures a pasted SR number and marks it filed', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    await mgr.processMessage('Ice on sidewalk at 123 Main Street');
    await mgr.processMessage('submit');
    assert.ok(mgr.getState().awaitingSubmissionNumber);

    const response = await mgr.processMessage('311-27497400');
    assert.ok(response.includes('311-27497400'), `got: ${response}`);
    assert.equal(mgr.getState().awaitingSubmissionNumber, false);
    assert.equal(mgr.getState().currentComplaint, null);

    const filed = listComplaints({ status: 'submitted' });
    assert.equal(filed.length, 1);
    assert.equal(filed[0].confirmationNumber, '311-27497400');
  });

  it('skip after handoff keeps the complaint as a draft', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    await mgr.processMessage('Ice on sidewalk at 123 Main Street');
    await mgr.processMessage('submit');

    const response = await mgr.processMessage('skip');
    assert.ok(response.toLowerCase().includes('draft'));
    assert.equal(mgr.getState().awaitingSubmissionNumber, false);

    const drafts = listComplaints({ status: 'draft' });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].confirmationNumber, null);
  });

});
