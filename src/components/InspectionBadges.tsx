// InspectionBadges.tsx
//
// Renders restaurant grade and score badge pairs with category-based styling 
// and fallbacks for missing values.

import type { CSSProperties } from "react";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";

type InspectionBadgesProps = {
  score: number | null;
  grade: string | null;
  action?: string | null;
  style?: CSSProperties;
};

export default function InspectionBadges({
  score,
  grade,
  action,
  style,
}: InspectionBadgesProps) {
  const category = getGradeCategory(action ?? "", grade, score ?? 0);
  const categoryColor = CATEGORY_COLORS[category];

  return (
    <div className="card-badges" style={style}>
      <div className="badge-box">
        <span className="badge-label">GRADE</span>
        <span className="badge-val" style={{ color: categoryColor }}>
          {grade ?? "N/A"}
        </span>
      </div>

      <div className="badge-box">
        <span className="badge-label">SCORE</span>
        <span className="badge-val" style={{ color: categoryColor }}>
          {score ?? "N/A"}
        </span>
      </div>
    </div>
  );
}