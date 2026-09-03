// InfoPopupSharedContent.tsx
//
// Content shared between dashboard info popups: grade definitions, NYC
// health resources, the map legend table, and the dashboard overview /
// how-to / attribution / data-notes blocks (used by DashboardGuide on
// desktop and MobileInfoContent on phones).

import type { ReactNode } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  faArrowUpRightFromSquare,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";

import {
  CATEGORY_COLORS,
} from "../utils/gradeCategory";

export function GradeRangeInfo() {
  return (
    <ul>
      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.A,
          }}
        >
          A
        </strong>{" "}
        — 0 to 13 points
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.B,
          }}
        >
          B
        </strong>{" "}
        — 14 to 27 points
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.C,
          }}
        >
          C
        </strong>{" "}
        — 28 or more points
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.closed,
          }}
        >
          CLOSED
        </strong>{" "}
        — Closed by DOHMH; violations
        requiring immediate action were
        cited
      </li>

      <li>
        <strong
          style={{
            color:
              CATEGORY_COLORS.pending,
          }}
        >
          N
        </strong>{" "}
        — Not Yet Graded, awaiting
        re-inspection after an initial
        visit
      </li>

      <li>
        <strong
          style={{
            color:
              CATEGORY_COLORS.pending,
          }}
        >
          P
        </strong>{" "}
        — Grade Pending, reopened after
        a prior closure
      </li>

      <li>
        <strong
          style={{
            color:
              CATEGORY_COLORS.pending,
          }}
        >
          Z
        </strong>{" "}
        — Grade Pending, awaiting
        official confirmation
      </li>

      <li>
        <strong>N/A</strong> — No grade
        recorded; shown in the color of
        its score-based category
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.uninspected,
          }}
        >
          UNINSPECTED
        </strong>{" "}
        — No scored inspection on
        record for this establishment
      </li>
    </ul>
  );
}

export function NYCHealthResources() {
  return (
    <ul>
      <li>
        <a
          href="https://www.nyc.gov/assets/doh/downloads/pdf/rii/restaurant-grading-faq.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          How We Score and Grade
        </a>{" "}
        <FontAwesomeIcon
          icon={
            faArrowUpRightFromSquare
          }
          className="external-link-icon"
          aria-hidden="true"
        />
      </li>

      <li>
        <a
          href="https://www.nyc.gov/assets/doh/downloads/pdf/rii/inspection-cycle-and-letter-grading.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          Inspection Cycle Overview
        </a>{" "}
        <FontAwesomeIcon
          icon={
            faArrowUpRightFromSquare
          }
          className="external-link-icon"
          aria-hidden="true"
        />
      </li>
    </ul>
  );
}

// What the dashboard as a whole covers.
export function DashboardOverview() {
  return (
    <p>
      Explores NYC restaurant inspection records through the map, grade and
      borough filters, search, restaurant list, restaurant details, inspection
      reports, performance chart and the grade breakdown chart.
    </p>
  );
}

// Dashboard interaction bullets. `extra` appends context-specific items
// (e.g. touch gestures on mobile) to the end of the list.
export function DashboardHowToUse({ extra }: { extra?: ReactNode }) {
  return (
    <ul>
      <li>
        Grade and Borough controls can be combined to narrow the restaurants
        shown.
      </li>

      <li>
        Search further narrows the current results by restaurant name or
        cuisine.
      </li>

      <li>
        Restaurant lists and dashboard summaries update with the current map
        view, filters, and search.
      </li>

      <li>
        Select a restaurant on the map or in the list to view its details,
        inspection history, and performance chart.
      </li>

      <li>
        Panning or zooming the map changes which restaurants are &quot;in
        view&quot;. The list, stats panel, and grade chart then dynamically
        update to match.
      </li>

      <li>
        Use the list&apos;s sort and pagination controls to browse restaurants
        currently in view.
      </li>

      {extra}
    </ul>
  );
}

// Link to the source dataset on NYC Open Data.
export function DataAttribution() {
  return (
    <ul>
      <li>
        <a
          href="https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/about_data"
          target="_blank"
          rel="noreferrer"
        >
          DOHMH New York City Restaurant Inspection Results
        </a>{" "}
        <FontAwesomeIcon
          icon={faArrowUpRightFromSquare}
          className="external-link-icon"
          aria-hidden="true"
        />
      </li>
    </ul>
  );
}

// Caveats for reading the data correctly.
export function DataNotes() {
  return (
    <ul>
      <li>
        The underlying dataset is provided by DOHMH and may not reflect
        inspections in real time.
      </li>

      <li>
        Historical inspection reports may differ from a restaurant&apos;s latest
        grade, score, or recorded status.
      </li>

      <li>
        Inspections without numerical scores may be excluded from score-based
        charts and summaries.
      </li>

      <li>
        Restaurants with no scored inspection on record (including ones never
        inspected) appear as a distinct &quot;Uninspected&quot; category on the
        map and in the grade breakdown.
      </li>

      <li>
        The &quot;latest&quot; inspection shown may not be a restaurant&apos;s
        most recent visit — non-substantive administrative or compliance checks
        without a score are skipped in favor of the last scored inspection.
      </li>

      <li>
        Restaurant locations are geocoded; some could not be automatically
        confirmed and are flagged on the map as &quot;Location Unverified&quot;
        rather than assumed correct.
      </li>

      <li>
        Displayed addresses are reformatted from the source dataset (ordinal
        suffixes, casing) and may differ slightly from official listings.
      </li>
    </ul>
  );
}

// The map's grade / score / dot-size legend. One dot size shows a single
// dot; two show small dot, arrow, large dot.
type LegendRowData = {
  label: string;
  color: string;
  score: string;
  dots: readonly [number] | readonly [number, number];
};

const LEGEND_ROWS: readonly LegendRowData[] = [
  { label: "A", color: CATEGORY_COLORS.A, dots: [4, 6], score: "0–13 pts" },
  { label: "B", color: CATEGORY_COLORS.B, dots: [6, 8], score: "14–27 pts" },
  { label: "C", color: CATEGORY_COLORS.C, dots: [8, 11], score: "28+ pts" },
  {
    label: "Pending",
    color: CATEGORY_COLORS.pending,
    dots: [4, 11],
    score: "N / P / Z (score varies)",
  },
  {
    label: "Uninspected",
    color: CATEGORY_COLORS.uninspected,
    dots: [6],
    score: "No scored inspection on record",
  },
  { label: "Closed", color: CATEGORY_COLORS.closed, dots: [11], score: "" },
];

function Dot({ size, color }: { size: number; color: string }) {
  return (
    <span
      className="dot-sample"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        border: "0.5px solid rgba(26, 26, 26, 1)",
      }}
    ></span>
  );
}

function LegendRow({ row }: { row: LegendRowData }) {
  return (
    <tr>
      <td>
        <span className="legend-grade-text" style={{ color: row.color }}>
          {row.label}
        </span>
      </td>
      <td>
        {row.dots.length === 2 ? (
          <div className="legend-scale-visual">
            <Dot size={row.dots[0]} color={row.color} />
            <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
            <Dot size={row.dots[1]} color={row.color} />
          </div>
        ) : (
          <div className="legend-scale-visual single-dot-align">
            <Dot size={row.dots[0]} color={row.color} />
          </div>
        )}
      </td>
      <td className="legend-score-text">{row.score}</td>
    </tr>
  );
}

export function LegendTable() {
  return (
    <table className="details-table legend-table">
      <tbody>
        {LEGEND_ROWS.map((row) => (
          <LegendRow key={row.label} row={row} />
        ))}
      </tbody>
    </table>
  );
}
