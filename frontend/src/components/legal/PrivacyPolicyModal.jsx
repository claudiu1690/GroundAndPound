import { createPortal } from "react-dom";

/**
 * Privacy Policy modal.
 *
 * ⚠️ BASELINE TEMPLATE — accurate to the app's real data flows, but NOT a
 * lawyer-reviewed document. Before relying on it in production: have it reviewed
 * (or run through a generator like Termly/iubenda), and confirm the placeholders
 * below: company entity ("Digital Olive"), contact email, and the "Last updated"
 * date. Mirrors CookiePolicyModal markup so it inherits the same modal styling.
 */
const ENTITY = "Digital Olive"; // legal operator (from site footer) — confirm
const CONTACT_EMAIL = "support@groundandpound.net"; // live inbox (Cloudflare Email Routing)
const MIN_AGE = 13;

export function PrivacyPolicyModal({ open, onClose }) {
  if (!open) return null;

  const node = (
    <div className="account-modal-backdrop" onClick={onClose}>
      <div
        className="account-modal cookie-policy-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Privacy Policy"
      >
        <header className="account-modal-head">
          <h3 className="account-modal-title">Privacy Policy</h3>
          <button type="button" className="account-modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="account-modal-body cookie-policy-body">
          <p className="cookie-policy-updated">Last updated: June 2026</p>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Who we are</h4>
            <p className="cookie-policy-text">
              Ground &amp; Pound (“the game”) is operated by {ENTITY} (“we”, “us”). This
              policy explains what personal data we collect when you use the game, why,
              and your rights over it. Questions: <strong>{CONTACT_EMAIL}</strong>.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">What we collect</h4>
            <ul className="cookie-policy-list">
              <li className="cookie-policy-item">
                <span className="cookie-policy-purpose"><strong>Account data</strong> — your email address and a securely hashed password.</span>
              </li>
              <li className="cookie-policy-item">
                <span className="cookie-policy-purpose"><strong>Game data</strong> — your fighter, progress, stats, fight history, rankings, and in-game activity.</span>
              </li>
              <li className="cookie-policy-item">
                <span className="cookie-policy-purpose"><strong>Technical data</strong> — your IP address and basic request logs, used for security, rate-limiting, and diagnosing errors.</span>
              </li>
            </ul>
            <p className="cookie-policy-text cookie-policy-note">
              We do not use advertising trackers, and we do not sell your personal data.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">How we use it</h4>
            <p className="cookie-policy-text">
              To run the game and your account, to authenticate you, to send essential
              emails (address verification and password resets), to prevent cheating and
              abuse, and to detect and fix errors. Under the GDPR, our legal bases are
              performance of the contract (providing the game you signed up for) and our
              legitimate interests in keeping the service secure and working.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Who processes it for us</h4>
            <p className="cookie-policy-text">
              We use trusted service providers that process data on our behalf under their
              own terms: <strong>MongoDB Atlas</strong> (database hosting),
              {" "}<strong>Railway</strong> (application hosting), <strong>Resend</strong>
              {" "}(transactional email), and <strong>Sentry</strong> (error monitoring).
              Your data may be processed in countries outside your own, with appropriate
              safeguards in place.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">How long we keep it</h4>
            <p className="cookie-policy-text">
              We keep your data while your account is active. You can delete your account
              at any time from Account settings, which removes your personal data, subject
              to short, routine retention in backups and security logs.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Your rights</h4>
            <p className="cookie-policy-text">
              Depending on where you live, you may have the right to access, correct,
              delete, or export your personal data, and to object to certain processing.
              You can delete your account in-game, or contact us at{" "}
              <strong>{CONTACT_EMAIL}</strong> to exercise any of these rights.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Children</h4>
            <p className="cookie-policy-text">
              The game is not directed at children under {MIN_AGE}, and we do not knowingly
              collect personal data from them. If you believe a child has provided us data,
              contact us and we will delete it.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Security</h4>
            <p className="cookie-policy-text">
              Passwords are stored only as salted hashes, traffic is encrypted in transit,
              and access to data is restricted. No system is perfectly secure, but we take
              reasonable measures to protect your information.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Cookies &amp; storage</h4>
            <p className="cookie-policy-text">
              We use only a small amount of essential first-party browser storage — no
              tracking cookies. See the separate Cookie Policy for the exact details.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Changes</h4>
            <p className="cookie-policy-text">
              We may update this policy as the game evolves. The “last updated” date above
              reflects the current version.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">Contact</h4>
            <p className="cookie-policy-text">
              Questions about your data or this policy: <strong>{CONTACT_EMAIL}</strong>.
            </p>
          </section>
        </div>

        <footer className="account-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
