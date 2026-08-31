// useInspectionHistory.ts
//
// Loads a restaurant's inspection history by CAMIS. Results are held in
// an LRU cache (capped at MAX_HISTORY_CACHE_ENTRIES) shared across
// selections for the component's lifetime, so revisiting a restaurant is
// instant. Returns empty history with isLoadingHistory false when camis
// is null; aborts the in-flight fetch on a camis change or unmount.

import { useEffect, useRef, useState } from "react";

import type { InspectionEvent } from "../types/restaurant";
import { lruGet, lruSet } from "../utils/lruMap";

const MAX_HISTORY_CACHE_ENTRIES = 50;

type InspectionHistoryState = {
  history: InspectionEvent[];
  isLoadingHistory: boolean;
};

export function useInspectionHistory(
  camis: string | null,
): InspectionHistoryState {
  const [history, setHistory] = useState<InspectionEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const historyCache = useRef<Map<string, InspectionEvent[]>>(new Map());

  useEffect(() => {
    if (!camis) {
      setHistory([]);
      setIsLoadingHistory(false);

      return;
    }

    const cachedHistory = lruGet(historyCache.current, camis);

    if (cachedHistory) {
      setHistory(cachedHistory);
      setIsLoadingHistory(false);

      return;
    }

    setHistory([]);
    setIsLoadingHistory(true);

    const controller = new AbortController();

    fetch(`/data/history/${camis}.json`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: InspectionEvent[]) => {
        lruSet(historyCache.current, camis, data, MAX_HISTORY_CACHE_ENTRIES);

        setHistory(data);
        setIsLoadingHistory(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setHistory([]);
          setIsLoadingHistory(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [camis]);

  return { history, isLoadingHistory };
}
