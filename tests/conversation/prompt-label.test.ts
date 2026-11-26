import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promptLabel } from '../../src/conversation/prompt-label.js';
import type { ConversationState } from '../../src/complaints/types.js';

const base: ConversationState = {
  currentComplaint: null,
  gatheredFields: {},
  messages: [],
  awaitingConfirmation: false,
  awaitingSubmissionNumber: false,
  pendingComplaintId: null,
};

describe('promptLabel', () => {
  it('is a bare prompt when nothing is in progress', () => {
    assert.equal(promptLabel(base), '> ');
  });

  it('names the complaint type while gathering details', () => {
    assert.equal(promptLabel({ ...base, currentComplaint: { type: 'pothole' } }), 'Pothole> ');
  });

  it('lists the answers the confirmation step accepts', () => {
    const state = { ...base, currentComplaint: { type: 'pothole' as const }, awaitingConfirmation: true };
    assert.equal(promptLabel(state), 'yes / edit / cancel> ');
  });

  it('asks for the SR number after handoff, ahead of any other state', () => {
    const state = { ...base, currentComplaint: { type: 'pothole' as const }, awaitingSubmissionNumber: true, pendingComplaintId: 1 };
    assert.equal(promptLabel(state), 'SR number, or skip> ');
  });
});

describe('promptLabel with a real conversation', () => {
  it('follows the manager from idle into gathering and back after reset', async () => {
    process.env.GEO_OFFLINE = '1';
    const { setupTestDb, teardownTestDb } = await import('../helpers/db-setup.js');
    const { ConversationManager } = await import('../../src/conversation/manager.js');
    const { mockGenerate, CLASSIFY_SNOW_ICE_PARTIAL, FOLLOW_UP_LOCATION } = await import('../helpers/mock-generate.js');
    setupTestDb();
    try {
      const mgr = new ConversationManager(undefined, false, mockGenerate([CLASSIFY_SNOW_ICE_PARTIAL, FOLLOW_UP_LOCATION]));
      assert.equal(promptLabel(mgr.getState()), '> ');
      await mgr.processMessage('there is ice on the sidewalk');
      assert.equal(promptLabel(mgr.getState()), 'Snow or Ice on Sidewalk> ');
      mgr.reset();
      assert.equal(promptLabel(mgr.getState()), '> ');
    } finally {
      teardownTestDb();
    }
  });
});
