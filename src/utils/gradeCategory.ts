// gradeCategory.ts
//
// Maps raw NYC DOHMH inspection data to the dashboard's display
// categories and re-exports the shared grade colour definitions.

import { CATEGORY_COLORS } from "./gradeColours";
import type { GradeCategory } from "./gradeColours";

export { CATEGORY_COLORS };
export type { GradeCategory };

// Sentinel grade value the pipeline assigns to restaurants that have
// never actually been inspected (every DOHMH record for them is the
// 1900-01-01 placeholder date). Never a real DOHMH grade, so it's safe
// to use as a distinct marker. Mirrored in pipeline/fetch-inspection.mjs
// -- keep both in sync if this ever changes.
export const UNINSPECTED_GRADE = "U";

// DOHMH closure actions take precedence over any letter grade.
const CLOSED_ACTIONS = new Set([
  "Establishment re-closed by DOHMH",
  "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.",
]);

// Returns whether a specific inspection action resulted in a DOHMH closure.
//
// Keeping this check here ensures charts, reports, and grade categorization
// all use the same set of recognized closure actions.
export function isClosedInspection(
  action: string,
): boolean {
  return CLOSED_ACTIONS.has(action);
}

// Normalizes raw inspection data into the dashboard's display categories.
export function getGradeCategory(
  action: string,
  grade: string | null,
  score: number | null,
): GradeCategory {
  if (isClosedInspection(action)) {
    return "closed";
  }

  if (grade === UNINSPECTED_GRADE) {
    return "uninspected";
  }

  if (
    grade === "Z" ||
    grade === "P" ||
    grade === "N"
  ) {
    return "pending";
  }

  // A null score should normally only occur with an administrative grade.
  // Treat unexpected null scores as pending rather than allowing JavaScript
  // to coerce null into zero and incorrectly return Grade A.
  if (score == null) {
    return "pending";
  }

  if (score <= 13) {
    return "A";
  }

  if (score <= 27) {
    return "B";
  }

  return "C";
}