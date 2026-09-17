// ChartSkeleton.tsx
//
// Placeholder while a lazy chart chunk (GradeChart/PerformanceChart)
// downloads. Grid sizes these areas, not content, so this just fills space.

export default function ChartSkeleton({ label = "Loading chart…" }: { label?: string }) {
  return (
    <div className="chart-skeleton" role="status" aria-live="polite">
      <span className="chart-skeleton-label">{label}</span>
    </div>
  );
}
