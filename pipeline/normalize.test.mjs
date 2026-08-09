// normalize.test.mjs
// Unit tests for normalize.mjs, using Node's built-in test runner.
// Run with: node --test normalize.test.mjs
// (No dependencies needed — node:test and node:assert are built into Node.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHouseNumber,
  houseNumbersMatch,
  normalizeStreetName,
  streetNamesMatch,
  formatDisplayStreet,
  formatDisplayAddress,
  addressHash,
} from './normalize.mjs';

// --- House number normalization ---------------------------------------

test('normalizeHouseNumber strips hyphens for the normalized form', () => {
  const result = normalizeHouseNumber('37-70');
  assert.equal(result.normalized, '3770');
  assert.equal(result.raw, '37-70'); // raw form preserved
});

test('normalizeHouseNumber handles already-squished numbers', () => {
  assert.equal(normalizeHouseNumber('3770').normalized, '3770');
});

test('normalizeHouseNumber handles plain numbers with no hyphen', () => {
  assert.equal(normalizeHouseNumber('123').normalized, '123');
});

test('normalizeHouseNumber strips letters (e.g. unit suffixes)', () => {
  // "123A" -> "123" — a known limitation worth being aware of, not a bug:
  // house-number-only matching can't distinguish 123 from 123A. Street +
  // proximity checks are what catch a genuinely wrong match in that case.
  assert.equal(normalizeHouseNumber('123A').normalized, '123');
});

test('houseNumbersMatch treats hyphenated and squished forms as equal', () => {
  assert.ok(houseNumbersMatch('37-70', '3770'));
  assert.ok(houseNumbersMatch('188-13', '188-13'));
});

test('houseNumbersMatch rejects genuinely different numbers', () => {
  assert.ok(!houseNumbersMatch('79-23', '179-19'));
});

test('houseNumbersMatch rejects when either side is empty', () => {
  assert.ok(!houseNumbersMatch('', '123'));
  assert.ok(!houseNumbersMatch('123', ''));
});

// --- Street name normalization ------------------------------------------

test('normalizeStreetName expands common abbreviations', () => {
  assert.equal(normalizeStreetName('79 St'), '79 street');
  assert.equal(normalizeStreetName('Main Ave'), 'main avenue');
  assert.equal(normalizeStreetName('Northern Blvd'), 'northern boulevard');
});

test('normalizeStreetName treats ordinal and plain forms as equal', () => {
  assert.equal(normalizeStreetName('79 Street'), normalizeStreetName('79th Street'));
  assert.equal(normalizeStreetName('79 St'), normalizeStreetName('79th Street'));
});

test('normalizeStreetName expands directionals', () => {
  assert.equal(normalizeStreetName('W 45 St'), 'west 45 street');
  assert.equal(normalizeStreetName('E Tremont Ave'), 'east tremont avenue');
});

test('normalizeStreetName does not collide different real streets', () => {
  // Guard against over-aggressive normalization merging distinct streets.
  assert.notEqual(normalizeStreetName('79 Street'), normalizeStreetName('80 Street'));
  assert.notEqual(normalizeStreetName('Main Street'), normalizeStreetName('Main Avenue'));
});

test('normalizeStreetName handles periods and casing', () => {
  assert.equal(normalizeStreetName('79TH ST.'), normalizeStreetName('79th St'));
});

test('streetNamesMatch works with mixed abbreviation styles', () => {
  assert.ok(streetNamesMatch('79 St', '79th Street'));
  assert.ok(!streetNamesMatch('79 St', '80th Street'));
});

// --- Display formatting (should NEVER affect matching) -------------------

test('formatDisplayStreet adds ordinal suffixes', () => {
  assert.equal(formatDisplayStreet('79 STREET'), '79th Street');
  assert.equal(formatDisplayStreet('11 AVENUE'), '11th Avenue');
  assert.equal(formatDisplayStreet('12 STREET'), '12th Street');
  assert.equal(formatDisplayStreet('13 STREET'), '13th Street'); // the 11/12/13 exception
  assert.equal(formatDisplayStreet('21 STREET'), '21st Street');
  assert.equal(formatDisplayStreet('22 STREET'), '22nd Street');
  assert.equal(formatDisplayStreet('23 STREET'), '23rd Street');
});

test('formatDisplayStreet title-cases abbreviations', () => {
  assert.equal(formatDisplayStreet('MAIN ST'), 'Main Street');
  assert.equal(formatDisplayStreet('NORTHERN BLVD'), 'Northern Boulevard');
});

test('formatDisplayAddress includes neighbourhood only when provided', () => {
  const withNeighbourhood = formatDisplayAddress({
    building: '37-70',
    street: '79 STREET',
    neighbourhood: 'Jackson Heights',
  });
  assert.equal(withNeighbourhood, '37-70 79th Street, Jackson Heights');

  const withoutNeighbourhood = formatDisplayAddress({
    building: '37-70',
    street: '79 STREET',
  });
  assert.equal(withoutNeighbourhood, '37-70 79th Street');
});

// --- Address hashing (must use NORMALIZED inputs, not display strings) ---

test('addressHash is stable across cosmetic formatting differences', () => {
  const h1 = addressHash({ camis: '123', building: '79-01', street: '79 St', boro: 'Queens', zip: '11372' });
  const h2 = addressHash({ camis: '123', building: '7901', street: '79th Street', boro: 'QUEENS', zip: '11372' });
  assert.equal(h1, h2); // cosmetic differences should NOT change the hash
});

test('addressHash changes when the actual address changes', () => {
  const h1 = addressHash({ camis: '123', building: '79-01', street: '79 St', boro: 'Queens', zip: '11372' });
  const h2 = addressHash({ camis: '123', building: '80-01', street: '79 St', boro: 'Queens', zip: '11372' });
  assert.notEqual(h1, h2);
});

test('addressHash changes when CAMIS changes (different restaurant)', () => {
  const h1 = addressHash({ camis: '123', building: '79-01', street: '79 St', boro: 'Queens', zip: '11372' });
  const h2 = addressHash({ camis: '999', building: '79-01', street: '79 St', boro: 'Queens', zip: '11372' });
  assert.notEqual(h1, h2);
});
