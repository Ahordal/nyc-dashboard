// types/dashboardMeta.ts
//
// Dashboard-wide metadata describing the freshness and size of the
// underlying inspection dataset.

export type DashboardMeta = {
  lastUpdated: string | null;
  restaurantCount: number | null;
  inspectionCount: number | null;
};