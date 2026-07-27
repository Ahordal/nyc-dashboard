// utils/gradeCategory.ts
const CLOSED_ACTIONS = new Set([
  "Establishment re-closed by DOHMH",
  "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.",
]);

export type GradeCategory = "A" | "B" | "C" | "pending" | "closed";

export const CATEGORY_COLORS: Record<GradeCategory, string> = {
  A: "#2E7BE4",
  B: "#3CB44B",
  C: "#F58231",
  pending: "#E6007E",
  closed: "#8B0000",
};

// Derived from {action, grade, score} directly, rather than relying on a
// precomputed current_status field -- that field only exists on the
// "latest" map feature, not on individual historical inspection events,
// so this works consistently for both.
export function getGradeCategory(action: string, grade: string | null, score: number): GradeCategory {
  if (CLOSED_ACTIONS.has(action)) return "closed";
  if (grade === "Z" || grade === "P") return "pending";
  if (score <= 13) return "A";
  if (score <= 27) return "B";
  return "C";
}