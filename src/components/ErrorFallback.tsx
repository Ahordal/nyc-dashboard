// ErrorFallback.tsx
//
// What ErrorBoundary shows when a subtree throws. Compact fills one
// panel, `fullPage` is the app-root version; reload preserves the view
// since filters/search/selection/radius all live in the URL.

type ErrorFallbackProps = {
  // Shown above the button, e.g. "The map failed to load."
  message: string;
  fullPage?: boolean;
  // When set, retries in place instead of reloading — for failures a
  // caller can recover from, e.g. the map view rebuilding.
  onRetry?: () => void;
};

export default function ErrorFallback({
  message,
  fullPage = false,
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div className={fullPage ? "app-error" : "panel-error"} role="alert">
      <p className="error-fallback-message">{message}</p>

      <button
        type="button"
        className="error-fallback-retry"
        onClick={onRetry ?? (() => window.location.reload())}>
        {onRetry ? "Retry" : "Reload"}
      </button>
    </div>
  );
}
