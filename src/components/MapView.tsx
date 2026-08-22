//MapView.tsx
//
//Displays the ArcGIS map view with localized dot weighting, spatial filtering, a compact top-right icon-only legend trigger, interactive custom scale/zoom controllers, and hover cards.

import { useEffect, useRef, useCallback, useState } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import FeatureEffect from "@arcgis/core/layers/support/FeatureEffect";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

import esriConfig from "@arcgis/core/config";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import { CATEGORY_COLORS } from "../utils/gradeColours";
import { getGradeCategory } from "../utils/gradeCategory";
import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";
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
    {
      type: "size",
      valueExpression: scoreWeightExpression,
      stops: [
        { value: 0, size: 2.5 },
        { value: 13, size: 4.0 },
        { value: 14, size: 4.0 },
        { value: 27, size: 4.5 },
        { value: 28, size: 5.0 },
        { value: 45, size: 6.0 },
        { value: 60, size: 7.0 },
      ],
    },
    {
      type: "opacity",
      valueExpression: scoreWeightExpression,
      stops: [
        { value: 0, opacity: 0.7 },
        { value: 13, opacity: 0.75 },
        { value: 28, opacity: 0.95 },
        { value: 50, opacity: 1.0 },
      ],
    },
  ],
};

const HOVER_CARD_MAX_SCALE = 15000;

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

type HoverCardState = {
  x: number;
  y: number;
  name: string;
  category: keyof typeof CATEGORY_COLORS;
  gradeText: string;
  scoreText: string;
};

const MAP_LEGEND_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <p>
        The map visualizes geocoded restaurant inspection locations across New York City, updating dynamically as you pan, zoom, or apply filters.
      </p>
    }
    howToUse={
      <ul>
        <li>Click any restaurant marker on the map to load its inspection history, violations, and performance details.</li>
        <li>Hover over markers to preview restaurant names, grades, and scores directly on the map canvas (active when scale is 1:15,000 or larger).</li>
        <li>
          Click the <span className="map-control-button" style={{ display: "inline" }}>Map Scale</span> or <span className="map-control-button" style={{ display: "inline" }}>Zoom Lvl</span> indicators at the bottom left to manually type and jump to a specific map view.
        </li>
      </ul>
    }
    legend={
      <table className="details-table legend-table">
        <tbody>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.A }}>A</span>
            </td>
            <td>
              <div className="legend-scale-visual">
                <span className="dot-sample" style={{ width: "4px", height: "4px", backgroundColor: CATEGORY_COLORS.A }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "7px", height: "7px", backgroundColor: CATEGORY_COLORS.A }}></span>
              </div>
            </td>
            <td className="legend-score-text">0–13 pts</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.B }}>B</span>
            </td>
            <td>
              <div className="legend-scale-visual">
                <span className="dot-sample" style={{ width: "6px", height: "6px", backgroundColor: CATEGORY_COLORS.B }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "8px", height: "8px", backgroundColor: CATEGORY_COLORS.B }}></span>
              </div>
            </td>
            <td className="legend-score-text">14–27 pts</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.C }}>C</span>
            </td>
            <td>
              <div className="legend-scale-visual">
                <span className="dot-sample" style={{ width: "8px", height: "8px", backgroundColor: CATEGORY_COLORS.C }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "10px", height: "10px", backgroundColor: CATEGORY_COLORS.C }}></span>
              </div>
            </td>
            <td className="legend-score-text">28+ pts</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.pending }}>Pending</span>
            </td>
            <td>
              <div className="legend-scale-visual single-dot-align">
                <span className="dot-sample" style={{ width: "6px", height: "6px", backgroundColor: CATEGORY_COLORS.pending }}></span>
              </div>
            </td>
            <td className="legend-score-text">N / P / Z</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.closed }}>Closed</span>
            </td>
            <td>
              <div className="legend-scale-visual single-dot-align">
                <span className="dot-sample" style={{ width: "10px", height: "10px", backgroundColor: CATEGORY_COLORS.closed }}></span>
              </div>
            </td>
            <td className="legend-score-text"></td>
          </tr>
        </tbody>
      </table>
    }
  />
);

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
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const [currentScale, setCurrentScale] = useState<number>(DEFAULT_ZOOM);
  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_ZOOM);

  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInputVal, setZoomInputVal] = useState("");

  const [isEditingScale, setIsEditingScale] = useState(false);
  const [scaleInputVal, setScaleInputVal] = useState("");

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

  const handleZoomInputSubmit = () => {
    setIsEditingZoom(false);
    const parsedZoom = parseFloat(zoomInputVal);
    const view = viewRef.current;

    if (!Number.isNaN(parsedZoom) && view) {
      const clampedZoom = Math.max(1, Math.min(20, parsedZoom));
      view.goTo({ zoom: clampedZoom }, { duration: 400 });
    }
  };

  const handleScaleInputSubmit = () => {
    setIsEditingScale(false);
    const cleaned = scaleInputVal.replace(/,/g, "");
    const parsedScale = parseFloat(cleaned);
    const view = viewRef.current;

    if (!Number.isNaN(parsedScale) && parsedScale > 0 && view) {
      view.goTo({ scale: parsedScale }, { duration: 400 });
    }
  };

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
      copyright: "NYC DOHMH |",
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

    // Set initial scale and zoom values
    setCurrentScale(Math.round(view.scale));
    setCurrentZoom(Math.round(view.zoom * 10) / 10);

    // Watch view scale and zoom reactively
    const scaleWatchHandle = reactiveUtils.watch(
      () => view.scale,
      (scale) => {
        setCurrentScale(Math.round(scale));
      }
    );

    const zoomWatchHandle = reactiveUtils.watch(
      () => view.zoom,
      (zoom) => {
        setCurrentZoom(Math.round(zoom * 10) / 10);
      }
    );

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
      setHoverCard(null);

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

      if (graphicHit && view.scale <= HOVER_CARD_MAX_SCALE) {
        const attrs = graphicHit.graphic.attributes;
        const category = getGradeCategory(
          attrs.action,
          attrs.grade,
          attrs.score,
        );

        setHoverCard({
          x: event.x,
          y: event.y,
          name: attrs.name,
          category,
          gradeText: category === "closed" ? "Closed" : (attrs.grade ?? "—"),
          scoreText: attrs.score != null ? String(attrs.score) : "—",
        });
      } else {
        setHoverCard(null);
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

    const handlePointerLeaveContainer = () => {
      setHoverCard(null);
      if (view.container) {
        view.container.style.cursor = "default";
      }
      onHoverRestaurantRef.current?.(null);
    };
    view.container?.addEventListener(
      "mouseleave",
      handlePointerLeaveContainer,
    );

    return () => {
      clickHandle.remove();
      pointerMoveHandle.remove();
      if (pointerMoveTimeoutId !== null) {
        window.clearTimeout(pointerMoveTimeoutId);
      }
      view.container?.removeEventListener(
        "mouseleave",
        handlePointerLeaveContainer,
      );
      scaleWatchHandle.remove();
      zoomWatchHandle.remove();
      stationaryWatchHandle.remove();
      view.destroy();
    };
  }, [applyHighlightForId]);

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
      <div className="map-view-top-header">
        <PanelHeader
          title=""
          infoContent={MAP_LEGEND_INFO_CONTENT}
        />
      </div>
      <div className="map-canvas-wrapper">
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

        <div className="map-bottom-controls">
          <div className="map-control-label">
            <span>MAP SCALE: 1:</span>
            {isEditingScale ? (
              <input
                type="text"
                autoFocus
                value={scaleInputVal}
                onChange={(e) => setScaleInputVal(e.target.value)}
                onBlur={handleScaleInputSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScaleInputSubmit();
                  if (e.key === "Escape") setIsEditingScale(false);
                }}
                className="map-control-input scale-input"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setScaleInputVal(String(currentScale));
                  setIsEditingScale(true);
                }}
                title="Click to type a map scale denominator"
                className="map-control-button"
              >
                {currentScale.toLocaleString()}
              </button>
            )}
          </div>

          <div className="map-control-label">
            <span>Zoom Lvl:</span>
            {isEditingZoom ? (
              <input
                type="number"
                step="0.1"
                min="1"
                max="20"
                autoFocus
                value={zoomInputVal}
                onChange={(e) => setZoomInputVal(e.target.value)}
                onBlur={handleZoomInputSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleZoomInputSubmit();
                  if (e.key === "Escape") setIsEditingZoom(false);
                }}
                className="map-control-input zoom-input"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setZoomInputVal(String(currentZoom));
                  setIsEditingZoom(true);
                }}
                title="Click to type a zoom level"
                className="map-control-button"
              >
                {currentZoom}
              </button>
            )}
          </div>
        </div>

        {hoverCard && (
          <div
            className="map-hover-card"
            style={{
              position: "absolute",
              left: hoverCard.x + 12,
              top: hoverCard.y + 12,
              pointerEvents: "none",
            }}
          >
            <span
              className="map-hover-card-name"
              style={{ color: CATEGORY_COLORS[hoverCard.category] }}
            >
              {hoverCard.name}
            </span>
            <div className="map-hover-card-stats">
              <div className="badge-box">
                <span className="badge-label">GRADE</span>
                <span
                  className="badge-val"
                  style={{ color: CATEGORY_COLORS[hoverCard.category] }}
                >
                  {hoverCard.gradeText}
                </span>
              </div>
              <div className="badge-box">
                <span className="badge-label">SCORE</span>
                <span
                  className="badge-val"
                  style={{ color: CATEGORY_COLORS[hoverCard.category] }}
                >
                  {hoverCard.scoreText}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}