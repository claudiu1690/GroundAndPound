import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

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
        if (!window.confirm("Cancel the active callout? Your fame will be refunded.")) return;
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

    return (
        <div className="callout-modal-root" role="dialog" aria-modal="true">
            <div className="callout-modal-backdrop" onClick={onClose} />
            <div className="callout-modal-shell">
                <header className="callout-modal-header">
                    <div>
                        <h2>Call Out a Fighter</h2>
                        <div className="callout-header-sub">
                            Your fame: <strong>{fame.toLocaleString()}</strong>
                        </div>
                    </div>
                    <button type="button" className="callout-modal-close" onClick={onClose} aria-label="Close">✕</button>
                </header>

                {active && (
                    <div className="callout-active-bar">
                        <span>📣 Active callout: <strong>{active.opponentName}</strong> — {active.cost.toLocaleString()} fame spent</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={submitting}>
                            Cancel & refund
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
                            Same tier ({sameTier.length})
                        </button>
                        <button
                            type="button"
                            className={`callout-tab ${tab === "stretch" ? "active" : ""}`}
                            onClick={() => { setTab("stretch"); setSelected(null); }}
                            disabled={!stretchLabel || stretchTier.length === 0}
                        >
                            Stretch: {stretchLabel || "—"} ({stretchTier.length})
                        </button>
                    </nav>

                    {loading && <div className="callout-loading">Loading roster…</div>}

                    {!loading && roster.length === 0 && (
                        <div className="callout-empty">
                            {tab === "stretch"
                                ? "No stretch-tier opponents available."
                                : "No opponents available to call out right now."}
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
                                            <span className="callout-name">{o.name}{o.nickname ? ` "${o.nickname}"` : ""}</span>
                                            {o.isStretch && <span className="callout-stretch-badge">+1 Tier</span>}
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
                            ? `Selected: ${selected.name} — ${selected.cost.toLocaleString()} fame`
                            : "Pick a fighter to call out. They'll appear in your next Hard offer with full intel."}
                    </div>
                    <div className="callout-footer-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Close
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={submit}
                            disabled={!selected || !canAfford || submitting || !!active}
                            title={active ? "You already have an active callout" : (!canAfford ? "Not enough fame" : undefined)}
                        >
                            {submitting ? "Calling out…" : selected ? `Spend ${selected.cost.toLocaleString()} fame` : "Select a fighter"}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
