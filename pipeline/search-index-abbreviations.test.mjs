// search-index-abbreviations.test.mjs
//
// buildSearchIndex()'s token expansions are derived from normalize.mjs's
// STREET_TYPE_MAP/DIRECTIONAL_MAP (the single source of truth for street
// matching), not a separately hand-maintained table. Locks in the two
// gaps that divergence had produced: diagonal directions (NE/NW/SE/SW)
// and the "str"/"av" short forms.
//
// Run with: node --test search-index-abbreviations.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex } from './fetch-inspection.mjs';

function tokens(street) {
  return buildSearchIndex({ name: '', cuisine: '', street, building: '' }).split(' ').filter(Boolean);
}

test('expands diagonal directions (previously missing from search)', () => {
  assert.deepEqual(tokens('NE 5 AVE'), ['NE', 'NORTHEAST', '5', 'AVE', 'AVENUE']);
  assert.ok(tokens('SW 10 ST').includes('SOUTHWEST'));
});

test('expands the "str"/"av" short forms (previously missing from search)', () => {
  assert.ok(tokens('MAIN STR').includes('STREET'));
  assert.ok(tokens('5 AV').includes('AVENUE'));
});

test('still expands ST to both STREET and SAINT (search-only, not a street type)', () => {
  const result = tokens('MAIN ST');
  assert.ok(result.includes('STREET'));
  assert.ok(result.includes('SAINT'));
});

test('still expands the generic word abbreviations BLDG/INTL', () => {
  assert.ok(tokens('BLDG').includes('BUILDING'));
  assert.ok(tokens('INTL').includes('INTERNATIONAL'));
});
