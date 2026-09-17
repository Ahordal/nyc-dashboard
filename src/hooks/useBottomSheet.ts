// useBottomSheet.ts
//
// Three detents: peek (collapsed), half (list over a visible map), open
// (full explorer). Grab handle toggles peek<->open; selection opens; search raises to half.

import { useCallback, useState } from "react";

export type SheetDetent = "peek" | "half" | "open";

export function useBottomSheet(initial: SheetDetent = "peek") {
  const [detent, setDetent] = useState<SheetDetent>(initial);

  // Tap: open collapses to peek; anything else expands to open.
  const toggle = useCallback(() => {
    setDetent((current) => (current === "open" ? "peek" : "open"));
  }, []);

  const open = useCallback(() => setDetent("open"), []);
  const half = useCallback(() => setDetent("half"), []);
  const collapse = useCallback(() => setDetent("peek"), []);

  return { detent, setDetent, toggle, open, half, collapse };
}
