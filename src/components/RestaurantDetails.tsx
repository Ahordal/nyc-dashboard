// RestaurantDetails.tsx
//
// Displays overview information for the currently selected restaurant.
//
// Shows restaurant metadata, geographical information, and the
// inspection history list. Clicking a row in that list hands off to the
// Report tab, which shows that specific inspection's full report and
// violations.

import PanelHeader from "./PanelHeader";
import type { RestaurantProperties, InspectionEvent } from "../types/restaurant";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { formatPhoneNumber } from "../utils/formatPhoneNumber";
import { toTitleCase } from "../utils/toTitleCase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function yearsSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
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
  <>
    <div className="info-popup-section">
      <h4 className="section-header">Grades</h4>
      <ul>
        <li>
          <strong style={{ color: CATEGORY_COLORS.A }}>A</strong> — 0 to 13
          points
        </li>
        <li>
          <strong style={{ color: CATEGORY_COLORS.B }}>B</strong> — 14 to 27
          points
        </li>
        <li>
          <strong style={{ color: CATEGORY_COLORS.C }}>C</strong> — 28 or more
          points
        </li>
        <li>
          <strong style={{ color: CATEGORY_COLORS.pending }}>N</strong> — Not
          Yet Graded, awaiting re-inspection after an initial visit
        </li>
        <li>
          <strong style={{ color: CATEGORY_COLORS.pending }}>P</strong> — Grade
          Pending, reopened after a prior closure
        </li>
        <li>
          <strong style={{ color: CATEGORY_COLORS.pending }}>Z</strong> — Grade
          Pending, awaiting official confirmation
        </li>
        <li>
          <strong>N/A</strong> — No grade recorded; shown in the color of its
          score-based category.
        </li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Status</h4>
      <ul>
        <li>
          <span className="violation-tag status-open">Open</span> — Most recent
          inspection wasn't a closure. <strong>Reflects dataset status, not live business operations.</strong>
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
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">NYC Health Information</h4>
      <ul>
        <li>
          
            <a href="https://www.nyc.gov/assets/doh/downloads/pdf/rii/restaurant-grading-faq.pdf"
            target="_blank"
            rel="noopener noreferrer">
            How We Score and Grade
          </a>{" "}
          <FontAwesomeIcon
            icon={faArrowUpRightFromSquare}
            className="external-link-icon"
            aria-hidden="true"
          />
        </li>
        <li>
          
            <a href="https://www.nyc.gov/assets/doh/downloads/pdf/rii/inspection-cycle-and-letter-grading.pdf"
            target="_blank"
            rel="noopener noreferrer">
            Inspection Cycle Overview
          </a>{" "}
          <FontAwesomeIcon
            icon={faArrowUpRightFromSquare}
            className="external-link-icon"
            aria-hidden="true"
          />
        </li>
      </ul>
    </div>
  </>
);

type RestaurantDetailsProps = {
  restaurant: RestaurantProperties | null;
  history: InspectionEvent[];
  isLoadingHistory: boolean;
  selectedInspectionId: string | null;
  onSelectInspection: (inspectionId: string) => void;
};

export default function RestaurantDetails({
  restaurant,
  history,
  isLoadingHistory,
  selectedInspectionId,
  onSelectInspection,
}: RestaurantDetailsProps) {
  if (!restaurant) {
    return (
      <section className="panel restaurant-details-panel">
        <PanelHeader
          title="Restaurant & Inspection Details"
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

  // The hero header always reflects the restaurant's own latest
  // inspection -- not whichever inspection is selected for the Report
  // tab. Details is a fixed overview of the restaurant; drilling into a
  // specific historical report now happens entirely on the Report tab.
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
        title="Restaurant & Inspection Details"
        infoContent={RESTAURANT_INFO_CONTENT}
      />
      <div className="panel-scroll-content">
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
            <div className="badge-box">
              <span className="badge-label">GRADE</span>
              <span className="badge-val" style={{ color: categoryColor }}>
                {restaurant.grade ?? "N/A"}
              </span>
            </div>

            <div className="badge-box">
              <span className="badge-label">SCORE</span>
              <span className="badge-val" style={{ color: categoryColor }}>
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
              <td>{toTitleCase(restaurant.street)}</td>
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
          </tbody>
        </table>

        {isLoadingHistory && (
          <p className="details-loading">Loading inspection history…</p>
        )}

        {!isLoadingHistory && historyDescending.length > 0 && (
          <>
            <h4 className="section-header">Inspection History</h4>
            <ul className="inspection-history-list">
              {historyDescending.map((event) => {
                const eventCategory = getGradeCategory(
                  event.action,
                  event.grade,
                  event.score,
                );
                const isSelected = event.id === selectedInspectionId;
                return (
                  <li
                    key={event.id}
                    className={isSelected ? "inspection-row-selected" : ""}
                    onClick={() => onSelectInspection(event.id)}>
                    <span
                      className="inspection-row-dot"
                      style={{
                        backgroundColor: CATEGORY_COLORS[eventCategory],
                      }}
                    />
                    <span className="inspection-row-date">
                      {formatDate(event.date)}
                    </span>
                    <span
                      className="inspection-row-grade"
                      style={{ color: CATEGORY_COLORS[eventCategory] }}>
                      {event.grade ?? "N/A"}
                    </span>
                    <span className="inspection-row-score">{event.score}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}