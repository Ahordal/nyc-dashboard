// distance.ts
//
// Pure haversine great-circle distance helper for the map's Search Radius
// tool. Client-side on purpose: the sidebar's in-memory list already
// carries each restaurant's latitude/longitude, and the map is never
// spatially filtered by radius, so a server-side ArcGIS spatial query
// would buy nothing here.

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

// Coarse mileage string: tenths below ~10 mi, whole miles above, floored
// at 0.1 so a near-coincident point never reads "0.0". Shared by the
// display and spoken formatters so both round identically.
function roundApproxMiles(miles: number): string {
  return miles < 9.95
    ? Math.max(0.1, Math.round(miles * 10) / 10).toFixed(1)
    : String(Math.round(miles));
}

// Straight-line (great-circle) distance for display, e.g. "~2.3 mi". The
// value is deliberately coarse and carries a leading "~": it's not a
// walking or driving distance, and in NYC the two diverge a lot.
export function formatApproxMiles(miles: number): string {
  return `~${roundApproxMiles(miles)} mi`;
}

// Same rounding, phrased for aria-labels: "about 2.3 miles".
export function formatApproxMilesSpoken(miles: number): string {
  return `about ${roundApproxMiles(miles)} miles`;
}
