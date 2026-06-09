import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { api } from "../../api";
import { storyLabel, pullQuoteFor, mastheadIssue } from "./gazetteContent";

/**
 * The Octagon Gazette — daily newspaper modal (v2 vintage broadsheet).
 *
 * Fires on the first login of each UTC day (gated by lastShownDate on the fighter).
 * Layout: masthead → "Breaking" headline section with a Last Fight Result score-box,
 * lead headline + deck → up to two labelled story columns (with pull-quotes) → a
 * bottom strip with the tagline and an "Enter the Gym" CTA. Dismiss via the close
 * button, the backdrop, Escape, or the CTA. Tapping a navigable story dismisses and
 * routes to that tab.
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
    const columns = stories.filter((s) => s.zone === "secondary").slice(0, 2);
    const lastResult = data?.lastResult || null;
    const twoCol = columns.length === 2;

    const dateLabel = useMemo(() => {
        if (!data?.date) return "";
        try {
            const d = new Date(`${data.date}T00:00:00Z`);
            return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        } catch { return data.date; }
    }, [data?.date]);

    const issueLabel = useMemo(() => mastheadIssue(data?.date), [data?.date]);

    const leadLabel = lead?.type === "event_result" ? "Main Event"
        : lead?.type === "mental_reset_required" ? "Notice"
        : "Breaking";

    if (!open) return null;

    // Brand-new player or empty gazette — close immediately without rendering.
    if (!loading && data && stories.length === 0) {
        setTimeout(() => handleDismiss(), 0);
        return null;
    }

    const rankLine = lastResult
        ? (lastResult.rankFrom != null && lastResult.rankTo != null && lastResult.rankFrom !== lastResult.rankTo)
            ? `${lastResult.tier} · #${lastResult.rankFrom} → #${lastResult.rankTo}`
            : (lastResult.rankTo != null ? `${lastResult.tier} · #${lastResult.rankTo}` : lastResult.tier)
        : "";

    const resultLine = lastResult
        ? (lastResult.isDraw
            ? `${lastResult.winnerName} drew with ${lastResult.loserName}`
            : `${lastResult.winnerName} def. ${lastResult.loserName}`)
        : "";

    return createPortal(
        <div className="gazette-modal-root" role="dialog" aria-modal="true" aria-label="The Octagon Gazette">
            <div className="gazette-modal-backdrop" onClick={() => handleDismiss()} />
            <div className="gz-paper">
                <button type="button" className="gz-close" aria-label="Close" onClick={() => handleDismiss()}>✕</button>

                <header className="gz-header">
                    <div className="gz-established">— Established 2026 —</div>
                    <div className="gz-name">The Octagon Gazette</div>
                    <div className="gz-meta-bar">
                        <span className="gz-meta-item">{issueLabel}</span>
                        <span className="gz-date">{dateLabel}</span>
                        <span className="gz-meta-item">The fight game's paper of record</span>
                    </div>
                </header>

                {loading && <div className="gz-loading">Printing the morning edition…</div>}

                {!loading && (
                    <div className="gz-body">
                        <div className="gz-headline-section">
                            <div className="gz-headline-label">{leadLabel}</div>

                            {lastResult && (
                                <div className="gz-score-box">
                                    <div>
                                        <div className="gz-score-label">Last Fight Result</div>
                                        <div className="gz-score-result">{resultLine}</div>
                                    </div>
                                    <div className="gz-score-right">
                                        <div className="gz-score-method">{lastResult.methodLabel}</div>
                                        <div className="gz-score-label gz-score-sub">{rankLine}</div>
                                    </div>
                                </div>
                            )}

                            {lead && (
                                <div
                                    className={lead.navigateTo ? "gz-lead-link" : undefined}
                                    onClick={() => lead.navigateTo && handleDismiss(lead.navigateTo)}
                                    style={lead.navigateTo ? { cursor: "pointer" } : undefined}
                                >
                                    <div className="gz-headline-hl">{lead.headline}</div>
                                    {lead.body && <div className="gz-headline-deck">{lead.body}</div>}
                                </div>
                            )}
                        </div>

                        {columns.length > 0 && (
                            <div className={`gz-stories-grid${twoCol ? " gz-two-col" : ""}`}>
                                {columns.map((s, i) => {
                                    const quote = pullQuoteFor(s, lastResult);
                                    return (
                                        <Fragment key={`col-${i}`}>
                                            {twoCol && i === 1 && <div className="gz-col-divider" />}
                                            <article
                                                className={`gz-story${s.navigateTo ? " is-tappable" : ""}`}
                                                onClick={() => s.navigateTo && handleDismiss(s.navigateTo)}
                                            >
                                                <div className="gz-story-label">{storyLabel(s.type)}</div>
                                                <div className="gz-story-hl">{s.headline}</div>
                                                {s.body && <div className="gz-story-body">{s.body}</div>}
                                                {quote && (
                                                    <div className="gz-pull-quote">
                                                        <div className="gz-pull-quote-text">{quote}</div>
                                                    </div>
                                                )}
                                            </article>
                                        </Fragment>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <div className="gz-bottom-strip">
                    <div className="gz-bottom-tagline">The fight game's paper of record.</div>
                    <button
                        type="button"
                        className="gz-enter-btn"
                        onClick={() => handleDismiss()}
                        disabled={submitting}
                    >
                        Enter the Gym
                        <ArrowRight size={14} aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    , document.body);
}

export default memo(GazetteModal);
