// restaurantCard.d.mts
//
// Type declarations for restaurantCard.mjs, so the TypeScript frontend
// gets types for it without turning on allowJs project-wide.

export type CardCategory = "A" | "B" | "C" | "pending" | "uninspected" | "closed";

// A Font Awesome icon (512 tall; width varies) and the colour to draw it in.
export type CardAward = {
  width: number;
  d: string;
  color: string;
};

export type CardRestaurant = {
  name: string;
  // getGradeCategory's result: sets the card's colour and corner mark.
  category: CardCategory;
  score: number | null;
  boro?: string | null;
  cuisine?: string | null;
  // Awards held now, drawn as icons below the score.
  awards?: CardAward[];
};

export type RenderCardOptions = {
  template: string;
  fontFacesCss?: string;
  footer?: string;
};

export declare function renderCard(restaurant: CardRestaurant, options: RenderCardOptions): string;

export declare function formatCardDate(date: Date): string;

export declare function awardIcons(awards: CardAward[], scoreY: number): string;

export declare const BAN_ICON_PATH: string;

export declare function blendHex(color: string, base: string, strength: number): string;

export declare function cardColor(category: CardCategory): string;

export declare function escapeXml(value: unknown): string;
