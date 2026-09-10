import { describe, expect, it } from "vitest";

import { largestRemainderPercents, formatShare } from "./percentShare";

describe("largestRemainderPercents", () => {
  it("sums to 100", () => {
    for (const values of [
      [1, 1, 1],
      [10, 20, 30, 40],
      [18276, 2876, 1324, 2818, 3317, 140],
      [7, 7, 7, 7, 7, 7, 7],
    ]) {
      const pcts = largestRemainderPercents(values);
      expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it("gives all zeros for an all-zero input", () => {
    expect(largestRemainderPercents([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("routes leftover points to the largest remainders", () => {
    // Raw: 33.33 each -> floors 33,33,33, leftover 1 -> first by frac wins.
    expect(largestRemainderPercents([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("rounds a realistic grade tally with largest-remainder", () => {
    expect(
      largestRemainderPercents([18276, 2876, 1324, 2818, 3317, 140]),
    ).toEqual([64, 10, 5, 10, 11, 0]);
  });
});

describe("formatShare", () => {
  it("shows <1% for a nonzero count that rounds to zero", () => {
    expect(formatShare(0, 140)).toBe("<1%");
  });

  it("shows 0% for a genuinely empty category", () => {
    expect(formatShare(0, 0)).toBe("0%");
  });

  it("shows the plain percentage otherwise", () => {
    expect(formatShare(63, 18276)).toBe("63%");
  });
});
