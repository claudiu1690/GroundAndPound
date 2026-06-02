import { useEffect, useState } from "react";
import { CookiePolicyModal } from "./CookiePolicyModal";

const CONSENT_KEY = "gnp_cookie_consent";
const CONSENT_VALUE = "acknowledged-v1";

/**
 * Cookie-consent acknowledgement banner.
 *
 * Everything the app stores (gnp_token, gnp_fighter_id, gnp_cookie_consent) is
 * strictly necessary, so this is an ACKNOWLEDGEMENT notice — not a reject/opt-out
 * consent manager. A single "Got it" button records that the player has seen it.
 *
 * Self-contained: owns banner visibility AND policy-modal open state. The policy
 * modal can also be opened from anywhere via:
 *   window.dispatchEvent(new CustomEvent("open-cookie-policy"))
 * so footer links in any tree can trigger it even after the banner is dismissed.
 *
 * Rendered in both app trees (App.jsx + AuthPage.jsx); only one tree mounts at a
 * time, so only one banner ever shows.
 */
export function CookieConsent() {
  // Default to hidden; an effect decides whether to show it after reading
  // storage. This avoids a flash of the banner for players who already
  // acknowledged on a previous visit.
  const [showBanner, setShowBanner] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    // Guard storage access: private-mode / disabled storage can throw on read.
    // Fail safe by NOT crashing — if we can't read the flag we just show the
    // banner (the "Got it" click will also be guarded and is a no-op if write
    // throws, so the banner simply won't persist for that locked-down session).
    try {
      const acknowledged = localStorage.getItem(CONSENT_KEY);
      if (!acknowledged) setShowBanner(true);
    } catch {
      setShowBanner(true);
    }
  }, []);

  useEffect(() => {
    // Allow footer links anywhere to open the policy modal.
    const openPolicy = () => setPolicyOpen(true);
    window.addEventListener("open-cookie-policy", openPolicy);
    return () => window.removeEventListener("open-cookie-policy", openPolicy);
  }, []);

  const acknowledge = () => {
    // Guard the write too — disabled storage must not throw and crash the app.
    // If it throws we still hide the banner for this session; it just won't be
    // remembered next visit (acceptable for the rare locked-down case).
    try {
      localStorage.setItem(CONSENT_KEY, CONSENT_VALUE);
    } catch {
      /* storage unavailable — proceed without persisting */
    }
    setShowBanner(false);
  };

  return (
    <>
      {showBanner && (
        <div className="cookie-consent" role="region" aria-label="Cookie notice">
          <p className="cookie-consent-text">
            We use essential browser storage to keep you signed in and load your fighter.
            We don't use tracking or advertising cookies.
          </p>
          <div className="cookie-consent-actions">
            <button
              type="button"
              className="cookie-consent-link"
              onClick={() => setPolicyOpen(true)}
            >
              Cookie Policy
            </button>
            <button type="button" className="btn btn-primary cookie-consent-accept" onClick={acknowledge}>
              Got it
            </button>
          </div>
        </div>
      )}
      <CookiePolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </>
  );
}
