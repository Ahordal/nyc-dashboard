import { describe, expect, it } from "vitest";
import {
  dealtDate,
  earningInspectionId,
  featuredDayNumber,
  isFeaturedToday,
  indexFeaturedByCamis,
  latestFeaturedDate,
} from "./featured";
import type { FeaturedCard } from "../types/featured";

const card = (camis: string): FeaturedCard => ({
  camis,
  name: `PLACE ${camis}`,
  boro: "Bronx",
  neighbourhood: null,
  cuisine: "Bakery Products/Desserts",
  grade: "A",
  score: 7,
  inspectionDate: "2026-02-27T00:00:00.000",
  posts: [],
});

describe("indexFeaturedByCamis", () => {
  it("indexes every dealt card with its hand's date", () => {
    const index = indexFeaturedByCamis({
      version: 1,
      hands: [
        { date: "2026-10-07", cards: [card("1"), card("2")] },
        { date: "2026-10-08", cards: [card("3")] },
      ],
    });
    expect(index.size).toBe(3);
    expect(index.get("3")).toEqual({ card: card("3"), date: "2026-10-08" });
  });

  it("keeps the latest card if a restaurant appears twice", () => {
    const index = indexFeaturedByCamis({
      version: 1,
      hands: [
        { date: "2026-10-08", cards: [card("1")] },
        { date: "2026-10-07", cards: [card("1")] },
      ],
    });
    expect(index.get("1")?.date).toBe("2026-10-08");
  });

  it("tolerates a file with no hands", () => {
    expect(indexFeaturedByCamis({ version: 1, hands: [] }).size).toBe(0);
  });
});

describe("latestFeaturedDate", () => {
  it("returns the newest hand's date regardless of order", () => {
    const data = {
      version: 1,
      hands: [
        { date: "2026-10-09", cards: [] },
        { date: "2026-10-07", cards: [] },
      ],
    };
    expect(latestFeaturedDate(data)).toBe("2026-10-09");
  });

  it("is null before anything has been dealt", () => {
    expect(latestFeaturedDate({ version: 1, hands: [] })).toBeNull();
  });
});

describe("earningInspectionId", () => {
  it("matches the history id of the inspection the card was based on", () => {
    expect(earningInspectionId(card("50141796"))).toBe("50141796-2026-02-27");
  });
});

describe("dealtDate", () => {
  it("stays on the dealt day in New York", () => {
    const formatted = dealtDate("2026-10-07").toLocaleDateString("en-US", {
      timeZone: "America/New_York",
    });
    expect(formatted).toBe("10/7/2026");
  });
});

describe("featuredDayNumber", () => {
  it("turns a hand date into the YYYYMMDD number on the map data", () => {
    expect(featuredDayNumber("2026-10-09")).toBe(20261009);
  });

  it("returns null for a missing or malformed date", () => {
    expect(featuredDayNumber(null)).toBeNull();
    expect(featuredDayNumber("")).toBeNull();
    expect(featuredDayNumber("not a date")).toBeNull();
  });
});

describe("isFeaturedToday", () => {
  it("holds only for restaurants in the latest hand", () => {
    expect(isFeaturedToday({ featured_date: 20261009 }, "2026-10-09")).toBe(true);
    expect(isFeaturedToday({ featured_date: 20261008 }, "2026-10-09")).toBe(false);
  });

  it("never holds without a featured date or a hand", () => {
    expect(isFeaturedToday({ featured_date: null }, "2026-10-09")).toBe(false);
    expect(isFeaturedToday({ featured_date: 20261009 }, null)).toBe(false);
  });
});
