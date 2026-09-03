// gradeCounts.ts
//
// The per-category tally of restaurants in the current map scope.
// MapView produces it from the visible/in-radius query, the dashboard
// holds it in state, and GradeChart renders it, so the type and the
// zero value live here rather than in any one of those files.

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

// filters.grades holds the display labels ("A", "Pending", ...); map
// them to the GradeCounts keys.
const GRADE_LABEL_TO_KEY: Record<string, keyof GradeCounts> = {
  A: "A",
  B: "B",
  C: "C",
  Pending: "pending",
  Uninspected: "uninspected",
  Closed: "closed",
};

// Restrict a tally to the selected grade categories, zeroing the rest.
// With no grades selected the tally is returned unchanged. Used so the
// grade chart and the mobile area bar reflect the active grade filter
// rather than always showing the full distribution.
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
