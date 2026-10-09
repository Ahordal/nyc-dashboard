// featured.ts
//
// Lookups over the dealt restaurant cards in featured.json.

import type { DealtCard, FeaturedCard, FeaturedData } from "../types/featured";

export const EMPTY_FEATURED: FeaturedData = { version: 1, hands: [] };

// The pipeline never re-deals a restaurant; if it ever did, the latest wins.
export function indexFeaturedByCamis(data: FeaturedData): Map<string, DealtCard> {
  const byCamis = new Map<string, DealtCard>();
  for (const hand of data.hands ?? []) {
    for (const card of hand.cards) {
      const existing = byCamis.get(card.camis);
      if (!existing || existing.date < hand.date) {
        byCamis.set(card.camis, { card, date: hand.date });
      }
    }
  }
  return byCamis;
}

// The latest hand, not literally today: a late daily run keeps the last five ringed.
export function latestFeaturedDate(data: FeaturedData): string | null {
  return (data.hands ?? []).reduce<string | null>(
    (latest, hand) => (latest === null || hand.date > latest ? hand.date : latest),
    null,
  );
}

// History/chart id of the inspection that earned the card.
export function earningInspectionId(card: FeaturedCard): string {
  return `${card.camis}-${card.inspectionDate.slice(0, 10)}`;
}

// Noon UTC keeps a YYYY-MM-DD on the same calendar day in New York.
export function dealtDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}
