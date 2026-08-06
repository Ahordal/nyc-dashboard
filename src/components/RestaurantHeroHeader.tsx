// RestaurantHeroHeader.tsx
// Shared header block displaying the restaurant name and its corresponding inspection badges.

import InspectionBadges from "./InspectionBadges";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { toTitleCase } from "../utils/toTitleCase";

type RestaurantHeroHeaderProps = {
  name: string;
  score: number | null;
  grade: string | null;
  action?: string | null;
};

export default function RestaurantHeroHeader({
  name,
  score,
  grade,
  action,
}: RestaurantHeroHeaderProps) {
  // Determine the color based on the provided score/grade/action
  const category = getGradeCategory(action ?? "", grade, score ?? 0);
  const categoryColor = CATEGORY_COLORS[category];
  const displayName = toTitleCase(name);

  return (
    <div className="details-hero-header">
      <div className="details-hero-main">
        <div
          className="details-hero-title"
          style={{ color: categoryColor }}
          title={displayName}>
          {displayName}
        </div>
      </div>

      <div className="details-hero-badges">
        <InspectionBadges score={score} grade={grade} action={action} />
      </div>
    </div>
  );
}