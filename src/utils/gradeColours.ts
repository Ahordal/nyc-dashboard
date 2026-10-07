// gradeColours.ts
//
// Grade/status colours used across the dashboard. Values live in
// shared/gradeColours.mjs so the pipeline's featured card uses the same ones.

import { CATEGORY_COLORS as SHARED_CATEGORY_COLORS } from "../../shared/gradeColours.mjs";

export type GradeCategory =
  | "A"
  | "B"
  | "C"
  | "pending"
  | "closed"
  | "uninspected";

export const CATEGORY_COLORS: Record<GradeCategory, string> =
  SHARED_CATEGORY_COLORS;
