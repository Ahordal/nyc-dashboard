// src/hooks/useUrlSync.ts
import { useEffect, useRef } from "react";

import {
  isSearchRadiusMiles,
  type SearchRadiusMiles,
  type SearchRadiusPoint,
} from "../types/searchRadius";

export type UrlSyncState = {
  grades: string[];
  boroughs: string[];
  searchQuery: string;
  selectedRestaurantCamis: string | null;
  // The active Search Radius centre, or null when the tool is inactive.
  searchRadiusPoint: SearchRadiusPoint | null;
  // Only serialized when searchRadiusPoint is set.
  searchRadiusMiles: SearchRadiusMiles;
};

export type InitialRadiusState = {
  point: SearchRadiusPoint;
  miles: SearchRadiusMiles;
};

export type InitialUrlState = {
  grades: string[];
  boroughs: string[];
  searchQuery: string;
  camis: string | null;
  radius: InitialRadiusState | null;
};

// Coordinates are rounded to 5 decimal places (~1 m) on the way out --
// enough to land the pin back on the same block without bloating the URL.
const RADIUS_COORD_PRECISION = 5;

// Parses `?radius=<lat>,<lng>,<miles>`. Returns null (rather than throwing
// or partially applying) for anything malformed or out of range, since
// the value can be hand-edited.
export function parseRadiusParam(raw: string | null): InitialRadiusState | null {
  if (!raw) return null;

  const parts = raw.split(",");
  if (parts.length !== 3) return null;

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  const miles = Number(parts[2]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(miles)
  ) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  if (!isSearchRadiusMiles(miles)) return null;

  return { point: { latitude, longitude }, miles };
}

// Pure URL-string <-> state helpers, exported so they can be unit-tested
// without rendering the hook.
export function parseInitialUrlState(search: string): InitialUrlState {
  const params = new URLSearchParams(search);

  const gradesParam = params.get("grades");
  const boroughsParam = params.get("boroughs");
  const qParam = params.get("q");
  const camisParam = params.get("camis") || params.get("id");

  return {
    grades: gradesParam ? gradesParam.split(",").filter(Boolean) : [],
    boroughs: boroughsParam ? boroughsParam.split(",").filter(Boolean) : [],
    searchQuery: qParam ? qParam.trim() : "",
    camis: camisParam || null,
    radius: parseRadiusParam(params.get("radius")),
  };
}

function hasAnyInitialState(initial: InitialUrlState): boolean {
  return (
    initial.grades.length > 0 ||
    initial.boroughs.length > 0 ||
    initial.searchQuery !== "" ||
    initial.camis !== null ||
    initial.radius !== null
  );
}

export function buildUrlQuery(state: UrlSyncState): string {
  const params = new URLSearchParams();

  if (state.grades.length > 0) {
    params.set("grades", state.grades.join(","));
  }

  if (state.boroughs.length > 0) {
    params.set("boroughs", state.boroughs.join(","));
  }

  if (state.searchQuery.trim()) {
    params.set("q", state.searchQuery.trim());
  }

  if (state.selectedRestaurantCamis) {
    params.set("camis", state.selectedRestaurantCamis);
  }

  if (state.searchRadiusPoint) {
    const lat = state.searchRadiusPoint.latitude.toFixed(RADIUS_COORD_PRECISION);
    const lng = state.searchRadiusPoint.longitude.toFixed(
      RADIUS_COORD_PRECISION,
    );
    params.set("radius", `${lat},${lng},${state.searchRadiusMiles}`);
  }

  return params.toString();
}

export function useUrlSync(
  state: UrlSyncState,
  onInit: (initial: InitialUrlState) => void,
) {
  const isInitialized = useRef(false);

  const {
    grades,
    boroughs,
    searchQuery,
    selectedRestaurantCamis,
    searchRadiusPoint,
    searchRadiusMiles,
  } = state;

  // 1. Read initial state from URL on first mount
  useEffect(() => {
    if (isInitialized.current) {
      return;
    }
    isInitialized.current = true;

    const initial = parseInitialUrlState(window.location.search);

    if (hasAnyInitialState(initial)) {
      onInit(initial);
    }
  }, [onInit]);

  // 2. Write state back to the URL whenever state updates
  useEffect(() => {
    if (!isInitialized.current) {
      return;
    }

    const queryString = buildUrlQuery({
      grades,
      boroughs,
      searchQuery,
      selectedRestaurantCamis,
      searchRadiusPoint,
      searchRadiusMiles,
    });
    const newUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;

    window.history.replaceState({}, "", newUrl);
  }, [
    grades,
    boroughs,
    searchQuery,
    selectedRestaurantCamis,
    searchRadiusPoint,
    searchRadiusMiles,
  ]);
}
