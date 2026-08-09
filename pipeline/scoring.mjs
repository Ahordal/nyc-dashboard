// scoring.mjs
// Pure scoring/selection logic for geocoding candidates. No network calls —
// everything here takes already-fetched candidate data and decides whether
// it's an acceptable match. This is deliberately separate from the LocationIQ
// API wrapper so it can be unit tested against fixture data.

import { houseNumbersMatch, streetNamesMatch, normalizeHouseNumber } from './normalize.mjs';

// Haversine distance in meters between two lat/lon points.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Sanity cap: a candidate this far from the DOHMH point is rejected outright,
// regardless of house/street agreement. This is a backstop against gross
// errors, NOT proof of correctness — house+street match is still the actual
// test for acceptance.
const MAX_ACCEPTABLE_DISTANCE_METERS = 2000;

function normalizeBoro(boro) {
  return (boro || '').toString().trim().toLowerCase();
}

function normalizeZip(zip) {
  return (zip || '').toString().trim().slice(0, 5); // compare 5-digit prefix
}

// Scores a single LocationIQ candidate against the restaurant's input data.
// Returns { accepted, score, matchType, distanceFromDohmh, reasons }.
//
// Acceptance requires: house number match AND street name match.
// Borough and ZIP agreement are weighted bonuses, not requirements — LocationIQ's
// borough/city fields don't always map cleanly onto DOHMH's borough field.
export function scoreCandidate(candidate, input) {
  const candLat = parseFloat(candidate.lat);
  const candLon = parseFloat(candidate.lon);
  const addr = candidate.address || {};

  const distanceFromDohmh =
    input.dohmhLat != null && input.dohmhLon != null
      ? distanceMeters(candLat, candLon, input.dohmhLat, input.dohmhLon)
      : null;

  const houseMatch = houseNumbersMatch(addr.house_number, input.building);
  const streetMatch = streetNamesMatch(addr.road, input.street);

  const reasons = [];
  if (!houseMatch) reasons.push('house_number_mismatch');
  if (!streetMatch) reasons.push('street_name_mismatch');

  // Required checks — both must pass to even be considered.
  const passesRequired = houseMatch && streetMatch;

  // Sanity cap — reject outright if too far, even if house+street matched
  // (e.g. a duplicate address in a different borough).
  const withinDistanceCap =
    distanceFromDohmh == null || distanceFromDohmh <= MAX_ACCEPTABLE_DISTANCE_METERS;
  if (!withinDistanceCap) reasons.push('exceeds_distance_cap');

  const accepted = passesRequired && withinDistanceCap;

  if (!accepted) {
    return { accepted: false, score: 0, matchType: null, distanceFromDohmh, reasons };
  }

  // Weighted bonuses — only computed for accepted candidates, used to rank
  // multiple acceptable candidates against each other.
  let score = 100; // base score for passing required checks

  const boroMatch =
    input.boro && addr.suburb && normalizeBoro(addr.suburb) === normalizeBoro(input.boro);
  if (boroMatch) score += 10;
  else reasons.push('borough_unconfirmed');

  const zipMatch = input.zip && addr.postcode && normalizeZip(addr.postcode) === normalizeZip(input.zip);
  if (zipMatch) score += 10;
  else reasons.push('zip_unconfirmed');

  // Closer distance is a tiebreaker, not a requirement — small bonus that
  // decays with distance, capped so it never outweighs boro/zip agreement.
  if (distanceFromDohmh != null) {
    score += Math.max(0, 10 - distanceFromDohmh / 100);
  }

  return {
    accepted: true,
    score,
    matchType: 'house+street',
    distanceFromDohmh,
    reasons,
  };
}

// Given a list of { candidate, queryLabel } pairs (from both the hyphenated
// and no-hyphen queries) and the restaurant's input data, returns the best
// accepted match or null if nothing qualifies.
export function selectBestMatch(candidateEntries, input) {
  const scored = candidateEntries.map(({ candidate, queryLabel }) => ({
    candidate,
    queryLabel,
    ...scoreCandidate(candidate, input),
  }));

  const accepted = scored.filter((s) => s.accepted);
  if (accepted.length === 0) return null;

  accepted.sort((a, b) => b.score - a.score);
  const best = accepted[0];

  return {
    lat: parseFloat(best.candidate.lat),
    lon: parseFloat(best.candidate.lon),
    neighbourhood: best.candidate.address?.neighbourhood || null,
    matchType: best.matchType,
    resolvedVia: best.queryLabel,
    distanceFromDohmh: best.distanceFromDohmh,
    score: best.score,
    reasons: best.reasons,
  };
}
