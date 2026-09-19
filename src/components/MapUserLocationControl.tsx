// MapUserLocationControl.tsx
//
// Map-corner "locate me" chip (mobile only), same shell as other
// controls. Glyph spins in flight, mutes on error/out-of-area (also
// raising a NoticeOverlay in MapView); once located, a "My location"
// label + clear button appear, and the arrow re-locates on tap.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faLocationArrow,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import MapControlButton from "./MapControlButton";

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
          <MapControlButton
            className="map-user-location-clear"
            ariaLabel="Clear my location"
            onClick={onClear}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </MapControlButton>
        </div>
      )}

      <MapControlButton
        onClick={onLocate}
        disabled={locating}
        tooltip={
          locating || located
            ? undefined
            : tooltipText(status, errorKind, outsideNyc)
        }
        ariaLabel={ariaLabel(status, errorKind, outsideNyc)}
        className={`map-user-location-button tooltip-left${
          locating ? " is-locating" : ""
        }${located ? " active" : ""}${muted ? " muted" : ""}`}>
        <FontAwesomeIcon
          icon={locating ? faCircleNotch : faLocationArrow}
          aria-hidden="true"
        />
      </MapControlButton>
    </div>
  );
}
