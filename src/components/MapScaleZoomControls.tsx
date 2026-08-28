// MapScaleZoomControls.tsx
//
// Custom scale/zoom controls for MapView: a top-left zoom in/out button
// pair (replacing the default esri/widgets/Zoom), and the bottom-left Map
// Scale / Zoom Level readouts, each click-to-edit to jump straight to a
// value.

import { useEffect, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 20;

type MapScaleZoomControlsProps = {
  view: MapView | null;
};

export default function MapScaleZoomControls({
  view,
}: MapScaleZoomControlsProps) {
  const [currentScale, setCurrentScale] = useState<number>(0);
  const [currentZoom, setCurrentZoom] = useState<number>(0);

  const [isEditingScale, setIsEditingScale] = useState(false);
  const [scaleInputVal, setScaleInputVal] = useState("");

  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInputVal, setZoomInputVal] = useState("");

  useEffect(() => {
    if (!view) return;

    setCurrentScale(Math.round(view.scale));
    setCurrentZoom(Math.round(view.zoom * 10) / 10);

    const scaleHandle = reactiveUtils.watch(
      () => view.scale,
      (scale) => setCurrentScale(Math.round(scale)),
    );
    const zoomHandle = reactiveUtils.watch(
      () => view.zoom,
      (zoom) => setCurrentZoom(Math.round(zoom * 10) / 10),
    );

    return () => {
      scaleHandle.remove();
      zoomHandle.remove();
    };
  }, [view]);

  const handleScaleInputSubmit = () => {
    setIsEditingScale(false);
    const cleaned = scaleInputVal.replace(/,/g, "");
    const parsedScale = parseFloat(cleaned);

    if (!Number.isNaN(parsedScale) && parsedScale > 0 && view) {
      view.goTo({ scale: parsedScale }, { duration: 400 });
    }
  };

  const handleZoomInputSubmit = () => {
    setIsEditingZoom(false);
    const parsedZoom = parseFloat(zoomInputVal);

    if (!Number.isNaN(parsedZoom) && view) {
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, parsedZoom));
      view.goTo({ zoom: clampedZoom }, { duration: 400 });
    }
  };

  const stepZoom = (delta: number) => {
    if (!view) return;
    const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + delta));
    view.goTo({ zoom: target }, { duration: 200 });
  };

  return (
    <>
      <div className="map-zoom-buttons-container">
        <div className="map-zoom-buttons-chip">
          <button
            type="button"
            onClick={() => stepZoom(1)}
            disabled={currentZoom >= MAX_ZOOM}
            data-tooltip="Zoom in"
            aria-label="Zoom in"
            className="map-zoom-button tooltip-right"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            disabled={currentZoom <= MIN_ZOOM}
            data-tooltip="Zoom out"
            aria-label="Zoom out"
            className="map-zoom-button tooltip-right"
          >
            &minus;
          </button>
        </div>
      </div>

      <div className="map-bottom-controls">
        <div className="map-control-label">
          <span>MAP SCALE: 1:</span>
          {isEditingScale ? (
            <input
              type="text"
              autoFocus
              aria-label="Map scale denominator"
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
              data-tooltip="Click to type a map scale denominator"
              aria-label={`Map scale 1 to ${currentScale.toLocaleString()}. Activate to type a value.`}
              className="map-control-button tooltip-right"
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
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              autoFocus
              aria-label="Zoom level"
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
              data-tooltip="Click to type a zoom level"
              aria-label={`Zoom level ${currentZoom}. Activate to type a value.`}
              className="map-control-button tooltip-right"
            >
              {currentZoom}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
