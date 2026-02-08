/**
 * NYC Geographic Services
 *
 * This module provides NYC-specific geocoding and location services
 * for translating natural language descriptions into coordinates
 * and formatted addresses.
 */

export {
  geocodeNYCLocation,
  queryNYCGeoSearch,
  queryNYCIntersection,
  queryNYCAutocomplete,
  suggestNearbyAddresses,
  detectLocationType,
  extractCrossStreets,
  coordsToMapPixels,
  calculateMapClickPosition,
  estimateMapBoundsFromZoom,
  NYC_DEFAULT_BOUNDS,
  MANHATTAN_BOUNDS,
  type NYCLocation,
  type GeocoderResult,
  type MapBounds,
  type MapSize,
} from './nyc-geocoder.js';
