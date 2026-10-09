import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { escapeXml, fitName, layoutText, cuisineLine, subLines, scoreGlyphs, renderCard } from "../shared/restaurantCard.mjs";
import { CATEGORY_COLORS } from "../shared/gradeColours.mjs";

const template = readFileSync(path.join(import.meta.dirname, "..", "shared", "restaurantCard.svg"), "utf8");

test("fitName keeps the largest size when the name wraps into two lines", () => {
  assert.deepEqual(fitName("Morris Park Bake Shop"), { size: 44, lines: ["MORRIS PARK", "BAKE SHOP"] });
});

test("fitName steps the size down for names too long for three lines at full size", () => {
  const { size, lines } = fitName("The Original Brooklyn Neighbourhood Pizzeria And Family Restaurant");
  assert.ok(size < 44);
  assert.ok(lines.length <= 3);
});

test("layoutText centres a two-line name with no sub-lines", () => {
  assert.deepEqual(layoutText({ size: 44, lines: ["MORRIS PARK", "BAKE SHOP"] }), {
    baselines: [283, 331],
    sublineYs: [],
    labelY: 393,
    scoreY: 459,
  });
});

test("scoreGlyphs widens the grid for two-digit scores", () => {
  const firstX = (svg) => Number(svg.match(/x="(-?\d+)"/)[1]);
  assert.ok(firstX(scoreGlyphs(12)) < firstX(scoreGlyphs(7)));
});

test("escapeXml escapes characters common in restaurant names", () => {
  assert.equal(escapeXml(`Joe's <Pizza> & "Pasta"`), "Joe&apos;s &lt;Pizza&gt; &amp; &quot;Pasta&quot;");
});

test("renderCard fills every template token and uses the shared grade colour", () => {
  const svg = renderCard({ name: "Ben & Jerry's", grade: "B", score: 18 }, { template });
  assert.doesNotMatch(svg, /\{\{[A-Z_]+\}\}/);
  assert.match(svg, /BEN &amp; JERRY&apos;S/);
  assert.ok(svg.includes(CATEGORY_COLORS.B));
});

test("cuisineLine drops DOHMH's placeholder cuisine", () => {
  assert.equal(cuisineLine("Irish"), "IRISH");
  assert.equal(cuisineLine("Not Listed/Not Applicable"), null);
  assert.equal(cuisineLine(undefined), null);
});

test("subLines keeps borough and cuisine together under the name", () => {
  const restaurant = { boro: "Bronx", cuisine: "Bakery Products/Desserts" };
  assert.deepEqual(subLines(restaurant).map((l) => [l.text, l.size]), [
    ["BRONX", 22],
    ["BAKERY PRODUCTS/DESSERTS", 14],
  ]);
  assert.deepEqual(subLines({ boro: "Bronx", cuisine: "Not Listed/Not Applicable" }).map((l) => l.text), ["BRONX"]);
});

test("layoutText shifts the group up to keep it centred when sub-lines are added", () => {
  const name = { size: 44, lines: ["MORRIS PARK", "BAKE SHOP"] };
  const plain = layoutText(name);
  const full = layoutText(name, [40, 26]);
  assert.ok(full.baselines[0] < plain.baselines[0]);
  assert.deepEqual(full.sublineYs, [full.baselines[1] + 40, full.baselines[1] + 66]);
  assert.equal(full.labelY, full.sublineYs[1] + 62);
});

test("renderCard footer uses the New York calendar date", () => {
  // 02:00 UTC on Oct 8 is still Oct 7 in New York.
  const svg = renderCard({ name: "X", grade: "A", score: 7 }, { template, date: new Date("2026-10-08T02:00:00Z") });
  assert.match(svg, /FEATURED AWARD · OCT 7, 2026/);
});

test("renderCard rejects restaurants without a letter grade or score", () => {
  assert.throws(() => renderCard({ name: "X", grade: "P", score: 10 }, { template }));
  assert.throws(() => renderCard({ name: "X", grade: "A", score: null }, { template }));
});
