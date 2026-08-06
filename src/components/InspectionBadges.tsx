// InspectionBadges.tsx

import type { CSSProperties } from "react";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";

type InspectionBadgesProps = {
  score: number | null; // <-- FIXED: Now accepts null
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
  // Coerce score to 0 for the category math if it happens to be null
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
          {score ?? "N/A"} {/* FIXED: Renders N/A if no score exists */}
        </span>
      </div>
    </div>
  );
}