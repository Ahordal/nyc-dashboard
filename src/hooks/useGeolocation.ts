// useGeolocation.ts
//
// One-shot device geolocation for "locate me" — not a live watch, a tap
// asks once. NYC-bounds checking and map drawing live in MapView.

import { useCallback, useEffect, useRef, useState } from "react";

export type GeolocationStatus = "idle" | "locating" | "success" | "error";

export type GeolocationErrorKind =
  | "denied" // permission blocked — can't be re-prompted from here
  | "unavailable" // position source failed, or no geolocation API at all
  | "timeout" // no fix within the timeout
  | "insecure"; // non-secure context, so the API is unusable

export type GeolocationFix = {
  latitude: number;
  longitude: number;
  accuracy: number; // metres
};

export type UseGeolocationResult = {
  status: GeolocationStatus;
  position: GeolocationFix | null;
  errorKind: GeolocationErrorKind | null;
  requestLocation: () => void;
  clearLocation: () => void;
};

// A recent OS fix is fine first time (snappy on a cold map). A re-tap
// means "that's wrong" — force a fresh read, give it more time.
const FIRST_FIX_MAX_AGE_MS = 30_000;
const FIRST_FIX_TIMEOUT_MS = 10_000;
const REFRESH_TIMEOUT_MS = 15_000;

export function useGeolocation(): UseGeolocationResult {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [position, setPosition] = useState<GeolocationFix | null>(null);
  const [errorKind, setErrorKind] = useState<GeolocationErrorKind | null>(null);

  // Bumped per request and on unmount, so stale callbacks are ignored —
  // mirrors MapView's ratchet.
  const requestIdRef = useRef(0);
  const hasFixRef = useRef(false);

  useEffect(
    () => () => {
      requestIdRef.current++;
    },
    [],
  );

  const requestLocation = useCallback(() => {
    const id = ++requestIdRef.current;

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setErrorKind("insecure");
      setStatus("error");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErrorKind("unavailable");
      setStatus("error");
      return;
    }

    const refreshing = hasFixRef.current;
    setErrorKind(null);
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (id !== requestIdRef.current) return;
        hasFixRef.current = true;
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setErrorKind(null);
        setStatus("success");
      },
      (err) => {
        if (id !== requestIdRef.current) return;
        setErrorKind(
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable",
        );
        setStatus("error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: refreshing ? 0 : FIRST_FIX_MAX_AGE_MS,
        timeout: refreshing ? REFRESH_TIMEOUT_MS : FIRST_FIX_TIMEOUT_MS,
      },
    );
  }, []);

  // Bumps the id to ignore in-flight callbacks; resets the fix flag for the cached-fix path.
  const clearLocation = useCallback(() => {
    requestIdRef.current++;
    hasFixRef.current = false;
    setPosition(null);
    setErrorKind(null);
    setStatus("idle");
  }, []);

  return { status, position, errorKind, requestLocation, clearLocation };
}
