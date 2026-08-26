//MapBasemapToggle.tsx
//
//Top-right basemap toggle for MapView: swaps between the default dark-gray
//basemap and satellite imagery. Icon shows the basemap a click will switch
//*to*, not the one currently active (matches Google Maps' layers button).
//
//Satellite mode uses the bare `arcgis/imagery/standard` basemap (no bundled
//labels) plus a separate labels VectorTileLayer added to map.layers below
//the restaurant layer. Esri's composited hybrid styles (`arcgis/imagery`,
//`open/hybrid`) put their labels in Basemap.referenceLayers, which the SDK
//always renders above every operational layer including the restaurant
//points — this sidesteps that by keeping labels out of the basemap entirely.

import { useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatellite, faMap } from "@fortawesome/free-solid-svg-icons";

const DEFAULT_BASEMAP = "arcgis/dark-gray";
const SATELLITE_BASEMAP = "arcgis/imagery/standard";
const SATELLITE_BASEMAP_OPACITY = 0.4;
const SATELLITE_LABELS_STYLE_URL =
  "https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery/labels";

type MapBasemapToggleProps = {
  view: MapView | null;
};

export default function MapBasemapToggle({ view }: MapBasemapToggleProps) {
  const [isSatellite, setIsSatellite] = useState(false);
  const labelsLayerRef = useRef<VectorTileLayer | null>(null);

  const toggleBasemap = () => {
    if (!view?.map) return;
    const next = !isSatellite;
    view.map.basemap = next ? SATELLITE_BASEMAP : DEFAULT_BASEMAP;

    const basemap = view.map.basemap;
    if (next && basemap) {
      basemap.load().then(() => {
        basemap.baseLayers.forEach((layer) => {
          layer.opacity = SATELLITE_BASEMAP_OPACITY;
        });
      });

      if (!labelsLayerRef.current) {
        labelsLayerRef.current = new VectorTileLayer({
          url: SATELLITE_LABELS_STYLE_URL,
        });
      }
      view.map.layers.add(labelsLayerRef.current, 0);
    } else if (labelsLayerRef.current) {
      view.map.layers.remove(labelsLayerRef.current);
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
