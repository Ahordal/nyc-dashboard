// restaurantSort.ts
//
// Pure sort logic for the Restaurant List's two-level sort control,
// pulled out of RestaurantList.tsx so it can be unit-tested without
// rendering the component. RestaurantList owns the UI state (which
// fields are picked, the direction toggle, the dropdown sentinels);
// this module owns "given those choices, produce the ordered list".

import type { RestaurantProperties } from "../types/restaurant";
import type { SearchRadiusPoint } from "../types/searchRadius";
import { getGradeCategory } from "./gradeCategory";
import { haversineDistanceMiles } from "./distance";

export type SortKeyId =
  | "inspection_date"
  | "name"
  | "cuisine"
  | "grade"
  | "score"
  | "distance";

export type SortDirection = "asc" | "desc";

function gradeRank(restaurant: RestaurantProperties): number {
  switch (
    getGradeCategory(restaurant.action, restaurant.grade, restaurant.score)
  ) {
    case "A": return 0;
    case "B": return 1;
    case "C": return 2;
    case "pending": return 3;
    case "uninspected": return 4;
    case "closed": return 5;
    default: return 6;
  }
}

// Each sortable field is a labelled key function: restaurant -> a
// comparable value, or null when the row has no value for that field.
// Null values always sort last regardless of direction (so flipping
// Score or Inspected to ascending can't flood the first page with
// not-yet-inspected restaurants). `radiusOnly` fields are only offered
// while a Search Radius point is set. A sort is one or two of these
// applied in order, sharing one direction.
export const SORT_KEYS: Record<
  SortKeyId,
  {
    label: string;
    radiusOnly?: boolean;
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
    radiusOnly: true,
    keyOf: (restaurant, point) =>
      point && restaurant.latitude != null && restaurant.longitude != null
        ? haversineDistanceMiles(point, {
            latitude: restaurant.latitude,
            longitude: restaurant.longitude,
          })
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

// The direction that puts the "best"/most useful rows first for each
// field -- applied whenever the primary field changes, so picking Grade
// starts with A's, Distance with the closest, etc. The user can still
// flip it with the direction toggle.
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
  // The active Search Radius centre, needed by the "distance" key. Null
  // when the tool is inactive -- "distance" then keys every row as null
  // and drops out to the name/id tiebreak.
  point: SearchRadiusPoint | null;
};

// Returns a new array; does not mutate the input. The primary field is
// applied first, then the secondary (if any), sharing one direction. A
// null key at any level sorts that row last regardless of direction;
// fully-tied rows fall back to name, then id, for a stable order.
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
        continue; // both missing at this level -- try the next key
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
