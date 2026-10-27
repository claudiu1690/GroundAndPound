/**
 * Deep links to the legal modals: `/?legal=terms` and `/?legal=privacy`.
 *
 * Stripe's Dashboard needs public Terms and Privacy URLs, and its checkout page links to them.
 * Both land on the game's existing modals (LegalModals listens for `open-terms` and
 * `open-privacy-policy`), so there is one copy of the legal text.
 *
 * Call once the page that mounts <LegalModals /> has rendered (a mount effect is enough, since
 * child effects register their listeners first). The param is stripped afterwards so a refresh
 * does not reopen the modal. Safe to call twice: the second call finds nothing.
 */
const LEGAL_EVENTS = {
  terms: "open-terms",
  privacy: "open-privacy-policy",
};

export function openLegalFromUrl() {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const eventName = LEGAL_EVENTS[url.searchParams.get("legal")];
    if (!eventName) return false;
    url.searchParams.delete("legal");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
    window.dispatchEvent(new CustomEvent(eventName));
    return true;
  } catch (_) {
    return false;
  }
}
