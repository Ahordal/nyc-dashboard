// dashboardMeta.ts

// Restaurants holding each award (fetch-inspection.mjs countAwards); total is
// every restaurant on the map.
export type AwardCounts = {
  total: number;
  first_a: number;
  triple_crown: number;
  perfect_score: number;
  consistent: number;
  most_improved: number;
};

export type DashboardMeta = {
  // From the last backfill run, not this build — main pushes between runs don't touch it.
  lastUpdated: string | null;
  restaurantCount: number | null;
  inspectionCount: number | null;
  // null = no prior run yet, distinct from an actual zero-change day.
  restaurantDelta: number | null;
  inspectionDelta: number | null;
  // Missing from builds before awards existed.
  awardCounts?: AwardCounts;
};
