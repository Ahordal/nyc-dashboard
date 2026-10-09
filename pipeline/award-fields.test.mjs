// award-fields.test.mjs
//
// Award fields on each restaurant: permanent awards are the date first
// earned, statuses are 1/0 for held right now.
//
// Run with: node --test award-fields.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardFields, countAwards } from './fetch-inspection.mjs';

// One scored inspection per grade, a month apart, oldest first.
const history = (...grades) =>
  grades.map((grade, i) => ({
    date: `2025-${String(i + 1).padStart(2, '0')}-15T00:00:00.000`,
    primary: { grade, score: 10 },
  }));

const fieldsFor = (...grades) => awardFields(history(...grades), grades.at(-1));

test('First A is the date of the first graded A, kept after later drops', () => {
  assert.equal(fieldsFor('B', 'A', 'C').award_first_a, 20250215);
  assert.equal(fieldsFor('B', 'C').award_first_a, null);
});

test('Triple Crown is the date of the third A in a row, kept for good', () => {
  assert.equal(fieldsFor('A', 'A', 'A', 'B').award_triple_crown, 20250315);
  assert.equal(fieldsFor('A', 'A', 'B', 'A', 'A').award_triple_crown, null);
  assert.equal(fieldsFor('B', 'A', 'A', 'A', 'A').award_triple_crown, 20250415);
});

test('ungraded inspections neither count toward nor break a run', () => {
  assert.equal(fieldsFor('A', null, 'A', 'Z', 'A').award_triple_crown, 20250515);
});

test('Consistency holds only while the current and previous graded are both A', () => {
  assert.equal(fieldsFor('A', 'A').consistent, 1);
  assert.equal(fieldsFor('A', null, 'A').consistent, 1);
  assert.equal(fieldsFor('B', 'A').consistent, 0);
  assert.equal(fieldsFor('A', 'B').consistent, 0);
  assert.equal(fieldsFor('A').consistent, 0);
});

test('Most Improved holds only for an A straight after a C', () => {
  assert.equal(fieldsFor('C', 'A').most_improved, 1);
  assert.equal(fieldsFor('B', 'A').most_improved, 0);
  assert.equal(fieldsFor('C', 'A', 'A').most_improved, 0);
});

test('a restaurant with no inspections holds nothing', () => {
  assert.deepEqual(awardFields([], 'U'), {
    award_first_a: null,
    award_triple_crown: null,
    consistent: 0,
    most_improved: 0,
  });
});

test('countAwards tallies holders of each award', () => {
  const features = [
    { properties: { award_first_a: 20250101, award_triple_crown: 20250301, consistent: 1, most_improved: 0 } },
    { properties: { award_first_a: 20250101, award_triple_crown: null, consistent: 0, most_improved: 1 } },
    { properties: { award_first_a: null, award_triple_crown: null, consistent: 0, most_improved: 0 } },
  ];
  assert.deepEqual(countAwards(features), {
    total: 3,
    first_a: 2,
    triple_crown: 1,
    consistent: 1,
    most_improved: 1,
  });
});
