// distance.ts
//
// For Search Radius: client-side since the list has lat/lon already and
// radius never filters the map.

const EARTH_RADIUS_MILES = 3958.8;

type LatLng = {
  latitude: number;
  longitude: number;
};

export function haversineDistanceMiles(from: LatLng, to: LatLng): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

// Tenths below ~10mi, whole miles above; floored at 0.1 so a near point
// never reads "0.0". Also the Distance sort key, so tied displays tie.
export function roundApproxMilesValue(miles: number): number {
  return miles < 9.95
    ? Math.max(0.1, Math.round(miles * 10) / 10)
    : Math.round(miles);
}

// Shared by both formatters so they round identically.
function roundApproxMiles(miles: number): string {
  const rounded = roundApproxMilesValue(miles);
  return miles < 9.95 ? rounded.toFixed(1) : String(rounded);
}

// e.g. "~2.3 mi" — straight-line, not walking/driving, which diverge a lot in NYC.
export function formatApproxMiles(miles: number): string {
  return `~${roundApproxMiles(miles)} mi`;
}

// Same rounding, phrased for aria-labels: "about 2.3 miles".
export function formatApproxMilesSpoken(miles: number): string {
  return `about ${roundApproxMiles(miles)} miles`;
}
