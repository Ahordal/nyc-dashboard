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
// from shared/inspectionStatus.mjs, the same plain-JS module the Node
// pipeline (fetch-inspection.mjs) imports directly, rather than being
// hand-copied here. Exported as a Set so mapQueries.ts can build its
// "closed" SQL clause from it.
export const CLOSED_ACTIONS = new Set(CLOSED_ACTIONS_LIST);

// Whether an inspection action resulted in a DOHMH closure. Kept here so
// charts, reports, and grade categorization share one closure-action set.
export function isClosedInspection(
  action: string,
): boolean {
  return CLOSED_ACTIONS.has(action);
}

// Normalizes raw inspection data into the dashboard's display categories.
// Single source of truth for this precedence: CATEGORY_CLAUSES in
// mapQueries.ts mirrors it in SQL (via the shared CLOSED_ACTIONS and
// UNINSPECTED_GRADE above), and MapView.tsx's reportVisibleRestaurants
// calls this function directly rather than re-implementing it a third time.
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

  // A null score normally only occurs with an administrative grade. Treat
  // unexpected nulls as pending, so null isn't coerced to zero and
  // wrongly returned as Grade A.
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