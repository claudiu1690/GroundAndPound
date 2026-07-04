import { createPortal } from "react-dom";
import { t } from "../../lib/i18n";

/**
 * Cookie Policy modal.
 *
 * Renders the full, truthful cookie/storage policy for the game. The app uses
 * NO HTTP cookies, NO third-party/analytics/advertising trackers — only a small
 * amount of first-party browser localStorage that is strictly necessary to keep
 * the player signed in and load their fighter. This modal documents exactly
 * which keys are stored and why no opt-out is offered (everything is essential).
 *
 * Markup mirrors DeleteAccountModal (account-modal-* classes + body portal) so
 * it escapes the .app `transform: scale(var(--ui-zoom))` coordinate system.
 */
export function CookiePolicyModal({ open, onClose }) {
  if (!open) return null;

  const STORED = [
    {
      key: "gnp_token",
      purpose: t("legal.cookiePolicy.whatWeStore.items.gnp_token"),
    },
    {
      key: "gnp_fighter_id",
      purpose: t("legal.cookiePolicy.whatWeStore.items.gnp_fighter_id"),
    },
    {
      key: "gnp_cookie_consent",
      purpose: t("legal.cookiePolicy.whatWeStore.items.gnp_cookie_consent"),
    },
    {
      key: "gnp_last_seen_version",
      purpose: t("legal.cookiePolicy.whatWeStore.items.gnp_last_seen_version"),
    },
  ];

  const node = (
    <div className="account-modal-backdrop" onClick={onClose}>
      <div
        className="account-modal cookie-policy-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("legal.cookiePolicy.modalAriaLabel")}
      >
        <header className="account-modal-head">
          <h3 className="account-modal-title">{t("legal.cookiePolicy.title")}</h3>
          <button type="button" className="account-modal-x" onClick={onClose} aria-label={t("legal.cookiePolicy.closeAriaLabel")}>
            ×
          </button>
        </header>

        <div className="account-modal-body cookie-policy-body">
          <p className="cookie-policy-updated">{t("legal.cookiePolicy.lastUpdated")}</p>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.whatCovers.heading")}</h4>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.whatCovers.body")}
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.doCookies.heading")}</h4>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.doCookies.body1")}
            </p>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.doCookies.body2")}
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.whatWeStore.heading")}</h4>
            <ul className="cookie-policy-list">
              {STORED.map((item) => (
                <li key={item.key} className="cookie-policy-item">
                  <code className="cookie-policy-key">{item.key}</code>
                  <span className="cookie-policy-purpose">{item.purpose}</span>
                  <span className="cookie-policy-tag">{t("legal.cookiePolicy.whatWeStore.tag")}</span>
                </li>
              ))}
            </ul>
            <p className="cookie-policy-text cookie-policy-note">
              {t("legal.cookiePolicy.whatWeStore.persistNote")}
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.whyEssential.heading")}</h4>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.whyEssential.body")}
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.managing.heading")}</h4>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.managing.body")}
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.changes.heading")}</h4>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.changes.body")}
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">{t("legal.cookiePolicy.contact.heading")}</h4>
            <p className="cookie-policy-text">
              {t("legal.cookiePolicy.contact.body")}
            </p>
          </section>
        </div>

        <footer className="account-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t("legal.cookiePolicy.closeBtn")}
          </button>
        </footer>
      </div>
    </div>
  );

  // Portal to <body> so the modal escapes the .app CSS `transform: scale(var(--ui-zoom))`
  // — matching DeleteAccountModal, otherwise the backdrop sits inside the scaled
  // coordinate system and ends up offset on wide monitors.
  return createPortal(node, document.body);
}
