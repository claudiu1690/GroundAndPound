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
      {/* Background octagon */}
      <div className="auth-bg" aria-hidden="true" />

      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-gp">G&amp;P</span>
          <div className="auth-logo-sub">GROUND &amp; POUND</div>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => switchTab("login")}
          >Login</button>
          <button
            className={`auth-tab ${tab === "register" ? "active" : ""}`}
            onClick={() => switchTab("register")}
          >Create Account</button>
        </div>

        {/* ── LOGIN ── */}
        {tab === "login" && (
          <form className="auth-form" onSubmit={handleLogin} autoComplete="on">
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="fighter@example.com" required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            {recoverInfo && (
              <div className="auth-recover-banner">
                <div className="auth-recover-text">
                  Your account is scheduled for deletion
                  {recoverInfo.daysLeft ? <> — <strong>{recoverInfo.daysLeft} day{recoverInfo.daysLeft === 1 ? "" : "s"} left</strong></> : null}.
                  Recover it now to keep your fighter and progress.
                </div>
                <button
                  type="button"
                  className="auth-recover-btn"
                  onClick={handleRecover}
                  disabled={recovering || !email || !password}
                >
                  {recovering ? "Recovering…" : "Recover account"}
                </button>
              </div>
            )}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Enter the Cage"}
            </button>
            <p className="auth-switch">
              <button type="button" className="auth-link" onClick={() => switchTab("forgot")}>
                Forgot password?
              </button>
            </p>
            <p className="auth-switch">
              No account?{" "}
              <button type="button" className="auth-link" onClick={() => switchTab("register")}>
                Create one
              </button>
            </p>
          </form>
        )}

        {/* ── FORGOT PASSWORD ── */}
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

        {/* ── REGISTER step 1: Account ── */}
        {tab === "register" && step === 1 && (
          <form className="auth-form" onSubmit={handleAccountNext} autoComplete="on">
            <div className="auth-step-label">Step 1 of 2 — Create your account</div>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="fighter@example.com" required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label>Password <span className="auth-hint">(min 6 characters)</span></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="new-password" />
            </div>
            <div className="auth-field">
              <label>Confirm Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••" required autoComplete="new-password" />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" type="submit">Next — Build your fighter →</button>
            <p className="auth-switch">
              Already have an account?{" "}
              <button type="button" className="auth-link" onClick={() => switchTab("login")}>Sign in</button>
            </p>
          </form>
        )}

        {/* ── REGISTER step 2: Fighter creation ── */}
        {tab === "register" && step === 2 && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-step-label">Step 2 of 2 — Build your fighter</div>

            <div className="auth-row">
              <div className="auth-field">
                <label>First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Conor" required />
              </div>
              <div className="auth-field">
                <label>Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="McGregor" required />
              </div>
            </div>

            <div className="auth-field">
              <label>Nickname <span className="auth-hint">(optional)</span></label>
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                placeholder="The Notorious" />
            </div>

            <div className="auth-row">
              <div className="auth-field">
                <label>Weight Class</label>
                <select value={weightClass} onChange={e => setWeightClass(e.target.value)}>
                  {WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}
                </select>
              </div>
              <div className="auth-field">
                <label>Fighting Style</label>
                <select value={style} onChange={e => setStyle(e.target.value)}>
                  {STYLES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Style description */}
            <div className="auth-desc">{STYLE_DESC[style]}</div>

            <div className="auth-field">
              <label>Backstory</label>
              <select value={backstory} onChange={e => setBackstory(e.target.value)}>
                {BACKSTORIES.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>

            {/* Backstory description */}
            <div className="auth-desc">{BACKSTORY_DESC[backstory]}</div>

            {error && <div className="auth-error">{error}</div>}

            <div className="auth-row auth-row-btns">
              <button type="button" className="auth-back" onClick={() => { setStep(1); setError(""); }}>
                ← Back
              </button>
              <button className="auth-submit auth-submit-create" type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create Fighter & Start"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
