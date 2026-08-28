// dashboardMeta.ts
//
// Dashboard-wide metadata describing the freshness and size of the
// underlying inspection dataset.

export type DashboardMeta = {
  // All five fields describe the last daily geocode-backfill run, not the
  // build that generated dashboard-meta.json. Site rebuilds from `main`
  // pushes between daily runs leave these untouched.
  lastUpdated: string | null;
  restaurantCount: number | null;
  inspectionCount: number | null;
  // Change from the daily run before this one. null means there's no
  // prior run to compare against yet (before the first geocode-backfill
  // run has committed a snapshot), distinct from a zero-change day (0).
  restaurantDelta: number | null;
  inspectionDelta: number | null;
};