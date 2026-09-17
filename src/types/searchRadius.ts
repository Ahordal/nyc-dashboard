// searchRadius.ts
//
// A user-placed point + a fixed walking radius. Filters/sorts the list
// only — never spatially filters the map. See useSearchRadiusTool.

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

// Guards against a hand-edited ?radius= URL smuggling in an unsupported value.
export function isSearchRadiusMiles(value: number): value is SearchRadiusMiles {
  return (SEARCH_RADIUS_OPTIONS_MILES as readonly number[]).includes(value);
}
