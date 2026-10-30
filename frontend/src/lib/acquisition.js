/**
 * Acquisition tag: which of our links brought this visitor in.
 *
 * Ad and post links carry `?src=reddit` (optionally `&c=<campaign>`; the
 * standard `utm_source` / `utm_campaign` work too). We read the tag once at
 * boot, keep it IN MEMORY ONLY (no localStorage, no cookie, so the Cookie
 * Policy's "essential storage only" stays true), strip it from the address bar
 * so shared links don't inherit it, and send it with the signup request. The
 * server re-validates it and stores it on the signup analytics event.
 *
 * A visitor who reloads or comes back later is counted as direct. That's the
 * price of not storing anything on the device.
 */

const TAG = /^[a-z0-9_-]{1,40}$/;
const PARAMS = ["src", "c", "utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"];

let captured = null;

function clean(value) {
  if (!value) return null;
  const tag = value.trim().toLowerCase();
  return TAG.test(tag) ? tag : null;
}

/** Read the tag from the current URL (call once, before the app renders). */
export function captureAcquisition() {
  try {
    const url = new URL(window.location.href);
    const src = clean(url.searchParams.get("src")) || clean(url.searchParams.get("utm_source"));
    const campaign = clean(url.searchParams.get("c")) || clean(url.searchParams.get("utm_campaign"));
    if (src) captured = campaign ? { src, campaign } : { src };

    if (PARAMS.some((p) => url.searchParams.has(p))) {
      PARAMS.forEach((p) => url.searchParams.delete(p));
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch {
    // A malformed URL must never stop the game from booting.
  }
}

/** `{ src, campaign? }` for the signup body, or undefined when untagged. */
export function getAcquisition() {
  return captured || undefined;
}
