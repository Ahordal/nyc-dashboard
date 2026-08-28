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
