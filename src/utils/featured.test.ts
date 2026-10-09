import { describe, expect, it } from "vitest";
import {
  dealtDate,
  earningInspectionId,
  hasFeaturedCertificate,
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

describe("hasFeaturedCertificate", () => {
  const open = "Violations were cited in the following area(s).";
  const closed = "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.";
  const featured = { featured_date: 20261009, action: open, grade: "A", score: 9 };

  it("keeps the certificate while the latest inspection is an A", () => {
    expect(hasFeaturedCertificate(featured)).toBe(true);
  });

  it("drops it after a lower grade or a closure", () => {
    expect(hasFeaturedCertificate({ ...featured, grade: "B", score: 20 })).toBe(false);
    expect(hasFeaturedCertificate({ ...featured, action: closed })).toBe(false);
  });

  it("never shows for a restaurant that wasn't featured", () => {
    expect(hasFeaturedCertificate({ ...featured, featured_date: null })).toBe(false);
  });
});
