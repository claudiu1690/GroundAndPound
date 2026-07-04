import { useState } from "react";
import { api, authStorage } from "../../api";
import { ForgotPasswordFlow } from "./ForgotPasswordFlow";
import { GuestStart } from "./GuestStart";
import { ResumeWithCode } from "./ResumeWithCode";
import { CookieConsent } from "../legal/CookieConsent";
import { FighterFields, WEIGHT_CLASSES, STYLES, BACKSTORIES } from "./FighterFields";
import { t } from "../../lib/i18n";

export function AuthPage({ onAuthenticated, initialResetToken = null, initialTab = null, onBack = null }) {
  const [tab, setTab] = useState(initialResetToken ? "forgot" : (initialTab || "login")); // "login" | "register" | "forgot"
  const [step, setStep] = useState(1);     // register step 1=account, 2=fighter
  // `initialResetToken` is set when the user arrived via the reset email link
  // (?reset_password_token=... in the URL). The ForgotPasswordFlow detects the
  // token and switches into "apply" mode; clearing this state in switchTab lets
  // the user navigate away.
  const [resetToken, setResetToken] = useState(initialResetToken);

  // Account fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Fighter fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [nickname, setNickname]   = useState("");
  const [weightClass, setWeightClass] = useState(WEIGHT_CLASSES[2]);
  const [style, setStyle]         = useState(STYLES[0]);
  const [backstory, setBackstory] = useState(BACKSTORIES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  // When login hits a soft-deleted account inside the 30-day grace window the
  // server returns code:"account_deleted" + a days-remaining hint. We capture
  // that state so the login form can render an inline "Recover account" button
  // using the same email+password already typed.
  const [recoverInfo, setRecoverInfo] = useState(null); // { daysLeft } | null
  const [recovering, setRecovering]   = useState(false);

  function resetForm() {
    setEmail(""); setPassword(""); setConfirmPw(""); setAgeConfirmed(false);
    setFirstName(""); setLastName(""); setNickname("");
    setWeightClass(WEIGHT_CLASSES[2]); setStyle(STYLES[0]); setBackstory(BACKSTORIES[0]);
    setError(""); setStep(1); setRecoverInfo(null);
  }

  function switchTab(tabName) { setTab(tabName); setResetToken(null); resetForm(); }

  // ── Login ────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setRecoverInfo(null);
    setLoading(true);
    try {
      const { token, fighterId } = await api.login({ email, password });
      authStorage.save(token, fighterId);
      onAuthenticated(fighterId);
    } catch (err) {
      setError(err.message);
      // Soft-deleted-but-recoverable accounts → surface the inline button.
      // The server includes a `code: "account_deleted"` and the days remaining
      // in the response body, which the api helper attaches to the Error.
      if (err.code === "account_deleted") {
        setRecoverInfo({ daysLeft: err.daysLeft || null });
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Recover ──────────────────────────────────────────────
  async function handleRecover() {
    if (recovering) return;
    setError("");
    setRecovering(true);
    try {
      const { token, fighterId } = await api.recoverAccount(email, password);
      authStorage.save(token, fighterId);
      onAuthenticated(fighterId);
    } catch (err) {
      setError(err.message || t("auth.forgot.recoverFailed"));
      // If the grace window expired between login and recover (race), don't
      // keep showing the recovery button — the account is gone now.
      if (err.code === "grace_expired" || err.code === "account_deleted_expired") {
        setRecoverInfo(null);
      }
    } finally {
      setRecovering(false);
    }
  }

  // ── Register step 1 — validate account fields ────────────
  function handleAccountNext(e) {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError(t("auth.validation.invalidEmail"));
    if (password.length < 6)   return setError(t("auth.validation.passwordTooShort"));
    if (password !== confirmPw) return setError(t("auth.validation.passwordMismatch"));
    if (!ageConfirmed) return setError(t("auth.validation.ageRequired"));
    setStep(2);
  }

  // ── Register step 2 — create account + fighter ───────────
  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return setError(t("auth.validation.nameRequired"));
    setLoading(true);
    try {
      const { token, fighterId } = await api.register({
        email,
        password,
        fighter: { firstName: firstName.trim(), lastName: lastName.trim(), nickname: nickname.trim() || null, weightClass, style, backstory },
      });
      authStorage.save(token, fighterId);
      onAuthenticated(fighterId);
    } catch (err) {
      setError(err.message);
      setStep(1); // back to account step on conflict errors
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs><radialGradient id="auth-rad" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1A0005"/><stop offset="100%" stopColor="#060606"/></radialGradient></defs>
          <rect width="1000" height="1000" fill="url(#auth-rad)" />
          <g fill="none" stroke="#C8102E" strokeOpacity="0.06" strokeWidth="2">
            <polygon points="161,20 839,20 980,161 980,839 839,980 161,980 20,839 20,161" />
            <polygon points="231,120 769,120 880,231 880,769 769,880 231,880 120,769 120,231" />
            <polygon points="302,220 698,220 780,302 780,698 698,780 302,780 220,698 220,302" />
            <polygon points="373,320 627,320 680,373 680,627 627,680 373,680 320,627 320,373" />
            <polygon points="436,410 564,410 590,436 590,564 564,590 436,590 410,564 410,436" />
          </g>
          <g stroke="#FFFFFF" strokeOpacity="0.015" strokeWidth="1">
            <line x1="0" y1="80" x2="1000" y2="80"/><line x1="0" y1="160" x2="1000" y2="160"/><line x1="0" y1="240" x2="1000" y2="240"/><line x1="0" y1="320" x2="1000" y2="320"/><line x1="0" y1="400" x2="1000" y2="400"/><line x1="0" y1="480" x2="1000" y2="480"/><line x1="0" y1="560" x2="1000" y2="560"/><line x1="0" y1="640" x2="1000" y2="640"/><line x1="0" y1="720" x2="1000" y2="720"/><line x1="0" y1="800" x2="1000" y2="800"/><line x1="0" y1="880" x2="1000" y2="880"/><line x1="0" y1="960" x2="1000" y2="960"/>
          </g>
        </svg>
      </div>
      <div className="auth-topbar" aria-hidden="true" />
      <div className="auth-bottombar" aria-hidden="true" />
      <div className="auth-wordmark"><span className="auth-wordmark-text">Ground <span className="auth-amp">&amp;</span> Pound</span></div>
      <div className="auth-center">
        <div className="auth-title-block">
          <div className="auth-title-eyebrow">{t("auth.eyebrow")}</div>
          <h1 className="auth-title-main">Ground<span className="auth-amp">&amp;</span>Pound</h1>
          <div className="auth-title-divider" />
        </div>
        <div className="auth-container">
          {onBack && (
            <button type="button" className="auth-form-link" style={{ marginBottom: "12px", display: "block" }} onClick={onBack}>
              ← Back
            </button>
          )}
          {tab !== "forgot" && (
            <div className="auth-tabs">
              <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => switchTab("login")}>{t("auth.tabs.login")}</button>
              <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => switchTab("register")}>{t("auth.tabs.createAccount")}</button>
            </div>
          )}
          <div className="auth-form-body">
            {/* LOGIN */}
            {tab === "login" && (
              <form className="auth-form" onSubmit={handleLogin} autoComplete="on">
                <div className="auth-field"><label>{t("auth.login.emailLabel")}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t("auth.login.emailPlaceholder")} required autoComplete="email" /></div>
                <div className="auth-field"><label>{t("auth.login.passwordLabel")}</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t("auth.login.passwordPlaceholder")} required autoComplete="current-password" /></div>
                {error && <div className="auth-error">{error}</div>}
                {recoverInfo && (
                  <div className="auth-recover-banner">
                    <div className="auth-recover-text">
                      {t("auth.recover.scheduledDeletion")}
                      {recoverInfo.daysLeft
                        ? <> — <strong>{recoverInfo.daysLeft === 1
                            ? t("auth.recover.daysLeft", { n: recoverInfo.daysLeft })
                            : t("auth.recover.daysLeftPlural", { n: recoverInfo.daysLeft })
                          }</strong></>
                        : null}.
                      {" "}{t("auth.recover.recoverPrompt")}
                    </div>
                    <button type="button" className="auth-recover-btn" onClick={handleRecover} disabled={recovering || !email || !password}>
                      {recovering ? t("auth.recover.recovering") : t("auth.recover.recoverBtn")}
                    </button>
                  </div>
                )}
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? t("auth.login.submitting") : t("auth.login.submit")}</button>
                <div className="auth-form-links">
                  <button type="button" className="auth-form-link" onClick={() => switchTab("forgot")}>{t("auth.login.forgotPassword")}</button>
                  <span>{t("auth.login.noAccount")} <button type="button" className="auth-form-link" onClick={() => switchTab("register")}>{t("auth.login.createOne")}</button></span>
                </div>
              </form>
            )}

            {/* FORGOT */}
            {tab === "forgot" && (
              <ForgotPasswordFlow
                token={resetToken}
                onCancel={() => switchTab("login")}
                onResetSuccess={() => {
                  // Clean the URL so the token doesn't get re-applied if the user reloads.
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("reset_password_token");
                    window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
                  } catch (_) {}
                  switchTab("login");
                }}
              />
            )}

            {/* REGISTER step 1 */}
            {tab === "register" && step === 1 && (
              <form className="auth-form" onSubmit={handleAccountNext} autoComplete="on">
                <div className="auth-step-label">{t("auth.register.step1Label")}</div>
                <div className="auth-field"><label>{t("auth.register.emailLabel")}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t("auth.register.emailPlaceholder")} required autoComplete="email" /></div>
                <div className="auth-field"><label>{t("auth.register.passwordLabel")} <span className="auth-hint">{t("auth.register.passwordHint")}</span></label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t("auth.register.passwordPlaceholder")} required autoComplete="new-password" /></div>
                <div className="auth-field"><label>{t("auth.register.confirmPasswordLabel")}</label><input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder={t("auth.register.confirmPasswordPlaceholder")} required autoComplete="new-password" /></div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "#999", margin: "2px 0 6px", cursor: "pointer", lineHeight: 1.4 }}>
                  <input type="checkbox" checked={ageConfirmed} onChange={e => setAgeConfirmed(e.target.checked)} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <span>{t("auth.register.ageConfirmLabel")}</span>
                </label>
                {error && <div className="auth-error">{error}</div>}
                <button className="auth-submit" type="submit">{t("auth.register.nextBtn")}</button>
                <p className="auth-switch">{t("auth.register.alreadyHaveAccount")} <button type="button" className="auth-link" onClick={() => switchTab("login")}>{t("auth.register.signIn")}</button></p>
              </form>
            )}

            {/* REGISTER step 2 */}
            {tab === "register" && step === 2 && (
              <form className="auth-form" onSubmit={handleRegister}>
                <div className="auth-step-label">{t("auth.register.step2Label")}</div>
                <FighterFields
                  firstName={firstName} setFirstName={setFirstName}
                  lastName={lastName} setLastName={setLastName}
                  nickname={nickname} setNickname={setNickname}
                  weightClass={weightClass} setWeightClass={setWeightClass}
                  style={style} setStyle={setStyle}
                  backstory={backstory} setBackstory={setBackstory}
                />
                {error && <div className="auth-error">{error}</div>}
                <div className="auth-row auth-row-btns">
                  <button type="button" className="auth-back" onClick={() => { setStep(1); setError(""); }}>{t("auth.register.backBtn")}</button>
                  <button className="auth-submit auth-submit-create" type="submit" disabled={loading}>{loading ? t("auth.register.creating") : t("auth.register.createBtn")}</button>
                </div>
              </form>
            )}

            {/* GUEST — "Play as guest" */}
            {tab === "guest" && (
              <GuestStart
                onAuthenticated={onAuthenticated}
                onCancel={() => switchTab("login")}
              />
            )}

            {/* RESUME — "Resume with a recovery code" */}
            {tab === "resume" && (
              <ResumeWithCode
                onAuthenticated={onAuthenticated}
                onCancel={() => switchTab("login")}
              />
            )}
          </div>
        </div>
        {tab !== "forgot" && tab !== "guest" && tab !== "resume" && (
          <div className="auth-guest-links">
            <button type="button" className="auth-form-link auth-guest-cta" onClick={() => switchTab("guest")}>
              {t("auth.guest.playAsGuestCta")}
            </button>
            <button type="button" className="auth-form-link auth-resume-cta" onClick={() => switchTab("resume")}>
              {t("auth.guest.resumeWithCodeCta")}
            </button>
          </div>
        )}
      </div>
      <div className="auth-beta">{t("auth.beta")}</div>
      <div className="auth-cookie-link">
        <button
          type="button"
          className="auth-form-link"
          onClick={() => window.dispatchEvent(new CustomEvent("open-cookie-policy"))}
        >
          {t("auth.cookiePolicy")}
        </button>
        <span className="auth-copyright">{t("auth.copyright", { year: new Date().getFullYear() })}</span>
      </div>
      <CookieConsent />
    </div>
  );
}
