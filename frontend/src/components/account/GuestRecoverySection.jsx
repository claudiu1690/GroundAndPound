import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../../api";
import { RecoveryCodeModal } from "../auth/RecoveryCodeModal";
import { t } from "../../lib/i18n";

/**
 * Recovery-code section for guests in AccountTab — shows whether a code has
 * already been saved (hasRecoveryCode) and a regenerate/reveal button.
 *
 * Contract: POST /account/:id/recovery-code → 200 { recoveryCode } (one-time
 * reveal — regenerating invalidates the previous code). 429 { code:
 * "cooldown_active", retryAfter } reuses the same cooldown shape as the
 * existing email-resend flow (see EmailVerifyBanner / ChangeEmail).
 */
export function GuestRecoverySection({ accountId, hasRecoveryCode, onMessage }) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [revealedCode, setRevealedCode] = useState(null);
  const [everSaved, setEverSaved] = useState(hasRecoveryCode);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const regenerate = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    try {
      const { recoveryCode } = await api.regenerateRecoveryCode(accountId);
      setRevealedCode(recoveryCode);
    } catch (e) {
      if (e.code === "cooldown_active" && e.retryAfter) {
        setCooldown(e.retryAfter);
        onMessage?.(t("account.guestRecovery.cooldownMsg", { n: e.retryAfter }));
      } else {
        onMessage?.(e.message || t("common.error"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section-card guest-recovery-section">
      <header className="section-header">
        <div className="section-titles">
          <h3 className="section-title">{t("account.guestRecovery.title")}</h3>
          <p className="section-sub">{t("account.guestRecovery.subtitle")}</p>
        </div>
        <div className="section-icon pw">
          <KeyRound size={16} strokeWidth={2} />
        </div>
      </header>
      <div className="section-body">
        <div className="form-current">
          {everSaved ? t("account.guestRecovery.statusSaved") : t("account.guestRecovery.statusNone")}
        </div>
        <button
          type="button"
          className="save-btn"
          onClick={regenerate}
          disabled={busy || cooldown > 0}
          title={cooldown > 0 ? t("account.guestRecovery.cooldownTitle", { n: cooldown }) : undefined}
        >
          {busy
            ? t("account.guestRecovery.generating")
            : cooldown > 0
              ? t("account.guestRecovery.cooldownBtn", { n: cooldown })
              : everSaved
                ? t("account.guestRecovery.regenerateBtn")
                : t("account.guestRecovery.generateBtn")}
        </button>
        <span className="form-hint">{t("account.guestRecovery.regenerateHint")}</span>
      </div>

      <RecoveryCodeModal
        open={!!revealedCode}
        code={revealedCode}
        onConfirm={() => {
          setEverSaved(true);
          setRevealedCode(null);
        }}
      />
    </section>
  );
}
