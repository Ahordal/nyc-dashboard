// ChartSkeleton.tsx
//
// Placeholder shown while a lazy-loaded chart chunk (GradeChart /
// PerformanceChart, both of which pull in Recharts) downloads. The
// grade-chart and performance-chart layout areas are sized by the grid,
// not their content, so this only needs to fill the space and signal
// loading, not reserve a specific height.

export default function ChartSkeleton({ label = "Loading chart…" }: { label?: string }) {
  return (
    <div className="chart-skeleton" role="status" aria-live="polite">
      <span className="chart-skeleton-label">{label}</span>
    </div>
  );
}
