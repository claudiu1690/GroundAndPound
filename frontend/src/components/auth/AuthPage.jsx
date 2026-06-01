import { useState } from "react";
import { api, authStorage } from "../../api";
import { ForgotPasswordFlow } from "./ForgotPasswordFlow";

const WEIGHT_CLASSES = ["Featherweight", "Lightweight", "Middleweight", "Heavyweight"];
const STYLES = ["Boxer", "Kickboxer", "Wrestler", "Brazilian Jiu-Jitsu", "Muay Thai", "Judo", "Sambo", "Capoeira"];
const BACKSTORIES = ["Street Fighter", "College Wrestler", "Kickboxing Champion", "Army Veteran", "MMA Prodigy", "Late Bloomer"];

const STYLE_DESC = {
  "Boxer":               "Precise striking, footwork and evasion. Primary stats: STR, SPD, CHN.",
  "Kickboxer":           "Explosive combinations on the feet. Primary stats: STR, SPD, LEG.",
  "Wrestler":            "Dominant takedowns and cage control. Primary stats: WRE, GND, STR.",
  "Brazilian Jiu-Jitsu": "Ground specialist with elite submissions. Primary stats: GND, SUB, WRE.",
  "Muay Thai":           "Eight-limb striker, devastating clinch. Primary stats: STR, LEG, SPD.",
  "Judo":                "Explosive throws into top position. Primary stats: WRE, GND, STR.",
  "Sambo":               "Hybrid wrestling and submission grappler. Primary stats: WRE, SUB, GND.",
  "Capoeira":            "Unpredictable movement and speed. Primary stats: SPD, LEG, FIQ.",
};

const BACKSTORY_DESC = {
  "Street Fighter":        "+5 CHN — Tougher chin, survived hard knocks.",
  "College Wrestler":      "+8 WRE — Solid wrestling base before turning pro.",
  "Kickboxing Champion":   "+6 STR, +4 LEG — Seasoned on the feet.",
  "Army Veteran":          "+10 Max Stamina — Iron conditioning from service.",
  "MMA Prodigy":           "+2 to all stats — Born for this sport.",
  "Late Bloomer":          "+25% training XP — A slow start, explosive ceiling.",
};

export function AuthPage({ onAuthenticated, initialResetToken = null }) {
  const [tab, setTab] = useState(initialResetToken ? "forgot" : "login"); // "login" | "register" | "forgot"
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
    setEmail(""); setPassword(""); setConfirmPw("");
    setFirstName(""); setLastName(""); setNickname("");
    setWeightClass(WEIGHT_CLASSES[2]); setStyle(STYLES[0]); setBackstory(BACKSTORIES[0]);
    setError(""); setStep(1); setRecoverInfo(null);
  }

  function switchTab(t) { setTab(t); setResetToken(null); resetForm(); }

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
      setError(err.message || "Could not recover account.");
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
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 6)   return setError("Password must be at least 6 characters.");
    if (password !== confirmPw) return setError("Passwords do not match.");
    setStep(2);
  }

  // ── Register step 2 — create account + fighter ───────────
  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return setError("First and last name are required.");
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
          <div className="auth-title-eyebrow">Step into the cage</div>
          <h1 className="auth-title-main">Ground<span className="auth-amp">&amp;</span>Pound</h1>
          <div className="auth-title-divider" />
        </div>
        <div className="auth-container">
          {tab !== "forgot" && (
            <div className="auth-tabs">
              <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => switchTab("login")}>Login</button>
              <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => switchTab("register")}>Create Account</button>
            </div>
          )}
          <div className="auth-form-body">
            {/* LOGIN */}
            {tab === "login" && (
              <form className="auth-form" onSubmit={handleLogin} autoComplete="on">
                <div className="auth-field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="fighter@example.com" required autoComplete="email" /></div>
                <div className="auth-field"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" /></div>
                {error && <div className="auth-error">{error}</div>}
                {recoverInfo && (
                  <div className="auth-recover-banner">
                    <div className="auth-recover-text">
                      Your account is scheduled for deletion
                      {recoverInfo.daysLeft ? <> — <strong>{recoverInfo.daysLeft} day{recoverInfo.daysLeft === 1 ? "" : "s"} left</strong></> : null}.
                      Recover it now to keep your fighter and progress.
                    </div>
                    <button type="button" className="auth-recover-btn" onClick={handleRecover} disabled={recovering || !email || !password}>
                      {recovering ? "Recovering…" : "Recover account"}
                    </button>
                  </div>
                )}
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Signing in…" : "Enter the Cage"}</button>
                <div className="auth-form-links">
                  <button type="button" className="auth-form-link" onClick={() => switchTab("forgot")}>Forgot password?</button>
                  <span>No account? <button type="button" className="auth-form-link" onClick={() => switchTab("register")}>Create one</button></span>
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
                <div className="auth-step-label">Step 1 of 2 — Create your account</div>
                <div className="auth-field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="fighter@example.com" required autoComplete="email" /></div>
                <div className="auth-field"><label>Password <span className="auth-hint">(min 6 characters)</span></label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" /></div>
                <div className="auth-field"><label>Confirm Password</label><input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" required autoComplete="new-password" /></div>
                {error && <div className="auth-error">{error}</div>}
                <button className="auth-submit" type="submit">Next — Build your fighter →</button>
                <p className="auth-switch">Already have an account? <button type="button" className="auth-link" onClick={() => switchTab("login")}>Sign in</button></p>
              </form>
            )}

            {/* REGISTER step 2 */}
            {tab === "register" && step === 2 && (
              <form className="auth-form" onSubmit={handleRegister}>
                <div className="auth-step-label">Step 2 of 2 — Build your fighter</div>
                <div className="auth-row">
                  <div className="auth-field"><label>First Name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Conor" required /></div>
                  <div className="auth-field"><label>Last Name</label><input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="McGregor" required /></div>
                </div>
                <div className="auth-field"><label>Nickname <span className="auth-hint">(optional)</span></label><input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="The Notorious" /></div>
                <div className="auth-row">
                  <div className="auth-field"><label>Weight Class</label><select value={weightClass} onChange={e => setWeightClass(e.target.value)}>{WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}</select></div>
                  <div className="auth-field"><label>Fighting Style</label><select value={style} onChange={e => setStyle(e.target.value)}>{STYLES.map(s => <option key={s}>{s}</option>)}</select></div>
                </div>
                <div className="auth-desc">{STYLE_DESC[style]}</div>
                <div className="auth-field"><label>Backstory</label><select value={backstory} onChange={e => setBackstory(e.target.value)}>{BACKSTORIES.map(b => <option key={b}>{b}</option>)}</select></div>
                <div className="auth-desc">{BACKSTORY_DESC[backstory]}</div>
                {error && <div className="auth-error">{error}</div>}
                <div className="auth-row auth-row-btns">
                  <button type="button" className="auth-back" onClick={() => { setStep(1); setError(""); }}>← Back</button>
                  <button className="auth-submit auth-submit-create" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Fighter & Start"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
      <div className="auth-beta">Beta</div>
    </div>
  );
}
