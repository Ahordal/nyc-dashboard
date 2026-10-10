import { describe, expect, it } from "vitest";

import type { InspectionEvent } from "../types/restaurant";
import { CLOSED_ACTIONS } from "./gradeCategory";
import { restaurantStats } from "./restaurantStats";

const event = (score: number | null, grade: string | null, action = ""): InspectionEvent => ({
  id: `${score}-${grade}`,
  date: "2025-01-01",
  score,
  grade,
  inspection_type: "",
  action,
  violations: [],
});

describe("restaurantStats", () => {
  it("is empty without history", () => {
    expect(restaurantStats([])).toEqual({ inspections: 0, best: null, worst: null, aStreak: 0 });
  });

  it("finds best and worst among scored inspections only, with their grades", () => {
    const stats = restaurantStats([event(21, "B"), event(null, null), event(2, "A")]);
    expect(stats.inspections).toBe(3);
    expect(stats.best).toEqual({ grade: "A", score: 2, category: "A" });
    expect(stats.worst).toEqual({ grade: "B", score: 21, category: "B" });
  });

  it("colours an ungraded score by its band, and keeps the latest of a tie", () => {
    const stats = restaurantStats([event(9, "A"), event(9, null), event(30, "N")]);
    expect(stats.best).toEqual({ grade: null, score: 9, category: "A" });
    expect(stats.worst).toEqual({ grade: "N", score: 30, category: "C" });
  });

  it("keeps a closure's colour", () => {
    const [closed] = CLOSED_ACTIONS;
    expect(restaurantStats([event(45, null, closed)]).worst?.category).toBe("closed");
  });

  it("counts the A streak back from the latest letter grade, skipping non-letters", () => {
    const history = [event(30, "C"), event(9, "A"), event(12, "N"), event(5, "A"), event(null, "Z")];
    expect(restaurantStats(history).aStreak).toBe(2);
  });

  it("has no streak when the latest letter grade isn't an A", () => {
    expect(restaurantStats([event(5, "A"), event(18, "B")]).aStreak).toBe(0);
  });
});
