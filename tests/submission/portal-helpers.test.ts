import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNonTraditionalAddress,
  extractNearbyAddress,
} from '../../src/submission/portal-helpers.js';

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

describe('extractNearbyAddress', () => {
  it('extracts alternatives for intersection', () => {
    const alts = extractNearbyAddress('135th and Riverside Drive');
    assert.ok(alts.length > 0);
    assert.ok(alts.some(a => a.includes('Riverside Drive')));
    assert.ok(alts.some(a => a.includes('New York, NY')));
  });

  it('extracts alternatives for bridge with street number', () => {
    const alts = extractNearbyAddress('135th Street Bridge');
    assert.ok(alts.some(a => a.includes('135')));
  });

  it('always includes original with NYC suffix', () => {
    const alts = extractNearbyAddress('some random place');
    assert.ok(alts.includes('some random place, New York, NY'));
  });

  it('handles ordinal numbers', () => {
    const alts = extractNearbyAddress('42nd and 5th Avenue');
    assert.ok(alts.some(a => a.includes('5th Avenue')));
    assert.ok(alts.some(a => a.includes('42')));
  });
});
