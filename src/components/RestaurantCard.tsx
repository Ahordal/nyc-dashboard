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
  // Uses the pipeline's pre-formatted display_street (ordinal suffixes,
  // e.g. "5th Street" instead of "5 Street") rather than reconstructing
  // that logic here -- keeps street-number formatting correct in exactly
  // one place. Falls back to the raw street name (title-cased) only if
  // display_street is somehow missing, e.g. stale cached data from
  // before this field existed.
  const formattedStreet =
    restaurant.display_street?.trim() ||
    (restaurant.street ? toTitleCase(restaurant.street.trim()) : "");

  const streetParts = [restaurant.building?.trim(), formattedStreet].filter(
    Boolean,
  );
  const street = streetParts.join(" ");

  // boro is already correctly cased by the pipeline (normalizeBoro()) --
  // "Queens", "Staten Island", etc. -- so it's used as-is, not re-title-cased.
  const boro = restaurant.boro?.trim();

  if (street && boro) return `${street}, ${boro}`;
  return street || boro || "";
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