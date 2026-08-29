// inputModality.ts
//
// Tracks whether the user is currently driving the UI by keyboard or by
// pointer and reflects it as data-input-modality on <html>. Text inputs
// match :focus-visible whenever they're focused (mouse click included),
// so CSS alone can't keep the focus ring keyboard-only on a field like
// .search-input -- this attribute lets a CSS rule gate on modality.

// Only true navigation keys count as "keyboard driving". Typing letters
// into a field must not flip the modality, or the ring would appear
// mid-search.
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
