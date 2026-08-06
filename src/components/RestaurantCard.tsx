// RestaurantCard.tsx
// Renders an individual restaurant card for the list view, including its name, address, and badges.

import type { RestaurantProperties } from "../types/restaurant";
import InspectionBadges from "./InspectionBadges";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { toTitleCase } from "../utils/toTitleCase";

type RestaurantCardProps = {
  restaurant: RestaurantProperties;
  isSelected: boolean;
  onClick: (restaurant: RestaurantProperties) => void;
};

// Local formatting helpers
function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function formatAddress(restaurant: RestaurantProperties): string {
  const parts = [restaurant.building, restaurant.street]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length > 0 ? toTitleCase(parts.join(" ")) : "";
}

export default function RestaurantCard({
  restaurant,
  isSelected,
  onClick,
}: RestaurantCardProps) {
  const category = getGradeCategory(
    restaurant.action,
    restaurant.grade,
    restaurant.score,
  );
  const categoryColor = CATEGORY_COLORS[category];
  
  const name = toTitleCase(restaurant.name);
  const address = formatAddress(restaurant);

  return (
    <div
      className={`restaurant-card ${isSelected ? "selected" : ""}`}
      style={
        {
          "--card-grade-color": categoryColor,
          ...(isSelected ? { borderColor: categoryColor } : {}),
        } as React.CSSProperties
      }
      onClick={() => onClick(restaurant)}>
      <div className="card-main">
        <div className="card-title" style={{ color: categoryColor }} title={name}>
          {name}
        </div>
        {address && <div className="card-subtext">{address}</div>}
        {restaurant.cuisine && (
          <div className="card-meta">
            <span className="card-meta-label">Cuisine:</span> {restaurant.cuisine}
          </div>
        )}
        <div className="card-meta">
          <span className="card-meta-label">Inspected:</span>{" "}
          {formatDate(restaurant.inspection_date)}
        </div>
      </div>

      <InspectionBadges
        score={restaurant.score}
        grade={restaurant.grade}
        action={restaurant.action}
      />
    </div>
  );
}