// RestaurantDetails.tsx
import { useEffect, useState, useRef } from "react";
import PanelHeader from "./PanelHeader";
import type {
  RestaurantProperties,
  InspectionEvent,
  Violation,
  ViolationCodeLookup,
} from "../types/restaurant";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { formatPhoneNumber } from "../utils/formatPhoneNumber";
import { toTitleCase } from "../utils/toTitleCase";

function parseViolations(raw: string): Violation[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Forces UTC interpretation rather than local time, so a stored
// midnight-UTC timestamp (e.g. "2026-02-13T00:00:00.000") doesn't
// silently shift back a day when the viewer's local timezone is
// behind UTC.
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
  closed_by_doh: "Closed by DOHMH",
  unknown: "Unknown",
};

// Only Z and P have a plain-English clarifying note -- a normal A/B/C
// grade needs no extra explanation.
const GRADE_PENDING_NOTES: Record<string, string> = {
  Z: "Grade pending official confirmation.",
  P: "Grade pending — reopened after a prior closure.",
  N: "Not yet graded — awaiting re-inspection after an initial visit.",
};

// The dataset's critical_flag field has three documented values:
// "Critical", "Not Critical", and "Not Applicable". Only the first two
// get a visible tag -- "Not Applicable" (used on clean inspections with
// no violations at all) has nothing meaningful to flag, so it falls
// through with no style and no tag.
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
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Status</h4>
      <ul>
        <li>
          <span className="violation-tag status-open">Open</span> — Most recent
          inspection wasn't a closure
        </li>
        <li>
          <span className="violation-tag status-unknown">Unknown</span> — No
          reliable status recorded
        </li>
        <li>
          <span className="violation-tag status-closed_by_doh">
            Closed by DOHMH
          </span>{" "}
          — Most recent inspection resulted in a closure
        </li>
      </ul>
    </div>

    <div className="info-popup-section">
      <h4 className="section-header">Violations</h4>
      <ul>
        <li>
          <span
            className="violation-tag"
            style={{
              backgroundColor: VIOLATION_FLAG_STYLES.Critical.background,
              color: VIOLATION_FLAG_STYLES.Critical.color,
            }}>
            Critical
          </span>{" "}
          — Most likely to contribute to foodborne illness
        </li>
        <li>
          <span
            className="violation-tag"
            style={{
              backgroundColor: VIOLATION_FLAG_STYLES["Not Critical"].background,
              color: VIOLATION_FLAG_STYLES["Not Critical"].color,
            }}>
            Not Critical
          </span>{" "}
          — A violation, but lower food-safety risk
        </li>
      </ul>
    </div>
    <div className="info-popup-section">
      <h4 className="section-header">NYC Health Information</h4>
      <ul>
        <li>How We Score and Grade</li>
        <li>Inspection Cycle Overview</li>
      </ul>
    </div>
  </>
);

export default function RestaurantDetails({
  restaurant,
}: {
  restaurant: RestaurantProperties | null;
}) {
  const [history, setHistory] = useState<InspectionEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const historyCache = useRef<Map<string, InspectionEvent[]>>(new Map());

  // Violation descriptions no longer travel with each violation entry --
  // the pipeline now writes them once to violation-codes.json (code ->
  // description) instead of duplicating the text on every violation
  // instance across every restaurant/inspection. Fetched once here,
  // independent of which restaurant is selected, since this lookup is
  // the same for every restaurant and rarely (if ever) changes within a
  // single page session.
  const [violationCodes, setViolationCodes] = useState<ViolationCodeLookup>(
    {},
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch("/data/violation-codes.json", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: ViolationCodeLookup) => setViolationCodes(data))
      .catch((err) => {
        if (err.name !== "AbortError") setViolationCodes({});
      });

    return () => controller.abort();
  }, []);

  // Fetch this restaurant's full history whenever a new one is selected
  // on the map. Reset the in-panel selection back to "show the latest"
  // each time too, so switching restaurants doesn't leave a stale
  // historical inspection selected from the previous restaurant.
  useEffect(() => {
    setSelectedId(null);

    if (!restaurant) {
      setHistory([]);
      setIsLoadingHistory(false);
      return;
    }

    // Serve from cache instantly if we've already fetched this
    // restaurant before -- no network request at all.
    const cached = historyCache.current.get(restaurant.camis);
    if (cached) {
      setHistory(cached);
      setIsLoadingHistory(false);
      return;
    }

    // Clear stale data immediately, rather than leaving the previous
    // restaurant's history visible while the new one loads.
    setHistory([]);
    setIsLoadingHistory(true);

    const controller = new AbortController();

    fetch(`/data/history/${restaurant.camis}.json`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: InspectionEvent[]) => {
        historyCache.current.set(restaurant.camis, data);
        setHistory(data);
        setIsLoadingHistory(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setHistory([]);
          setIsLoadingHistory(false);
        }
      });

    return () => controller.abort();
  }, [restaurant?.camis]);

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

  // The currently-displayed inspection: either whichever Inspection
  // Reports row was clicked, or the restaurant's latest by default.
  // This is what "opens in the same window" means -- clicking a past
  // inspection swaps this panel's content in place, no navigation, no
  // popup.
  const selectedEvent = history.find((e) => e.id === selectedId) ?? null;

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

  const category = getGradeCategory(
    displayed.action,
    displayed.grade,
    displayed.score,
  );
  const categoryColor = CATEGORY_COLORS[category];
  const displayName = toTitleCase(restaurant.name);

  // current_status/staleness reflect the restaurant overall, not
  // whichever historical inspection is currently selected -- "is this
  // restaurant currently open" is a property of the restaurant, not of
  // whichever old record you happen to be looking at.
  const inspectionAge = yearsSince(restaurant.inspection_date);
  const isStale = inspectionAge >= 2;

  // Critical first, then Not Critical, then anything else (e.g. Not
  // Applicable) last.
  const sortedViolations = [...displayed.violations].sort((a, b) => {
    const rank = (flag: string) =>
      flag === "Critical" ? 0 : flag === "Not Critical" ? 1 : 2;
    return rank(a.critical_flag) - rank(b.critical_flag);
  });

  // Most recent inspection first in the list.
  const historyDescending = [...history].reverse();

  return (
    <section className="panel restaurant-details-panel">
      <PanelHeader
        title="Restaurant & Inspection Details"
        infoContent={RESTAURANT_INFO_CONTENT}
      />
      <div className="panel-scroll-content">
        <h3 className="details-name" style={{ color: categoryColor }}>
          {displayName}
        </h3>

        <div className="details-grade-score">
          <div>
            <span className="details-label">Grade</span>
            <span className="details-value" style={{ color: categoryColor }}>
              {displayed.grade ?? "N/A"}
            </span>
          </div>
          <div>
            <span className="details-label">Score</span>
            <span className="details-value" style={{ color: categoryColor }}>
              {displayed.score}
            </span>
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
                  className={`violation-tag status-flag status-${restaurant.current_status}`}>
                  {STATUS_LABELS[restaurant.current_status] ??
                    restaurant.current_status}
                </span>
                {isStale && (
                  <span className="details-stale-note">
                    {" "}
                    Last inspected {Math.floor(inspectionAge)}+ years ago
                  </span>
                )}
                {displayed.grade && GRADE_PENDING_NOTES[displayed.grade] && (
                  <span className="details-pending-note">
                    {" "}
                    {GRADE_PENDING_NOTES[displayed.grade]}
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
                const isSelected = event.id === selectedId;
                return (
                  <li
                    key={event.id}
                    className={isSelected ? "inspection-row-selected" : ""}
                    onClick={() => setSelectedId(isSelected ? null : event.id)}>
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
                      {event.grade ?? "—"}
                    </span>
                    <span className="inspection-row-score">{event.score}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <h4 className="section-header">
          Inspection Report - {formatDate(displayed.date)}
        </h4>
        <table className="details-table">
          <tbody>
            <tr>
              <td>Inspection Date</td>
              <td>{formatDate(displayed.date)}</td>
            </tr>
            <tr>
              <td>Inspection Type</td>
              <td>{displayed.inspection_type || "—"}</td>
            </tr>
            <tr>
              <td>Grade</td>
              <td>{displayed.grade ?? "No Grade Data Available"}</td>
            </tr>
            <tr>
              <td>Score</td>
              <td>{displayed.score}</td>
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
                    </span> &nbsp;
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
