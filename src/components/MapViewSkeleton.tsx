// MapViewSkeleton.tsx
//
// Placeholder while the lazy-loaded MapView chunk (including
// @arcgis/core) downloads and initializes. Mirrors MapView's dimensions
// to avoid layout shift.

export default function MapViewSkeleton() {
  return (
    <div className="map-view-skeleton" role="status" aria-live="polite">
      <span className="map-view-skeleton-label">Loading map…</span>
    </div>
  );
  
}