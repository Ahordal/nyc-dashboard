// restaurant.ts
//
// Shared TypeScript models for restaurants, inspection history,
// violations, and related lookup data, used throughout the dashboard.

// Status types

export type CurrentStatus = "open" | "closed" | "unknown";

// Violation types

export type Violation = {
  code: string;
  critical_flag: string;
};

// Maps each violation code to its full description and official DOHMH category.
// Stored separately from individual inspection records because the same code
// descriptions and categories are reused across tens of thousands of violations.
// See pipeline notes.
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
  // Just the street name, formatted for display (ordinal suffixes,
  // expanded abbreviations, e.g. "5 STREET" becomes "5th Street"). No
  // neighbourhood included; compose with `boro` or `neighbourhood`
  // separately as needed. See normalize.mjs's formatDisplayStreet().
  display_street: string;
  // Full display address: building + display_street, with neighbourhood
  // appended only when a verified geocoder resolution provided one (see
  // location_status below). E.g. "37-70 79th Street, Jackson Heights".
  display_address: string;
  zipcode: string;
  phone: string;
  cuisine: string;
  // The DOHMH-supplied coordinate, preserved separately and untouched by
  // geocoding. Null when DOHMH's own data was unusable (missing or
  // outside the NYC bounding box); this can happen even when
  // latitude/longitude above ARE present, if a verified geocoder
  // resolution is what's actually being displayed instead.
  dohmh_latitude: number | null;
  dohmh_longitude: number | null;
  // "verified":   an independent geocoder confirmed this location;
  //               latitude/longitude above come from that resolution.
  // "unverified": geocoding ran and found no acceptable match;
  //               latitude/longitude fall back to DOHMH's own.
  // "pending":    not yet attempted, or a prior attempt hit a transient
  //               error and will be retried on a future run.
  location_status: LocationStatus;
  // Only populated when location_status is "verified": the geocoder's
  // reported neighbourhood (e.g. "Jackson Heights"). Enrichment only, not
  // authoritative DOHMH data; geocoder neighbourhood labels can be fuzzy.
  neighbourhood: string | null;
  grade: string | null;
  grade_date: string | null;
  // Null for restaurants in the "Uninspected" category (see
  // gradeCategory.ts's UNINSPECTED_GRADE): DOHMH has never recorded a
  // real inspection for them, so there's no score to report.
  score: number | null;
  inspection_date: string;
  inspection_type: string;
  action: string;
  current_status_code: CurrentStatus;
  current_status_label: string;
  record_date: string | null;
  community_board: string;
  council_district: string;
};

// One inspection event from history/{camis}.json, loaded with fetch +
// JSON.parse. This is the only place violation data lives on the client:
// the current inspection's violations are read from the matching event
// here, not from the GeoJSON feature (which no longer carries them).

// Inspection history

export type InspectionEvent = {
  id: string;
  date: string;
  // Administrative grades (N, Not Yet Graded, in particular) often have
  // no computed score. The pipeline can emit `null` or omit the key
  // entirely for these, so this is genuinely nullable; consumers must
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