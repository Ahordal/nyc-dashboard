// restaurantStats.ts
//
// Per-restaurant figures for the Awards & Statistics modal, from its
// inspection history (oldest first, as useInspectionHistory returns it).

import type { InspectionEvent } from "../types/restaurant";
import { getGradeCategory, type GradeCategory } from "./gradeCategory";

const LETTER_GRADES = new Set(["A", "B", "C"]);

// One inspection's outcome: its grade as DOHMH reported it (a letter, or a
// code like N; null if blank), score, and the category that colours it.
export type InspectionOutcome = {
  grade: string | null;
  score: number;
  category: GradeCategory;
};

export type RestaurantStats = {
  inspections: number;
  // Lowest and highest scoring inspections (lower is better); null when
  // nothing on record was scored.
  best: InspectionOutcome | null;
  worst: InspectionOutcome | null;
  // Consecutive As counting back from the latest letter grade.
  aStreak: number;
};

export function restaurantStats(history: readonly InspectionEvent[]): RestaurantStats {
  const scored = history.flatMap((event) => {
    if (event.score == null) return [];
    const letter = event.grade && LETTER_GRADES.has(event.grade) ? event.grade : null;
    // Letter grade or not, the score's own band colours it; closures stay closed.
    return [
      {
        grade: event.grade || null,
        score: event.score,
        category: getGradeCategory(event.action, letter, event.score),
      },
    ];
  });
  // Ties go to the latest inspection: the most current example.
  const pick = (better: (a: number, b: number) => boolean) =>
    scored.reduce<InspectionOutcome | null>(
      (kept, outcome) => (kept && better(kept.score, outcome.score) ? kept : outcome),
      null,
    );

  let aStreak = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const grade = history[i].grade;
    // Pending and administrative grades neither extend nor break a streak.
    if (!grade || !LETTER_GRADES.has(grade)) continue;
    if (grade !== "A") break;
    aStreak += 1;
  }

  return {
    inspections: history.length,
    best: pick((kept, next) => kept < next),
    worst: pick((kept, next) => kept > next),
    aStreak,
  };
}
