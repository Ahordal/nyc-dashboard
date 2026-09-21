// InfoPopupSharedContent.tsx
//
// Content shared between info popups: grade definitions, NYC resources,
// the legend table, overview/how-to/attribution/notes blocks. Used by
// DashboardGuide (desktop) and MobileInfoContent (phones).

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
    <>
      <p>
        This dashboard lets you explore New York City restaurant inspection
        records with:
      </p>
      <ul>
        <li>An interactive map of restaurant locations</li>
        <li>A Restaurant List and Restaurant Details panel</li>
        <li>Grade and Borough filters</li>
        <li>Restaurant search by name, cuisine, or address</li>
        <li>
          A search radius tool to find restaurants within a chosen distance
          of a point
        </li>
        <li>Full Inspection Reports, including cited violations</li>
        <li>A Restaurant Performance Over Time chart</li>
        <li>A Grade Breakdown chart for the current view</li>
      </ul>
    </>
  );
}

// `extra` appends context-specific items (touch gestures) to the end.
export function DashboardHowToUse({ extra }: { extra?: ReactNode }) {
  return (
    <ul>
      <li>
        Select a restaurant on the map or in the list to see its details,
        inspection history, and performance chart. It stays highlighted in
        the list no matter how you sort or paginate.
      </li>

      <li>
        Combine the Grade and Borough filters to narrow down the restaurants
        shown.
      </li>

      <li>
        Search narrows results further by restaurant name, cuisine, or
        address.
      </li>

      <li>
        Use the target icon in the map&apos;s top-right corner to place a
        search radius point, then pick a distance to see restaurants within
        range.
      </li>

      <li>
        Use the list&apos;s sort and pagination controls to browse restaurants
        currently in view.
      </li>

      <li>
        Panning or zooming the map changes which restaurants are &quot;in
        view&quot;. The list, stats, and grade chart update to match.
      </li>

      <li>
        The restaurant list and dashboard summaries update automatically as
        you move the map, filter, search, or set a search radius.
      </li>

      <li>
        Filters, search, sorting, and the search radius all apply
        independently &mdash; combine them in any order.
      </li>

      {extra}
    </ul>
  );
}

// Link to the source dataset on NYC Open Data. Also covers the basemap
// credit: ArcGIS's own on-map attribution widget collapses at narrow
// (mobile) viewport widths, so it's restated here where it can't disappear.
export function DataAttribution() {
  return (
    <ul>
      <li>
        <strong className="info-popup-field-label">Restaurant Data:</strong>{" "}
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

      <li>
        <strong className="info-popup-field-label">Basemap:</strong> Esri
        Community Maps Contributors, NYC OpenData, New Jersey Office of GIS,
        Esri, TomTom, Garmin, SafeGraph, GeoTechnologies, Inc, METI/NASA,
        USGS, EPA, NPS, US Census Bureau, USDA, USFWS, NYC DOHMH
      </li>
    </ul>
  );
}

// Caveats for reading the data correctly.
export function DataNotes() {
  return (
    <ul>
      <li>
        Data comes from NYC&apos;s Department of Health and Mental Hygiene
        (DOHMH) and may not include the most recent inspections yet.
      </li>

      <li>
        Older inspection reports may show a different grade, score, or status
        than what&apos;s shown for the restaurant today.
      </li>

      <li>
        Restaurant addresses are matched to a map location automatically
        (geocoding). When that match couldn&apos;t be confirmed, the
        restaurant is flagged on the map as &quot;Location Unverified&quot;
        instead of assumed correct.
      </li>

      <li>
        The &quot;latest&quot; inspection shown is the most recent one that
        got a grade, not necessarily the restaurant&apos;s very last visit;
        visits that didn&apos;t result in a score are skipped.
      </li>

      <li>
        Inspections that didn&apos;t get a numeric score aren&apos;t included
        in score-based charts and summaries.
      </li>

      <li>
        The <span className="dashboard-guide-meta-delta-positive">+12</span>{" "}
        or <span className="dashboard-guide-meta-delta-negative">−12</span>{" "}
        next to the restaurant/inspection counts shows the change since the
        last update. A drop isn&apos;t a dashboard error &mdash; it reflects
        DOHMH&apos;s own current published count, which can go up or down as
        records are added, corrected, or removed.
      </li>

      <li>
        Addresses are cleaned up for display (for example, turning
        &quot;1ST&quot; into &quot;1st&quot;) and may differ slightly from
        official listings.
      </li>

      <li>
        This site uses Google Analytics to understand traffic.
      </li>
    </ul>
  );
}

// Grade/score/dot-size legend. One dot size = single dot; two = small dot, arrow, large dot.
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
