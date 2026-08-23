// gradeCategory.ts
//
// Maps raw NYC DOHMH inspection data to the dashboard's display
// categories and re-exports the shared grade colour definitions.

import { CATEGORY_COLORS } from "./gradeColours";
import type { GradeCategory } from "./gradeColours";
import {
  CLOSED_ACTIONS as CLOSED_ACTIONS_LIST,
  UNINSPECTED_GRADE,
} from "../../shared/inspectionStatus.mjs";

export { CATEGORY_COLORS };
export type { GradeCategory };

export { UNINSPECTED_GRADE };

// DOHMH closure actions take precedence over any letter grade. Sourced
// from shared/inspectionStatus.mjs. The same plain-JS module the Node
// pipeline (pipeline/fetch-inspection.mjs) imports directly,  rather than
// hand-copied here a second time. Exported as a Set (rather than the
// shared module's array) so mapQueries.ts's SQL clause generator can
// build its "closed" clause from it.
export const CLOSED_ACTIONS = new Set(CLOSED_ACTIONS_LIST);

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
// Single source of truth for this logic -- CATEGORY_CLAUSES in
// mapQueries.ts builds SQL that mirrors this function's precedence exactly
// (via the shared CLOSED_ACTIONS/UNINSPECTED_GRADE above), and MapView.tsx's
// reportVisibleRestaurants calls this function directly rather than
// re-implementing it a third time.
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