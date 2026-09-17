// MapBasemapToggle.tsx
//
// Top-right toggle between dark-gray and satellite. Icon shows the mode
// a click switches *to* (Google Maps convention).
//
// Dark-gray stays mounted in both modes; satellite overlays Esri World
// Imagery via a keyless WebTileLayer. Swapping `map.basemap` directly
// fails here — `arcgis/imagery/*` needs an entitlement this key lacks,
// and `Basemap.fromId("satellite")`'s MapServer rejects tokens with esriConfig.apiKey set.
//
// Esri's composited styles render labels above every operational layer,
// burying restaurant dots. So each style splits into two
// VectorTileLayers — road/street below the markers, everything else above.

import { useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatellite, faMap } from "@fortawesome/free-solid-svg-icons";

// Raw tiles avoid triggering token/metadata requests via esriConfig.apiKey.
const WORLD_IMAGERY_TILE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{level}/{row}/{col}";

// Opacity blends the dark-gray basemap through; brightness/saturate keeps
// dots legible over harsh highlights.
const SATELLITE_IMAGERY_OPACITY = 0.6;
const SATELLITE_IMAGERY_EFFECT = "brightness(70%) saturate(95%)";

const DEFAULT_LABELS_STYLE_URL =
  "https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/dark-gray/labels";
const SATELLITE_LABELS_STYLE_URL =
  "https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery/labels";

function isStreetLabelLayerId(id: string): boolean {
  return id.startsWith("Road/label/") || id.startsWith("Road tunnel/label/");
}

type LabelLayerPair = {
  streetLayer: VectorTileLayer;
  placeLayer: VectorTileLayer;
};

// Loads one style into two VectorTileLayers, culling complementary
// layers from each — one keeps road/street, the other keeps the rest.
// From the style URL, not a raw object, so the SDK resolves sprites/glyphs/tiles and apiKey auth.
async function createSplitLabelLayers(styleUrl: string): Promise<LabelLayerPair> {
  const streetLayer = new VectorTileLayer({ url: styleUrl });
  const placeLayer = new VectorTileLayer({ url: styleUrl });
  await Promise.all([streetLayer.load(), placeLayer.load()]);

  const layerIds = (
    streetLayer.currentStyleInfo.style as { layers: { id: string }[] }
  ).layers.map((l) => l.id);

  for (const id of layerIds) {
    (isStreetLabelLayerId(id) ? placeLayer : streetLayer).deleteStyleLayer(id);
  }

  return { streetLayer, placeLayer };
}

type MapBasemapToggleProps = {
  view: MapView | null;
};

export default function MapBasemapToggle({ view }: MapBasemapToggleProps) {
  const [isSatellite, setIsSatellite] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const defaultLabelsRef = useRef<LabelLayerPair | null>(null);
  const satelliteLabelsRef = useRef<LabelLayerPair | null>(null);
  const imageryLayerRef = useRef<WebTileLayer | null>(null);
  // Ref, not isToggling — a fast second click can fire before the button disables.
  const inFlightRef = useRef(false);

  // Mounts default labels on init, since the map starts on the standard view.
  useEffect(() => {
    if (!view?.map) return;
    const map = view.map;
    let cancelled = false;

    (async () => {
      if (!defaultLabelsRef.current) {
        defaultLabelsRef.current = await createSplitLabelLayers(DEFAULT_LABELS_STYLE_URL);
      }
      if (cancelled) return;
      map.layers.add(defaultLabelsRef.current.streetLayer, 0);
      map.layers.add(defaultLabelsRef.current.placeLayer);
    })();

    return () => {
      cancelled = true;
      if (defaultLabelsRef.current) {
        map.layers.remove(defaultLabelsRef.current.streetLayer);
        map.layers.remove(defaultLabelsRef.current.placeLayer);
      }
    };
  }, [view]);

  const toggleBasemap = async () => {
    if (!view?.map || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsToggling(true);

    try {
      const map = view.map;
      const next = !isSatellite;

      // Swap active/inactive label layer references based on target mode.
      const [activeRef, inactiveRef] = next
        ? [satelliteLabelsRef, defaultLabelsRef]
        : [defaultLabelsRef, satelliteLabelsRef];

      if (inactiveRef.current) {
        map.layers.remove(inactiveRef.current.streetLayer);
        map.layers.remove(inactiveRef.current.placeLayer);
      }
      if (!activeRef.current) {
        activeRef.current = await createSplitLabelLayers(
          next ? SATELLITE_LABELS_STYLE_URL : DEFAULT_LABELS_STYLE_URL,
        );
      }
      map.layers.add(activeRef.current.streetLayer, 0);
      map.layers.add(activeRef.current.placeLayer);

      // Index 0 keeps imagery below street labels/operational layers, atop
      // the dark-gray basemap.
      if (next) {
        if (!imageryLayerRef.current) {
          imageryLayerRef.current = new WebTileLayer({
            urlTemplate: WORLD_IMAGERY_TILE_URL,
            opacity: SATELLITE_IMAGERY_OPACITY,
            effect: SATELLITE_IMAGERY_EFFECT,
            title: "World Imagery",
            copyright: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
            listMode: "hide",
          });
        }
        map.layers.add(imageryLayerRef.current, 0);
      } else if (imageryLayerRef.current) {
        map.layers.remove(imageryLayerRef.current);
      }

      setIsSatellite(next);
    } finally {
      inFlightRef.current = false;
      setIsToggling(false);
    }
  };

  return (
    <div className="map-basemap-toggle-container">
      <button
        type="button"
        onClick={toggleBasemap}
        disabled={isToggling}
        data-tooltip={isSatellite ? "Switch to map view" : "Switch to satellite view"}
        aria-label={isSatellite ? "Switch to map view" : "Switch to satellite view"}
        className="map-basemap-toggle-button tooltip-left"
      >
        <FontAwesomeIcon icon={isSatellite ? faMap : faSatellite} />
      </button>
    </div>
  );
}