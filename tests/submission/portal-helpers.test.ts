import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNonTraditionalAddress } from '../../src/submission/portal-helpers.js';

describe('isNonTraditionalAddress', () => {
  it('detects intersection with "and"', () => {
    assert.equal(isNonTraditionalAddress('135th and Broadway'), true);
    assert.equal(isNonTraditionalAddress('5th Avenue and 42nd Street'), true);
  });

  it('detects bridge', () => {
    assert.equal(isNonTraditionalAddress('Brooklyn Bridge'), true);
    assert.equal(isNonTraditionalAddress('near the bridge entrance'), true);
  });

  it('detects park', () => {
    assert.equal(isNonTraditionalAddress('Central Park'), true);
  });

  it('detects plaza/square/circle', () => {
    assert.equal(isNonTraditionalAddress('Times Square'), true);
    assert.equal(isNonTraditionalAddress('Herald Plaza'), true);
    assert.equal(isNonTraditionalAddress('Columbus Circle'), true);
  });

  it('detects corner of pattern', () => {
    assert.equal(isNonTraditionalAddress('corner of 5th and Main'), true);
  });

  it('returns false for standard address', () => {
    assert.equal(isNonTraditionalAddress('123 Main Street'), false);
    assert.equal(isNonTraditionalAddress('456 Broadway'), false);
  });
});
