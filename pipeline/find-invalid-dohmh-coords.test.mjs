// find-invalid-dohmh-coords.test.mjs
//
// Identifies restaurants whose DOHMH coordinate is missing, invalid, or
// out-of-bounds - the only ones whose restaurant-count eligibility can
// depend on geocode cache state. Used to correct a counts-snapshot after
// a cache merge without re-fetching the dataset.
//
// Run with: node --test find-invalid-dohmh-coords.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRestaurantsWithInvalidDohmhCoords } from './fetch-inspection.mjs';

function event({ id, date = '2026-01-01T00:00:00.000', score = 10, latitude, longitude }) {
  return { id, date, primary: { score, latitude, longitude } };
}

test('excludes a restaurant whose latest DOHMH coordinate is valid and within NYC', () => {
  const eventsByRestaurant = new Map([
    ['1', [event({ id: 'a', latitude: '40.7', longitude: '-73.9' })]],
  ]);
  assert.deepEqual(findRestaurantsWithInvalidDohmhCoords(eventsByRestaurant), []);
});

test('includes a restaurant with missing DOHMH coordinates', () => {
  const eventsByRestaurant = new Map([
    ['1', [event({ id: 'a', latitude: '', longitude: '' })]],
  ]);
  assert.deepEqual(findRestaurantsWithInvalidDohmhCoords(eventsByRestaurant), ['1']);
});

test('includes a restaurant whose DOHMH coordinate falls outside NYC bounds', () => {
  const eventsByRestaurant = new Map([
    ['1', [event({ id: 'a', latitude: '34.05', longitude: '-118.24' })]], // Los Angeles
  ]);
  assert.deepEqual(findRestaurantsWithInvalidDohmhCoords(eventsByRestaurant), ['1']);
});

test('uses the LATEST scored event, not an earlier one with different coordinates', () => {
  const eventsByRestaurant = new Map([
    [
      '1',
      [
        event({ id: 'a', date: '2025-01-01T00:00:00.000', latitude: '', longitude: '' }), // earlier, invalid
        event({ id: 'b', date: '2026-01-01T00:00:00.000', latitude: '40.7', longitude: '-73.9' }), // latest, valid
      ],
    ],
  ]);
  assert.deepEqual(findRestaurantsWithInvalidDohmhCoords(eventsByRestaurant), []);
});

test('falls back to the last raw event for a restaurant with zero scored inspections', () => {
  const eventsByRestaurant = new Map([
    [
      '1',
      [event({ id: 'a', date: '1900-01-01T00:00:00.000', score: null, latitude: '', longitude: '' })],
    ],
  ]);
  assert.deepEqual(findRestaurantsWithInvalidDohmhCoords(eventsByRestaurant), ['1']);
});

test('returns multiple camis in dataset order', () => {
  const eventsByRestaurant = new Map([
    ['1', [event({ id: 'a', latitude: '40.7', longitude: '-73.9' })]],
    ['2', [event({ id: 'b', latitude: '', longitude: '' })]],
    ['3', [event({ id: 'c', latitude: '0', longitude: '0' })]],
  ]);
  assert.deepEqual(findRestaurantsWithInvalidDohmhCoords(eventsByRestaurant), ['2', '3']);
});
