// MapView.tsx
//
// Interactive ArcGIS map. Creates the map/layer, renders restaurants
// with grading symbology, handles selection, and keeps displayed
// features synced with active filters/search.
//
// Query/geometry logic lives in ../queries/mapQueries -- this file is
// just React state, effects, and ArcGIS event wiring.

import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import FeatureEffect from "@arcgis/core/layers/support/FeatureEffect";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";

import esriConfig from "@arcgis/core/config";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import { CATEGORY_COLORS } from "../utils/gradeColours";
import { getGradeCategory } from "../utils/gradeCategory";
import {
  buildDefinitionExpression,
  buildGradeWhereClause,
  queryVisibleRestaurants,
  fetchRestaurantDetail,
  checkSelectionAgainstFilters,
  queryFilterExtent,
  RESTAURANT_OUT_FIELDS,
} from "../queries/mapQueries";

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
    {
      value: "A",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.A,
        outline: { color: "#1a1a1a", width: 0.5 },
        size: 5,
      },
    },
    {
      value: "B",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.B,
        outline: { color: "#1a1a1a", width: 0.5 },
        size: 5,
      },
    },
    {
      value: "C",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.C,
        outline: { color: "#1a1a1a", width: 0.5 },
        size: 5,
      },
    },
    {
      value: "pending",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.pending,
        outline: { color: "#1a1a1a", width: 0.5 },
        size: 5,
      },
    },
    {
      value: "closed",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.closed,
        outline: { color: "#1a1a1a", width: 1 },
        size: 5,
      },
    },
  ],
};

// Labels appear at or below scale 1:2,000.
const LABEL_MIN_SCALE = 2000;

const labelClass = new LabelClass({
  labelExpressionInfo: { expression: "$feature.name" },
  symbol: {
    type: "text",
    color: "#ffffff",
    haloColor: "#000000",
    haloSize: 1,
    font: { size: 10, family: "sans-serif", weight: "bold" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  labelPlacement: "above-right",
  minScale: LABEL_MIN_SCALE,
  maxScale: 0,
});

// objectIds: [-1] reliably matches nothing -- used as "no selection".
const NO_SELECTION_FILTER = new FeatureFilter({ objectIds: [-1] });

// Default camera -- initial load, and reset when filters clear to none.
const DEFAULT_CENTER: [number, number] = [-73.98, 40.7];
const DEFAULT_ZOOM = 10;

// Five-number grade/status tally for the current view -- all GradeChart
// needs, instead of the full restaurant array.
export type GradeCounts = Record<
  "A" | "B" | "C" | "pending" | "closed",
  number
>;

const EMPTY_GRADE_COUNTS: GradeCounts = {
  A: 0,
  B: 0,
  C: 0,
  pending: 0,
  closed: 0,
};

type MapViewProps = {
  filters: Filters;
  searchQuery?: string;
  selectedRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties | null) => void;
  // Grade-filtered: exactly what's rendered right now (extent + borough
  // + search + grade). Used by StatsPanel and RestaurantList.
  onVisibleRestaurantsChange?: (restaurants: RestaurantProperties[]) => void;
  // NOT grade-filtered (extent + borough + search only), so GradeChart's
  // selected slice stays exploded instead of the ring collapsing to 100%.
  onGradeCountsChange?: (counts: GradeCounts) => void;
};

export default function InspectionMapView({
  filters,
  searchQuery = "",
  selectedRestaurantId = null,
  onSelectRestaurant,
  onVisibleRestaurantsChange,
  onGradeCountsChange,
}: MapViewProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const featureEffectRef = useRef<FeatureEffect | null>(null);

  // Refs for props/state the mount effect (deps []) and filter effect
  // need to read WITHOUT adding as a dependency -- Dashboard doesn't
  // memoize its callbacks, so depending on them directly would re-run
  // these effects on every Dashboard render, not just real changes.
  const selectedRestaurantIdRef = useRef<string | null>(selectedRestaurantId);
  const onSelectRestaurantRef = useRef(onSelectRestaurant);
  const filtersRef = useRef(filters);
  const onVisibleRestaurantsChangeRef = useRef(onVisibleRestaurantsChange);
  const onGradeCountsChangeRef = useRef(onGradeCountsChange);

  // Previous borough/search values, so the filter effect can tell
  // whether either changed (moves the camera) vs. only grade changing
  // (never moves the camera).
  const prevBoroughsRef = useRef<string[]>(filters.boroughs);
  const prevSearchRef = useRef<string>(searchQuery);

  // Request-ID guards: async queries can resolve out of order, so each
  // one only applies its result if no newer request has been issued
  // since. queryRequestIdRef covers visible-restaurant queries,
  // clickRequestIdRef covers a click's detail fetch.
  const queryRequestIdRef = useRef(0);
  const clickRequestIdRef = useRef(0);

  useEffect(() => {
    selectedRestaurantIdRef.current = selectedRestaurantId;
  }, [selectedRestaurantId]);

  useEffect(() => {
    onSelectRestaurantRef.current = onSelectRestaurant;
  }, [onSelectRestaurant]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    onVisibleRestaurantsChangeRef.current = onVisibleRestaurantsChange;
  }, [onVisibleRestaurantsChange]);

  useEffect(() => {
    onGradeCountsChangeRef.current = onGradeCountsChange;
  }, [onGradeCountsChange]);

  // Queries restaurants visible in the current extent and reports the
  // grade-filtered set + grade/status tally. Declared once at component
  // scope so the mount effect's `stationary` watcher and the filter
  // effect share one implementation. Reads everything via refs so it's
  // correct even called from the mount effect's long-lived closure.
  async function reportVisibleRestaurants(view: MapView, layer: GeoJSONLayer) {
    const onVisibleRestaurantsChange = onVisibleRestaurantsChangeRef.current;
    const onGradeCountsChange = onGradeCountsChangeRef.current;

    if (!onVisibleRestaurantsChange && !onGradeCountsChange) return;
    const requestId = ++queryRequestIdRef.current;
    try {
      const restaurants = await queryVisibleRestaurants(view, layer);
      if (requestId !== queryRequestIdRef.current) return;

      if (onGradeCountsChange) {
        const counts: GradeCounts = { ...EMPTY_GRADE_COUNTS };
        for (const r of restaurants) {
          const category = getGradeCategory(r.action, r.grade, r.score);
          if (counts[category] !== undefined) {
            counts[category] += 1;
          }
        }
        onGradeCountsChange(counts);
      }

      const activeGrades = filtersRef.current.grades;
      const filteredRestaurants = restaurants.filter((r) => {
        if (activeGrades.length === 0) return true;

        const status = r.current_status_code;
        const grade = r.grade;
        const score = r.score;

        let category = "C";
        if (status === "closed") {
          category = "closed";
        } else if (grade === "Z" || grade === "P" || grade === "N") {
          category = "pending";
        } else if (score <= 13) {
          category = "A";
        } else if (score <= 27) {
          category = "B";
        }

        if (activeGrades.includes("Closed") && category === "closed")
          return true;
        if (activeGrades.includes("Pending") && category === "pending")
          return true;
        if (grade && activeGrades.includes(grade)) return true;

        return false;
      });

      onVisibleRestaurantsChange?.(filteredRestaurants);
    } catch (err) {
      console.error("MapView: failed to query visible restaurants", err);
    }
  }

  useEffect(() => {
    if (!mapDivRef.current) return;

    const layer = new GeoJSONLayer({
      url: "/data/latest-inspections.geojson",
      title: "NYC Restaurant Inspections",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer: renderer as any,
      // Excludes "violations" -- see RESTAURANT_OUT_FIELDS in
      // mapQueries.ts. Kept lean since this stays resident for all
      // ~27k graphics, not just what's in view. Violations are fetched
      // separately per-restaurant on click (see click handler below).
      outFields: RESTAURANT_OUT_FIELDS,
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
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      constraints: { snapToZoom: false },
    });
    viewRef.current = view;

    view.popupEnabled = false;

    view.when(() => {
      reportVisibleRestaurants(view, layer);
    });

    const stationaryWatchHandle = reactiveUtils.watch(
      () => view.stationary,
      (isStationary) => {
        if (isStationary) {
          reportVisibleRestaurants(view, layer);
        }
      },
    );

    const clickHandle = view.on("click", async (event) => {
      const response = await view.hitTest(event);
      await layer.load();

      const graphicHit = response.results.find(
        (result) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "graphic" in result && (result as any).graphic.layer === layer,
      ) as { graphic: { attributes: RestaurantProperties } } | undefined;

      const requestId = ++clickRequestIdRef.current;

      if (graphicHit) {
        if (onSelectRestaurantRef.current) {
          // Graphic attributes only carry RESTAURANT_OUT_FIELDS (no
          // violations) -- fetch the full record for just this one
          // restaurant instead of holding it for all 27k.
          const id = graphicHit.graphic.attributes.id;

          try {
            const full = await fetchRestaurantDetail(layer, id);
            if (requestId !== clickRequestIdRef.current) return; // stale click

            onSelectRestaurantRef.current(
              full ?? graphicHit.graphic.attributes,
            );
          } catch (err) {
            console.error(
              "MapView: failed to fetch full restaurant detail",
              err,
            );
            if (requestId !== clickRequestIdRef.current) return;

            // Fall back to the lean attributes so selection still
            // works even if the detail fetch fails.
            onSelectRestaurantRef.current(graphicHit.graphic.attributes);
          }
        }
      } else {
        if (onSelectRestaurantRef.current) {
          onSelectRestaurantRef.current(null);
        }
      }
    });

    // Throttles hit-testing (a real WebGL raycast) to roughly once per
    // POINTER_MOVE_THROTTLE_MS, always using the latest pointer
    // position. The token guard also drops a slow hitTest that resolves
    // after a newer one.
    const POINTER_MOVE_THROTTLE_MS = 60;
    let pointerMoveTimeoutId: number | null = null;
    // ArcGIS doesn't export a type for this event (overloaded `on()`).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let latestPointerMoveEvent: any = null;
    let latestHitTestToken = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runHitTest = async (event: any) => {
      const token = ++latestHitTestToken;
      const response = await view.hitTest(event);
      if (token !== latestHitTestToken) return; // superseded

      const isOverFeature = response.results.some(
        (result) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "graphic" in result && (result as any).graphic.layer === layer,
      );
      if (view.container) {
        view.container.style.cursor = isOverFeature ? "pointer" : "default";
      }
    };

    const pointerMoveHandle = view.on("pointer-move", (event) => {
      latestPointerMoveEvent = event;
      if (pointerMoveTimeoutId !== null) return;

      pointerMoveTimeoutId = window.setTimeout(() => {
        pointerMoveTimeoutId = null;
        const eventToTest = latestPointerMoveEvent;
        latestPointerMoveEvent = null;
        if (eventToTest) void runHitTest(eventToTest);
      }, POINTER_MOVE_THROTTLE_MS);
    });

    return () => {
      clickHandle.remove();
      pointerMoveHandle.remove();
      if (pointerMoveTimeoutId !== null) {
        window.clearTimeout(pointerMoveTimeoutId);
      }
      stationaryWatchHandle.remove();
      view.destroy();
    };
  }, []);

  // Applies/clears the map highlight for a restaurant ID. Accepts an
  // already-known objectId to skip a redundant query.
  async function applyHighlightForId(
    restaurantId: string | null,
    knownObjectId?: number | null,
  ) {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    await layer.load();
    const layerView = await view.whenLayerView(layer);

    if (!featureEffectRef.current) {
      featureEffectRef.current = new FeatureEffect({
        filter: NO_SELECTION_FILTER,
        includedEffect:
          "drop-shadow(0px, 0px, 8px, #ffffff) bloom(2, 0.5px, 0%)",
        excludedLabelsVisible: true,
      });
      layerView.featureEffect = featureEffectRef.current;
    }

    if (!restaurantId) {
      featureEffectRef.current.filter = NO_SELECTION_FILTER;
      return;
    }

    if (knownObjectId !== undefined) {
      featureEffectRef.current.filter =
        knownObjectId !== null
          ? new FeatureFilter({ objectIds: [knownObjectId] })
          : NO_SELECTION_FILTER;
      return;
    }

    // No pre-fetched objectId (e.g. called from the selection effect
    // below) -- look it up.
    try {
      const { objectId } = await checkSelectionAgainstFilters(
        layer,
        restaurantId,
        layer.definitionExpression ?? "",
      );
      featureEffectRef.current.filter =
        objectId !== null
          ? new FeatureFilter({ objectIds: [objectId] })
          : NO_SELECTION_FILTER;
    } catch (err) {
      console.error(
        "MapView: failed to query feature for selection highlight",
        err,
      );
    }
  }

  // Synchronize selection changes (from map clicks or list selections)
  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    const applySelectionHighlight = async () => {
      await applyHighlightForId(selectedRestaurantId);

      if (!selectedRestaurantId) return;

      // Pan/zoom to the point whenever selected (map or list).
      try {
        const { geometry } = await checkSelectionAgainstFilters(
          layer,
          selectedRestaurantId,
          "",
          { returnGeometry: true },
        );
        if (geometry) {
          view.goTo(
            { target: geometry, zoom: Math.max(view.zoom, 14) },
            { duration: 500, easing: "ease-in-out" },
          );
        }
      } catch (err) {
        console.error("MapView: failed to query feature for pan/zoom", err);
      }
    };

    applySelectionHighlight();
  }, [selectedRestaurantId]);

  // Handle active filter and search updates
  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer) return;

    const newDefinitionExpression = buildDefinitionExpression(
      filters,
      searchQuery,
    );
    layer.definitionExpression = newDefinitionExpression;

    // Grade applies as a display-only LayerView filter, not on
    // definitionExpression -- hides non-matching markers without
    // restricting queryFeatures(), so a selected grade still fully
    // explodes in the Grade chart while the ring shows the true
    // ungraded breakdown. Independent of the selection FeatureEffect.
    const gradeWhereClause = buildGradeWhereClause(filters.grades);
    if (view) {
      view
        .whenLayerView(layer)
        .then((layerView) => {
          layerView.filter = gradeWhereClause
            ? new FeatureFilter({ where: gradeWhereClause })
            : null;
        })
        .catch((err) => {
          console.error(
            "MapView: failed to apply grade filter to layer view",
            err,
          );
        });
    }

    // Only a borough or search change should move the camera, not grade.
    const prevBoroughsSorted = [...prevBoroughsRef.current].sort().join(",");
    const nextBoroughsSorted = [...filters.boroughs].sort().join(",");
    const boroughsChanged = prevBoroughsSorted !== nextBoroughsSorted;
    prevBoroughsRef.current = filters.boroughs;

    const searchChanged = prevSearchRef.current !== searchQuery;
    prevSearchRef.current = searchQuery;

    const cameraTrigger = boroughsChanged || searchChanged;

    async function syncSelectionAndZoom() {
      if (!layer) return;

      const currentId = selectedRestaurantIdRef.current;
      let stillMatches = false;
      let objectId: number | string | null = null;

      if (currentId) {
        // Grade isn't in newDefinitionExpression (see above), but a
        // selection should still clear if it no longer matches the
        // active grade filter -- fold it back in just for this check.
        const selectionCheckExpression = [
          newDefinitionExpression,
          gradeWhereClause,
        ]
          .filter(Boolean)
          .join(" AND ");

        // One combined query for both "still matches" and "objectId".
        try {
          const checkResult = await checkSelectionAgainstFilters(
            layer,
            currentId,
            selectionCheckExpression,
          );
          stillMatches = checkResult.stillMatches;
          objectId = checkResult.objectId;
        } catch (err) {
          console.error(
            "MapView: failed to verify selection against new filters",
            err,
          );
        }
      }

      if (currentId && !stillMatches) {
        // No longer matches active filters -- deselect entirely (clears
        // List/Details/Report too, not just the map highlight).
        onSelectRestaurantRef.current?.(null);
      } else {
        // Nothing selected, or selection still matches -- refresh its
        // highlight using the objectId already fetched above.
        await applyHighlightForId(currentId, objectId);
      }

      // Tracks whether goTo() actually fired -- a search/borough combo
      // that matches nothing or resolves to the same view never calls
      // goTo, so there's no future `stationary` event to report from.
      let cameraWillMove = false;

      if (cameraTrigger && view) {
        if (newDefinitionExpression) {
          try {
            const { count, extent, isDegenerate } = await queryFilterExtent(
              layer,
              newDefinitionExpression,
            );

            if (count > 0 && extent) {
              cameraWillMove = true;
              if (isDegenerate) {
                view.goTo({ center: extent.center, zoom: 16 });
              } else {
                view.goTo(extent.expand(1.2));
              }
            }
          } catch (err) {
            console.error(
              "MapView: failed to compute filter/search extent",
              err,
            );
          }
        } else {
          cameraWillMove = true;
          view.goTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
        }
      }

      // Report the new visible set now, unless the camera is about to
      // move -- the `stationary` watcher above reports once it settles.
      if (view && !cameraWillMove) {
        await reportVisibleRestaurants(view, layer);
      }
    }

    syncSelectionAndZoom();
  }, [filters, searchQuery, onVisibleRestaurantsChange, onGradeCountsChange]);

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}
