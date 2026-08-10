// RestaurantReport.tsx
//
// Displays the full inspection report for a single selected inspection.
//
// The report is reached by selecting a row in Restaurant Details' Inspection
// History list. It also includes newer/older navigation for browsing between
// inspections without leaving the Report tab.

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";
import { GradeRangeInfo } from "./InfoPopupSharedContent";

import RestaurantHeroHeader from "./RestaurantHeroHeader";
import ViolationList from "./ViolationList";

import type {
  RestaurantProperties,
  InspectionEvent,
  Violation,
  ViolationCodeLookup,
} from "../types/restaurant";

import { isClosedInspection } from "../utils/gradeCategory";

function parseViolations(raw: string): Violation[] {
  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
    grades={<GradeRangeInfo />}
    statuses={
      <ul>
        <li>
          <span className="violation-tag status-closed">Closed by DOHMH</span> —
          The displayed inspection resulted in a closure.
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
            Select a restaurant on the map or restaurant list, then click an
            inspection on the Restaurant Details tab to view its report here.
          </p>
        </div>
      </section>
    );
  }

  const selectedEvent =
    history.find((event) => event.id === selectedInspectionId) ?? null;

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

  const panelTitle = `Inspection Report - ${formatDate(displayed.date)}`;

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
      <PanelHeader title={panelTitle} infoContent={REPORT_INFO_CONTENT} />

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
                    <span
                      className="violation-tag status-flag status-closed"
                      style={{
                        marginLeft: "8px",

                        verticalAlign: "middle",

                        whiteSpace: "nowrap",
                      }}>
                      Closed by DOHMH
                    </span>
                  </>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <ViolationList
          violations={displayed.violations}
          violationCodes={violationCodes}
        />
      </div>
    </section>
  );
}
