import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOROUGHS,
  EMPTY_FEATURED,
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

test("newYorkDate uses New York's calendar", () => {
  // 02:00 UTC on Oct 8 is still Oct 7 in New York.
  assert.equal(newYorkDate(new Date("2026-10-08T02:00:00Z")), DATE);
});
