import { memo, useState } from "react";
import { formatSessionXpHint } from "../../utils/trainingXpDisplay";
import { Zap, AlertTriangle, Check, ChevronLeft, Lock, Star, Trophy, ArrowUp } from "lucide-react";

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
    recovery:       { label: "Recovery",       category: "recovery",  cost: 3, stats: [], xpBase: 0, desc: "Ice bath and physio — reduces injury timers", special: "Injury heal" },
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

const STAT_CHIP_CLASS = {
    STR: "stat-chip-str", SPD: "stat-chip-spd", LEG: "stat-chip-leg",
    WRE: "stat-chip-wre", GND: "stat-chip-gnd", SUB: "stat-chip-sub",
    CHN: "stat-chip-chn", FIQ: "stat-chip-fiq",
};

const ALL_SESSION_KEYS = Object.keys(SESSION_META);

export const GymTraining = memo(function GymTraining({
    gym,
    fighter,
    allGyms,
    onTrain,
    onBack,
    onSwitchGym,
    onRankUp,
}) {
    const [activeCategory, setActiveCategory] = useState("striking");
    if (!fighter || !gym) return null;

    const energy = fighter.energy?.current ?? fighter.energy ?? 0;
    const isFree = gym.isFreeGym;
    const isActive = gym.membership?.isActive;
    const canTrain = isFree || isActive;
    const injuryLocked = new Set(fighter?.injuryLockedStats || []);

    // Determine available sessions at this gym
    const baseSessions = gym.sessions || [];
    const rank2Key = gym.progress?.rank >= 2
        ? (gym.ranks?.find((r) => r.rank === 2)?.unlock?.sessionKey)
        : null;
    const availableSessions = [...baseSessions];
    if (rank2Key && !availableSessions.includes(rank2Key)) availableSessions.push(rank2Key);

    // Get unique rank 2 session key for this gym (even if not unlocked, for display)
    const rank2SessionDef = gym.ranks?.find((r) => r.rank === 2);
    const rank2SessionKey = rank2SessionDef?.unlock?.sessionKey;
    const rank2Unlocked = gym.progress?.rank >= 2;

    // Sessions from other gyms (greyed out)
    const otherSessions = ALL_SESSION_KEYS.filter((key) => {
        if (SESSION_META[key].rank2) return false; // skip rank 2 sessions for "other" display
        return !availableSessions.includes(key);
    });

    // Find which gym offers each other session
    function findGymForSession(sessionKey) {
        for (const g of (allGyms || [])) {
            if (g._id === gym._id) continue;
            if (g.sessions?.includes(sessionKey)) return g.name;
        }
        return null;
    }

    // Categories present in this gym's sessions
    const categories = [...new Set(
        availableSessions.map((k) => SESSION_META[k]?.category).filter(Boolean)
    )];
    const CATEGORY_LABELS = {
        striking: "Striking", grappling: "Grappling", sparring: "Sparring",
        mental: "Mental", physical: "Physical", recovery: "Recovery",
    };

    const filteredSessions = availableSessions.filter(
        (k) => SESSION_META[k]?.category === activeCategory
    );

    const isSessionInjuryLocked = (meta) => (meta.stats || []).some((s) => injuryLocked.has(s));

    return (
        <div className="gym-training-v2">
            {/* Header */}
            <div className="gt-header">
                <button type="button" className="btn btn-ghost btn-sm gt-back" onClick={onBack}>
                    <ChevronLeft size={14} /> All Gyms
                </button>
                <div className="gt-header-info">
                    <span className="gt-header-name">{gym.name}</span>
                    {!isFree && gym.progress && (
                        <span className="gt-header-rank">
                            <Star size={10} /> {gym.progress.rankName}
                        </span>
                    )}
                </div>
                <div className="gt-header-right">
                    <span className="gt-energy"><Zap size={12} /> {energy}E</span>
                    {!isFree && !isActive && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onSwitchGym(gym._id)}>
                            Join — {gym.weeklyCost} iron/wk
                        </button>
                    )}
                    {isActive && (
                        <span className="gt-membership-badge">
                            <Check size={10} /> {gym.membership.daysLeft}d left
                        </span>
                    )}
                </div>
            </div>

            {/* Gym description */}
            {gym.description && (
                <div className="gt-description">{gym.description}</div>
            )}

            {/* Not a member warning */}
            {!canTrain && (
                <div className="gt-membership-block">
                    <AlertTriangle size={12} /> Join this gym to train here ({gym.weeklyCost} iron/week)
                </div>
            )}

            {/* Category tabs */}
            <div className="th-category-tabs">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        className={`th-cat-tab${activeCategory === cat ? " th-cat-tab--active" : ""}`}
                        onClick={() => setActiveCategory(cat)}
                    >
                        {CATEGORY_LABELS[cat] || cat}
                    </button>
                ))}
            </div>

            {/* Available sessions */}
            <div className="th-sessions">
                {filteredSessions.map((key) => {
                    const m = SESSION_META[key];
                    if (!m) return null;
                    const isLocked = isSessionInjuryLocked(m);
                    const notEnoughEnergy = energy < m.cost;
                    const blocked = isLocked || !canTrain || notEnoughEnergy;
                    const isRank2 = m.rank2;
                    const isRank2Locked = isRank2 && !rank2Unlocked && key === rank2SessionKey;

                    return (
                        <div key={key} className={`th-session-card${isLocked ? " th-session-card--locked" : ""}${isRank2 ? " th-session-card--rank2" : ""}`}>
                            <div className="th-sc-header">
                                <span className="th-sc-name">{m.label}</span>
                                <span className="th-sc-cost">{m.cost}E</span>
                            </div>
                            <p className="th-sc-desc">{m.desc}</p>
                            <div className="th-sc-stats">
                                {m.stats.length > 0 ? m.stats.map((s) => (
                                    <span key={s} className={`stat-chip ${STAT_CHIP_CLASS[s] ?? ""}`}>{s}</span>
                                )) : m.special ? (
                                    <span className="stat-chip stat-chip-special">{m.special}</span>
                                ) : null}
                            </div>
                            {m.warn && <div className="th-sc-warn"><AlertTriangle size={9} /> {m.warn}</div>}

                            {isRank2Locked ? (
                                <div className="th-sc-rank2-lock"><Lock size={10} /> Unlocks at Rank 2</div>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm th-sc-train-btn"
                                    disabled={blocked}
                                    onClick={() => onTrain(key)}
                                >
                                    {isLocked ? "Injury locked" : notEnoughEnergy ? `Need ${m.cost}E` : !canTrain ? "Join gym" : "Train"}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Rank 2 session preview (if not yet unlocked) */}
            {rank2SessionKey && !rank2Unlocked && !filteredSessions.includes(rank2SessionKey) && SESSION_META[rank2SessionKey]?.category === activeCategory && (
                <div className="gt-rank2-preview">
                    <Lock size={12} /> Rank 2 unlocks: <strong>{SESSION_META[rank2SessionKey]?.label}</strong>
                </div>
            )}

            {/* Other sessions (from other gyms, greyed out) — hide for free gym */}
            {!isFree && otherSessions.filter((k) => SESSION_META[k]?.category === activeCategory).length > 0 && (
                <div className="gt-other-sessions">
                    <div className="gt-other-title">Available at other gyms</div>
                    <div className="gt-other-grid">
                        {otherSessions
                            .filter((k) => SESSION_META[k]?.category === activeCategory)
                            .map((key) => {
                                const m = SESSION_META[key];
                                const gymName = findGymForSession(key);
                                return (
                                    <div key={key} className="gt-other-card">
                                        <span className="gt-other-name">{m.label}</span>
                                        <span className="gt-other-stats">
                                            {m.stats.map((s) => s).join(", ") || m.special}
                                        </span>
                                        {gymName && <span className="gt-other-gym">Available at {gymName}</span>}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Rank Progress */}
            {!isFree && gym.ranks?.length > 0 && (
                <div className="gt-rank-progress">
                    <div className="gt-rank-header">
                        <span className="gt-rank-title">
                            {gym.progress?.hasJoined
                                ? `Your Rank: ${gym.progress.rankName}`
                                : "Gym Ranks"}
                        </span>
                    </div>

                    {/* Current rank description */}
                    {gym.progress?.hasJoined && (() => {
                        const currentRankDef = gym.ranks.find((r) => r.rank === gym.progress.rank);
                        return currentRankDef?.description ? (
                            <div className="gt-rank-current-desc">{currentRankDef.description}</div>
                        ) : null;
                    })()}

                    {/* All ranks roadmap */}
                    <div className="gt-rank-roadmap">
                        {gym.ranks.map((r) => {
                            const currentRank = gym.progress?.rank ?? 0;
                            const isDone = currentRank >= r.rank;
                            const isNext = currentRank === r.rank - 1;
                            return (
                                <div key={r.rank} className={`gt-rank-step${isDone ? " gt-rank-step--done" : ""}${isNext ? " gt-rank-step--next" : ""}`}>
                                    <div className="gt-rank-step-header">
                                        <span className="gt-rank-step-name">
                                            {isDone ? <Check size={10} /> : <Star size={10} />} {r.name}
                                        </span>
                                        <span className="gt-rank-step-num">Rank {r.rank}</span>
                                    </div>
                                    {r.description && <div className="gt-rank-step-desc">{r.description}</div>}
                                    {r.unlock && (
                                        <div className="gt-rank-step-reward">
                                            {r.unlock.type === "access" && "Unlocks gym training sessions"}
                                            {r.unlock.type === "session" && `Unlocks: ${SESSION_META[r.unlock.sessionKey]?.label ?? r.unlock.sessionKey}`}
                                            {r.unlock.type === "xpBonus" && `Reward: +${r.unlock.xpBonusPct}% XP to focus stats permanently`}
                                            {r.unlock.type === "perk" && `Reward: ${r.unlock.badge ?? r.unlock.perkId} (perk + badge)`}
                                        </div>
                                    )}
                                    {isNext && gym.progress?.hasJoined && (
                                        <div className="gt-rank-step-reqs">
                                            <span className={gym.progress.trainingSessions >= r.requirements.trainingSessions ? "gt-rank-req--done" : ""}>
                                                Training: {Math.min(gym.progress.trainingSessions, r.requirements.trainingSessions)}/{r.requirements.trainingSessions}
                                            </span>
                                            <span className={gym.progress.relevantWins >= r.requirements.relevantWins ? "gt-rank-req--done" : ""}>
                                                {gym.relevantWinTypes?.length === 1
                                                    ? `${gym.relevantWinTypes[0]} wins`
                                                    : gym.relevantWinTypes?.length > 1
                                                    ? `Wins (${gym.relevantWinTypes.join(" / ")})`
                                                    : "Wins"}: {Math.min(gym.progress.relevantWins, r.requirements.relevantWins)}/{r.requirements.relevantWins}
                                            </span>
                                            {r.requirements.ironCost > 0 && (
                                                <span>Iron: {r.requirements.ironCost}</span>
                                            )}
                                        </div>
                                    )}
                                    {isNext && gym.progress?.nextRank?.canRankUp && gym.progress.nextRank.needsIron && (
                                        <button type="button" className="btn btn-primary btn-sm gt-rankup-btn" onClick={() => onRankUp(gym._id)}>
                                            <Trophy size={12} /> Rank Up ({r.requirements.ironCost} iron)
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {gym.progress?.rank >= 4 && (
                        <div className="gt-rank-maxed">
                            <Trophy size={14} /> Maximum rank achieved — perk active!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
