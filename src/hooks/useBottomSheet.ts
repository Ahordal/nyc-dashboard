// useBottomSheet.ts
//
// Detent state for the mobile bottom sheet. Two states: peek (a
// collapsed glance) and open (the full explorer). The grab handle
// toggles between them; selecting a restaurant from the list opens it.

import { useCallback, useState } from "react";

export type SheetDetent = "peek" | "open";

export function useBottomSheet(initial: SheetDetent = "peek") {
  const [detent, setDetent] = useState<SheetDetent>(initial);

  // Handle tap: peek <-> open.
  const toggle = useCallback(() => {
    setDetent((current) => (current === "peek" ? "open" : "peek"));
  }, []);

  const open = useCallback(() => setDetent("open"), []);
  const collapse = useCallback(() => setDetent("peek"), []);

  return { detent, setDetent, toggle, open, collapse };
}
