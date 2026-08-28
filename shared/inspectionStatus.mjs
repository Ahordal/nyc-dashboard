// inspectionStatus.mjs
//
// Single source of truth for the raw DOHMH action text and grade values
// used to derive a restaurant's operating status. Shared between the
// data pipeline (pipeline/fetch-inspection.mjs, a standalone Node script)
// and the frontend (src/utils/gradeCategory.ts, bundled by Vite).

export const OPEN_ACTIONS = [
  "Violations were cited in the following area(s).",
  "No violations were recorded at the time of this inspection.",
  "Establishment re-opened by DOHMH",
];

export const CLOSED_ACTIONS = [
  "Establishment re-closed by DOHMH",
  "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.",
];

// Sentinel grade value assigned to restaurants that have never actually
// been inspected (every DOHMH record for them is the 1900-01-01
// placeholder date). Never a real DOHMH grade (real grades are only
// A/B/C/Z/P/N), so it's safe to use as a distinct marker.
export const UNINSPECTED_GRADE = "U";
