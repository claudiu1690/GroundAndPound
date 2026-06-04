import { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trophy, Flame, Coins } from "lucide-react";
import { PvpSeasonBadge } from "./PvpSeasonBadge";

/**
 * End-of-season results modal (contract §6.5 / §6.6). Shown ONCE when
 * getPvpSeason() returns a non-null `ended_results`. On dismiss it calls
 * markPvpSeasonSeen() so the backend's season_number_seen advances and the
 * modal never re-appears for that season.
 *
 *   ended_results: { division, placement, rewards }
 *   rewards is shape-tolerant: { iron, fame, title } and/or a list of lines.
 *
 * Every field is guarded — a partial payload renders a clean, minimal card.
 *
 * Props:
 *   season      { season_number, ended_results } | null
 *   onDismiss   () => void          — parent clears the modal
 *   onMarkSeen  () => Promise|void  — calls markPvpSeasonSeen (fire-and-forget)
 */
export const PvpSeasonResultsModal = memo(function PvpSeasonResultsModal({ season, onDismiss, onMarkSeen }) {
    const [closing, setClosing] = useState(false);
    const results = season?.ended_results || null;

    const dismiss = useCallback(async () => {
        if (closing) return;
        setClosing(true);
        try { await onMarkSeen?.(); } catch { /* best-effort; never block dismissal */ }
        onDismiss?.();
    }, [closing, onMarkSeen, onDismiss]);

    // Close on Escape.
    useEffect(() => {
        if (!results) return undefined;
        const onKey = (e) => { if (e.key === "Escape") dismiss(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [results, dismiss]);

    if (!results) return null;

    const seasonNumber = season?.season_number;
    const division = results.division || null;
    const placement = results.placement;

    // Normalise rewards into displayable rows. Accept either an object
    // ({iron, fame, title}) or an array of {label, value} / strings.
    const rewards = results.rewards;
    const rows = [];
    if (Array.isArray(rewards)) {
        rewards.forEach((r, i) => {
            if (r == null) return;
            if (typeof r === "string") rows.push({ key: `r${i}`, label: r, value: null });
            else rows.push({ key: `r${i}`, label: r.label ?? r.name ?? "Reward", value: r.value ?? r.amount ?? null, kind: r.kind });
        });
    } else if (rewards && typeof rewards === "object") {
        if (rewards.iron != null) rows.push({ key: "iron", label: "Iron", value: rewards.iron, kind: "iron" });
        if (rewards.fame != null) rows.push({ key: "fame", label: "PvP Fame", value: rewards.fame, kind: "fame" });
        if (rewards.title) rows.push({ key: "title", label: "Title unlocked", value: rewards.title, kind: "title" });
    }

    const placementLabel = placement == null
        ? null
        : typeof placement === "number"
            ? `Finished #${placement}`
            : String(placement);

    return createPortal(
        <div className="pvp-flow-overlay" role="dialog" aria-modal="true" aria-label="Season results">
            <div className="pvp-flow-card pvp-season-results">
                <div className="pvp-season-results-head">
                    <span className="pvp-season-results-eyebrow">
                        <Trophy size={12} /> SEASON {seasonNumber != null ? seasonNumber : "—"} COMPLETE
                    </span>
                    <button type="button" className="fr-close" onClick={dismiss} title="Dismiss">&times;</button>
                </div>

                <div className="pvp-season-results-banner">
                    {division ? <PvpSeasonBadge division={division} size="md" /> : null}
                    {placementLabel && <div className="pvp-season-results-placement">{placementLabel}</div>}
                </div>

                {rows.length > 0 ? (
                    <div className="pvp-season-results-rewards">
                        <div className="pvp-season-results-rewards-title">Your rewards</div>
                        <ul className="pvp-season-results-list">
                            {rows.map((r) => (
                                <li key={r.key} className="pvp-season-reward-row">
                                    <span className="pvp-season-reward-label">
                                        {r.kind === "iron" && <Coins size={11} />}
                                        {r.kind === "fame" && <Flame size={11} />}
                                        {r.kind === "title" && <Trophy size={11} />}
                                        {r.label}
                                    </span>
                                    {r.value != null && (
                                        <span className={`pvp-season-reward-val pvp-season-reward-val--${r.kind || "default"}`}>
                                            {typeof r.value === "number" ? r.value.toLocaleString() : r.value}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className="pvp-season-results-empty">
                        The season has rolled over. A fresh ladder awaits.
                    </div>
                )}

                <div className="pvp-flow-actions">
                    <button type="button" className="btn btn-primary" onClick={dismiss} disabled={closing}>
                        {closing ? "…" : "Onward"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default PvpSeasonResultsModal;
