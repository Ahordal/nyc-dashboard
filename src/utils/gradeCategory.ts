// gradeCategory.ts
//
// Maps raw DOHMH inspection data to display categories; re-exports the shared grade colours.

import { CATEGORY_COLORS } from "./gradeColours";
import type { GradeCategory } from "./gradeColours";
import {
  CLOSED_ACTIONS as CLOSED_ACTIONS_LIST,
  UNINSPECTED_GRADE,
} from "../../shared/inspectionStatus.mjs";

export { CATEGORY_COLORS };
export type { GradeCategory };

export { UNINSPECTED_GRADE };

// Closure beats any letter grade. From shared/inspectionStatus.mjs — same
// module the pipeline imports — as a Set so mapQueries.ts can build SQL from it.
export const CLOSED_ACTIONS = new Set(CLOSED_ACTIONS_LIST);

// Shared by charts, reports, and categorization, so they agree on closures.
export function isClosedInspection(
  action: string,
): boolean {
  return CLOSED_ACTIONS.has(action);
}

// Single source of truth for category precedence. CATEGORY_CLAUSES
// mirrors it in SQL; MapView.tsx calls this instead of a third copy.
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

  // Treat a null score as pending rather than coercing it to zero (Grade A).
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