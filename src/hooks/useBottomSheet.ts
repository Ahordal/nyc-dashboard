// useBottomSheet.ts
//
// Detent state for the mobile bottom sheet. Three states: peek (a
// collapsed glance), half (list over a still-visible map, used while the
// app-bar search drawer is open) and open (the full explorer). The grab
// handle toggles peek <-> open (from half it goes to open); selecting a
// restaurant from the list opens it; search raises it to half.

import { useCallback, useState } from "react";

export type SheetDetent = "peek" | "half" | "open";

export function useBottomSheet(initial: SheetDetent = "peek") {
  const [detent, setDetent] = useState<SheetDetent>(initial);

  // Handle tap: open collapses to peek, anything else expands to open.
  const toggle = useCallback(() => {
    setDetent((current) => (current === "open" ? "peek" : "open"));
  }, []);

  const open = useCallback(() => setDetent("open"), []);
  const half = useCallback(() => setDetent("half"), []);
  const collapse = useCallback(() => setDetent("peek"), []);

  return { detent, setDetent, toggle, open, half, collapse };
}
