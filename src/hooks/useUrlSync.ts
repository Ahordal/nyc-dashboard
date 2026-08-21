// src/hooks/useUrlSync.ts
import { useEffect, useRef } from "react";

type UrlSyncState = {
  grades: string[];
  boroughs: string[];
  searchQuery: string;
  selectedRestaurantCamis: string | null;
};

export type InitialUrlState = {
  grades: string[];
  boroughs: string[];
  searchQuery: string;
  camis: string | null;
};

export function useUrlSync(
  state: UrlSyncState,
  onInit: (initial: InitialUrlState) => void,
) {
  const isInitialized = useRef(false);

  // 1. Read initial state from URL on first mount
  useEffect(() => {
    if (isInitialized.current) {
      return;
    }
    isInitialized.current = true;

    const params = new URLSearchParams(window.location.search);

    const gradesParam = params.get("grades");
    const boroughsParam = params.get("boroughs");
    const qParam = params.get("q");
    const camisParam = params.get("camis") || params.get("id");

    const initial: InitialUrlState = {
      grades: gradesParam ? gradesParam.split(",").filter(Boolean) : [],
      boroughs: boroughsParam ? boroughsParam.split(",").filter(Boolean) : [],
      searchQuery: qParam ? qParam.trim() : "",
      camis: camisParam || null,
    };

    if (
      initial.grades.length > 0 ||
      initial.boroughs.length > 0 ||
      initial.searchQuery ||
      initial.camis
    ) {
      onInit(initial);
    }
  }, [onInit]);

  // 2. Write state back to the URL whenever state updates
  useEffect(() => {
    if (!isInitialized.current) {
      return;
    }

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

    const queryString = params.toString();
    const newUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;

    window.history.replaceState({}, "", newUrl);
  }, [
    state.grades,
    state.boroughs,
    state.searchQuery,
    state.selectedRestaurantCamis,
  ]);
}