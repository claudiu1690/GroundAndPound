import { useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../../lib/i18n";

/**
 * One-time recovery-code reveal modal.
 *
 * Shared by GuestStart (creation) and the account-tab recovery-code section
 * (regenerate). The code is returned by the backend exactly once — at
 * `POST /auth/guest` and at `POST /account/:id/recovery-code` — and can never
 * be re-fetched afterwards (only the SHA-256 hash is stored server-side). This
 * modal exists to make that permanence unmistakable before the user moves on.
 *
 * Props:
 *   open       — whether the modal is visible
 *   code       — the raw recovery code string, e.g. "XXXX-XXXX-XXXX-XXXX"
 *   onConfirm  — called when the user clicks "I've saved it" (required — no
 *                backdrop-click / escape dismissal, this is a one-time reveal)
 */
export function RecoveryCodeModal({ open, code, onConfirm }) {
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      // Clipboard API unavailable (e.g. insecure context) — the code is still
      // shown on screen for manual copy, so this is a soft failure.
      setCopied(false);
    }
  };

  const node = (
    <div className="account-modal-backdrop recovery-code-backdrop" role="dialog" aria-modal="true">
      <div className="account-modal recovery-code-modal">
        <header className="account-modal-head">
          <h3 className="account-modal-title recovery-code-title">{t("auth.guest.recoveryModal.title")}</h3>
        </header>
        <div className="account-modal-body">
          <p className="account-modal-warn">
            {t("auth.guest.recoveryModal.warn")}
          </p>
          <p className="account-modal-warn-sub">
            {t("auth.guest.recoveryModal.warnSub")}
          </p>
          <div className="recovery-code-display">
            <code className="recovery-code-value">{code}</code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
              {copied ? t("auth.guest.recoveryModal.copied") : t("auth.guest.recoveryModal.copyBtn")}
            </button>
          </div>
          <label className="recovery-code-ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{t("auth.guest.recoveryModal.ackLabel")}</span>
          </label>
        </div>
        <footer className="account-modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ack}
            onClick={onConfirm}
          >
            {t("auth.guest.recoveryModal.confirmBtn")}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
