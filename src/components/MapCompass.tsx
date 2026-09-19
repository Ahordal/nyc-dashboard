// MapCompass.tsx
//
// Reorient-north control below the zoom chip. Icon rotates opposite the
// view as a passive indicator; click resets to 0, disabled already there.

import { useEffect, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompass } from "@fortawesome/free-solid-svg-icons";
import MapControlButton from "./MapControlButton";

const ROTATION_EPSILON = 0.1;

type MapCompassProps = {
  view: MapView | null;
};

export default function MapCompass({ view }: MapCompassProps) {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!view) return;

    setRotation(view.rotation);

    const handle = reactiveUtils.watch(
      () => view.rotation,
      (next) => setRotation(next),
    );

    return () => handle.remove();
  }, [view]);

  const isNorth = Math.abs(rotation) < ROTATION_EPSILON;

  return (
    <div className="map-compass-container">
      <MapControlButton
        onClick={() => {
          if (view) view.rotation = 0;
        }}
        disabled={isNorth}
        tooltip="Reorient to north"
        ariaLabel="Reorient to north"
        className="control-chip map-compass-button tooltip-right"
      >
        <FontAwesomeIcon
          icon={faCompass}
          style={{ transform: `rotate(${-rotation}deg)` }}
        />
      </MapControlButton>
    </div>
  );
}
