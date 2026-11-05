/**
 * Layout and input helpers for copy and anchors that differ between phone and desktop.
 * DOM reads only, safe to call at event time; all return a sane default outside a browser.
 */

/** True when the phone shell is on screen (the bottom nav is displayed). */
export function isPhoneLayout() {
  if (typeof document === "undefined") return false;
  const nav = document.querySelector(".m-bottom-nav");
  return !!nav && getComputedStyle(nav).display !== "none";
}

/** True when the player is on a touch device or the phone shell. */
export function isTouchInput() {
  if (isPhoneLayout()) return true;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Swap the verb to match the input: copy is written with "Tap"; mouse users read "Click".
 * Only whole words are touched ("Tap" and "tap").
 */
export function adaptInput(text) {
  if (!text || isTouchInput()) return text;
  return text.replace(/\bTap\b/g, "Click").replace(/\btap\b/g, "click");
}

/** True when the player asked the OS for less motion. */
export function prefersReducedMotion() {
  return typeof window !== "undefined"
    && !!window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
