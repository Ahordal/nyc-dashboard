// InspectionBadges.tsx
//
// Renders the grade and score badge pair with category-based colour and
// fallbacks for missing values, plus a box of award icons when given any.
// With onViewCard (Details) a last box, the gold award icon, opens the
// Awards & Statistics modal.

import type { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAward } from "@fortawesome/free-solid-svg-icons";
import type { Award } from "../utils/awards";
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
  // Restaurant boxes pass current statuses; inspection boxes, that inspection's awards.
  awards?: readonly Award[];
  onViewCard?: () => void;
};

const awardButtonIcon = <FontAwesomeIcon icon={faAward} className="badge-icon" aria-hidden="true" />;

export default function InspectionBadges({
  score,
  grade,
  action,
  style,
  awards = [],
  onViewCard,
}: InspectionBadgesProps) {
  const category = getGradeCategory(action ?? "", grade, score);
  const categoryColor = CATEGORY_COLORS[category];
  const isUninspected = grade === UNINSPECTED_GRADE;
  const boxBorder = { borderColor: `color-mix(in srgb, ${categoryColor} 80%, transparent)` };
  // Catalogue order runs common to rare, so the border takes the rarest award's colour.
  const rarest = awards[awards.length - 1];

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

      {rarest && (
        <span
          className="badge-box badge-box-awards"
          style={{ borderColor: `color-mix(in srgb, ${rarest.color} 80%, transparent)` }}
          role="img"
          aria-label={`Awards: ${awards.map((a) => a.name).join(", ")}`}>
          {awards.map((a) => (
            <span key={a.id} className="badge-award tooltip-bottom" data-tooltip={a.name}>
              <FontAwesomeIcon
                icon={a.icon}
                className="badge-icon"
                style={{ color: a.color }}
                aria-hidden="true"
              />
            </span>
          ))}
        </span>
      )}

      {onViewCard && (
        <button
          type="button"
          className="badge-box badge-box-button tooltip-bottom"
          onClick={onViewCard}
          aria-label="View awards"
          data-tooltip="View awards">
          {awardButtonIcon}
        </button>
      )}
    </div>
  );
}
