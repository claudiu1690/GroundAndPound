import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";

function relativeTime(d) {
    if (!d) return "";
    const diff = new Date(d).getTime() - Date.now();
    if (diff <= 0) return "ready";
    const m = Math.floor(diff / 60000);
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h}h`;
    const days = Math.floor(h / 24);
    return `in ${days}d`;
}

/**
 * Calendar-aware cooldown text.
 * - Past    → "ready"
 * - Today   → "in 3h" / "in 42m"
 * - Tomorrow (next calendar day) → "Tomorrow"
 * - Later   → "in Nd"  (shouldn't happen for 1-day cooldowns, just defensive)
 */
function formatCooldown(d) {
    if (!d) return "";
    const now = new Date();
    const t = new Date(d);
    const diff = t.getTime() - now.getTime();
    if (diff <= 0) return "ready";

    const isSameDay = (a, b) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    if (isSameDay(now, t)) {
        const m = Math.floor(diff / 60000);
        if (m < 60) return `in ${m}m`;
        return `in ${Math.floor(m / 60)}h`;
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(tomorrow, t)) return "Tomorrow";

    const days = Math.ceil(diff / 86400000);
    return `in ${days}d`;
}

function recordStr(r) {
    if (!r) return "—";
    return `${r.wins ?? 0}-${r.losses ?? 0}${r.draws ? `-${r.draws}` : ""}`;
}

const TONE_DEFS = {
    RESPECTFUL: { label: "Respectful", icon: "🙇", desc: "Pay respect. +15% iron if you later beat them." },
    TRASH:      { label: "Trash Talk", icon: "🔥", desc: "+300 fame. Beef flag: +30% fame on grudge win. −150 if they never show." },
    CRYPTIC:    { label: "Cryptic",    icon: "🎭", desc: "Say nothing. Say everything. +40 fame, no strings." },
};

export function MediaTab({ fighter, onMessage, onRefreshFighter }) {
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState("HUB"); // HUB | PODCAST | DOCUMENTARY | ARCHIVE
    const fighterId = fighter?._id;

    const load = useCallback(async () => {
        if (!fighterId) return;
        setLoading(true);
        try {
            const s = await api.getMediaState(fighterId);
            setState(s);
        } catch (e) {
            onMessage?.(e.message || "Could not load media state");
            setState(null);
        }
        setLoading(false);
    }, [fighterId, onMessage]);

    useEffect(() => { load(); }, [load]);

    if (loading || !state) {
        return (
            <section className="media-tab">
                <div className="media-loading">Loading media hub…</div>
            </section>
        );
    }

    if (view === "PODCAST") {
        return (
            <PodcastView
                fighter={fighter}
                state={state}
                onBack={() => { setView("HUB"); load(); }}
                onMessage={onMessage}
                onRefreshFighter={onRefreshFighter}
                onReload={load}
            />
        );
    }
    if (view === "DOCUMENTARY") {
        return (
            <DocumentaryView
                fighter={fighter}
                state={state}
                onBack={() => { setView("HUB"); load(); }}
                onMessage={onMessage}
                onRefreshFighter={onRefreshFighter}
                onReload={load}
            />
        );
    }
    if (view === "ARCHIVE") {
        return (
            <ArchiveView
                fighter={fighter}
                onBack={() => setView("HUB")}
                onMessage={onMessage}
            />
        );
    }

    // HUB
    return (
        <section className="media-tab">
            <header className="media-header">
                <h2>Media</h2>
                <div className="media-header-sub">
                    Fame: <strong>{(state.fame || 0).toLocaleString()}</strong>
                </div>
            </header>

            <div className="media-tiles">
                <MediaTile
                    icon="🎙"
                    title="Podcast"
                    sub={state.podcast.canPodcast
                        ? `${state.podcast.energyCost} energy · ready`
                        : `Next: ${formatCooldown(state.podcast.cooldownEndsAt)}`}
                    desc="Recap your last fight, talk about the division, or log a main-event prediction."
                    primary={state.podcast.canPodcast ? "Record" : "On cooldown"}
                    disabled={!state.podcast.canPodcast}
                    onClick={() => setView("PODCAST")}
                />
                <MediaTile
                    icon="🎬"
                    title="Documentary"
                    sub={state.documentary.used
                        ? "Already released"
                        : state.documentary.unlocked
                            ? "Ready to record"
                            : `Unlocks at ${state.documentary.unlockTier.replace("_", " ").toLowerCase()} fame`}
                    desc={`Once per career: +${state.documentary.fameReward} fame, +${state.documentary.ironReward} ⊗, Legacy badge.`}
                    primary={state.documentary.used
                        ? "Released"
                        : state.documentary.unlocked
                            ? "Record"
                            : "Locked"}
                    disabled={state.documentary.used || !state.documentary.unlocked}
                    onClick={() => setView("DOCUMENTARY")}
                />
                <MediaTile
                    icon="📝"
                    title="Interview Archive"
                    sub={`${state.podcast.count || 0} podcasts logged`}
                    desc="Read back every post-fight interview you've given."
                    primary="Browse"
                    onClick={() => setView("ARCHIVE")}
                />
            </div>

            <FlagsStrip state={state} />
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Tile + Flags strip
// ─────────────────────────────────────────────────────────────

function MediaTile({ icon, title, sub, desc, primary, disabled, onClick }) {
    return (
        <button type="button" className={`media-tile ${disabled ? "media-tile-disabled" : ""}`} onClick={onClick} disabled={disabled}>
            <div className="media-tile-icon">{icon}</div>
            <div className="media-tile-title">{title}</div>
            <div className="media-tile-sub">{sub}</div>
            <div className="media-tile-desc">{desc}</div>
            <div className={`media-tile-cta ${disabled ? "muted" : ""}`}>{primary}</div>
        </button>
    );
}

function FlagsStrip({ state }) {
    const beef = state.flags?.beef || [];
    const respect = state.flags?.respect || [];
    if (beef.length === 0 && respect.length === 0) return null;

    return (
        <section className="media-flags">
            <h3>Active Flags</h3>
            <div className="media-flags-grid">
                {beef.map((b) => (
                    <div key={`b-${b.opponentId}`} className="media-flag media-flag-beef">
                        <span className="media-flag-icon">🔥</span>
                        <div>
                            <div className="media-flag-name">Beef: {b.opponentName}</div>
                            <div className="media-flag-meta">Expires after {b.expiresAfterFights} more fight{b.expiresAfterFights === 1 ? "" : "s"}</div>
                        </div>
                    </div>
                ))}
                {respect.map((r) => (
                    <div key={`r-${r.opponentId}`} className="media-flag media-flag-respect">
                        <span className="media-flag-icon">🙇</span>
                        <div>
                            <div className="media-flag-name">Respect: {r.opponentName}</div>
                            <div className="media-flag-meta">+15% iron if you beat them next</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Podcast view
// ─────────────────────────────────────────────────────────────

function PodcastView({ fighter, state, onBack, onMessage, onRefreshFighter, onReload }) {
    const [segment, setSegment] = useState(null); // null | RECAP | DIVISION | PREDICT
    const [roster, setRoster] = useState([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [target, setTarget] = useState(null);
    const [tone, setTone] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    const loadRoster = useCallback(async () => {
        if (!fighter?._id) return;
        setRosterLoading(true);
        try {
            const res = await api.getDivisionRoster(fighter._id);
            setRoster(res.roster || []);
        } catch (e) {
            onMessage?.(e.message || "Could not load roster");
        }
        setRosterLoading(false);
    }, [fighter, onMessage]);

    useEffect(() => {
        if (segment === "DIVISION" && roster.length === 0 && !rosterLoading) loadRoster();
    }, [segment, roster.length, rosterLoading, loadRoster]);

    const canPodcast = state.podcast.canPodcast;

    const submit = useCallback(async (body) => {
        if (!fighter?._id) return;
        setSubmitting(true);
        try {
            const res = await api.doPodcast(fighter._id, body);
            setResult(res);
            onMessage?.(`Podcast aired — ${res.fameDelta > 0 ? `+${res.fameDelta}` : res.fameDelta} fame`);
            if (onRefreshFighter) onRefreshFighter(fighter._id);
        } catch (e) {
            onMessage?.(e.message || "Could not air podcast");
        }
        setSubmitting(false);
    }, [fighter, onMessage, onRefreshFighter]);

    if (result) {
        return (
            <section className="media-tab">
                <button type="button" className="media-back" onClick={() => { setResult(null); onReload(); onBack(); }}>← Back to Media</button>
                <div className="podcast-result">
                    <div className="podcast-result-icon">🎙</div>
                    <h3>Podcast aired</h3>
                    <div className="podcast-result-line"><strong>{result.fameReason}</strong></div>
                    <div className="podcast-result-rewards">
                        {result.fameDelta !== 0 && <span>{result.fameDelta > 0 ? `+${result.fameDelta}` : result.fameDelta} fame</span>}
                        {result.ironDelta > 0 && <span>+{result.ironDelta} ⊗</span>}
                    </div>
                    {result.extra?.flag === "beef" && (
                        <div className="podcast-result-note">
                            🔥 Beef flag on <strong>{result.extra.opponentName}</strong> — back it up within {result.extra.expiresAfterFights} fights or lose fame.
                        </div>
                    )}
                    {result.extra?.flag === "respect" && (
                        <div className="podcast-result-note">
                            🙇 Respect flag on <strong>{result.extra.opponentName}</strong> — +15% iron if you beat them.
                        </div>
                    )}
                    {result.extra?.prediction && (
                        <div className="podcast-result-note">
                            Prediction locked on the main event — check the Events tab at resolution.
                        </div>
                    )}
                    <div className="podcast-result-cooldown">
                        Next podcast: {formatCooldown(result.cooldownEndsAt)}.
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="media-tab">
            <button type="button" className="media-back" onClick={onBack}>← Back to Media</button>

            {!canPodcast && (
                <div className="media-cooldown">
                    On cooldown — next podcast: {formatCooldown(state.podcast.cooldownEndsAt)}.
                </div>
            )}

            {!segment && (
                <div className="podcast-segments">
                    <SegmentCard
                        icon="🎙"
                        title="Recap your last fight"
                        desc="Talk about the finish. Small fame + small iron. Safe pick."
                        reward="+100 fame · +150 ⊗"
                        disabled={!canPodcast || !state.podcast.hasLastFight}
                        locked={!state.podcast.hasLastFight ? "No completed fight to recap" : null}
                        onClick={() => setSegment("RECAP")}
                    />
                    <SegmentCard
                        icon="📣"
                        title="Talk about the division"
                        desc="Pick a fighter, pick a tone. Trash talk creates beef, respect creates an iron bonus."
                        reward="up to +300 fame"
                        disabled={!canPodcast}
                        onClick={() => setSegment("DIVISION")}
                    />
                    <SegmentCard
                        icon="🔮"
                        title="Predict the main event"
                        desc="Log a prediction on this week's main event. Rewards paid when it resolves."
                        reward="see Events tab"
                        disabled={!canPodcast}
                        onClick={() => { onMessage?.("Head to Events tab to submit a prediction — the podcast covers it when you do."); onBack(); }}
                    />
                </div>
            )}

            {segment === "RECAP" && (
                <div className="podcast-confirm">
                    <h3>Recap your last fight</h3>
                    <p>Straightforward recap. +100 fame, +150 ⊗.</p>
                    <div className="podcast-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setSegment(null)} disabled={submitting}>Back</button>
                        <button type="button" className="btn btn-primary" onClick={() => submit({ segment: "RECAP" })} disabled={submitting}>
                            {submitting ? "Airing…" : "Air it"}
                        </button>
                    </div>
                </div>
            )}

            {segment === "DIVISION" && (
                <div className="podcast-division">
                    <h3>Talk about the division</h3>
                    <p className="podcast-sub">Pick a fighter from your weight class and tier, then choose a tone.</p>

                    {rosterLoading && <div className="media-loading">Loading roster…</div>}
                    {!rosterLoading && roster.length === 0 && (
                        <div className="media-empty">No valid targets right now.</div>
                    )}
                    {!rosterLoading && roster.length > 0 && (
                        <div className="podcast-roster">
                            {roster.map((o) => (
                                <button
                                    type="button"
                                    key={o.id}
                                    className={`podcast-roster-card ${target?.id === o.id ? "selected" : ""}`}
                                    onClick={() => setTarget(o)}
                                >
                                    <div className="podcast-roster-head">
                                        <span>{o.name}{o.nickname ? ` "${o.nickname}"` : ""}</span>
                                        {o.hasBeef && <span className="podcast-flag-chip media-flag-beef-chip">🔥 Beef</span>}
                                        {o.hasRespect && <span className="podcast-flag-chip media-flag-respect-chip">🙇 Respect</span>}
                                    </div>
                                    <div className="podcast-roster-meta">
                                        <span>{o.style}</span>
                                        <span>OVR {o.overallRating}</span>
                                        <span>{recordStr(o.record)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {target && (
                        <div className="podcast-tones">
                            <div className="podcast-tone-label">Tone</div>
                            <div className="podcast-tones-grid">
                                {Object.entries(TONE_DEFS).map(([key, def]) => (
                                    <button
                                        type="button"
                                        key={key}
                                        className={`podcast-tone ${tone === key ? "selected" : ""}`}
                                        onClick={() => setTone(key)}
                                    >
                                        <div className="podcast-tone-icon">{def.icon}</div>
                                        <div className="podcast-tone-title">{def.label}</div>
                                        <div className="podcast-tone-desc">{def.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="podcast-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => { setSegment(null); setTarget(null); setTone(null); }} disabled={submitting}>
                            Back
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!target || !tone || submitting}
                            onClick={() => submit({ segment: "DIVISION", targetOpponentId: target.id, tone })}
                        >
                            {submitting ? "Airing…" : tone ? `Go on air — ${TONE_DEFS[tone].label}` : "Pick a tone"}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

function SegmentCard({ icon, title, desc, reward, disabled, locked, onClick }) {
    return (
        <button type="button" className={`podcast-segment ${disabled ? "disabled" : ""}`} onClick={onClick} disabled={disabled} title={locked || undefined}>
            <div className="podcast-segment-icon">{icon}</div>
            <div className="podcast-segment-title">{title}</div>
            <div className="podcast-segment-desc">{desc}</div>
            <div className="podcast-segment-reward">{reward}</div>
            {locked && <div className="podcast-segment-locked">🔒 {locked}</div>}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// Documentary view
// ─────────────────────────────────────────────────────────────

function DocumentaryView({ fighter, state, onBack, onMessage, onRefreshFighter, onReload }) {
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    const record = async () => {
        if (!fighter?._id) return;
        if (!window.confirm("Commission your career documentary? This is a one-time event.")) return;
        setSubmitting(true);
        try {
            const res = await api.doDocumentary(fighter._id);
            setResult(res);
            onMessage?.(`Documentary released — +${res.fameDelta} fame, +${res.ironDelta} ⊗`);
            if (onRefreshFighter) onRefreshFighter(fighter._id);
        } catch (e) {
            onMessage?.(e.message || "Could not record documentary");
        }
        setSubmitting(false);
    };

    if (result) {
        return (
            <section className="media-tab">
                <button type="button" className="media-back" onClick={() => { onReload(); onBack(); }}>← Back to Media</button>
                <div className="documentary-result">
                    <div className="documentary-icon">🎬</div>
                    <h3>Documentary Released</h3>
                    <p>Your career, pressed to film. The division won't forget.</p>
                    <div className="documentary-rewards">
                        <div>+{result.fameDelta} fame</div>
                        <div>+{result.ironDelta} ⊗</div>
                        <div>Badge: <strong>{result.badge}</strong> (unlocks Legacy banner piece)</div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="media-tab">
            <button type="button" className="media-back" onClick={onBack}>← Back to Media</button>
            <div className="documentary-panel">
                <div className="documentary-icon">🎬</div>
                <h3>Career Documentary</h3>
                <p>
                    A one-time broadcast of your career highlights. Pay the fame tax only once — the
                    Legacy badge is permanent and will appear on your banner.
                </p>
                <div className="documentary-rewards">
                    <div>+{state.documentary.fameReward} fame</div>
                    <div>+{state.documentary.ironReward} ⊗</div>
                    <div>Unlocks the <strong>Legacy</strong> banner badge</div>
                </div>
                <div className="documentary-actions">
                    {state.documentary.used ? (
                        <div className="documentary-already">You've already released your documentary.</div>
                    ) : !state.documentary.unlocked ? (
                        <div className="documentary-locked">
                            🔒 Unlocks at <strong>{state.documentary.unlockTier.replace("_", " ")}</strong> fame tier.
                        </div>
                    ) : (
                        <button type="button" className="btn btn-primary" onClick={record} disabled={submitting}>
                            {submitting ? "Releasing…" : "Release the documentary"}
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Archive view
// ─────────────────────────────────────────────────────────────

function ArchiveView({ fighter, onBack, onMessage }) {
    const [archive, setArchive] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!fighter?._id) return;
            setLoading(true);
            try {
                const res = await api.getInterviewArchive(fighter._id, 30);
                if (alive) setArchive(res.archive || []);
            } catch (e) {
                if (alive) onMessage?.(e.message || "Could not load archive");
            }
            if (alive) setLoading(false);
        })();
        return () => { alive = false; };
    }, [fighter, onMessage]);

    return (
        <section className="media-tab">
            <button type="button" className="media-back" onClick={onBack}>← Back to Media</button>
            <h3 className="archive-title">Interview Archive</h3>

            {loading && <div className="media-loading">Loading…</div>}
            {!loading && archive.length === 0 && (
                <div className="media-empty">No interviews on the books yet. Post-fight interviews are logged here after every bout.</div>
            )}
            {!loading && archive.length > 0 && (
                <ul className="archive-list">
                    {archive.map((e) => (
                        <li key={e.id} className={`archive-row archive-${(e.interview?.choice || "").toLowerCase()}`}>
                            <div className="archive-row-main">
                                <div className="archive-outcome">{e.outcome}</div>
                                <div className="archive-opponent">vs {e.opponentName}{e.opponentNickname ? ` "${e.opponentNickname}"` : ""}</div>
                                <div className="archive-tier">{e.promotionTier}</div>
                            </div>
                            <div className="archive-tone">
                                {e.interview?.choice || "—"}
                                {e.interview?.fameGained ? <span className="archive-fame"> · +{e.interview.fameGained} fame</span> : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
