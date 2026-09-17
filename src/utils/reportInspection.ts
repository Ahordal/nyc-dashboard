// reportInspection.ts
//
// Picks which inspection the Report tab shows for the loaded history.

import type { InspectionEvent } from "../types/restaurant";

// Uses selectedId if it's still in this history, else the most recent
// event — selectedId can lag a restaurant switch. Null only for empty history.
export function resolveReportInspectionId(
  selectedId: string | null,
  history: InspectionEvent[],
): string | null {
  if (selectedId !== null && history.some((event) => event.id === selectedId)) {
    return selectedId;
  }
  return history[history.length - 1]?.id ?? null;
}
