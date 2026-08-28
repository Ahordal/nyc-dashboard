// gradeCounts.ts
//
// The per-category tally of restaurants in the current map scope.
// MapView produces it from the visible/in-radius query, the dashboard
// holds it in state, and GradeChart renders it, so the type and the
// zero value live here rather than in any one of those files.

export type GradeCounts = Record<
  "A" | "B" | "C" | "pending" | "uninspected" | "closed",
  number
>;

export const EMPTY_GRADE_COUNTS: GradeCounts = {
  A: 0,
  B: 0,
  C: 0,
  pending: 0,
  uninspected: 0,
  closed: 0,
};
