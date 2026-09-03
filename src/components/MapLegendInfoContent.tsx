// MapLegendInfoContent.tsx
//
// The contents of the map panel's info popup (overview, how-to-use, the
// grade/score legend table, and data notes). Lifted out of MapView.tsx
// as a plain constant; it's static JSX passed straight to PanelHeader.
// The legend table itself is shared (InfoPopupSharedContent).

import InfoPopupContent from "./InfoPopupContent";
import { LegendTable } from "./InfoPopupSharedContent";

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
    legend={<LegendTable />}
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
