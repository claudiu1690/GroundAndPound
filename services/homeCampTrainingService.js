/**
 * Home Camp — drill resolution. The camp's counterpart to trainingService.doTraining.
 *
 * NAMING: `camp*` on the backend is the FIGHT camp (GDD §9). This is the HOME camp.
 *
 * SHARED LOGIC (nothing below is reimplemented here):
 *   · stat XP        → utils/trainingSession.applySessionXp   (same helper as the gym path)
 *   · condition      → homeCampService.applySessionConditionDelta
 *   · coach counters → homeCampCoachService.incrementSessions
 *   · move drops     → specialMovesService.rollCampMoveDrop → grantOrUpgrade (sole owner)
 *   · injury severity→ utils/injuryUtils.pickSparringInjuryType
 *   · daily counter  → trainingService.ensureDailyTrainingState
 *
 * The 200 body is a SUPERSET of doTraining's return (minus `rankUp` — camp promotions are
 * always explicit) so the existing toast / level-up / move-drop components are reused verbatim.
 */
const Fighter = require("../models/fighterModel");
const fighterService = require("./fighterService");
const energyService = require("./energyService");
const specialMovesService = require("./specialMovesService");
const homeCampService = require("./homeCampService");
const coachService = require("./homeCampCoachService");
const trainingService = require("./trainingService");
const { applySessionXp, applyMaxStaminaSession } = require("../utils/trainingSession");
const { rollSessionXp, tierForRoll } = require("../utils/trainingRng");
const { calculateOverall } = require("../utils/overallRating");
const { STAT_TO_VAL_KEY } = require("../utils/statProgression");
const { BACKSTORIES } = require("../consts/gameConstants");
const { BOOSTERS, boosterStatList } = require("../consts/shopConfig");
const {
    buildInjury,
    applyInjuryToFighter,
    isSparringBlocked,
    isBagWorkBlocked,
    injuryGraceActive,
    pickSparringInjuryType,
} = require("../utils/injuryUtils");
const {
    CAMP_TIERS,
    DOMAIN_TEACH_POOLS,
    FLAGSHIP_POOL_BIAS,
    MAX_BATCH,
    effectiveTier,
    drillForCoach,
    fallbackDrill,
} = require("../consts/homeCampConfig");

const { campError } = coachService;

/**
 * Effective injury probability for a camp drill (contract §4.1.4). FIQ shaves the rate but can
 * never take it below 30% of the drill's nominal risk — a high-FIQ fighter is safer, never immune.
 */
function effectiveInjuryRate(injuryPct, fiq) {
    const base = Math.max(0, Number(injuryPct) || 0) / 100;
    if (base <= 0) return 0;
    const reduction = Math.max(0, ((Number(fiq) || 10) - 10) * 0.001);
    return Math.max(base * 0.3, base - reduction);
}

/** Blocked-injury lookup for a drill family. `none` is never blocked. */
function blockFor(fighter, family) {
    if (family === "spar") return isSparringBlocked(fighter);
    if (family === "bag") return isBagWorkBlocked(fighter);
    return null;
}

/**
 * Run up to `quantity` camp drill sessions, resolved atomically into one aggregated result.
 *
 * @param {string} fighterId
 * @param {{coachId?:string|null, drillKey?:string, quantity?:number}} body — assumed HOSTILE
 * @returns {Promise<import("./homeCampService").CampTrainResult>}
 */
async function runDrill(fighterId, body = {}) {
    const { coachId = null, drillKey, quantity = 1 } = body || {};

    // ── Input validation (before any read) ──────────────────────────────────
    if (typeof drillKey !== "string" || drillKey.trim().length === 0) {
        throw campError("drill_required", "A drill is required", 400);
    }
    if (coachId !== null && coachId !== undefined && typeof coachId !== "string") {
        throw campError("coach_not_found", "Coach not found", 404);
    }
    if (quantity !== undefined && quantity !== null) {
        const q = Number(quantity);
        if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) {
            throw campError("quantity_invalid", "Quantity must be a whole number of 1 or more", 400);
        }
    }
    const clampedQ = Math.min(Math.max(1, Math.floor(Number(quantity) || 1)), MAX_BATCH);

    // ── Load ────────────────────────────────────────────────────────────────
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    await fighterService.reconcileEnergy(fighter);
    trainingService.ensureDailyTrainingState(fighter);

    const camp = await homeCampService.ensureCamp(fighter);
    const tier = effectiveTier(camp, fighter);
    const tierCfg = CAMP_TIERS[tier] || CAMP_TIERS[1];

    // ── Resolve the drill + its XP multiplier ───────────────────────────────
    let drill;
    let coach = null;
    let baseMult;
    let poolMoveIds = [];
    let poolBias = 0;

    if (coachId === null || coachId === undefined) {
        const fb = fallbackDrill();
        if (drillKey !== fb.key) throw campError("unknown_drill", "Unknown drill", 400);
        drill = fb;
        baseMult = tierCfg.fallbackXpMult;
        // open_mat stays UNBIASED — it is the control arm. No coach, no pool preference.
        poolBias = 0;
    } else {
        try {
            coach = camp.coaches.id(coachId);
        } catch (_) {
            coach = null; // malformed ObjectId is a 404, never a 500
        }
        if (!coach) throw campError("coach_not_found", "Coach not found", 404);

        // ⚠️ PHASE 2 — `drillForCoach`, never `drillFor(coach.archetype, …)`. THE CLIENT PICKS
        // `drillKey`, so this is hostile input: the masterclass branch inside drillForCoach
        // gates on `coach.exclusiveSessionKey === drillKey`, which means a COMMON coach's owner
        // POSTing "legend_striking_masterclass" resolves to null → 400 `unknown_drill`. Note
        // where this sits: BEFORE deductBatchEnergy, so that rejection costs ZERO energy.
        drill = drillForCoach(coach, drillKey);
        if (!drill) throw campError("unknown_drill", "Unknown drill", 400);
        if (drill.unlockRank > (Number(coach.rank) || 1)) {
            throw campError("drill_locked", "That drill unlocks at a higher coach rank", 400);
        }

        // ⚠️ TRAITS ARE APPLIED HERE, BEFORE ANYTHING READS THE DRILL — energy deduction,
        // injury roll, drop roll and condition all use the adjusted values. Same function the
        // GET payload's drill cards call (homeCampCoachService.applyTraitToDrill), which is
        // what makes "displayed == charged" true. Never re-apply a trait further down.
        drill = coachService.applyTraitToDrill(drill, coach.traitKey);

        // Same single home as the payload's `xpMultiplier` — tier × rank-3 × trait, with the
        // low-morale halving applied to the BONUS only.
        baseMult = coachService.coachXpMultiplier(coach, tierCfg);

        // THIS coach's own pool, frozen at hire — NOT the whole domain pool. His pool is already
        // sliced to his rarity's teach breadth (a COMMON coach knows exactly one move), so biasing
        // drops toward the full 3-4 move domain list would push the player at moves this coach can
        // never teach. Domain pool is the fallback only for a coach whose pool is empty (a legacy
        // or hand-edited doc).
        const ownTeachPool = Array.isArray(coach.teachPoolMoveIds)
            ? coach.teachPoolMoveIds.filter(Boolean)
            : [];
        poolMoveIds = ownTeachPool.length > 0 ? ownTeachPool : (DOMAIN_TEACH_POOLS[coach.archetype] || []);
        // LIVE from Phase 1: a coach's drills prefer HIS pool. rollCampMoveDrop filters by the
        // rolled rarity FIRST and falls back to the full catalog when the biased set comes up
        // empty, so this can never grant a move above the rarity that was rolled.
        poolBias = FLAGSHIP_POOL_BIAS;
    }

    // ── Injury family block — whole batch rejected up front (same rule as the gym) ──
    const blocked = blockFor(fighter, drill.family);
    if (blocked) {
        throw campError("injury_blocked", `Cannot train: ${blocked.label} (${blocked.effect})`, 400);
    }

    // ── Condition multiplier, read BEFORE the batch so all k sessions share it ──
    const conditionBefore = Number(camp.condition?.value ?? 100);
    const bandBefore = homeCampService.conditionBand(conditionBefore);

    const backstoryMod = (fighter.backstory && BACKSTORIES[fighter.backstory]?.trainingXpMod) || 0;
    const sessionMult = baseMult * bandBefore.xpMult * (1 + backstoryMod);

    // ── Which of the three session shapes is this? ──────────────────────────
    // A drill either trains stats, or raises Max Stamina, or is pure upkeep. The config
    // validator (rule 7) guarantees a statless drill is always one of the latter two, so these
    // three cases are exhaustive.
    const isXpSession = Array.isArray(drill.stats) && drill.stats.length > 0;
    const isMaxStaminaSession = !isXpSession && !!drill.raisesMaxStamina;

    // ── Booster (Shop v1.0) — one charge per COMPLETED session, same as the gym path ──
    // Only XP sessions consume a charge. Burning a booster on a drill that grants no stat XP
    // would be taking the player's money for nothing (the gym's S&C path doesn't either).
    const boosterCfg = (isXpSession && fighter.activeBooster && fighter.activeBooster.sessionsLeft > 0)
        ? BOOSTERS[fighter.activeBooster.id]
        : null;
    const boosterStats = boosterCfg ? new Set(boosterStatList(boosterCfg)) : null;
    const boosterAffects = (stat) => !!boosterCfg && boosterStats.has(String(stat).toLowerCase());
    const boosterId = boosterCfg ? fighter.activeBooster.id : null;
    let boosterSessionsConsumed = 0;
    let boosterDepletedThisBatch = false;

    // ── Energy: atomically fund up to clampedQ sessions ─────────────────────
    const energyBefore = fighter.energy?.current ?? 0;
    const { funded: k } = await energyService.deductBatchEnergy(fighterId, drill.energy, clampedQ);
    if (k === 0) throw campError("not_enough_energy", "Not enough energy", 400);

    const injuryLockedStats = new Set(fighterService.getInjuryLockedStats(fighter));
    const valueBefore = {};
    for (const statName of drill.stats) {
        const valKey = STAT_TO_VAL_KEY[statName];
        if (valKey) valueBefore[statName] = fighter[valKey] || 10;
    }

    const events = [];
    const xpGained = {};
    const wasted = {};
    const statCapEmitted = new Set();
    const injurySustained = [];
    const rollTierCounts = { great: 0, normal: 0, sluggish: 0 };
    let lastTier = null;
    let completed = 0;
    let stopReason = "completed";
    let moveDrop = null;   // at most ONE drop per call — first drop in a batch wins
    let maxStaminaGained = 0;
    let staminaCapHit = false;

    for (let i = 1; i <= k; i++) {
        if (isXpSession) {
            // Draw ONCE per session, before any stat math, so a session that ends in an injury
            // (still counts as completed) is still tallied. Statless drills never draw — their
            // rollTier stays null, exactly like the gym's S&C path.
            const sessionRoll = rollSessionXp();
            const sessionTier = tierForRoll(sessionRoll);
            rollTierCounts[sessionTier] += 1;
            lastTier = sessionTier;

            const sessionCharged = !!boosterCfg && fighter.activeBooster && fighter.activeBooster.sessionsLeft > 0;

            const session = applySessionXp(fighter, {
                stats: drill.stats,
                xpBase: drill.xpBase,
                injuryLockedStats,
                sessionRoll,
                multiplier: (statName) => sessionMult * ((sessionCharged && boosterAffects(statName)) ? (1 + boosterCfg.pct) : 1),
            });

            const cappedThisSession = new Set(session.capped);
            const lockedThisSession = new Set(session.locked);
            for (const statName of drill.stats) {
                if (lockedThisSession.has(statName)) {
                    if (xpGained[statName] === undefined) xpGained[statName] = 0;
                    continue;
                }
                if (cappedThisSession.has(statName)) {
                    wasted[statName] = (wasted[statName] || 0) + (session.wasted[statName] || 0);
                    if (xpGained[statName] === undefined) xpGained[statName] = 0;
                    if (!statCapEmitted.has(statName)) {
                        statCapEmitted.add(statName);
                        events.push({ type: "stat_cap_hit", sessionIndex: i, stat: statName });
                    }
                    continue;
                }
                if (session.applied[statName] !== undefined) {
                    xpGained[statName] = (xpGained[statName] || 0) + session.applied[statName];
                }
            }

            if (sessionCharged && fighter.activeBooster && fighter.activeBooster.sessionsLeft > 0) {
                fighter.activeBooster.sessionsLeft -= 1;
                boosterSessionsConsumed += 1;
                if (fighter.activeBooster.sessionsLeft <= 0) {
                    fighter.activeBooster = null;
                    boosterDepletedThisBatch = true;
                }
            }
        } else if (isMaxStaminaSession) {
            // The SAME helper the gym's S&C session runs (utils/trainingSession) — +1, +2 with
            // the iron_conditioning perk, capped at 120. No stat XP, no booster charge.
            const { gained, capHit } = applyMaxStaminaSession(fighter);
            maxStaminaGained += gained;
            if (capHit && !staminaCapHit) {
                staminaCapHit = true;
                events.push({ type: "stamina_cap_hit", sessionIndex: i });
            }
        }
        // else: PURE UPKEEP (statless, no max-stamina). Energy is spent and the drill's
        // condDelta is applied below with every other session — that IS the whole effect.

        // Move drop — per-drill odds (D5). open_mat keeps 4% as the control.
        if (!moveDrop && drill.dropPct > 0) {
            moveDrop = specialMovesService.rollCampMoveDrop(fighter, {
                dropRate: drill.dropPct / 100,
                rarityWeightsKey: tierCfg.dropKey,
                poolMoveIds,
                poolBias,   // coach drills prefer his pool; open_mat stays the unbiased control
            });
        }

        // Injury — the drill's own percentage, FIQ-shaved; severity split is shared.
        if (drill.injuryPct > 0 && Math.random() < effectiveInjuryRate(drill.injuryPct, fighter.fiq || 10)) {
            const injuryType = pickSparringInjuryType(fighter.fiq || 10);
            const inj = buildInjury(injuryType, fighter.promotionTier);
            if (inj && !(injuryGraceActive(fighter) && inj.cannotFight)) {
                applyInjuryToFighter(fighter, inj);
                fighter.injuries = [...(fighter.injuries || []), inj];
                injurySustained.push(inj.label);
                events.push({ type: "injury", sessionIndex: i, label: inj.label });
                completed = i;          // the injuring round still counts as completed
                stopReason = "injury";
                break;
            }
        }

        completed = i;
    }

    if (stopReason !== "injury") stopReason = k === clampedQ ? "completed" : "out_of_energy";

    // Refund energy funded but not completed (only possible on an injury stop).
    const refund = (k - completed) * drill.energy;
    if (refund > 0) await energyService.addEnergy(fighterId, refund);
    const energySpent = completed * drill.energy;

    // ── Stat change report ──────────────────────────────────────────────────
    const statLevelUps = [];
    const statChanges = [];
    for (const statName of drill.stats) {
        const valKey = STAT_TO_VAL_KEY[statName];
        const before = valueBefore[statName] ?? (valKey ? (fighter[valKey] || 10) : 10);
        const after = valKey ? (fighter[valKey] || 10) : before;
        statChanges.push({ stat: statName, before, after, xp: xpGained[statName] || 0, wasted: wasted[statName] || 0 });
        if (after > before) statLevelUps.push(statName);
    }

    fighter.overallRating = calculateOverall(fighter);

    const energySnap = await energyService.getEnergy(fighterId);
    fighter.energy = {
        ...(fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {}),
        current: energySnap.current,
        max: energySnap.max,
        lastSyncedAt: new Date(),
    };
    const energyAfter = energySnap.current;

    fighter.trainingSessionsToday += completed;
    fighter.careerTrainingSessions = (fighter.careerTrainingSessions || 0) + completed;

    await fighter.save();

    // ── Camp writes ──────────────────────────────────────────────────────────
    // The camp lives in its OWN collection, so a session spans two documents that cannot be
    // written atomically: this deployment runs standalone Mongo (no replica set) and the repo
    // uses no transactions anywhere — and a transaction wouldn't buy real atomicity regardless,
    // because the energy spend already committed to REDIS before the batch ran.
    //
    // Ordering is deliberate: the FIGHTER save goes first because it carries the valuable,
    // irreversible half (XP, stat levels, injuries, the energy reconciliation the player paid
    // for). The camp save carries the cheap half (a condition tick and a coach counter).
    //
    // ⚠️ DELIBERATELY NON-FATAL — DO NOT "FIX" THIS INTO A THROW. If camp.save() fails here,
    // the fighter's training has ALREADY committed. Rethrowing would surface a 500 and the UI
    // would tell the player their training failed when it demonstrably succeeded — and, worse,
    // invite them to spend the energy again. Losing one condition tick is an acceptable cost;
    // lying to a player about a committed action is not. This mirrors the badge-eval block
    // below and homeCampCoachService.onFightWin: log loudly, degrade, never break the action.
    // The daily/lazy condition tick is self-healing anyway, and the coach counter re-accrues on
    // the next session.
    // Capture the persisted state BEFORE mutating, so the failure path can restore it exactly.
    const sessionDayKeyBeforeSave = camp.condition ? camp.condition.lastSessionDayKey : null;
    const coachSessionsBeforeSave = coach ? (Number(coach.sessionsCompleted) || 0) : 0;

    let conditionResult = homeCampService.applySessionConditionDelta(camp, drill.condDelta * completed);
    if (coach) coachService.incrementSessions(coach, completed);

    try {
        await camp.save();
    } catch (e) {
        console.error(
            `[homeCamp] camp.save() FAILED after the fighter write committed (fighter ${fighterId}, ` +
            `drill ${drill.key} x${completed}) — this session's condition delta and coach counter are lost:`,
            e
        );
        // Roll the IN-MEMORY doc back to what is actually persisted, so every value reported
        // below (condition, coach.sessionsCompleted, promoteReadyNow) describes real DB state.
        // Reporting the optimistic in-memory numbers would be a value we KNOW didn't save — the
        // player would see condition drop, refresh, and watch it jump back.
        if (camp.condition) {
            camp.condition.value = conditionResult.before;
            camp.condition.lastSessionDayKey = sessionDayKeyBeforeSave;
        }
        if (coach) coach.sessionsCompleted = coachSessionsBeforeSave;
        conditionResult = { before: conditionResult.before, after: conditionResult.before, delta: 0 };
    }

    const bandAfter = homeCampService.conditionBand(conditionResult.after);

    // Training-session badge milestones (and any other state-derived badges).
    let newlyEarnedBadges = [];
    try {
        newlyEarnedBadges = require("./badgeService").evaluateBadges(fighter, { training: true }).newlyEarned;
        if (newlyEarnedBadges.length > 0) await fighter.save();
    } catch (_) { /* badge eval must never break training */ }

    // ── Message ─────────────────────────────────────────────────────────────
    const isBatch = clampedQ > 1;
    const xpParts = Object.entries(xpGained).filter(([, v]) => v > 0).map(([stat, v]) => `${v} XP to ${stat}`);
    // A statless drill has no XP to report, so it reports what it DID do instead — otherwise
    // "Training completed." is the only feedback for a session the player paid energy for.
    const nonXpSummary = isMaxStaminaSession
        ? (maxStaminaGained > 0 ? `Max Stamina +${maxStaminaGained}.` : "Max Stamina already at cap.")
        : (conditionResult.delta > 0 ? `Camp condition +${conditionResult.delta}.` : null);

    let message = xpParts.length
        ? `Trained ${drill.name}. Gained ${xpParts.join(", ")}.`
        : `Training (${drill.name}) completed.${nonXpSummary ? ` ${nonXpSummary}` : ""}`;
    if (isBatch) {
        message = xpParts.length
            ? `Trained ${drill.name} ×${completed}. Gained ${xpParts.join(", ")}.`
            : `Training (${drill.name}) ×${completed} completed.${nonXpSummary ? ` ${nonXpSummary}` : ""}`;
        if (stopReason === "out_of_energy") message += " Stopped early (out of energy).";
    }
    if (injurySustained.length > 0) {
        message += ` Injury sustained: ${injurySustained.join(", ")}!`;
        if (isBatch && stopReason === "injury") message += " Stopped early (injury).";
    }

    const boosterResult = boosterCfg ? {
        id: boosterId,
        label: boosterCfg.name,
        pct: boosterCfg.pct,
        statsAffected: boosterStatList(boosterCfg),
        sessionsConsumed: boosterSessionsConsumed,
        sessionsLeftAfter: fighter.activeBooster ? fighter.activeBooster.sessionsLeft : 0,
        depletedThisBatch: boosterDepletedThisBatch,
    } : null;

    return {
        requested: clampedQ,
        completed,
        stopReason,
        xpGained,
        statChanges,
        statLevelUps,
        energyBefore,
        energyAfter,
        energySpent,
        events,
        injurySustained,
        // `rankUp` is deliberately ABSENT — camp promotions are always explicit (§3.3).
        booster: boosterResult,
        maxStaminaGained,
        staminaCapHit,
        sessionsToday: fighter.trainingSessionsToday,
        newlyEarnedBadges,
        rollTier: isBatch ? null : lastTier,
        rollTierCounts,
        moveDrop,
        fighter: fighterService.toPublicFighter(fighter),
        message,
        // ── Camp additions ──
        condition: {
            before: conditionResult.before,
            after: conditionResult.after,
            delta: conditionResult.delta,
            band: bandAfter.key,
            bandLabel: bandAfter.label,
            xpMultiplier: bandAfter.xpMult,
        },
        coach: coach ? {
            coachId: String(coach._id),
            name: coach.name,
            sessionsCompleted: coach.sessionsCompleted,
            rank: coach.rank,
            promoteReadyNow: coachService.isPromoteReady(coach),
        } : null,
        campXpMultiplier: Math.round(sessionMult * 100) / 100,
    };
}

module.exports = { runDrill, effectiveInjuryRate };
