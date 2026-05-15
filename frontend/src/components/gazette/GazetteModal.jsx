import { memo, useEffect, useMemo, useState } from "react";
import { api } from "../../api";

/**
 * Octagon Gazette — daily newspaper modal.
 *
 * Fires on the first login of each UTC day (gated by lastShownDate on the fighter).
 * Displays a masthead, lead story, secondary column, filler briefs. Dismiss with
 * the close button or the "Enter the Gym" CTA. Tapping an event story dismisses
 * and navigates to the Events tab.
 */
export function GazetteModal({ open, fighterId, onDismiss, onNavigate }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open || !fighterId) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const res = await api.getGazette(fighterId);
                if (!cancelled) setData(res);
            } catch {
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, fighterId]);

    useEffect(() => {
        if (!open) return undefined;
        const handler = (e) => { if (e.key === "Escape") handleDismiss(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    async function handleDismiss(navigateAfter = null) {
        if (submitting) return;
        setSubmitting(true);
        try { await api.dismissGazette(fighterId); } catch {}
        setSubmitting(false);
        if (navigateAfter && onNavigate) onNavigate(navigateAfter);
        if (onDismiss) onDismiss();
    }

    const stories = data?.stories || [];
    const lead = stories.find((s) => s.zone === "lead") || null;
    const secondary = stories.filter((s) => s.zone === "secondary");
    const filler = stories.filter((s) => s.zone === "filler");
    const dateLabel = useMemo(() => {
        if (!data?.date) return "";
        try {
            const d = new Date(`${data.date}T00:00:00Z`);
            return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();
        } catch { return data.date; }
    }, [data?.date]);

    if (!open) return null;

    // Brand-new player or empty gazette — close immediately without modal.
    if (!loading && data && stories.length === 0) {
        setTimeout(() => handleDismiss(), 0);
        return null;
    }

    return (
        <div className="gazette-modal-root" role="dialog" aria-modal="true">
            <div className="gazette-modal-backdrop" onClick={() => handleDismiss()} />
            <div className="gazette-modal-shell">
                <button
                    type="button"
                    className="gazette-close"
                    aria-label="Close"
                    onClick={() => handleDismiss()}
                >
                    ✕
                </button>

                <header className="gazette-masthead">
                    <div className="gazette-eyebrow">— ESTABLISHED 2026 —</div>
                    <h1 className="gazette-title">The Octagon Gazette</h1>
                    <div className="gazette-rule" />
                    <div className="gazette-date">{dateLabel}</div>
                </header>

                {loading && <div className="gazette-loading">Loading the morning paper…</div>}

                {!loading && lead && lead.type === "event_result" && lead.meta && (
                    <article
                        className="gazette-lead gazette-event-lead is-tappable"
                        onClick={() => handleDismiss(lead.navigateTo)}
                    >
                        <span className="gazette-tag">LAST NIGHT</span>
                        <div className="gazette-event-kicker">{lead.meta.eventName} · Headliner</div>
                        <div className="gazette-event-matchup">
                            <span className="gazette-event-name">{lead.meta.winner}</span>
                            <span className="gazette-event-vs">vs</span>
                            <span className="gazette-event-name gazette-event-loser">{lead.meta.loser}</span>
                        </div>
                        <div className="gazette-event-result">
                            {lead.meta.winner} wins by {lead.meta.methodLabel}
                        </div>
                        {lead.body && <p className="gazette-lead-body">{lead.body}</p>}
                    </article>
                )}

                {!loading && lead && !(lead.type === "event_result" && lead.meta) && (
                    <article
                        className={`gazette-lead ${lead.navigateTo ? "is-tappable" : ""}`}
                        onClick={() => lead.navigateTo && handleDismiss(lead.navigateTo)}
                    >
                        {lead.navigateTo && <span className="gazette-tag">LAST NIGHT</span>}
                        <h2 className="gazette-lead-headline">{lead.headline}</h2>
                        {lead.body && <p className="gazette-lead-body">{lead.body}</p>}
                    </article>
                )}

                {!loading && secondary.length > 0 && (
                    <section className="gazette-secondary">
                        {secondary.map((s, i) => (
                            <article
                                key={`sec-${i}`}
                                className={`gazette-secondary-item ${s.navigateTo ? "is-tappable" : ""}`}
                                onClick={() => s.navigateTo && handleDismiss(s.navigateTo)}
                            >
                                <h3 className="gazette-secondary-headline">{s.headline}</h3>
                                {s.body && <p className="gazette-secondary-body">{s.body}</p>}
                            </article>
                        ))}
                    </section>
                )}

                {!loading && filler.length > 0 && (
                    <section className="gazette-filler">
                        <div className="gazette-rule gazette-rule-thin" />
                        <h4 className="gazette-filler-title">In Brief</h4>
                        <ul className="gazette-filler-list">
                            {filler.map((s, i) => (
                                <li key={`fil-${i}`} className="gazette-filler-item">{s.headline}</li>
                            ))}
                        </ul>
                    </section>
                )}

                <footer className="gazette-footer">
                    <button
                        type="button"
                        className="gazette-cta"
                        onClick={() => handleDismiss()}
                        disabled={submitting}
                    >
                        Enter the Gym
                    </button>
                </footer>
            </div>
        </div>
    );
}

export default memo(GazetteModal);
