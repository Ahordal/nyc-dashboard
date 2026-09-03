// InspectionBadges.tsx
//
// Renders the grade and score badge pair with category-based colour and
// fallbacks for missing values.

import type { CSSProperties } from "react";
import {
  getGradeCategory,
  CATEGORY_COLORS,
  UNINSPECTED_GRADE,
} from "../utils/gradeCategory";

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
  const isUninspected = grade === UNINSPECTED_GRADE;

  return (
    <div className="card-badges" style={style}>
      <div
        className="badge-box"
        style={{
          borderColor: `color-mix(in srgb, ${categoryColor} 80%, transparent)`,
        }}>
        <span className="badge-label">GRADE</span>
        <span className="badge-val" style={{ color: categoryColor }}>
          {isUninspected ? "—" : grade ?? "N/A"}
        </span>
      </div>

      <div
        className="badge-box"
        style={{
          borderColor: `color-mix(in srgb, ${categoryColor} 80%, transparent)`,
        }}>
        <span className="badge-label">SCORE</span>
        <span className="badge-val" style={{ color: categoryColor }}>
          {isUninspected ? "—" : score ?? "N/A"}
        </span>
      </div>
    </div>
  );
}