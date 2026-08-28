// filters.ts
//
// The dashboard's filter state and its React setter type, shared so
// components use one consistent interface.

import type { Dispatch, SetStateAction } from "react";

export type Filters = {
  grades: string[];
  boroughs: string[];
};
export type MapDisplayMode = "points" | "clusters";
export type SetFilters = Dispatch<SetStateAction<Filters>>;