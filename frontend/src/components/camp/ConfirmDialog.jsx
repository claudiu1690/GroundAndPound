import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Shared confirm-dialog shell for Your Camp's money/consequence actions
 * (hire, fire, deep clean — Phase 1, F3). Purely presentational: the caller
 * supplies the copy (`lines`) and the confirm/cancel handlers; no camp API
 * call happens in here — `hooks/useHomeCamp.js` stays the only caller.
 *
 * Body-portaled like `MarketPanel`, so it never depends on
 * `.your-camp`-scoped CSS variables. On mobile (<600px) it docks to the
 * bottom of the screen as a sheet rather than a centered card (see App.css).
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  icon = null,
  title,
  lines = [],
  error = null,
  busy = false,
  busyLabel = "…",
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === "Escape" && !busy) onCancel?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="yc-dialog-overlay" role="presentation" onClick={() => !busy && onCancel?.()}>
      <div className="yc-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="yc-dialog-head">
          <div className="yc-dialog-title">{icon}{title}</div>
          <button type="button" className="yc-dialog-x" aria-label={t("common.close")} disabled={busy} onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="yc-dialog-lines">
          {lines.map((line, i) => (
            <div key={i} className={`yc-dialog-line${line.tone ? ` ${line.tone}` : ""}`}>
              {line.label && <span className="yc-dialog-line-label">{line.label}</span>}
              <span className="yc-dialog-line-val">{line.value}</span>
            </div>
          ))}
        </div>

        {error && <div className="yc-dialog-error">{error}</div>}

        <div className="yc-dialog-actions">
          <button type="button" className="yc-dialog-btn yc-dialog-btn--cancel" disabled={busy} onClick={onCancel}>
            {cancelLabel || t("common.cancel")}
          </button>
          <button
            type="button"
            className={`yc-dialog-btn yc-dialog-btn--confirm${destructive ? " destructive" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});
