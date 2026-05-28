import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";

/**
 * Permanent-account-deletion modal.
 *
 * The spec (§5.5) requires a typed confirmation: the player must enter their
 * fighter's exact full name before the Delete button is enabled. This guards
 * against a one-click misclick from the Danger Zone.
 *
 * On success the parent is notified via `onDeleted`, which is responsible for
 * clearing auth + redirecting to the auth page. The backend marks the account
 * as soft-deleted with a 30-day grace window (see accountService.deleteAccount
 * + scheduler.js hard-delete sweep).
 */
export function DeleteAccountModal({ open, accountId, fighterFullName, onClose, onDeleted, onMessage }) {
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);

    // Reset the typed name whenever the modal is re-opened — otherwise it
    // remembers the previous attempt, which is a UX trap (player thinks the
    // button is already armed).
    useEffect(() => {
        if (open) setTyped("");
    }, [open]);

    if (!open) return null;

    const expected = (fighterFullName || "").trim();
    const matches  = typed.trim() === expected && expected.length > 0;
    const canDelete = matches && !busy;

    const submit = async () => {
        if (!canDelete) return;
        setBusy(true);
        try {
            await api.deleteAccount(accountId, typed.trim());
            onDeleted?.();
        } catch (e) {
            onMessage?.(e.message || "Could not delete account");
            setBusy(false);
        }
    };

    const node = (
        <div className="account-modal-backdrop" onClick={onClose}>
            <div className="account-modal" onClick={(e) => e.stopPropagation()}>
                <header className="account-modal-head">
                    <h3 className="account-modal-title">Delete account</h3>
                    <button type="button" className="account-modal-x" onClick={onClose} aria-label="Close">×</button>
                </header>
                <div className="account-modal-body">
                    <p className="account-modal-warn">
                        This will <strong>permanently delete</strong> your account, fighter, iron, career history,
                        rankings, and saved progress. This action is <strong>final after 30 days</strong>.
                    </p>
                    <p className="account-modal-warn-sub">
                        If you change your mind, you can recover your account by logging in within the next 30 days.
                        After that the data is destroyed.
                    </p>
                    <div className="account-modal-confirm">
                        <label className="account-modal-label">
                            To confirm, type your fighter's full name:&nbsp;
                            <strong>{expected || "—"}</strong>
                        </label>
                        <input
                            type="text"
                            className="account-input"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder={expected}
                            autoFocus
                        />
                    </div>
                </div>
                <footer className="account-modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-danger" onClick={submit} disabled={!canDelete}>
                        {busy ? "Deleting…" : "Delete my account"}
                    </button>
                </footer>
            </div>
        </div>
    );
    // Portal to <body> so the modal escapes the .app CSS `transform: scale(var(--ui-zoom))`
    // — without this the backdrop sits inside the scaled coordinate system and the
    // overlay ends up offset/squashed on wide monitors.
    return createPortal(node, document.body);
}
