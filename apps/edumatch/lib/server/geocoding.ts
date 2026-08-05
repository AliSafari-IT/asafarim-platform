/**
 * Phase 3 — Google Maps Geocoding integration.
 *
 * Resolves addresses to lat/lng for PostGIS spatial queries.
 * Falls back gracefully when GOOGLE_MAPS_API_KEY is not configured (dev mode).
 */

export type GeoPoint = { lat: number; lng: number };
export type GeoBounds = { northeast: GeoPoint; southwest: GeoPoint };

export type GeocodeResult = {
  formattedAddress: string;
  location: GeoPoint;
  bounds?: GeoBounds;
  placeId: string;
  types: string[];
};

export type GeocodeError = { error: string };

/**
 * Geocode a human-readable address to lat/lng.
 * Returns null in dev mode if API key is not configured.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | GeocodeError | null> {
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleApiKey) {
    // Dev fallback: return null to signal "geocoding unavailable"
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", googleApiKey);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: Array<{
      formatted_address: string;
      geometry: {
        location: { lat: number; lng: number };
        bounds?: { northeast: GeoPoint; southwest: GeoPoint };
      };
      place_id: string;
      types: string[];
    }>;
  };

  if (data.status !== "OK") {
    return { error: data.error_message ?? `Geocoding failed: ${data.status}` };
  }

  const first = data.results?.[0];
  if (!first) {
    return { error: "No results found for address." };
  }

  return {
    formattedAddress: first.formatted_address,
    location: first.geometry.location,
    bounds: first.geometry.bounds,
    placeId: first.place_id,
    types: first.types,
  };
}

/**
 * Reverse geocode lat/lng to a human-readable address.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<Pick<GeocodeResult, "formattedAddress" | "placeId" | "types"> | GeocodeError | null> {
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleApiKey) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", googleApiKey);

  const res = await fetch(url.toString());
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: Array<{
      formatted_address: string;
      place_id: string;
      types: string[];
    }>;
  };

  if (data.status !== "OK") {
    return { error: data.error_message ?? `Reverse geocoding failed: ${data.status}` };
  }

  const first = data.results?.[0];
  if (!first) return { error: "No address found for location." };

  return {
    formattedAddress: first.formatted_address,
    placeId: first.place_id,
    types: first.types,
  };
}

/**
 * Calculate distance between two points using the Haversine formula.
 * Good for quick client-side estimates; use PostGIS for accurate server-side queries.
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}
