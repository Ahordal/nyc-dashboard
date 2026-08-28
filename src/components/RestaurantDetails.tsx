// RestaurantDetails.tsx
//
// Overview panel for the selected restaurant: metadata, location, contact
// info, and the inspection-history list. Hovering or focusing a history
// row previews its chart point; activating one opens that inspection's
// full report.

import { useState } from "react";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";
import Badge from "./Badge";
import type { BadgeVariant } from "./Badge";

import type {
  RestaurantProperties,
  InspectionEvent,
} from "../types/restaurant";

import { getGradeCategory, CATEGORY_COLORS, UNINSPECTED_GRADE } from "../utils/gradeCategory";
import { formatPhoneNumber } from "../utils/formatPhoneNumber";
import { toTitleCase } from "../utils/toTitleCase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

function formatDate(raw: string | null): string {
  if (!raw) {
    return "—";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
  });
}

function yearsSince(dateString: string): number {
  const then = new Date(dateString).getTime();

  const now = Date.now();

  return (now - then) / (1000 * 60 * 60 * 24 * 365.25);
}

// Extracts total counts of Critical and Not Critical violations for an inspection event
function getViolationCounts(event: InspectionEvent): {
  critical: number;
  notCritical: number;
} {
  if (!event.violations || event.violations.length === 0) {
    return { critical: 0, notCritical: 0 };
  }

  let critical = 0;
  let notCritical = 0;

  for (const v of event.violations) {
    const flag = v.critical_flag?.toLowerCase();
    if (flag === "critical" || flag === "y") {
      critical += 1;
    } else if (flag === "not critical" || flag === "n") {
      notCritical += 1;
    }
  }

  return { critical, notCritical };
}

// Maps a restaurant's current_status_code to the matching Badge variant,
// falling back to "status-unknown" for any unrecognized code.
function statusVariant(code: string): BadgeVariant {
  if (code === "open" || code === "closed" || code === "unknown") {
    return `status-${code}` as BadgeVariant;
  }

  return "status-unknown";
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed by DOHMH",
  unknown: "Unknown",
};

// Maps a restaurant's location_status to the matching Badge variant.
function locationStatusVariant(status: string): BadgeVariant {
  if (
    status === "verified" ||
    status === "unverified" ||
    status === "pending"
  ) {
    return `location-${status}` as BadgeVariant;
  }

  return "location-pending";
}

const LOCATION_STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  unverified: "Unverified",
  pending: "Pending",
};

const GRADE_PENDING_NOTES: Record<string, string> = {
  Z: "Grade pending official confirmation.",
  P: "Grade pending — reopened after a prior closure.",
  N: "Not yet graded — awaiting re-inspection after an initial visit.",
  [UNINSPECTED_GRADE]:
    "No scored inspection on record — DOHMH has no inspection date for this establishment.",
};

const RESTAURANT_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <ul>
        <li>
          Shows the selected restaurant&apos;s latest grade, score, recorded
          status, location, contact information, and inspection history.
        </li>

        <li>Each Inspection History row represents a separate inspection.</li>
      </ul>
    }
    howToUse={
      <ul>
        <li>
          Hover over or focus an Inspection History row to preview its point on
          the performance chart.
        </li>

        <li>
          Select an Inspection History row to open that inspection&apos;s full
          report.
        </li>

        <li>
          Use the Google Street View link to open available street-level imagery
          in a new tab.
        </li>
      </ul>
    }
    statuses={
      <ul>
        <li>
          <Badge variant="status-open">Open</Badge> — Most recent inspection
          wasn&apos;t a closure.{" "}
          <strong>
            Reflects dataset status, not live business operations.
          </strong>
        </li>

        <li>
          <Badge variant="status-unknown">Unknown</Badge> — No reliable status
          recorded
        </li>

        <li>
          <Badge variant="status-closed">Closed by DOHMH</Badge> — Most recent
          inspection resulted in a closure
        </li>

        <li>
          <Badge variant="location-verified">Verified</Badge> — An independent
          geocoder confirmed this location.
        </li>

        <li>
          <Badge variant="location-unverified">Unverified</Badge> — Geocoding
          ran but couldn&apos;t confirm a match. The coordinate shown falls back
          to DOHMH&apos;s on-file location.
        </li>

        <li>
          <Badge variant="location-pending">Pending</Badge> — Not yet checked by
          the geocoder. The coordinate shown is DOHMH&apos;s on-file location
          for now.
        </li>
      </ul>
    }
    dataNotes={
      <ul>
        <li>
          Google Street View links automatically snap to the nearest available
          street-level imagery for the location. Photos are provided directly by
          Google Maps and may not reflect the restaurant&apos;s current
          storefront, facade, or business operations.
        </li>

        <li>
          Restaurant locations are independently geocoded and checked against
          DOHMH&apos;s on-file address where possible. See the Location badge under
          Geographical Information — Verified, Unverified, or Pending (described
          above).
        </li>
      </ul>
    }
  />
);

type RestaurantDetailsProps = {
  restaurant: RestaurantProperties | null;

  history: InspectionEvent[];

  isLoadingHistory: boolean;

  selectedInspectionId: string | null;

  onSelectInspection: (inspectionId: string) => void;

  onHoverInspection: (inspectionId: string | null) => void;
};

export default function RestaurantDetails({
  restaurant,
  history,
  isLoadingHistory,
  selectedInspectionId,
  onSelectInspection,
  onHoverInspection,
}: RestaurantDetailsProps) {
  const [showInfo, setShowInfo] = useState(false);

  const header = (
    <PanelHeader
      title="Restaurant Details"
      infoContent={RESTAURANT_INFO_CONTENT}
      onInfoClick={() => {
        setShowInfo((currentValue) => !currentValue);
      }}
      isInfoOpen={showInfo}
    />
  );

  if (showInfo) {
    return (
      <section className="panel restaurant-details-panel">
        {header}

        <div className="panel-scroll-content">{RESTAURANT_INFO_CONTENT}</div>
      </section>
    );
  }

  if (!restaurant) {
    return (
      <section className="panel restaurant-details-panel">
        {header}

        <div className="panel-scroll-content">
          <p className="details-empty">
            Select a restaurant on the map to see details.
          </p>
        </div>
      </section>
    );
  }

  const category = getGradeCategory(
    restaurant.action,
    restaurant.grade,
    restaurant.score,
  );

  const categoryColor = CATEGORY_COLORS[category];

  const displayName = toTitleCase(restaurant.name);

  const inspectionAge = yearsSince(restaurant.inspection_date);

  // The 1900-01-01 placeholder DOHMH uses for restaurants with no real
  // inspection on record would otherwise compute as 100+ years stale,
  // implying an inspection that never actually happened.
  const isStale = category !== "uninspected" && inspectionAge >= 2;

  const historyDescending = [...history].reverse();

  return (
    <section className="panel restaurant-details-panel">
      {header}

      <div className="panel-scroll-content">
        <div className="details-hero-header">
          <div className="details-hero-main">
            <div
              className="details-hero-title"
              style={{
                color: categoryColor,
              }}
              title={displayName}>
              {displayName}
            </div>
          </div>

          <div className="details-hero-badges">
            <div className="badge-box">
              <span className="badge-label">GRADE</span>

              <span
                className="badge-val"
                style={{
                  color: categoryColor,
                }}>
                {restaurant.grade === UNINSPECTED_GRADE
                  ? "—"
                  : restaurant.grade ?? "N/A"}
              </span>
            </div>

            <div className="badge-box">
              <span className="badge-label">SCORE</span>

              <span
                className="badge-val"
                style={{
                  color: categoryColor,
                }}>
                {restaurant.grade === UNINSPECTED_GRADE
                  ? "—"
                  : restaurant.score ?? "N/A"}
              </span>
            </div>
          </div>
        </div>

        <h4 className="section-header">Restaurant Information</h4>

        <table className="details-table">
          <tbody>
            <tr>
              <td>CAMIS</td>

              <td>{restaurant.camis}</td>
            </tr>

            <tr>
              <td>Cuisine Description</td>

              <td>{restaurant.cuisine || "—"}</td>
            </tr>

            <tr>
              <td>Status</td>

              <td>
                <div>
                  <Badge variant={statusVariant(restaurant.current_status_code)}>
                    {STATUS_LABELS[restaurant.current_status_code] ??
                      restaurant.current_status_label}
                  </Badge>

                  {isStale && (
                    <div className="status-note-line">
                      <span className="details-stale-note">
                        Last inspected {Math.floor(inspectionAge)}+ years ago
                      </span>
                    </div>
                  )}

                  {restaurant.grade && GRADE_PENDING_NOTES[restaurant.grade] && (
                    <div className="status-note-line">
                      <span className="details-pending-note">
                        {GRADE_PENDING_NOTES[restaurant.grade]}
                      </span>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <h4 className="section-header">Geographical Information</h4>

        <table className="details-table">
          <tbody>
            <tr>
              <td>Borough</td>

              <td>{restaurant.boro}</td>
            </tr>

            <tr>
              <td>Street</td>

              <td>
                {restaurant.display_street || toTitleCase(restaurant.street)}
              </td>
            </tr>

            <tr>
              <td>Building</td>

              <td>{restaurant.building}</td>
            </tr>

            <tr>
              <td>Zipcode</td>

              <td>{restaurant.zipcode}</td>
            </tr>

            <tr>
              <td>Location</td>

              <td>
                <Badge
                  variant={locationStatusVariant(restaurant.location_status)}>
                  {LOCATION_STATUS_LABELS[restaurant.location_status]}
                </Badge>
              </td>
            </tr>

            <tr>
              <td>Phone</td>

              <td>{formatPhoneNumber(restaurant.phone)}</td>
            </tr>

            <tr>
              <td>Google Maps</td>

              <td>
                {restaurant.latitude && restaurant.longitude ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${restaurant.name} ${restaurant.building || ""} ${restaurant.street || ""} ${restaurant.boro || ""}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    View Restaurant{" "}
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="external-link-icon"
                    />
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <h4 className="section-header">Inspection History</h4>

        {isLoadingHistory && (
          <p className="details-loading">Loading inspection history…</p>
        )}

        {!isLoadingHistory && historyDescending.length > 0 && (
          <ul className="inspection-history-list">
            {historyDescending.map((event) => {
              const eventCategory = getGradeCategory(
                event.action,
                event.grade,
                event.score,
              );

              const isSelected = event.id === selectedInspectionId;

              const eventDate = formatDate(event.date);

              const eventGrade = event.grade ?? "N/A";

              const { critical, notCritical } = getViolationCounts(event);

              return (
                <li
                  key={event.id}
                  className={isSelected ? "inspection-row-selected" : ""}
                  style={
                    isSelected
                      ? { outlineColor: CATEGORY_COLORS[eventCategory] }
                      : undefined
                  }
                  role="button"
                  tabIndex={0}
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={[
                    `Open inspection report for ${eventDate}.`,
                    `${critical} Critical, ${notCritical} Not Critical violations.`,
                    `Grade ${eventGrade}.`,
                    `Score ${event.score}.`,
                  ].join(" ")}
                  onMouseEnter={() => {
                    onHoverInspection(event.id);
                  }}
                  onMouseLeave={() => {
                    onHoverInspection(null);
                  }}
                  onFocus={() => {
                    onHoverInspection(event.id);
                  }}
                  onBlur={() => {
                    onHoverInspection(null);
                  }}
                  onClick={() => {
                    onSelectInspection(event.id);
                  }}
                  onKeyDown={(keyboardEvent) => {
                    if (
                      keyboardEvent.key === "Enter" ||
                      keyboardEvent.key === " "
                    ) {
                      keyboardEvent.preventDefault();

                      onSelectInspection(event.id);
                    }
                  }}>
                  {/* 1. Dot */}
                  <span
                    className="inspection-row-dot"
                    style={{
                      backgroundColor: CATEGORY_COLORS[eventCategory],
                    }}
                    aria-hidden="true"
                  />

                  {/* 2. Date */}
                  <span className="inspection-row-date">{eventDate}</span>

                  {/* 3. Badges */}
                  <div className="inspection-violation-counts">
                    {critical === 0 &&
                    notCritical === 0 &&
                    event.score === 0 ? (
                      <span className="violation-slot-full">
                        <Badge variant="status-open">0 Violations</Badge>
                      </span>
                    ) : (
                      <>
                        <span className="violation-slot violation-slot-critical">
                          {critical > 0 && (
                            <span className="violation-count-item">
                              <span className="violation-count-val">
                                {critical}
                              </span>
                              <Badge variant="critical">Critical</Badge>
                            </span>
                          )}
                        </span>

                        <span className="violation-slot violation-slot-not-critical">
                          {notCritical > 0 && (
                            <span className="violation-count-item">
                              <span className="violation-count-val">
                                {notCritical}
                              </span>
                              <Badge variant="not-critical">Not Critical</Badge>
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </div>

                  {/* 4. Grade */}
                  <span
                    className="inspection-row-grade"
                    style={{
                      color: CATEGORY_COLORS[eventCategory],
                    }}>
                    {eventGrade}
                  </span>

                  {/* 5. Score */}
                  <span className="inspection-row-score">{event.score}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}