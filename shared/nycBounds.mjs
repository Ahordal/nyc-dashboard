// nycBounds.mjs
//
// Single source of truth for the loose NYC bounding box. Shared between
// the geocoding pipeline (pipeline/normalize.mjs re-exports it;
// fetch-inspection.mjs imports it directly) and the frontend (MapView,
// to reject a device GPS fix that lands outside NYC).
//
// Deliberately loose, with a small margin around the five boroughs: it's
// meant to catch (0, 0), swapped lat/lon, and addresses well outside the
// city (a same-house-number match in Glen Cove, say), not to trace the
// shoreline.

export const NYC_BOUNDS = {
  minLat: 40.4,
  maxLat: 41.0,
  minLon: -74.3,
  maxLon: -73.65,
};

export function isWithinNYC(lat, lon) {
  return (
    lat >= NYC_BOUNDS.minLat &&
    lat <= NYC_BOUNDS.maxLat &&
    lon >= NYC_BOUNDS.minLon &&
    lon <= NYC_BOUNDS.maxLon
  );
}
