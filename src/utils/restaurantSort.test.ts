// restaurantSort.test.ts
//
// Unit tests for sortRestaurants and its sort-key metadata: single- and
// two-level ordering, per-field key semantics, null values always last,
// the radius-only distance key, and the tiebreak fallback to name then id.

import { describe, it, expect } from "vitest";
import {
  sortRestaurants,
  SORT_KEYS,
  SORT_KEY_ORDER,
  NATURAL_DIRECTION,
} from "./restaurantSort";
import type { SortOptions } from "./restaurantSort";
import type { RestaurantProperties } from "../types/restaurant";

// Minimal restaurant factory: only the fields the sort keys read.
function mk(
  id: string,
  overrides: Partial<RestaurantProperties> = {},
): RestaurantProperties {
  return {
    id,
    camis: id,
    name: id,
    action: "Violations were cited in the following area(s).",
    grade: null,
    score: null,
    cuisine: "",
    inspection_date: "",
    latitude: undefined,
    longitude: undefined,
    ...overrides,
  } as RestaurantProperties;
}

const base: Omit<SortOptions, "primary"> = {
  secondary: null,
  direction: "asc",
  point: null,
};

function ids(list: RestaurantProperties[]): string[] {
  return list.map((r) => r.id);
}

describe("sortRestaurants -- single key", () => {
  it("does not mutate the input array", () => {
    const input = [mk("b"), mk("a")];
    const snapshot = ids(input);
    sortRestaurants(input, { ...base, primary: "name" });
    expect(ids(input)).toEqual(snapshot);
  });

  it("sorts by name ascending and descending", () => {
    const list = [mk("charlie"), mk("alpha"), mk("bravo")];
    expect(ids(sortRestaurants(list, { ...base, primary: "name" }))).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(
      ids(
        sortRestaurants(list, { ...base, primary: "name", direction: "desc" }),
      ),
    ).toEqual(["charlie", "bravo", "alpha"]);
  });

  it("sorts by score numerically, not lexically", () => {
    const list = [
      mk("a", { score: 9 }),
      mk("b", { score: 100 }),
      mk("c", { score: 20 }),
    ];
    expect(ids(sortRestaurants(list, { ...base, primary: "score" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("ranks by grade category, not the raw grade letter", () => {
    const list = [
      mk("cee", { grade: "C", score: 40 }),
      mk("aye", { grade: "A", score: 5 }),
      mk("pending", { grade: "N", score: null }),
      mk("bee", { grade: "B", score: 20 }),
    ];
    expect(ids(sortRestaurants(list, { ...base, primary: "grade" }))).toEqual([
      "aye",
      "bee",
      "cee",
      "pending",
    ]);
  });

  it("sorts inspection_date by timestamp", () => {
    const list = [
      mk("old", { inspection_date: "2019-01-01" }),
      mk("new", { inspection_date: "2024-06-01" }),
      mk("mid", { inspection_date: "2021-03-15" }),
    ];
    expect(
      ids(sortRestaurants(list, { ...base, primary: "inspection_date" })),
    ).toEqual(["old", "mid", "new"]);
  });
});

describe("sortRestaurants -- null handling", () => {
  it("puts rows with no value last, ascending", () => {
    const list = [
      mk("none1", { score: null }),
      mk("has", { score: 15 }),
      mk("none2", { score: null }),
    ];
    const result = ids(sortRestaurants(list, { ...base, primary: "score" }));
    expect(result[0]).toBe("has");
    expect(result.slice(1).sort()).toEqual(["none1", "none2"]);
  });

  it("still puts rows with no value last, descending", () => {
    const list = [
      mk("none", { score: null }),
      mk("lo", { score: 5 }),
      mk("hi", { score: 90 }),
    ];
    expect(
      ids(
        sortRestaurants(list, { ...base, primary: "score", direction: "desc" }),
      ),
    ).toEqual(["hi", "lo", "none"]);
  });
});

describe("sortRestaurants -- distance key", () => {
  const point = { latitude: 40.75, longitude: -73.99 };

  it("orders by haversine distance from the point when one is set", () => {
    const list = [
      mk("far", { latitude: 40.79, longitude: -73.99 }),
      mk("near", { latitude: 40.751, longitude: -73.99 }),
      mk("mid", { latitude: 40.77, longitude: -73.99 }),
    ];
    expect(
      ids(sortRestaurants(list, { ...base, primary: "distance", point })),
    ).toEqual(["near", "mid", "far"]);
  });

  it("is inert without a point -- every row keys as null, falls to name/id", () => {
    const list = [
      mk("b", { latitude: 40.79, longitude: -73.99 }),
      mk("a", { latitude: 40.75, longitude: -73.99 }),
    ];
    expect(
      ids(
        sortRestaurants(list, { ...base, primary: "distance", point: null }),
      ),
    ).toEqual(["a", "b"]);
  });

  it("keys a row with no coordinates as null (sorts last)", () => {
    const list = [
      mk("nocoords"),
      mk("near", { latitude: 40.751, longitude: -73.99 }),
    ];
    expect(
      ids(sortRestaurants(list, { ...base, primary: "distance", point })),
    ).toEqual(["near", "nocoords"]);
  });
});

describe("sortRestaurants -- two-level", () => {
  it("breaks primary ties with the secondary key", () => {
    const list = [
      mk("z-cheap", { score: 10, cuisine: "Thai" }),
      mk("a-cheap", { score: 10, cuisine: "Bakery" }),
      mk("pricey", { score: 30, cuisine: "Deli" }),
    ];
    expect(
      ids(
        sortRestaurants(list, {
          ...base,
          primary: "score",
          secondary: "cuisine",
        }),
      ),
    ).toEqual(["a-cheap", "z-cheap", "pricey"]);
  });

  it("shares one direction across both levels", () => {
    const list = [
      mk("z-cheap", { score: 10, cuisine: "Thai" }),
      mk("a-cheap", { score: 10, cuisine: "Bakery" }),
    ];
    expect(
      ids(
        sortRestaurants(list, {
          ...base,
          primary: "score",
          secondary: "cuisine",
          direction: "desc",
        }),
      ),
    ).toEqual(["z-cheap", "a-cheap"]);
  });

  it("falls back to name then id when every level ties", () => {
    const list = [
      mk("id-9", { name: "Same", score: 10 }),
      mk("id-1", { name: "Same", score: 10 }),
    ];
    expect(
      ids(sortRestaurants(list, { ...base, primary: "score" })),
    ).toEqual(["id-1", "id-9"]);
  });
});

describe("sort key metadata", () => {
  it("offers distance last and only as a radius-only key", () => {
    expect(SORT_KEY_ORDER[SORT_KEY_ORDER.length - 1]).toBe("distance");
    expect(SORT_KEYS.distance.radiusOnly).toBe(true);
    for (const key of SORT_KEY_ORDER) {
      if (key !== "distance") expect(SORT_KEYS[key].radiusOnly).toBeFalsy();
    }
  });

  it("has a natural direction for every sort key", () => {
    for (const key of SORT_KEY_ORDER) {
      expect(NATURAL_DIRECTION[key]).toMatch(/^(asc|desc)$/);
    }
    expect(NATURAL_DIRECTION.distance).toBe("asc");
    expect(NATURAL_DIRECTION.inspection_date).toBe("desc");
  });
});
