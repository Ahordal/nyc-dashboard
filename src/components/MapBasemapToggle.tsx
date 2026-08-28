//MapBasemapToggle.tsx
//
//Top-right basemap toggle for MapView: swaps between the default dark-gray
//map and satellite imagery. Icon shows the mode a click will switch *to*,
//not the one currently active (matches Google Maps' layers button).
//
//The dark-gray vector basemap (`arcgis/dark-gray/base`, set in MapView) stays
//mounted in both modes. Satellite mode just overlays Esri World Imagery as
//the bottom-most *operational* layer (a keyless WebTileLayer straight off
//services.arcgisonline.com) on top of it. Swapping `map.basemap` to an
//imagery style instead was unreliable here: the basemap-styles v2
//`arcgis/imagery/*` variants need an entitlement this app's API key lacks,
//and `Basemap.fromId("satellite")`'s tiled MapServer load fails once
//esriConfig.apiKey is set (token rejected by arcgisonline) — either way the
//basemap silently drops and nothing paints.
//
//Labels for each mode come from the matching labels style, split into two
//VectorTileLayers: street/road-name style layers (id prefixed "Road/label/"
//or "Road tunnel/label/" in both the dark-gray and imagery label styles)
//render below the restaurant layer so they never sit on top of a dot, while
//everything else in the labels style (place, neighborhood, water body, etc.
//names) renders above it. Esri's composited styles (`arcgis/dark-gray`,
//`arcgis/imagery`, ...) put their labels in Basemap.referenceLayers, which
//the SDK always renders above every operational layer regardless of name —
//this sidesteps that by keeping labels out of the basemap entirely and
//controlling their stacking directly.

import { useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatellite, faMap } from "@fortawesome/free-solid-svg-icons";

// Esri World Imagery, addressed as raw tiles so no token/metadata request is
// made (and so esriConfig.apiKey is never appended and rejected).
const WORLD_IMAGERY_TILE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{level}/{row}/{col}";
// Tone the imagery down so the restaurant dots on top keep their contrast
// while the aerial detail still reads: opacity lets the dark-gray basemap
// blend through, and the brightness/saturation effect dims the imagery's
// own pixels. Tune both to taste.
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

// Loads the same labels style into two VectorTileLayers, then deletes the
// complementary set of style layers from each: one keeps only street/road-name
// labels, the other keeps everything else, so the two can be stacked on
// opposite sides of the restaurant layer. Both layers are created from the
// style URL (not a plucked style object) so the SDK resolves the style's
// sprite/glyph/tile URLs and applies esriConfig.apiKey the normal way —
// rebuilding from `currentStyleInfo.style` skips that and the text never
// renders.
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

  // The map mounts on the default (non-satellite) basemap, so its labels
  // need to be added up front rather than only on toggle.
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

    // Swap the overlaid label layers for the target mode.
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

    // Add/remove the imagery overlay. Index 0 keeps it below the street
    // labels (and everything else), directly on top of the dark-gray basemap.
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
