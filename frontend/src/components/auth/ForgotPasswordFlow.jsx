import { useEffect, useState } from "react";
import { api } from "../../api";

/**
 * Two-mode unauthenticated password-reset flow.
 *
 *   Mode A — request:   user clicks "Forgot password?" on the auth page.
 *                       They enter their email, we always return success
 *                       (server-side rate-limited, doesn't confirm or deny
 *                       account existence — see authController.forgotPassword).
 *
 *   Mode B — apply:     user arrives via the email link with `?reset_password_token=...`
 *                       in the URL. We validate the token, show new/confirm fields,
 *                       call POST /auth/reset-password, then bounce them to login.
 *
 * The parent (AuthPage / App) decides which mode by passing `token` (or omitting it).
 */
export function ForgotPasswordFlow({ token, onCancel, onResetSuccess }) {
    const mode = token ? "apply" : "request";
    return mode === "apply"
        ? <ApplyReset token={token} onResetSuccess={onResetSuccess} onCancel={onCancel} />
        : <RequestReset onCancel={onCancel} />;
}

// ─────────────────────────────────────────────────────────────
// Mode A — request a reset email
// ─────────────────────────────────────────────────────────────

function RequestReset({ onCancel }) {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());

    const submit = async (e) => {
        e.preventDefault();
        if (!valid) { setError("Enter a valid email address."); return; }
        setBusy(true); setError("");
        try {
            await api.forgotPassword(email.trim().toLowerCase());
            setSent(true);
        } catch (err) {
            // The server intentionally always returns 200 to avoid confirming
            // account existence; a 4xx/5xx means a rate-limit or transport
            // error, not a "wrong email." Show the message verbatim.
            setError(err.message || "Could not request a reset.");
        }
        setBusy(false);
    };

    return (
        <form className="auth-form" onSubmit={submit} autoComplete="on">
            <div className="auth-step-label">Reset your password</div>

            {sent ? (
                <>
                    <div className="auth-success">
                        If an account exists for that email, we&apos;ve sent a reset link.
                        Check your inbox and follow the link to choose a new password.
                    </div>
                    <button type="button" className="auth-submit" onClick={onCancel}>
                        Back to login
                    </button>
                </>
            ) : (
                <>
                    <p className="auth-desc">
                        Enter the email associated with your account and we&apos;ll send a
                        reset link. The link expires in 1 hour.
                    </p>
                    <div className="auth-field">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="fighter@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>
                    {error && <div className="auth-error">{error}</div>}
                    <button className="auth-submit" type="submit" disabled={!valid || busy}>
                        {busy ? "Sending…" : "Send reset link"}
                    </button>
                    <p className="auth-switch">
                        <button type="button" className="auth-link" onClick={onCancel}>
                            ← Back to login
                        </button>
                    </p>
                </>
            )}
        </form>
    );
}

// ─────────────────────────────────────────────────────────────
// Mode B — apply the reset (came from email link)
// ─────────────────────────────────────────────────────────────

function ApplyReset({ token, onResetSuccess, onCancel }) {
    const [checking, setChecking] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await api.checkResetToken(token);
                if (!cancelled) setTokenValid(true);
            } catch (e) {
                if (!cancelled) setError(e.message || "This reset link is invalid or has expired.");
            }
            if (!cancelled) setChecking(false);
        })();
        return () => { cancelled = true; };
    }, [token]);

    const nextValid = next.length >= 8 && /[0-9]/.test(next);
    const matches   = next.length > 0 && next === confirm;
    const canSubmit = tokenValid && nextValid && matches && !busy;

    const submit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true); setError("");
        try {
            await api.resetPassword(token, next);
            setDone(true);
        } catch (err) {
            setError(err.message || "Could not reset password.");
        }
        setBusy(false);
    };

    if (checking) {
        return (
            <form className="auth-form">
                <div className="auth-step-label">Reset your password</div>
                <p className="auth-desc">Checking your reset link…</p>
            </form>
        );
    }

    if (!tokenValid) {
        return (
            <form className="auth-form">
                <div className="auth-step-label">Reset your password</div>
                <div className="auth-error">{error || "This reset link is invalid or has expired."}</div>
                <button type="button" className="auth-submit" onClick={onCancel}>
                    Request a new link
                </button>
            </form>
        );
    }

    if (done) {
        return (
            <form className="auth-form">
                <div className="auth-step-label">Password updated</div>
                <div className="auth-success">
                    Your password has been updated. You can now log in with your new password.
                </div>
                <button type="button" className="auth-submit" onClick={onResetSuccess}>
                    Go to login
                </button>
            </form>
        );
    }

    let inlineError = null;
    if (next.length > 0 && !nextValid) inlineError = "Min 8 characters and at least one number.";
    else if (confirm.length > 0 && !matches) inlineError = "Passwords don't match.";

    return (
        <form className="auth-form" onSubmit={submit} autoComplete="off">
            <div className="auth-step-label">Choose a new password</div>
            <div className="auth-field">
                <label>New password <span className="auth-hint">(min 8 chars, one number)</span></label>
                <input
                    type={show ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                />
            </div>
            <div className="auth-field">
                <label>Confirm new password</label>
                <input
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                />
            </div>
            <label className="auth-show-pw">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
                Show passwords
            </label>
            {(inlineError || error) && <div className="auth-error">{inlineError || error}</div>}
            <button className="auth-submit" type="submit" disabled={!canSubmit}>
                {busy ? "Updating…" : "Update password"}
            </button>
            <p className="auth-switch">
                <button type="button" className="auth-link" onClick={onCancel}>
                    ← Back to login
                </button>
            </p>
        </form>
    );
}
