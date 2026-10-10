import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { awardIcons, BAN_ICON_PATH, blendHex, cardColor, escapeXml, fitName, formatCardDate, layoutText, cuisineLine, subLines, scoreGlyphs, renderCard } from "../shared/restaurantCard.mjs";
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
  const svg = renderCard({ name: "Ben & Jerry's", category: "B", score: 18 }, { template });
  assert.doesNotMatch(svg, /\{\{[A-Z_]+\}\}/);
  assert.match(svg, /BEN &amp; JERRY&apos;S/);
  assert.ok(svg.includes(cardColor("B")));
});

test("blendHex mixes a colour into the card body at the given strength", () => {
  assert.equal(blendHex("#ffffff", "#000000", 0.7), "#b3b3b3");
  assert.equal(blendHex("#2E7BE4", "#252525", 1), "#2e7be4");
  assert.equal(cardColor("A"), blendHex(CATEGORY_COLORS.A, "#252525", 0.7));
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

test("formatCardDate uses the New York calendar date", () => {
  // 02:00 UTC on Oct 8 is still Oct 7 in New York.
  assert.equal(formatCardDate(new Date("2026-10-08T02:00:00Z")), "OCT 7, 2026");
});

test("renderCard writes the footer it's given", () => {
  const svg = renderCard({ name: "X", category: "A", score: 7 }, { template, footer: "INSPECTED · OCT 7, 2026" });
  assert.match(svg, /INSPECTED · OCT 7, 2026/);
});

test("renderCard colours and marks every status, not just A/B/C", () => {
  const pending = renderCard({ name: "X", category: "pending", score: 30 }, { template });
  assert.ok(pending.includes(cardColor("pending")));
  assert.match(pending, />P<\/text><\/g>/);
  const closed = renderCard({ name: "X", category: "closed", score: 40 }, { template });
  assert.ok(closed.includes(cardColor("closed")));
  assert.ok(closed.includes(`d="${BAN_ICON_PATH}"`));
  assert.match(closed, />CLOSED BY DOHMH<\/text>/);
  assert.doesNotMatch(pending, /CLOSED BY DOHMH/);
  assert.throws(() => renderCard({ name: "X", category: "Z", score: 10 }, { template }));
});

test("renderCard shows a dash and no score texture without a score", () => {
  const svg = renderCard({ name: "X", category: "uninspected", score: null }, { template });
  assert.match(svg, />—<\/text>/);
  assert.equal(scoreGlyphs(null), "");
});

test("awardIcons draws each award in its colour as a centred row", () => {
  assert.equal(awardIcons([], 500), "");
  const star = { width: 576, d: "M0 0z", color: "#d4af37" };
  const zero = { width: 320, d: "M1 1z", color: "#ffffff" };
  const one = awardIcons([star], 500);
  assert.equal(one.match(/<path /g).length, 1);
  assert.match(one, /fill="#d4af37"/);
  const x = Number(one.match(/translate\(([\d.]+)/)[1]);
  assert.equal(x + (576 * 32) / 512 / 2, 250); // centred on the card

  const scale = 32 / 512;
  const xs = [...awardIcons([star, zero], 500).matchAll(/translate\(([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(xs[1] - (xs[0] + 576 * scale + 12)) < 0.1); // spaced by the star's own width
  assert.ok(Math.abs(xs[0] + ((576 + 320) * scale + 12) / 2 - 250) < 0.1); // whole row centred
});

test("renderCard drops the award row below a status line", () => {
  const star = { width: 576, d: "M0 0z", color: "#d4af37" };
  const rowY = (category) =>
    Number(renderCard({ name: "X", category, score: 12, awards: [star] }, { template }).match(/translate\([\d.]+ ([\d.]+)\) scale\(0\.0625\)/)[1]);
  assert.ok(rowY("closed") > rowY("pending"));
});

// The 3D card loads the SVG as a standalone image, which must be strict XML.
test("template comments never contain a double hyphen", () => {
  for (const [comment] of template.matchAll(/<!--([\s\S]*?)-->/g)) {
    assert.equal(comment.slice(4, -3).includes("--"), false, comment);
  }
});
