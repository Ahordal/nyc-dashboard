// gradeCounts.ts
//
// Lives here, not MapView/dashboard/GradeChart, since all three need it.

export type GradeCounts = Record<
  "A" | "B" | "C" | "pending" | "uninspected" | "closed",
  number
>;

export const EMPTY_GRADE_COUNTS: GradeCounts = {
  A: 0,
  B: 0,
  C: 0,
  pending: 0,
  uninspected: 0,
  closed: 0,
};

// Maps display labels ("A", "Pending") to GradeCounts keys.
const GRADE_LABEL_TO_KEY: Record<string, keyof GradeCounts> = {
  A: "A",
  B: "B",
  C: "C",
  Pending: "pending",
  Uninspected: "uninspected",
  Closed: "closed",
};

// Zeroes categories outside `grades` (untouched if none selected). Keeps
// the chart and mobile strip matching the active filter.
export function scopeGradeCounts(
  counts: GradeCounts,
  grades: string[],
): GradeCounts {
  if (grades.length === 0) return counts;

  const selected = new Set(
    grades.map((label) => GRADE_LABEL_TO_KEY[label]).filter(Boolean),
  );

  const scoped = { ...EMPTY_GRADE_COUNTS };
  for (const key of Object.keys(scoped) as (keyof GradeCounts)[]) {
    if (selected.has(key)) scoped[key] = counts[key];
  }
  return scoped;
}
