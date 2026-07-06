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
  CLASSIFY_UNCLEAR,
  INTENT_HISTORY,
  INTENT_CANCEL,
  EXTRACT_LOCATION_TYPE,
  FOLLOW_UP_LOCATION,
  MALFORMED_RESPONSE,
  MARKDOWN_WRAPPED,
} from '../helpers/mock-generate.js';

describe('parseJsonResponse', () => {
  it('parses valid JSON', () => {
    const result = parseJsonResponse<{ foo: string }>('{"foo": "bar"}');
    assert.deepEqual(result, { foo: 'bar' });
  });

  it('strips markdown code blocks', () => {
    const result = parseJsonResponse<{ foo: string }>('```json\n{"foo": "bar"}\n```');
    assert.deepEqual(result, { foo: 'bar' });
  });

  it('returns null for invalid JSON', () => {
    assert.equal(parseJsonResponse('not json at all'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(parseJsonResponse(''), null);
  });
});

describe('ConversationManager', () => {
  before(() => setupTestDb());
  afterEach(() => cleanTestDb());
  after(() => teardownTestDb());

  it('classifies a snow-ice complaint with all fields', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('There is ice on the sidewalk at 123 Main Street');
    // Should show confirmation since all required fields are present
    assert.ok(response.includes('Snow or Ice'), `Expected confirmation, got: ${response}`);
    assert.ok(response.includes('123 Main Street'));
    assert.ok(mgr.getState().awaitingConfirmation);
  });

  it('asks follow-up for partial classification', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE_PARTIAL, FOLLOW_UP_LOCATION]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('Snow at 456 Broadway');
    // Missing locationType, should ask follow-up
    assert.ok(!mgr.getState().awaitingConfirmation);
    assert.equal(mgr.getState().currentComplaint?.type, 'snow-ice');
  });

  it('handles clarification needed', async () => {
    const gen = mockGenerate([CLASSIFY_UNCLEAR]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('something is wrong');
    assert.ok(response.includes('Could you tell me more'));
  });

  it('handles history intent', async () => {
    const gen = mockGenerate([INTENT_HISTORY]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('show my complaints');
    assert.ok(response.includes("haven't started"));
  });

  it('handles cancel intent', async () => {
    const gen = mockGenerate([INTENT_CANCEL]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('forget it');
    assert.ok(response.includes('cancelled'));
  });

  it('handles malformed LLM response gracefully', async () => {
    const gen = mockGenerate([MALFORMED_RESPONSE]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('ice on sidewalk');
    assert.ok(response.includes("couldn't understand"));
  });

  it('handles markdown-wrapped JSON', async () => {
    const gen = mockGenerate([MARKDOWN_WRAPPED]);
    const mgr = new ConversationManager(undefined, false, gen);

    const response = await mgr.processMessage('snow at 123 Main Street');
    assert.ok(response.includes('Snow or Ice') || response.includes('123 Main Street'));
  });

  it('continues gathering fields after partial extraction', async () => {
    const gen = mockGenerate([
      CLASSIFY_SNOW_ICE_PARTIAL,    // classify: snow-ice, address only
      FOLLOW_UP_LOCATION,           // follow-up question
      EXTRACT_LOCATION_TYPE,        // extract locationType from user response
    ]);
    const mgr = new ConversationManager(undefined, false, gen);

    // First message: classify
    await mgr.processMessage('Snow at 456 Broadway');
    assert.equal(mgr.getState().currentComplaint?.type, 'snow-ice');

    // Second message: provide missing field
    const response = await mgr.processMessage('it is on the sidewalk');
    // Should now have all fields and show confirmation
    assert.ok(mgr.getState().awaitingConfirmation || response.includes('Sidewalk'));
  });

  it('cancel during gathering resets state', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE_PARTIAL, FOLLOW_UP_LOCATION]);
    const mgr = new ConversationManager(undefined, false, gen);

    await mgr.processMessage('Snow at 456 Broadway');
    const response = await mgr.processMessage('cancel');
    assert.ok(response.includes('cancelled'));
    assert.equal(mgr.getState().currentComplaint, null);
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

  it('edit during confirmation re-enters gathering', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    await mgr.processMessage('Ice at 123 Main Street');
    assert.ok(mgr.getState().awaitingConfirmation);

    const response = await mgr.processMessage('edit');
    assert.ok(response.includes('change'));
    assert.equal(mgr.getState().awaitingConfirmation, false);
  });

  it('cancel during confirmation resets state', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    await mgr.processMessage('Ice at 123 Main Street');
    const response = await mgr.processMessage('cancel');
    assert.ok(response.includes('cancelled'));
    assert.equal(mgr.getState().currentComplaint, null);
  });

  it('tracks conversation messages', async () => {
    const gen = mockGenerate([CLASSIFY_SNOW_ICE]);
    const mgr = new ConversationManager(undefined, false, gen);

    await mgr.processMessage('Snow at 123 Main Street');
    const state = mgr.getState();
    assert.ok(state.messages.length >= 2); // user + assistant
    assert.equal(state.messages[0].role, 'user');
    assert.equal(state.messages[0].content, 'Snow at 123 Main Street');
  });

  it('reset clears all state', () => {
    const gen = mockGenerate([]);
    const mgr = new ConversationManager(undefined, false, gen);
    // Manually set some state
    mgr.reset();
    const state = mgr.getState();
    assert.equal(state.currentComplaint, null);
    assert.deepEqual(state.gatheredFields, {});
    assert.equal(state.messages.length, 0);
    assert.equal(state.awaitingConfirmation, false);
  });
});
