import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { t } from "@/lib/i18n";

/**
 * Callout roster modal (Phase 4).
 * Lists same-tier opponents + stretch-tier opponents, each with a fame cost.
 * Calling out a fighter spends fame and guarantees them in your next Hard offer
 * with full intel and stacked win bonuses.
 */
export function CalloutModal({ open, fighter, onClose, onCalledOut, onCancelled, onMessage }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [selected, setSelected] = useState(null);
    const [tab, setTab] = useState("same");

    const fighterId = fighter?._id;

    const load = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const res = await api.getCalloutRoster(fighterId);
            setData(res);
        } catch (e) {
            onMessage?.(e.message || "Could not load roster");
            setData(null);
        }
        setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { if (open) load(); }, [open, load]);

    useEffect(() => {
        if (!open) { setSelected(null); return; }
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const submit = useCallback(async () => {
        if (!fighterId || !selected) return;
        setSubmitting(true);
        try {
            const res = await api.createCallout(fighterId, selected.id);
            onMessage?.(`Called out ${selected.name} — ${res.activeCallout.cost.toLocaleString()} fame spent.`);
            onCalledOut?.(res);
            onClose?.();
        } catch (e) {
            onMessage?.(e.message || "Could not call out");
        }
        setSubmitting(false);
    }, [fighterId, selected, onCalledOut, onClose, onMessage]);

    const cancel = useCallback(async () => {
        if (!fighterId) return;
        if (!window.confirm(t("fights.callout.confirmCancel"))) return;
        setSubmitting(true);
        try {
            const res = await api.cancelCallout(fighterId);
            onMessage?.(`Callout cancelled — ${res.refunded.toLocaleString()} fame refunded.`);
            onCancelled?.(res);
            await load();
        } catch (e) {
            onMessage?.(e.message || "Could not cancel");
        }
        setSubmitting(false);
    }, [fighterId, load, onMessage, onCancelled]);

    if (!open) return null;

    const active = data?.active;
    const fame = data?.fame ?? 0;
    const sameTier    = data?.sameTier    || [];
    const stretchTier = data?.stretchTier || [];
    const stretchLabel = data?.stretchLabel;
    const roster = tab === "same" ? sameTier : stretchTier;
    const canAfford = selected ? fame >= selected.cost : false;
    const eligible = data?.eligible ?? true;       // v1.1 — rank-gated availability
    const lockedReason = data?.lockedReason;
    const currentRank = data?.currentRank;

    return createPortal(
        <div className="callout-modal-root" role="dialog" aria-modal="true">
            <div className="callout-modal-backdrop" onClick={onClose} />
            <div className="callout-modal-shell">
                <header className="callout-modal-header">
                    <div>
                        <h2>{t("fights.callout.title")}</h2>
                        <div className="callout-header-sub">
                            {t("fights.callout.yourFame", { fame: fame.toLocaleString() })}
                            {currentRank != null && <> · {t("fights.callout.yourRank", { rank: currentRank })}</>}
                        </div>
                    </div>
                    <button type="button" className="callout-modal-close" onClick={onClose} aria-label={t("common.close")}>✕</button>
                </header>

                {!loading && !eligible && (
                    <div className="callout-locked-banner">
                        {t("fights.callout.lockedBanner", { reason: lockedReason || t("fights.callout.lockedDefault") })}
                    </div>
                )}

                {active && (
                    <div className="callout-active-bar">
                        <span>{t("fights.callout.activeCallout", { name: active.opponentName, cost: active.cost.toLocaleString() })}</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={submitting}>
                            {t("fights.callout.cancelRefund")}
                        </button>
                    </div>
                )}

                <div className="callout-modal-body">
                    <nav className="callout-tabs">
                        <button
                            type="button"
                            className={`callout-tab ${tab === "same" ? "active" : ""}`}
                            onClick={() => { setTab("same"); setSelected(null); }}
                        >
                            {t("fights.callout.tabSameTier", { count: sameTier.length })}
                        </button>
                        <button
                            type="button"
                            className={`callout-tab ${tab === "stretch" ? "active" : ""}`}
                            onClick={() => { setTab("stretch"); setSelected(null); }}
                            disabled={!stretchLabel || stretchTier.length === 0}
                        >
                            {t("fights.callout.tabStretch", { label: stretchLabel || t("fights.callout.tabStretchFallback"), count: stretchTier.length })}
                        </button>
                    </nav>

                    {loading && <div className="callout-loading">{t("fights.callout.loading")}</div>}

                    {!loading && roster.length === 0 && (
                        <div className="callout-empty">
                            {!eligible
                                ? t("fights.callout.emptyNotEligible")
                                : tab === "stretch"
                                    ? t("fights.callout.emptyStretch")
                                    : currentRank === 2
                                        ? t("fights.callout.emptyChampOnly")
                                        : t("fights.callout.emptyDefault")}
                        </div>
                    )}

                    {!loading && roster.length > 0 && (
                        <div className="callout-grid">
                            {roster.map((o) => {
                                const isSelected = selected?.id === o.id;
                                const affordable = fame >= o.cost;
                                return (
                                    <button
                                        type="button"
                                        key={o.id}
                                        className={`callout-card ${isSelected ? "selected" : ""} ${affordable ? "" : "unaffordable"}`}
                                        onClick={() => setSelected(o)}
                                        disabled={!!active}
                                    >
                                        <div className="callout-card-head">
                                            {o.rank != null && (
                                                <span className="callout-rank-pill" title={`Ranked #${o.rank} in ${o.promotionTier}`}>#{o.rank}</span>
                                            )}
                                            <span className="callout-name">{o.name}{o.nickname ? ` "${o.nickname}"` : ""}</span>
                                            {o.isStretch && <span className="callout-stretch-badge">{t("fights.callout.isStretchBadge")}</span>}
                                        </div>
                                        <div className="callout-card-meta">
                                            <span>{o.style}</span>
                                            <span>OVR {o.overallRating}</span>
                                            <span>{o.record?.wins ?? 0}-{o.record?.losses ?? 0}-{o.record?.draws ?? 0}</span>
                                        </div>
                                        <div className={`callout-cost ${affordable ? "" : "unaffordable"}`}>
                                            {o.cost.toLocaleString()} fame
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <footer className="callout-modal-footer">
                    <div className="callout-footer-info">
                        {selected
                            ? t("fights.callout.selectedInfo", { name: selected.name, cost: selected.cost.toLocaleString() })
                            : t("fights.callout.pickHint")}
                    </div>
                    <div className="callout-footer-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            {t("fights.callout.btnClose")}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={submit}
                            disabled={!selected || !canAfford || submitting || !!active}
                            title={active ? t("fights.callout.alreadyActiveTitle") : (!canAfford ? t("fights.callout.notEnoughFame") : undefined)}
                        >
                            {submitting ? t("fights.callout.btnCallingOut") : selected ? t("fights.callout.btnSpendFame", { cost: selected.cost.toLocaleString() }) : t("fights.callout.btnSelectFighter")}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    , document.body);
}
