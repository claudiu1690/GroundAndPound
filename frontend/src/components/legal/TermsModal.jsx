import { createPortal } from "react-dom";

/**
 * Terms of Service modal.
 *
 * ⚠️ BASELINE TEMPLATE — sensible defaults for this game, but NOT lawyer-reviewed.
 * Before relying on it: have it reviewed (or run through a generator), set the
 * governing-law jurisdiction, and confirm the placeholders (entity, contact,
 * min age). Paid purchases (Stripe) will need an additional purchase/refund
 * section once that's wired. Mirrors CookiePolicyModal markup for styling.
 */
const ENTITY = "Digital Olive"; // legal operator — confirm
const CONTACT_EMAIL = "support@groundandpound.net"; // live inbox (Cloudflare Email Routing)
const MIN_AGE = 13;

export function TermsModal({ open, onClose }) {
  if (!open) return null;

  const node = (
    <div className="account-modal-backdrop" onClick={onClose}>
      <div
        className="account-modal cookie-policy-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Terms of Service"
      >
        <header className="account-modal-head">
          <h3 className="account-modal-title">Terms of Service</h3>
          <button type="button" className="account-modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="account-modal-body cookie-policy-body">
          <p className="cookie-policy-updated">Last updated: June 2026</p>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">1. Acceptance</h4>
            <p className="cookie-policy-text">
              Ground &amp; Pound (“the game”) is operated by {ENTITY}. By creating an
              account or using the game, you agree to these Terms. If you do not agree,
              do not use the game.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">2. Eligibility</h4>
            <p className="cookie-policy-text">
              You must be at least {MIN_AGE} years old to use the game (or older where your
              country requires). By using it, you confirm you meet this requirement.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">3. Your account</h4>
            <p className="cookie-policy-text">
              You are responsible for keeping your login details secure and for activity
              on your account. Don’t share your account or impersonate others. One person,
              one account.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">4. Fair play &amp; conduct</h4>
            <p className="cookie-policy-text">
              Don’t cheat, exploit bugs, automate play, or use unauthorized tools. Don’t
              harass other players or use offensive names or content. We may filter and
              moderate content and may remove names or accounts that break these rules.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">5. Virtual items &amp; currency</h4>
            <p className="cookie-policy-text">
              In-game currency, energy, items, ranks, and any other virtual content have
              <strong> no real-world or monetary value</strong>, cannot be exchanged for
              cash, and are licensed to you for use within the game — not owned. We may
              adjust, reset, or remove virtual content as part of running and balancing the
              game. (Any future paid purchases will be covered by additional purchase and
              refund terms at the point of sale.)
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">6. The game changes</h4>
            <p className="cookie-policy-text">
              Ground &amp; Pound is a live, evolving game. We may change, balance, add, or
              remove features, content, and rules at any time, and may suspend or
              discontinue the service.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">7. Termination</h4>
            <p className="cookie-policy-text">
              We may suspend or terminate accounts that violate these Terms. You can delete
              your account at any time from Account settings.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">8. Disclaimer</h4>
            <p className="cookie-policy-text">
              The game is provided “as is” and “as available”, without warranties of any
              kind, to the fullest extent permitted by law. We don’t guarantee it will be
              uninterrupted, error-free, or that progress and data will never be lost.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">9. Limitation of liability</h4>
            <p className="cookie-policy-text">
              To the fullest extent permitted by law, {ENTITY} is not liable for any
              indirect, incidental, or consequential damages arising from your use of the
              game. Nothing in these Terms limits liability that cannot be limited by law.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">10. Changes to these Terms</h4>
            <p className="cookie-policy-text">
              We may update these Terms as the game develops. Continued use after an update
              means you accept the revised Terms. The “last updated” date above reflects the
              current version.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">11. Governing law</h4>
            <p className="cookie-policy-text">
              These Terms are governed by the laws of the jurisdiction in which the operator
              is established, without regard to conflict-of-laws rules.
            </p>
            {/* TODO: replace the above with your actual governing jurisdiction
                (e.g. "the laws of England and Wales" / your country/state). */}
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">12. Contact</h4>
            <p className="cookie-policy-text">
              Questions about these Terms: <strong>{CONTACT_EMAIL}</strong>.
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
