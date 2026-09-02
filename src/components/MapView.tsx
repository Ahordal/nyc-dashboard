// MapView.tsx
//
// The ArcGIS map view: score-weighted dots, spatial filtering, a compact
// top-right legend trigger, custom scale/zoom/compass controls, the
// Search Radius tool, and hover cards.

import { useEffect, useRef, useState } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";

import esriConfig from "@arcgis/core/config";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

// Imported here rather than in main.tsx so it rides along with this lazy
// chunk instead of blocking first paint in the entry stylesheet.
import "@arcgis/core/assets/esri/themes/dark/main.css";
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
import { useMapHover } from "../hooks/useMapHover";
import PanelHeader from "./PanelHeader";
import MapHoverCard, { type HoverCardState } from "./MapHoverCard";
import MAP_LEGEND_INFO_CONTENT from "./MapLegendInfoContent";
import MapScaleBar from "./MapScaleBar";
import MapScaleZoomControls from "./MapScaleZoomControls";
import MapBasemapToggle from "./MapBasemapToggle";
import MapCompass from "./MapCompass";
import MapSearchRadiusControl from "./MapSearchRadiusControl";
import ErrorFallback from "./ErrorFallback";
import {
  buildDefinitionExpression,
  buildGradeWhereClause,
  queryVisibleRestaurants,
  queryRestaurantByCamis,
  checkSelectionAgainstFilters,
  queryFilterExtent,
  filterRestaurantsByGradeCategory,
  findRestaurantGraphicHit,
  RESTAURANT_OUT_FIELDS,
} from "../queries/mapQueries";

esriConfig.apiKey = import.meta.env.PUBLIC_ARCGIS_API_KEY;

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
  // A Search Radius restored from the URL on first load, placed once the
  // map view and rings layer are ready. Null in normal use.
  initialSearchRadius?: {
    point: SearchRadiusPoint;
    miles: SearchRadiusMiles;
  } | null;
  // A CAMIS (or feature id) from the initial URL to select once the
  // layer is ready. Resolved with a direct layer query rather than a
  // scan of the visible set, so a shared link still lands even when the
  // target is off-screen or filtered out by grade. Null in normal use.
  initialSelectedCamis?: string | null;
  // Called once the deep-linked CAMIS has been resolved (matched or
  // not), so the parent can drop its pending state.
  onInitialSelectionResolved?: () => void;
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
  initialSelectedCamis = null,
  onInitialSelectionResolved,
}: MapViewProps) {
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);

  // The surrounding ErrorBoundary only catches render-time throws, so the
  // async failures below (GeoJSON 404, missing/invalid/over-quota ArcGIS
  // key -> view or layer promise rejects) need their own visible state.
  // `retryNonce` re-runs the mount effect, rebuilding the map from scratch.
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

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
  const onInitialSelectionResolvedRef = useRef(onInitialSelectionResolved);

  const prevBoroughsRef = useRef<string[]>(filters.boroughs);
  const prevSearchRef = useRef<string>(searchQuery);

  const queryRequestIdRef = useRef(0);

  // Pointer-move throttling, the restaurant hit test, cursor styling, and
  // the on-canvas hover card all live in this hook. It wires its own
  // listeners once `mapView` exists.
  useMapHover({
    view: mapView,
    layerRef,
    isPlacingPointRef: searchRadius.isPlacingPointRef,
    onHoverRestaurantRef,
    setHoverCard,
  });

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
    onInitialSelectionResolvedRef.current = onInitialSelectionResolved;
  }, [onInitialSelectionResolved]);

  useEffect(() => {
    onSearchRadiusChangeRef.current?.(
      searchRadius.searchRadiusPoint,
      searchRadius.activeRadiusMiles,
    );
    // Re-run the query whenever the search radius point or distance
    // changes, falling back to the map extent when the point is cleared.
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

    // When a Search Radius point is set, the query scope is the circle
    // rather than the map extent, so panel data stops tracking pan/zoom.
    const radiusPoint = searchRadius.searchRadiusPointRef.current;
    const radius = radiusPoint
      ? { point: radiusPoint, miles: searchRadius.activeRadiusMilesRef.current }
      : null;

    try {
      const restaurants = await queryVisibleRestaurants(view, layer, radius);
      if (requestId !== queryRequestIdRef.current) return;

      // GradeChart tallies restaurants before the grade filter so it can
      // show the full distribution for the area (matching slices are
      // highlighted instead of removed). RestaurantList and StatsPanel
      // use filteredRestaurants for the active subset.
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

    // Clear any error from a previous attempt before rebuilding. `disposed`
    // guards against a stale rejection from the torn-down view/layer
    // flipping the error state back on after a retry.
    setLoadError(false);
    let disposed = false;

    const layer = new GeoJSONLayer({
      url: "/data/latest-inspections.geojson",
      title: "NYC Restaurant Inspections",
      renderer: pointsRenderer,
      outFields: RESTAURANT_OUT_FIELDS,
      copyright: "NYC DOHMH |",
    });
    layerRef.current = layer;

    const ringsLayer = new GraphicsLayer({ title: "Search Radius Rings" });
    ringsLayerRef.current = ringsLayer;

    const map = new Map({
      basemap: "arcgis/dark-gray/base",
      // ringsLayer first: ArcGIS draws array order bottom-to-top, so this
      // keeps the Search Radius rings under every restaurant
      // point/highlight.
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

    view.when(
      () => {
        reportVisibleRestaurants(view, layer);
        void applyHighlightForId(selectedRestaurantIdRef.current);
      },
      (err: unknown) => {
        if (disposed) return;
        console.error("MapView: map view failed to initialize", err);
        setLoadError(true);
      },
    );

    // view.when() can still resolve when only the GeoJSON layer fails
    // (e.g. a 404 on latest-inspections.geojson), so load it explicitly
    // and surface that rejection too.
    layer.load().catch((err) => {
      if (disposed) return;
      console.error("MapView: inspection layer failed to load", err);
      setLoadError(true);
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

      // The graphic already carries every field the dashboard reads
      // (RESTAURANT_OUT_FIELDS); violations are fetched separately from
      // history/{camis}.json on select, so there's no follow-up query
      // here.
      if (graphicHit) {
        onSelectRestaurantRef.current?.(graphicHit.graphic.attributes);
      } else {
        onSelectRestaurantRef.current?.(null);
      }
    });

    return () => {
      disposed = true;
      clickHandle.remove();
      stationaryWatchHandle.remove();
      view.destroy();
      setMapView(null);
    };
    // Excluded from the dependency array so the map isn't torn down and
    // recreated on every render; the click handler safely reads stable
    // refs and callbacks from the searchRadius hook. `retryNonce` is the
    // one intentional rebuild trigger (the "Retry" button on load error).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyHighlightForId, retryNonce]);

  // Resolve a ?camis= deep link once the layer is ready. Done here with a
  // direct layer query, not by scanning dashboard's visibleRestaurants:
  // that set is already extent- and grade-filtered, so a shared link to
  // anything off-screen or off the active grade never matched.
  const didResolveDeepLinkRef = useRef(false);

  useEffect(() => {
    if (didResolveDeepLinkRef.current || !initialSelectedCamis) return;

    const view = viewRef.current;
    const layer = layerRef.current;
    if (!view || !layer) return;

    let cancelled = false;

    (async () => {
      try {
        await view.when();
        const restaurant = await queryRestaurantByCamis(
          layer,
          initialSelectedCamis,
        );
        if (cancelled) return;
        // The query ran, so we have a definitive answer (a match or a
        // genuine miss) -- don't try again on a later render/retry.
        didResolveDeepLinkRef.current = true;
        if (restaurant) onSelectRestaurantRef.current?.(restaurant);
        onInitialSelectionResolvedRef.current?.();
      } catch (err) {
        // View/layer never became ready. Leave the guard down so a
        // successful Map "Retry" gets another chance at the link.
        console.error("MapView: failed to resolve deep-linked restaurant", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSelectedCamis, retryNonce]);

  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    const handleCameraMove = async () => {
      if (selectedRestaurantId) {
        try {
          // checkSelectionAgainstFilters queries the layer directly and
          // doesn't load it itself; match the other call sites.
          await layer.load();
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

      // Freeze map-extent tracking while a Search Radius point is active
      // so it doesn't override the circle view. The query still re-runs
      // so linked panels and charts reflect the circle scope.
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
    // searchRadius.searchRadiusPointRef is a stable ref; neither belongs
    // in the dep array (listing the function would re-run this every
    // render).
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
        <PanelHeader
          title=""
          titleText="Map View"
          infoContent={MAP_LEGEND_INFO_CONTENT}
          infoVariant="modal"
        />
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

        {loadError && (
          <div className="map-load-error">
            <ErrorFallback
              message="The map failed to load. This can be a lost connection or a temporary service issue."
              onRetry={() => setRetryNonce((n) => n + 1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
