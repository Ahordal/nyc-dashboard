// dashboardMeta.ts

export type DashboardMeta = {
  // From the last backfill run, not this build — main pushes between runs don't touch it.
  lastUpdated: string | null;
  restaurantCount: number | null;
  inspectionCount: number | null;
  // null = no prior run yet, distinct from an actual zero-change day.
  restaurantDelta: number | null;
  inspectionDelta: number | null;
};