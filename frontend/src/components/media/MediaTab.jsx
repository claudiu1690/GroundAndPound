import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import {
    Mic,
    Video,
    FileText,
    Megaphone,
    Sparkles,
    Flame,
    Handshake,
    VenetianMask,
    Lock,
    Coins,
    Star,
    Zap,
    ChevronLeft,
} from "lucide-react";

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
 * - Past    -> "ready"
 * - Today   -> "in 3h" / "in 42m"
 * - Tomorrow (next calendar day) -> "Tomorrow"
 * - Later   -> "in Nd"  (shouldn't happen for 1-day cooldowns, just defensive)
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
    RESPECTFUL: { label: "Respectful", Icon: Handshake, desc: "Pay respect. +15% iron if you later beat them." },
    TRASH:      { label: "Trash Talk", Icon: Flame, desc: "+300 fame. Beef flag: +30% fame on grudge win. −150 if they never show." },
    CRYPTIC:    { label: "Cryptic",    Icon: VenetianMask, desc: "Say nothing. Say everything. +40 fame, no strings." },
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
    const canPodcast = state.podcast.canPodcast;
    const docUsed = state.documentary.used;
    const docUnlocked = state.documentary.unlocked;
    const docLocked = !docUnlocked && !docUsed;
    const podcastCount = state.podcast.count || 0;

    return (
        <section className="media-tab">
            <header className="page-header">
                <div className="page-header-left">
                    <div className="page-eyebrow">Press &amp; Media</div>
                    <h1 className="page-title">Media Hub</h1>
                </div>
                <div className="fame-badge">
                    <span className="fame-label">Fame</span>
                    <span className="fame-val">{(state.fame || 0).toLocaleString()}</span>
                </div>
            </header>

            <div className="body">
                {/* Podcast card */}
                <div className="media-card">
                    <div className="media-card-accent podcast" />
                    <div className="media-card-icon">
                        <div className="media-icon tone-red"><Mic size={20} /></div>
                    </div>
                    <div className="media-card-body">
                        <div className="media-card-top">
                            <div className="media-name available">Podcast</div>
                            {canPodcast ? (
                                <span className="media-status ready">Ready</span>
                            ) : (
                                <span className="media-status cooldown">{formatCooldown(state.podcast.cooldownEndsAt)}</span>
                            )}
                        </div>
                        <div className="media-desc">Recap your last fight, talk about the division, or log a main-event prediction.</div>
                        <div className="media-meta">
                            <Zap size={11} /> {state.podcast.energyCost} energy per episode
                            <span className="media-dot" />
                            {podcastCount} episodes recorded
                        </div>
                    </div>
                    <div className="media-card-action">
                        {canPodcast ? (
                            <button className="media-action-btn record" onClick={() => setView("PODCAST")}>Record</button>
                        ) : (
                            <button className="media-action-btn record" disabled>On cooldown</button>
                        )}
                    </div>
                </div>

                {/* Documentary card */}
                <div className={`media-card${docLocked ? " locked-card" : ""}`}>
                    <div className="media-card-accent docu" />
                    <div className="media-card-icon">
                        <div className="media-icon tone-grey"><Video size={20} /></div>
                    </div>
                    <div className="media-card-body">
                        <div className="media-card-top">
                            <div className={`media-name ${docLocked ? "locked" : "available"}`}>Documentary</div>
                            {docUsed ? (
                                <span className="media-status locked-tag">Released</span>
                            ) : docLocked ? (
                                <span className="media-status locked-tag"><Lock size={11} /> Locked</span>
                            ) : (
                                <span className="media-status ready">Ready</span>
                            )}
                        </div>
                        {docLocked ? (
                            <div className="media-desc locked">Once per career — a full feature on your journey.</div>
                        ) : (
                            <div className="media-desc">A one-time broadcast of your career highlights.</div>
                        )}
                        {docLocked && (
                            <div className="media-unlock">
                                <Star size={12} /> Unlocks at {state.documentary.unlockTier.replace("_", " ").toLowerCase()} tier
                            </div>
                        )}
                        {!docUsed && (
                            <div className="rewards-strip">
                                <span className="reward-chip gold">+{state.documentary.fameReward} Fame</span>
                                <span className="reward-chip gold">+{state.documentary.ironReward} Iron</span>
                                <span className="reward-chip">Legacy Badge</span>
                            </div>
                        )}
                    </div>
                    <div className="media-card-action">
                        {docUsed ? (
                            <button className="media-action-btn record" disabled>Released</button>
                        ) : docLocked ? (
                            <div className="media-action-locked"><Lock size={13} /> Locked</div>
                        ) : (
                            <button className="media-action-btn record" onClick={() => setView("DOCUMENTARY")}>Record</button>
                        )}
                    </div>
                </div>

                {/* Archive card */}
                <div className="media-card">
                    <div className="media-card-accent archive" />
                    <div className="media-card-icon">
                        <div className="media-icon tone-blue"><FileText size={20} /></div>
                    </div>
                    <div className="media-card-body">
                        <div className="media-card-top">
                            <div className="media-name available">Interview Archive</div>
                            <span className="media-status empty">{podcastCount} Logged</span>
                        </div>
                        <div className="media-desc">Read back every post-fight interview you've given.</div>
                        <div className="media-meta">
                            {podcastCount > 0 ? `${podcastCount} entries` : "No interviews logged yet"}
                        </div>
                    </div>
                    <div className="media-card-action">
                        <button className="media-action-btn browse" onClick={() => setView("ARCHIVE")}>Browse</button>
                    </div>
                </div>

                <FlagsStrip state={state} />
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// Flags strip
// ─────────────────────────────────────────────────────────────

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
                        <span className="media-flag-icon"><Flame size={16} /></span>
                        <div>
                            <div className="media-flag-name">Beef: {b.opponentName}</div>
                            <div className="media-flag-meta">Expires after {b.expiresAfterFights} more fight{b.expiresAfterFights === 1 ? "" : "s"}</div>
                        </div>
                    </div>
                ))}
                {respect.map((r) => (
                    <div key={`r-${r.opponentId}`} className="media-flag media-flag-respect">
                        <span className="media-flag-icon"><Handshake size={16} /></span>
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
                <button type="button" className="media-back" onClick={() => { setResult(null); onReload(); onBack(); }}><ChevronLeft size={14} /> Back to Media</button>
                <div className="media-subview-body">
                    <div className="podcast-result">
                        <div className="podcast-result-icon"><Mic size={32} /></div>
                        <h3>Podcast aired</h3>
                        <div className="podcast-result-line"><strong>{result.fameReason}</strong></div>
                        <div className="podcast-result-rewards">
                            {result.fameDelta !== 0 && <span>{result.fameDelta > 0 ? `+${result.fameDelta}` : result.fameDelta} fame</span>}
                            {result.ironDelta > 0 && <span>+{result.ironDelta} <Coins size={13} /></span>}
                        </div>
                        {result.extra?.flag === "beef" && (
                            <div className="podcast-result-note">
                                <Flame size={13} /> Beef flag on <strong>{result.extra.opponentName}</strong> — back it up within {result.extra.expiresAfterFights} fights or lose fame.
                            </div>
                        )}
                        {result.extra?.flag === "respect" && (
                            <div className="podcast-result-note">
                                <Handshake size={13} /> Respect flag on <strong>{result.extra.opponentName}</strong> — +15% iron if you beat them.
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
                </div>
            </section>
        );
    }

    return (
        <section className="media-tab">
            <button type="button" className="media-back" onClick={onBack}><ChevronLeft size={14} /> Back to Media</button>

            <div className="media-subview-body">
                {!canPodcast && (
                    <div className="media-cooldown">
                        On cooldown — next podcast: {formatCooldown(state.podcast.cooldownEndsAt)}.
                    </div>
                )}

                {!segment && (
                    <div className="podcast-segments">
                        <SegmentCard
                            Icon={Mic}
                            title="Recap your last fight"
                            desc="Talk about the finish. Small fame + small iron. Safe pick."
                            reward={<>+100 fame · +150 <Coins size={12} /></>}
                            disabled={!canPodcast || !state.podcast.hasLastFight}
                            locked={!state.podcast.hasLastFight ? "No completed fight to recap" : null}
                            onClick={() => setSegment("RECAP")}
                        />
                        <SegmentCard
                            Icon={Megaphone}
                            title="Talk about the division"
                            desc="Pick a fighter, pick a tone. Trash talk creates beef, respect creates an iron bonus."
                            reward="up to +300 fame"
                            disabled={!canPodcast}
                            onClick={() => setSegment("DIVISION")}
                        />
                        <SegmentCard
                            Icon={Sparkles}
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
                        <p>Straightforward recap. +100 fame, +150 iron.</p>
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
                                            {o.hasBeef && <span className="podcast-flag-chip media-flag-beef-chip"><Flame size={11} /> Beef</span>}
                                            {o.hasRespect && <span className="podcast-flag-chip media-flag-respect-chip"><Handshake size={11} /> Respect</span>}
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
                                            <div className="podcast-tone-icon"><def.Icon size={18} /></div>
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
            </div>
        </section>
    );
}

function SegmentCard({ Icon, title, desc, reward, disabled, locked, onClick }) {
    return (
        <button type="button" className={`podcast-segment ${disabled ? "disabled" : ""}`} onClick={onClick} disabled={disabled} title={locked || undefined}>
            <div className="podcast-segment-icon"><Icon size={20} /></div>
            <div className="podcast-segment-title">{title}</div>
            <div className="podcast-segment-desc">{desc}</div>
            <div className="podcast-segment-reward">{reward}</div>
            {locked && <div className="podcast-segment-locked"><Lock size={12} /> {locked}</div>}
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
            onMessage?.(`Documentary released — +${res.fameDelta} fame, +${res.ironDelta} iron`);
            if (onRefreshFighter) onRefreshFighter(fighter._id);
        } catch (e) {
            onMessage?.(e.message || "Could not record documentary");
        }
        setSubmitting(false);
    };

    if (result) {
        return (
            <section className="media-tab">
                <button type="button" className="media-back" onClick={() => { onReload(); onBack(); }}><ChevronLeft size={14} /> Back to Media</button>
                <div className="media-subview-body">
                    <div className="documentary-result">
                        <div className="documentary-icon"><Video size={40} /></div>
                        <h3>Documentary Released</h3>
                        <p>Your career, pressed to film. The division won't forget.</p>
                        <div className="documentary-rewards">
                            <div>+{result.fameDelta} fame</div>
                            <div>+{result.ironDelta} <Coins size={13} /></div>
                            <div>Badge: <strong>{result.badge}</strong> (unlocks Legacy banner piece)</div>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="media-tab">
            <button type="button" className="media-back" onClick={onBack}><ChevronLeft size={14} /> Back to Media</button>
            <div className="media-subview-body">
                <div className="documentary-panel">
                    <div className="documentary-icon"><Video size={40} /></div>
                    <h3>Career Documentary</h3>
                    <p>
                        A one-time broadcast of your career highlights. Pay the fame tax only once — the
                        Legacy badge is permanent and will appear on your banner.
                    </p>
                    <div className="documentary-rewards">
                        <div>+{state.documentary.fameReward} fame</div>
                        <div>+{state.documentary.ironReward} <Coins size={13} /></div>
                        <div>Unlocks the <strong>Legacy</strong> banner badge</div>
                    </div>
                    <div className="documentary-actions">
                        {state.documentary.used ? (
                            <div className="documentary-already">You've already released your documentary.</div>
                        ) : !state.documentary.unlocked ? (
                            <div className="documentary-locked">
                                <Lock size={13} /> Unlocks at <strong>{state.documentary.unlockTier.replace("_", " ")}</strong> fame tier.
                            </div>
                        ) : (
                            <button type="button" className="btn btn-primary" onClick={record} disabled={submitting}>
                                {submitting ? "Releasing…" : "Release the documentary"}
                            </button>
                        )}
                    </div>
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
            <button type="button" className="media-back" onClick={onBack}><ChevronLeft size={14} /> Back to Media</button>
            <div className="media-subview-body">
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
            </div>
        </section>
    );
}
