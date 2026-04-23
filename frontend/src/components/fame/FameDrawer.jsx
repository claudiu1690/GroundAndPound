import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../../api";

const TIER_ORDER = ["UNKNOWN", "PROSPECT", "RISING_STAR", "CONTENDER", "STAR", "LEGEND"];
const TIER_LABEL = {
    UNKNOWN: "Unknown",
    PROSPECT: "Prospect",
    RISING_STAR: "Rising Star",
    CONTENDER: "Contender",
    STAR: "Star",
    LEGEND: "Legend",
};

/**
 * Code → icon/color used in the event feed.
 */
const CODE_META = {
    FIGHT_WIN:     { icon: "✓", tone: "pos", label: "Fight win" },
    FIGHT_LOSS:    { icon: "✕", tone: "neg", label: "Fight loss" },
    FIGHT_DRAW:    { icon: "=", tone: "neu", label: "Draw" },
    NEMESIS_WIN:   { icon: "⚔", tone: "pos", label: "Nemesis defeated" },
    BELT_WON:      { icon: "🏆", tone: "pos", label: "Belt won" },
    MILESTONE:     { icon: "★", tone: "pos", label: "Milestone" },
    DECAY:         { icon: "↓", tone: "neg", label: "Inactivity decay" },
    CALLOUT_COST:  { icon: "📣", tone: "neg", label: "Callout spend" },
    CALLOUT_WIN:   { icon: "📣", tone: "pos", label: "Callout payoff" },
    SPONSOR_BONUS: { icon: "$", tone: "pos", label: "Sponsor bonus" },
    SPONSOR_BREAK: { icon: "✕", tone: "neg", label: "Sponsor clause broken" },
    PREDICTION_RIGHT: { icon: "⚡", tone: "pos", label: "Prediction correct" },
    PREDICTION_WRONG: { icon: "⚡", tone: "neg", label: "Prediction wrong" },
    INTERVIEW:     { icon: "🎙", tone: "pos", label: "Interview" },
    PODCAST:       { icon: "🎙", tone: "pos", label: "Podcast" },
    DOCUMENTARY:   { icon: "🎬", tone: "pos", label: "Documentary" },
};

function formatRelative(dateStr) {
    if (!dateStr) return "";
    const then = new Date(dateStr).getTime();
    if (!Number.isFinite(then)) return "";
    const diff = Math.max(0, Date.now() - then);
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

function formatDelta(n) {
    if (n > 0) return `+${n.toLocaleString()}`;
    return n.toLocaleString();
}

export function FameDrawer({ open, fighter, onClose, onNavigate }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [howOpen, setHowOpen] = useState(false);

    const fighterId = fighter?._id;
    const n = fighter?.notoriety;

    const score = n?.score ?? 0;
    const peakTier = n?.peakTier ?? "UNKNOWN";
    const tierLabel = n?.tierLabel ?? TIER_LABEL[peakTier];
    const nextThreshold = n?.nextTierThreshold ?? null;
    const nextTierKey = n?.nextTierKey ?? null;
    const tierFloorValue = n?.tierFloor ?? 0;
    const decayWarning = !!n?.decayWarningActive;
    const isFrozen = !!n?.isFrozen;
    const progressPct = useMemo(() => {
        if (nextThreshold == null) return 100;
        const currentIdx = TIER_ORDER.indexOf(peakTier);
        const prevMin = currentIdx >= 0 ? [0, 1000, 5000, 15000, 40000, 80000][currentIdx] : 0;
        const span = Math.max(1, nextThreshold - prevMin);
        const pct = Math.max(0, Math.min(100, ((score - prevMin) / span) * 100));
        return Math.round(pct);
    }, [score, peakTier, nextThreshold]);

    const fetchEvents = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const data = await api.getFameEvents(fighterId, 10);
            setEvents(Array.isArray(data?.events) ? data.events : []);
        } catch (_) {
            setEvents([]);
        }
        setLoading(false);
    }, [fighterId]);

    useEffect(() => {
        if (open) fetchEvents();
    }, [open, fetchEvents]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Don't render anything when closed — keeps a ~100vh fixed backdrop out of the DOM
    // so it can't block clicks even if CSS fails to load (stale cache, loading order, etc).
    if (!fighter || !open) return null;

    return (
        <>
            <div
                className="fame-drawer-backdrop open"
                onClick={onClose}
                aria-hidden={false}
            />
            <aside className="fame-drawer open" aria-hidden={false}>
                <header className="fame-drawer-header">
                    <h2>Fame</h2>
                    <button type="button" className="fame-drawer-close" onClick={onClose} aria-label="Close">✕</button>
                </header>

                <div className="fame-drawer-body">
                    {/* Tier + score hero */}
                    <section className="fame-hero">
                        <div className={`fame-hero-tier hdr-tier-${peakTier}`}>{tierLabel}</div>
                        <div className="fame-hero-score">{score.toLocaleString()}</div>

                        {nextThreshold != null ? (
                            <>
                                <div className="fame-progress-bar">
                                    <div className="fame-progress-fill" style={{ width: `${progressPct}%` }} />
                                </div>
                                <div className="fame-progress-label">
                                    <span>{progressPct}% to {TIER_LABEL[nextTierKey] || "next tier"}</span>
                                    <span>{(nextThreshold - score).toLocaleString()} to go</span>
                                </div>
                            </>
                        ) : (
                            <div className="fame-progress-label fame-capped">
                                <span>Top tier reached.</span>
                            </div>
                        )}
                    </section>

                    {/* Status chips */}
                    <section className="fame-chips">
                        {isFrozen && (
                            <span className="fame-chip fame-chip-warn" title="Losses do not reduce notoriety while frozen. Win to resume growth.">
                                ❄ Frozen
                            </span>
                        )}
                        {decayWarning && (
                            <span className="fame-chip fame-chip-warn" title="20+ days since your last fame-relevant action. Notoriety is decaying 1% daily until you act.">
                                ⏳ Decay active
                            </span>
                        )}
                        <span className="fame-chip" title="Notoriety cannot drop below the floor of your peak tier.">
                            Floor: {tierFloorValue.toLocaleString()}
                        </span>
                    </section>

                    {/* This week */}
                    <section className="fame-section">
                        <div className="fame-section-title">Recent fame events</div>
                        <div className="fame-event-list">
                            {loading && <div className="fame-empty">Loading…</div>}
                            {!loading && events.length === 0 && (
                                <div className="fame-empty">No fame events yet. Fight, train, and build your name.</div>
                            )}
                            {!loading && events.map((e) => {
                                const meta = CODE_META[e.code] || { icon: "•", tone: "neu", label: e.code };
                                return (
                                    <div key={e.id} className={`fame-event fame-event-${meta.tone}`}>
                                        <span className="fame-event-icon">{meta.icon}</span>
                                        <div className="fame-event-text">
                                            <div className="fame-event-reason">{e.reason || meta.label}</div>
                                            <div className="fame-event-time">{formatRelative(e.createdAt)}</div>
                                        </div>
                                        <span className={`fame-event-delta fame-event-delta-${meta.tone}`}>
                                            {formatDelta(e.delta)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Deep links — placeholders for now, wired in later phases */}
                    <section className="fame-section">
                        <div className="fame-section-title">Spend & earn</div>
                        <div className="fame-links">
                            <button
                                type="button"
                                className="fame-link-btn"
                                onClick={() => { onNavigate?.("contracts"); onClose?.(); }}
                            >
                                📜 Contracts
                                <span className="fame-link-hint">Active sponsor deals</span>
                            </button>
                            <button
                                type="button"
                                className="fame-link-btn"
                                onClick={() => { onNavigate?.("fights"); onClose?.(); }}
                            >
                                📣 Call Out a Fighter
                                <span className="fame-link-hint">Spend fame to force a matchup</span>
                            </button>
                            <button
                                type="button"
                                className="fame-link-btn"
                                onClick={() => { onNavigate?.("media"); onClose?.(); }}
                            >
                                🎙 Media Hub
                                <span className="fame-link-hint">Podcast, documentary, interviews</span>
                            </button>
                            <button
                                type="button"
                                className="fame-link-btn"
                                onClick={() => { onNavigate?.("events"); onClose?.(); }}
                            >
                                📅 Events
                                <span className="fame-link-hint">Predict the main event of the week</span>
                            </button>
                        </div>
                    </section>

                    {/* Help collapsible */}
                    <section className="fame-section">
                        <button
                            type="button"
                            className="fame-help-toggle"
                            onClick={() => setHowOpen((v) => !v)}
                        >
                            {howOpen ? "▾" : "▸"} How fame works
                        </button>
                        {howOpen && (
                            <div className="fame-help-body">
                                <p><strong>Fame</strong> is your career reputation. Higher fame means bigger purses and unlocks new content.</p>
                                <ul>
                                    <li>Win fights, especially by finish, to earn fame.</li>
                                    <li>Losses reduce fame — unless your notoriety is frozen.</li>
                                    <li>Fame can decay if you go 20+ days without a fame-relevant action.</li>
                                    <li>Your score never drops below the floor of your peak tier.</li>
                                </ul>
                            </div>
                        )}
                    </section>
                </div>
            </aside>
        </>
    );
}
