// searchRadius.ts
//
// Shared types for the map's Search Radius tool: a user-placed point
// plus one of a fixed set of walking-distance radii, used to filter and
// sort the restaurant list without ever spatially filtering the map
// itself. See MapView.tsx's useSearchRadiusTool hook.

export type SearchRadiusPoint = {
  longitude: number;
  latitude: number;
};

export const SEARCH_RADIUS_OPTIONS_MILES = [0.25, 0.5, 1] as const;

export type SearchRadiusMiles = (typeof SEARCH_RADIUS_OPTIONS_MILES)[number];

export const SEARCH_RADIUS_LABELS: Record<SearchRadiusMiles, string> = {
  0.25: "0.25 mi",
  0.5: "0.50 mi",
  1: "1 mi",
};

// Narrows an arbitrary number to one of the fixed radius options, used
// when rehydrating a radius from an untrusted source (the URL) so a
// hand-edited ?radius=...,<miles> can't smuggle in an unsupported value.
export function isSearchRadiusMiles(value: number): value is SearchRadiusMiles {
  return (SEARCH_RADIUS_OPTIONS_MILES as readonly number[]).includes(value);
}
