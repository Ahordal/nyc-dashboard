// reportInspection.ts
//
// Picks which inspection the Report tab shows for the loaded history.

import type { InspectionEvent } from "../types/restaurant";

// Uses the explicitly selected inspection when it belongs to the current
// history; otherwise falls back to the most recent event. selectedId can
// lag a restaurant switch (it still holds the previous restaurant's
// inspection while history has already updated), so the membership check
// matters. Returns null for empty history with nothing selected.
export function resolveReportInspectionId(
  selectedId: string | null,
  history: InspectionEvent[],
): string | null {
  if (selectedId !== null && history.some((event) => event.id === selectedId)) {
    return selectedId;
  }
  return history[history.length - 1]?.id ?? null;
}
