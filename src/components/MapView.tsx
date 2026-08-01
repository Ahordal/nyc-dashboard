// MapView.tsx
//
// Displays the interactive ArcGIS map used by the dashboard.
//
// Creates the map and inspection layer, renders restaurants using the
// project's grading symbology, handles restaurant selection, keeps the
// displayed features synchronized with the active dashboard filters, and
// reports the set of restaurants currently visible in the map's extent.

import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import FeatureEffect from "@arcgis/core/layers/support/FeatureEffect";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";

import esriConfig from "@arcgis/core/config";
import type Graphic from "@arcgis/core/Graphic";
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
    { value: "A", symbol: { type: "simple-marker", color: CATEGORY_COLORS.A, outline: { color: "#1a1a1a", width: 0.5 }, size: 5 } },
    { value: "B", symbol: { type: "simple-marker", color: CATEGORY_COLORS.B, outline: { color: "#1a1a1a", width: 0.5 }, size: 5 } },
    { value: "C", symbol: { type: "simple-marker", color: CATEGORY_COLORS.C, outline: { color: "#1a1a1a", width: 0.5 }, size: 5 } },
    { value: "pending", symbol: { type: "simple-marker", color: CATEGORY_COLORS.pending, outline: { color: "#1a1a1a", width: 0.5 }, size: 5 } },
    { value: "closed", symbol: { type: "simple-marker", color: CATEGORY_COLORS.closed, outline: { color: "#1a1a1a", width: 1 }, size: 5 } },
  ],
};

const CATEGORY_CLAUSES: Record<string, string> = {
  A: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score <= 13`,
  B: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score BETWEEN 14 AND 27`,
  C: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score >= 28`,
  Pending: `current_status_code <> 'closed' AND grade IN ('Z','P','N')`,
  Closed: `current_status_code = 'closed'`,
};

// Labels appear next to the map points at or below a scale of 1:2,000.
const LABEL_MIN_SCALE = 2000;

const labelClass = new LabelClass({
  labelExpressionInfo: { expression: "$feature.name" },
  symbol: {
    type: "text",
    color: "#ffffff",
    haloColor: "#000000",
    haloSize: 1,
    font: { size: 10, family: "sans-serif", weight: "bold" },
  } as any,
  labelPlacement: "above-right",
  minScale: LABEL_MIN_SCALE,
  maxScale: 0,
});

// A FeatureFilter with an empty objectIds array is treated as "no ID constraint".
// -1 is guaranteed not to exist as a real object ID, so this filter reliably matches zero features.
const NO_SELECTION_FILTER = new FeatureFilter({ objectIds: [-1] });

// Page size for querying visible restaurants. Kept safely under typical
// ArcGIS maxRecordCount limits (commonly 1000-2000) so each page request
// is well within what the layer will actually return.
const VISIBLE_QUERY_PAGE_SIZE = 2000;

// Queries ALL restaurants intersecting the current map extent, not just the
// first page. A single queryFeatures() call is capped by the layer's
// maxRecordCount -- if more restaurants are in view than that limit, the
// server (or GeoJSONLayer's client-side query engine) silently truncates
// the result and sets exceededTransferLimit instead of erroring. Looping
// with start/num until exceededTransferLimit is false ensures downstream
// consumers (like RestaurantList's sort) always operate on the complete
// set of restaurants actually in view, not a partial slice.
async function queryVisibleRestaurants(
  view: MapView,
  layer: GeoJSONLayer
): Promise<RestaurantProperties[]> {
  await layer.load();

  const baseQuery = layer.createQuery();
  baseQuery.geometry = view.extent;
  baseQuery.spatialRelationship = "intersects";
  baseQuery.returnGeometry = false;
  baseQuery.outFields = ["*"];

  const allFeatures: Graphic[] = [];
  let start = 0;

  while (true) {
    const query = baseQuery.clone();
    query.start = start;
    query.num = VISIBLE_QUERY_PAGE_SIZE;

    const result = await layer.queryFeatures(query);
    allFeatures.push(...result.features);

    if (!result.exceededTransferLimit || result.features.length === 0) {
      break;
    }
    start += VISIBLE_QUERY_PAGE_SIZE;
  }

  return allFeatures.map(
    (feature) => feature.attributes as RestaurantProperties
  );
}

type MapViewProps = {
  filters: Filters;
  selectedRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties | null) => void;
  onVisibleRestaurantsChange?: (restaurants: RestaurantProperties[]) => void;
};

export default function InspectionMapView({
  filters,
  selectedRestaurantId = null,
  onSelectRestaurant,
  onVisibleRestaurantsChange,
}: MapViewProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const featureEffectRef = useRef<FeatureEffect | null>(null);
  // Tracks the latest selectedRestaurantId so the filter effect (below,
  // which only depends on [filters, onVisibleRestaurantsChange]) can read
  // the current selection without needing selectedRestaurantId added to
  // its own dependency array -- that would make it re-run on every
  // selection change too, not just filter changes.
  const selectedRestaurantIdRef = useRef<string | null>(selectedRestaurantId);

  useEffect(() => {
    selectedRestaurantIdRef.current = selectedRestaurantId;
  }, [selectedRestaurantId]);

  useEffect(() => {
    if (!mapDivRef.current) return;

    const layer = new GeoJSONLayer({
      url: "/data/latest-inspections.geojson",
      title: "NYC Restaurant Inspections",
      renderer: renderer as any,
      outFields: ["*"],
      copyright: "NYC DOHMH | Cartography: Alex Hordal",
      labelingInfo: [labelClass],
      labelsVisible: true,
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
    viewRef.current = view;

    view.popupEnabled = false;

    const reportVisibleRestaurants = async () => {
      if (!onVisibleRestaurantsChange) return;
      try {
        const restaurants = await queryVisibleRestaurants(view, layer);
        onVisibleRestaurantsChange(restaurants);
      } catch (err) {
        console.error("MapView: failed to query visible restaurants", err);
      }
    };

    view.when(() => {
      reportVisibleRestaurants();
    });

    const stationaryWatchHandle = view.watch("stationary", (isStationary) => {
      if (isStationary) {
        reportVisibleRestaurants();
      }
    });

    const clickHandle = view.on("click", async (event) => {
      const response = await view.hitTest(event);
      await layer.load();

      const graphicHit = response.results.find(
        (result) => "graphic" in result && (result as any).graphic.layer === layer
      ) as { graphic: { attributes: RestaurantProperties } } | undefined;

      if (graphicHit) {
        if (onSelectRestaurant) {
          onSelectRestaurant(graphicHit.graphic.attributes);
        }
      } else {
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
      stationaryWatchHandle.remove();
      view.destroy();
    };
  }, []);

  // Applies (or clears) the map highlight for a given restaurant ID.
  // Shared by both the selection-sync effect and the filter effect below,
  // so filtering doesn't have to choose between "leave the old highlight
  // possibly stale" and "just wipe it" -- it can re-derive the correct
  // highlight for whatever's currently selected.
  async function applyHighlightForId(restaurantId: string | null) {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    await layer.load();
    const layerView = await view.whenLayerView(layer);

    if (!featureEffectRef.current) {
      featureEffectRef.current = new FeatureEffect({
        filter: NO_SELECTION_FILTER,
        includedEffect: "drop-shadow(0px, 0px, 8px, #ffffff) bloom(2, 0.5px, 0%)",
        excludedLabelsVisible: true,
      });
      layerView.featureEffect = featureEffectRef.current;
    }

    if (!restaurantId) {
      featureEffectRef.current.filter = NO_SELECTION_FILTER;
      return;
    }

    const query = layer.createQuery();
    query.where = `id = '${restaurantId}'`;
    query.returnGeometry = false;

    try {
      const result = await layer.queryFeatures(query);
      if (result.features.length > 0) {
        const feature = result.features[0];
        const idField = layer.objectIdField;
        const objectId = idField ? feature.attributes[idField] : null;

        if (objectId !== null && objectId !== undefined) {
          featureEffectRef.current.filter = new FeatureFilter({ objectIds: [objectId] });
        }
      } else {
        // The selected restaurant no longer matches the active
        // definitionExpression (filtered out by grade/borough) -- clear
        // the highlight since there's nothing on-screen to highlight,
        // even though it's still selected in the other panels.
        featureEffectRef.current.filter = NO_SELECTION_FILTER;
      }
    } catch (err) {
      console.error("MapView: failed to query feature for selection highlight", err);
    }
  }

  // Synchronize selection changes (from either map clicks or list selections)
  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    const applySelectionHighlight = async () => {
      await applyHighlightForId(selectedRestaurantId);

      if (!selectedRestaurantId) return;

      // Pan and zoom to point whenever selected (from map or list)
      const query = layer.createQuery();
      query.where = `id = '${selectedRestaurantId}'`;
      query.returnGeometry = true;

      try {
        const result = await layer.queryFeatures(query);
        if (result.features.length > 0 && result.features[0].geometry) {
          view.goTo(
            { target: result.features[0].geometry, zoom: Math.max(view.zoom, 14) },
            { duration: 500, easing: "ease-in-out" }
          );
        }
      } catch (err) {
        console.error("MapView: failed to query feature for pan/zoom", err);
      }
    };

    applySelectionHighlight();
  }, [selectedRestaurantId]);

  // Handle active filter updates
  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
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

    // Re-apply the highlight for whatever's currently selected, rather
    // than unconditionally clearing it -- filtering shouldn't remove the
    // map highlight for a restaurant that's still selected and still
    // matches the new filters. (If the selected restaurant no longer
    // matches, applyHighlightForId's own "not found" branch clears it,
    // which is correct in that specific case.)
    applyHighlightForId(selectedRestaurantIdRef.current);

    if (view && onVisibleRestaurantsChange) {
      queryVisibleRestaurants(view, layer)
        .then(onVisibleRestaurantsChange)
        .catch((err) =>
          console.error(
            "MapView: failed to query visible restaurants after filter change",
            err
          )
        );
    }
  }, [filters, onVisibleRestaurantsChange]);

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}