import { createPortal } from "react-dom";

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
      purpose:
        "A sign-in token (JWT) that keeps you logged in between visits so you don't have to re-enter your password each time.",
    },
    {
      key: "gnp_fighter_id",
      purpose:
        "The ID of your fighter, so the game knows which character to load when you return.",
    },
    {
      key: "gnp_cookie_consent",
      purpose:
        "Remembers that you've seen and acknowledged this notice, so the banner doesn't show again on every visit.",
    },
  ];

  const node = (
    <div className="account-modal-backdrop" onClick={onClose}>
      <div
        className="account-modal cookie-policy-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cookie Policy"
      >
        <header className="account-modal-head">
          <h3 className="account-modal-title">Cookie Policy</h3>
          <button type="button" className="account-modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="account-modal-body cookie-policy-body">
          <p className="cookie-policy-updated">Last updated: 2 June 2026</p>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">What this policy covers</h4>
            <p className="cookie-policy-text">
              This policy explains how Ground &amp; Pound uses cookies and similar
              technologies (such as browser local storage) while you play.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Do we use cookies?</h4>
            <p className="cookie-policy-text">
              No. Ground &amp; Pound does <strong>not</strong> use traditional HTTP
              cookies, third-party cookies, advertising cookies, or any
              analytics/tracking technology. We do not profile you, and we do not
              share your data with advertisers.
            </p>
            <p className="cookie-policy-text">
              The game uses only your own browser's <strong>local storage</strong> to
              hold a few essential values on your device. This data stays in your
              browser and is sent to our servers only as the sign-in token needed to
              authenticate your requests.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">What we store</h4>
            <ul className="cookie-policy-list">
              {STORED.map((item) => (
                <li key={item.key} className="cookie-policy-item">
                  <code className="cookie-policy-key">{item.key}</code>
                  <span className="cookie-policy-purpose">{item.purpose}</span>
                  <span className="cookie-policy-tag">Strictly necessary / essential</span>
                </li>
              ))}
            </ul>
            <p className="cookie-policy-text cookie-policy-note">
              These values persist until you sign out or clear your browser data.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Why it's essential</h4>
            <p className="cookie-policy-text">
              Without this storage you couldn't stay signed in or load your fighter —
              the game simply wouldn't work. Because every value above is strictly
              necessary to deliver the service you asked for, there is nothing
              non-essential to switch off, so no opt-out is offered.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Managing or removing it</h4>
            <p className="cookie-policy-text">
              You can clear this storage at any time through your browser's settings
              (clearing site data for this game), or by <strong>signing out</strong>,
              which removes your sign-in token and fighter ID. Note that clearing this
              data will sign you out, and you'll need to log in again to keep playing.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Changes to this policy</h4>
            <p className="cookie-policy-text">
              We may update this policy from time to time. When we do, we'll revise the
              "Last updated" date above and, where appropriate, show the notice again so
              you can review the changes.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Contact</h4>
            <p className="cookie-policy-text">
              If you have any questions about this policy or your data, please contact us
              through your account or our support channels.
            </p>
          </section>
        </div>

        <footer className="account-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
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
