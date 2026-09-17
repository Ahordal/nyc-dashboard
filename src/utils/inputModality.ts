// inputModality.ts
//
// Tracks keyboard vs pointer as data-input-modality on <html>.
// :focus-visible fires on clicks too, so CSS alone can't gate the ring.

// Only nav keys flip modality — typing must not, or the ring appears mid-search.
const NAV_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export function initInputModality(): void {
  const root = document.documentElement;

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.altKey || event.ctrlKey) return;
      if (NAV_KEYS.has(event.key)) root.dataset.inputModality = "keyboard";
    },
    true,
  );

  window.addEventListener(
    "pointerdown",
    () => {
      root.dataset.inputModality = "pointer";
    },
    true,
  );
}
