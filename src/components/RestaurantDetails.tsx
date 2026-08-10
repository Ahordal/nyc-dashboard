// RestaurantDetails.tsx
//
// Displays overview information for the currently selected restaurant.
//
// Shows restaurant metadata, geographical information, and the inspection
// history list. Hovering or focusing a history row previews its chart point.
// Activating a row opens that inspection's full report.

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";

import { GradeRangeInfo, NYCHealthResources } from "./InfoPopupSharedContent";

import type {
  RestaurantProperties,
  InspectionEvent,
} from "../types/restaurant";

import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";

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

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed by DOHMH",
  unknown: "Unknown",
};

const GRADE_PENDING_NOTES: Record<string, string> = {
  Z: "Grade pending official confirmation.",
  P: "Grade pending — reopened after a prior closure.",
  N: "Not yet graded — awaiting re-inspection after an initial visit.",
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
    grades={<GradeRangeInfo />}
    statuses={
      <ul>
        <li>
          <span className="violation-tag status-open">Open</span> — Most recent
          inspection wasn&apos;t a closure.{" "}
          <strong>
            Reflects dataset status, not live business operations.
          </strong>
        </li>

        <li>
          <span className="violation-tag status-unknown">Unknown</span> — No
          reliable status recorded
        </li>

        <li>
          <span className="violation-tag status-closed">Closed by DOHMH</span> —
          Most recent inspection resulted in a closure
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
      </ul>
    }
    resources={<NYCHealthResources />}
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
  if (!restaurant) {
    return (
      <section className="panel restaurant-details-panel">
        <PanelHeader
          title="Restaurant Details"
          infoContent={RESTAURANT_INFO_CONTENT}
        />

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

  const isStale = inspectionAge >= 2;

  const historyDescending = [...history].reverse();

  return (
    <section className="panel restaurant-details-panel">
      <PanelHeader
        title="Restaurant Details"
        infoContent={RESTAURANT_INFO_CONTENT}
      />

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
                {restaurant.grade ?? "N/A"}
              </span>
            </div>

            <div className="badge-box">
              <span className="badge-label">SCORE</span>

              <span
                className="badge-val"
                style={{
                  color: categoryColor,
                }}>
                {restaurant.score}
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
                <span
                  className={`violation-tag status-flag status-${restaurant.current_status_code}`}>
                  {STATUS_LABELS[restaurant.current_status_code] ??
                    restaurant.current_status_label}
                </span>

                {isStale && (
                  <span className="details-stale-note">
                    {" "}
                    Last inspected {Math.floor(inspectionAge)}+ years ago
                  </span>
                )}

                {restaurant.grade && GRADE_PENDING_NOTES[restaurant.grade] && (
                  <span className="details-pending-note">
                    {" "}
                    {GRADE_PENDING_NOTES[restaurant.grade]}
                  </span>
                )}
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
              <td>Phone</td>

              <td>{formatPhoneNumber(restaurant.phone)}</td>
            </tr>

            <tr>
              <td>Google Street View</td>

              <td>
                {restaurant.latitude && restaurant.longitude ? (
                  <a
                    href={`https://www.google.com/maps?layer=c&cbll=${restaurant.latitude},${restaurant.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    View Street View{" "}
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="external-link-icon"
                      aria-hidden="true"
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

              return (
                <li
                  key={event.id}
                  className={isSelected ? "inspection-row-selected" : ""}
                  role="button"
                  tabIndex={0}
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={[
                    `Open inspection report for ${eventDate}.`,
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
                  <span
                    className="inspection-row-dot"
                    style={{
                      backgroundColor: CATEGORY_COLORS[eventCategory],
                    }}
                    aria-hidden="true"
                  />

                  <span className="inspection-row-date">{eventDate}</span>

                  <span
                    className="inspection-row-grade"
                    style={{
                      color: CATEGORY_COLORS[eventCategory],
                    }}>
                    {eventGrade}
                  </span>

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
