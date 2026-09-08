// MapUserLocationControl.tsx
//
// Map-corner "locate me" chip (mobile only). Same 32x32 shell as the
// other map controls; the glyph swaps to a spinner while a fix is in
// flight and to a muted state on error / out-of-area, with the reason in
// the tooltip. Once located, a "My location" label + clear (x) button
// appears to its left -- mirroring the Search Radius control's active
// panel -- and the arrow button then re-locates on tap. Out-of-area also
// raises a NoticeOverlay in MapView.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faLocationArrow,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type {
  GeolocationErrorKind,
  GeolocationStatus,
} from "../hooks/useGeolocation";

type MapUserLocationControlProps = {
  status: GeolocationStatus;
  errorKind: GeolocationErrorKind | null;
  // A fix came back but landed outside NYC_BOUNDS.
  outsideNyc: boolean;
  onLocate: () => void;
  onClear: () => void;
};

function tooltipText(
  status: GeolocationStatus,
  errorKind: GeolocationErrorKind | null,
  outsideNyc: boolean,
): string {
  if (outsideNyc) return "Outside NYC";
  if (status === "error") {
    if (errorKind === "denied") return "Location blocked";
    if (errorKind === "insecure") return "Location needs HTTPS";
    return "Location unavailable";
  }
  return "Show my location";
}

function ariaLabel(
  status: GeolocationStatus,
  errorKind: GeolocationErrorKind | null,
  outsideNyc: boolean,
): string {
  if (status === "locating") return "Finding your location";
  if (outsideNyc) return "Your location is outside New York City";
  if (status === "error") {
    if (errorKind === "denied")
      return "Location is blocked in your browser settings";
    if (errorKind === "insecure")
      return "Location requires a secure connection";
    return "Your location is currently unavailable";
  }
  if (status === "success") return "Update my location";
  return "Show my location on the map";
}

export default function MapUserLocationControl({
  status,
  errorKind,
  outsideNyc,
  onLocate,
  onClear,
}: MapUserLocationControlProps) {
  const locating = status === "locating";
  const located = status === "success" && !outsideNyc;
  const muted = status === "error" || outsideNyc;

  return (
    <div className="map-user-location-container">
      {located && (
        <div className="map-user-location-panel">
          <span className="map-user-location-label">My location</span>
          <button
            type="button"
            className="map-user-location-clear"
            aria-label="Clear my location"
            onClick={onClear}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onLocate}
        disabled={locating}
        data-tooltip={
          locating || located
            ? undefined
            : tooltipText(status, errorKind, outsideNyc)
        }
        aria-label={ariaLabel(status, errorKind, outsideNyc)}
        className={`map-user-location-button tooltip-left${
          locating ? " is-locating" : ""
        }${located ? " active" : ""}${muted ? " muted" : ""}`}>
        <FontAwesomeIcon
          icon={locating ? faCircleNotch : faLocationArrow}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
