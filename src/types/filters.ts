// filters.ts
//
// Shared filter types used throughout the dashboard.
//
// Defines the dashboard's filter state and related React state setter
// type so components can share a consistent interface.

import type { Dispatch, SetStateAction } from "react";

export type Filters = {
  grades: string[];
  boroughs: string[];
};

export type SetFilters = Dispatch<SetStateAction<Filters>>;