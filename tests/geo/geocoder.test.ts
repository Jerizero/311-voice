import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCrossStreets } from '../../src/geo/nyc-geocoder.js';

describe('extractCrossStreets', () => {
  it('extracts X and Y pattern', () => {
    const result = extractCrossStreets('135th and Broadway');
    assert.ok(result);
    assert.equal(result.street1, '135th');
    assert.equal(result.street2, 'Broadway');
  });

  it('extracts corner of X and Y', () => {
    const result = extractCrossStreets('corner of 5th Avenue and 42nd Street');
    assert.ok(result);
    assert.equal(result.street1, '5th Avenue');
    assert.equal(result.street2, '42nd Street');
  });

  it('extracts X & Y pattern', () => {
    const result = extractCrossStreets('Broadway & 7th Ave');
    assert.ok(result);
    assert.equal(result.street1, 'Broadway');
    assert.equal(result.street2, '7th Ave');
  });

  it('returns null for non-intersection', () => {
    assert.equal(extractCrossStreets('123 Main Street'), null);
  });
});
