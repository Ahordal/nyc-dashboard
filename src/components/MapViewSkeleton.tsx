// MapViewSkeleton.tsx
//
// Placeholder displayed while the lazy-loaded MapView chunk (including
// @arcgis/core) downloads and initializes. Mirrors MapView's dimensions
// to prevent layout shift (CLS) and provide immediate visual feedback.

export default function MapViewSkeleton() {
  return (
    <div className="map-view-skeleton" role="status" aria-live="polite">
      <span className="map-view-skeleton-label">Loading map…</span>
    </div>
  );
  
}