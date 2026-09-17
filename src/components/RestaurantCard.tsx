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
import {
  haversineDistanceMiles,
  formatApproxMiles,
  formatApproxMilesSpoken,
} from "../utils/distance";
import { toTitleCase } from "../utils/toTitleCase";

type RestaurantCardProps = {
  restaurant: RestaurantProperties;
  isSelected: boolean;
  // Driven by hover from the list itself or from a map dot; styled the
  // same as the CSS :hover state.
  isHovered?: boolean;
  onClick: (restaurant: RestaurantProperties) => void;
  onHover?: (restaurant: RestaurantProperties | null) => void;
  // Distance origin: Search Radius centre or the locate dot.
  // Null/undefined hides the Distance line.
  distanceOrigin?: SearchRadiusPoint | null;
};

// Local formatting helpers
function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function formatAddress(restaurant: RestaurantProperties): string {
  // Uses the pipeline's display_street ("5th Street", not "5 Street") to
  // keep formatting in one place. Falls back to the raw name (title-cased) only if missing.
  const formattedStreet =
    restaurant.display_street?.trim() ||
    (restaurant.street ? toTitleCase(restaurant.street.trim()) : "");

  const streetParts = [restaurant.building?.trim(), formattedStreet].filter(
    Boolean,
  );
  const street = streetParts.join(" ");

  // boro is already correctly cased by the pipeline (normalizeBoro()) —
  // used as-is, not re-title-cased.
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
  distanceOrigin = null,
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
    distanceOrigin &&
    restaurant.latitude != null &&
    restaurant.longitude != null
      ? haversineDistanceMiles(distanceOrigin, {
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
    distanceMiles != null && `${formatApproxMilesSpoken(distanceMiles)} away`,
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
            {formatApproxMiles(distanceMiles)}
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