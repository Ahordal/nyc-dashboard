// filterNotice.ts
//
// Decides which segments the RestaurantList's filter-change notice shows
// ("Grade: A, Borough: Manhattan, ...") and in what order. Pure so the
// gating/ordering is unit-tested; dashboard.tsx only maps parts to spans
// and drops a separator between them.

export type FilterNoticePart =
  | { kind: "grades"; grades: string[] }
  | { kind: "boroughs"; boroughs: string[] }
  | { kind: "search"; query: string }
  | { kind: "radius" }
  | { kind: "all" };

export type FilterNoticeInput = {
  grades: string[];
  boroughs: string[];
  searchQuery: string;
  hasSearchRadius: boolean;
};

export function getFilterNoticeParts({
  grades,
  boroughs,
  searchQuery,
  hasSearchRadius,
}: FilterNoticeInput): FilterNoticePart[] {
  const parts: FilterNoticePart[] = [];

  if (grades.length > 0) {
    parts.push({ kind: "grades", grades });
  }
  if (boroughs.length > 0) {
    parts.push({ kind: "boroughs", boroughs });
  }
  if (searchQuery) {
    parts.push({ kind: "search", query: searchQuery });
  }
  if (hasSearchRadius) {
    parts.push({ kind: "radius" });
  }

  if (parts.length === 0) {
    parts.push({ kind: "all" });
  }

  return parts;
}
