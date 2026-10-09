// previous-grade.test.mjs
//
// previous_grade feeds the featured consistency rule: the grade of the
// last graded inspection before the latest one, skipping ungraded ones.
//
// Run with: node --test previous-grade.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousGrade } from './fetch-inspection.mjs';

const events = (...grades) => grades.map((grade) => ({ primary: { grade } }));

test('returns the grade of the graded inspection before the latest', () => {
  assert.equal(previousGrade(events('B', 'A', 'A')), 'A');
  assert.equal(previousGrade(events('A', 'C', 'A')), 'C');
});

test('skips ungraded inspections, such as an initial awaiting re-inspection', () => {
  assert.equal(previousGrade(events('A', null, 'A')), 'A');
  assert.equal(previousGrade(events('B', 'Z', 'N', 'A')), 'B');
});

test('returns null with no earlier graded inspection', () => {
  assert.equal(previousGrade(events('A')), null);
  assert.equal(previousGrade(events(null, 'A')), null);
  assert.equal(previousGrade([]), null);
});
