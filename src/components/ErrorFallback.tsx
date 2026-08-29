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
};

export default function ErrorFallback({
  message,
  fullPage = false,
}: ErrorFallbackProps) {
  return (
    <div className={fullPage ? "app-error" : "panel-error"} role="alert">
      <p className="error-fallback-message">{message}</p>

      <button
        type="button"
        className="error-fallback-retry"
        onClick={() => {
          window.location.reload();
        }}>
        Reload
      </button>
    </div>
  );
}
