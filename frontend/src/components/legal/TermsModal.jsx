import { createPortal } from "react-dom";

/**
 * Terms of Service modal.
 *
 * Owner-approved 2026-10-27 for the real-money shop launch: entity Digital Olive,
 * governing law deliberately generic (section 12), 13+ to play and 18+ (or guardian
 * permission) to buy (section 6). Not lawyer-reviewed. Mirrors CookiePolicyModal markup.
 */
const ENTITY = "Digital Olive SRL"; // legal operator (owner-confirmed 2026-10-27)
// Operator identity required on the site by Romanian Law 365/2002 art. 5. The owner chose not
// to publish the registered office address (2026-10-27).
const FISCAL_CODE = "50872480"; // CUI, not VAT registered
const TRADE_REGISTER_NO = "J29/1032/2024";
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
          <p className="cookie-policy-updated">Last updated: October 2026</p>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">1. Acceptance</h4>
            <p className="cookie-policy-text">
              Ground &amp; Pound (“the game”) is operated by {ENTITY} (fiscal code (CUI){" "}
              {FISCAL_CODE}, Trade Register no. {TRADE_REGISTER_NO}). By creating an
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
              cash, and are licensed to you for use within the game, not owned. We may
              adjust, reset, or remove virtual content as part of running and balancing the
              game. Paid purchases are covered by section 6.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">6. Purchases and refunds</h4>
            <p className="cookie-policy-text">
              Energy Drink bundles are digital content delivered to your account right after
              payment. Prices are shown in US dollars and include applicable taxes. Payments are
              processed by Stripe; we never receive your card details. Buying requires a
              registered account with an email and password. You must be 18 or older to make a
              purchase, or have permission from a parent or guardian.
            </p>
            <p className="cookie-policy-text">
              By confirming a purchase you ask for immediate delivery and acknowledge that, once
              delivery has started, you lose the 14-day right of withdrawal that may otherwise
              apply to online purchases. We send a confirmation of your order and of that
              acknowledgement to your email.
            </p>
            <p className="cookie-policy-text">
              Delivered drinks are not refundable, except where the law requires it or where
              delivery failed. If something went wrong, contact us at{" "}
              <strong>{CONTACT_EMAIL}</strong> with the time of your purchase. Energy Drinks give
              energy only, never stats or fight results, and like all virtual items they have no
              monetary value. If you dispute a payment with your bank (a chargeback), the Energy
              Drinks from that order that are still in your inventory are removed and purchases
              are disabled on your account. The rest of your account is not affected.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">7. The game changes</h4>
            <p className="cookie-policy-text">
              Ground &amp; Pound is a live, evolving game. We may change, balance, add, or
              remove features, content, and rules at any time, and may suspend or
              discontinue the service.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">8. Termination</h4>
            <p className="cookie-policy-text">
              We may suspend or terminate accounts that violate these Terms. You can delete
              your account at any time from Account settings.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">9. Disclaimer</h4>
            <p className="cookie-policy-text">
              The game is provided “as is” and “as available”, without warranties of any
              kind, to the fullest extent permitted by law. We don’t guarantee it will be
              uninterrupted, error-free, or that progress and data will never be lost.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">10. Limitation of liability</h4>
            <p className="cookie-policy-text">
              To the fullest extent permitted by law, {ENTITY} is not liable for any
              indirect, incidental, or consequential damages arising from your use of the
              game. Nothing in these Terms limits liability that cannot be limited by law.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">11. Changes to these Terms</h4>
            <p className="cookie-policy-text">
              We may update these Terms as the game develops. Continued use after an update
              means you accept the revised Terms. The “last updated” date above reflects the
              current version.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">12. Governing law</h4>
            <p className="cookie-policy-text">
              These Terms are governed by the laws of the jurisdiction in which the operator
              is established, without regard to conflict-of-laws rules.
            </p>
          </section>

          <section className="cookie-policy-section">
            <h4 className="cookie-policy-h">13. Contact</h4>
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
