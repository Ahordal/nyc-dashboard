// MapView.tsx
import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import esriConfig from "@arcgis/core/config";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";

esriConfig.apiKey = import.meta.env.PUBLIC_ARCGIS_API_KEY;

const gradeCategoryExpression = `
  var status = $feature.current_status;
  if (status == "closed_by_doh") {
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
    { value: "A", symbol: { type: "simple-marker", color: "#2E7BE4", outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "B", symbol: { type: "simple-marker", color: "#3CB44B", outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "C", symbol: { type: "simple-marker", color: "#F58231", outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "pending", symbol: { type: "simple-marker", color: "#E6007E", outline: { color: "#1a1a1a", width: 0.5 }, size: 6 } },
    { value: "closed", symbol: { type: "simple-marker", color: "#8B0000", outline: { color: "#1a1a1a", width: 1 }, size: 7 } },
  ],
};

const CATEGORY_CLAUSES: Record<string, string> = {
  A: `current_status <> 'closed_by_doh' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score <= 13`,
  B: `current_status <> 'closed_by_doh' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score BETWEEN 14 AND 27`,
  C: `current_status <> 'closed_by_doh' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score >= 28`,
  Pending: `current_status <> 'closed_by_doh' AND grade IN ('Z','P','N')`,
  Closed: `current_status = 'closed_by_doh'`,
};

type MapViewProps = {
  filters: Filters;
  onSelectRestaurant?: (restaurant: RestaurantProperties) => void;
};

export default function InspectionMapView({ filters, onSelectRestaurant }: MapViewProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);

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

    // Set post-construction rather than in the constructor's config
    // object -- this project's installed @arcgis/core type definitions
    // reject autoOpenEnabled inside the typed constructor options, even
    // though it's a real, documented property on the Popup instance
    // itself. Assigning it directly here sidesteps that typing mismatch.
    view.popupEnabled = false; 

    const clickHandle = view.on("click", async (event) => {
      const response = await view.hitTest(event);
      const graphicHit = response.results.find(
        (result) => "graphic" in result && (result as any).graphic.layer === layer
      ) as { graphic: { attributes: RestaurantProperties } } | undefined;

      if (graphicHit && onSelectRestaurant) {
        onSelectRestaurant(graphicHit.graphic.attributes);
      }
    });

    // Shows a pointer cursor while hovering a restaurant point, signaling
    // it's clickable, same way a link would.
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
  }, [filters]);

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}