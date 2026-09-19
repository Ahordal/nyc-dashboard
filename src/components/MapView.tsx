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
import Extent from "@arcgis/core/geometry/Extent";

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
import { buildUserLocationGraphics } from "../utils/userLocationGraphics";
import { useSearchRadiusTool } from "../hooks/useSearchRadiusTool";
import { useSelectionHighlight } from "../hooks/useSelectionHighlight";
import { useMapHover } from "../hooks/useMapHover";
import { useGeolocation } from "../hooks/useGeolocation";
import PanelHeader from "./PanelHeader";
import MapHoverCard, { type HoverCardState } from "./MapHoverCard";
import MAP_LEGEND_INFO_CONTENT from "./MapLegendInfoContent";
import MapScaleBar from "./MapScaleBar";
import MapScaleZoomControls from "./MapScaleZoomControls";
import MapBasemapToggle from "./MapBasemapToggle";
import MapCompass from "./MapCompass";
import MapSearchRadiusControl from "./MapSearchRadiusControl";
import MapUserLocationControl from "./MapUserLocationControl";
import NoticeOverlay from "./NoticeOverlay";
import ErrorFallback from "./ErrorFallback";
import { isWithinNYC } from "../../shared/nycBounds.mjs";
import {
  buildDefinitionExpression,
  buildGradeWhereClause,
  queryVisibleRestaurants,
  queryRestaurantByCamis,
  checkSelectionAgainstFilters,
  buildTwoPointFitBounds,
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
  // Reports the current in-NYC GPS fix (null when cleared/out of area)
  // so the dashboard can show per-card distances. Mobile only.
  onUserLocationChange?: (
    point: { latitude: number; longitude: number } | null,
  ) => void;
  // A Search Radius restored from the URL on first load, placed once the
  // map view and rings layer are ready. Null in normal use.
  initialSearchRadius?: {
    point: SearchRadiusPoint;
    miles: SearchRadiusMiles;
  } | null;
  // A CAMIS (or feature id) from the initial URL to select once the
  // layer is ready. Resolved with a direct layer query, not a scan of
  // the visible set, so a shared link lands even off-screen or
  // off-grade. Null in normal use.
  initialSelectedCamis?: string | null;
  // Called once the deep-linked CAMIS has been resolved (matched or
  // not), so the parent can drop its pending state.
  onInitialSelectionResolved?: () => void;
  // The on-canvas hover card doesn't suit touch — no hover before a tap
  // commits — so mobile suppresses it for the sheet's own selection view.
  showHoverCard?: boolean;
  // The white glow around a list-hovered point. Pointless on touch, so
  // mobile turns it off; the selected point still glows.
  showHoverGlow?: boolean;
  // The "locate me" chip. Mobile-only, so desktop leaves it off.
  showLocateControl?: boolean;
  // Pixels of map covered by the mobile sheet, read when a fix lands, so
  // the locate action fits both the fix and a selected restaurant above
  // the sheet rather than just recentring on the fix. Omitted on desktop.
  getViewBottomInset?: () => number;
};

// Shared by both "locate + selection" paths: locate with a restaurant
// selected, or select with a fix already down. Fits both into the map
// slice above the sheet, or recentres on the fix alone if there's no
// geometry or the points are near-coincident.
async function fitToSelectionAndFix(
  view: MapView,
  layer: GeoJSONLayer,
  selectedId: string,
  fix: { latitude: number; longitude: number },
  bottomInset: number,
  isCancelled: () => boolean,
): Promise<void> {
  const recentreOnFix = () =>
    view
      .goTo(
        { center: [fix.longitude, fix.latitude], zoom: 15 },
        { duration: 600 },
      )
      .catch(() => {
        // goTo rejects if the user interrupts the animation; ignore.
      });

  let selectedPoint = null;
  try {
    await layer.load();
    const { geometry } = await checkSelectionAgainstFilters(
      layer,
      selectedId,
      "",
      { returnGeometry: true },
    );
    selectedPoint = geometry;
  } catch (err) {
    console.error("MapView: failed to query selection for locate fit", err);
  }
  if (isCancelled()) return;

  const fitBounds =
    selectedPoint != null &&
    typeof selectedPoint.longitude === "number" &&
    typeof selectedPoint.latitude === "number"
      ? buildTwoPointFitBounds(
          fix,
          {
            longitude: selectedPoint.longitude,
            latitude: selectedPoint.latitude,
          },
          {
            viewAspect: view.width / view.height,
            bottomInsetRatio: view.height ? bottomInset / view.height : 0,
          },
        )
      : null;

  if (!fitBounds || !selectedPoint) {
    recentreOnFix();
    return;
  }

  const target = new Extent({
    ...fitBounds,
    spatialReference: selectedPoint.spatialReference,
  });
  view.goTo({ target }, { duration: 600 }).catch(() => {});
}

// Fits the camera to every restaurant point (the full 5-borough extent),
// not a fixed center/zoom, so the initial view — and after filters
// clear — suits the actual aspect ratio.
async function goToFullExtent(
  view: MapView,
  layer: GeoJSONLayer,
  options?: Parameters<MapView["goTo"]>[1],
  isCancelled: () => boolean = () => false,
): Promise<void> {
  try {
    const { extent } = await queryFilterExtent(layer, "1=1");
    if (isCancelled()) return;
    if (extent) {
      await view.goTo(extent.expand(1.2), options);
    }
  } catch (err) {
    console.error("MapView: failed to fit view to full data extent", err);
  }
}

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
  onUserLocationChange,
  initialSearchRadius = null,
  initialSelectedCamis = null,
  onInitialSelectionResolved,
  showHoverCard = true,
  showHoverGlow = true,
  showLocateControl = false,
  getViewBottomInset,
}: MapViewProps) {
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);

  // Device GPS for the "locate me" chip. A fix outside NYC is rejected
  // (outsideNyc) with a toast rather than dropping a pin in empty space.
  const geo = useGeolocation();
  const [outsideNyc, setOutsideNyc] = useState(false);
  const [outOfAreaNonce, setOutOfAreaNonce] = useState(0);

  // ErrorBoundary only catches render-time throws, so async failures
  // below (GeoJSON 404, bad ArcGIS key -> a rejected promise) need their
  // own state. `retryNonce` re-runs the mount effect from scratch.
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<GeoJSONLayer | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const ringsLayerRef = useRef<GraphicsLayer | null>(null);
  const userLocationLayerRef = useRef<GraphicsLayer | null>(null);

  const searchRadius = useSearchRadiusTool(
    mapView,
    ringsLayerRef.current,
    initialSearchRadius,
  );

  // Also called from the mount effect and the filter/search sync effect below.
  const { applyHighlightForId } = useSelectionHighlight({
    layerRef,
    viewRef,
    selectedRestaurantId,
    hoveredRestaurantId: showHoverGlow ? hoveredRestaurantId : null,
  });

  const selectedRestaurantIdRef = useRef<string | null>(selectedRestaurantId);
  const onSelectRestaurantRef = useRef(onSelectRestaurant);
  const onHoverRestaurantRef = useRef(onHoverRestaurant);
  const filtersRef = useRef(filters);
  const onVisibleRestaurantsChangeRef = useRef(onVisibleRestaurantsChange);
  const onGradeCountsChangeRef = useRef(onGradeCountsChange);
  const onSearchRadiusChangeRef = useRef(onSearchRadiusChange);
  const onUserLocationChangeRef = useRef(onUserLocationChange);
  const onInitialSelectionResolvedRef = useRef(onInitialSelectionResolved);
  const getViewBottomInsetRef = useRef(getViewBottomInset);

  // The current in-bounds GPS fix, null if none/outside NYC. Lets the
  // selection effect reframe on both fix and selection, like locate does.
  const activeUserFixRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );

  const prevBoroughsRef = useRef<string[]>(filters.boroughs);
  const prevSearchRef = useRef<string>(searchQuery);

  const queryRequestIdRef = useRef(0);

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
    onUserLocationChangeRef.current = onUserLocationChange;
  }, [onUserLocationChange]);

  useEffect(() => {
    onInitialSelectionResolvedRef.current = onInitialSelectionResolved;
  }, [onInitialSelectionResolved]);

  useEffect(() => {
    getViewBottomInsetRef.current = getViewBottomInset;
  }, [getViewBottomInset]);

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

      // GradeChart tallies before the grade filter so it shows the full
      // distribution (matching slices highlighted, not removed);
      // RestaurantList/StatsPanel use filteredRestaurants instead.
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

    // `disposed` guards against a stale rejection from the torn-down
    // view/layer flipping the error state back on after a retry.
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

    const userLocationLayer = new GraphicsLayer({ title: "User Location" });
    userLocationLayerRef.current = userLocationLayer;

    const map = new Map({
      basemap: "arcgis/dark-gray/base",
      // ArcGIS draws array order bottom-to-top: rings under every
      // restaurant point, user location on top so it's never buried in a cluster.
      layers: [ringsLayer, layer, userLocationLayer],
    });

    const view = new MapView({
      container: mapDivRef.current,
      map,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      constraints: { snapToZoom: false },
      // Zoom is handled by MapScaleZoomControls instead; attribution
      // isn't part of the toggleable component list, so it stays.
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
    layer
      .load()
      .then(() => {
        if (disposed) return;
        // No animation: replaces the placeholder camera set before the
        // real extent was known, so it reads as the initial view.
        return goToFullExtent(view, layer, { duration: 0 });
      })
      .catch((err) => {
        if (disposed) return;
        console.error("MapView: inspection layer failed to load", err);
        setLoadError(true);
      });

    const stationaryWatchHandle = reactiveUtils.watch(
      () => view.stationary,
      (isStationary) => {
        // While a Search Radius point is set the scope is the circle,
        // not the viewport, so pan/zoom shouldn't re-query.
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

      // The graphic already carries every field the dashboard reads; no
      // follow-up query is needed here. A hit on the already-selected
      // restaurant clears it — click tolerance and the post-select pan
      // otherwise make a dismiss click land back on the same dot.
      if (
        graphicHit &&
        graphicHit.graphic.attributes.id !== selectedRestaurantIdRef.current
      ) {
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
    // Deps excluded so the map isn't torn down and recreated on every
    // render; the click handler reads stable refs and callbacks.
    // `retryNonce` is the one intentional rebuild trigger (Retry button).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyHighlightForId, retryNonce]);

  // Resolves a ?camis= deep link once the layer is ready, via a direct
  // layer query rather than scanning dashboard's already extent/grade-
  // filtered visibleRestaurants, which would miss an off-screen match.
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
        // A definitive answer either way — don't retry on a later render.
        didResolveDeepLinkRef.current = true;
        if (restaurant) onSelectRestaurantRef.current?.(restaurant);
        onInitialSelectionResolvedRef.current?.();
      } catch (err) {
        // Leave the guard down so a successful Retry gets another chance.
        console.error("MapView: failed to resolve deep-linked restaurant", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSelectedCamis, retryNonce]);

  // Draws (or clears) the "you are here" graphics on a GPS fix. Outside
  // NYC draws nothing and raises the out-of-area toast; in-bounds draws
  // the dot + accuracy circle and reframes (fitting a selected restaurant
  // too, if any). Each success is a fresh object, so a re-tap re-frames.
  useEffect(() => {
    const locationLayer = userLocationLayerRef.current;
    if (!locationLayer) return;
    locationLayer.removeAll();

    const fix = geo.position;
    if (!fix) {
      setOutsideNyc(false);
      activeUserFixRef.current = null;
      onUserLocationChangeRef.current?.(null);
      return;
    }

    if (!isWithinNYC(fix.latitude, fix.longitude)) {
      setOutsideNyc(true);
      setOutOfAreaNonce((n) => n + 1);
      activeUserFixRef.current = null;
      onUserLocationChangeRef.current?.(null);
      return;
    }

    setOutsideNyc(false);
    activeUserFixRef.current = {
      latitude: fix.latitude,
      longitude: fix.longitude,
    };
    onUserLocationChangeRef.current?.({
      latitude: fix.latitude,
      longitude: fix.longitude,
    });
    locationLayer.addMany(buildUserLocationGraphics(fix));

    let cancelled = false;
    const view = viewRef.current;
    const layer = layerRef.current;
    const selectedId = selectedRestaurantIdRef.current;

    if (view && layer && selectedId) {
      void fitToSelectionAndFix(
        view,
        layer,
        selectedId,
        fix,
        getViewBottomInsetRef.current?.() ?? 0,
        () => cancelled,
      );
    } else {
      view
        ?.goTo(
          { center: [fix.longitude, fix.latitude], zoom: 15 },
          { duration: 600 },
        )
        .catch(() => {
          // goTo rejects if the user interrupts the animation; ignore.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [geo.position]);

  // Clears a stale out-of-area flag once a new request starts.
  useEffect(() => {
    if (geo.status === "locating") setOutsideNyc(false);
  }, [geo.status]);

  useEffect(() => {
    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return;

    let cancelled = false;

    const handleCameraMove = async () => {
      if (!selectedRestaurantId) return;

      // With a GPS fix already down, reframe on both — otherwise a point
      // tapped after panning away from the fix would leave it off-screen.
      const fix = activeUserFixRef.current;
      if (fix) {
        void fitToSelectionAndFix(
          view,
          layer,
          selectedRestaurantId,
          fix,
          getViewBottomInsetRef.current?.() ?? 0,
          () => cancelled,
        );
        return;
      }

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
        if (geometry && !cancelled) {
          view.goTo(
            { target: geometry, zoom: Math.max(view.zoom, 14) },
            { duration: 500, easing: "ease-in-out" },
          );
        }
      } catch (err) {
        console.error("MapView: failed to query feature for pan/zoom", err);
      }
    };

    handleCameraMove();

    return () => {
      cancelled = true;
    };
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

    // Guards every side effect below: a fast filter/search edit can start a
    // new run before this one's awaits resolve, and a stale run must not
    // deselect the current restaurant or snap the camera to an old extent.
    let cancelled = false;

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

      if (cancelled) return;

      if (currentId && !stillMatches) {
        onSelectRestaurantRef.current?.(null);
      } else {
        await applyHighlightForId(currentId, objectId);
        if (cancelled) return;
      }

      let cameraWillMove = false;

      // Freezes camera tracking while a Search Radius point is active so
      // it doesn't override the circle view; the query still re-runs.
      const radiusActive = searchRadius.searchRadiusPointRef.current !== null;

      if (cameraTrigger && view && !radiusActive) {
        if (newDefinitionExpression) {
          try {
            const { count, extent, isDegenerate } = await queryFilterExtent(
              layer,
              newDefinitionExpression,
            );

            if (cancelled) return;

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
          await goToFullExtent(view, layer, undefined, () => cancelled);
        }
      }

      if (cancelled) return;

      if (view && !cameraWillMove) {
        await reportVisibleRestaurants(view, layer);
      }
    }

    syncSelectionAndZoom();

    return () => {
      cancelled = true;
    };
    // reportVisibleRestaurants (per-render) and searchRadius's ref
    // (stable) don't belong in the dep array.
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

        {showLocateControl && (
          <>
            <MapUserLocationControl
              status={geo.status}
              errorKind={geo.errorKind}
              outsideNyc={outsideNyc}
              onLocate={geo.requestLocation}
              onClear={geo.clearLocation}
            />
            <div className="map-user-location-notice-anchor">
              <NoticeOverlay triggerKey={outOfAreaNonce}>
                Your location is outside NYC.
              </NoticeOverlay>
            </div>
          </>
        )}

        {searchRadius.isPlacingPoint && (
          <div className="map-placement-hint-anchor">
            <div className="filter-notice-overlay">
              <div className="filter-notice-text">
                Click the map to find restaurants nearby
              </div>
            </div>
          </div>
        )}

        {showHoverCard && hoverCard && <MapHoverCard card={hoverCard} />}

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
