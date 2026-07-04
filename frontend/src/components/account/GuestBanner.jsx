import { useState } from "react";
import { t } from "../../lib/i18n";

/**
 * Top-of-app nudge for unclaimed guest accounts — styled like EmailVerifyBanner
 * but never forced (dismissable, no auth gate). Shown instead of
 * EmailVerifyBanner while accountStatus.isGuest is true (App.jsx banner
 * precedence — guests have no email to verify).
 *
 * Props:
 *   onSecureClick — navigates to the claim panel in the account tab.
 */
export function GuestBanner({ onSecureClick }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="guest-banner" role="status">
      <span className="evb-icon" aria-hidden="true">👤</span>
      <div className="evb-text">{t("account.guestBanner.text")}</div>
      <button type="button" className="evb-btn" onClick={onSecureClick}>
        {t("account.guestBanner.secureBtn")}
      </button>
      <button
        type="button"
        className="guest-banner-dismiss"
        aria-label={t("account.guestBanner.dismissAriaLabel")}
        onClick={() => setDismissed(true)}
      >
        ✕
      </button>
    </div>
  );
}
