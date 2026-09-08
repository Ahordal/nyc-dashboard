// nycBounds.d.mts
//
// Type declarations for nycBounds.mjs, so the TypeScript frontend gets
// types for it without turning on allowJs project-wide.

export declare const NYC_BOUNDS: {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export declare function isWithinNYC(lat: number, lon: number): boolean;
