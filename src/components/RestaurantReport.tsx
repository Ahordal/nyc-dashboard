// RestaurantReport.tsx
//
// Displays the full inspection report for a single selected inspection --
// the detail view reached by clicking a row in Restaurant Details'
// Inspection History list. Falls back to the restaurant's most recent
// inspection when nothing has been explicitly selected yet. Includes
// newer/older navigation to browse between inspections without leaving
// this tab.

import PanelHeader from "./PanelHeader";
import type {
  RestaurantProperties,
  InspectionEvent,
  Violation,
  ViolationCodeLookup,
} from "../types/restaurant";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { toTitleCase } from "../utils/toTitleCase";

function parseViolations(raw: string): Violation[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

const VIOLATION_FLAG_STYLES: Record<
  string,
  { label: string; background: string; color: string }
> = {
  Critical: { label: "Critical", background: "#8B0000", color: "#ffffff" },
  "Not Critical": {
    label: "Not Critical",
    background: "#E6B800",
    color: "#1a1a1a",
  },
};

const REPORT_INFO_CONTENT = (
  <div className="info-popup-section">
    <p>
      Shows the full inspection report for whichever inspection was last
      selected from the Inspection History list on the Details tab.
    </p>
    <br/>
    <p>When a restaurant is selected, the most recent inspection report is shown here.</p>
  </div>
);

type RestaurantReportProps = {
  restaurant: RestaurantProperties | null;
  history: InspectionEvent[];
  selectedInspectionId: string | null;
  violationCodes: ViolationCodeLookup;
  onSelectInspection: (inspectionId: string) => void;
};

export default function RestaurantReport({
  restaurant,
  history,
  selectedInspectionId,
  violationCodes,
  onSelectInspection,
}: RestaurantReportProps) {
  if (!restaurant) {
    return (
      <section className="panel restaurant-report-panel">
        <PanelHeader
          title="Inspection Report"
          infoContent={REPORT_INFO_CONTENT}
        />
        <div className="panel-scroll-content">
          <p className="details-empty">
            Select a restaurant on the map or restaurant list, then click an inspection on the Restaurant Details tab to view its report here.
          </p>
        </div>
      </section>
    );
  }

  const selectedEvent =
    history.find((e) => e.id === selectedInspectionId) ?? null;

  // Falls back to the restaurant's own latest inspection fields when no
  // specific history row has been selected yet (e.g. the Report tab was
  // reached some other way before any row was clicked).
  const displayed = selectedEvent
    ? {
        grade: selectedEvent.grade,
        score: selectedEvent.score,
        date: selectedEvent.date,
        inspection_type: selectedEvent.inspection_type,
        action: selectedEvent.action,
        violations: selectedEvent.violations,
      }
    : {
        grade: restaurant.grade,
        score: restaurant.score,
        date: restaurant.inspection_date,
        inspection_type: restaurant.inspection_type,
        action: restaurant.action,
        violations: parseViolations(restaurant.violations),
      };

  // NOTE: this category/color reflects the SELECTED inspection (displayed),
  // not the restaurant's overall latest one -- deliberately different from
  // Details' hero header, which always reflects the restaurant's latest.
  const category = getGradeCategory(
    displayed.action,
    displayed.grade,
    displayed.score,
  );
  const categoryColor = CATEGORY_COLORS[category];
  const displayName = toTitleCase(restaurant.name);

  // The panel header itself now carries the date of whichever inspection
  // is currently displayed -- defaulting to the most recent when nothing's
  // been explicitly selected -- so there's no need for a second, redundant
  // "Inspection Report - <date>" section header below it.
  const panelTitle = `Inspection Report - ${formatDate(displayed.date)}`;

  const sortedViolations = [...displayed.violations].sort((a, b) => {
    const rank = (flag: string) =>
      flag === "Critical" ? 0 : flag === "Not Critical" ? 1 : 2;
    return rank(a.critical_flag) - rank(b.critical_flag);
  });

  // Newer/older navigation between inspections. `history` is ordered
  // oldest -> newest, so "newer" is the NEXT index and "older" is the
  // PREVIOUS index. When nothing has been explicitly selected yet
  // (selectedEvent is null, displaying the restaurant's latest via
  // fallback), that's equivalent to sitting at the last index -- the
  // most recent entry -- for navigation purposes.
  const currentIndex = selectedEvent
    ? history.findIndex((e) => e.id === selectedEvent.id)
    : history.length - 1;

  const newerEvent =
    currentIndex >= 0 && currentIndex < history.length - 1
      ? history[currentIndex + 1]
      : null;
  const olderEvent =
    currentIndex > 0 ? history[currentIndex - 1] : null;

  return (
    <section className="panel restaurant-report-panel">
      <PanelHeader title={panelTitle} infoContent={REPORT_INFO_CONTENT} />
      <div className="panel-scroll-content">
        {/* Same hero header block as RestaurantDetails -- name + Grade/Score
            badges, styled identically. Here it reflects the SELECTED
            inspection's grade/score rather than the restaurant's latest. */}
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
                {displayed.grade ?? "N/A"}
              </span>
            </div>

            <div className="badge-box">
              <span className="badge-label">SCORE</span>
              <span className="badge-val" style={{ color: categoryColor }}>
                {displayed.score}
              </span>
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="report-nav">
            {newerEvent ? (
              <button
                type="button"
                className="report-nav-btn"
                onClick={() => onSelectInspection(newerEvent.id)}>
                ← {formatDate(newerEvent.date)}
              </button>
            ) : (
              <span className="report-nav-placeholder">
                Most Current Report
              </span>
            )}

            {olderEvent ? (
              <button
                type="button"
                className="report-nav-btn"
                onClick={() => onSelectInspection(olderEvent.id)}>
                {formatDate(olderEvent.date)} →
              </button>
            ) : (
              <span className="report-nav-placeholder">
                Earliest Report
              </span>
            )}
          </div>
        )}

        <h4 className="section-header">Inspection Information</h4>
        <table className="details-table">
          <tbody>
            <tr>
              <td>Inspection Type</td>
              <td>{displayed.inspection_type || "—"}</td>
            </tr>
            <tr>
              <td>Action</td>
              <td>{displayed.action || "—"}</td>
            </tr>
          </tbody>
        </table>

        {sortedViolations.length > 0 && (
          <>
            <h4 className="section-header">Violations</h4>
            <ul className="violations-list">
              {sortedViolations.map((v, i) => {
                const flagStyle = VIOLATION_FLAG_STYLES[v.critical_flag];
                return (
                  <li
                    key={`${v.code}-${i}`}
                    style={
                      flagStyle
                        ? { borderLeftColor: flagStyle.background }
                        : undefined
                    }>
                    <span className="violation-code">{v.code}</span>
                    <span className="violation-description">
                      {violationCodes[v.code] ?? "Description unavailable"}
                    </span>{" "}
                    &nbsp;
                    {flagStyle && (
                      <span
                        className="violation-tag"
                        style={{
                          backgroundColor: flagStyle.background,
                          color: flagStyle.color,
                        }}>
                        {flagStyle.label}
                      </span>
                    )}
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