// filters.ts

import type { Dispatch, SetStateAction } from "react";

export type Filters = {
  grades: string[];
  boroughs: string[];
  // Today's featured restaurants only (the gold map chip).
  featured: boolean;
};
export type MapDisplayMode = "points" | "clusters";
export type SetFilters = Dispatch<SetStateAction<Filters>>;