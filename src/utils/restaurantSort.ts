// restaurantSort.ts
//
// Pure sort logic for the Restaurant List's two-level sort, split out for
// testing. RestaurantList owns the UI state; this just orders the list.

import type { RestaurantProperties } from "../types/restaurant";
import type { SearchRadiusPoint } from "../types/searchRadius";
import { getGradeCategory } from "./gradeCategory";
import { haversineDistanceMiles, roundApproxMilesValue } from "./distance";

export type SortKeyId =
  | "inspection_date"
  | "name"
  | "cuisine"
  | "grade"
  | "score"
  | "distance";

export type SortDirection = "asc" | "desc";

function gradeRank(restaurant: RestaurantProperties): number {
  const category = getGradeCategory(
    restaurant.action,
    restaurant.grade,
    restaurant.score,
  );
  switch (category) {
    case "A": return 0;
    case "B": return 1;
    case "C": return 2;
    case "pending": return 3;
    case "uninspected": return 4;
    case "closed": return 5;
    default: {
      // Fails to compile if GradeCategory gains a member without a rank here.
      const exhaustiveCheck: never = category;
      return exhaustiveCheck;
    }
  }
}

// Restaurant -> comparable value, or null (nulls sort last).
// needsDistancePoint needs an origin; a sort chains one or two, one direction.
export const SORT_KEYS: Record<
  SortKeyId,
  {
    label: string;
    needsDistancePoint?: boolean;
    keyOf: (
      restaurant: RestaurantProperties,
      point: SearchRadiusPoint | null,
    ) => number | string | null;
  }
> = {
  inspection_date: {
    label: "Inspected",
    keyOf: (restaurant) => {
      if (!restaurant.inspection_date) return null;
      const time = new Date(restaurant.inspection_date).getTime();
      return Number.isNaN(time) ? null : time;
    },
  },
  name: {
    label: "Name",
    keyOf: (restaurant) => restaurant.name?.trim() || null,
  },
  cuisine: {
    label: "Cuisine",
    keyOf: (restaurant) => restaurant.cuisine?.trim() || null,
  },
  grade: { label: "Grade", keyOf: (restaurant) => gradeRank(restaurant) },
  score: { label: "Score", keyOf: (restaurant) => restaurant.score ?? null },
  distance: {
    label: "Distance",
    needsDistancePoint: true,
    // Rounded like the card (roundApproxMilesValue), so equal-looking
    // distances tie and a secondary field can break them.
    keyOf: (restaurant, point) =>
      point && restaurant.latitude != null && restaurant.longitude != null
        ? roundApproxMilesValue(
            haversineDistanceMiles(point, {
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
            }),
          )
        : null,
  },
};

// Order the fields appear in both dropdowns.
export const SORT_KEY_ORDER: SortKeyId[] = [
  "inspection_date",
  "name",
  "cuisine",
  "grade",
  "score",
  "distance",
];

// Default direction on becoming primary (Grade -> A, Distance -> closest).
// Toggle can still flip it.
export const NATURAL_DIRECTION: Record<SortKeyId, SortDirection> = {
  inspection_date: "desc", // most recent first
  name: "asc", // A–Z
  cuisine: "asc", // A–Z
  grade: "asc", // A first
  score: "asc", // lowest (cleanest) score first
  distance: "asc", // closest first
};

export type SortOptions = {
  primary: SortKeyId;
  secondary: SortKeyId | null;
  direction: SortDirection;
  // Distance origin (radius centre or locate dot). Null -> "distance"
  // keys nothing, falls to the name/id tiebreak.
  point: SearchRadiusPoint | null;
};

// New array, not mutated. Primary sorts first, then secondary; nulls
// last; ties fall to name, then id.
export function sortRestaurants(
  restaurants: RestaurantProperties[],
  { primary, secondary, direction, point }: SortOptions,
): RestaurantProperties[] {
  const sortableList = [...restaurants];
  const directionMultiplier = direction === "asc" ? 1 : -1;
  const levels: SortKeyId[] = secondary ? [primary, secondary] : [primary];

  sortableList.sort((first, second) => {
    for (const key of levels) {
      const firstKey = SORT_KEYS[key].keyOf(first, point);
      const secondKey = SORT_KEYS[key].keyOf(second, point);

      if (firstKey === null || secondKey === null) {
        if (firstKey === null && secondKey !== null) return 1;
        if (secondKey === null && firstKey !== null) return -1;
        continue; // both missing at this level; try the next key
      }

      const comparison =
        typeof firstKey === "string"
          ? firstKey.localeCompare(secondKey as string)
          : firstKey - (secondKey as number);
      if (comparison !== 0) return comparison * directionMultiplier;
    }

    const nameTie = (first.name || "").localeCompare(second.name || "");
    if (nameTie !== 0) return nameTie;
    return (first.id || "").localeCompare(second.id || "");
  });

  return sortableList;
}
