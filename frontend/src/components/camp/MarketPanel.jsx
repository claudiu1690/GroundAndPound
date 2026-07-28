import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, Clock } from "lucide-react";
import { t } from "@/lib/i18n";
import { CandidateCard } from "./CandidateCard";

/**
 * Trainer Market (Phase 1, F2) — a portal-based event overlay, same
 * treatment as the other big modals in this app (escape-to-close, click
 * outside to close, body-portaled so it never fights `.your-camp`'s
 * layout). It renders OUTSIDE the `.your-camp` DOM subtree, so it never
 * references `.your-camp`-scoped CSS custom properties (`--yc-r-*` etc.) —
 * only global tokens (`--gold-bright`, `--c-border`, …) and `rarityColor()`
 * hex values passed down as inline styles.
 *
 * Presentational: `market` / `loading` / `error` are the hook's own state,
 * `onHire` / `onRetry` / `onClose` are the only calls out. No camp API call
 * happens in this file — `hooks/useHomeCamp.js` stays the only caller.
 */
export const MarketPanel = memo(function MarketPanel({
  open, market, loading, error, hiringCandidateId, onHire, onRetry, onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const candidates = market?.candidates || [];
  const resetsInDays = market?.resetsInDays;

  return createPortal(
    <div
      className="yc-market-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("yourCamp.market.title")}
      onClick={onClose}
    >
      <div className="yc-market-modal" onClick={(e) => e.stopPropagation()}>
        <div className="yc-market-modal-head">
          <div className="yc-market-modal-head-text">
            <div className="yc-market-modal-title">
              <Search size={16} /> {t("yourCamp.market.title")}
            </div>
            {market && (
              <div className="yc-market-modal-sub">
                <span>{t("yourCamp.market.subtitle", { free: market.slots?.free ?? 0, unlocked: market.slots?.unlocked ?? 0 })}</span>
                {resetsInDays != null && (
                  <span className="yc-market-modal-countdown">
                    <Clock size={11} /> {t("yourCamp.market.resetsIn", { n: resetsInDays })}
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button" className="yc-market-close" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {market && (
          <div className="yc-market-cash-row">
            <span>{t("yourCamp.market.cashOnHand")}</span>
            <b>${(market.cash ?? 0).toLocaleString()}</b>
          </div>
        )}

        {error && market && <div className="yc-soft-error">{error}</div>}

        <div className="yc-market-body">
          {loading && !market && (
            <div className="yc-state yc-state--loading">{t("yourCamp.market.loading")}</div>
          )}
          {error && !market && (
            <div className="yc-state yc-state--error">
              {error}
              <button type="button" className="yc-btn-train-ghost" onClick={onRetry}>{t("common.retry")}</button>
            </div>
          )}
          {market && candidates.length === 0 && (
            <div className="yc-state">{t("yourCamp.market.empty")}</div>
          )}
          {market && candidates.length > 0 && (
            <div className="yc-cand-grid">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.candidateId}
                  candidate={c}
                  resetsInDays={resetsInDays}
                  hiring={hiringCandidateId === c.candidateId}
                  onHire={onHire}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});
