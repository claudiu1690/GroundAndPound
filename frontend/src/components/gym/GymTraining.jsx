import { memo, useState, useEffect } from "react";
import { Zap, AlertTriangle, Check, ChevronLeft, Lock, Trophy, Minus, Plus } from "lucide-react";
import { gymImageUrl } from "./gymImage";

// Full session metadata matching backend TRAINING_SESSIONS + rank 2 sessions
export const SESSION_META = {
    bag_work:       { label: "Bag Work",       category: "striking",  cost: 4, stats: ["STR"],  xpBase: 10, desc: "Heavy bag rounds — power and accuracy" },
    footwork:       { label: "Footwork",       category: "striking",  cost: 4, stats: ["SPD"],  xpBase: 10, desc: "Lateral movement, evasion and reaction speed" },
    kick_drills:    { label: "Kick Drills",    category: "striking",  cost: 4, stats: ["LEG"],  xpBase: 10, desc: "Repetitive kick technique on pads and bags" },
    pad_work:       { label: "Pad Work",       category: "striking",  cost: 5, stats: ["STR", "SPD"], xpBase: 10, desc: "Combo work with a coach — power meets reaction" },
    wrestling:      { label: "Wrestling",      category: "grappling", cost: 5, stats: ["WRE"],  xpBase: 10, desc: "Takedowns, cage control, scrambles" },
    clinch:         { label: "Clinch Work",    category: "grappling", cost: 5, stats: ["WRE", "STR"], xpBase: 10, desc: "Cage clinches, dirty boxing, body locks" },
    bjj:            { label: "BJJ",            category: "grappling", cost: 6, stats: ["GND", "SUB"], xpBase: 10, desc: "Ground game, sweeps, transitions, guard work" },
    submission:     { label: "Submissions",    category: "grappling", cost: 6, stats: ["SUB"],  xpBase: 10, desc: "Choke and joint-lock mechanics — attack chains and escapes" },
    sparring:       { label: "Sparring",       category: "sparring",  cost: 8, stats: ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"], xpBase: 12, desc: "Full-contact rounds — highest XP, builds chin and IQ", warn: "3% injury risk" },
    film_study:     { label: "Film Study",     category: "mental",    cost: 3, stats: ["FIQ"],  xpBase: 10, desc: "Opponent breakdown — raises Fight IQ" },
    strength_conditioning: { label: "Conditioning", category: "physical", cost: 4, stats: [], xpBase: 0, desc: "+1 Max Stamina (cap 120)", special: "Max Stamina" },
    // Rank 2 unique sessions
    combination_drilling: { label: "Combination Drilling", category: "striking",  cost: 5, stats: ["STR", "SPD"], xpBase: 10, desc: "Advanced boxing combos (+15% XP)", rank2: true },
    switch_kick_mastery:  { label: "Switch Kick Mastery",  category: "striking",  cost: 5, stats: ["LEG", "SPD"], xpBase: 10, desc: "Dynamic kick switching (+15% XP)", rank2: true },
    chain_wrestling:      { label: "Chain Wrestling",      category: "grappling", cost: 6, stats: ["WRE", "GND"], xpBase: 10, desc: "Continuous wrestling chains (+15% XP)", rank2: true },
    advanced_guard_work:  { label: "Advanced Guard Work",  category: "grappling", cost: 6, stats: ["GND", "SUB"], xpBase: 10, desc: "Elite guard techniques (+15% XP)", rank2: true },
    clinch_knees:         { label: "Clinch Knees",         category: "striking",  cost: 5, stats: ["LEG", "CHN"], xpBase: 10, desc: "Knees from clinch range (+15% XP)", rank2: true },
    transition_mastery:   { label: "Transition Mastery",   category: "grappling", cost: 6, stats: ["SUB", "FIQ"], xpBase: 10, desc: "Sub transitions + IQ (+15% XP)", rank2: true },
    counter_timing:       { label: "Counter Timing",       category: "striking",  cost: 5, stats: ["SPD", "FIQ"], xpBase: 10, desc: "Counter-strike timing (+15% XP)", rank2: true },
    power_wrestling:      { label: "Power Wrestling",      category: "grappling", cost: 6, stats: ["STR", "WRE"], xpBase: 10, desc: "Strength-based wrestling (+15% XP)", rank2: true },
    strategic_sparring:   { label: "Strategic Sparring",   category: "sparring",  cost: 7, stats: ["FIQ", "GND"], xpBase: 10, desc: "Tactical sparring (+15% XP)", rank2: true, warn: "3% injury risk" },
    championship_rounds:  { label: "Championship Rounds",  category: "sparring",  cost: 8, stats: ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"], xpBase: 12, desc: "Elite full-contact (+10% XP)", rank2: true, warn: "3% injury risk" },
};

// Kept exported to avoid breaking any importer (TrainingResultPopup uses .stat-chip classes).
export const STAT_CHIP_CLASS = {
    STR: "stat-chip-str", SPD: "stat-chip-spd", LEG: "stat-chip-leg",
    WRE: "stat-chip-wre", GND: "stat-chip-gnd", SUB: "stat-chip-sub",
    CHN: "stat-chip-chn", FIQ: "stat-chip-fiq",
};

// Accent-bar colors per stat (mockup reference).
const STAT_COLOR = {
    STR: "#C8102E", SPD: "#3B82F6", LEG: "#22C55E", WRE: "#F97316",
    GND: "#EAB308", SUB: "#14B8A6", CHN: "#A855F7", FIQ: "#6366F1",
};

const GOLD = "#D4A820";

const SPARRING_KEYS = new Set(["sparring", "strategic_sparring", "championship_rounds"]);
const PRESETS = [1, 5, 10];
const MAX_BATCH = 25;

/**
 * Per-card quantity control: stepper + presets + Max + live cost line + dynamic
 * Train button. Holds its own N (clamped to [1, cardMax]). cardMax derives from
 * the energy/cost passed in each render; when energy drops post-batch we clamp
 * N down. cardMax is guaranteed >= 1 by the caller (cardMax===0 falls through to
 * the "Need {cost}E" branch instead of rendering this control).
 */
function SessionTrainControl({ sessionKey, cost, energy, cardMax, isSparring, busy, onTrain }) {
    const [n, setN] = useState(1);

    // Clamp N down when cardMax shrinks (e.g. energy spent by a prior batch).
    useEffect(() => {
        setN((prev) => Math.min(Math.max(1, prev), cardMax));
    }, [cardMax]);

    const safeN = Math.min(Math.max(1, n), cardMax);
    const totalCost = safeN * cost;
    const after = energy - totalCost;
    const injuryPct = Math.round((1 - (1 - 0.03) ** safeN) * 100);

    return (
        <div className="session-train-control">
            {isSparring && (
                <div className="session-card-warn session-injury-hint">
                    <AlertTriangle size={9} /> ~{injuryPct}% chance of injury over {safeN} round{safeN > 1 ? "s" : ""}
                </div>
            )}
            <div className="session-qty-row">
                <div className="session-stepper" role="group" aria-label="Sessions">
                    <button
                        type="button"
                        className="session-stepper-btn"
                        aria-label="One fewer session"
                        disabled={safeN <= 1 || busy}
                        onClick={() => setN((p) => Math.max(1, Math.min(p, cardMax) - 1))}
                    >
                        <Minus size={12} />
                    </button>
                    <span className="session-stepper-n">{safeN}</span>
                    <button
                        type="button"
                        className="session-stepper-btn"
                        aria-label="One more session"
                        disabled={safeN >= cardMax || busy}
                        onClick={() => setN((p) => Math.min(cardMax, Math.min(p, cardMax) + 1))}
                    >
                        <Plus size={12} />
                    </button>
                </div>
                <div className="session-presets">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className={`session-preset${safeN === preset ? " active" : ""}`}
                            disabled={preset > cardMax || busy}
                            onClick={() => setN(Math.min(preset, cardMax))}
                        >
                            {preset}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={`session-preset${safeN === cardMax ? " active" : ""}`}
                        disabled={busy}
                        onClick={() => setN(cardMax)}
                    >
                        Max
                    </button>
                </div>
            </div>
            <div className="session-live-line">
                {safeN} session{safeN > 1 ? "s" : ""} · {totalCost}E · {after}E after
            </div>
            <button
                type="button"
                className="session-card-btn session-train-btn"
                disabled={busy}
                onClick={() => onTrain(sessionKey, safeN)}
            >
                {safeN > 1 ? `Train ×${safeN}` : "Train"}
            </button>
        </div>
    );
}

export const GymTraining = memo(function GymTraining({
    gym,
    fighter,
    allGyms,
    onTrain,
    training,
    onBack,
    onSwitchGym,
    onRankUp,
    flashSessionKey,
}) {
    const heroUrl = gymImageUrl(gym?.name);

    // Preload the hero so the header paints without a flash on click-resolve.
    useEffect(() => {
        if (heroUrl) {
            const img = new Image();
            img.src = heroUrl;
        }
    }, [heroUrl]);

    if (!fighter || !gym) return null;

    const energy = fighter.energy?.current ?? fighter.energy ?? 0;
    const isFree = gym.isFreeGym;
    const isActive = gym.membership?.isActive;
    const canTrain = isFree || isActive;
    const injuryLocked = new Set(fighter?.injuryLockedStats || []);

    const rank2SessionDef = gym.ranks?.find((r) => r.rank === 2);
    const rank2SessionKey = rank2SessionDef?.unlock?.sessionKey;
    const rank2Unlocked = (gym.progress?.rank ?? 0) >= 2;

    const displaySessions = [...(gym.sessions || [])];
    if (rank2SessionKey && !displaySessions.includes(rank2SessionKey)) {
        displaySessions.push(rank2SessionKey);
    }

    const otherSessions = Object.keys(SESSION_META).filter(
        (k) => !SESSION_META[k].rank2 && !displaySessions.includes(k)
    );

    function findGymForSession(key) {
        for (const g of (allGyms || [])) {
            if (g._id === gym._id) continue;
            if (g.sessions?.includes(key)) return g.name;
        }
        return null;
    }

    const currentRank = gym.progress?.rank ?? 0;
    const sortedRanks = (gym.ranks || []).slice().sort((a, b) => a.rank - b.rank);
    const next = (gym.ranks || []).find((r) => r.rank === currentRank + 1);

    function rankUnlockText(r) {
        if (!r.unlock) return null;
        switch (r.unlock.type) {
            case "access": return "Sessions unlocked";
            case "session": return SESSION_META[r.unlock.sessionKey]?.label ?? r.unlock.sessionKey;
            case "xpBonus": return `+${r.unlock.xpBonusPct}% XP bonus`;
            case "perk": return "Corner perk + badge";
            default: return null;
        }
    }

    return (
        <div className="gym-training">
            {/* STRIP 1 — Header */}
            <div
                className="gym-header gym-header-hero"
                data-tut="gym-info"
                style={{ backgroundImage: heroUrl ? `url(${heroUrl})` : undefined }}
            >
                <div className="gym-header-overlay" aria-hidden="true" />
                <div className="gym-header-row1">
                    <button type="button" className="gym-back" onClick={onBack}>
                        <ChevronLeft size={12} /> All Gyms
                    </button>
                </div>
                <div className="gym-header-row2">
                    <div className="gym-title">{gym.name}</div>
                    <div className="gym-tags">
                        {!isFree && gym.focusStats?.length ? (
                            <>
                                {gym.focusStats.map((s) => (
                                    <span key={s} className={`gym-tag gym-tag-${s.toLowerCase()}`}>{s}</span>
                                ))}
                                <span className="gym-tag xp">{gym.focusXpMultiplier}× XP</span>
                            </>
                        ) : null}
                        {isFree && (
                            <span className="gym-tag gym-tag-all">All Stats · {gym.xpMultiplier}×</span>
                        )}
                    </div>
                    <div className="gym-header-right">
                        <div className="gym-energy-pill" data-tut="energy">
                            <span className="gym-energy-lbl">Energy</span>
                            <Zap size={12} /> {energy}
                        </div>
                        {!isFree && !isActive && (
                            <button type="button" className="gym-join-btn" onClick={() => onSwitchGym(gym._id)}>
                                Join — ${gym.weeklyCost} / week
                            </button>
                        )}
                        {isActive && (
                            <span className="gym-membership-badge">
                                <Check size={11} /> {gym.membership.daysLeft}d left
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* STRIP 2 — Rank strip */}
            {!isFree && gym.ranks?.length > 0 && (
                <div className="rank-strip">
                    <div className="rank-strip-label">Gym Rank</div>
                    <div className="rank-strip-steps">
                        {sortedRanks.map((r, i) => {
                            const done = currentRank > r.rank;
                            const current = currentRank === r.rank;
                            const isLast = i === sortedRanks.length - 1;
                            return (
                                <div key={r.rank} className="rank-step">
                                    <div className={`rank-step-dot ${current || done ? "current" : "locked"}`}>
                                        {done ? <Check size={11} /> : r.rank}
                                    </div>
                                    <div className="rank-step-info">
                                        <div className={`rank-step-name ${current || done ? "current" : "locked"}`}>{r.name}</div>
                                        <div className="rank-step-unlock">{rankUnlockText(r)}</div>
                                    </div>
                                    {!isLast && <div className="rank-step-line" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Rank up CTA — requirements to reach the next gym rank */}
            {!isFree && gym.progress?.hasJoined && next && currentRank < 4 && (() => {
                const tReq = next.requirements.trainingSessions;
                const tDone = gym.progress.trainingSessions >= tReq;
                const wReq = next.requirements.relevantWins;
                const wDone = gym.progress.relevantWins >= wReq;
                const winChipLabel = gym.relevantWinTypes?.length === 1
                    ? `${gym.relevantWinTypes[0]} wins`
                    : "Wins";
                const ironCost = next.requirements.ironCost || 0;
                return (
                    <div className="rank-upcta">
                        <div className="rank-upcta-head">
                            <span className="rank-upcta-eyebrow">Next Rank</span>
                            <span className="rank-upcta-name">{next.name}</span>
                        </div>
                        <div className="rank-reqs">
                            <span className={`rank-req-chip${tDone ? " is-done" : ""}`}>
                                {tDone && <Check size={11} />}
                                <span className="rank-req-label">Training</span>
                                <span className="rank-req-val">{Math.min(gym.progress.trainingSessions, tReq)}/{tReq}</span>
                            </span>
                            {wReq > 0 && (
                                <span className={`rank-req-chip${wDone ? " is-done" : ""}`}>
                                    {wDone && <Check size={11} />}
                                    <span className="rank-req-label">{winChipLabel}</span>
                                    <span className="rank-req-val">{Math.min(gym.progress.relevantWins, wReq)}/{wReq}</span>
                                </span>
                            )}
                            {ironCost > 0 && (
                                <span className="rank-req-chip rank-req-chip--fee">
                                    <span className="rank-req-label">Cost</span>
                                    <span className="rank-req-val">${ironCost.toLocaleString()}</span>
                                </span>
                            )}
                        </div>
                        {gym.progress?.nextRank?.canRankUp && gym.progress.nextRank.needsIron && (
                            <button type="button" className="rank-up-btn" onClick={() => onRankUp(gym._id)}>
                                <Trophy size={12} /> Rank Up (${ironCost.toLocaleString()})
                            </button>
                        )}
                    </div>
                );
            })()}

            {/* Max rank achieved */}
            {!isFree && currentRank >= 4 && (
                <div className="rank-maxed">
                    <Trophy size={14} /> Maximum rank achieved — perk active!
                </div>
            )}

            {/* STRIP 3 — Flavor */}
            {gym.description && (
                <div className="flavor-strip">
                    <div className="flavor-text">{gym.description}</div>
                </div>
            )}

            {/* STRIP 4 — Sessions */}
            <div className="sessions-area">
                <div className="sessions-label">Training Sessions</div>
                <div className="session-grid" data-tut="gym-sessions">
                    {displaySessions.map((key) => {
                        const m = SESSION_META[key];
                        if (!m) return null;
                        const stats = m.stats || [];
                        const isLocked = stats.some((s) => injuryLocked.has(s));
                        const notEnoughEnergy = energy < m.cost;
                        const isRank2Locked = !!m.rank2 && !rank2Unlocked && key === rank2SessionKey;
                        const cardLocked = isRank2Locked || isLocked;
                        // Active "Train" branch: the only state that gets the
                        // quantity control. cardMax floor>=1 here because
                        // notEnoughEnergy already covers floor===0.
                        const showQtyControl = !isRank2Locked && canTrain && !isLocked && !notEnoughEnergy;
                        const cardMax = Math.min(Math.floor(energy / m.cost), MAX_BATCH);
                        const isSparring = SPARRING_KEYS.has(key);

                        let accentStyle;
                        if (isRank2Locked || isLocked) {
                            accentStyle = undefined; // class "lock" handles color
                        } else if (stats.length > 2) {
                            accentStyle = { background: GOLD };
                        } else if (stats.length === 2) {
                            const c0 = STAT_COLOR[stats[0]];
                            const c1 = STAT_COLOR[stats[1]];
                            accentStyle = { background: `linear-gradient(90deg, ${c0} 0%, ${c0} 50%, ${c1} 50%, ${c1} 100%)` };
                        } else if (stats.length === 1) {
                            accentStyle = { background: STAT_COLOR[stats[0]] };
                        } else {
                            accentStyle = { background: GOLD };
                        }

                        return (
                            <div key={key} className={`session-card${cardLocked ? " locked-card" : ""}${flashSessionKey === key ? " session-card--flash" : ""}`}>
                                <div
                                    className={`session-card-top${isRank2Locked || isLocked ? " lock" : ""}`}
                                    style={accentStyle}
                                />
                                <div className="session-card-body">
                                    <div className="session-card-header">
                                        <div className={`session-card-name${cardLocked ? " locked" : ""}`}>
                                            {m.label}
                                            {isRank2Locked && <span className="rank-badge">Rank 2</span>}
                                        </div>
                                        <div className="session-card-energy"><Zap size={11} /> {m.cost}E</div>
                                    </div>
                                    <div className="session-card-desc">{m.desc}</div>
                                    {m.warn && !showQtyControl && (
                                        <div className="session-card-warn"><AlertTriangle size={9} /> {m.warn}</div>
                                    )}
                                    <div className="session-card-footer">
                                        <div className="session-card-tags">
                                            {stats.length
                                                ? stats.map((s) => (
                                                    <span key={s} className={`s-tag gym-tag gym-tag-${s.toLowerCase()}`}>{s}</span>
                                                ))
                                                : m.special
                                                ? <span className="s-tag gym-tag gym-tag-all">{m.special}</span>
                                                : null}
                                        </div>
                                        {isRank2Locked ? (
                                            <button type="button" className="session-card-btn locked-btn" disabled>
                                                <Lock size={10} /> Rank 2
                                            </button>
                                        ) : !canTrain ? (
                                            <button type="button" className="session-card-btn inactive" disabled>
                                                Join to Train
                                            </button>
                                        ) : isLocked ? (
                                            <button type="button" className="session-card-btn locked-btn" disabled>
                                                Injury locked
                                            </button>
                                        ) : notEnoughEnergy ? (
                                            <button type="button" className="session-card-btn inactive" disabled>
                                                Need {m.cost}E
                                            </button>
                                        ) : (
                                            <SessionTrainControl
                                                sessionKey={key}
                                                cost={m.cost}
                                                energy={energy}
                                                cardMax={cardMax}
                                                isSparring={isSparring}
                                                busy={!!training}
                                                onTrain={onTrain}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {!isFree && otherSessions.length > 0 && (
                    <>
                        <div className="other-section-label">Available at Other Gyms</div>
                        {otherSessions.map((key) => {
                            const m = SESSION_META[key];
                            const gymName = findGymForSession(key);
                            return (
                                <div key={key} className="other-session">
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                                            <span className="other-session-name">{m.label}</span>
                                            <span className="other-session-tag">{m.stats?.[0] ?? m.special}</span>
                                        </div>
                                        {gymName && <div className="other-session-gym">Available at {gymName}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
});
