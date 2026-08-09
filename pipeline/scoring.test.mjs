// scoring.test.mjs
// Tests the pure scoring/selection logic against real captured LocationIQ
// responses (see fixtures.mjs). No network calls — deterministic, fast,
// and doubles as a regression test: if the scoring logic changes and one
// of these known cases stops behaving correctly, this will catch it.
//
// Run with: node --test scoring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, selectBestMatch, distanceMeters } from './scoring.mjs';
import { kitchen79, buffaloWildWingsGo, xinXing88 } from './fixtures.mjs';

function toEntries(results, queryLabel) {
  return results.map((candidate) => ({ candidate, queryLabel }));
}

// --- distanceMeters sanity check -----------------------------------------

test('distanceMeters returns ~0 for identical points', () => {
  assert.ok(distanceMeters(40.7, -73.9, 40.7, -73.9) < 1);
});

test('distanceMeters returns a sensible value for two known points', () => {
  // Roughly 1.5-2.5km apart, sanity-checking order of magnitude only.
  const d = distanceMeters(40.7128, -74.006, 40.73, -73.99);
  assert.ok(d > 1000 && d < 3000);
});

// --- Kitchen 79: should resolve via the no-hyphen query -------------------

test('Kitchen 79: hyphenated query alone does not produce an acceptable match on its own merits beyond the correct candidate', () => {
  const entries = toEntries(kitchen79.hyphenatedResults, 'hyphenated');
  const scored = entries.map(({ candidate }) => scoreCandidate(candidate, kitchen79.input));
  // Only the actual Kitchen 79 candidate (last in the list) should be accepted;
  // all the other same-name-wrong-address candidates must be rejected.
  const acceptedCount = scored.filter((s) => s.accepted).length;
  assert.equal(acceptedCount, 1);
  assert.ok(scored[4].accepted); // the real Kitchen 79 entry
});

test('Kitchen 79: selectBestMatch picks the correct candidate from combined hyphenated + no-hyphen results', () => {
  const entries = [
    ...toEntries(kitchen79.hyphenatedResults, 'hyphenated'),
    ...toEntries(kitchen79.noHyphenResults, 'no-hyphen'),
  ];
  const best = selectBestMatch(entries, kitchen79.input);
  assert.ok(best);
  assert.equal(best.lat, 40.747562);
  assert.equal(best.lon, -73.886898);
  assert.equal(best.matchType, 'house+street');
  assert.ok(best.distanceFromDohmh < 200); // well within sanity cap, close to DOHMH point
});

test('Kitchen 79: rejected candidates all fail on house number or street mismatch', () => {
  const entries = toEntries(kitchen79.hyphenatedResults, 'hyphenated');
  const rejected = entries
    .map(({ candidate }) => scoreCandidate(candidate, kitchen79.input))
    .filter((s) => !s.accepted);
  assert.equal(rejected.length, 4);
  for (const r of rejected) {
    assert.ok(
      r.reasons.includes('house_number_mismatch') || r.reasons.includes('street_name_mismatch')
    );
  }
});

// --- Buffalo Wild Wings Go: should be REJECTED (wrong branch) -------------

test('Buffalo Wild Wings Go: the only candidate is correctly rejected (wrong branch, house number mismatch)', () => {
  const candidate = buffaloWildWingsGo.hyphenatedResults[0];
  const result = scoreCandidate(candidate, buffaloWildWingsGo.input);
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.includes('house_number_mismatch'));
});

test('Buffalo Wild Wings Go: selectBestMatch returns null across both query variants', () => {
  const entries = [
    ...toEntries(buffaloWildWingsGo.hyphenatedResults, 'hyphenated'),
    ...toEntries(buffaloWildWingsGo.noHyphenResults, 'no-hyphen'),
  ];
  const best = selectBestMatch(entries, buffaloWildWingsGo.input);
  assert.equal(best, null); // must NOT silently accept the wrong branch
});

// --- Xin Xing 88: should resolve via the hyphenated query -----------------

test('Xin Xing 88: hyphenated query candidate is accepted', () => {
  const candidate = xinXing88.hyphenatedResults[0];
  const result = scoreCandidate(candidate, xinXing88.input);
  assert.equal(result.accepted, true);
  assert.equal(result.matchType, 'house+street');
});

test('Xin Xing 88: selectBestMatch picks the hyphenated-query candidate, not any no-hyphen noise', () => {
  const entries = [
    ...toEntries(xinXing88.hyphenatedResults, 'hyphenated'),
    ...toEntries(xinXing88.noHyphenResults, 'no-hyphen'),
  ];
  const best = selectBestMatch(entries, xinXing88.input);
  assert.ok(best);
  assert.equal(best.resolvedVia, 'hyphenated');
  assert.equal(best.lat, 40.711196);
  assert.equal(best.lon, -73.770485);
});

test('Xin Xing 88: none of the no-hyphen candidates (missing house_number) are ever accepted', () => {
  const entries = toEntries(xinXing88.noHyphenResults, 'no-hyphen');
  const scored = entries.map(({ candidate }) => scoreCandidate(candidate, xinXing88.input));
  assert.ok(scored.every((s) => !s.accepted));
});

// --- General scoring behavior ----------------------------------------------

test('scoreCandidate rejects a candidate beyond the distance cap even with house+street match', () => {
  const candidate = {
    lat: '41.5', // far away
    lon: '-74.5',
    address: { house_number: '37-70', road: '79 Street', suburb: 'Queens', postcode: '11372' },
  };
  const result = scoreCandidate(candidate, kitchen79.input);
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.includes('exceeds_distance_cap'));
});

test('scoreCandidate gives a higher score to a candidate with matching borough and zip', () => {
  const withBoroZip = {
    lat: '40.747562',
    lon: '-73.886898',
    address: { house_number: '37-70', road: '79 Street', suburb: 'Queens', postcode: '11372' },
  };
  const withoutBoroZip = {
    lat: '40.747562',
    lon: '-73.886898',
    address: { house_number: '37-70', road: '79 Street', suburb: 'Manhattan', postcode: '10001' },
  };
  const scoreWith = scoreCandidate(withBoroZip, kitchen79.input).score;
  const scoreWithout = scoreCandidate(withoutBoroZip, kitchen79.input).score;
  assert.ok(scoreWith > scoreWithout);
});
