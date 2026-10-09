import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOROUGHS,
  EMPTY_FEATURED,
  applyFeaturedDates,
  chainKey,
  chainNames,
  dealHand,
  isEligible,
  mergeFeatured,
  newYorkDate,
} from "./deal-cards.mjs";

const DATE = "2026-10-07";

let nextCamis = 1;
function restaurant(overrides = {}) {
  return {
    properties: {
      camis: String(nextCamis++).padStart(8, "0"),
      name: `PLACE ${nextCamis}`,
      boro: "Manhattan",
      neighbourhood: null,
      cuisine: "American",
      grade: "A",
      previous_grade: "A",
      score: 9,
      inspection_date: "2026-06-01T00:00:00.000",
      current_status_code: "open",
      location_status: "verified",
      ...overrides,
    },
  };
}

const eligible = (props, dealt = new Set()) =>
  isEligible(props, { asOf: DATE, chains: new Set(), dealt });

test("isEligible accepts an open, verified, recent A with a matching score", () => {
  assert.equal(eligible(restaurant().properties), true);
});

test("isEligible rejects each rule failure", () => {
  const cases = {
    "grade B": { grade: "B" },
    "previous graded inspection a B": { previous_grade: "B" },
    "no previous graded inspection": { previous_grade: null },
    "A letter with a B-band score": { score: 20 },
    "missing score": { score: null },
    closed: { current_status_code: "closed" },
    "unverified location": { location_status: "unverified" },
    "inspection over a year old": { inspection_date: "2025-09-01T00:00:00.000" },
  };
  for (const [label, overrides] of Object.entries(cases)) {
    assert.equal(eligible(restaurant(overrides).properties), false, label);
  }
});

test("isEligible rejects chains and restaurants already dealt", () => {
  const props = restaurant({ name: "BIG CHAIN" }).properties;
  assert.equal(isEligible(props, { asOf: DATE, chains: new Set(["BIG CHAIN"]), dealt: new Set() }), false);
  assert.equal(eligible(props, new Set([props.camis])), false);
});

test("chainNames flags names at three or more locations", () => {
  const features = [
    restaurant({ name: "CHAIN" }),
    restaurant({ name: "CHAIN" }),
    restaurant({ name: "CHAIN" }),
    restaurant({ name: "PAIR" }),
    restaurant({ name: "PAIR" }),
  ];
  assert.deepEqual([...chainNames(features)], ["CHAIN"]);
});

test("chainKey strips trailing store numbers but keeps numbers in the name", () => {
  assert.equal(chainKey("CHIPOTLE MEXICAN GRILL #2879"), "CHIPOTLE MEXICAN GRILL");
  assert.equal(chainKey("GENESIS # 1"), "GENESIS");
  assert.equal(chainKey("AMOR BAKERY NO 2"), "AMOR BAKERY");
  assert.equal(chainKey("Amor Bakery No. 2"), "AMOR BAKERY");
  assert.equal(chainKey("CANDLE 79"), "CANDLE 79");
  assert.equal(chainKey("#1 SABOR LATINO"), "#1 SABOR LATINO");
});

test("numbered branches count as one chain and are ineligible", () => {
  const features = [
    restaurant({ name: "CHIPOTLE MEXICAN GRILL #1" }),
    restaurant({ name: "CHIPOTLE MEXICAN GRILL #2" }),
    restaurant({ name: "CHIPOTLE MEXICAN GRILL #2879" }),
  ];
  const chains = chainNames(features);
  assert.deepEqual([...chains], ["CHIPOTLE MEXICAN GRILL"]);
  assert.equal(isEligible(features[2].properties, { asOf: DATE, chains, dealt: new Set() }), false);
});

test("dealHand deals one card per borough, snapshotting the restaurant", () => {
  const features = BOROUGHS.flatMap((boro) => [restaurant({ boro }), restaurant({ boro })]);
  const hand = dealHand(features, EMPTY_FEATURED, DATE);
  assert.equal(hand.date, DATE);
  assert.deepEqual(hand.cards.map((card) => card.boro), BOROUGHS);
  assert.deepEqual(Object.keys(hand.cards[0]).sort(), [
    "boro", "camis", "cuisine", "grade", "inspectionDate", "name", "neighbourhood", "posts", "score",
  ]);
  assert.deepEqual(hand.cards[0].posts, []);
});

test("dealHand is repeatable for a date and never re-deals a restaurant", () => {
  const features = BOROUGHS.flatMap((boro) => Array.from({ length: 5 }, () => restaurant({ boro })));
  const first = dealHand(features, EMPTY_FEATURED, DATE);
  assert.deepEqual(dealHand(features, EMPTY_FEATURED, DATE), first);

  const next = dealHand(features, { ...EMPTY_FEATURED, hands: [first] }, "2026-10-08");
  const dealtBefore = new Set(first.cards.map((card) => card.camis));
  assert.ok(next.cards.every((card) => !dealtBefore.has(card.camis)));
});

test("dealHand returns null when the date is already dealt", () => {
  const featured = { ...EMPTY_FEATURED, hands: [{ date: DATE, cards: [] }] };
  assert.equal(dealHand([restaurant()], featured, DATE), null);
});

test("dealHand skips a borough with nobody eligible", () => {
  const features = [restaurant({ boro: "Queens" }), restaurant({ boro: "Bronx", grade: "B" })];
  assert.deepEqual(dealHand(features, EMPTY_FEATURED, DATE).cards.map((card) => card.boro), ["Queens"]);
});

test("mergeFeatured keeps every date, sorted, with the committed hand winning a clash", () => {
  const local = { ...EMPTY_FEATURED, hands: [{ date: "2026-10-08", cards: ["local-8"] }, { date: DATE, cards: ["local-7"] }] };
  const remote = { ...EMPTY_FEATURED, hands: [{ date: DATE, cards: ["remote-7"] }, { date: "2026-10-06", cards: ["remote-6"] }] };
  assert.deepEqual(mergeFeatured(local, remote).hands, [
    { date: "2026-10-06", cards: ["remote-6"] },
    { date: DATE, cards: ["remote-7"] },
    { date: "2026-10-08", cards: ["local-8"] },
  ]);
});

test("applyFeaturedDates stamps featured restaurants and nulls everyone else", () => {
  const featuredOne = restaurant();
  const other = restaurant();
  const featured = { ...EMPTY_FEATURED, hands: [{ date: DATE, cards: [{ camis: featuredOne.properties.camis }] }] };
  applyFeaturedDates([featuredOne, other], featured);
  assert.equal(featuredOne.properties.featured_date, 20261007);
  assert.equal(other.properties.featured_date, null);
});

test("newYorkDate uses New York's calendar", () => {
  // 02:00 UTC on Oct 8 is still Oct 7 in New York.
  assert.equal(newYorkDate(new Date("2026-10-08T02:00:00Z")), DATE);
});
