// normalize.mjs
//
// Address normalization helpers for the geocoding pipeline. Pure
// functions (no API calls, no side effects) so they can be unit-tested
// in isolation before any LocationIQ call.
//
// Three distinct jobs, kept deliberately separate:
//   1. normalizeHouseNumber  for MATCHING (DOHMH vs geocoder results)
//   2. normalizeStreetName    for MATCHING
//   3. formatDisplayAddress   for DISPLAY ONLY, never used in matching/hashing

// 1. House number normalization (for matching)
//
// Returns both the raw input and a normalized (digits-only) form. The
// raw form is kept so "79-01" and a hypothetical "7-901", which could
// strip to overlapping digit sequences in edge cases, can still be told
// apart later if needed.
export function normalizeHouseNumber(raw) {
  const raw_ = (raw || '').toString().trim();
  const normalized = raw_.replace(/\D/g, ''); // digits only, e.g. "79-01" -> "7901"
  return { raw: raw_, normalized };
}

// Compares two house numbers by their normalized (digits-only) form.
export function houseNumbersMatch(a, b) {
  const na = normalizeHouseNumber(a).normalized;
  const nb = normalizeHouseNumber(b).normalized;
  return Boolean(na) && na === nb;
}

// 2. Street name normalization (for matching)
//
// Token-level mapping, NOT loose string replacement, so two genuinely
// different streets can't collapse into a false match (e.g. don't
// blindly strip "saint" from "St. Nicholas Ave" the way "St" expands to
// "Street" elsewhere).

const STREET_TYPE_MAP = {
  st: 'street',
  str: 'street',
  ave: 'avenue',
  av: 'avenue',
  blvd: 'boulevard',
  rd: 'road',
  dr: 'drive',
  ln: 'lane',
  pl: 'place',
  ct: 'court',
  pkwy: 'parkway',
  hwy: 'highway',
  expy: 'expressway',
  sq: 'square',
  ter: 'terrace',
};

const DIRECTIONAL_MAP = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
};

export function normalizeStreetName(raw) {
  const raw_ = (raw || '').toString().trim();
  if (!raw_) return '';

  const tokens = raw_
    .toLowerCase()
    .replace(/\./g, '') // "St." -> "St"
    .split(/\s+/);

  const normalizedTokens = tokens.map((token) => {
    // Strip a trailing ordinal suffix for comparison purposes ONLY
    // (e.g. "79th" -> "79"), so "79 Street" and "79th Street" compare equal.
    const deOrdinaled = token.replace(/^(\d+)(st|nd|rd|th)$/, '$1');

    if (STREET_TYPE_MAP[deOrdinaled]) return STREET_TYPE_MAP[deOrdinaled];
    if (DIRECTIONAL_MAP[deOrdinaled]) return DIRECTIONAL_MAP[deOrdinaled];
    return deOrdinaled;
  });

  return normalizedTokens.join(' ');
}

export function streetNamesMatch(a, b) {
  const na = normalizeStreetName(a);
  const nb = normalizeStreetName(b);
  return Boolean(na) && na === nb;
}

// 3. Display formatting (DISPLAY ONLY, never feeds into matching or hashing)

function ordinalSuffix(n) {
  const num = parseInt(n, 10);
  if (Number.isNaN(num)) return '';
  const rem100 = num % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (num % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function titleCase(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// Formats a raw DOHMH-style street string (e.g. "79 STREET") into a
// display-friendly form (e.g. "79th Street"). Purely cosmetic.
export function formatDisplayStreet(raw) {
  const raw_ = (raw || '').toString().trim();
  if (!raw_) return '';

  return raw_
    .split(/\s+/)
    .map((token) => {
      // Add ordinal suffix to plain numeric tokens: "79" -> "79th"
      if (/^\d+$/.test(token)) {
        return `${token}${ordinalSuffix(token)}`;
      }
      // Expand common abbreviations for display too, title-cased
      const lower = token.toLowerCase().replace(/\.$/, '');
      if (STREET_TYPE_MAP[lower]) return titleCase(STREET_TYPE_MAP[lower]);
      if (DIRECTIONAL_MAP[lower]) return titleCase(DIRECTIONAL_MAP[lower]);
      return titleCase(token);
    })
    .join(' ');
}

// Combines building + formatted street (+ optional neighbourhood) into a
// single display string. Neighbourhood is enrichment only, never required.
export function formatDisplayAddress({ building, street, neighbourhood }) {
  const parts = [building, formatDisplayStreet(street)].filter(Boolean);
  let result = parts.join(' ');
  if (neighbourhood) result += `, ${neighbourhood}`;
  return result;
}

// 4. Address hash (for cache invalidation), built from NORMALIZED matching
//    inputs, never from the display string, so cosmetic formatting changes
//    never trigger unnecessary re-geocoding.
export function addressHash({ camis, building, street, boro, zip }) {
  const houseNorm = normalizeHouseNumber(building).normalized;
  const streetNorm = normalizeStreetName(street);
  const boroNorm = (boro || '').toString().trim().toLowerCase();
  const zipNorm = (zip || '').toString().trim();
  return [camis, houseNorm, streetNorm, boroNorm, zipNorm].join('|');
}

// 5. NYC bounding box (for geographic sanity checks)
//
// Loose bounding box around NYC (including a small margin), used to catch
// obviously-wrong coordinates: (0, 0), swapped lat/lon, or a
// same-house-number match at a real address outside the five boroughs
// (e.g. "25 Madison Avenue" also exists in Glen Cove, NY).
export const NYC_BOUNDS = {
  minLat: 40.4,
  maxLat: 41.0,
  minLon: -74.3,
  maxLon: -73.65,
};

export function isWithinNYC(lat, lon) {
  return (
    lat >= NYC_BOUNDS.minLat &&
    lat <= NYC_BOUNDS.maxLat &&
    lon >= NYC_BOUNDS.minLon &&
    lon <= NYC_BOUNDS.maxLon
  );
}
