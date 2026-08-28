//MapView.tsx
//
//Displays the ArcGIS map view with localized dot weighting, spatial filtering, a compact top-right icon-only legend trigger, interactive custom scale/zoom controllers, and hover cards.

import { useEffect, useRef, useState } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";

import esriConfig from "@arcgis/core/config";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import type {
  SearchRadiusPoint,
  SearchRadiusMiles,
} from "../types/searchRadius";
import { EMPTY_GRADE_COUNTS, type GradeCounts } from "../types/gradeCounts";
import { getGradeCategory } from "../utils/gradeCategory";
import { pointsRenderer } from "../utils/mapRenderer";
import { useSearchRadiusTool } from "../hooks/useSearchRadiusTool";
import { useSelectionHighlight } from "../hooks/useSelectionHighlight";
import PanelHeader from "./PanelHeader";
import MapHoverCard, { type HoverCardState } from "./MapHoverCard";
import MAP_LEGEND_INFO_CONTENT from "./MapLegendInfoContent";
import MapScaleBar from "./MapScaleBar";
import MapScaleZoomControls from "./MapScaleZoomControls";
import MapBasemapToggle from "./MapBasemapToggle";
import MapCompass from "./MapCompass";
import MapSearchRadiusControl from "./MapSearchRadiusControl";
import {
  buildDefinitionExpression,
  buildGradeWhereClause,
  queryVisibleRestaurants,
  fetchRestaurantDetail,
  checkSelectionAgainstFilters,
  queryFilterExtent,
  filterRestaurantsByGradeCategory,
  findRestaurantGraphicHit,
  RESTAURANT_OUT_FIELDS,
} from "../queries/mapQueries";

esriConfig.apiKey = import.meta.env.PUBLIC_ARCGIS_API_KEY;

const HOVER_CARD_MAX_SCALE = 18056;

const DEFAULT_CENTER: [number, number] = [-73.98, 40.7];
const DEFAULT_ZOOM = 9.75;

type MapViewProps = {
  filters: Filters;
  searchQuery?: string;
  selectedRestaurantId?: string | null;
  hoveredRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties | null) => void;
  onHoverRestaurant?: (restaurant: RestaurantProperties | null) => void;
  onVisibleRestaurantsChange?: (restaurants: RestaurantProperties[]) => void;
  onGradeCountsChange?: (counts: GradeCounts) => void;
  onSearchRadiusChange?: (
    point: SearchRadiusPoint | null,
    radiusMiles: SearchRadiusMiles,
  ) => void;
  // A Search Radius restored from the URL on first load -- placed once
  // the map view and rings layer are ready. Null in normal use.
  initialSearchRadius?: {
    point: SearchRadiusPoint;
    miles: SearchRadiusMiles;
  } | null;
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
  onSearchRadiusChange,
  initialSearchRadius = null,
}: MapViewProps) {
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const ringsLayerRef = useRef<GraphicsLayer | null>(null);

  const searchRadius = useSearchRadiusTool(
    mapView,
    ringsLayerRef.current,
    initialSearchRadius,
  );

  // The selected/hovered glow effect and its object-ID plumbing live in
  // this hook; applyHighlightForId is also called from the mount effect
  // and the filter/search sync effect below.
  const { applyHighlightForId } = useSelectionHighlight({
    layerRef,
    viewRef,
    selectedRestaurantId,
    hoveredRestaurantId,
  });

  const selectedRestaurantIdRef = useRef<string | null>(selectedRestaurantId);
  const onSelectRestaurantRef = useRef(onSelectRestaurant);
  const onHoverRestaurantRef = useRef(onHoverRestaurant);
  const filtersRef = useRef(filters);
  const onVisibleRestaurantsChangeRef = useRef(onVisibleRestaurantsChange);
  const onGradeCountsChangeRef = useRef(onGradeCountsChange);
  const onSearchRadiusChangeRef = useRef(onSearchRadiusChange);

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

  useEffect(() => {
    onSearchRadiusChangeRef.current = onSearchRadiusChange;
  }, [onSearchRadiusChange]);

  useEffect(() => {
    onSearchRadiusChangeRef.current?.(
      searchRadius.searchRadiusPoint,
      searchRadius.activeRadiusMiles,
    );
    // Re-runs the query whenever the search radius point or distance changes, falling back to the map extent when the point is cleared.
    const view = viewRef.current;
    const layer = layerRef.current;
    if (view && layer) void reportVisibleRestaurants(view, layer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRadius.searchRadiusPoint, searchRadius.activeRadiusMiles]);

  async function reportVisibleRestaurants(view: MapView, layer: GeoJSONLayer) {
    const onVisibleRestaurantsChange = onVisibleRestaurantsChangeRef.current;
    const onGradeCountsChange = onGradeCountsChangeRef.current;

    if (!onVisibleRestaurantsChange && !onGradeCountsChange) return;
    const requestId = ++queryRequestIdRef.current;

    // When a Search Radius point is set, query scope restricts to the circle rather than the map extent, decoupling panel data from map panning and zooming.
    const radiusPoint = searchRadius.searchRadiusPointRef.current;
    const radius = radiusPoint
      ? { point: radiusPoint, miles: searchRadius.activeRadiusMilesRef.current }
      : null;

    try {
      const restaurants = await queryVisibleRestaurants(view, layer, radius);
      if (requestId !== queryRequestIdRef.current) return;

      // GradeChart tallies pre-grade-filter restaurants to show the full map area distribution rather than filtering out unselected grades; matching slices are highlighted instead. (RestaurantList and StatsPanel use filteredRestaurants for the active subset).
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

      const filteredRestaurants = filterRestaurantsByGradeCategory(
        restaurants,
        filtersRef.current.grades,
      );

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
      renderer: pointsRenderer as any,
      outFields: RESTAURANT_OUT_FIELDS,
      copyright: "NYC DOHMH |",
    });
    layerRef.current = layer;

    const ringsLayer = new GraphicsLayer({ title: "Search Radius Rings" });
    ringsLayerRef.current = ringsLayer;

    const map = new Map({
      basemap: "arcgis/dark-gray/base",
      // ringsLayer first -- ArcGIS layer order is bottom-to-top by array
      // position, so this keeps the Search Radius rings under every
      // restaurant point/highlight.
      layers: [ringsLayer, layer],
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
        // While a Search Radius point is set the scope is the circle, not
        // the viewport, so pan/zoom shouldn't re-query. Radius changes go
        // through their own effect below.
        if (isStationary && !searchRadius.searchRadiusPointRef.current) {
          reportVisibleRestaurants(view, layer);
        }
      },
    );

    const clickHandle = view.on("click", async (event) => {
      setHoverCard(null);

      if (searchRadius.isPlacingPointRef.current) {
        const { longitude, latitude } = event.mapPoint;
        if (longitude != null && latitude != null) {
          searchRadius.placePointAt({ longitude, latitude });
        }
        return;
      }

      let response;
      try {
        response = await view.hitTest(event);
        await layer.load();
      } catch (err) {
        console.error("MapView: failed to hit-test click", err);
        return;
      }

      const graphicHit = findRestaurantGraphicHit(response, layer);

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
      if (searchRadius.isPlacingPointRef.current) return;

      const token = ++latestHitTestToken;
      let response;
      try {
        response = await view.hitTest(event);
      } catch (err) {
        console.error("MapView: failed to hit-test pointer move", err);
        return;
      }
      if (token !== latestHitTestToken) return;

      const graphicHit = findRestaurantGraphicHit(response, layer);

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
      // Prevents corner control hover events from clearing the placement crosshair cursor.
      if (view.container && !searchRadius.isPlacingPointRef.current) {
        view.container.style.cursor = "default";
      }
      onHoverRestaurantRef.current?.(null);
    };
    view.container?.addEventListener("mouseleave", handlePointerLeaveContainer);

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
    // Excluded from dependency array to prevent tearing down and recreating the map on every render; the click handler safely reads stable refs and callbacks from the searchRadius hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Freezes map extent tracking while a Search Radius point is active to prevent overriding the circle view. The underlying query still re-runs so linked panels and charts reflect the active circle scope.
      const radiusActive = searchRadius.searchRadiusPointRef.current !== null;

      if (cameraTrigger && view && !radiusActive) {
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
    // reportVisibleRestaurants is a per-render function and
    // searchRadius.searchRadiusPointRef is a stable ref -- neither
    // belongs in the dep array (listing the function would re-run this on
    // every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters,
    searchQuery,
    onVisibleRestaurantsChange,
    onGradeCountsChange,
    applyHighlightForId,
  ]);

  return (
    <div className="map-view-container">
      <div className="map-view-top-header">
        <PanelHeader title="" infoContent={MAP_LEGEND_INFO_CONTENT} />
      </div>
      <div className="map-canvas-wrapper">
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

        <MapScaleZoomControls view={mapView} />
        <MapCompass view={mapView} />
        <MapScaleBar view={mapView} />
        <MapBasemapToggle view={mapView} />
        <MapSearchRadiusControl
          isPlacingPoint={searchRadius.isPlacingPoint}
          hasPoint={searchRadius.searchRadiusPoint !== null}
          activeRadiusMiles={searchRadius.activeRadiusMiles}
          onActivate={searchRadius.handleActivate}
          onCancelPlacement={searchRadius.handleCancelPlacement}
          onDismiss={searchRadius.handleDismiss}
          onRadiusChange={searchRadius.handleRadiusChange}
        />

        {searchRadius.isPlacingPoint && (
          <div className="map-placement-hint-anchor">
            <div className="filter-notice-overlay">
              <div className="filter-notice-text">
                Click the map to find restaurants nearby
              </div>
            </div>
          </div>
        )}

        {hoverCard && <MapHoverCard card={hoverCard} />}
      </div>
    </div>
  );
}
