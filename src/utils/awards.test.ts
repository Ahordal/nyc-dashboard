import { describe, expect, it } from "vitest";
import { AWARDS, awardShare, formatAwardDate, heldAwards } from "./awards";

const none = {
  award_first_a: null,
  award_triple_crown: null,
  award_perfect_score: null,
  consistent: 0,
  most_improved: 0,
  featured_date: null,
};

const ids = (held: ReturnType<typeof heldAwards>) => held.map((h) => h.award.id);

describe("heldAwards", () => {
  it("holds nothing without award fields", () => {
    expect(heldAwards(none, "2026-10-09")).toEqual([]);
  });

  it("dates permanent awards and leaves statuses undated, in catalogue order", () => {
    const held = heldAwards(
      { ...none, award_first_a: 20240115, award_triple_crown: 20250301, consistent: 1 },
      "2026-10-09",
    );
    expect(ids(held)).toEqual(["first_a", "consistency", "triple_crown"]);
    expect(held.map((h) => h.since)).toEqual([20240115, null, 20250301]);
  });

  it("keeps Perfect Score, dated, once earned", () => {
    const held = heldAwards({ ...none, award_perfect_score: 20250610 }, null);
    expect(held.map((h) => [h.award.id, h.since])).toEqual([["perfect_score", 20250610]]);
  });

  it("holds Most Improved and Featured only while they're true", () => {
    const restaurant = { ...none, most_improved: 1, featured_date: 20261009 };
    expect(ids(heldAwards(restaurant, "2026-10-09"))).toEqual(["most_improved", "featured"]);
    expect(ids(heldAwards({ ...restaurant, most_improved: 0 }, "2026-10-10"))).toEqual([]);
  });

  it("tolerates map data built before the award fields existed", () => {
    expect(heldAwards({ featured_date: null } as unknown as typeof none, null)).toEqual([]);
  });
});

describe("AWARDS", () => {
  it("has a unique id and icon per award", () => {
    expect(new Set(AWARDS.map((a) => a.id)).size).toBe(AWARDS.length);
    expect(new Set(AWARDS.map((a) => a.icon.iconName)).size).toBe(AWARDS.length);
  });
});

describe("awardShare", () => {
  const counts = { total: 1000, first_a: 740, consistent: 420, triple_crown: 190, perfect_score: 49, most_improved: 0 };

  it("rounds common awards and keeps a decimal under 10%", () => {
    expect(awardShare("first_a", counts)).toBe("74%");
    expect(awardShare("consistency", counts)).toBe("42%");
    expect(awardShare("perfect_score", counts)).toBe("4.9%");
    expect(awardShare("most_improved", counts)).toBe("0.0%");
  });

  it("flags tiny shares instead of rounding them to zero", () => {
    expect(awardShare("perfect_score", { ...counts, total: 100000, perfect_score: 5 })).toBe("<0.1%");
  });

  it("describes Featured by its daily count, and is unknown without counts", () => {
    expect(awardShare("featured", null)).toBe("5 a day");
    expect(awardShare("first_a", null)).toBeNull();
  });
});

describe("formatAwardDate", () => {
  it("formats a YYYYMMDD day", () => {
    expect(formatAwardDate(20230304)).toBe("3/4/2023");
  });
});
