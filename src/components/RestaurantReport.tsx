// RestaurantReport.tsx
//
// Full inspection report for one selected inspection, reached from the
// Inspection History list on the Details tab. Includes newer/older
// navigation for browsing inspections without leaving the Report tab.

import { useState } from "react";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";

import RestaurantHeroHeader from "./RestaurantHeroHeader";
import ViolationList from "./ViolationList";
import Badge from "./Badge";

import type {
  RestaurantProperties,
  InspectionEvent,
  ViolationCodeLookup,
} from "../types/restaurant";

import { isClosedInspection, UNINSPECTED_GRADE } from "../utils/gradeCategory";

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

const REPORT_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <>
        <p>
          Shows the full inspection report for whichever inspection was last
          selected from the Inspection History list on the Details tab.
        </p>

        <br />

        <p>
          When a restaurant is selected, the most recent inspection report is
          shown here.
        </p>
      </>
    }
    howToUse={
      <ul>
        <li>
          Use the newer and older report buttons to move between available
          inspections without returning to the Details tab.
        </li>
      </ul>
    }
    violations={
      <ul>
        <li>
          <Badge variant="critical">Critical</Badge> — Violation poses a higher
          risk to food safety.
        </li>

        <li>
          <Badge variant="not-critical">Not Critical</Badge> — Violation relates
          to general sanitation and maintenance.
        </li>

        <li>
          <Badge variant="code">02H</Badge> — Official NYC violation code for
          this specific finding.
        </li>

        <li>
          <Badge variant="category">Cooling &amp; Refrigeration</Badge> —
          Broader category the violation code falls under, when available.
        </li>
      </ul>
    }
    statuses={
      <ul>
        <li>
          <Badge variant="status-closed">Closed by DOHMH</Badge> — The displayed
          inspection resulted in a closure.
        </li>
      </ul>
    }
    dataNotes={
      <ul>
        <li>
          The grade, score, action, and violations shown belong to the displayed
          inspection and may not reflect the restaurant&apos;s current recorded
          status.
        </li>
      </ul>
    }
  />
);

type RestaurantReportProps = {
  restaurant: RestaurantProperties | null;

  history: InspectionEvent[];

  // History carries the violation data (the GeoJSON feature no longer
  // does), so the default view's violation list waits on this fetch.
  isLoadingHistory?: boolean;

  selectedInspectionId: string | null;

  violationCodes: ViolationCodeLookup;

  onSelectInspection: (inspectionId: string) => void;
};

export default function RestaurantReport({
  restaurant,
  history,
  isLoadingHistory = false,
  selectedInspectionId,
  violationCodes,
  onSelectInspection,
}: RestaurantReportProps) {
  const [showInfo, setShowInfo] = useState(false);

  const handleInfoClick = () => {
    setShowInfo((currentValue) => !currentValue);
  };

  if (showInfo) {
    return (
      <section className="panel restaurant-report-panel">
        <PanelHeader
          title="Inspection Report"
          infoContent={REPORT_INFO_CONTENT}
          onInfoClick={handleInfoClick}
          isInfoOpen={showInfo}
        />

        <div className="panel-scroll-content">{REPORT_INFO_CONTENT}</div>
      </section>
    );
  }

  if (!restaurant) {
    return (
      <section className="panel restaurant-report-panel">
        <PanelHeader
          title="Inspection Report"
          infoContent={REPORT_INFO_CONTENT}
          onInfoClick={handleInfoClick}
          isInfoOpen={showInfo}
        />

        <div className="panel-scroll-content">
          <p className="details-empty">
            Select a restaurant on the map or restaurant list, then click an
            inspection on the Restaurant Details tab to view its report here.
          </p>
        </div>
      </section>
    );
  }

  const selectedEvent =
    history.find((event) => event.id === selectedInspectionId) ?? null;

  // The default view shows the restaurant's current inspection. Its
  // grade/score/date/action still come off the GeoJSON record, but its
  // violations now come from the matching history event (falling back to
  // the most recent one), since the feature no longer carries them.
  const currentEvent =
    history.find((event) => event.id === restaurant.id) ??
    (history.length > 0 ? history[history.length - 1] : null);

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

        violations: currentEvent?.violations ?? [],
      };

  const panelTitle =
    displayed.grade === UNINSPECTED_GRADE
      ? "Inspection Report - No Record on File"
      : `Inspection Report - ${formatDate(displayed.date)}`;

  const currentIndex = selectedEvent
    ? history.findIndex((event) => event.id === selectedEvent.id)
    : history.length - 1;

  const newerEvent =
    currentIndex >= 0 && currentIndex < history.length - 1
      ? history[currentIndex + 1]
      : null;

  const olderEvent = currentIndex > 0 ? history[currentIndex - 1] : null;

  // This reflects the displayed historical inspection, not the restaurant's
  // present-day status.
  const isClosure = isClosedInspection(displayed.action ?? "");

  return (
    <section className="panel restaurant-report-panel">
      <PanelHeader
        title={panelTitle}
        infoContent={REPORT_INFO_CONTENT}
        onInfoClick={handleInfoClick}
        isInfoOpen={showInfo}
      />

      <div className="panel-scroll-content">
        <RestaurantHeroHeader
          name={restaurant.name}
          score={displayed.score}
          grade={displayed.grade}
          action={displayed.action}
        />

        {history.length > 1 && (
          <div className="report-nav">
            {olderEvent ? (
              <button
                type="button"
                className="report-nav-btn"
                onClick={() => {
                  onSelectInspection(olderEvent.id);
                }}>
                ← Older: {formatDate(olderEvent.date)}
              </button>
            ) : (
              <span className="report-nav-placeholder">Earliest Report</span>
            )}

            {newerEvent ? (
              <button
                type="button"
                className="report-nav-btn"
                onClick={() => {
                  onSelectInspection(newerEvent.id);
                }}>
                Newer: {formatDate(newerEvent.date)} →
              </button>
            ) : (
              <span className="report-nav-placeholder">
                Most Current Report
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

              <td>
                {displayed.action || "—"}

                {isClosure && (
                  <>
                    {" "}
                    <div style={{ marginTop: "6px" }}>
                      <Badge
                        variant="status-closed"
                        style={{
                          marginLeft: "0",
                          display: "inline-block",
                        }}>
                        Closed by DOHMH
                      </Badge>
                    </div>
                  </>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {!selectedEvent &&
        isLoadingHistory &&
        history.length === 0 &&
        displayed.grade !== UNINSPECTED_GRADE ? (
          <p className="details-loading">Loading violations…</p>
        ) : (
          <ViolationList
            violations={displayed.violations}
            violationCodes={violationCodes}
          />
        )}
      </div>
    </section>
  );
}
