// gradeCounts.test.ts

import { describe, it, expect } from "vitest";
import { scopeGradeCounts, EMPTY_GRADE_COUNTS } from "./gradeCounts";
import type { GradeCounts } from "./gradeCounts";

const FULL_COUNTS: GradeCounts = {
  A: 10,
  B: 5,
  C: 2,
  pending: 3,
  uninspected: 1,
  closed: 4,
};

describe("scopeGradeCounts", () => {
  it("returns the counts unchanged when no grades are selected", () => {
    expect(scopeGradeCounts(FULL_COUNTS, [])).toBe(FULL_COUNTS);
  });

  it("zeroes categories outside the selected grades", () => {
    expect(scopeGradeCounts(FULL_COUNTS, ["A"])).toEqual({
      ...EMPTY_GRADE_COUNTS,
      A: 10,
    });
  });

  it("keeps every selected category's count", () => {
    expect(scopeGradeCounts(FULL_COUNTS, ["A", "Closed"])).toEqual({
      ...EMPTY_GRADE_COUNTS,
      A: 10,
      closed: 4,
    });
  });

  it("maps display labels to their GradeCounts key", () => {
    expect(scopeGradeCounts(FULL_COUNTS, ["Pending", "Uninspected"])).toEqual({
      ...EMPTY_GRADE_COUNTS,
      pending: 3,
      uninspected: 1,
    });
  });

  it("ignores an unrecognized label", () => {
    expect(scopeGradeCounts(FULL_COUNTS, ["Nonsense"])).toEqual(
      EMPTY_GRADE_COUNTS,
    );
  });
});
