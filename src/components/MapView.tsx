// src/components/MapView.tsx

import { useEffect, useRef, useCallback } from "react";
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

// Calculate a score weight to drive size and opacity
// Closed = highest weight (60), Pending = moderate (20)
const scoreWeightExpression = `
  var status = $feature.current_status_code;
  if (status == "closed") {
    return 60;
  }
  var g = $feature.grade;
  if (g == "Z" || g == "P" || g == "N") {
    return 20;
  }
  var s = $feature.score;
  if (IsEmpty(s) || s < 0) return 0;
  return s;
`;

const pointsRenderer = {
  type: "unique-value",
  valueExpression: gradeCategoryExpression,
  defaultSymbol: {
    type: "simple-marker",
    color: "#FFFFFF",
    outline: { color: "rgba(26, 26, 26, 0.8)", width: 0.5 },
  },
  uniqueValueInfos: [
    {
      value: "A",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.A,
        outline: { color: "rgba(26, 26, 26, 0.8)", width: 0.5 },
      },
    },
    {
      value: "B",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.B,
        outline: { color: "rgba(26, 26, 26, 0.8)", width: 0.5 },
      },
    },
    {
      value: "C",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.C,
        outline: { color: "rgba(26, 26, 26, 0.8)", width: 0.5 },
      },
    },
    {
      value: "pending",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.pending,
        outline: { color: "rgba(26, 26, 26, 0.8)", width: 0.5 },
      },
    },
    {
      value: "closed",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.closed,
        outline: { color: "rgba(26, 26, 26, 0.8)", width: 0.5 },
      },
    },
  ],
  visualVariables: [
    // Size weighted by score severity
    {
      type: "size",
      valueExpression: scoreWeightExpression,
      stops: [
        { value: 0, size: 2.5 },   // Grade A baseline (3.5px)
        { value: 13, size: 4.0 },  // Grade A ceiling (4.0px)
        { value: 14, size: 4.0 },  // Grade B floor (4.0px)
        { value: 27, size: 4.5 },  // Grade B ceiling (4.5px)
        { value: 28, size: 5.0 },  // Grade C floor (5.0px)
        { value: 45, size: 6.0 },  // Grade C high violations (6.0px)
        { value: 60, size: 7.0 },  // Closed (7.0px)
      ],
    },
    // Opacity weighted by score severity
    {
      type: "opacity",
      valueExpression: scoreWeightExpression,
      stops: [
        { value: 0, opacity: 0.7 },   // Grade A blends subtly into background
        { value: 13, opacity: 0.75 },
        { value: 28, opacity: 0.95 }, // C grades are crisp
        { value: 50, opacity: 1.0 },  // Problem spots pop at 100% opacity
      ],
    },
  ],
};

const LABEL_MIN_SCALE = 2000;

const labelClass = new LabelClass({
labelExpressionInfo: { expression: "Upper($feature.name)" },
  symbol: {
    type: "text",
    color: "#ffffff",
    haloColor: "rgba(56, 57, 57, 0.75)",
    haloSize: 4,
    font: { size: 9, family: "Open Sans", weight: "bold" },
    xoffset: 2,
    yoffset: 2,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  labelPlacement: "above-right",
  minScale: LABEL_MIN_SCALE,
  maxScale: 0,
});

const NO_SELECTION_FILTER = new FeatureFilter({ objectIds: [-1] });

const DEFAULT_CENTER: [number, number] = [-73.98, 40.7];
const DEFAULT_ZOOM = 9.75;

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
  onHoverRestaurant?: (restaurant: RestaurantProperties | null) => void;
  onVisibleRestaurantsChange?: (restaurants: RestaurantProperties[]) => void;
  onGradeCountsChange?: (counts: GradeCounts) => void;
};

export default function InspectionMapView({
  filters,
  searchQuery = "",
  selectedRestaurantId = null,
  onSelectRestaurant,
  onHoverRestaurant,
  onVisibleRestaurantsChange,
  onGradeCountsChange,
}: MapViewProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const featureEffectRef = useRef<FeatureEffect | null>(null);

  const selectedRestaurantIdRef = useRef<string | null>(selectedRestaurantId);
  const onSelectRestaurantRef = useRef(onSelectRestaurant);
  const onHoverRestaurantRef = useRef(onHoverRestaurant);
  const filtersRef = useRef(filters);
  const onVisibleRestaurantsChangeRef = useRef(onVisibleRestaurantsChange);
  const onGradeCountsChangeRef = useRef(onGradeCountsChange);

  const prevBoroughsRef = useRef<string[]>(filters.boroughs);
  const prevSearchRef = useRef<string>(searchQuery);

  const queryRequestIdRef = useRef(0);
  const clickRequestIdRef = useRef(0);

  useEffect(() => {
    selectedRestaurantIdRef.current = selectedRestaurantId;
  }, [selectedRestaurantId]);

  useEffect(() => {
    onSelectRestaurantRef.current = onSelectRestaurant;
  }, [onSelectRestaurant]);

  useEffect(() => {
    onHoverRestaurantRef.current = onHoverRestaurant;
  }, [onHoverRestaurant]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    onVisibleRestaurantsChangeRef.current = onVisibleRestaurantsChange;
  }, [onVisibleRestaurantsChange]);

  useEffect(() => {
    onGradeCountsChangeRef.current = onGradeCountsChange;
  }, [onGradeCountsChange]);

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

  const applyHighlightForId = useCallback(
    async (
      restaurantId: string | null,
      knownObjectId?: number | null,
    ) => {
      const layer = layerRef.current;
      const view = viewRef.current;
      if (!layer || !view) return;

      await layer.load();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layerView = (await view.whenLayerView(layer)) as any;

      if (!featureEffectRef.current) {
        featureEffectRef.current = new FeatureEffect({
          filter: NO_SELECTION_FILTER,
          includedEffect:
            "drop-shadow(0px, 0px, 8px, #ffffff) bloom(2, 0.5px, 0%)",
          excludedLabelsVisible: true,
        });
      }

      if (layerView.featureEffect !== featureEffectRef.current) {
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
          "MapView: failed to query feature for highlight effect",
          err,
        );
      }
    },
    [],
  );

  // Sync highlight strictly on selection change
  useEffect(() => {
    void applyHighlightForId(selectedRestaurantId);
  }, [selectedRestaurantId, applyHighlightForId]);

  useEffect(() => {
    if (!mapDivRef.current) return;

    const layer = new GeoJSONLayer({
      url: "/data/latest-inspections.geojson",
      title: "NYC Restaurant Inspections",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer: pointsRenderer as any,
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
      void applyHighlightForId(selectedRestaurantIdRef.current);
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
          const id = graphicHit.graphic.attributes.id;

          try {
            const full = await fetchRestaurantDetail(layer, id);
            if (requestId !== clickRequestIdRef.current) return;

            onSelectRestaurantRef.current(
              full ?? graphicHit.graphic.attributes,
            );
          } catch (err) {
            console.error(
              "MapView: failed to fetch full restaurant detail",
              err,
            );
            if (requestId !== clickRequestIdRef.current) return;

            onSelectRestaurantRef.current(graphicHit.graphic.attributes);
          }
        }
      } else {
        if (onSelectRestaurantRef.current) {
          onSelectRestaurantRef.current(null);
        }
      }
    });

    const POINTER_MOVE_THROTTLE_MS = 60;
    let pointerMoveTimeoutId: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let latestPointerMoveEvent: any = null;
    let latestHitTestToken = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runHitTest = async (event: any) => {
      const token = ++latestHitTestToken;
      const response = await view.hitTest(event);
      if (token !== latestHitTestToken) return;

      const graphicHit = response.results.find(
        (result) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "graphic" in result && (result as any).graphic.layer === layer,
      ) as { graphic: { attributes: RestaurantProperties } } | undefined;

      if (view.container) {
        view.container.style.cursor = graphicHit ? "pointer" : "default";
      }

      if (graphicHit) {
        onHoverRestaurantRef.current?.(graphicHit.graphic.attributes);
      } else {
        onHoverRestaurantRef.current?.(null);
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
  }, [applyHighlightForId]);

  // Camera pan/zoom on selection change
  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    const handleCameraMove = async () => {
      if (selectedRestaurantId) {
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
      }
    };

    handleCameraMove();
  }, [selectedRestaurantId]);

  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer) return;

    const newDefinitionExpression = buildDefinitionExpression(
      filters,
      searchQuery,
    );
    layer.definitionExpression = newDefinitionExpression;

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
        const selectionCheckExpression = [
          newDefinitionExpression,
          gradeWhereClause,
        ]
          .filter(Boolean)
          .join(" AND ");

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
        onSelectRestaurantRef.current?.(null);
      } else {
        await applyHighlightForId(currentId, objectId);
      }

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

      if (view && !cameraWillMove) {
        await reportVisibleRestaurants(view, layer);
      }
    }

    syncSelectionAndZoom();
  }, [filters, searchQuery, onVisibleRestaurantsChange, onGradeCountsChange, applyHighlightForId]);

  return (
    <div className="map-view-container">
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}