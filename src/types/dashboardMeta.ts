// types/dashboardMeta.ts
//
// Dashboard-wide metadata describing the freshness and size of the
// underlying inspection dataset.

export type DashboardMeta = {
  lastUpdated: string | null;
  restaurantCount: number | null;
  inspectionCount: number | null;
  // Change vs. the previous day's counts-snapshot.json baseline. null
  // means there's no previous run to compare against yet (e.g. before
  // the first geocode-backfill run has ever committed a snapshot) --
  // distinct from an actual zero-change day, which is 0, not null.
  restaurantDelta: number | null;
  inspectionDelta: number | null;
};