// MapView.tsx
//
// Displays the interactive ArcGIS map used by the dashboard.
//
// Creates the map and inspection layer, renders restaurants using the
// project's grading symbology, handles restaurant selection, and keeps
// the displayed features synchronized with the active dashboard filters.

import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import esriConfig from "@arcgis/core/config";

import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import { CATEGORY_COLORS } from "../utils/gradeColours";

esriConfig.apiKey = import.meta.env.PUBLIC_ARCGIS_API_KEY;

const gradeCategoryExpression = `
  var status = $feature.current_status_code;
  if (status == "closed") {
    return "closed";
  }

  var g = $feature.grade;
  if (g == "Z" || g == "P" || g == "N") {
    return "pending";
  }

  var s = $feature.score;
  if (s <= 13) return "A";
  if (s <= 27) return "B";
  return "C";
`;

const renderer = {
  type: "unique-value",
  valueExpression: gradeCategoryExpression,
  defaultSymbol: {
    type: "simple-marker",
    color: "#FFFFFF",
    outline: { color: "#1a1a1a", width: 0.5 },
    size: 6,
  },
  uniqueValueInfos: [
    { value: "A", symbol: { type: "simple-marker", color: CATEGORY_COLORS.A, outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "B", symbol: { type: "simple-marker", color: CATEGORY_COLORS.B, outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "C", symbol: { type: "simple-marker", color: CATEGORY_COLORS.C, outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "pending", symbol: { type: "simple-marker", color: CATEGORY_COLORS.pending, outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "closed", symbol: { type: "simple-marker", color: CATEGORY_COLORS.closed, outline: { color: "#1a1a1a", width: 1 }, size: 7 } },
  ],
};

const CATEGORY_CLAUSES: Record<string, string> = {
  A: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score <= 13`,
  B: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score BETWEEN 14 AND 27`,
  C: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score >= 28`,
  Pending: `current_status_code <> 'closed' AND grade IN ('Z','P','N')`,
  Closed: `current_status_code = 'closed'`,
};

type MapViewProps = {
  filters: Filters;
  onSelectRestaurant?: (restaurant: RestaurantProperties | null) => void;
};

export default function InspectionMapView({ filters, onSelectRestaurant }: MapViewProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const highlightHandleRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!mapDivRef.current) return;

    const layer = new GeoJSONLayer({
      url: "/data/latest-inspections.geojson",
      title: "NYC Restaurant Inspections",
      renderer: renderer as any,
      outFields: ["*"],
      copyright: "NYC DOHMH | Cartography: Alex Hordal",
    });
    layerRef.current = layer;

    const map = new Map({
      basemap: "arcgis/dark-gray",
      layers: [layer],
    });

    const view = new MapView({
      container: mapDivRef.current,
      map,
      center: [-73.98, 40.75],
      zoom: 11,
      constraints: { snapToZoom: false },
    });

    // High-contrast highlight styling applied directly to the view
    (view as any).highlightOptions = {
      color: [255, 255, 255, 1],
      haloColor: [255, 255, 255, 1], // Pure white ring; swap to [0, 225, 255, 1] for cyan accent
      haloOpacity: 1.0,
      fillOpacity: 0.4,
    };

    view.popupEnabled = false;

    const clickHandle = view.on("click", async (event) => {
      const response = await view.hitTest(event);
      const layerView = await view.whenLayerView(layer);

      const graphicHit = response.results.find(
        (result) => "graphic" in result && (result as any).graphic.layer === layer
      ) as { graphic: { attributes: RestaurantProperties } } | undefined;

      // Clear previous highlight instantly (zero flash)
      if (highlightHandleRef.current) {
        highlightHandleRef.current.remove();
        highlightHandleRef.current = null;
      }

      if (graphicHit) {
        const attributes = graphicHit.graphic.attributes;

        // Native WebGL highlight (zero drift)
        highlightHandleRef.current = layerView.highlight(graphicHit.graphic as any);

        if (onSelectRestaurant) {
          onSelectRestaurant(attributes);
        }
      } else {
        // Deselect when clicking empty canvas
        if (onSelectRestaurant) {
          onSelectRestaurant(null);
        }
      }
    });

    const pointerMoveHandle = view.on("pointer-move", async (event) => {
      const response = await view.hitTest(event);
      const isOverFeature = response.results.some(
        (result) => "graphic" in result && (result as any).graphic.layer === layer
      );
      if (view.container) {
        view.container.style.cursor = isOverFeature ? "pointer" : "default";
      }
    });

    return () => {
      clickHandle.remove();
      pointerMoveHandle.remove();
      if (highlightHandleRef.current) {
        highlightHandleRef.current.remove();
      }
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const clauses: string[] = [];

    if (filters.grades.length > 0) {
      const gradeClause = filters.grades
        .map((g) => CATEGORY_CLAUSES[g])
        .filter(Boolean)
        .map((c) => `(${c})`)
        .join(" OR ");
      if (gradeClause) clauses.push(`(${gradeClause})`);
    }

    if (filters.boroughs.length > 0) {
      const boroList = filters.boroughs.map((b) => `'${b}'`).join(",");
      clauses.push(`boro IN (${boroList})`);
    }

    layer.definitionExpression = clauses.length > 0 ? clauses.join(" AND ") : "";

    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }
  }, [filters]);

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}