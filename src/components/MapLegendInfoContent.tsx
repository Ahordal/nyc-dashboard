// MapLegendInfoContent.tsx
//
// The contents of the map panel's info popup (overview, how-to-use, the
// grade/score legend table, and data notes). Lifted out of MapView.tsx
// as a plain constant -- it's static JSX passed straight to PanelHeader.
//
// The six legend rows only differ by colour, dot sizes, and score text,
// so they're described by LEGEND_ROWS and rendered by LegendRow. A row
// with one dot size shows a single dot; a row with two shows the small
// dot, an arrow, then the large dot.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

import { CATEGORY_COLORS } from "../utils/gradeColours";
import InfoPopupContent from "./InfoPopupContent";

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
      }}></span>
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

const MAP_LEGEND_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <p>
        The map visualizes geocoded restaurant inspection locations across New
        York City, updating dynamically as you pan, zoom, or apply filters.
      </p>
    }
    howToUse={
      <ul>
        <li>
          Click any restaurant marker on the map to load its inspection history,
          violations, and performance details.
        </li>
        <li>
          Hover over markers to preview restaurant names, grades, and scores
          directly on the map canvas (active when scale is 1:18,056 or larger).
        </li>
        <li>
          Click the{" "}
          <span className="map-control-button" style={{ display: "inline" }}>
            Map Scale
          </span>{" "}
          or{" "}
          <span className="map-control-button" style={{ display: "inline" }}>
            Zoom Lvl
          </span>{" "}
          indicators at the bottom left to manually type and jump to a specific
          map view, or use the zoom buttons in the top-left corner.
        </li>
        <li>
          Click and hold the right mouse button to rotate the map; click the
          compass icon below the zoom buttons to reorient to north.
        </li>
        <li>
          Click the satellite/map icon in the top-right corner to toggle between
          the default map and satellite imagery.
        </li>
        <li>
          The scale bar in the bottom-right corner shows the current map scale
          as a ruler.
        </li>
      </ul>
    }
    legend={
      <table className="details-table legend-table">
        <tbody>
          {LEGEND_ROWS.map((row) => (
            <LegendRow key={row.label} row={row} />
          ))}
        </tbody>
      </table>
    }
    dataNotes={
      <ul>
        <li>
          The map utilizes bivariate symbology: circle size corresponds to the
          approximate inspection score (larger circle = higher score), and
          circle color represents the inspection grade.
        </li>
        <li>
          Use the restaurant listing panel to browse and inspect individual
          establishments when multiple locations share overlapping points.
        </li>
      </ul>
    }
  />
);

export default MAP_LEGEND_INFO_CONTENT;
