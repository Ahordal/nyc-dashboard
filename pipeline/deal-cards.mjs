// deal-cards.mjs
//
// Deals the daily hand of restaurant cards: one eligible restaurant per
// borough, recorded as a snapshot in featured.json on the `data` branch.
// run-geocode-backfill.mjs deals once a day; merge-and-commit-cache.mjs
// commits it; the build copies featured.json to public/data for the
// dashboard, which draws each card from its snapshot.
//
// Local dev: node pipeline/deal-cards.mjs [YYYY-MM-DD]
// Deals from public/data/latest-inspections.geojson into
// pipeline/featured.json and copies it to public/data.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

// A name at this many locations or more counts as a chain: the cards
// promote independents.
const CHAIN_MIN_LOCATIONS = 3;
// Recent enough that the grade on the card is still the restaurant's.
const MAX_INSPECTION_AGE_DAYS = 365;
// Top of the A score band, so the letter and the dashboard's colour agree.
const MAX_A_SCORE = 13;

export const EMPTY_FEATURED = { version: 1, hands: [] };

// Dealing follows NYC's calendar, whatever timezone the runner is in.
export function newYorkDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date);
}

export function chainNames(features) {
  const counts = new Map();
  for (const { properties } of features) {
    counts.set(properties.name, (counts.get(properties.name) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= CHAIN_MIN_LOCATIONS).map(([name]) => name));
}

export function isEligible(props, { asOf, chains, dealt }) {
  const inspected = Date.parse(props.inspection_date);
  const ageDays = (Date.parse(asOf) - inspected) / 86_400_000;
  return (
    props.grade === "A" &&
    Number.isFinite(props.score) &&
    props.score <= MAX_A_SCORE &&
    props.current_status_code === "open" &&
    props.location_status === "verified" &&
    Number.isFinite(inspected) &&
    ageDays >= 0 &&
    ageDays <= MAX_INSPECTION_AGE_DAYS &&
    !chains.has(props.name) &&
    !dealt.has(props.camis)
  );
}

// Seeded by the date, so re-running a day deals the same hand.
export function seededRandom(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The card as it stood on the day it was dealt; later grade changes don't
// rewrite it. posts stays empty until social sharing exists.
export function cardSnapshot(props) {
  return {
    camis: props.camis,
    name: props.name,
    boro: props.boro,
    neighbourhood: props.neighbourhood ?? null,
    cuisine: props.cuisine ?? null,
    grade: props.grade,
    score: props.score,
    inspectionDate: props.inspection_date,
    posts: [],
  };
}

// Returns the hand for `date`, or null if that date was already dealt. A
// borough with nobody eligible is skipped rather than blocking the hand.
export function dealHand(features, featured, date) {
  if (featured.hands.some((hand) => hand.date === date)) return null;

  const dealt = new Set(featured.hands.flatMap((hand) => hand.cards.map((card) => card.camis)));
  const chains = chainNames(features);
  const random = seededRandom(date);
  const cards = [];

  for (const boro of BOROUGHS) {
    const pool = features
      .map((f) => f.properties)
      .filter((p) => p.boro === boro && isEligible(p, { asOf: date, chains, dealt }))
      .sort((a, b) => a.camis.localeCompare(b.camis)); // stable order, so the seed alone decides
    if (pool.length === 0) {
      console.warn(`deal-cards: no eligible restaurant in ${boro} for ${date}.`);
      continue;
    }
    cards.push(cardSnapshot(pool[Math.floor(random() * pool.length)]));
  }

  return { date, cards };
}

// Hands keyed by date; the already-committed (remote) hand wins a clash,
// since it may already have been shown.
export function mergeFeatured(local, remote) {
  const byDate = new Map(local.hands.map((hand) => [hand.date, hand]));
  for (const hand of remote.hands) byDate.set(hand.date, hand);
  return { ...EMPTY_FEATURED, hands: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

// Missing or unreadable file reads as no hands yet, never a crash.
export async function loadFeatured(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf-8"));
    return Array.isArray(parsed?.hands) ? parsed : { ...EMPTY_FEATURED };
  } catch {
    return { ...EMPTY_FEATURED };
  }
}

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const featuredPath = path.join(import.meta.dirname, "featured.json");
  const date = process.argv[2] ?? newYorkDate();

  const geojson = JSON.parse(
    await readFile(path.join(root, "public/data/latest-inspections.geojson"), "utf-8"),
  );
  const featured = await loadFeatured(featuredPath);
  const hand = dealHand(geojson.features, featured, date);
  if (!hand) {
    console.log(`Hand for ${date} already dealt.`);
    return;
  }

  const updated = mergeFeatured({ ...featured, hands: [...featured.hands, hand] }, EMPTY_FEATURED);
  await writeFile(featuredPath, JSON.stringify(updated, null, 2), "utf-8");
  await mkdir(path.join(root, "public/data"), { recursive: true });
  await writeFile(path.join(root, "public/data/featured.json"), JSON.stringify(updated), "utf-8");
  console.log(`Dealt ${date}: ${hand.cards.map((c) => `${c.name} (${c.boro})`).join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("deal-cards failed:", err.message);
    process.exit(1);
  });
}
