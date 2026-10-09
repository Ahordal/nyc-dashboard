// InspectionBadges.tsx
//
// Renders the grade and score badge pair with category-based colour and
// fallbacks for missing values, plus the gold Featured star when featured today.
// With onViewCard (Details) a third box, the gold award icon, opens the
// restaurant's card.

import type { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAward, faStar } from "@fortawesome/free-solid-svg-icons";
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
  // Featured today: the gold star box (Restaurant List, hover card).
  featured?: boolean;
  onViewCard?: () => void;
};

const featuredStar = <FontAwesomeIcon icon={faStar} className="badge-icon" aria-hidden="true" />;
const award = <FontAwesomeIcon icon={faAward} className="badge-icon" aria-hidden="true" />;

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

      {onViewCard ? (
        <button
          type="button"
          className={`badge-box badge-box-button tooltip-bottom${featured ? " badge-box-featured" : ""}`}
          onClick={onViewCard}
          aria-label={featured ? "View awards, featured today" : "View awards"}
          data-tooltip="View awards">
          {award}
        </button>
      ) : (
        featured && (
          <span className="badge-box badge-box-featured" role="img" aria-label="Featured restaurant">
            {featuredStar}
          </span>
        )
      )}
    </div>
  );
}
