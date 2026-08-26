//MapBasemapToggle.tsx
//
//Top-right basemap toggle for MapView: swaps between the default dark-gray
//basemap and satellite imagery. Icon shows the basemap a click will switch
//*to*, not the one currently active (matches Google Maps' layers button).
//
//Both modes use a bare `/base` basemap variant (no bundled labels) plus the
//matching labels style split into two VectorTileLayers: street/road-name
//style layers (id prefixed "Road/label/" or "Road tunnel/label/" in both the
//dark-gray and imagery label styles) render below the restaurant layer so
//they never sit on top of a dot, while everything else in the labels style
//(place, neighborhood, water body, etc. names) renders above it as before.
//Esri's composited styles (`arcgis/dark-gray`, `arcgis/imagery`, ...) put
//their labels in Basemap.referenceLayers, which the SDK always renders above
//every operational layer regardless of name — this sidesteps that by keeping
//labels out of the basemap entirely and controlling their stacking directly.

import { useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatellite, faMap } from "@fortawesome/free-solid-svg-icons";

const DEFAULT_BASEMAP = "arcgis/dark-gray/base";
const SATELLITE_BASEMAP = "arcgis/imagery/standard";
const SATELLITE_BASEMAP_OPACITY = 0.4;
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

// Loads a labels style once, then splits its style layers into a
// street-names-only VectorTileLayer and an everything-else VectorTileLayer,
// so the two can be stacked on opposite sides of the restaurant layer.
async function createSplitLabelLayers(styleUrl: string): Promise<LabelLayerPair> {
  const sourceLayer = new VectorTileLayer({ url: styleUrl });
  await sourceLayer.load();

  const fullStyle = sourceLayer.currentStyleInfo.style as { layers: { id: string }[] };
  const streetLayers = fullStyle.layers.filter((l) => isStreetLabelLayerId(l.id));
  const placeLayers = fullStyle.layers.filter((l) => !isStreetLabelLayerId(l.id));

  return {
    streetLayer: new VectorTileLayer({
      style: { ...fullStyle, layers: streetLayers },
    }),
    placeLayer: new VectorTileLayer({
      style: { ...fullStyle, layers: placeLayers },
    }),
  };
}

type MapBasemapToggleProps = {
  view: MapView | null;
};

export default function MapBasemapToggle({ view }: MapBasemapToggleProps) {
  const [isSatellite, setIsSatellite] = useState(false);
  const defaultLabelsRef = useRef<LabelLayerPair | null>(null);
  const satelliteLabelsRef = useRef<LabelLayerPair | null>(null);

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
    map.basemap = next ? SATELLITE_BASEMAP : DEFAULT_BASEMAP;

    const basemap = map.basemap;
    if (next && basemap) {
      basemap.load().then(() => {
        basemap.baseLayers.forEach((layer) => {
          layer.opacity = SATELLITE_BASEMAP_OPACITY;
        });
      });
    }

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
