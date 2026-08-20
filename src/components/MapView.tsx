// MapView.tsx
//
// Displays the interactive ArcGIS map used by the dashboard.
//
// Creates the map and inspection layer, renders restaurants using the
// project's grading symbology, handles restaurant selection, keeps the
// displayed features synchronized with the active dashboard filters and
// search query, and reports the set of restaurants currently visible in
// the map's extent.
//
// Query/geometry logic (visible-restaurant queries, filter extent
// computation, selection-vs-filter checks) lives in ./mapQueries -- this
// file focuses on React state, effects, and ArcGIS event wiring.

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
} from "../types/mapQueries";

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

// Default map view -- used both for the initial load and to reset the
// camera when borough/search filters are cleared back to "none".
const DEFAULT_CENTER: [number, number] = [-73.98, 40.7];
const DEFAULT_ZOOM = 10;

// Grade/status tally for the current map view -- this is ALL GradeChart
// actually needs (five numbers), not the full restaurant array that used
// to be passed up for it. See onGradeCountsChange below and
// reportVisibleRestaurants' computation of this value.
export type GradeCounts = Record<"A" | "B" | "C" | "pending" | "closed", number>;

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
  // Grade-filtered -- reflects exactly what's rendered on the map right
  // now (extent + borough + search + grade). StatsPanel's "in map view"
  // count and RestaurantList both need this true, current-view set.
  onVisibleRestaurantsChange?: (restaurants: RestaurantProperties[]) => void;
  // Grade/status tally computed from extent + borough + search only, NOT
  // grade-filtered -- same underlying set buildDefinitionExpression
  // deliberately excludes grade from (see mapQueries.ts). This is what
  // GradeChart needs so a selected grade stays exploded/highlighted
  // among all five slices instead of collapsing the ring down to a
  // single 100% slice. Previously this delivered the full restaurant
  // array (up to ~27k objects at city zoom) just so GradeChart could
  // tally five numbers from it; now the tally is computed once here and
  // only the counts are passed up, since that's all GradeChart ever
  // read from the array.
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

  // Tracks the latest selectedRestaurantId AND the latest onSelectRestaurant
  // callback in refs, so the filter effect (below, which should only
  // re-run when FILTERS/search change) can read/call both without needing
  // them in its own dependency array -- Dashboard doesn't memoize
  // handleSelectRestaurant, so adding it directly as a dependency would
  // make this effect re-run on every Dashboard render, not just filter
  // changes.
  const selectedRestaurantIdRef = useRef<string | null>(selectedRestaurantId);
  const onSelectRestaurantRef = useRef(onSelectRestaurant);
  // Tracks the previous borough selection and search query so the filter
  // effect can tell whether either specifically changed (which should
  // move the camera) versus only GRADE changing (which never should).
  const prevBoroughsRef = useRef<string[]>(filters.boroughs);
  const prevSearchRef = useRef<string>(searchQuery);

  // Monotonically increasing counter, incremented every time a
  // visible-restaurants query is ISSUED. Rapid filter/search toggling can
  // fire several of these async queries in quick succession, and they are
  // NOT guaranteed to resolve in the order they were started -- a slow
  // but stale response can land AFTER a faster, newer one and silently
  // overwrite the correct result with an outdated one. Each query call
  // captures the counter's value at the moment it's issued as its own
  // "request ID"; when a query resolves, its result is only applied if
  // that ID still matches the counter's CURRENT value -- i.e., no newer
  // query has been issued since. Anything else is a stale, discarded
  // response.
  const queryRequestIdRef = useRef(0);

  // Kept in sync via the effect below so reportVisibleRestaurants
  // (declared once, at component scope -- see below) always reads the
  // CURRENT filters, no matter which effect's stale closure happens to
  // be calling it. Same pattern as selectedRestaurantIdRef/
  // onSelectRestaurantRef just above.
  const filtersRef = useRef(filters);

  // Guards against a click's fetchRestaurantDetail() call resolving
  // after a NEWER click has already fired -- e.g. clicking one
  // restaurant, then quickly clicking another (or empty map space)
  // before the first detail fetch finishes. Without this, a slow first
  // response could land after a faster second one and clobber the
  // correct, more recent selection with stale data.
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

  // Queries the restaurants visible in the current extent and reports
  // them: the grade-filtered set via onVisibleRestaurantsChange, and a
  // grade/status tally (computed from the ungraded set, before the
  // active grade filter is applied) via onGradeCountsChange. Declared
  // ONCE at component scope -- not nested inside either effect below --
  // specifically so both the mount effect's `stationary` watcher and
  // the filters-change effect call the exact same function and can
  // never drift into two different copies of this logic that read
  // filters differently. Reads filtersRef.current (never a plain
  // `filters` closure) so it's correct even when invoked from the mount
  // effect's long-lived, effectively-never-rerun closure.
  async function reportVisibleRestaurants(
    view: MapView,
    layer: GeoJSONLayer,
  ) {
    if (!onVisibleRestaurantsChange && !onGradeCountsChange) return;
    const requestId = ++queryRequestIdRef.current;
    try {
      const restaurants = await queryVisibleRestaurants(view, layer);
      if (requestId !== queryRequestIdRef.current) return;

      // Tally computed once here, from the ungraded set, so
      // onGradeCountsChange only ever needs to carry five numbers up to
      // Dashboard/GradeChart -- not a copy of every restaurant in view.
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

        if (activeGrades.includes("Closed") && category === "closed") return true;
        if (activeGrades.includes("Pending") && category === "pending") return true;
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
      renderer: renderer as any,
      // Trimmed to fields the dashboard actually displays/consumes --
      // see RESTAURANT_OUT_FIELDS in mapQueries.ts for what's excluded
      // and why. Deliberately excludes "violations" -- this list
      // controls what stays resident in memory for every one of the
      // layer's ~27,000 graphics, not just what's currently in view, so
      // keeping it lean matters a lot here. A restaurant's violations
      // text is fetched separately, only for the one restaurant a user
      // actually clicks -- see the click handler below.
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
          "graphic" in result && (result as any).graphic.layer === layer,
      ) as { graphic: { attributes: RestaurantProperties } } | undefined;

      const requestId = ++clickRequestIdRef.current;

      if (graphicHit) {
        if (onSelectRestaurant) {
          // The graphic's own attributes only carry RESTAURANT_OUT_FIELDS
          // (no "violations" -- see the layer's outFields comment above),
          // so fetch that one restaurant's complete record -- including
          // violations -- via a small targeted query instead of holding
          // it for all 27k graphics all the time.
          const id = graphicHit.graphic.attributes.id;

          try {
            const full = await fetchRestaurantDetail(layer, id);
            if (requestId !== clickRequestIdRef.current) return; // superseded by a newer click

            onSelectRestaurant(full ?? graphicHit.graphic.attributes);
          } catch (err) {
            console.error(
              "MapView: failed to fetch full restaurant detail",
              err,
            );
            if (requestId !== clickRequestIdRef.current) return;

            // Fall back to the lean attributes already on hand so
            // selection still works even if the detail fetch fails --
            // just without violations until re-clicked successfully.
            onSelectRestaurant(graphicHit.graphic.attributes);
          }
        }
      } else {
        if (onSelectRestaurant) {
          onSelectRestaurant(null);
        }
      }
    });

    // Hit-testing the map is a real WebGL raycast, not a cheap lookup --
    // pointer-move fires on every pixel of mouse movement, so testing on
    // every single event floods the map with dozens of overlapping async
    // hitTest calls per second of mouse movement. This throttles actual
    // hitTest calls to roughly once per POINTER_MOVE_THROTTLE_MS, always
    // using the freshest known pointer position when it fires (rather
    // than the position at the start of the throttle window). The
    // requestToken guard additionally protects against a slower, older
    // hitTest resolving AFTER a newer one and clobbering the cursor with
    // stale results -- throttling the call rate alone doesn't guarantee
    // in-order resolution, since each hitTest is still async and can
    // take a variable amount of time.
    const POINTER_MOVE_THROTTLE_MS = 60;
    let pointerMoveTimeoutId: number | null = null;
    // ArcGIS doesn't export a standalone type for this event (it's
    // produced via an overloaded `on()` signature), so this matches the
    // implicit `any` the event already had before it was hoisted out of
    // the inline handler -- consistent with the `as any` casts already
    // used elsewhere in this file for ArcGIS's hit-test result shapes.
    let latestPointerMoveEvent: any = null;
    let latestHitTestToken = 0;

    const runHitTest = async (event: any) => {
      const token = ++latestHitTestToken;
      const response = await view.hitTest(event);
      if (token !== latestHitTestToken) return; // superseded by a newer hitTest

      const isOverFeature = response.results.some(
        (result) =>
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

  // Applies (or clears) the map highlight for a given restaurant ID.
  // Optionally accepts an already-known objectId (from a prior query) to
  // skip a redundant re-fetch -- used by the filter effect below, which
  // now performs ONE combined query (checkSelectionAgainstFilters) rather
  // than a separate "does it still match" query followed by a second
  // "what's its objectId" query the way this used to work.
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

    // No pre-fetched objectId available (e.g. called from the selection
    // effect below, which doesn't already have this data) -- look it up.
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

  // Synchronize selection changes (from either map clicks or list selections)
  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    const applySelectionHighlight = async () => {
      await applyHighlightForId(selectedRestaurantId);

      if (!selectedRestaurantId) return;

      // Pan and zoom to point whenever selected (from map or list)
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

    // Grade is applied as a display-only filter on the LayerView, not on
    // the layer's definitionExpression above -- this hides non-matching
    // markers on the map without restricting what queryFeatures() can
    // see, so a selected grade still fully explodes/highlights in the
    // Grade Breakdown chart while the ring itself keeps showing the true,
    // ungraded breakdown for the current extent/borough/search. This is
    // independent of the selection-highlight FeatureEffect set up in
    // applyHighlightForId -- LayerView.filter and LayerView.featureEffect
    // are separate properties and apply together.
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

    // Detect whether BOROUGHS or SEARCH specifically changed, as opposed
    // to only GRADE changing -- only a borough or search change should
    // ever move the camera.
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
        // Grade no longer lives in newDefinitionExpression (see above),
        // but a selection SHOULD still be cleared if it no longer
        // matches the active grade filter -- so grade is folded back in
        // here, just for this one "does the selection still match"
        // check, without touching the layer's actual definitionExpression.
        const selectionCheckExpression = [newDefinitionExpression, gradeWhereClause]
          .filter(Boolean)
          .join(" AND ");

        // ONE combined query serves both "does the selection still
        // match the new filters" AND "what's its objectId for
        // highlighting" -- previously these were two separate round
        // trips to the layer.
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
        // Selected restaurant no longer falls within the active
        // grade/borough/search filters -- deselect it entirely, same as
        // a manual map deselect (clears List/Details/Report too, not
        // just the map highlight).
        onSelectRestaurantRef.current?.(null);
      } else {
        // Either nothing is selected, or the selection still matches --
        // keep/refresh its highlight using the objectId we already
        // fetched above, rather than issuing a second query for it.
        await applyHighlightForId(currentId, objectId);
      }

      // Camera behavior triggered only by borough or search changes.
      // Grade-only changes never reach this block. Tracks whether a
      // goTo() was ACTUALLY issued (not just attempted) -- cameraTrigger
      // alone isn't enough, since a search/borough combination that
      // matches nothing (count === 0) or resolves to the same view never
      // calls goTo, and in that case there's no future `stationary`
      // event to rely on for reporting the new visible set.
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

      // Report the new visible set right away UNLESS the camera is about
      // to pan/zoom -- in that case, querying now would read the
      // pre-transition extent (wrong), and the `stationary` watcher in
      // the mount effect above will correctly re-report once the camera
      // actually settles at the new extent. Both paths call the same
      // reportVisibleRestaurants function declared at component scope,
      // so there's exactly one implementation of this query+categorize
      // logic -- not two copies that can drift out of sync.
      if (view && !cameraWillMove) {
        await reportVisibleRestaurants(view, layer);
      }
    }

    syncSelectionAndZoom();
  }, [filters, searchQuery, onVisibleRestaurantsChange, onGradeCountsChange]);

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}
