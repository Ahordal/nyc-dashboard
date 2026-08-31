// filterNotice.test.ts
//
// Unit tests for getFilterNoticeParts: correct segments, fixed order
// (grades, boroughs, search, radius), and the "All" fallback when nothing
// is active.

import { describe, it, expect } from "vitest";
import { getFilterNoticeParts } from "./filterNotice";

const base = {
  grades: [] as string[],
  boroughs: [] as string[],
  searchQuery: "",
  hasSearchRadius: false,
};

describe("getFilterNoticeParts", () => {
  it("returns the All fallback when nothing is active", () => {
    expect(getFilterNoticeParts(base)).toEqual([{ kind: "all" }]);
  });

  it("emits a single segment for each filter on its own", () => {
    expect(getFilterNoticeParts({ ...base, grades: ["A", "B"] })).toEqual([
      { kind: "grades", grades: ["A", "B"] },
    ]);
    expect(getFilterNoticeParts({ ...base, boroughs: ["Manhattan"] })).toEqual([
      { kind: "boroughs", boroughs: ["Manhattan"] },
    ]);
    expect(getFilterNoticeParts({ ...base, searchQuery: "pizza" })).toEqual([
      { kind: "search", query: "pizza" },
    ]);
    expect(getFilterNoticeParts({ ...base, hasSearchRadius: true })).toEqual([
      { kind: "radius" },
    ]);
  });

  it("orders segments grades → boroughs → search → radius", () => {
    expect(
      getFilterNoticeParts({
        grades: ["A"],
        boroughs: ["Queens"],
        searchQuery: "deli",
        hasSearchRadius: true,
      }),
    ).toEqual([
      { kind: "grades", grades: ["A"] },
      { kind: "boroughs", boroughs: ["Queens"] },
      { kind: "search", query: "deli" },
      { kind: "radius" },
    ]);
  });

  it("keeps relative order for a partial combination and drops the All fallback", () => {
    expect(
      getFilterNoticeParts({ ...base, grades: ["C"], hasSearchRadius: true }),
    ).toEqual([{ kind: "grades", grades: ["C"] }, { kind: "radius" }]);
  });
});
