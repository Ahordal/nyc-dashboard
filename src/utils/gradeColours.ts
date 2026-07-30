// utils/gradeColors.ts
//
// Single source for all grade/status colors used throughout the
// dashboard, avoiding duplicated colour definitions.

export type GradeCategory = "A" | "B" | "C" | "pending" | "closed";

export const CATEGORY_COLORS: Record<GradeCategory, string> = {
  A: "#2E7BE4",
  B: "#3CB44B",
  C: "#F58231",
  pending: "#E6007E",
  closed: "#8B0000",
};