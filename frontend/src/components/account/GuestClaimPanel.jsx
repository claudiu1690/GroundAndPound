import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, authStorage } from "../../api";
import { t } from "../../lib/i18n";

/**
 * "Secure your account" — lets a guest attach an email + password. Lives in
 * AccountTab, rendered only when profile.isGuest is true.
 *
 * Contract: POST /account/:id/claim → 200 { success, token, email, emailConfirmed }.
 * Fresh token because claim bumps sessionEpoch — must replace the stored JWT
 * or the next protected request 401s.
 *
 * Errors: 409 email_taken; 400 weak_password (min 8 chars + ≥1 number,
 * same rule as ChangePassword elsewhere in this file); 400 invalid_email.
 */
export function GuestClaimPanel({ accountId, onClaimed, onMessage }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
  const passwordValid = password.length >= 8 && /[0-9]/.test(password);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = emailValid && passwordValid && matches && !busy;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!emailValid) return setError(t("account.guestClaim.errorInvalidEmail"));
    if (!passwordValid) return setError(t("account.guestClaim.errorWeakPassword"));
    if (!matches) return setError(t("account.guestClaim.errorMismatch"));

    setBusy(true);
    try {
      const res = await api.claimAccount(accountId, email.trim().toLowerCase(), password);
      // Fresh token — replace the stored one (sessionEpoch bumped server-side).
      const fighterId = authStorage.getFighterId();
      authStorage.save(res.token, fighterId);
      onMessage?.(t("account.guestClaim.successMsg"));
      onClaimed?.({ email: res.email, emailConfirmed: res.emailConfirmed });
      setEmail(""); setPassword(""); setConfirm("");
    } catch (err) {
      if (err.code === "email_taken") {
        setError(t("account.guestClaim.errorEmailTaken"));
      } else if (err.code === "weak_password") {
        setError(t("account.guestClaim.errorWeakPassword"));
      } else if (err.code === "invalid_email") {
        setError(t("account.guestClaim.errorInvalidEmail"));
      } else if (err.code === "not_guest") {
        // Shouldn't normally reach here (panel only renders for guests), but
        // handle gracefully in case of stale client state.
        setError(t("account.guestClaim.errorNotGuest"));
      } else {
        setError(err.message || t("common.error"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-card guest-claim-panel">
      <header className="section-header">
        <div className="section-titles">
          <h3 className="section-title">{t("account.guestClaim.title")}</h3>
          <p className="section-sub">{t("account.guestClaim.subtitle")}</p>
        </div>
        <div className="section-icon email">
          <ShieldCheck size={16} strokeWidth={2} />
        </div>
      </header>
      <div className="section-body">
        <form className="form-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t("account.guestClaim.emailLabel")}</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("account.guestClaim.emailPlaceholder")}
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("account.guestClaim.passwordLabel")} <span className="form-hint">{t("account.guestClaim.passwordHint")}</span></label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("account.guestClaim.passwordPlaceholder")}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("account.guestClaim.confirmLabel")}</label>
            <input
              type="password"
              className="form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("account.guestClaim.confirmPlaceholder")}
              autoComplete="new-password"
            />
          </div>
          {error && <span className="form-hint neg">{error}</span>}
          <button type="submit" className="update-btn" disabled={!canSubmit}>
            {busy ? t("account.guestClaim.submitting") : t("account.guestClaim.submitBtn")}
          </button>
        </form>
      </div>
    </section>
  );
}
