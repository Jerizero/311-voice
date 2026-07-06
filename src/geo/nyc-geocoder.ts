/**
 * NYC Geocoder Skill Interface
 *
 * This module provides geocoding services specifically for NYC locations,
 * translating natural language descriptions into coordinates and formatted
 * addresses that NYC 311's system can accept.
 *
 * IMPLEMENTATION STATUS: Stub - needs geocoding service integration
 *
 * Future implementation options:
 * 1. Google Maps Geocoding API
 * 2. NYC Open Data / GeoSearch API (https://geosearch.planninglabs.nyc/)
 * 3. OpenStreetMap Nominatim
 * 4. Mapbox Geocoding API
 */

export interface NYCLocation {
  /** Original natural language input */
  originalInput: string;

  /** Formatted address that NYC 311 might accept */
  formattedAddress?: string;

  /** Latitude coordinate */
  latitude?: number;

  /** Longitude coordinate */
  longitude?: number;

  /** NYC borough */
  borough?: 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';

  /** Whether this is a standard street address */
  isStandardAddress: boolean;

  /** Type of location */
  locationType: 'street_address' | 'intersection' | 'bridge' | 'park' | 'landmark' | 'unknown';

  /** Confidence score 0-1 */
  confidence: number;

  /** Cross streets if applicable */
  crossStreets?: {
    street1: string;
    street2: string;
  };

  /** Nearby standard address that could be used as a fallback */
  nearbyAddress?: string;

  /** Additional context about the location */
  context?: string;
}

export interface GeocoderResult {
  success: boolean;
  location?: NYCLocation;
  alternatives?: NYCLocation[];
  error?: string;
}

/**
 * Detects the type of location from natural language input
 */
export function detectLocationType(input: string): NYCLocation['locationType'] {
  const normalized = input.toLowerCase();

  if (/bridge/i.test(normalized)) return 'bridge';
  if (/park\b/i.test(normalized)) return 'park';
  if (/\band\b|\bintersection\b|corner of/i.test(normalized)) return 'intersection';
  if (/plaza|square|circle|monument|statue|terminal|station/i.test(normalized)) return 'landmark';
  if (/^\d+\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd)/i.test(normalized)) return 'street_address';

  return 'unknown';
}

/**
 * Extracts cross streets from intersection descriptions
 */
export function extractCrossStreets(input: string): { street1: string; street2: string } | null {
  // Pattern: "X and Y" or "X & Y" or "corner of X and Y"
  const patterns = [
    /(?:corner of\s+)?(.+?)\s+(?:and|&)\s+(.+?)(?:,|$)/i,
    /(?:at\s+)?(.+?)\s+(?:at|@)\s+(.+?)(?:,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return {
        street1: match[1].trim(),
        street2: match[2].trim(),
      };
    }
  }

  return null;
}

/**
 * Known NYC landmarks and their approximate coordinates
 * Organized by category for easier maintenance
 */
const NYC_LANDMARKS: Record<string, { lat: number; lng: number; address: string; borough: NYCLocation['borough'] }> = {
  // === BRIDGES (Pedestrian & Vehicle) ===
  'aqueduct pedestrian bridge': {
    lat: 40.8225,
    lng: -73.9580,
    address: '135th Street and Riverside Drive',
    borough: 'Manhattan',
  },
  'high bridge': {
    lat: 40.8420,
    lng: -73.9295,
    address: 'High Bridge, Washington Heights',
    borough: 'Manhattan',
  },
  'brooklyn bridge': {
    lat: 40.7061,
    lng: -73.9969,
    address: 'Brooklyn Bridge',
    borough: 'Manhattan',
  },
  'manhattan bridge': {
    lat: 40.7075,
    lng: -73.9903,
    address: 'Manhattan Bridge',
    borough: 'Manhattan',
  },
  'williamsburg bridge': {
    lat: 40.7134,
    lng: -73.9724,
    address: 'Williamsburg Bridge',
    borough: 'Manhattan',
  },
  'queensboro bridge': {
    lat: 40.7570,
    lng: -73.9545,
    address: '59th Street Bridge',
    borough: 'Manhattan',
  },
  '59th street bridge': {
    lat: 40.7570,
    lng: -73.9545,
    address: '59th Street Bridge',
    borough: 'Manhattan',
  },
  'george washington bridge': {
    lat: 40.8517,
    lng: -73.9527,
    address: '178th Street and Fort Washington Avenue',
    borough: 'Manhattan',
  },
  'triborough bridge': {
    lat: 40.7805,
    lng: -73.9219,
    address: 'Triborough Bridge',
    borough: 'Manhattan',
  },
  'rfk bridge': {
    lat: 40.7805,
    lng: -73.9219,
    address: 'RFK Bridge (Triborough)',
    borough: 'Manhattan',
  },

  // === PARKS & GREEN SPACES ===
  'central park': {
    lat: 40.7829,
    lng: -73.9654,
    address: 'Central Park',
    borough: 'Manhattan',
  },
  'riverside park': {
    lat: 40.8010,
    lng: -73.9712,
    address: 'Riverside Park',
    borough: 'Manhattan',
  },
  'prospect park': {
    lat: 40.6602,
    lng: -73.9690,
    address: 'Prospect Park',
    borough: 'Brooklyn',
  },
  'flushing meadows': {
    lat: 40.7400,
    lng: -73.8408,
    address: 'Flushing Meadows Corona Park',
    borough: 'Queens',
  },
  'battery park': {
    lat: 40.7033,
    lng: -74.0170,
    address: 'Battery Park',
    borough: 'Manhattan',
  },
  'washington square park': {
    lat: 40.7308,
    lng: -73.9973,
    address: 'Washington Square Park',
    borough: 'Manhattan',
  },
  'tompkins square park': {
    lat: 40.7265,
    lng: -73.9817,
    address: 'Tompkins Square Park',
    borough: 'Manhattan',
  },
  'union square': {
    lat: 40.7359,
    lng: -73.9911,
    address: 'Union Square',
    borough: 'Manhattan',
  },
  'madison square park': {
    lat: 40.7420,
    lng: -73.9876,
    address: 'Madison Square Park',
    borough: 'Manhattan',
  },
  'bryant park': {
    lat: 40.7536,
    lng: -73.9832,
    address: 'Bryant Park',
    borough: 'Manhattan',
  },
  'high line': {
    lat: 40.7480,
    lng: -74.0048,
    address: 'Gansevoort Street and Washington Street',
    borough: 'Manhattan',
  },
  'hudson river park': {
    lat: 40.7340,
    lng: -74.0110,
    address: 'Hudson River Park',
    borough: 'Manhattan',
  },
  'east river park': {
    lat: 40.7145,
    lng: -73.9750,
    address: 'East River Park',
    borough: 'Manhattan',
  },
  'carl schurz park': {
    lat: 40.7760,
    lng: -73.9430,
    address: 'Carl Schurz Park',
    borough: 'Manhattan',
  },
  'fort tryon park': {
    lat: 40.8625,
    lng: -73.9318,
    address: 'Fort Tryon Park',
    borough: 'Manhattan',
  },
  'inwood hill park': {
    lat: 40.8720,
    lng: -73.9250,
    address: 'Inwood Hill Park',
    borough: 'Manhattan',
  },
  'van cortlandt park': {
    lat: 40.8970,
    lng: -73.8865,
    address: 'Van Cortlandt Park',
    borough: 'Bronx',
  },
  'pelham bay park': {
    lat: 40.8677,
    lng: -73.8053,
    address: 'Pelham Bay Park',
    borough: 'Bronx',
  },
  'coney island': {
    lat: 40.5749,
    lng: -73.9857,
    address: 'Coney Island',
    borough: 'Brooklyn',
  },
  'astoria park': {
    lat: 40.7785,
    lng: -73.9230,
    address: 'Astoria Park',
    borough: 'Queens',
  },

  // === PLAZAS & SQUARES ===
  'times square': {
    lat: 40.7580,
    lng: -73.9855,
    address: '42nd Street and Broadway',
    borough: 'Manhattan',
  },
  'herald square': {
    lat: 40.7484,
    lng: -73.9878,
    address: '34th Street and Broadway',
    borough: 'Manhattan',
  },
  'columbus circle': {
    lat: 40.7681,
    lng: -73.9819,
    address: 'Columbus Circle',
    borough: 'Manhattan',
  },
  'lincoln center': {
    lat: 40.7725,
    lng: -73.9835,
    address: 'Lincoln Center Plaza',
    borough: 'Manhattan',
  },
  'grand army plaza': {
    lat: 40.6740,
    lng: -73.9708,
    address: 'Grand Army Plaza',
    borough: 'Brooklyn',
  },
  'fulton plaza': {
    lat: 40.7092,
    lng: -74.0080,
    address: 'Fulton Street',
    borough: 'Manhattan',
  },
  'foley square': {
    lat: 40.7142,
    lng: -74.0018,
    address: 'Foley Square',
    borough: 'Manhattan',
  },

  // === TRANSIT HUBS ===
  'penn station': {
    lat: 40.7506,
    lng: -73.9935,
    address: '33rd Street and 7th Avenue',
    borough: 'Manhattan',
  },
  'grand central': {
    lat: 40.7527,
    lng: -73.9772,
    address: '42nd Street and Park Avenue',
    borough: 'Manhattan',
  },
  'port authority': {
    lat: 40.7569,
    lng: -73.9903,
    address: '42nd Street and 8th Avenue',
    borough: 'Manhattan',
  },
  'atlantic terminal': {
    lat: 40.6844,
    lng: -73.9788,
    address: 'Atlantic Avenue and Flatbush Avenue',
    borough: 'Brooklyn',
  },
  'fulton center': {
    lat: 40.7102,
    lng: -74.0072,
    address: 'Fulton Street',
    borough: 'Manhattan',
  },

  // === FAMOUS BUILDINGS & LANDMARKS ===
  'empire state building': {
    lat: 40.7484,
    lng: -73.9857,
    address: '350 5th Avenue',
    borough: 'Manhattan',
  },
  'rockefeller center': {
    lat: 40.7587,
    lng: -73.9787,
    address: '45 Rockefeller Plaza',
    borough: 'Manhattan',
  },
  'world trade center': {
    lat: 40.7127,
    lng: -74.0134,
    address: 'World Trade Center',
    borough: 'Manhattan',
  },
  'one world trade': {
    lat: 40.7127,
    lng: -74.0134,
    address: 'One World Trade Center',
    borough: 'Manhattan',
  },
  'freedom tower': {
    lat: 40.7127,
    lng: -74.0134,
    address: 'One World Trade Center',
    borough: 'Manhattan',
  },
  'statue of liberty': {
    lat: 40.6892,
    lng: -74.0445,
    address: 'Liberty Island',
    borough: 'Manhattan',
  },
  'city hall': {
    lat: 40.7128,
    lng: -74.0060,
    address: 'City Hall Park',
    borough: 'Manhattan',
  },
  'flatiron building': {
    lat: 40.7411,
    lng: -73.9897,
    address: '175 5th Avenue',
    borough: 'Manhattan',
  },
  'chrysler building': {
    lat: 40.7516,
    lng: -73.9755,
    address: '405 Lexington Avenue',
    borough: 'Manhattan',
  },
  'united nations': {
    lat: 40.7489,
    lng: -73.9680,
    address: '405 East 42nd Street',
    borough: 'Manhattan',
  },

  // === MUSEUMS & CULTURAL ===
  'met museum': {
    lat: 40.7794,
    lng: -73.9632,
    address: '1000 5th Avenue',
    borough: 'Manhattan',
  },
  'metropolitan museum': {
    lat: 40.7794,
    lng: -73.9632,
    address: '1000 5th Avenue',
    borough: 'Manhattan',
  },
  'natural history museum': {
    lat: 40.7813,
    lng: -73.9740,
    address: 'Central Park West and 79th Street',
    borough: 'Manhattan',
  },
  'moma': {
    lat: 40.7614,
    lng: -73.9776,
    address: '11 West 53rd Street',
    borough: 'Manhattan',
  },
  'guggenheim': {
    lat: 40.7830,
    lng: -73.9590,
    address: '1071 5th Avenue',
    borough: 'Manhattan',
  },
  'whitney museum': {
    lat: 40.7396,
    lng: -74.0089,
    address: '99 Gansevoort Street',
    borough: 'Manhattan',
  },
  'brooklyn museum': {
    lat: 40.6712,
    lng: -73.9636,
    address: '200 Eastern Parkway',
    borough: 'Brooklyn',
  },

  // === STADIUMS & ARENAS ===
  'yankee stadium': {
    lat: 40.8296,
    lng: -73.9262,
    address: '1 East 161st Street',
    borough: 'Bronx',
  },
  'citi field': {
    lat: 40.7571,
    lng: -73.8458,
    address: '41 Seaver Way',
    borough: 'Queens',
  },
  'madison square garden': {
    lat: 40.7505,
    lng: -73.9934,
    address: '4 Pennsylvania Plaza',
    borough: 'Manhattan',
  },
  'barclays center': {
    lat: 40.6826,
    lng: -73.9754,
    address: '620 Atlantic Avenue',
    borough: 'Brooklyn',
  },

  // === NEIGHBORHOODS (centers) ===
  'chinatown': {
    lat: 40.7158,
    lng: -73.9970,
    address: 'Canal Street and Mott Street',
    borough: 'Manhattan',
  },
  'little italy': {
    lat: 40.7198,
    lng: -73.9970,
    address: 'Mulberry Street',
    borough: 'Manhattan',
  },
  'soho': {
    lat: 40.7233,
    lng: -74.0030,
    address: 'Prince Street and Broadway',
    borough: 'Manhattan',
  },
  'tribeca': {
    lat: 40.7163,
    lng: -74.0086,
    address: 'Greenwich Street and Franklin Street',
    borough: 'Manhattan',
  },
  'greenwich village': {
    lat: 40.7336,
    lng: -74.0027,
    address: 'Bleecker Street and MacDougal Street',
    borough: 'Manhattan',
  },
  'east village': {
    lat: 40.7265,
    lng: -73.9815,
    address: 'St Marks Place',
    borough: 'Manhattan',
  },
  'harlem': {
    lat: 40.8116,
    lng: -73.9465,
    address: '125th Street and Malcolm X Boulevard',
    borough: 'Manhattan',
  },
  'williamsburg': {
    lat: 40.7081,
    lng: -73.9571,
    address: 'Bedford Avenue',
    borough: 'Brooklyn',
  },
  'dumbo': {
    lat: 40.7033,
    lng: -73.9883,
    address: 'Water Street and Washington Street',
    borough: 'Brooklyn',
  },
  'astoria': {
    lat: 40.7720,
    lng: -73.9301,
    address: 'Steinway Street and Broadway',
    borough: 'Queens',
  },
  'long island city': {
    lat: 40.7447,
    lng: -73.9485,
    address: 'Jackson Avenue and 44th Drive',
    borough: 'Queens',
  },
};

/**
 * Attempts to geocode an NYC location from natural language input
 *
 * Strategy:
 * 1. Check known landmarks first (instant, no API call)
 * 2. Try NYC GeoSearch API (free, NYC-specific)
 * 3. Fall back to pattern matching for basic formatting
 */
export async function geocodeNYCLocation(input: string): Promise<GeocoderResult> {
  const locationType = detectLocationType(input);
  const crossStreets = extractCrossStreets(input);
  const normalized = input.toLowerCase();

  // 1. Check known landmarks first (no API call needed)
  for (const [landmark, data] of Object.entries(NYC_LANDMARKS)) {
    if (normalized.includes(landmark)) {
      console.log(`[Geocoder] Matched known landmark: ${landmark}`);
      return {
        success: true,
        location: {
          originalInput: input,
          formattedAddress: data.address,
          latitude: data.lat,
          longitude: data.lng,
          borough: data.borough,
          isStandardAddress: false,
          locationType: detectLocationType(landmark),
          confidence: 0.95,
          context: `Known landmark: ${landmark}`,
        },
      };
    }
  }

  // Offline seam for tests: skip network, fall through to pattern matching.
  if (process.env.GEO_OFFLINE === '1') {
    const geoSearchResult: GeocoderResult = { success: false, error: 'offline' };
    return fallbackGeocode(input, crossStreets, locationType, geoSearchResult);
  }

  // 2. Try NYC GeoSearch API
  console.log('[Geocoder] Querying NYC GeoSearch API...');
  const geoSearchResult = await queryNYCGeoSearch(input);

  if (geoSearchResult.success && geoSearchResult.location) {
    // Enrich with our detected info
    const location = geoSearchResult.location;
    location.crossStreets = crossStreets || undefined;

    // If our detection is more specific, use it
    if (locationType !== 'unknown' && location.locationType === 'unknown') {
      location.locationType = locationType;
    }

    return geoSearchResult;
  }

  // 3. If API failed but we detected an intersection, try a more specific query
  if (crossStreets && !geoSearchResult.success) {
    console.log('[Geocoder] Trying intersection-specific query...');
    const intersectionResult = await queryNYCIntersection(
      crossStreets.street1,
      crossStreets.street2
    );

    if (intersectionResult.success) {
      if (intersectionResult.location) {
        intersectionResult.location.crossStreets = crossStreets;
      }
      return intersectionResult;
    }
  }

  // 4. Fall back to pattern-based formatting (no coordinates)
  return fallbackGeocode(input, crossStreets, locationType, geoSearchResult);
}

/** Pattern-based geocoding with no network calls (used offline and as final fallback). */
function fallbackGeocode(
  input: string,
  crossStreets: { street1: string; street2: string } | null,
  locationType: NYCLocation['locationType'],
  geoSearchResult: GeocoderResult
): GeocoderResult {
  console.log('[Geocoder] Falling back to pattern matching...');

  if (crossStreets) {
    return {
      success: true,
      location: {
        originalInput: input,
        formattedAddress: `${crossStreets.street1} and ${crossStreets.street2}, New York, NY`,
        isStandardAddress: false,
        locationType: 'intersection',
        confidence: 0.5,
        crossStreets,
        context: 'Pattern-matched intersection (no API coordinates)',
      },
    };
  }

  if (locationType === 'street_address') {
    return {
      success: true,
      location: {
        originalInput: input,
        formattedAddress: input.includes('New York') ? input : `${input}, New York, NY`,
        isStandardAddress: true,
        locationType: 'street_address',
        confidence: 0.6,
        context: 'Pattern-matched address (no API verification)',
      },
    };
  }

  // Unknown location type
  return {
    success: false,
    location: {
      originalInput: input,
      isStandardAddress: false,
      locationType: 'unknown',
      confidence: 0.2,
      context: 'Could not geocode - manual entry may be required',
    },
    error: geoSearchResult.error || 'Could not geocode this location',
  };
}

/**
 * Map bounds configuration for NYC 311's map interface
 * These values are estimated and may need calibration
 */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapSize {
  width: number;
  height: number;
}

/**
 * Default NYC map bounds (covers all 5 boroughs)
 * These are approximate and may need adjustment based on the actual 311 map
 */
export const NYC_DEFAULT_BOUNDS: MapBounds = {
  north: 40.92,   // North of Bronx
  south: 40.50,   // South of Staten Island
  east: -73.70,   // East Queens
  west: -74.26,   // West Staten Island/NJ border
};

/**
 * Tighter bounds for Manhattan-focused views
 */
export const MANHATTAN_BOUNDS: MapBounds = {
  north: 40.88,   // Inwood
  south: 40.70,   // Battery Park
  east: -73.91,   // East River
  west: -74.02,   // Hudson River
};

/**
 * Web Mercator projection conversion
 * Converts latitude to Y coordinate in Web Mercator (EPSG:3857)
 */
function latToMercatorY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

/**
 * Converts lat/lng to pixel coordinates on a map using Web Mercator projection
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param mapBounds - The visible bounds of the map
 * @param mapSize - The pixel dimensions of the map container
 * @returns Pixel coordinates { x, y } relative to the map container
 */
export function coordsToMapPixels(
  lat: number,
  lng: number,
  mapBounds: MapBounds,
  mapSize: MapSize
): { x: number; y: number } {
  // Convert bounds to Mercator Y values
  const northY = latToMercatorY(mapBounds.north);
  const southY = latToMercatorY(mapBounds.south);
  const pointY = latToMercatorY(lat);

  // Calculate X (longitude is linear)
  const x = ((lng - mapBounds.west) / (mapBounds.east - mapBounds.west)) * mapSize.width;

  // Calculate Y (using Mercator projection for latitude)
  const y = ((northY - pointY) / (northY - southY)) * mapSize.height;

  return {
    x: Math.round(Math.max(0, Math.min(mapSize.width, x))),
    y: Math.round(Math.max(0, Math.min(mapSize.height, y))),
  };
}

/**
 * Estimates map bounds from the current view
 * This tries to detect the bounds from the map's data attributes or URL
 */
export function estimateMapBoundsFromZoom(
  centerLat: number,
  centerLng: number,
  zoomLevel: number,
  mapSize: MapSize
): MapBounds {
  // Approximate degrees per pixel at different zoom levels
  // Zoom 12 ≈ 0.00015 degrees/pixel, doubles with each zoom out
  const degreesPerPixelBase = 0.00015;
  const degreesPerPixel = degreesPerPixelBase * Math.pow(2, 14 - zoomLevel);

  const latSpan = degreesPerPixel * mapSize.height;
  const lngSpan = degreesPerPixel * mapSize.width;

  return {
    north: centerLat + latSpan / 2,
    south: centerLat - latSpan / 2,
    east: centerLng + lngSpan / 2,
    west: centerLng - lngSpan / 2,
  };
}

/**
 * Calculates the optimal click position for a location on the NYC 311 map
 *
 * @param targetLat - Target latitude
 * @param targetLng - Target longitude
 * @param mapCenterLat - Current map center latitude (if known)
 * @param mapCenterLng - Current map center longitude (if known)
 * @param mapSize - Map container dimensions
 * @param zoomLevel - Estimated zoom level (default 14 for street-level)
 * @returns Pixel coordinates to click, or null if target is outside visible area
 */
export function calculateMapClickPosition(
  targetLat: number,
  targetLng: number,
  mapCenterLat: number | null,
  mapCenterLng: number | null,
  mapSize: MapSize,
  zoomLevel: number = 14
): { x: number; y: number; confidence: number } | null {
  // If we don't know the map center, assume it's centered on the target
  // (which happens after a successful search)
  const centerLat = mapCenterLat ?? targetLat;
  const centerLng = mapCenterLng ?? targetLng;

  // Estimate bounds based on zoom level
  const bounds = estimateMapBoundsFromZoom(centerLat, centerLng, zoomLevel, mapSize);

  // Check if target is within bounds
  if (
    targetLat < bounds.south ||
    targetLat > bounds.north ||
    targetLng < bounds.west ||
    targetLng > bounds.east
  ) {
    console.log('[MapCalc] Target outside visible bounds');
    return null;
  }

  // Calculate pixel position
  const pixels = coordsToMapPixels(targetLat, targetLng, bounds, mapSize);

  // Calculate confidence based on how close to center
  const distFromCenter = Math.sqrt(
    Math.pow((pixels.x - mapSize.width / 2) / mapSize.width, 2) +
    Math.pow((pixels.y - mapSize.height / 2) / mapSize.height, 2)
  );
  const confidence = Math.max(0.3, 1 - distFromCenter);

  console.log(`[MapCalc] Target: (${targetLat}, ${targetLng}) → Pixel: (${pixels.x}, ${pixels.y}), confidence: ${confidence.toFixed(2)}`);

  return { ...pixels, confidence };
}

/**
 * NYC GeoSearch API Response types
 * Based on Pelias geocoder format
 */
interface GeoSearchFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    id: string;
    gid: string;
    layer: string;
    source: string;
    source_id: string;
    name: string;
    housenumber?: string;
    street?: string;
    postalcode?: string;
    confidence: number;
    match_type?: string;
    accuracy?: string;
    country?: string;
    country_gid?: string;
    country_a?: string;
    region?: string;
    region_gid?: string;
    region_a?: string;
    county?: string;
    county_gid?: string;
    locality?: string;
    locality_gid?: string;
    borough?: string;
    borough_gid?: string;
    neighbourhood?: string;
    neighbourhood_gid?: string;
    label: string;
  };
}

interface GeoSearchResponse {
  geocoding: {
    version: string;
    attribution: string;
    query: {
      text: string;
      size: number;
    };
  };
  type: 'FeatureCollection';
  features: GeoSearchFeature[];
}

/**
 * NYC GeoSearch API client (Planning Labs)
 * https://geosearch.planninglabs.nyc/
 *
 * This is a free NYC-specific geocoding service that understands
 * NYC addresses, intersections, and landmarks.
 * No API key required!
 */
export async function queryNYCGeoSearch(query: string): Promise<GeocoderResult> {
  console.log(`[NYC GeoSearch] Querying: "${query}"`);

  try {
    const url = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `NYC GeoSearch API error: ${response.status} ${response.statusText}`,
      };
    }

    const data: GeoSearchResponse = await response.json();

    if (!data.features || data.features.length === 0) {
      console.log('[NYC GeoSearch] No results found');
      return {
        success: false,
        error: 'No results found for this location',
      };
    }

    // Convert results to our format
    const results: NYCLocation[] = data.features.map((feature) => {
      const props = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;

      // Determine location type from layer
      let locationType: NYCLocation['locationType'] = 'unknown';
      if (props.layer === 'address') locationType = 'street_address';
      else if (props.layer === 'intersection') locationType = 'intersection';
      else if (props.layer === 'venue') locationType = 'landmark';
      else if (props.layer === 'street') locationType = 'street_address';

      // Map borough name to our type
      let borough: NYCLocation['borough'] | undefined;
      if (props.borough) {
        const boroughMap: Record<string, NYCLocation['borough']> = {
          'Manhattan': 'Manhattan',
          'Brooklyn': 'Brooklyn',
          'Queens': 'Queens',
          'Bronx': 'Bronx',
          'The Bronx': 'Bronx',
          'Staten Island': 'Staten Island',
        };
        borough = boroughMap[props.borough];
      }

      return {
        originalInput: query,
        formattedAddress: props.label,
        latitude: lat,
        longitude: lng,
        borough,
        isStandardAddress: locationType === 'street_address',
        locationType,
        confidence: props.confidence || 0.5,
        context: `Source: ${props.source}, Layer: ${props.layer}`,
      };
    });

    console.log(`[NYC GeoSearch] Found ${results.length} result(s)`);
    console.log(`[NYC GeoSearch] Top result: "${results[0].formattedAddress}" (${results[0].latitude}, ${results[0].longitude})`);

    return {
      success: true,
      location: results[0],
      alternatives: results.slice(1),
    };
  } catch (error) {
    console.error('[NYC GeoSearch] Error:', error);
    return {
      success: false,
      error: `NYC GeoSearch API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Search for an intersection using NYC GeoSearch
 */
export async function queryNYCIntersection(street1: string, street2: string, borough?: string): Promise<GeocoderResult> {
  // NYC GeoSearch supports intersection queries with "and" or "&"
  let query = `${street1} and ${street2}`;
  if (borough) {
    query += `, ${borough}`;
  }
  query += ', New York';

  return queryNYCGeoSearch(query);
}

/**
 * Autocomplete search for partial addresses
 */
export async function queryNYCAutocomplete(partialQuery: string): Promise<GeocoderResult> {
  console.log(`[NYC GeoSearch] Autocomplete: "${partialQuery}"`);

  try {
    const url = `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(partialQuery)}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `NYC GeoSearch autocomplete error: ${response.status}`,
      };
    }

    const data: GeoSearchResponse = await response.json();

    if (!data.features || data.features.length === 0) {
      return {
        success: false,
        error: 'No autocomplete results',
      };
    }

    const results: NYCLocation[] = data.features.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return {
        originalInput: partialQuery,
        formattedAddress: feature.properties.label,
        latitude: lat,
        longitude: lng,
        isStandardAddress: feature.properties.layer === 'address',
        locationType: feature.properties.layer === 'address' ? 'street_address' : 'unknown',
        confidence: feature.properties.confidence || 0.5,
      };
    });

    return {
      success: true,
      location: results[0],
      alternatives: results.slice(1),
    };
  } catch (error) {
    return {
      success: false,
      error: `Autocomplete error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Suggests nearby standard addresses for a non-standard location
 * Useful when the exact location can't be geocoded
 */
export function suggestNearbyAddresses(location: NYCLocation): string[] {
  const suggestions: string[] = [];

  if (location.crossStreets) {
    // For intersections, suggest addresses on each street
    const { street1, street2 } = location.crossStreets;

    // Extract street number if present
    const numMatch = street1.match(/(\d+)/);
    if (numMatch) {
      suggestions.push(`${numMatch[1]} ${street2}, New York, NY`);
    }

    suggestions.push(`1 ${street2}, New York, NY`);
    suggestions.push(`1 ${street1}, New York, NY`);
  }

  if (location.nearbyAddress) {
    suggestions.push(location.nearbyAddress);
  }

  return suggestions;
}

