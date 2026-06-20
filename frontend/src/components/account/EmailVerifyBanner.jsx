import { useEffect, useState } from "react";
import { api } from "../../api";
import { t } from "../../lib/i18n";

/**
 * Top-of-app banner shown while the user's email is unconfirmed.
 *
 * Soft verification — the user can play the game while this banner is up.
 * Clicking the link in the email returns them to /?email_verified=true and the
 * parent (App.jsx) hides the banner. The Resend button has a 60s cooldown,
 * mirrored from `initialCooldown` (server-computed seconds remaining) so
 * reloading the page resumes the timer accurately.
 *
 * Props:
 *   email           — the address the verification was sent to (for display)
 *   accountId       — required to call /account/:id/email/verify-resend
 *   initialCooldown — seconds remaining from the server (profile.emailVerifyCooldown)
 *   onMessage       — message-bar dispatcher from App.jsx
 */
export function EmailVerifyBanner({ email, accountId, initialCooldown = 0, onMessage }) {
    const [resendIn, setResendIn] = useState(initialCooldown);
    const [busy, setBusy] = useState(false);

    useEffect(() => { setResendIn(initialCooldown); }, [initialCooldown]);

    useEffect(() => {
        if (resendIn <= 0) return;
        const timer = setInterval(() => {
            setResendIn((n) => (n <= 1 ? 0 : n - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendIn]);

    const resend = async () => {
        if (resendIn > 0 || busy || !accountId) return;
        setBusy(true);
        try {
            await api.resendVerifyEmail(accountId);
            onMessage?.(`Verification link sent to ${email || "your email"}.`);
            setResendIn(60);
        } catch (e) {
            if (e.code === "cooldown_active" && e.retryAfter) {
                setResendIn(e.retryAfter);
                onMessage?.(`Please wait ${e.retryAfter}s before requesting another link.`);
            } else if (e.code === "already_verified") {
                // Edge case: the user verified in another tab. Just hide the
                // banner by surfacing the fact — parent will refresh from the
                // URL param flow.
                onMessage?.("Your email is already verified.");
            } else {
                onMessage?.(e.message || t("common.error"));
            }
        }
        setBusy(false);
    };

    return (
        <div className="email-verify-banner" role="status">
            <span className="evb-icon" aria-hidden="true">✉</span>
            <div className="evb-text">
                {email
                    ? t("account.emailVerifyBanner.confirmEmailAt", { email })
                    : t("account.emailVerifyBanner.confirmEmailGeneric")}
            </div>
            <button
                type="button"
                className="evb-btn"
                onClick={resend}
                disabled={busy || resendIn > 0}
                title={resendIn > 0 ? t("account.emailVerifyBanner.resendTitle", { n: resendIn }) : undefined}
            >
                {resendIn > 0 ? t("account.emailVerifyBanner.resendIn", { n: resendIn }) : t("account.emailVerifyBanner.resendLink")}
            </button>
        </div>
    );
}
