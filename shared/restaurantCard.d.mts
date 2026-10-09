// restaurantCard.d.mts
//
// Type declarations for restaurantCard.mjs, so the TypeScript frontend
// gets types for it without turning on allowJs project-wide.

export type CardRestaurant = {
  name: string;
  grade: string;
  score: number;
  boro?: string | null;
  cuisine?: string | null;
};

export type RenderCardOptions = {
  template: string;
  fontFacesCss?: string;
  date?: Date;
};

export declare function renderCard(restaurant: CardRestaurant, options: RenderCardOptions): string;

export declare function formatCardDate(date: Date): string;

export declare function escapeXml(value: unknown): string;
