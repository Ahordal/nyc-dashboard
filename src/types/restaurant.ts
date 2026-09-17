// restaurant.ts
//
// Shared models: restaurants, inspection history, violations, lookups.

// Status types

export type CurrentStatus = "open" | "closed" | "unknown";

// Violation types

export type Violation = {
  code: string;
  critical_flag: string;
};

// Reused across tens of thousands of violations — kept separate, not duplicated per record.
export type ViolationCodeDetails = {
  description: string;
  category: string;
};

export type ViolationCodeLookup = Record<string, ViolationCodeDetails>;

// Restaurant data

export type LocationStatus = "verified" | "unverified" | "pending";

export type RestaurantProperties = {
  id: string;
  camis: string;
  name: string;
  latitude?: number;
  longitude?: number;
  search_index: string;
  boro: string;
  building: string;
  street: string;
  // Formatted for display ("5 STREET" -> "5th Street"), no neighbourhood —
  // pair with `boro`. See formatDisplayStreet() in normalize.mjs.
  display_street: string;
  zipcode: string;
  phone: string;
  cuisine: string;
  // "verified": geocoder confirmed the location; lat/lon come from that match.
  // "unverified": no acceptable match; lat/lon fall back to DOHMH's.
  // "pending": not yet attempted, or retrying after a transient error.
  location_status: LocationStatus;
  grade: string | null;
  // Null for "Uninspected" (UNINSPECTED_GRADE) — no real inspection to score.
  score: number | null;
  inspection_date: string;
  inspection_type: string;
  action: string;
  current_status_code: CurrentStatus;
  current_status_label: string;
};

// Inspection history

// From history/{camis}.json — the only place violation data lives client-side.
export type InspectionEvent = {
  id: string;
  date: string;
  // Administrative grades (N, Not Yet Graded) often lack a score — check
  // before using numerically (see PerformanceChart.tsx).
  score: number | null;
  grade: string | null;
  inspection_type: string;
  action: string;
  violations: Violation[];
};
export type ChartPoint = {
  id: string;
  timestamp: number;
  score: number;
  grade: string | null;
  action: string | null;
};