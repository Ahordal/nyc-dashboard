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

import type { RestaurantProperties } from "../types/restaurant";
import { isFeaturedToday } from "./featured";

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
  // Per-award colours are still to be picked; gold (--award-gold) until then.
  color: string;
};

const AWARD_GOLD = "#d4af37";

// Display order: from the most common to the rarest.
export const AWARDS: readonly Award[] = [
  {
    id: "first_a",
    name: "First A",
    icon: faA,
    kind: "permanent",
    description: "Earned an A grade.",
    color: AWARD_GOLD,
  },
  {
    id: "consistency",
    name: "Consistency",
    icon: faCertificate,
    kind: "status",
    description: "An A on its last two graded inspections.",
    color: AWARD_GOLD,
  },
  {
    id: "triple_crown",
    name: "Triple Crown",
    icon: faCrown,
    kind: "permanent",
    description: "Three A grades in a row.",
    color: AWARD_GOLD,
  },
  {
    id: "most_improved",
    name: "Most Improved",
    icon: faSeedling,
    kind: "status",
    description: "An A straight after a C.",
    color: AWARD_GOLD,
  },
  {
    id: "perfect_score",
    name: "Perfect Score",
    icon: fa0,
    kind: "permanent",
    description: "Scored 0 on an inspection: no violations found.",
    color: AWARD_GOLD,
  },
  {
    id: "featured",
    name: "Featured",
    icon: faStar,
    kind: "status",
    description: "One of today's five featured restaurants.",
    color: AWARD_GOLD,
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
