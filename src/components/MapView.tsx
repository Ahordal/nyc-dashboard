// MapView.tsx
import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import esriConfig from "@arcgis/core/config";
import type { Filters } from "../types/filters";

esriConfig.apiKey = import.meta.env.PUBLIC_ARCGIS_API_KEY;

const gradeCategoryExpression = `
  var status = $feature.current_status;
  if (status == "closed_by_doh") {
    return "closed";
  }

  var g = $feature.grade;
  if (g == "Z" || g == "P") {
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
    { value: "closed", symbol: { type: "simple-marker", color: "#8B0000", outline: { color: "#FFFFFF", width: 1 }, size: 7 } },
  ],
};

const popupTemplate = {
  title: "{name}",
  content: [
    {
      type: "fields",
      fieldInfos: [
        { fieldName: "cuisine", label: "Cuisine" },
        { fieldName: "grade", label: "Grade" },
        { fieldName: "score", label: "Score" },
        { fieldName: "inspection_date", label: "Inspection Date", format: { dateFormat: "short-date" } },
        { fieldName: "inspection_type", label: "Inspection Type" },
        { fieldName: "action", label: "Action" },
        { fieldName: "current_status", label: "Current Status" },
        { fieldName: "boro", label: "Borough" },
        { fieldName: "street", label: "Street" },
        { fieldName: "building", label: "Building" },
        { fieldName: "zipcode", label: "Zipcode" },
        { fieldName: "phone", label: "Phone" },
      ],
    },
  ],
};

// Mirrors gradeCategoryExpression's logic above, but as SQL rather than
// Arcade, since definitionExpression is a WHERE clause, not a renderer
// expression. These two must be kept in sync manually -- if the
// category logic ever changes, update both places.
//
// SQL note: `grade NOT IN ('Z','P')` alone would silently exclude
// null-grade rows too, since NULL comparisons evaluate to unknown (not
// true) in SQL -- hence the explicit `grade IS NULL OR` guard.
const CATEGORY_CLAUSES: Record<string, string> = {
  A: `current_status <> 'closed_by_doh' AND (grade IS NULL OR grade NOT IN ('Z','P')) AND score <= 13`,
  B: `current_status <> 'closed_by_doh' AND (grade IS NULL OR grade NOT IN ('Z','P')) AND score BETWEEN 14 AND 27`,
  C: `current_status <> 'closed_by_doh' AND (grade IS NULL OR grade NOT IN ('Z','P')) AND score >= 28`,
  Pending: `current_status <> 'closed_by_doh' AND grade IN ('Z','P')`,
  Closed: `current_status = 'closed_by_doh'`,
};

type MapViewProps = {
  filters: Filters;
  onSelectRestaurant?: (camis: string) => void;
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
      popupTemplate,
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

    const clickHandle = view.on("click", async (event) => {
      const response = await view.hitTest(event);
      const graphicHit = response.results.find(
        (result) => "graphic" in result && (result as any).graphic.layer === layer
      ) as { graphic: { attributes: Record<string, any> } } | undefined;

      if (graphicHit && onSelectRestaurant) {
        onSelectRestaurant(graphicHit.graphic.attributes.camis);
      }
    });

    return () => {
      clickHandle.remove();
      view.destroy();
    };
  }, []);

  // Applies the current grade/borough filters as a definitionExpression.
  // Grade categories here match the map's actual color buckets (via
  // CATEGORY_CLAUSES above), not the raw `grade` field.
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