// gradeColours.ts
//
// Single source for the grade/status colours used across the dashboard.

export type GradeCategory =
  | "A"
  | "B"
  | "C"
  | "pending"
  | "closed"
  | "uninspected";

export const CATEGORY_COLORS: Record<GradeCategory, string> = {
  A: "#2E7BE4",
  B: "#3CB44B",
  C: "#F58231",
  pending: "#E6007E",
  closed: "#8B0000",
  uninspected: "#959595",
};