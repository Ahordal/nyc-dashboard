// gradeCategory.ts
//
// Maps raw NYC DOHMH inspection data to the dashboard's display
// categories and re-exports the shared grade color definitions.

import { CATEGORY_COLORS } from "./gradeColours";
import type { GradeCategory } from "./gradeColours";

export { CATEGORY_COLORS };
export type { GradeCategory };

// DOHMH closure actions take precedence over any letter grade.

const CLOSED_ACTIONS = new Set([
  "Establishment re-closed by DOHMH",
  "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.",
]);

// Normalizes raw inspection data into the dashboard's display categories.

export function getGradeCategory(action: string, grade: string | null, score: number): GradeCategory {
  if (CLOSED_ACTIONS.has(action)) return "closed";
  if (grade === "Z" || grade === "P" || grade === "N") return "pending";
  if (score <= 13) return "A";
  if (score <= 27) return "B";
  return "C";
}