// types/restaurant.ts
export type CurrentStatus = "open" | "closed_by_doh" | "unknown";

export type Violation = {
  code: string;
  critical_flag: string;
};

// The shape of violation-codes.json: a lookup from violation `code` to
// its full description text. Kept as one small shared file (rather than
// embedded on every Violation) since the same ~115 codes repeat across
// tens of thousands of inspection events -- see pipeline notes.
export type ViolationCodeLookup = Record<string, string>;

export type RestaurantProperties = {
  id: string;
  camis: string;
  name: string;
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
  current_status: CurrentStatus;
  record_date: string | null;
  community_board: string;
  council_district: string;
};

// One entry from history/{camis}.json -- unlike RestaurantProperties,
// violations here is already a real array (this file is read via plain
// fetch + JSON.parse, not GeoJSONLayer, so no stringification was needed).
export type InspectionEvent = {
  id: string;
  date: string;
  score: number;
  grade: string | null;
  inspection_type: string;
  action: string;
  violations: Violation[];
};