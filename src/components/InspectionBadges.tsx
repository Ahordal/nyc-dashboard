// InspectionBadges.tsx
//
// Renders the grade and score badge pair with category-based colour and
// fallbacks for missing values, plus the gold certificate when featured.

import type { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCertificate } from "@fortawesome/free-solid-svg-icons";
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
  // Adds the gold certificate box; a button only where onViewCard is given.
  featured?: boolean;
  onViewCard?: () => void;
};

const certificate = <FontAwesomeIcon icon={faCertificate} className="badge-icon" aria-hidden="true" />;

export default function InspectionBadges({
  score,
  grade,
  action,
  style,
  featured = false,
  onViewCard,
}: InspectionBadgesProps) {
  const category = getGradeCategory(action ?? "", grade, score);
  const categoryColor = CATEGORY_COLORS[category];
  const isUninspected = grade === UNINSPECTED_GRADE;
  const boxBorder = { borderColor: `color-mix(in srgb, ${categoryColor} 80%, transparent)` };

  return (
    <div className="card-badges" style={style}>
      <div className="badge-box" style={boxBorder}>
        <span className="badge-label">GRADE</span>
        <span className="badge-val" style={{ color: categoryColor }}>
          {isUninspected ? "—" : grade ?? "N/A"}
        </span>
      </div>

      <div className="badge-box" style={boxBorder}>
        <span className="badge-label">SCORE</span>
        <span className="badge-val" style={{ color: categoryColor }}>
          {isUninspected ? "—" : score ?? "N/A"}
        </span>
      </div>

      {featured &&
        (onViewCard ? (
          <button
            type="button"
            className="badge-box badge-box-featured badge-box-button tooltip-bottom"
            onClick={onViewCard}
            aria-label="View Featured Award"
            data-tooltip="View award">
            {certificate}
          </button>
        ) : (
          <span className="badge-box badge-box-featured" role="img" aria-label="Featured restaurant">
            {certificate}
          </span>
        ))}
    </div>
  );
}
