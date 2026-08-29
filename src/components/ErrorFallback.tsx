// ErrorFallback.tsx
//
// The visible state an ErrorBoundary drops in when its subtree throws.
// The compact default fills a single dashboard panel; `fullPage` is the
// app-root version rendered from main.tsx. Reload preserves the view -
// filters, search, selection, and radius all live in the URL.

type ErrorFallbackProps = {
  // Shown above the button, e.g. "The map failed to load."
  message: string;
  fullPage?: boolean;
  // When set, the button retries in place (and reads "Retry") instead of
  // reloading the page. Used for async failures a caller can recover from
  // without a full reload, e.g. the map view rebuilding after a load error.
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
