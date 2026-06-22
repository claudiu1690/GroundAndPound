/**
 * Ground & Pound — shared post-fight PHYSICAL / PROGRESSION consequence engine.
 *
 * This is the SINGLE home for the bodily + progression aftermath of a fight, shared by
 * BOTH the PvE path (services/fightService.resolveFightAndApply) and the PvP path
 * (services/pvpFightService). It owns ONLY:
 *   1. HP write + regen anchor reset
 *   2. fight-injury step (guaranteed concussion on KO/sub loss, else one risk roll)
 *   3. stat-XP banking (fightMode) for the fight's outcome XP table
 *   4. OVR recompute
 *
 * It does NOT touch energy, DP, records, feeds, iron, notoriety, nemesis, quests,
 * gym ranks, badges, or anything economy/season-related. Those stay with each caller.
 *
 * It MUTATES the passed hydrated Fighter doc IN PLACE and returns a snapshot. It does
 * NOT call .save() — the caller owns persistence.
 *
 * RNG: the ONLY Math.random() consumed here is the injury roll (inside
 * rollForFightInjury / buildInjury). HP and XP steps consume no randomness. The injury
 * roll therefore sits at the exact same sequence position the PvE code used (right after
 * HP is known, before record mutation), keeping the PvE RNG stream bit-identical.
 */

const { PROMOTION_TIERS, FIGHT_OUTCOMES } = require("../consts/gameConstants");
const {
    rollForFightInjury,
    buildInjury,
    applyInjuryToFighter,
    injuryGraceActive,
} = require("../utils/injuryUtils");
const { applyXpToStat, roundStatXp, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../utils/statProgression");

const [
    OUT_KO_TKO,       // "KO/TKO"
    OUT_SUB,          // "Submission"
    OUT_DEC_UNAN,     // "Decision (unanimous)"
    OUT_DEC_SPLIT,    // "Decision (split)"
    OUT_DRAW,         // "Draw"
    OUT_LOSS_DEC,     // "Loss (decision)"
    OUT_LOSS_KO,      // "Loss (KO/TKO)"
    OUT_LOSS_SUB,     // "Loss (submission)"
] = FIGHT_OUTCOMES;

/**
 * Build the per-stat fight-XP table for an outcome (player/perspective-relative).
 * Lifted verbatim from fightService (~739-752) — same numbers, same branch order.
 */
function buildFightXpTable(outcome) {
    const isWin = [OUT_KO_TKO, OUT_SUB, OUT_DEC_UNAN, OUT_DEC_SPLIT].includes(outcome);
    const isDraw = outcome === OUT_DRAW;
    const isLoss = !isWin && !isDraw;
    const isKoLoss = outcome === OUT_LOSS_KO || outcome === OUT_LOSS_SUB;

    const fightXp = {};
    if (isWin && outcome === OUT_KO_TKO) {
        fightXp.STR = 30; fightXp.CHN = 15; fightXp.SPD = 10;
    } else if (isWin && outcome === OUT_SUB) {
        fightXp.SUB = 30; fightXp.GND = 20; fightXp.WRE = 10;
    } else if (isWin) {
        ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"].forEach(s => { fightXp[s] = 15; });
        fightXp.FIQ = 20;
    } else if (isKoLoss) {
        fightXp.CHN = 20; fightXp.FIQ = 15;
    } else if (isLoss) {
        fightXp.FIQ = 25;
    }
    return { fightXp, isWin, isDraw, isLoss, isKoLoss };
}

/**
 * Apply a (frozen) XP table to the fighter's CURRENT stat/xp values, fightMode.
 * Lifted verbatim from fightService (~984-1007). Mutates `fighter` in place.
 *
 * xpMultiplier carries ONLY the PvP repeat penalty. PvE passes 1, which makes the
 * applied amount Math.round(baseXp * 1) === Math.round(baseXp) — bit-identical to the
 * old PvE loop (where the outcome/comeback multiplier was NEVER applied to stat XP).
 *
 * @returns {{ xpGained: Object, statLevelUps: string[] }}
 */
function applyXpTable(fighter, fightXp, xpMultiplier) {
    const statLevelUps = [];
    const xpApplied = {};
    if (Object.keys(fightXp).length > 0) {
        for (const [statName, baseXp] of Object.entries(fightXp)) {
            const xpAmount = Math.round(baseXp * xpMultiplier);
            xpApplied[statName] = xpAmount;
            const xpKey = STAT_TO_XP_KEY[statName];
            const valKey = STAT_TO_VAL_KEY[statName];
            if (!xpKey || !valKey) continue;
            const currentStat = fighter[valKey] ?? 10;
            const currentXp = fighter[xpKey] ?? 0;
            const { newStat, newXp } = applyXpToStat(
                currentStat,
                currentXp,
                xpAmount,
                100,
                { fightMode: true }
            );
            if (newStat > currentStat) statLevelUps.push(statName);
            fighter[valKey] = newStat;
            fighter[xpKey] = roundStatXp(newXp);
        }
    }
    return { xpGained: xpApplied, statLevelUps };
}

/** Collagen-style softening of negative injury stat penalties (floored at -1). */
function softenInjury(inj, collagenBuff) {
    if (!(collagenBuff && collagenBuff.injuryMult && inj && inj.appliedStatEffects)) return;
    const eff = inj.appliedStatEffects;
    for (const k of Object.keys(eff)) {
        const e = eff[k];
        if (typeof e === "number" && e < 0) {
            eff[k] = Math.min(-1, Math.round(e * collagenBuff.injuryMult));
        }
    }
}

/**
 * Roll/select the injury for this fight WITHOUT applying it. This is where the single
 * Math.random() lives (KO/sub losses skip the roll — concussion is guaranteed).
 * @returns {Object|null} a built injury object (already softened), or null.
 */
function rollFightInjury(fighter, { isKoLoss, injuryRiskMult, collagenBuff }) {
    const injuryGrace = injuryGraceActive(fighter);
    if (isKoLoss) {
        if (injuryGrace) return null;
        const concussion = buildInjury("concussion", fighter.promotionTier);
        if (!concussion) return null;
        softenInjury(concussion, collagenBuff);
        return concussion;
    }
    const fightInjuryType = rollForFightInjury(fighter.fiq || 10, injuryRiskMult || 1);
    if (!fightInjuryType) return null;
    const inj = buildInjury(fightInjuryType, fighter.promotionTier);
    // During grace, skip fight-blocking injuries (e.g. Cut); minor ones still apply.
    if (!inj || (injuryGrace && inj.cannotFight)) return null;
    softenInjury(inj, collagenBuff);
    return inj;
}

const HEALTH_MAX = 100;

/**
 * Apply the full physical/progression consequence to a hydrated fighter, IN PLACE.
 * Returns a snapshot plus an opaque `mutation` descriptor of the FROZEN decisions
 * (so a concurrent-safe retry can re-apply the SAME injury without re-rolling).
 *
 * @param {import("mongoose").Document} fighter  hydrated Fighter doc (mutated in place)
 * @param {Object} opts
 * @param {string} opts.outcomePerspective  one of FIGHT_OUTCOMES, this fighter's POV
 * @param {number} opts.endingHealth         engine end health for this fighter (0..100)
 * @param {number} [opts.injuryRiskMult=1]   tier injury-risk multiplier
 * @param {number} [opts.xpMultiplier=1]     stat-XP multiplier (PvE=1; PvP repeat penalty)
 * @param {{injuryMult:number}|null} [opts.collagenBuff]  Collagen softening (PvE buff only)
 */
function applyFightConsequences(fighter, {
    outcomePerspective,
    endingHealth,
    injuryRiskMult = 1,
    xpMultiplier = 1,
    collagenBuff = null,
} = {}) {
    const { fightXp, isKoLoss } = buildFightXpTable(outcomePerspective);

    const healthBefore = typeof fighter.health === "number" ? fighter.health : HEALTH_MAX;

    // ── 1. HP write + regen anchor (lifted from fightService ~765-766). ──
    const healthAfter = Math.min(HEALTH_MAX, endingHealth ?? HEALTH_MAX);
    fighter.health = healthAfter;
    const regenAnchor = new Date();
    fighter.healthLastRegenAt = regenAnchor;

    // ── 2. Injury step (the ONLY RNG in this module, lifted ~775-813). ──
    const injuryToAdd = rollFightInjury(fighter, { isKoLoss, injuryRiskMult, collagenBuff });
    const injuriesSustained = [];
    if (injuryToAdd) {
        applyInjuryToFighter(fighter, injuryToAdd);
        fighter.injuries = [...(fighter.injuries || []), injuryToAdd];
        injuriesSustained.push(injuryToAdd.label);
    }

    // ── 3. Stat-XP step (lifted ~984-1007). ──
    const { xpGained, statLevelUps } = applyXpTable(fighter, fightXp, xpMultiplier);

    // ── 4. OVR recompute (lifted ~1022-1023). ──
    const { calculateOverall } = require("../utils/overallRating");
    fighter.overallRating = calculateOverall(fighter);

    return {
        healthBefore,
        healthAfter,
        injuriesSustained,
        xpGained,
        statLevelUps,
        // Opaque frozen-decision descriptor for retry-safe re-application.
        mutation: {
            healthAfter,
            regenAnchor,
            injuryToAdd: injuryToAdd || null,
            xpTable: fightXp,
            xpMultiplier,
        },
    };
}

/**
 * Pure (NO-RNG) re-application of a frozen consequence descriptor onto a FRESH doc.
 * Used by the PvP defender write inside saveWithVersionRetry: a concurrent write that
 * lost the version race re-applies the SAME injury (already rolled once) and re-banks
 * XP against the FRESH doc's current stat/xp values — no re-roll.
 *
 * @param {import("mongoose").Document} freshFighter  freshly loaded doc (mutated in place)
 * @param {Object} descriptor  the `mutation` object returned by applyFightConsequences
 */
function applyConsequenceMutation(freshFighter, descriptor) {
    if (!descriptor) return;
    const { healthAfter, regenAnchor, injuryToAdd, xpTable, xpMultiplier } = descriptor;

    // HP + regen anchor.
    freshFighter.health = Math.min(HEALTH_MAX, healthAfter ?? HEALTH_MAX);
    freshFighter.healthLastRegenAt = regenAnchor || new Date();

    // Frozen injury — push the SAME already-built object (no re-roll).
    if (injuryToAdd) {
        applyInjuryToFighter(freshFighter, injuryToAdd);
        freshFighter.injuries = [...(freshFighter.injuries || []), injuryToAdd];
    }

    // Re-bank XP against the FRESH doc's current stat/xp using the frozen table.
    applyXpTable(freshFighter, xpTable || {}, xpMultiplier ?? 1);

    // OVR recompute on fresh values.
    const { calculateOverall } = require("../utils/overallRating");
    freshFighter.overallRating = calculateOverall(freshFighter);
}

module.exports = {
    applyFightConsequences,
    applyConsequenceMutation,
    // Exposed for tests / parity reasoning.
    buildFightXpTable,
};
