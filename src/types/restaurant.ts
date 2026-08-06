// restaurant.ts
//
// Shared data models for restaurant inspection data.
//
// Defines the TypeScript types used throughout the dashboard for
// restaurants, inspection history, violations, and related lookup data.

// Status types

export type CurrentStatus = "open" | "closed" | "unknown";

// Violation types

export type Violation = {
  code: string;
  critical_flag: string;
};

// Maps each violation code to its full description. Stored separately
// from individual inspection records because the same ~115 codes are
// reused across tens of thousands of violations. See pipeline notes.
export type ViolationCodeLookup = Record<string, string>;

// Restaurant data

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
  zipcode: string;
  phone: string;
  cuisine: string;
  grade: string | null;
  grade_date: string | null;
  score: number;
  inspection_date: string;
  inspection_type: string;
  action: string;
  violations: string; // JSON-stringified -- GeoJSONLayer limitation, see pipeline notes
  current_status_code: CurrentStatus;
  current_status_label: string;
  record_date: string | null;
  community_board: string;
  council_district: string;
};

// One inspection event from history/{camis}.json. Unlike
// RestaurantProperties, violations is a real array because this file is
// loaded with fetch + JSON.parse instead of GeoJSONLayer.

// Inspection history

export type InspectionEvent = {
  id: string;
  date: string;
  // Administrative grades (N - Not Yet Graded in particular) often have
  // no computed score. The pipeline can emit `null` or omit the key
  // entirely for these, so this is genuinely nullable -- consumers must
  // check before using it numerically (see PerformanceChart.tsx).
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