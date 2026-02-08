import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLocationType,
  extractCrossStreets,
  coordsToMapPixels,
  calculateMapClickPosition,
  suggestNearbyAddresses,
  type NYCLocation,
} from '../../src/geo/nyc-geocoder.js';

describe('detectLocationType', () => {
  it('detects bridge', () => {
    assert.equal(detectLocationType('Brooklyn Bridge pedestrian path'), 'bridge');
  });

  it('detects park', () => {
    assert.equal(detectLocationType('Central Park north entrance'), 'park');
  });

  it('detects intersection', () => {
    assert.equal(detectLocationType('135th and Broadway'), 'intersection');
    assert.equal(detectLocationType('corner of 5th and Main'), 'intersection');
  });

  it('detects landmark', () => {
    assert.equal(detectLocationType('Times Square'), 'landmark');
    assert.equal(detectLocationType('Penn Station entrance'), 'landmark');
    assert.equal(detectLocationType('Columbus Circle'), 'landmark');
  });

  it('detects street address', () => {
    assert.equal(detectLocationType('123 Main Street'), 'street_address');
    assert.equal(detectLocationType('456 Broadway Ave'), 'street_address');
    assert.equal(detectLocationType('789 Oak Blvd'), 'street_address');
  });

  it('returns unknown for ambiguous input', () => {
    assert.equal(detectLocationType('near the big building'), 'unknown');
  });
});

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

describe('coordsToMapPixels', () => {
  it('converts center coordinates to center pixels', () => {
    const bounds = { north: 40.80, south: 40.70, east: -73.90, west: -74.00 };
    const size = { width: 500, height: 400 };
    // Center of bounds: lat 40.75, lng -73.95
    const result = coordsToMapPixels(40.75, -73.95, bounds, size);
    // Should be roughly center
    assert.ok(Math.abs(result.x - 250) < 5, `x=${result.x} not near center 250`);
    assert.ok(Math.abs(result.y - 200) < 5, `y=${result.y} not near center 200`);
  });

  it('clamps to bounds', () => {
    const bounds = { north: 40.80, south: 40.70, east: -73.90, west: -74.00 };
    const size = { width: 500, height: 400 };
    // Way outside bounds
    const result = coordsToMapPixels(41.0, -73.80, bounds, size);
    assert.ok(result.x >= 0 && result.x <= 500);
    assert.ok(result.y >= 0 && result.y <= 400);
  });
});

describe('calculateMapClickPosition', () => {
  it('returns position for target at map center', () => {
    const result = calculateMapClickPosition(
      40.75, -73.95, 40.75, -73.95,
      { width: 500, height: 400 }, 14
    );
    assert.ok(result);
    assert.ok(Math.abs(result.x - 250) < 5);
    assert.ok(Math.abs(result.y - 200) < 5);
    assert.ok(result.confidence > 0.8);
  });

  it('returns null for target outside visible bounds', () => {
    const result = calculateMapClickPosition(
      41.5, -73.95, 40.75, -73.95,
      { width: 500, height: 400 }, 16  // High zoom = small area
    );
    assert.equal(result, null);
  });

  it('uses target as center when map center is null', () => {
    const result = calculateMapClickPosition(
      40.75, -73.95, null, null,
      { width: 500, height: 400 }, 14
    );
    assert.ok(result);
    // Should be at center since map center defaults to target
    assert.ok(Math.abs(result.x - 250) < 5);
    assert.ok(Math.abs(result.y - 200) < 5);
  });
});

describe('suggestNearbyAddresses', () => {
  it('suggests addresses for intersection with cross streets', () => {
    const location: NYCLocation = {
      originalInput: '135th and Broadway',
      isStandardAddress: false,
      locationType: 'intersection',
      confidence: 0.5,
      crossStreets: { street1: '135th', street2: 'Broadway' },
    };
    const suggestions = suggestNearbyAddresses(location);
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some(s => s.includes('Broadway')));
    assert.ok(suggestions.some(s => s.includes('135')));
  });

  it('includes nearby address when present', () => {
    const location: NYCLocation = {
      originalInput: 'near Central Park',
      isStandardAddress: false,
      locationType: 'park',
      confidence: 0.5,
      nearbyAddress: '1 Central Park W, New York, NY',
    };
    const suggestions = suggestNearbyAddresses(location);
    assert.ok(suggestions.includes('1 Central Park W, New York, NY'));
  });

  it('returns empty for location without cross streets or nearby', () => {
    const location: NYCLocation = {
      originalInput: 'somewhere',
      isStandardAddress: false,
      locationType: 'unknown',
      confidence: 0.2,
    };
    const suggestions = suggestNearbyAddresses(location);
    assert.equal(suggestions.length, 0);
  });
});
