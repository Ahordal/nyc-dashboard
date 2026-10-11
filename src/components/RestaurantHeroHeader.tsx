// RestaurantHeroHeader.tsx
//
// Shared header block: the restaurant name coloured by grade category,
// with its inspection badges and any award icons.

import InspectionBadges from "./InspectionBadges";
import type { Award } from "../utils/awards";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { toTitleCase } from "../utils/toTitleCase";

type RestaurantHeroHeaderProps = {
  name: string;
  score: number | null;
  grade: string | null;
  action?: string | null;
  awards?: readonly Award[];
  onViewCard?: () => void;
};

export default function RestaurantHeroHeader({
  name,
  score,
  grade,
  action,
  awards,
  onViewCard,
}: RestaurantHeroHeaderProps) {
  const category = getGradeCategory(action ?? "", grade, score ?? 0);
  const categoryColor = CATEGORY_COLORS[category];
  const displayName = toTitleCase(name);

  return (
    <div className="details-hero-header">
      <div className="details-hero-main">
        <h3
          className="details-hero-title"
          style={{ color: categoryColor }}
          title={displayName}>
          {displayName}
        </h3>
      </div>

      <div className="details-hero-badges">
        <InspectionBadges score={score} grade={grade} action={action} awards={awards}
          onViewCard={onViewCard}
        />
      </div>
    </div>
  );
}