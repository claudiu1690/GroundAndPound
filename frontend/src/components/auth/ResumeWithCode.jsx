import { useEffect, useState } from "react";
import { api, authStorage } from "../../api";
import { t } from "../../lib/i18n";

/**
 * "Resume with a recovery code" — cross-device / data-loss recovery for
 * guest accounts. Code input → api.resumeGuest → authStorage.save + onAuthenticated.
 *
 * Contract: POST /auth/guest/resume → 200 { token, fighterId, accountId }.
 * Errors: 400 missing code; 401 { code:"invalid_code" } (generic — never
 * reveals whether the code exists); 429 rate-limited.
 */
export function ResumeWithCode({ onAuthenticated, onCancel }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryIn, setRetryIn] = useState(0);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setInterval(() => setRetryIn((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [retryIn]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t("auth.guest.resume.errorMissing"));
      return;
    }
    setLoading(true);
    try {
      const { token, fighterId } = await api.resumeGuest(trimmed);
      authStorage.save(token, fighterId);
      onAuthenticated(fighterId);
    } catch (err) {
      if (err.code === "invalid_code") {
        // Generic by design — never reveal whether the code exists.
        setError(t("auth.guest.resume.errorInvalid"));
      } else if (err.status === 429) {
        const wait = err.retryAfter || 60;
        setRetryIn(wait);
        setError(t("auth.guest.resume.errorRateLimited", { n: wait }));
      } else {
        setError(err.message || t("common.error"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-step-label">{t("auth.guest.resume.label")}</div>
      <p className="auth-desc">{t("auth.guest.resume.desc")}</p>
      <div className="auth-field">
        <label>{t("auth.guest.resume.codeLabel")}</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("auth.guest.resume.codePlaceholder")}
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
      </div>
      {error && <div className="auth-error">{error}</div>}
      <div className="auth-row auth-row-btns">
        <button type="button" className="auth-back" onClick={onCancel}>{t("auth.register.backBtn")}</button>
        <button className="auth-submit auth-submit-create" type="submit" disabled={loading || retryIn > 0}>
          {loading ? t("auth.guest.resume.resuming") : retryIn > 0 ? t("auth.guest.resume.retryIn", { n: retryIn }) : t("auth.guest.resume.submitBtn")}
        </button>
      </div>
    </form>
  );
}
