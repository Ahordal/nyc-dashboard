// restaurantCard.d.mts
//
// Type declarations for restaurantCard.mjs, so the TypeScript frontend
// gets types for it without turning on allowJs project-wide.

export type CardCategory = "A" | "B" | "C" | "pending" | "uninspected" | "closed";

export type CardRestaurant = {
  name: string;
  // getGradeCategory's result: sets the card's colour and corner mark.
  category: CardCategory;
  score: number | null;
  boro?: string | null;
  cuisine?: string | null;
  // Award ids held now, drawn as gold icons below the score.
  awards?: string[];
};

export type RenderCardOptions = {
  template: string;
  fontFacesCss?: string;
  footer?: string;
};

export declare function renderCard(restaurant: CardRestaurant, options: RenderCardOptions): string;

export declare function formatCardDate(date: Date): string;

export declare function awardIcons(awards: string[], scoreY: number): string;

export declare const BAN_ICON_PATH: string;

export declare function blendHex(color: string, base: string, strength: number): string;

export declare function cardColor(category: CardCategory): string;

export declare function escapeXml(value: unknown): string;
