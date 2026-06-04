import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Zap, Swords, RotateCcw, ListOrdered } from "lucide-react";
import { api } from "../../api";
import {
    CAMP_SESSIONS,
    CAMP_SESSION_KEYS,
    CAMP_SLOT_CONFIG,
    MATCH_STATUS_LABELS,
    MATCH_STATUS_COLORS,
    getMatchStatus,
    projectCampGrade,
    getRatingConfig,
    getFightEnergyCost,
} from "../../constants/campConfig";
import { FightSummary } from "../fights/FightSummary";
import { PvpTaleOfTheTape } from "./PvpTaleOfTheTape";
import { PvpStakeChips } from "./PvpStakeChips";
import { PvpRankLadderMove } from "./PvpRankLadderMove";
import { PvpBeltOverlay } from "./PvpBeltOverlay";

/**
 * Maps an attack error `code` (§3.3) to a player-facing message.
 * `insufficient_energy` / `daily_pvp_cap_reached` are surfaced as a banner
 * (they're blocking, not transient) — see BANNER_CODES below.
 */
const ERROR_CODE_MESSAGES = {
    target_recovering: "This fighter is recovering and can't be challenged yet.",
    out_of_bracket: "This fighter is outside your matchmaking range (±8 OVR).",
    insufficient_energy: "Not enough energy to launch this attack.",
    daily_pvp_cap_reached: "You've used all your PvP attacks for today. Resets at midnight.",
    attacker_injured: "You're too injured to fight — heal up first.",
    target_not_attackable: "This fighter can't be attacked right now.",
    cannot_attack_self: "You can't challenge yourself.",
    fighter_not_found: "That fighter could not be found.",
};

const BANNER_CODES = new Set(["insufficient_energy", "daily_pvp_cap_reached"]);

function resolveAttackError(err) {
    const code = err?.code;
    if (code && ERROR_CODE_MESSAGES[code]) {
        return { message: ERROR_CODE_MESSAGES[code], isBanner: BANNER_CODES.has(code), code };
    }
    return { message: err?.message || "Attack failed. Try again.", isBanner: false, code };
}

const CAMP_SESSION_COLOR = {
    TAKEDOWN_DEFENCE: "blue",
    SUBMISSION_ESCAPES: "purple",
    STRIKING_ACCURACY: "red",
    CARDIO_PUSH: "green",
    GAME_PLAN_STUDY: "teal",
    BODY_SHOT_FOCUS: "amber",
    CLINCH_CONTROL: "purple",
    GROUND_AND_POUND_POSTURE: "red",
    SPARRING_GENERAL: "amber",
};

/** Slot dots — reimplemented inline (FightCamp.CampSlotDots is not exported). */
function CampSlotDots({ maxSlots, slotsUsed, onRemove }) {
    return (
        <div className="camp-slot-indicators">
            {Array.from({ length: maxSlots }, (_, i) => {
                const filled = i < slotsUsed;
                const clickable = filled && !!onRemove;
                return (
                    <div
                        key={i}
                        className={`camp-slot-dot ${filled ? "camp-slot-filled" : ""} ${clickable ? "camp-slot-removable" : ""}`}
                        title={clickable ? `Click to remove session ${i + 1}` : filled ? `Slot ${i + 1} used` : `Slot ${i + 1} available`}
                        onClick={clickable ? () => onRemove(i) : undefined}
                    />
                );
            })}
        </div>
    );
}

/** Builds a real FightSummary object from the PvP attack response (§2.4). */
function buildPvpSummary(response, defenderName) {
    const result = response?.result || {};
    const rewards = response?.rewards || {};
    const fighter = response?.fighter || {};
    const pvp = fighter?.pvp || {};
    const health = response?.health || {};
    const winner = result.winner; // "attacker" | "defender" | "draw"
    const recordChange = winner === "attacker" ? "W" : winner === "defender" ? "L" : "D";
    const recordAfter = pvp.wins != null
        ? `${pvp.wins}-${pvp.losses ?? 0}-${pvp.draws ?? 0}`
        : undefined;

    const aHp = health.attacker || {};
    const healthStart = aHp.before;
    const healthEnd = aHp.after;
    const healthLost = healthStart != null && healthEnd != null ? Math.max(0, healthStart - healthEnd) : undefined;

    return {
        outcome: result.outcome || result.method || "—",
        recordChange,
        recordAfter,
        opponentName: response?.defender?.name || defenderName,
        ironEarned: rewards.iron_earned ?? 0,
        notorietyGained: rewards.notoriety_earned ?? 0,
        healthStart,
        healthEnd,
        healthLost,
        campBreakdown: response?.campBreakdown || undefined,
        beltWon: !!(response?.belt?.changed && response?.belt?.newChampion),
        // OMIT xpGained / xpMultiplier — no PvP stat XP.
    };
}

/** Normalises a fighter (attacker/defender) into the tale-of-the-tape shape. */
function normalizeFighter({ name, nickname, ovr, style, record, ladderRank, isChampion, streak }) {
    return { name, nickname, ovr, style, record, ladderRank, isChampion, streak };
}

/**
 * PvP challenge flow — two screens:
 *   CAMP (tale-of-the-tape preview + stake chips + offensive camp picker + FIGHT)
 *   SUMMARY (belt overlay gate → tale-of-the-tape result → rank move → FightSummary
 *            → Continue / Rematch / View Ladder).
 *
 * The PvP attack is a single stateless POST, so the offensive camp is selected
 * locally and submitted as an array of session-type ids (no persisted camp).
 */
export const PvpChallengeFlow = memo(function PvpChallengeFlow({
    fighter,
    defenderId,
    defenderPreview,
    context,        // "revenge" → lights the REVENGE stake chip (opened from the Yard/rivals)
    onClose,
    onResolved,
    onMessage,
    onViewLadder,
}) {
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState(null);

    // Local camp selection — array of CAMP_SESSIONS keys.
    const [selected, setSelected] = useState([]);

    const [attacking, setAttacking] = useState(false);
    const [banner, setBanner] = useState(null); // blocking error banner
    const [error, setError] = useState(null);   // inline transient error
    const [errorCode, setErrorCode] = useState(null);

    // Result + belt overlay sequencing.
    const [summary, setSummary] = useState(null);
    const [response, setResponse] = useState(null);
    const [beltMode, setBeltMode] = useState(null); // "won" | "lost" | null

    const tier = fighter?.promotionTier ?? "Amateur";
    const maxSlots = CAMP_SLOT_CONFIG[tier]?.normalSlots ?? 2;
    const energyAvailable = fighter?.energy?.current ?? fighter?.energy ?? 0;

    // Load the defender profile (HP/injuries are intentionally absent).
    const loadProfile = useCallback(() => {
        let cancelled = false;
        setProfileLoading(true);
        setProfileError(null);
        api.getPvpProfile(defenderId)
            .then((res) => { if (!cancelled) setProfile(res); })
            .catch((e) => { if (!cancelled) setProfileError(e.message || "Failed to load fighter profile."); })
            .finally(() => { if (!cancelled) setProfileLoading(false); });
        return () => { cancelled = true; };
    }, [defenderId]);

    useEffect(() => loadProfile(), [loadProfile]);

    const usedEnergy = useMemo(
        () => selected.reduce((sum, key) => sum + (CAMP_SESSIONS[key]?.energy ?? 0), 0),
        [selected]
    );

    const defenderStyle = profile?.style || defenderPreview?.style;
    const projectedGrade = useMemo(
        () => projectCampGrade(selected, defenderStyle, maxSlots),
        [selected, defenderStyle, maxSlots]
    );

    // ── Tale-of-the-tape fighters (preview) ──
    const attackerName = fighter
        ? `${fighter.firstName ?? ""} ${fighter.lastName ?? ""}`.trim() || fighter.name
        : undefined;
    const attackerTape = normalizeFighter({
        name: attackerName,
        nickname: fighter?.nickname || null,
        ovr: fighter?.overallRating,
        style: fighter?.style,
        record: fighter?.pvp ? `${fighter.pvp.wins ?? 0}-${fighter.pvp.losses ?? 0}-${fighter.pvp.draws ?? 0}` : null,
        ladderRank: fighter?.pvp?.ladder_rank ?? null,
        isChampion: fighter?.pvp?.is_champion ?? false,
        streak: fighter?.pvp?.current_streak ?? null,
    });
    const defenderTape = normalizeFighter({
        name: profile?.name || defenderPreview?.name,
        nickname: profile?.nickname ?? null,
        ovr: profile?.ovr ?? defenderPreview?.ovr,
        style: defenderStyle,
        record: profile?.pvp
            ? `${profile.pvp.wins ?? 0}-${profile.pvp.losses ?? 0}-${profile.pvp.draws ?? 0}`
            : defenderPreview?.record ?? null,
        ladderRank: profile?.pvp?.ladder_rank ?? defenderPreview?.ladder_rank ?? null,
        isChampion: profile?.pvp?.is_champion ?? defenderPreview?.is_champion ?? false,
        streak: profile?.pvp?.current_streak ?? null,
    });

    // Attacker tier fight-energy cost → "−{N} Energy" stake chip.
    const fightEnergyCost = getFightEnergyCost(tier);

    // Reward gap (client mirror): gapFactor = clamp01(1 - max(0, aOvr-dOvr)/15).
    // Punching down (attacker higher OVR) → factor < 1 reduces rewards.
    // Underdog (attacker lower OVR) → full rewards + upset bonus.
    const stakeGap = useMemo(() => {
        const aOvr = attackerTape.ovr;
        const dOvr = defenderTape.ovr;
        if (aOvr == null || dOvr == null) return null;
        if (aOvr < dOvr) return { isUnderdog: true };
        const factor = Math.max(0, Math.min(1, 1 - Math.max(0, aOvr - dOvr) / 15));
        return { factor, isUnderdog: false };
    }, [attackerTape.ovr, defenderTape.ovr]);

    // belt_challenge_floor: if the defender is at/above the floor (or is the
    // champion) this is a belt fight. Graceful blank until the field lands.
    const beltFloor = profile?.pvp?.belt_challenge_floor;
    const isBeltFight = !!(
        defenderTape.isChampion ||
        (beltFloor != null && defenderTape.ladderRank != null && defenderTape.ladderRank <= beltFloor)
    );

    // Open iron bounty on the defender's head — lights the BOUNTY stake chip.
    // Tolerant of field name (profile.bounty_on_head | open_bounty_total) and the
    // preview hint passed from the bounty board / ladder rows. Graceful 0.
    const bountyOnDefender =
        profile?.bounty_on_head
        ?? profile?.open_bounty_total
        ?? defenderPreview?.bounty_on_head
        ?? defenderPreview?.bounty_total
        ?? 0;

    // Context band: TITLE FIGHT (gold) > GRUDGE/REVENGE (red) > FIGHT NIGHT.
    // REVENGE lights when the caller opened this flow with context="revenge"
    // (from the Yard revenge board / rivals revenge action) OR the profile's
    // head_to_head says revenge is available / we lost last (both graceful blanks).
    const isRevenge = context === "revenge"
        || profile?.head_to_head?.revenge_available === true
        || (!!profile?.head_to_head?.last_result && profile.head_to_head.last_result === "loss");
    const eyebrow = isBeltFight ? "TITLE FIGHT" : isRevenge ? "GRUDGE" : "FIGHT NIGHT";
    const eyebrowTone = isBeltFight ? "title" : isRevenge ? "grudge" : "default";

    const toggleSession = useCallback((key) => {
        setSelected((prev) => {
            if (prev.includes(key)) return prev.filter((k) => k !== key);
            if (prev.length >= maxSlots) return prev; // slot cap
            return [...prev, key];
        });
    }, [maxSlots]);

    const removeSlot = useCallback((slotIndex) => {
        setSelected((prev) => prev.filter((_, i) => i !== slotIndex));
    }, []);

    const handleAttack = useCallback(async () => {
        if (attacking) return;
        setAttacking(true);
        setError(null);
        setErrorCode(null);
        setBanner(null);
        try {
            const res = await api.pvpAttack(defenderId, selected);
            const built = buildPvpSummary(res, profile?.name || defenderPreview?.name);
            setSummary(built);
            setResponse(res);
            // Belt moment BEFORE the result.
            if (res?.belt?.changed && res?.belt?.newChampion) setBeltMode("won");
            else if (res?.belt?.lost) setBeltMode("lost"); // Tier-3 (dark until field lands)
            onMessage?.(`PvP fight resolved: ${res?.result?.outcome || res?.result?.method || "done"}.`);
        } catch (e) {
            const { message, isBanner, code } = resolveAttackError(e);
            setErrorCode(code);
            if (isBanner) setBanner(message);
            else setError(message);
        }
        setAttacking(false);
    }, [attacking, defenderId, selected, profile?.name, defenderPreview?.name, onMessage]);

    const handleContinue = useCallback(() => {
        if (response) onResolved?.(response);
        else onClose?.();
    }, [response, onResolved, onClose]);

    // Re-challenge the same defender: reset the result and reload the profile
    // (cooldown / cap / energy re-evaluated by the next attack call).
    const handleRematch = useCallback(() => {
        setSummary(null);
        setResponse(null);
        setBeltMode(null);
        setError(null);
        setBanner(null);
        setErrorCode(null);
        loadProfile();
    }, [loadProfile]);

    const handleViewLadder = useCallback(() => {
        if (response) onResolved?.(response);
        onViewLadder?.();
    }, [response, onResolved, onViewLadder]);

    // Rematch availability (summary screen): disabled when out of energy / capped,
    // or while the defender you just beat is on a loss cooldown
    // (response.cooldowns.defender — graceful blank until the field lands).
    const defenderCooldownAt = response?.cooldowns?.defender;
    const rematchCooldownMs = defenderCooldownAt
        ? new Date(defenderCooldownAt).getTime() - Date.now()
        : 0;
    const rematchDisabled = energyAvailable <= 0 || rematchCooldownMs > 0;
    const rematchLabel = rematchCooldownMs > 0
        ? `Rematch (recovering ${Math.ceil(rematchCooldownMs / 3_600_000)}h)`
        : energyAvailable <= 0
            ? "Rematch (no energy)"
            : "Rematch";

    // ── Belt overlay gate (shown over the result) ──
    if (beltMode && summary) {
        return (
            <PvpBeltOverlay
                mode={beltMode}
                previousChampion={beltMode === "won" ? summary.opponentName : undefined}
                newChampion={beltMode === "lost" ? summary.opponentName : undefined}
                onContinue={() => setBeltMode(null)}
            />
        );
    }

    // ── SUMMARY screen ──
    if (summary && response) {
        const rank = response.rank || {};
        const winner = response.result?.winner;
        const rankDelta = rank.attacker_points_delta ?? 0;

        // Crowned tale-of-the-tape (result mode) — defender block from §B.9.
        const resultDefender = normalizeFighter({
            name: response.defender?.name || defenderTape.name,
            nickname: response.defender?.nickname ?? defenderTape.nickname,
            ovr: response.defender?.ovr ?? defenderTape.ovr,
            style: response.defender?.style ?? defenderTape.style,
            record: response.defender?.record_after ?? defenderTape.record,
            ladderRank: response.defender?.ladder_rank_after ?? defenderTape.ladderRank,
            isChampion: response.defender?.is_champion_after ?? defenderTape.isChampion,
            streak: defenderTape.streak,
        });
        const resultAttacker = normalizeFighter({
            ...attackerTape,
            record: summary.recordAfter ?? attackerTape.record,
            ladderRank: rank.attacker_ladder_rank_after ?? attackerTape.ladderRank,
            // Attacker post-fight streak from the new response field (graceful blank).
            streak: response.streak?.attacker_current ?? attackerTape.streak,
        });

        const rankAfterTile = (
            <div className="result-stat">
                <div className={`result-stat-val ${rankDelta > 0 ? "result-stat-val--green" : rankDelta < 0 ? "result-stat-val--red" : "result-stat-val--blue"}`}>
                    {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
                </div>
                <div className="result-stat-label">Rank Δ</div>
            </div>
        );

        // Bounty collected on this win (§7.3 attack payload). Tolerant of either a
        // {count,total_iron,items} object or a bare number. Graceful blank.
        const bountyCollected = response.bounty_collected ?? null;
        const bountyIron = bountyCollected == null
            ? 0
            : typeof bountyCollected === "number"
                ? bountyCollected
                : (bountyCollected.total_iron ?? 0);
        const bountyCount = bountyCollected && typeof bountyCollected === "object"
            ? (bountyCollected.count ?? null)
            : null;

        // PvP notices (graceful: streak/cooldowns arrive in parallel).
        const streakMilestone = response.streak?.milestone ?? null;
        const attackerCooldownAt = response.cooldowns?.attacker ?? null;
        const attackerCooldownMs = attackerCooldownAt
            ? new Date(attackerCooldownAt).getTime() - Date.now()
            : 0;
        const attackerCooldownHours = attackerCooldownMs > 0 ? Math.ceil(attackerCooldownMs / 3_600_000) : 0;
        const attackerCooldownTime = attackerCooldownMs > 0
            ? new Date(attackerCooldownAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : null;
        const hasPvpNotices = streakMilestone != null || attackerCooldownMs > 0 || bountyIron > 0;

        return createPortal(
            <div className="pvp-flow-overlay" role="dialog" aria-modal="true" aria-label="PvP fight result">
                <div className="pvp-flow-card pvp-flow-result">
                    <PvpTaleOfTheTape
                        mode="result"
                        attacker={resultAttacker}
                        defender={resultDefender}
                        winner={winner}
                        isBeltFight={isBeltFight}
                        health={response.health}
                    />

                    <PvpRankLadderMove
                        rankBefore={rank.attacker_ladder_rank_before}
                        rankAfter={rank.attacker_ladder_rank_after}
                        pointsDelta={rankDelta}
                    />

                    <div className="fight-result-screen">
                        <FightSummary summary={summary} hideXpTile rightRailExtra={rankAfterTile} />
                        {hasPvpNotices && (
                            <div className="notices pvp-summary-notices">
                                {streakMilestone != null && (
                                    <div className="notice notice--good">
                                        <span className="notice-glyph">⚡</span>
                                        <span><strong>{streakMilestone}-fight win streak!</strong></span>
                                    </div>
                                )}
                                {bountyIron > 0 && (
                                    <div className="notice notice--good pvp-bounty-collected-notice">
                                        <span className="notice-glyph">💰</span>
                                        <span>
                                            <strong>Bounty collected: +{bountyIron.toLocaleString()} iron</strong>
                                            {bountyCount != null && bountyCount > 1 && (
                                                <span className="pvp-bounty-collected-count"> ({bountyCount} bounties)</span>
                                            )}
                                        </span>
                                    </div>
                                )}
                                {attackerCooldownMs > 0 && (
                                    <div className="notice notice--warn">
                                        <span className="notice-glyph">🩹</span>
                                        <span>
                                            You&apos;re recovering — others can&apos;t challenge you until{" "}
                                            <strong>{attackerCooldownTime}</strong> (~{attackerCooldownHours}h).
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="pvp-flow-actions">
                        <button type="button" className="btn btn-primary" onClick={handleContinue}>
                            Continue
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleRematch}
                            disabled={rematchDisabled}
                            title={rematchDisabled ? rematchLabel : "Re-challenge this fighter"}
                        >
                            <RotateCcw size={13} /> {rematchLabel}
                        </button>
                        {onViewLadder && (
                            <button type="button" className="btn btn-ghost" onClick={handleViewLadder}>
                                <ListOrdered size={13} /> View Ladder
                            </button>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    // ── CAMP screen ──
    const fightCtaLabel = attacking
        ? "FIGHTING…"
        : isBeltFight ? "FIGHT FOR THE BELT"
            : isRevenge ? "SETTLE IT"
                : "FIGHT";
    // Disable the CTA inline for recoverable / out-of-bracket style errors.
    const inlineDisableCodes = new Set(["target_recovering", "out_of_bracket", "target_not_attackable", "cannot_attack_self", "fighter_not_found"]);
    const ctaBlocked = attacking || profileLoading || !!profileError || inlineDisableCodes.has(errorCode);

    return createPortal(
        <div className="pvp-flow-overlay" role="dialog" aria-modal="true" aria-label="PvP challenge">
            <div className="pvp-flow-card">
                <div className="pvp-flow-header">
                    <span className={`pvp-tape-eyebrow pvp-tape-eyebrow--${eyebrowTone}`}>{eyebrow}</span>
                    <button type="button" className="fr-close" onClick={onClose} title="Cancel">&times;</button>
                </div>

                {/* Tale of the tape — full skeleton while scouting */}
                {profileLoading && (
                    <div className="pvp-tape pvp-tape--skeleton">
                        <div className="pvp-tape-grid">
                            <div className="pvp-tape-col pvp-tape-skel-col" />
                            <div className="pvp-tape-vs"><div className="pvp-tape-vs-medallion" /></div>
                            <div className="pvp-tape-col pvp-tape-skel-col" />
                        </div>
                        <div className="pvp-loading">Scouting opponent…</div>
                    </div>
                )}

                {!profileLoading && profileError && (
                    <div className="pvp-error">
                        {profileError}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={loadProfile}>Retry</button>
                    </div>
                )}

                {!profileLoading && !profileError && (
                    <>
                        <PvpTaleOfTheTape
                            mode="preview"
                            attacker={attackerTape}
                            defender={defenderTape}
                            isBeltFight={isBeltFight}
                        />

                        <PvpStakeChips
                            rankPreview={profile?.rank_points_preview}
                            isBeltFight={isBeltFight}
                            isRevenge={isRevenge}
                            energyCost={fightEnergyCost}
                            gap={stakeGap}
                            bountyOnDefender={bountyOnDefender}
                        />

                        {/* Offensive camp (local selection) */}
                        <div className="pvp-flow-camp">
                            <div className="pvp-flow-camp-head">
                                <span className="pvp-flow-camp-title">YOUR GAME PLAN</span>
                                <div className="pvp-flow-camp-head-right">
                                    <CampSlotDots maxSlots={maxSlots} slotsUsed={selected.length} onRemove={removeSlot} />
                                    <span
                                        className="camp-grade pvp-projected-grade"
                                        style={{ color: getRatingConfig(projectedGrade).color }}
                                        title="Projected camp grade vs this opponent (the post-fight grade is authoritative)"
                                    >
                                        {projectedGrade}
                                        <span className="pvp-projected-tag">projected</span>
                                    </span>
                                </div>
                            </div>
                            <div className="pvp-flow-camp-read">
                                {defenderStyle ? <>They&apos;re a <strong>{defenderStyle}</strong>.</> : "Style unknown."}
                                {selected.length === 0 && <span className="pvp-flow-camp-cold"> Walking in cold.</span>}
                            </div>

                            <div className="pvp-flow-sessions">
                                {CAMP_SESSION_KEYS.map((key) => {
                                    const s = CAMP_SESSIONS[key];
                                    const isSelected = selected.includes(key);
                                    const slotsFull = !isSelected && selected.length >= maxSlots;
                                    const color = CAMP_SESSION_COLOR[key] ?? "blue";
                                    const status = getMatchStatus(key, defenderStyle);
                                    const statusColor = MATCH_STATUS_COLORS[status] ?? "#94a3b8";
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`camp-session-card pvp-camp-card${isSelected ? " pvp-camp-card--selected" : ""}${slotsFull ? " camp-session-card--disabled" : ""}`}
                                            disabled={slotsFull}
                                            onClick={() => toggleSession(key)}
                                            title={slotsFull ? "All slots filled" : s.recommendedAgainst}
                                        >
                                            <div className={`camp-session-stripe camp-stripe-${color}`} />
                                            <div className="camp-session-body">
                                                <div className="camp-session-top">
                                                    <span className="camp-session-name">{s.label}</span>
                                                    <span className="camp-session-energy"><Zap size={11} /> {s.energy}E</span>
                                                </div>
                                                <div className={`camp-session-effect camp-effect-${color}`}>{s.effectLabel}</div>
                                                <div className="pvp-camp-cue" style={{ color: statusColor }}>
                                                    {MATCH_STATUS_LABELS[status] ?? status}
                                                </div>
                                                {isSelected && <span className="camp-session-added">✓ In camp</span>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="pvp-flow-camp-note">
                                Camp energy: {usedEnergy}E selected. The attack itself costs your tier&apos;s fight energy.
                            </div>
                        </div>
                    </>
                )}

                {banner && <div className="pvp-cap-banner">{banner}</div>}
                {error && <div className="pvp-error">{error}</div>}

                <div className="pvp-flow-actions">
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={attacking}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={`btn ${isBeltFight ? "btn-title" : "btn-primary"} pvp-fight-cta`}
                        onClick={handleAttack}
                        disabled={ctaBlocked}
                    >
                        <Swords size={15} /> {fightCtaLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default PvpChallengeFlow;
