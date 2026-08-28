// MapBasemapToggle.tsx
//
// Top-right basemap toggle for MapView. Swaps between the default dark-gray
// map and satellite imagery. The button icon indicates the mode a click will 
// switch *to*, matching Google Maps' layer toggle pattern.
//
// Implementation Notes & Workarounds:
// 1. Basemap Persistence: The dark-gray vector basemap (`arcgis/dark-gray/base`,
//    configured in MapView) remains mounted in both modes. Satellite mode overlays 
//    Esri World Imagery as the bottom-most operational layer via a keyless 
//    WebTileLayer (`services.arcgisonline.com`).
// 2. Why Custom Overlays vs. Built-in Basemap Swapping: Swapping `map.basemap` 
//    directly proved unreliable:
//    - Basemap-styles v2 `arcgis/imagery/*` variants require an entitlement missing 
//      from this app's API key.
//    - `Basemap.fromId("satellite")` fails because its tiled MapServer load rejects tokens 
//      when `esriConfig.apiKey` is set, causing the basemap to fail silently.
// 3. Label Stacking Strategy: Esri's composited styles place labels in 
//    `Basemap.referenceLayers`, which the ArcGIS SDK always renders above every 
//    operational layer. To allow restaurant dots to render between street labels 
//    and place/water labels, we extract labels out of the basemap entirely:
//    - Split into two VectorTileLayers per style.
//    - Street/road-name layers (prefixed "Road/label/" or "Road tunnel/label/") 
//      render below restaurant markers.
//    - Everything else (places, neighborhoods, water bodies) renders above them.

import { useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatellite, faMap } from "@fortawesome/free-solid-svg-icons";

// Esri World Imagery referenced as raw tiles to prevent token/metadata requests
// and avoid triggering esriConfig.apiKey rejections.
const WORLD_IMAGERY_TILE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{level}/{row}/{col}";

// Visual tuning for satellite imagery to ensure high contrast for restaurant dots:
// - Opacity allows the dark-gray basemap underneath to blend through.
// - CSS brightness/saturation effects tone down harsh highlights in the aerial imagery.
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

// Loads a single labels style into two VectorTileLayer instances, then culls 
// complementary style layers from each. One instance retains only road/street 
// labels; the other retains all remaining labels. Both are initialized from 
// the style URL (rather than a raw style object) so the SDK properly resolves 
// sprites, glyphs, tile URLs, and esriConfig.apiKey authorization.
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
  const defaultLabelsRef = useRef<LabelLayerPair | null>(null);
  const satelliteLabelsRef = useRef<LabelLayerPair | null>(null);
  const imageryLayerRef = useRef<WebTileLayer | null>(null);

  // Mount default label layers on initialization since the map defaults to the standard view.
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
    if (!view?.map) return;
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

    // Toggle the satellite imagery layer. Index 0 keeps it below street labels 
    // and operational layers, directly sitting atop the dark-gray basemap.
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
  };

  return (
    <div className="map-basemap-toggle-container">
      <button
        type="button"
        onClick={toggleBasemap}
        data-tooltip={isSatellite ? "Switch to map view" : "Switch to satellite view"}
        aria-label={isSatellite ? "Switch to map view" : "Switch to satellite view"}
        className="map-basemap-toggle-button tooltip-left"
      >
        <FontAwesomeIcon icon={isSatellite ? faMap : faSatellite} />
      </button>
    </div>
  );
}