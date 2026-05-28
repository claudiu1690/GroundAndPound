import { memo, useCallback, useEffect, useState } from "react";
import { api, authStorage } from "../../api";
import { DeleteAccountModal } from "./DeleteAccountModal";

/**
 * Account settings page. Six sections, single scrollable layout (no tabs):
 *   1. Fighter Info (read-only — nickname is the only editable field, in §2)
 *   2. Change Nickname
 *   3. Change Email
 *   4. Change Password
 *   5. Email Notifications
 *   6. Danger Zone (delete + logout)
 */
export function AccountTab({ onMessage, onLogout, onFighterRefresh }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const accountId = profile?.accountId;

    const reload = useCallback(async () => {
        try {
            const res = await api.getAccountProfile(profile?.accountId || decodeAccountIdFromToken());
            setProfile(res);
        } catch (e) {
            onMessage?.(e.message || "Could not load account");
        } finally {
            setLoading(false);
        }
    }, [profile?.accountId, onMessage]);

    useEffect(() => {
        const id = decodeAccountIdFromToken();
        if (!id) {
            setLoading(false);
            return;
        }
        (async () => {
            try {
                const res = await api.getAccountProfile(id);
                setProfile(res);
            } catch (e) {
                onMessage?.(e.message || "Could not load account");
            } finally {
                setLoading(false);
            }
        })();
    }, [onMessage]);

    if (loading) return <div className="account-loading">Loading account…</div>;
    if (!profile) return <div className="account-error">Account unavailable.</div>;

    return (
        <div className="account-tab">
            <header className="account-header">
                <h2 className="account-title">Account</h2>
                <p className="account-subtitle">Manage your credentials, email, and account lifecycle.</p>
            </header>

            <FighterInfo profile={profile} />

            <ChangeNickname
                profile={profile}
                accountId={accountId}
                onSaved={async (newNick) => {
                    setProfile((p) => p ? { ...p, fighter: { ...p.fighter, nickname: newNick } } : p);
                    onMessage?.("Nickname updated.");
                    // Sync the fighter doc in the parent so the sidebar profile reflects it.
                    if (onFighterRefresh && profile.fighter?.id) onFighterRefresh(profile.fighter.id);
                }}
                onMessage={onMessage}
            />

            <ChangeEmail
                profile={profile}
                accountId={accountId}
                onChanged={reload}
                onMessage={onMessage}
            />

            <ChangePassword
                accountId={accountId}
                onMessage={onMessage}
            />

            <NotificationsSection
                profile={profile}
                accountId={accountId}
                onSaved={(emailEnabled) => {
                    setProfile((p) => p ? { ...p, notifications: { ...p.notifications, emailEnabled } } : p);
                }}
                onMessage={onMessage}
            />

            <DangerZone
                onLogoutClick={onLogout}
                onDeleteClick={() => setDeleteOpen(true)}
            />

            <DeleteAccountModal
                open={deleteOpen}
                accountId={accountId}
                fighterFullName={profile.fighter?.fullName || ""}
                onClose={() => setDeleteOpen(false)}
                onDeleted={() => {
                    onMessage?.("Your account has been deleted.");
                    onLogout?.();
                }}
                onMessage={onMessage}
            />
        </div>
    );
}
export default memo(AccountTab);

// ─────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────

function FighterInfo({ profile }) {
    const f = profile.fighter;
    if (!f) return null;
    return (
        <Section title="Fighter Info" subtitle="Fighter name, weight class and backstory are permanent and cannot be changed.">
            <div className="account-info-grid">
                <InfoRow label="Fighter name"  value={f.fullName}    permanent />
                <InfoRow label="Nickname"      value={f.nickname || "—"} />
                <InfoRow label="Weight class"  value={f.weightClass} permanent />
                <InfoRow label="Style"         value={f.style}       permanent />
                <InfoRow label="Backstory"     value={f.backstory || "—"} permanent />
            </div>
        </Section>
    );
}

function InfoRow({ label, value, permanent }) {
    return (
        <div className="account-info-row">
            <span className="account-info-label">{label}</span>
            <span className="account-info-value">
                {value}
                {permanent && <span className="account-info-permanent">permanent</span>}
            </span>
        </div>
    );
}

function ChangeNickname({ profile, accountId, onSaved, onMessage }) {
    const [value, setValue] = useState(profile.fighter?.nickname || "");
    const [busy, setBusy] = useState(false);
    const original = profile.fighter?.nickname || "";
    const trimmed = value.trim();
    const dirty = trimmed !== original;
    const tooShort = trimmed.length < 2;
    const tooLong = trimmed.length > 20;
    const invalidChars = trimmed.length > 0 && !/^[a-zA-Z0-9\-' ]+$/.test(trimmed);
    const canSave = dirty && !tooShort && !tooLong && !invalidChars && !busy;

    const save = async () => {
        if (!canSave) return;
        setBusy(true);
        try {
            const res = await api.changeNickname(accountId, trimmed);
            onSaved?.(res.nickname);
        } catch (e) {
            onMessage?.(e.message || "Could not update nickname");
        }
        setBusy(false);
    };

    let hint = null;
    if (tooShort && trimmed.length > 0) hint = "Minimum 2 characters.";
    else if (tooLong) hint = "Maximum 20 characters.";
    else if (invalidChars) hint = "Letters, numbers, spaces, hyphens, apostrophes only.";

    return (
        <Section title="Change Nickname">
            <div className="account-field-row">
                <input
                    type="text"
                    className="account-input"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    maxLength={20}
                    placeholder="The Surgeon"
                />
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={save}
                    disabled={!canSave}
                >
                    {busy ? "Saving…" : "Save"}
                </button>
            </div>
            <div className="account-field-meta">
                <span className={`account-char-count ${tooLong ? "neg" : ""}`}>{trimmed.length} / 20</span>
                {hint && <span className="account-hint-neg">{hint}</span>}
            </div>
        </Section>
    );
}

function ChangeEmail({ profile, accountId, onChanged, onMessage }) {
    const [newEmail, setNewEmail] = useState("");
    const [busy, setBusy] = useState(false);
    // Cooldown countdown for the Resend button (in seconds remaining).
    //   • Seeded from `profile.emailResendCooldown` so reloading the page keeps
    //     the timer accurate based on when the server last sent.
    //   • Bumped to 60 after each successful initial-request or resend.
    //   • Bumped to `err.retryAfter` if the server says we're still cooling.
    const [resendIn, setResendIn] = useState(profile.emailResendCooldown || 0);
    const pending = profile.emailPending;
    const masked = maskEmail(profile.email);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim().toLowerCase());
    const dirty = valid && newEmail.trim().toLowerCase() !== profile.email;

    // Tick down once a second while a cooldown is active. The interval clears
    // itself when it hits zero so we're not eating a setInterval forever.
    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setInterval(() => {
            setResendIn((n) => (n <= 1 ? 0 : n - 1));
        }, 1000);
        return () => clearInterval(t);
    }, [resendIn]);

    // When the parent reload swaps in a fresh profile (e.g. after cancel), pick
    // up the new server-side cooldown value (usually 0).
    useEffect(() => {
        setResendIn(profile.emailResendCooldown || 0);
    }, [profile.emailResendCooldown, profile.emailPending]);

    const request = async () => {
        if (!dirty) return;
        setBusy(true);
        try {
            await api.requestEmailChange(accountId, newEmail.trim().toLowerCase());
            onMessage?.(`A confirmation link has been sent to ${newEmail.trim().toLowerCase()}.`);
            setNewEmail("");
            setResendIn(60); // arm cooldown immediately — server stamps the same
            await onChanged?.();
        } catch (e) {
            onMessage?.(e.message || "Could not request email change");
        }
        setBusy(false);
    };
    const resend = async () => {
        if (resendIn > 0) return;
        setBusy(true);
        try {
            await api.resendEmailChange(accountId);
            onMessage?.("Confirmation link sent again.");
            setResendIn(60);
        } catch (e) {
            // Race: clicked the moment the local timer ran out but the server
            // hasn't ticked over yet. Honour the server's authoritative wait.
            if (e.code === "cooldown_active" && e.retryAfter) {
                setResendIn(e.retryAfter);
                onMessage?.(`Please wait ${e.retryAfter}s before requesting another link.`);
            } else {
                onMessage?.(e.message || "Could not resend");
            }
        }
        setBusy(false);
    };
    const cancel = async () => {
        setBusy(true);
        try {
            await api.cancelEmailChange(accountId);
            onMessage?.("Email change cancelled.");
            setResendIn(0);
            await onChanged?.();
        } catch (e) {
            onMessage?.(e.message || "Could not cancel");
        }
        setBusy(false);
    };

    return (
        <Section title="Change Email">
            <div className="account-current">Current: <strong>{masked}</strong></div>
            {pending ? (
                <div className="account-pending-banner">
                    <div>
                        Pending confirmation at <strong>{pending}</strong>. Check that inbox for the link.
                    </div>
                    <div className="account-pending-actions">
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={resend}
                            disabled={busy || resendIn > 0}
                            title={resendIn > 0 ? `Wait ${resendIn}s before sending another link` : undefined}
                        >
                            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend link"}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={busy}>Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="account-field-row">
                    <input
                        type="email"
                        className="account-input"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="new@example.com"
                        autoComplete="email"
                    />
                    <button type="button" className="btn btn-primary" onClick={request} disabled={!dirty || busy}>
                        {busy ? "Sending…" : "Save"}
                    </button>
                </div>
            )}
        </Section>
    );
}

function ChangePassword({ accountId, onMessage }) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showAll, setShowAll] = useState(false);
    const [busy, setBusy] = useState(false);

    const nextValid = next.length >= 8 && /[0-9]/.test(next);
    const matches = next.length > 0 && next === confirm;
    const canSave = current.length > 0 && nextValid && matches && !busy;

    let inlineError = null;
    if (next.length > 0 && !nextValid) inlineError = "New password needs ≥ 8 characters and at least one number.";
    else if (confirm.length > 0 && !matches) inlineError = "New passwords don't match.";

    const save = async () => {
        if (!canSave) return;
        setBusy(true);
        try {
            const res = await api.changePassword(accountId, current, next);
            // Server returns a fresh JWT — replace the stored one or the next
            // protected request will 401 due to the sessionEpoch bump.
            if (res.token) {
                const fighterId = authStorage.getFighterId();
                authStorage.save(res.token, fighterId);
            }
            setCurrent(""); setNext(""); setConfirm("");
            onMessage?.("Password updated.");
        } catch (e) {
            if (e.code === "incorrect_password") {
                onMessage?.("Current password is incorrect.");
            } else {
                onMessage?.(e.message || "Could not update password");
            }
        }
        setBusy(false);
    };

    return (
        <Section title="Change Password">
            <div className="account-pw-grid">
                <PasswordInput value={current} onChange={setCurrent} placeholder="Current password" show={showAll} />
                <PasswordInput value={next}    onChange={setNext}    placeholder="New password"     show={showAll} />
                <PasswordInput value={confirm} onChange={setConfirm} placeholder="Confirm new"      show={showAll} />
            </div>
            <div className="account-field-meta">
                <label className="account-pw-toggle">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                    Show passwords
                </label>
                <span className="account-pw-rule">Min 8 chars, at least one number.</span>
            </div>
            {inlineError && <div className="account-hint-neg">{inlineError}</div>}
            <div className="account-field-row">
                <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
                    {busy ? "Updating…" : "Update password"}
                </button>
            </div>
        </Section>
    );
}

function PasswordInput({ value, onChange, placeholder, show }) {
    return (
        <input
            type={show ? "text" : "password"}
            className="account-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="new-password"
        />
    );
}

function NotificationsSection({ profile, accountId, onSaved, onMessage }) {
    const enabled = profile.notifications?.emailEnabled !== false;
    const toggle = async () => {
        const next = !enabled;
        try {
            await api.setEmailNotifications(accountId, next);
            onSaved?.(next);
            onMessage?.(next ? "Email notifications enabled." : "Email notifications disabled.");
        } catch (e) {
            onMessage?.(e.message || "Could not update");
        }
    };
    return (
        <Section title="Notifications">
            <div className="account-toggle-row">
                <div>
                    <div className="account-toggle-label">Email Notifications</div>
                    <div className="account-toggle-sub">Receive email updates about your account and career.</div>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={toggle}
                    className={`account-switch ${enabled ? "account-switch-on" : ""}`}
                >
                    <span className="account-switch-thumb" />
                </button>
            </div>
        </Section>
    );
}

function DangerZone({ onLogoutClick, onDeleteClick }) {
    return (
        <Section title="Danger Zone" className="account-section-danger">
            <div className="account-danger-row">
                <div>
                    <div className="account-danger-label">Log out of this device</div>
                    <div className="account-danger-sub">Clears your session here. You can log back in any time.</div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={onLogoutClick}>Log Out</button>
            </div>
            <div className="account-danger-row">
                <div>
                    <div className="account-danger-label danger">Delete account</div>
                    <div className="account-danger-sub">Permanently deletes your fighter, all progress, iron, and career history.</div>
                </div>
                <button type="button" className="btn btn-danger" onClick={onDeleteClick}>Delete Account</button>
            </div>
        </Section>
    );
}

// ─────────────────────────────────────────────────────────────
// Generic section shell
// ─────────────────────────────────────────────────────────────

function Section({ title, subtitle, children, className = "" }) {
    return (
        <section className={`account-section ${className}`}>
            <header className="account-section-head">
                <h3 className="account-section-title">{title}</h3>
                {subtitle && <p className="account-section-subtitle">{subtitle}</p>}
            </header>
            <div className="account-section-body">{children}</div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function maskEmail(email) {
    if (!email) return "—";
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const masked = local.length <= 1 ? local : local[0] + "***";
    return `${masked}@${domain}`;
}

/** Decode the JWT in localStorage to get the account id without a round-trip. */
function decodeAccountIdFromToken() {
    try {
        const token = authStorage.getToken();
        if (!token) return null;
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload?.id || null;
    } catch (_) {
        return null;
    }
}
