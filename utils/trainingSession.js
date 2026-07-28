/**
 * Shared single-session XP application — the ONE home for training stat math.
 *
 * Extracted (behaviour-preserving) from services/trainingService.js so the gym
 * training path and the Home Camp drill path cannot drift apart. Both callers
 * pass the same shape; the only difference is how they compute the per-stat
 * multiplier (gym: focus/rank-3/booster; camp: tier x coach x condition).
 *
 * PURE-ish: mutates ONLY the fighter's stat value + stat XP keys for the stats it
 * is given. No saves, no I/O, no RNG (the session roll is drawn by the caller so a
 * batch keeps one roll per session shared across stats).
 */
const { applyXpToStat, roundStatXp, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("./statProgression");

/** Training-only hard cap. Stats at/above this gain nothing from training (fight XP only). */
const TRAINING_STAT_CAP = 95;

/**
 * Apply ONE session of XP across a stat list.
 *
 * @param {object} fighter                       Mongoose fighter doc (mutated in place).
 * @param {object} opts
 * @param {string[]} opts.stats                  Stat keys ("STR", "SPD", ...). XP is split evenly.
 * @param {number} opts.xpBase                   Session base XP before roll/multipliers.
 * @param {number|((stat:string)=>number)} opts.multiplier
 *        Total multiplier for the session. A function is called per stat, which is how the
 *        gym path expresses focus-stat / rank-3 / booster differences without a second code path.
 * @param {Set<string>|string[]} [opts.injuryLockedStats]  Stats that gain nothing this session.
 * @param {number} opts.sessionRoll              The RNG roll for THIS session (drawn once by the caller).
 * @returns {{applied:Object<string,number>, wasted:Object<string,number>, capped:string[], locked:string[]}}
 *          `applied`/`wasted` are rounded integer XP per stat for reporting; `capped` lists stats that
 *          were already at the training cap; `locked` lists stats skipped for injury.
 */
function applySessionXp(fighter, { stats, xpBase, multiplier, injuryLockedStats, sessionRoll }) {
    const list = Array.isArray(stats) ? stats : [];
    const locked = injuryLockedStats instanceof Set
        ? injuryLockedStats
        : new Set(Array.isArray(injuryLockedStats) ? injuryLockedStats : []);
    const multFor = typeof multiplier === "function" ? multiplier : () => (Number(multiplier) || 0);

    const applied = {};
    const wasted = {};
    const cappedStats = [];
    const lockedStats = [];

    for (const statName of list) {
        if (locked.has(statName)) {
            lockedStats.push(statName);
            continue;
        }
        const xpKey = STAT_TO_XP_KEY[statName];
        const valKey = STAT_TO_VAL_KEY[statName];
        if (!xpKey || !valKey) continue;

        const xp = xpBase * sessionRoll * multFor(statName) / list.length;
        const currentStat = fighter[valKey] || 10;

        // Training-cap wastage: at/over the cap the whole computed xp is lost
        // (applyXpToStat would return it unchanged anyway).
        if (currentStat >= TRAINING_STAT_CAP) {
            wasted[statName] = (wasted[statName] || 0) + Math.round(xp);
            cappedStats.push(statName);
            continue;
        }

        const currentXp = fighter[xpKey] || 0;
        const { newStat, newXp } = applyXpToStat(currentStat, currentXp, xp, 100);
        fighter[valKey] = newStat;
        fighter[xpKey] = roundStatXp(newXp);
        applied[statName] = (applied[statName] || 0) + Math.max(1, Math.round(xp));
    }

    return { applied, wasted, capped: cappedStats, locked: lockedStats };
}

/** Hard ceiling on max stamina from training. */
const MAX_STAMINA_CAP = 120;
/** Base max-stamina gain per conditioning session; the iron_conditioning gym perk doubles it. */
const MAX_STAMINA_PER_SESSION = 1;

/**
 * Apply ONE conditioning session's max-stamina gain — the second shared home (contract §4.5).
 *
 * Behaviour-preserving extraction of services/trainingService.js's `raisesMaxStamina` loop
 * body, so the gym's S&C session and the camp's `sc_plus` drill cannot drift: +1 per session,
 * +2 while the fighter holds the `iron_conditioning` gym perk, hard-capped at 120.
 *
 * ⚠️ `gymPerks` is a LIVE legacy field (fightService reads strength_reserve, this reads
 * iron_conditioning). It is read-only here and must never be pruned — see fighterModel.js.
 *
 * MUTATES fighter.maxStamina only. No saves, no I/O, no RNG.
 * @param {object} fighter Mongoose fighter doc (mutated in place).
 * @returns {{gained:number, capHit:boolean}} `capHit` is true when the session gained nothing
 *          because the fighter is already at the cap.
 */
function applyMaxStaminaSession(fighter) {
    const perGain = (fighter.gymPerks || []).includes("iron_conditioning")
        ? MAX_STAMINA_PER_SESSION * 2
        : MAX_STAMINA_PER_SESSION;

    const currentMax = fighter.maxStamina || 100;
    let nextMax = currentMax;
    if (currentMax < MAX_STAMINA_CAP) nextMax = Math.min(MAX_STAMINA_CAP, currentMax + perGain);
    const gained = nextMax - currentMax;
    fighter.maxStamina = nextMax;
    return { gained, capHit: gained === 0 };
}

module.exports = { applySessionXp, applyMaxStaminaSession, TRAINING_STAT_CAP, MAX_STAMINA_CAP };
