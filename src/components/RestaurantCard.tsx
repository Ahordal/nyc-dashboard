// RestaurantCard.tsx
//
// One restaurant card for the list view: name, address, cuisine, last
// inspection, optional distance, and inspection badges.

import type { RestaurantProperties } from "../types/restaurant";
import type { SearchRadiusPoint } from "../types/searchRadius";
import InspectionBadges from "./InspectionBadges";
import {
  getGradeCategory,
  CATEGORY_COLORS,
} from "../utils/gradeCategory";
import { haversineDistanceMiles } from "../utils/distance";
import { toTitleCase } from "../utils/toTitleCase";

type RestaurantCardProps = {
  restaurant: RestaurantProperties;
  isSelected: boolean;
  // Driven by hover from the list itself or from a map dot; styled the
  // same as the CSS :hover state.
  isHovered?: boolean;
  onClick: (restaurant: RestaurantProperties) => void;
  onHover?: (restaurant: RestaurantProperties | null) => void;
  // When a Search Radius point is active, the card shows the restaurant's
  // distance from it. Null/undefined hides the Distance line entirely.
  searchRadiusPoint?: SearchRadiusPoint | null;
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
  // that logic here, keeping street-number formatting in exactly one
  // place. Falls back to the raw street name (title-cased) only if
  // display_street is somehow missing, e.g. stale cached data from
  // before this field existed.
  const formattedStreet =
    restaurant.display_street?.trim() ||
    (restaurant.street ? toTitleCase(restaurant.street.trim()) : "");

  const streetParts = [restaurant.building?.trim(), formattedStreet].filter(
    Boolean,
  );
  const street = streetParts.join(" ");

  // boro is already correctly cased by the pipeline (normalizeBoro()),
  // e.g. "Queens", "Staten Island", so it's used as-is, not re-title-cased.
  const boro = restaurant.boro?.trim();

  if (street && boro) return `${street}, ${boro}`;
  return street || boro || "";
}

export default function RestaurantCard({
  restaurant,
  isSelected,
  isHovered = false,
  onClick,
  onHover,
  searchRadiusPoint = null,
}: RestaurantCardProps) {
  const category = getGradeCategory(
    restaurant.action,
    restaurant.grade,
    restaurant.score,
  );
  const categoryColor = CATEGORY_COLORS[category];

  const name = toTitleCase(restaurant.name);
  const address = formatAddress(restaurant);

  const distanceMiles =
    searchRadiusPoint &&
    restaurant.latitude != null &&
    restaurant.longitude != null
      ? haversineDistanceMiles(searchRadiusPoint, {
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
        })
      : null;

  const gradeLabel =
    category === "uninspected"
      ? "not yet inspected"
      : `grade ${restaurant.grade ?? "not assigned"}, score ${
          restaurant.score ?? "not available"
        }`;

  const ariaLabel = [
    name,
    gradeLabel,
    address && `at ${address}`,
    restaurant.cuisine && `${restaurant.cuisine} cuisine`,
    distanceMiles != null && `${distanceMiles.toFixed(2)} miles from centre`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={`restaurant-card ${isSelected ? "selected" : ""} ${
        isHovered ? "hovered" : ""
      }`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-current={isSelected ? "true" : undefined}
      style={
        {
          "--card-grade-color": categoryColor,
          ...(isSelected ? { borderColor: categoryColor } : {}),
        } as React.CSSProperties
      }
      onClick={() => onClick(restaurant)}
      onMouseEnter={() => onHover?.(restaurant)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(restaurant)}
      onBlur={() => onHover?.(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(restaurant);
        }
      }}>
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
          {category === "uninspected"
            ? "Not yet inspected"
            : formatDate(restaurant.inspection_date)}
        </div>
        {distanceMiles != null && (
          <div className="card-meta">
            <span className="card-meta-label">Distance:</span>{" "}
            {distanceMiles.toFixed(2)} mi
          </div>
        )}
      </div>

      <InspectionBadges
        score={restaurant.score}
        grade={restaurant.grade}
        action={restaurant.action}
      />
    </div>
  );
}