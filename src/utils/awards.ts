// awards.ts
//
// The award catalogue: one list the card, badges, and Awards legend all read.
// Rules live in the build (pipeline/fetch-inspection.mjs awardFields); this
// only reads the resulting fields, plus today's hand for Featured.

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  fa0,
  faA,
  faCertificate,
  faCrown,
  faSeedling,
  faStar,
} from "@fortawesome/free-solid-svg-icons";

import type { AwardCounts } from "../types/dashboardMeta";
import type { RestaurantProperties } from "../types/restaurant";
import { isFeaturedToday } from "./featured";
import { formatDate } from "./formatDate";

// Permanent: kept for good once earned. Status: held only while true now.
export type AwardKind = "permanent" | "status";

export type AwardId =
  | "first_a"
  | "consistency"
  | "triple_crown"
  | "most_improved"
  | "perfect_score"
  | "featured";

export type Award = {
  id: AwardId;
  name: string;
  icon: IconDefinition;
  kind: AwardKind;
  description: string;
  // "Moody Sunset", tuned for the card: cool to warm as awards get rarer,
  // kept clear of the grade colours.
  color: string;
};

// Display order: from the most common to the rarest.
export const AWARDS: readonly Award[] = [
  {
    id: "first_a",
    name: "First A",
    icon: faA,
    kind: "permanent",
    description: "Earned an A grade.",
    color: "#4A9DB5",
  },
  {
    id: "consistency",
    name: "Consistency",
    icon: faCertificate,
    kind: "status",
    description: "An A on its last two graded inspections.",
    color: "#7A74C2",
  },
  {
    id: "triple_crown",
    name: "Triple Crown",
    icon: faCrown,
    kind: "permanent",
    description: "Three A grades in a row.",
    color: "#A86FB5",
  },
  {
    id: "perfect_score",
    name: "Perfect Score",
    icon: fa0,
    kind: "permanent",
    description: "Scored 0 on an inspection: no violations found.",
    color: "#DE7FAE",
  },
  {
    id: "most_improved",
    name: "Most Improved",
    icon: faSeedling,
    kind: "status",
    description: "An A straight after a C.",
    color: "#FF8A80",
  },
  {
    id: "featured",
    name: "Featured",
    icon: faStar,
    kind: "status",
    description: "One of today's five featured restaurants.",
    color: "#FFB33D",
  },
];

export type HeldAward = {
  award: Award;
  // YYYYMMDD first earned, for permanent awards; null for statuses.
  since: number | null;
};

type AwardFields = Pick<
  RestaurantProperties,
  | "award_first_a"
  | "award_triple_crown"
  | "award_perfect_score"
  | "consistent"
  | "most_improved"
  | "featured_date"
>;

// Older map data may lack the award fields, so every check tolerates undefined.
function holding(id: AwardId, r: AwardFields, featuredDate: string | null): number | boolean | null {
  switch (id) {
    case "first_a":
      return r.award_first_a ?? null;
    case "triple_crown":
      return r.award_triple_crown ?? null;
    case "perfect_score":
      return r.award_perfect_score ?? null;
    case "consistency":
      return r.consistent === 1;
    case "most_improved":
      return r.most_improved === 1;
    case "featured":
      return isFeaturedToday(r, featuredDate);
  }
}

// Every award the restaurant holds right now, in catalogue order.
export function heldAwards(restaurant: AwardFields, featuredDate: string | null): HeldAward[] {
  return AWARDS.flatMap((award) => {
    const held = holding(award.id, restaurant, featuredDate);
    if (!held) return [];
    return [{ award, since: typeof held === "number" ? held : null }];
  });
}

// Build-side count key for each award; Featured isn't counted (always five).
const COUNT_KEYS: Record<Exclude<AwardId, "featured">, Exclude<keyof AwardCounts, "total">> = {
  first_a: "first_a",
  consistency: "consistent",
  triple_crown: "triple_crown",
  most_improved: "most_improved",
  perfect_score: "perfect_score",
};

// Share of restaurants holding the award, e.g. "42%" or "1.9%"; null if unknown.
export function awardShare(id: AwardId, counts: AwardCounts | null | undefined): string | null {
  // One per borough, every day.
  if (id === "featured") return "5 a day";
  const held = counts?.[COUNT_KEYS[id]];
  if (!counts?.total || held == null) return null;
  const pct = (100 * held) / counts.total;
  if (held > 0 && pct < 0.1) return "<0.1%";
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

// A YYYYMMDD award date, formatted like every other date in Details.
export function formatAwardDate(day: number): string {
  const date = new Date(Date.UTC(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100));
  return formatDate(date.toISOString());
}
