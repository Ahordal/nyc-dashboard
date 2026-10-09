// featured.ts
//
// Restaurant cards dealt daily by pipeline/deal-cards.mjs, as served in
// public/data/featured.json. Each card is a snapshot of the restaurant on
// the day it was dealt.

export type FeaturedCard = {
  camis: string;
  name: string;
  boro: string;
  neighbourhood: string | null;
  cuisine: string | null;
  grade: string;
  score: number;
  inspectionDate: string;
  posts: { platform: string; url: string }[];
};

export type FeaturedHand = {
  date: string;
  cards: FeaturedCard[];
};

export type FeaturedData = {
  version: number;
  hands: FeaturedHand[];
};

// A card together with the day it was dealt (YYYY-MM-DD, New York time).
export type DealtCard = {
  card: FeaturedCard;
  date: string;
};
