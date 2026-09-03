// DashboardGuideMeta.tsx
//
// The dataset-freshness / size / attribution rows shown in the Dashboard
// Information panel (desktop) and the mobile info drawer.

import type { DashboardMeta } from "../types/dashboardMeta";

// Fallback for missing or unparsed metadata values.
const PLACEHOLDER = "—";

function formatLastUpdated(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) {
    return PLACEHOLDER;
  }

  const parsed = new Date(lastUpdated);

  if (Number.isNaN(parsed.getTime())) {
    return PLACEHOLDER;
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCount(count: number | null | undefined): string {
  if (count == null) {
    return PLACEHOLDER;
  }

  return count.toLocaleString();
}

// Formats non-zero baseline changes with a +/- sign and status styling.
function formatDelta(delta: number | null | undefined) {
  if (delta == null || delta === 0) {
    return null;
  }

  const isPositive = delta > 0;

  return (
    <span
      className={`dashboard-guide-meta-delta ${
        isPositive
          ? "dashboard-guide-meta-delta-positive"
          : "dashboard-guide-meta-delta-negative"
      }`}
    >
      {isPositive ? "+" : "−"}
      {Math.abs(delta).toLocaleString()}
    </span>
  );
}

type DashboardGuideMetaProps = {
  meta: DashboardMeta | null;
  // Tight single-column rows with short labels and no divider (mobile
  // info drawer). Desktop keeps the roomy 2-column layout.
  compact?: boolean;
};

export default function DashboardGuideMeta({
  meta,
  compact = false,
}: DashboardGuideMetaProps) {
  if (compact) {
    return (
      <div className="dashboard-guide-meta" data-compact="true">
        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">Updated:</span>
          <span className="dashboard-guide-meta-value">
            {formatLastUpdated(meta?.lastUpdated)}
          </span>
        </div>

        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">Restaurants:</span>
          <span className="dashboard-guide-meta-value">
            {formatCount(meta?.restaurantCount)}
            {formatDelta(meta?.restaurantDelta)}
          </span>
        </div>

        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">Inspections:</span>
          <span className="dashboard-guide-meta-value">
            {formatCount(meta?.inspectionCount)}
            {formatDelta(meta?.inspectionDelta)}
          </span>
        </div>

        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">Cartography By:</span>
          <span className="dashboard-guide-meta-value">Alex Hordal</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-guide-meta">
      <div className="dashboard-guide-meta-row">
        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">
            Last Updated: &nbsp;
          </span>

          <span className="dashboard-guide-meta-value">
            {formatLastUpdated(meta?.lastUpdated)}
          </span>
        </div>

        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">
            Total Restaurant Count: &nbsp;
          </span>

          <span className="dashboard-guide-meta-value">
            {formatCount(meta?.restaurantCount)}
            {formatDelta(meta?.restaurantDelta)}
          </span>
        </div>
      </div>

      <div className="dashboard-guide-meta-item">
        <span className="dashboard-guide-meta-label">
          Total Inspection Records: &nbsp;
        </span>

        <span className="dashboard-guide-meta-value">
          {formatCount(meta?.inspectionCount)}
          {formatDelta(meta?.inspectionDelta)}
        </span>
      </div>

      <div className="dashboard-guide-meta-divider" />

      <div className="dashboard-guide-meta-item">
        <span className="dashboard-guide-meta-label">
          Dashboard &amp; Cartography: &nbsp;
        </span>

        <span className="dashboard-guide-meta-value">Alex Hordal</span>
      </div>
    </div>
  );
}
