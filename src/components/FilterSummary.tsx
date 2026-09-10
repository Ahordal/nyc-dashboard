// FilterSummary.tsx
//
// Static "Filters applied: Grade: A, B · Borough: …" line — the same
// summary the desktop RestaurantList flashes as an overlay when filters
// change, rendered here as plain (colour-coded) text so a mobile user
// gets confirmation their selection took effect. Lives in the grade
// breakdown drawer, under the KPI row.

import { Fragment } from "react";

import { getFilterNoticeParts } from "../utils/filterNotice";
import { CATEGORY_COLORS } from "../utils/gradeCategory";
import type { Filters } from "../types/filters";

// Grade-filter labels -> their category colour (boroughs stay muted),
// matching the desktop filter-change notice.
const GRADE_LABEL_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Uninspected: CATEGORY_COLORS.uninspected,
  Closed: CATEGORY_COLORS.closed,
};

export default function FilterSummary({ filters }: { filters: Filters }) {
  const parts = getFilterNoticeParts({
    grades: filters.grades,
    boroughs: filters.boroughs,
    searchQuery: "",
    hasSearchRadius: false,
  });

  return (
    <p className="mobile-filter-notice" aria-live="polite">
      <span className="mobile-filter-notice-lead">Filters applied:</span>{" "}
      {parts.map((part, index) => (
        <Fragment key={part.kind}>
          {index > 0 && " · "}
          {part.kind === "grades" && (
            <>
              <span className="mobile-filter-notice-label">Grade:</span>{" "}
              {part.grades.map((grade, gradeIndex) => (
                <Fragment key={grade}>
                  {gradeIndex > 0 && ", "}
                  <span style={{ color: GRADE_LABEL_COLORS[grade] }}>
                    {grade}
                  </span>
                </Fragment>
              ))}
            </>
          )}
          {part.kind === "boroughs" && (
            <>
              <span className="mobile-filter-notice-label">Borough:</span>{" "}
              <span className="mobile-filter-notice-borough">
                {part.boroughs.join(", ")}
              </span>
            </>
          )}
          {part.kind === "all" && <>All Restaurants</>}
        </Fragment>
      ))}
    </p>
  );
}
