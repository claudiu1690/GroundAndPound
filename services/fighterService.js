const Fighter = require("../models/fighterModel");
const Gym = require("../models/gymModel");
const { STYLES, BACKSTORIES, ENERGY } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");
const { xpRequiredForNextPoint, roundStatXp, normalizeBankedXp } = require("../utils/statProgression");
const notorietyService = require("./notorietyService");
const energyService = require("./energyService");
const personaService = require("./personaService");

/** Persona (Role Model) hospital-bill discount fraction (≤0). Injury-clearing charges only. */
function hospitalBillFrac(fighter) {
    return personaService.getModifiers(fighter).hospitalBillFrac || 0;
}

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const STAT_NAMES = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];
const STAT_TO_XP = { str: "strXp", spd: "spdXp", leg: "legXp", wre: "wreXp", gnd: "gndXp", sub: "subXp", chn: "chnXp", fiq: "fiqXp" };
const KEY_TO_STAT = { str: "STR", spd: "SPD", leg: "LEG", wre: "WRE", gnd: "GND", sub: "SUB", chn: "CHN", fiq: "FIQ" };

/**
 * Read a fighter's energy shape safely (supports legacy numeric energy).
 * @param {Object} fighter
 * @returns {{ current: number, max: number, lastSyncedAt: Date }}
 */
function energySnapshot(fighter) {
    if (fighter?.energy && typeof fighter.energy === "object") {
        return {
            current: Number.isFinite(fighter.energy.current) ? fighter.energy.current : ENERGY.max,
            max: Number.isFinite(fighter.energy.max) ? fighter.energy.max : ENERGY.max,
            lastSyncedAt: fighter.energy.lastSyncedAt || new Date(),
        };
    }
    if (Number.isFinite(fighter?.energy)) {
        return { current: fighter.energy, max: ENERGY.max, lastSyncedAt: new Date() };
    }
    return { current: ENERGY.max, max: ENERGY.max, lastSyncedAt: new Date() };
}

/**
 * Apply an energy snapshot to the fighter mongoose document.
 * @param {Object} fighter
 * @param {{ current: number, max: number }} snapshot
 */
function setEnergySnapshot(fighter, snapshot) {
    fighter.energy = {
        current: snapshot.current,
        max: snapshot.max,
        lastSyncedAt: new Date(),
    };
}

/**
 * Build stat progress for API: value, xp, xpToNext per stat (for XP meters in frontend).
 */
function buildStatProgress(fighter) {
    const progress = {};
    for (const name of STAT_NAMES) {
        const key = name.toLowerCase();
        const value = fighter[key] != null ? fighter[key] : 10;
        const rawXp = fighter[STAT_TO_XP[key]] != null ? fighter[STAT_TO_XP[key]] : 0;
        const { newStat, newXp } = normalizeBankedXp(value, rawXp);
        const xpToNext = xpRequiredForNextPoint(newStat);
        progress[name] = {
            value: newStat,
            xp: roundStatXp(newXp),
            xpToNext: xpToNext ?? null,
        };
    }
    return progress;
}

/**
 * Persist overflow XP into stat points (same pipeline as fights). Fixes bad rows + quest direct stat bonuses.
 */
async function reconcileStatXpBanks(fighter) {
    let dirty = false;
    for (const name of STAT_NAMES) {
        const key = name.toLowerCase();
        const val = fighter[key] ?? 10;
        const xpKey = STAT_TO_XP[key];
        const xp = fighter[xpKey] ?? 0;
        const { newStat, newXp } = normalizeBankedXp(val, xp);
        const rounded = roundStatXp(newXp);
        if (newStat !== val || Math.abs(rounded - xp) > 1e-6) {
            fighter[key] = newStat;
            fighter[xpKey] = rounded;
            dirty = true;
        }
    }
    if (dirty) {
        fighter.overallRating = calculateOverall(fighter);
        await fighter.save();
    }
}

/**
 * Stats that are currently injury-penalized (negative effect active).
 * Used by training UI/service to lock progression while injured.
 */
function getInjuryLockedStats(fighter) {
    const locked = new Set();
    for (const inj of fighter.injuries || []) {
        const effects = inj.appliedStatEffects || {};
        for (const [key, statName] of Object.entries(KEY_TO_STAT)) {
            if ((effects[key] || 0) < 0) locked.add(statName);
        }
    }
    return Array.from(locked);
}

/**
 * Build starting stats from style and optional backstory.
 */
function buildStartingStats(style, backstory) {
    const start = STYLES[style] && STYLES[style].start ? { ...STYLES[style].start } : {};
    const stats = {};
    for (const s of STAT_NAMES) {
        const key = s.toLowerCase();
        stats[key] = Math.min(100, Math.max(1, start[s] || 10));
    }
    if (backstory && BACKSTORIES[backstory]) {
        const bonus = BACKSTORIES[backstory];
        if (bonus.allStats) {
            STAT_KEYS.forEach(k => { stats[k] = Math.min(100, stats[k] + bonus.allStats); });
        }
        STAT_NAMES.forEach(s => {
            const key = s.toLowerCase();
            if (bonus[key] || bonus[s]) stats[key] = Math.min(100, stats[key] + (bonus[key] || bonus[s] || 0));
        });
        if (bonus.maxStaminaBonus) stats.maxStaminaBonus = bonus.maxStaminaBonus;
    }
    return stats;
}

/**
 * Create a new fighter (character creation). Applies style starting stats and backstory bonuses.
 */
async function createFighter(data) {
    const { firstName, lastName, nickname, weightClass, style, backstory } = data;
    if (!firstName || !lastName || !weightClass || !style) {
        throw new Error("firstName, lastName, weightClass, and style are required");
    }
    // Names are visible to every other player (ladders, gazette, Hall of Fame) —
    // reject profane first/last name or nickname.
    const { assertCleanName } = require("../utils/profanity");
    assertCleanName(firstName, "First name");
    assertCleanName(lastName, "Last name");
    if (nickname) assertCleanName(nickname, "Nickname");
    const built = buildStartingStats(style, backstory || null);
    const maxStamina = 100 + (built.maxStaminaBonus || 0);
    delete built.maxStaminaBonus;

    const fighter = new Fighter({
        firstName,
        lastName,
        nickname: nickname || null,
        weightClass,
        style,
        backstory: backstory || null,
        ...built,
        maxStamina,
        stamina: 100,
        health: 100,
        energy: { current: ENERGY.max, max: ENERGY.max, lastSyncedAt: new Date() },
        iron: 0,
        winStreak: 0,
        notoriety: {
            score: 0,
            peakTier: "UNKNOWN",
            isFrozen: false,
            lastEventAt: null,
            documentaryUsed: false,
            milestones: {},
            firstFinishPromoTiers: [],
        },
        promotionTier: "Amateur",
        overallRating: 14
    });
    // Media Hub: seed a generated podcast name at creation.
    try {
        const { generatePodcastName } = require("../consts/mediaHubConfig");
        fighter.media = fighter.media || {};
        fighter.media.podcastName = generatePodcastName(firstName, lastName, nickname || null);
    } catch (_) { /* non-fatal */ }
    fighter.overallRating = calculateOverall(fighter);
    await fighter.save();
    return getFighterById(fighter._id);
}

/**
 * List fighters for selection screens and admin views.
 * @param {number} limit
 * @returns {Promise<Array<Object>>}
 */
async function listFighters(limit = 50) {
    const fighters = await Fighter.find({}).limit(limit).select("firstName lastName nickname weightClass style overallRating energy record").lean();
    return fighters;
}

/**
 * Plain fighter JSON for API: energy reconciled + notoriety public state.
 * @param {import("mongoose").Document} fighter
 */
function toPublicFighter(fighter) {
    notorietyService.ensureNotorietyShape(fighter);
    const out = fighter.toObject ? fighter.toObject() : { ...fighter };
    // Never ship the ladder-bot flag to a client. GET /fighters/:id has no ownFighter
    // middleware, so ANY authed player can read any fighter through here — leaving this in
    // hands out a free "which ladder opponents are bots" oracle.
    delete out.isPvpBot;
    out.notoriety = notorietyService.buildNotorietyPublicState(fighter);
    out.injuryLockedStats = getInjuryLockedStats(fighter);
    // Perks the fighter actually holds, resolved to name + effect. `gymPerks` ships as bare
    // key strings, which is why nothing in the UI ever rendered them — a player could take a
    // coach to Rank 4, pay $5,000 and have no screen anywhere that showed what they got.
    // Names/effects come from GYM_PERK_CATALOG (built from data/gyms.json) so the profile,
    // the camp card and the Library can never disagree about what a perk does. Unknown keys
    // are dropped rather than rendered raw.
    {
        const { GYM_PERK_CATALOG } = require("../consts/homeCampConfig");
        out.perksOwned = (Array.isArray(fighter.gymPerks) ? fighter.gymPerks : [])
            .map((key) => GYM_PERK_CATALOG[key])
            .filter(Boolean)
            .map((p) => ({ key: p.key, name: p.name, effect: p.effect }));
    }
    // Persona (Role Model) hospital discount: the injury card prices shown in the
    // hospital UI must match what doctorVisit/skipRecovery actually charge (same
    // fraction + rounding). Base values stay in *Base; the tag explains the delta.
    const billFrac = hospitalBillFrac(fighter);
    if (billFrac && Array.isArray(out.injuries)) {
        out.injuries = out.injuries.map((inj) => ({
            ...inj,
            ...(inj.docVisitIron > 0 ? { docVisitIron: Math.round(inj.docVisitIron * (1 + billFrac)), docVisitIronBase: inj.docVisitIron } : {}),
            ...(inj.recoverySkipIron > 0 ? { recoverySkipIron: Math.round(inj.recoverySkipIron * (1 + billFrac)), recoverySkipIronBase: inj.recoverySkipIron } : {}),
        }));
    }
    out.hospitalPersona = personaService.priceAdjust(fighter, "hospitalBillFrac");
    // Shift player's rank to display rank for the UI. DB stores 2-N (1 = champion slot,
    // never the player). UI shows champion separately and contenders as #1-#(N-1).
    if (out.ranking && typeof out.ranking.rank === "number") {
        out.ranking.rank = require("./rankingService").toDisplayRank(out.ranking.rank);
    }
    return out;
}

/**
 * Get one fighter and refresh in-memory energy from Redis.
 * @param {string} id
 * @returns {Promise<Object>}
 */
/** Cheap fingerprint of injury recovery state — changes when any injury ticks or heals. */
function injurySignature(fighter) {
    return (fighter.injuries || [])
        .map((i) => `${i.type}:${i.recoveryHoursLeft || (i.recoveryDaysLeft || 0) * 24}`)
        .join(",");
}

async function getFighterById(id) {
    const { tickRecoveryForFighter } = require("../utils/injuryUtils");
    const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

    // reconcileStatXpBanks may persist; it has no overlap with the injury/health
    // tick window the background heal job touches, so keep it as-is.
    const pre = await Fighter.findById(id);
    if (!pre) throw new Error("Fighter not found");
    await reconcileStatXpBanks(pre);

    // The persistent injury-tick + health write races the background heal job, so
    // route it through optimistic-concurrency retry. The mutate fn re-loads fresh,
    // re-runs reconcileHealth + tickRecoveryForFighter on the winner's state, and
    // saves only when something actually changed. tickRecoveryForFighter is
    // time-based off recoveryLastTickAt, so re-running on a fresh doc that the heal
    // job already advanced is a no-op (no double-reverse).
    const saved = await saveWithVersionRetry(
        () => Fighter.findById(id).populate("gymId"),
        (f) => {
            // Preserve the original no-op-read semantics: reconcileHealth bumps
            // healthLastRegenAt to "now" even when health is unchanged, which would
            // otherwise mark the doc dirty and bump __v on every plain read (making
            // the background heal job lose every race). Capture the prior anchor and
            // restore it when neither health nor injuries actually changed, so an
            // unchanged read produces no modified paths and save() is a true no-op.
            const healthBefore = f.health;
            const regenAnchorBefore = f.healthLastRegenAt;
            const injuriesBefore = injurySignature(f);
            reconcileHealth(f);
            tickRecoveryForFighter(f);
            const changed = f.health !== healthBefore || injurySignature(f) !== injuriesBefore;
            if (!changed) {
                f.healthLastRegenAt = regenAnchorBefore;
            }
        }
    );
    // saved is non-null (we already confirmed the doc exists above).
    const fighter = saved;

    // Energy lives in Redis (authoritative) + in-memory snapshot; no version guard
    // needed. Reconcile on the final winning doc before serializing.
    await reconcileEnergy(fighter);

    const pub = toPublicFighter(fighter);
    // Attach the unread offline-defense summary so the nav dot + PVP-Hub banner
    // read it off the fighter payload with no extra request and no ack. This is
    // the most-hit endpoint, so a defense-query failure must NEVER break the load
    // — fall back to an all-zero summary. LAZY require avoids the circular dep
    // (pvpFightService already requires fighterService at the top level).
    try {
        const pvpFightService = require("./pvpFightService");
        pub.pvpDefense = await pvpFightService.summarizeUnreadDefenses(String(id));
    } catch (e) {
        console.error("[fighter] pvpDefense summary failed:", e.message);
        pub.pvpDefense = {
            unreadCount: 0,
            heldCount: 0,
            lostCount: 0,
            totalDpChange: 0,
            injuries: [],
            reportFightId: null,
            reportFightKind: null,
        };
    }
    return pub;
}

/**
 * Update fighter profile fields and recalculate overall rating.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function updateFighter(id, data) {
    const fighter = await Fighter.findByIdAndUpdate(id, data, { new: true }).populate("gymId");
    if (!fighter) throw new Error("Fighter not found");
    fighter.overallRating = calculateOverall(fighter);
    await fighter.save();
    await reconcileEnergy(fighter);
    return toPublicFighter(fighter);
}

/**
 * Reconcile energy from Redis (authoritative) onto the fighter document in memory.
 * Cold start fallback is handled inside energyService.getEnergy().
 */
async function reconcileEnergy(fighter) {
    const snap = await energyService.getEnergy(String(fighter._id));
    setEnergySnapshot(fighter, snap);
    return fighter;
}

/**
 * Passively regenerate health based on elapsed real time.
 * Gains +1 health per 5 minutes since `healthLastRegenAt`, capped at 100
 * (so a full heal from 0 takes ~8h20m).
 * Only advances the timestamp by the amount of time actually consumed — partial
 * intervals are preserved so players don't lose progress between loads.
 */
const HEALTH_REGEN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes per +1 health
const HEALTH_MAX = 100;

function reconcileHealth(fighter) {
    if (!fighter) return fighter;
    const currentHealth = fighter.health ?? HEALTH_MAX;
    if (currentHealth >= HEALTH_MAX) {
        // Keep timestamp fresh so we don't accrue backdated regen after damage.
        fighter.healthLastRegenAt = new Date();
        return fighter;
    }

    const lastRegenAt = fighter.healthLastRegenAt ? new Date(fighter.healthLastRegenAt).getTime() : Date.now();
    const elapsedMs = Math.max(0, Date.now() - lastRegenAt);
    const pointsEarned = Math.floor(elapsedMs / HEALTH_REGEN_INTERVAL_MS);
    if (pointsEarned <= 0) return fighter;

    const capacity = HEALTH_MAX - currentHealth;
    const pointsApplied = Math.min(pointsEarned, capacity);
    fighter.health = currentHealth + pointsApplied;
    // Advance timestamp by exactly the consumed time — preserve partial progress.
    fighter.healthLastRegenAt = new Date(lastRegenAt + pointsApplied * HEALTH_REGEN_INTERVAL_MS);
    return fighter;
}

/**
 * Legacy compatibility wrapper. Energy ticking is now handled by BullMQ + Redis.
 */
async function reconcileAllFightersEnergy() {
    return 0;
}

/**
 * Legacy compatibility wrapper. Prefer addEnergy() from energyService.
 */
async function replenishEnergyAll() {
    return { acknowledged: true, modifiedCount: 0 };
}

/**
 * Deduct energy from a fighter. Throws if not enough. Reconciles energy first (1/min since last update).
 */
async function deductEnergy(fighterId, amount) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const snap = await energyService.deductEnergy(fighterId, amount);
    setEnergySnapshot(fighter, snap);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * DEBUG: set energy to max (testing only). Gated by route / env in non-production.
 */
async function debugRefillEnergyToMax(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const { current, max } = await energyService.getEnergy(fighterId);
    const snap = await energyService.addEnergy(fighterId, Math.max(0, max - current));
    setEnergySnapshot(fighter, snap);
    await fighter.save();
    return toPublicFighter(fighter);
}

/**
 * GDD 8.9: Doctor visit — spend energy AND iron to clear an injury that requires medical attention.
 * Instantly heals the injury and reverses its stat penalties.
 */
async function doctorVisit(fighterId, injuryType) {
    const { reverseInjuryFromFighter } = require("../utils/injuryUtils");
    const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

    // ── Validation + side effects ONCE, before the retry loop ──────────────
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    const currentEnergy = energySnapshot(fighter).current;

    const target = (fighter.injuries || []).find(
        (inj) => inj.type === injuryType && inj.requiresDoctorVisit && !inj.doctorVisited
    );
    if (!target) throw new Error("Injury not found or does not require a doctor visit");

    // Capture the stable subdoc _id — array index is not safe across reloads.
    const injuryId = String(target._id);
    const energyCost = target.docVisitEnergy || 0;
    // Persona (Role Model) −15% on the doctor-visit charge (an injury-clearing bill).
    const ironCost = Math.round((target.docVisitIron || 0) * (1 + hospitalBillFrac(fighter)));

    if (currentEnergy < energyCost) {
        throw new Error(`Not enough energy (doctor visit costs ${energyCost})`);
    }
    if ((fighter.iron || 0) < ironCost) {
        throw new Error(`Not enough cash (doctor visit costs $${ironCost})`);
    }

    // Energy is a Redis side effect — deduct exactly once, here.
    if (energyCost > 0) {
        await energyService.deductEnergy(fighterId, energyCost);
    }

    // ── Pure-document mutation, retried on version conflict ────────────────
    let energyRefunded = false;
    const saved = await saveWithVersionRetry(
        () => Fighter.findById(fighterId),
        (f) => {
            const inj = (f.injuries || []).id(injuryId);
            if (!inj) {
                // Heal job won the race: the injury already healed/reversed on a fresh
                // load. Deterministic clean no-op — do NOT reverse again, do NOT charge
                // iron. Refund the already-deducted energy exactly once.
                if (energyCost > 0 && !energyRefunded) {
                    energyRefunded = true;
                }
                return;
            }
            // Iron decrement happens on the fresh (un-charged) doc → applied exactly once.
            if (ironCost > 0) f.iron = (f.iron || 0) - ironCost;
            reverseInjuryFromFighter(f, inj);
            f.injuries.pull(injuryId);
        }
    );

    // Refund outside the (idempotent) mutate fn so the Redis write happens once,
    // regardless of how many version retries ran.
    if (energyRefunded && energyCost > 0) {
        const refunded = await energyService.addEnergy(fighterId, energyCost);
        setEnergySnapshot(saved, refunded);
    } else {
        await reconcileEnergy(saved);
    }
    return toPublicFighter(saved);
}

/**
 * Hospital — Skip Recovery: pay iron to instantly clear an auto-heal injury (no waiting hours).
 * Only works on injuries with requiresDoctorVisit=false and an active recovery timer.
 */
async function hospitalSkipRecovery(fighterId, injuryType) {
    const { reverseInjuryFromFighter } = require("../utils/injuryUtils");
    const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

    // ── Validation ONCE, before the retry loop ─────────────────────────────
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const isHealing = (inj) =>
        (inj.recoveryHoursLeft || 0) > 0 || (inj.recoveryDaysLeft || 0) > 0;
    const target = (fighter.injuries || []).find(
        (inj) => inj.type === injuryType && !inj.requiresDoctorVisit && isHealing(inj)
    );
    if (!target) throw new Error("Injury not found or not eligible for recovery skip");

    const injuryId = String(target._id);
    // Persona (Role Model) −15% on the skip-recovery charge (an injury-clearing bill).
    const ironCost = Math.round((target.recoverySkipIron || 0) * (1 + hospitalBillFrac(fighter)));
    if ((fighter.iron || 0) < ironCost) {
        throw new Error(`Not enough cash (skip recovery costs $${ironCost})`);
    }

    // No energy cost here, so no refund concern. Iron is decremented inside the
    // retried mutate on a fresh doc → applied exactly once on the winning save.
    const saved = await saveWithVersionRetry(
        () => Fighter.findById(fighterId),
        (f) => {
            const inj = (f.injuries || []).id(injuryId);
            if (!inj) {
                // Heal job won the race: already healed. Clean no-op — no iron charged.
                return;
            }
            if (ironCost > 0) f.iron = (f.iron || 0) - ironCost;
            reverseInjuryFromFighter(f, inj);
            f.injuries.pull(injuryId);
        }
    );
    await reconcileEnergy(saved);
    return toPublicFighter(saved);
}

/**
 * Hospital — Full Recovery Package: heal every active injury in one transaction.
 * Atomically deducts iron + energy for all of them; rejects if either is insufficient.
 */
async function hospitalFullRecovery(fighterId) {
    const { reverseInjuryFromFighter, quoteFullRecovery } = require("../utils/injuryUtils");
    const saveWithVersionRetry = require("../utils/saveWithVersionRetry");

    // ── Validation + side effects ONCE, before the retry loop ──────────────
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    await reconcileEnergy(fighter);
    const currentEnergy = energySnapshot(fighter).current;

    const quote = quoteFullRecovery(fighter);
    if (quote.count === 0) throw new Error("No active injuries to heal");
    if (currentEnergy < quote.energy) {
        throw new Error(`Not enough energy (full recovery costs ${quote.energy})`);
    }
    // Persona (Role Model) −15% on the full-recovery bill — validate against the discount.
    const billFrac = hospitalBillFrac(fighter);
    const discountedQuoteIron = Math.round(quote.iron * (1 + billFrac));
    if ((fighter.iron || 0) < discountedQuoteIron) {
        throw new Error(`Not enough cash (full recovery costs $${discountedQuoteIron})`);
    }

    // Build a per-injury cost map keyed by stable _id so we can (a) re-identify
    // targets after a fresh reload and (b) refund/skip the share of any target the
    // heal job removed out from under us. We store RAW iron + energy per injury; the
    // FULL_RECOVERY_DISCOUNT is re-applied once over the survivors inside the mutate,
    // mirroring quoteFullRecovery exactly, so the player only pays for what heals.
    const { FULL_RECOVERY_DISCOUNT } = require("../consts/injuryDefinitions");
    const isAutoHealing = (inj) =>
        !inj.requiresDoctorVisit && ((inj.recoveryHoursLeft || 0) > 0 || (inj.recoveryDaysLeft || 0) > 0);

    const targets = new Map(); // injuryId -> { rawIron, energy }
    for (const inj of fighter.injuries || []) {
        if (inj.requiresDoctorVisit && !inj.doctorVisited) {
            targets.set(String(inj._id), { rawIron: inj.docVisitIron || 0, energy: inj.docVisitEnergy || 0 });
        } else if (isAutoHealing(inj)) {
            targets.set(String(inj._id), { rawIron: inj.recoverySkipIron || 0, energy: 0 });
        }
    }

    // Energy is a Redis side effect — deduct the full quoted amount exactly once.
    if (quote.energy > 0) {
        await energyService.deductEnergy(fighterId, quote.energy);
    }

    // ── Pure-document mutation, retried on version conflict ────────────────
    let healedLabels = [];
    let ironCharged = 0;
    let energyRefund = 0;
    const saved = await saveWithVersionRetry(
        () => Fighter.findById(fighterId),
        (f) => {
            // Reset per-attempt accumulators (mutate may re-run on a fresh doc).
            healedLabels = [];
            let survivorRawIron = 0;
            energyRefund = 0;
            const toPull = [];
            for (const [injuryId, meta] of targets) {
                const inj = (f.injuries || []).id(injuryId);
                if (!inj) {
                    // Heal job already removed this one — refund its energy share and
                    // charge no iron for it. Deterministic clean no-op for this injury.
                    energyRefund += meta.energy;
                    continue;
                }
                reverseInjuryFromFighter(f, inj);
                survivorRawIron += meta.rawIron;
                healedLabels.push(inj.label);
                toPull.push(injuryId);
            }
            // Apply the package discount once over the survivors' raw iron — same math
            // as quoteFullRecovery — then the persona (Role Model) hospital discount, then
            // decrement on the fresh (un-charged) doc.
            ironCharged = Math.round(survivorRawIron * (1 - FULL_RECOVERY_DISCOUNT) * (1 + billFrac));
            if (ironCharged > 0) f.iron = (f.iron || 0) - ironCharged;
            for (const injuryId of toPull) f.injuries.pull(injuryId);
        }
    );

    // Apply the energy refund (Redis) exactly once, after the doc is settled.
    if (energyRefund > 0) {
        const refunded = await energyService.addEnergy(fighterId, energyRefund);
        setEnergySnapshot(saved, refunded);
    } else {
        await reconcileEnergy(saved);
    }
    return {
        fighter: toPublicFighter(saved),
        healed: healedLabels,
        ironPaid: ironCharged,
        energyPaid: Math.max(0, quote.energy - energyRefund),
    };
}

/**
 * Hospital — Quote: returns the iron+energy cost the player would pay for the Full Recovery Package
 * given their current injury state. Also returns the player's current health so the UI can render
 * the Health Restoration buttons with accurate "actual heal" preview values.
 */
async function hospitalQuote(fighterId) {
    const { quoteFullRecovery } = require("../utils/injuryUtils");
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    reconcileHealth(fighter);
    const fullRecovery = quoteFullRecovery(fighter);
    // Quote the persona-discounted bill — hospitalFullRecovery charges exactly
    // Math.round(quote.iron * (1 + billFrac)); the quote must show that number.
    const billFrac = hospitalBillFrac(fighter);
    return {
        ...fullRecovery,
        iron: Math.round((fullRecovery.iron || 0) * (1 + billFrac)),
        ironBase: fullRecovery.iron || 0,
        personaDiscount: personaService.priceAdjust(fighter, "hospitalBillFrac"),
        health: {
            current: fighter.health ?? 100,
            max: 100,
        },
    };
}

/**
 * Hospital — Restore Health: pay iron to restore HP via one of the three packages.
 * Iron cost is pro-rated when the package would be capped at 100 HP — the player only
 * pays for the HP actually delivered. No tier gating — all packages available to every fighter.
 */
async function hospitalRestoreHealth(fighterId, packageKey) {
    const { HEALTH_PACKAGES } = require("../consts/injuryDefinitions");
    const pkg = HEALTH_PACKAGES[packageKey];
    if (!pkg) throw new Error("Unknown health package");

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    reconcileHealth(fighter);

    const currentHealth = fighter.health ?? 100;
    if (currentHealth >= 100) throw new Error("Health is already full");

    const restored = Math.min(pkg.hp, 100 - currentHealth);
    // Pro-rate the iron cost so a player at 35 HP missing pays for 35, not the full package.
    const proRatedIron = Math.ceil((restored / pkg.hp) * pkg.iron);

    if ((fighter.iron || 0) < proRatedIron) {
        throw new Error(`Not enough cash (this ${pkg.label} costs $${proRatedIron})`);
    }

    fighter.iron = (fighter.iron || 0) - proRatedIron;
    fighter.health = currentHealth + restored;
    // Reset regen anchor so passive regen continues from the new HP value.
    fighter.healthLastRegenAt = new Date();
    await fighter.save();
    return { fighter: toPublicFighter(fighter), restored, ironPaid: proRatedIron };
}


/**
 * Switch active gym membership. Deducts the weekly cash cost and sets
 * activeGymPaidUntil = now + 7 days. Initializes gym rank progress if first
 * time at this gym. This (activeGymId + activeGymPaidUntil) is the single
 * source of truth for membership — see questService.hasValidGymMembership,
 * trainingService access gate, and gymController's daysLeft countdown.
 */
async function switchGym(fighterId, gymId, userId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const Gym = require("../models/gymModel");
    const gym = await Gym.findById(gymId);
    if (!gym) throw new Error("Gym not found");

    if (gym.isFreeGym) throw new Error("Community gym is always free — no membership needed");

    // Tier gate check
    const { PROMOTION_TIERS } = require("../consts/gameConstants");
    const TIER_ORDER = Object.keys(PROMOTION_TIERS);
    if (TIER_ORDER.indexOf(fighter.promotionTier ?? "Amateur") < TIER_ORDER.indexOf(gym.availableFrom)) {
        throw new Error(`This gym requires ${gym.availableFrom} tier or higher`);
    }

    if ((fighter.iron ?? 0) < gym.weeklyCost) {
        throw new Error(`Not enough cash — need $${gym.weeklyCost}`);
    }

    fighter.iron -= gym.weeklyCost;
    fighter.activeGymId = gym._id;
    fighter.activeGymPaidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    fighter.gymId = gym._id; // also set as home gym for display

    // Initialize rank progress if first time
    const gymRankService = require("./gymRankService");
    gymRankService.getOrInitRank(fighter, gym.slug);

    await fighter.save();

    // Fire-and-forget analytics — userId is threaded from the controller (req.user.id).
    require("./analyticsService").track(
        userId,
        "gym_purchase",
        { gymId: String(gym._id), weeklyCost: gym.weeklyCost },
        { fighterId: fighter._id }
    );

    return toPublicFighter(fighter);
}

module.exports = {
    createFighter,
    listFighters,
    getFighterById,
    toPublicFighter,
    updateFighter,
    reconcileEnergy,
    reconcileHealth,
    deductEnergy,
    debugRefillEnergyToMax,
    doctorVisit,
    hospitalSkipRecovery,
    hospitalFullRecovery,
    hospitalQuote,
    hospitalRestoreHealth,
    switchGym,
    buildStatProgress,
    getInjuryLockedStats
};
