// gradeColours.mjs
//
// Single source of truth for the grade/status colours. Shared between the
// frontend (src/utils/gradeColours.ts re-exports it) and the pipeline
// (pipeline/generate-featured-card.mjs).

export const CATEGORY_COLORS = {
  A: "#2E7BE4",
  B: "#3CB44B",
  C: "#F58231",
  pending: "#E6007E",
  closed: "#B81D13",
  uninspected: "#959595",
};
