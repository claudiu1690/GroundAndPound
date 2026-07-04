import { memo, useCallback, useEffect, useState } from "react";
import { Lock, Pencil, Mail, Key, Bell, Trash2, LogOut } from "lucide-react";
import { api, authStorage } from "../../api";
import { DeleteAccountModal } from "./DeleteAccountModal";
import { GuestClaimPanel } from "./GuestClaimPanel";
import { GuestRecoverySection } from "./GuestRecoverySection";
import { t } from "../../lib/i18n";

/**
 * Account settings page. Six sections, single scrollable layout (no tabs):
 *   1. Fighter Info (read-only — nickname is the only editable field, in §2)
 *   2. Change Nickname
 *   3. Change Email
 *   4. Change Password
 *   5. Email Notifications
 *   6. Danger Zone (delete + logout)
 */
export function AccountTab({ onMessage, onLogout, onFighterRefresh, onAccountStatusRefresh }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const accountId = profile?.accountId;

    const reload = useCallback(async () => {
        try {
            const res = await api.getAccountProfile(profile?.accountId || decodeAccountIdFromToken());
            setProfile(res);
            // Let the app shell refresh its top-bar banner state (isGuest /
            // emailConfirmed) immediately — most relevant right after a guest
            // claims an email, so GuestBanner ↔ EmailVerifyBanner swap without
            // waiting for the next unrelated reload.
            onAccountStatusRefresh?.();
        } catch (e) {
            onMessage?.(e.message || t("account.unavailable"));
        } finally {
            setLoading(false);
        }
    }, [profile?.accountId, onMessage, onAccountStatusRefresh]);

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
                onMessage?.(e.message || t("account.unavailable"));
            } finally {
                setLoading(false);
            }
        })();
    }, [onMessage]);

    if (loading) return <div className="account-loading">{t("account.loading")}</div>;
    if (!profile) return <div className="account-error">{t("account.unavailable")}</div>;

    return (
        <div className="account-tab">
            <header className="page-header">
                <div className="page-eyebrow">{t("account.settings.eyebrow")}</div>
                <h2 className="page-title">{t("account.settings.title")}</h2>
                <p className="page-sub">{t("account.settings.subtitle")}</p>
            </header>

            <div className="body">
                <FighterInfo profile={profile} />

                {profile.isGuest && (
                    <GuestClaimPanel
                        accountId={accountId}
                        onClaimed={() => reload()}
                        onMessage={onMessage}
                    />
                )}

                {profile.isGuest && (
                    <GuestRecoverySection
                        accountId={accountId}
                        hasRecoveryCode={!!profile.hasRecoveryCode}
                        onMessage={onMessage}
                    />
                )}

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
            </div>

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
        <Section
            title={t("account.fighterInfo.title")}
            subtitle={t("account.fighterInfo.subtitle")}
            icon={Lock}
            iconTone="lock"
        >
            <div className="info-rows">
                <InfoRow label={t("account.fighterInfo.fighterNameLabel")}  value={f.fullName}    permanent />
                <InfoRow label={t("account.fighterInfo.nicknameLabel")}      value={f.nickname || "—"} />
                <InfoRow label={t("account.fighterInfo.weightClassLabel")}  value={f.weightClass} permanent />
                <InfoRow label={t("account.fighterInfo.styleLabel")}         value={f.style}       permanent />
                <InfoRow label={t("account.fighterInfo.backstoryLabel")}     value={f.backstory || "—"} permanent />
            </div>
        </Section>
    );
}

function InfoRow({ label, value, permanent }) {
    return (
        <div className="info-row">
            <span className="info-label">{label}</span>
            <span className="info-value">
                {value}
                {permanent && <span className="permanent-badge">{t("account.fighterInfo.permanent")}</span>}
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
            onMessage?.(e.message || t("account.unavailable"));
        }
        setBusy(false);
    };

    let hint = null;
    if (tooShort && trimmed.length > 0) hint = t("account.changeNickname.hintTooShort");
    else if (tooLong) hint = t("account.changeNickname.hintTooLong");
    else if (invalidChars) hint = t("account.changeNickname.hintInvalidChars");

    return (
        <Section title={t("account.changeNickname.title")} icon={Pencil} iconTone="edit">
            <div className="form-body">
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">{t("account.changeNickname.label")}</label>
                        <input
                            type="text"
                            className="form-input"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            maxLength={20}
                            placeholder={t("account.changeNickname.placeholder")}
                        />
                        <span className="form-hint">{t("account.changeNickname.charCount", { n: trimmed.length })}</span>
                    </div>
                    <button
                        type="button"
                        className="save-btn"
                        onClick={save}
                        disabled={!canSave}
                    >
                        {busy ? t("account.changeNickname.saving") : t("common.save")}
                    </button>
                </div>
                {hint && <span className="form-hint neg">{hint}</span>}
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
    // Block the form until the current email is verified. The server enforces
    // this too (code: "email_not_verified"), this is just the UX layer.
    const verified = profile.emailConfirmed !== false;

    // Tick down once a second while a cooldown is active. The interval clears
    // itself when it hits zero so we're not eating a setInterval forever.
    useEffect(() => {
        if (resendIn <= 0) return;
        const timer = setInterval(() => {
            setResendIn((n) => (n <= 1 ? 0 : n - 1));
        }, 1000);
        return () => clearInterval(timer);
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
            onMessage?.(e.message || t("common.error"));
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
                onMessage?.(e.message || t("common.error"));
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
            onMessage?.(e.message || t("common.error"));
        }
        setBusy(false);
    };

    return (
        <Section title={t("account.changeEmail.title")} icon={Mail} iconTone="email">
            <div className="form-body">
                <div className="form-current">
                    {t("account.changeEmail.currentEmail")} <span>{masked}</span>
                    {!verified && <span className="permanent-badge" style={{ marginLeft: "0.4rem" }}>{t("account.changeEmail.unverified")}</span>}
                </div>
                {!verified && !pending && (
                    <span className="form-hint neg">
                        {t("account.changeEmail.verifyFirst")}
                    </span>
                )}
                {pending ? (
                    <div className="account-pending-banner">
                        <div>
                            {t("account.changeEmail.pendingConfirmation", { email: pending })}
                        </div>
                        <div className="account-pending-actions">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={resend}
                                disabled={busy || resendIn > 0}
                                title={resendIn > 0 ? t("account.changeEmail.resendTitle", { n: resendIn }) : undefined}
                            >
                                {resendIn > 0 ? t("account.changeEmail.resendIn", { n: resendIn }) : t("account.changeEmail.resendLink")}
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={busy}>{t("common.cancel")}</button>
                        </div>
                    </div>
                ) : (
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">{t("account.changeEmail.newEmailLabel")}</label>
                            <input
                                type="email"
                                className="form-input"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder={verified ? t("account.changeEmail.newEmailPlaceholder") : t("account.changeEmail.newEmailPlaceholderUnverified")}
                                autoComplete="email"
                                disabled={!verified}
                            />
                        </div>
                        <button
                            type="button"
                            className="save-btn"
                            onClick={request}
                            disabled={!dirty || busy || !verified}
                            title={!verified ? t("account.changeEmail.verifyBeforeChange") : undefined}
                        >
                            {busy ? t("account.changeNickname.saving") : t("common.save")}
                        </button>
                    </div>
                )}
            </div>
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
    if (next.length > 0 && !nextValid) inlineError = t("account.changePassword.errorWeak");
    else if (confirm.length > 0 && !matches) inlineError = t("account.changePassword.errorMismatch");

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
                onMessage?.(e.message || t("common.error"));
            }
        }
        setBusy(false);
    };

    return (
        <Section title={t("account.changePassword.title")} icon={Key} iconTone="pw">
            <div className="form-body">
                <div className="form-group">
                    <label className="form-label">{t("account.changePassword.currentLabel")}</label>
                    <PasswordInput value={current} onChange={setCurrent} placeholder={t("account.changePassword.currentPlaceholder")} show={showAll} />
                </div>
                <div className="form-group">
                    <label className="form-label">{t("account.changePassword.newLabel")}</label>
                    <PasswordInput value={next} onChange={setNext} placeholder={t("account.changePassword.newPlaceholder")} show={showAll} />
                </div>
                <div className="form-group">
                    <label className="form-label">{t("account.changePassword.confirmLabel")}</label>
                    <PasswordInput value={confirm} onChange={setConfirm} placeholder={t("account.changePassword.confirmPlaceholder")} show={showAll} />
                </div>
                <div className="checkbox-row">
                    <label className="checkbox-label">
                        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                        {t("account.changePassword.showPasswords")}
                    </label>
                    <span className="checkbox-hint">{t("account.changePassword.hint")}</span>
                </div>
                {inlineError && <span className="form-hint neg">{inlineError}</span>}
                <button type="button" className="update-btn" onClick={save} disabled={!canSave}>
                    {busy ? t("account.changePassword.updating") : t("account.changePassword.updateBtn")}
                </button>
            </div>
        </Section>
    );
}

function PasswordInput({ value, onChange, placeholder, show }) {
    return (
        <input
            type={show ? "text" : "password"}
            className="form-input"
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
            onMessage?.(e.message || t("common.error"));
        }
    };
    return (
        <Section title={t("account.notifications.title")} icon={Bell} iconTone="bell">
            <div className="account-toggle-row">
                <div>
                    <div className="account-toggle-label">{t("account.notifications.emailLabel")}</div>
                    <div className="account-toggle-sub">{t("account.notifications.emailSub")}</div>
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
        <Section title={t("account.dangerZone.title")} className="danger-card">
            <div className="danger-section">
                <div className="danger-header">
                    <h4 className="danger-title">{t("account.dangerZone.title")}</h4>
                </div>
                <div className="danger-body">
                    <div className="danger-desc">
                        {t("account.dangerZone.logoutDesc")}
                    </div>
                    <button className="danger-btn neutral" onClick={onLogoutClick}>
                        <LogOut size={14} /> {t("account.dangerZone.logoutBtn")}
                    </button>
                </div>
                <div className="danger-body">
                    <div className="danger-desc">
                        {t("account.dangerZone.deleteDesc")}
                    </div>
                    <button className="danger-btn" onClick={onDeleteClick}>
                        <Trash2 size={14} /> {t("account.dangerZone.deleteBtn")}
                    </button>
                </div>
            </div>
        </Section>
    );
}

// ─────────────────────────────────────────────────────────────
// Generic section shell
// ─────────────────────────────────────────────────────────────

function Section({ title, subtitle, icon: Icon, iconTone, className, children }) {
    return (
        <section className={`section-card ${className || ""}`}>
            <header className="section-header">
                <div className="section-titles">
                    <h3 className="section-title">{title}</h3>
                    {subtitle && <p className="section-sub">{subtitle}</p>}
                </div>
                {Icon && (
                    <div className={`section-icon ${iconTone || ""}`}>
                        <Icon size={16} strokeWidth={2} />
                    </div>
                )}
            </header>
            <div className="section-body">{children}</div>
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
