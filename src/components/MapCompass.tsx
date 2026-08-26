//MapCompass.tsx
//
//Top-left reorient-north control for MapView, stacked directly below the
//zoom chip. The icon rotates opposite the view's current rotation so it
//keeps pointing to true north as a passive orientation indicator; clicking
//it resets view.rotation to 0. Disabled at rotation 0 since there's nothing
//to reorient.

import { useEffect, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompass } from "@fortawesome/free-solid-svg-icons";

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
      <button
        type="button"
        onClick={() => {
          if (view) view.rotation = 0;
        }}
        disabled={isNorth}
        data-tooltip="Reorient to north"
        aria-label="Reorient to north"
        className="map-compass-button tooltip-right"
      >
        <FontAwesomeIcon
          icon={faCompass}
          style={{ transform: `rotate(${-rotation}deg)` }}
        />
      </button>
    </div>
  );
}
