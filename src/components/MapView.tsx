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
import MapScaleBar from "./MapScaleBar";
import MapScaleZoomControls from "./MapScaleZoomControls";
import MapBasemapToggle from "./MapBasemapToggle";
import MapCompass from "./MapCompass";
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
  if (g == "U") {
    return "uninspected";
  }
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
  var s = $feature.score;
  if (!IsEmpty(s) && s >= 0) {
    return s;
  }
  return 20;
`;

const pointsRenderer = {
  type: "unique-value",
  valueExpression: gradeCategoryExpression,
  defaultSymbol: {
    type: "simple-marker",
    color: "#FFFFFF",
    outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
  },
  uniqueValueInfos: [
    {
      value: "A",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.A,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "B",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.B,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "C",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.C,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "pending",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.pending,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "uninspected",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.uninspected,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
      },
    },
    {
      value: "closed",
      symbol: {
        type: "simple-marker",
        color: CATEGORY_COLORS.closed,
        outline: { color: "rgba(26, 26, 26, 1)", width: 0.5 },
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

const HOVER_CARD_MAX_SCALE = 18056;

const NO_SELECTION_FILTER = new FeatureFilter({ objectIds: [-1] });

const DEFAULT_CENTER: [number, number] = [-73.98, 40.7];
const DEFAULT_ZOOM = 9.75;

export type GradeCounts = Record<
  "A" | "B" | "C" | "pending" | "uninspected" | "closed",
  number
>;

const EMPTY_GRADE_COUNTS: GradeCounts = {
  A: 0,
  B: 0,
  C: 0,
  pending: 0,
  uninspected: 0,
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
        <li>Hover over markers to preview restaurant names, grades, and scores directly on the map canvas (active when scale is 1:18,056 or larger).</li>
        <li>
          Click the <span className="map-control-button" style={{ display: "inline" }}>Map Scale</span> or <span className="map-control-button" style={{ display: "inline" }}>Zoom Lvl</span> indicators at the bottom left to manually type and jump to a specific map view, or use the zoom buttons in the top-left corner.
        </li>
        <li>Click and hold the right mouse button to rotate the map; click the compass icon below the zoom buttons to reorient to north.</li>
        <li>Click the satellite/map icon in the top-right corner to toggle between the default map and satellite imagery.</li>
        <li>The scale bar in the bottom-right corner shows the current map scale as a ruler.</li>
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
                <span className="dot-sample" style={{ width: "4px", height: "4px", backgroundColor: CATEGORY_COLORS.A, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "6px", height: "6px", backgroundColor: CATEGORY_COLORS.A, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
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
                <span className="dot-sample" style={{ width: "6px", height: "6px", backgroundColor: CATEGORY_COLORS.B, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "8px", height: "8px", backgroundColor: CATEGORY_COLORS.B, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
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
                <span className="dot-sample" style={{ width: "8px", height: "8px", backgroundColor: CATEGORY_COLORS.C, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "11px", height: "11px", backgroundColor: CATEGORY_COLORS.C, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
              </div>
            </td>
            <td className="legend-score-text">28+ pts</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.pending }}>Pending</span>
            </td>
            <td>
              <div className="legend-scale-visual">
                <span className="dot-sample" style={{ width: "4px", height: "4px", backgroundColor: CATEGORY_COLORS.pending, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
                <FontAwesomeIcon icon={faArrowRight} className="legend-arrow" />
                <span className="dot-sample" style={{ width: "11px", height: "11px", backgroundColor: CATEGORY_COLORS.pending, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
              </div>
            </td>
            <td className="legend-score-text">N / P / Z (score varies)</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.uninspected }}>Uninspected</span>
            </td>
            <td>
              <div className="legend-scale-visual single-dot-align">
                <span className="dot-sample" style={{ width: "6px", height: "6px", backgroundColor: CATEGORY_COLORS.uninspected, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
              </div>
            </td>
            <td className="legend-score-text">No scored inspection on record</td>
          </tr>
          <tr>
            <td>
              <span className="legend-grade-text" style={{ color: CATEGORY_COLORS.closed }}>Closed</span>
            </td>
            <td>
              <div className="legend-scale-visual single-dot-align">
                <span className="dot-sample" style={{ width: "11px", height: "11px", backgroundColor: CATEGORY_COLORS.closed, border: "0.5px solid rgba(26, 26, 26, 1)" }}></span>
              </div>
            </td>
            <td className="legend-score-text"></td>
          </tr>
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
          Use the restaurant listing panel to browse and inspect individual establishments when multiple locations share overlapping points.
        </li>
      </ul>
    }
  />
);

type MapViewProps = {
  filters: Filters;
  searchQuery?: string;
  selectedRestaurantId?: string | null;
  hoveredRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties | null) => void;
  onHoverRestaurant?: (restaurant: RestaurantProperties | null) => void;
  onVisibleRestaurantsChange?: (restaurants: RestaurantProperties[]) => void;
  onGradeCountsChange?: (counts: GradeCounts) => void;
};

export default function InspectionMapView({
  filters,
  searchQuery = "",
  selectedRestaurantId = null,
  hoveredRestaurantId = null,
  onSelectRestaurant,
  onHoverRestaurant,
  onVisibleRestaurantsChange,
  onGradeCountsChange,
}: MapViewProps) {
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);

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
  const hoverHighlightRequestIdRef = useRef(0);

  const selectedObjectIdRef = useRef<number | null>(null);
  const hoveredObjectIdRef = useRef<number | null>(null);

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

      // GradeChart intentionally tallies `restaurants` (pre-grade-filter --
      // extent + borough/search only) so it always shows the full
      // distribution for the map area, regardless of the active grade
      // filter; the chart highlights/explodes the filtered slice(s) instead
      // of only showing them. RestaurantList and StatsPanel, by contrast,
      // should reflect the actually-filtered set, so they're derived from
      // filteredRestaurants below.
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

        const category = getGradeCategory(r.action, r.grade, r.score);

        if (activeGrades.includes("Closed") && category === "closed")
          return true;
        if (activeGrades.includes("Pending") && category === "pending")
          return true;
        if (activeGrades.includes("Uninspected") && category === "uninspected")
          return true;
        // Match A/B/C against the computed category, not the raw grade
        // field -- grade is often null in the source data even when score
        // is populated, which was silently dropping those restaurants here
        // while the chart (via getGradeCategory) still counted them as
        // A/B/C.
        if (["A", "B", "C"].includes(category) && activeGrades.includes(category))
          return true;

        return false;
      });

      onVisibleRestaurantsChange?.(filteredRestaurants);
    } catch (err) {
      console.error("MapView: failed to query visible restaurants", err);
    }
  }

  // Both the click-selected restaurant and the restaurant currently
  // hovered in the list panel share one glowing FeatureEffect -- ArcGIS
  // only supports a single featureEffect per layer view, so the two
  // object IDs are tracked separately in refs and merged into one filter
  // any time either changes.
  const ensureFeatureEffect = useCallback(async () => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let layerView: any;
    try {
      await layer.load();
      layerView = await view.whenLayerView(layer);
    } catch (err) {
      console.error(
        "MapView: failed to load layer view for highlight effect",
        err,
      );
      return null;
    }

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

    return featureEffectRef.current;
  }, []);

  const applyCombinedHighlight = useCallback(() => {
    const effect = featureEffectRef.current;
    if (!effect) return;

    const objectIds = Array.from(
      new Set(
        [selectedObjectIdRef.current, hoveredObjectIdRef.current].filter(
          (id): id is number => id !== null,
        ),
      ),
    );

    effect.filter =
      objectIds.length > 0
        ? new FeatureFilter({ objectIds })
        : NO_SELECTION_FILTER;
  }, []);

  const applyHighlightForId = useCallback(
    async (
      restaurantId: string | null,
      knownObjectId?: number | null,
    ) => {
      const effect = await ensureFeatureEffect();
      if (!effect) return;

      if (!restaurantId) {
        selectedObjectIdRef.current = null;
        applyCombinedHighlight();
        return;
      }

      if (knownObjectId !== undefined) {
        selectedObjectIdRef.current = knownObjectId;
        applyCombinedHighlight();
        return;
      }

      const layer = layerRef.current;
      if (!layer) return;

      try {
        const { objectId } = await checkSelectionAgainstFilters(
          layer,
          restaurantId,
          layer.definitionExpression ?? "",
        );
        selectedObjectIdRef.current = objectId;
        applyCombinedHighlight();
      } catch (err) {
        console.error(
          "MapView: failed to query feature for highlight effect",
          err,
        );
      }
    },
    [ensureFeatureEffect, applyCombinedHighlight],
  );

  const applyHoverHighlightForId = useCallback(
    async (restaurantId: string | null) => {
      const effect = await ensureFeatureEffect();
      if (!effect) return;

      if (!restaurantId) {
        hoveredObjectIdRef.current = null;
        applyCombinedHighlight();
        return;
      }

      const layer = layerRef.current;
      if (!layer) return;

      const requestId = ++hoverHighlightRequestIdRef.current;
      try {
        const { objectId } = await checkSelectionAgainstFilters(
          layer,
          restaurantId,
          layer.definitionExpression ?? "",
        );
        if (requestId !== hoverHighlightRequestIdRef.current) return;
        hoveredObjectIdRef.current = objectId;
        applyCombinedHighlight();
      } catch (err) {
        console.error(
          "MapView: failed to query feature for hover highlight effect",
          err,
        );
      }
    },
    [ensureFeatureEffect, applyCombinedHighlight],
  );

  useEffect(() => {
    void applyHighlightForId(selectedRestaurantId);
  }, [selectedRestaurantId, applyHighlightForId]);

  useEffect(() => {
    void applyHoverHighlightForId(hoveredRestaurantId);
  }, [hoveredRestaurantId, applyHoverHighlightForId]);

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
      basemap: "arcgis/dark-gray/base",
      layers: [layer],
    });

    const view = new MapView({
      container: mapDivRef.current,
      map,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      constraints: { snapToZoom: false },
      // Zoom in/out is handled by the custom MapScaleZoomControls chip instead;
      // attribution isn't part of the toggleable component list, so it stays.
      ui: { components: [] },
    });
    viewRef.current = view;
    setMapView(view);

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
      setHoverCard(null);

      let response;
      try {
        response = await view.hitTest(event);
        await layer.load();
      } catch (err) {
        console.error("MapView: failed to hit-test click", err);
        return;
      }

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
      let response;
      try {
        response = await view.hitTest(event);
      } catch (err) {
        console.error("MapView: failed to hit-test pointer move", err);
        return;
      }
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
          gradeText: attrs.grade ? attrs.grade : "N/A",
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
      stationaryWatchHandle.remove();
      view.destroy();
      setMapView(null);
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

        <MapScaleZoomControls view={mapView} />
        <MapCompass view={mapView} />
        <MapScaleBar view={mapView} />
        <MapBasemapToggle view={mapView} />

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