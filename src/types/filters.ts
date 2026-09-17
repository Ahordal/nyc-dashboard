// filters.ts

import type { Dispatch, SetStateAction } from "react";

export type Filters = {
  grades: string[];
  boroughs: string[];
};
export type MapDisplayMode = "points" | "clusters";
export type SetFilters = Dispatch<SetStateAction<Filters>>;