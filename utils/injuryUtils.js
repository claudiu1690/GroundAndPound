/**
 * GDD 8.9 – Injury utility functions.
 * Handles rolling for injuries, building injury docs, applying/reversing stat effects,
 * blocking actions, and processing recovery sessions.
 */
const {
    INJURY_TYPES,
    MINOR_FIGHT_INJURIES,
    MAJOR_FIGHT_INJURIES,
    MINOR_SPARRING_INJURIES,
    MAJOR_SPARRING_INJURIES,
} = require("../consts/injuryDefinitions");

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Roll for a sparring injury.
 * Base rates: 3% minor (sprained_ankle), 0.3% major (torn_ligament).
 * FIQ reduces both probabilities slightly.
 * Returns an injury type key or null.
 */
function rollForSparringInjury(fiq = 10) {
    const fiqReduction = Math.max(0, (fiq - 10) * 0.001);
    const majorChance = Math.max(0.001, 0.003 - fiqReduction);
    const minorChance = Math.max(0.01, 0.03 - fiqReduction);
    const roll = Math.random();
    if (roll < majorChance) return pickRandom(MAJOR_SPARRING_INJURIES);
    if (roll < majorChance + minorChance) return pickRandom(MINOR_SPARRING_INJURIES);
    return null;
}

/**
 * Roll for a fight injury (not KO-induced concussion — that's handled separately).
 * Base rates: 4% major, 12% minor.
 * FIQ reduces both probabilities slightly.
 * riskMultiplier scales both probabilities by tier/difficulty context.
 * Returns an injury type key or null.
 */
function rollForFightInjury(fiq = 10, riskMultiplier = 1) {
    const fiqReduction = Math.max(0, (fiq - 10) * 0.001);
    const safeMultiplier = Math.max(0.1, Number(riskMultiplier) || 1);
    const majorChance = Math.min(0.5, Math.max(0.01, 0.04 - fiqReduction) * safeMultiplier);
    const minorChance = Math.min(0.7, Math.max(0.05, 0.12 - fiqReduction) * safeMultiplier);
    const roll = Math.random();
    if (roll < majorChance) return pickRandom(MAJOR_FIGHT_INJURIES);
    if (roll < majorChance + minorChance) return pickRandom(MINOR_FIGHT_INJURIES);
    return null;
}

/**
 * Build an injury subdocument ready to be pushed onto fighter.injuries.
 * Does NOT apply stat effects — call applyInjuryToFighter() separately.
 */
function buildInjury(typeKey) {
    const def = INJURY_TYPES[typeKey];
    if (!def) return null;
    return {
        type: typeKey,
        label: def.label,
        severity: def.severity,
        effect: def.effect,
        requiresDoctorVisit: !!def.requiresDoctorVisit,
        doctorVisited: false,
        cannotFight: !!def.cannotFight,
        cannotSpar: !!def.cannotSpar,
        cannotBagWork: !!def.cannotBagWork,
        recoverySessionsLeft: def.recoverySessionsNeeded || 0,
        docVisitEnergy: def.docVisitEnergy || 0,
        docVisitIron: def.docVisitIron || 0,
        appliedStatEffects: { ...def.statEffects },
        sustainedAt: new Date(),
    };
}

/**
 * Apply an injury's stat penalties to a fighter document in-place.
 * Call fighter.save() afterwards.
 */
function applyInjuryToFighter(fighter, injury) {
    const e = injury.appliedStatEffects || {};
    const statKeys = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
    for (const k of statKeys) {
        if (e[k]) fighter[k] = Math.max(1, (fighter[k] || 10) + e[k]);
    }
    if (e.maxStamina) {
        fighter.maxStamina = Math.max(50, (fighter.maxStamina || 100) + e.maxStamina);
    }
}

/**
 * Reverse an injury's stat penalties from a fighter document in-place (used when healed).
 * Call fighter.save() afterwards.
 */
function reverseInjuryFromFighter(fighter, injury) {
    const e = injury.appliedStatEffects || {};
    const statKeys = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
    for (const k of statKeys) {
        if (e[k]) fighter[k] = Math.min(100, (fighter[k] || 10) - e[k]);
    }
    if (e.maxStamina) {
        fighter.maxStamina = Math.min(200, (fighter.maxStamina || 100) - e.maxStamina);
    }
}

/**
 * Returns the first injury that blocks fighting, or null if none.
 * An injury blocks fighting if cannotFight=true and doctorVisited=false.
 */
function isFightBlocked(fighter) {
    if (!fighter.injuries || !fighter.injuries.length) return null;
    for (const inj of fighter.injuries) {
        if (inj.cannotFight && !inj.doctorVisited) return inj;
    }
    return null;
}

/**
 * Returns the first injury that blocks sparring, or null if none.
 */
function isSparringBlocked(fighter) {
    if (!fighter.injuries || !fighter.injuries.length) return null;
    for (const inj of fighter.injuries) {
        if (inj.cannotSpar) return inj;
    }
    return null;
}

/**
 * Returns the first injury that blocks bag/pad work, or null if none.
 */
function isBagWorkBlocked(fighter) {
    if (!fighter.injuries || !fighter.injuries.length) return null;
    for (const inj of fighter.injuries) {
        if (inj.cannotBagWork) return inj;
    }
    return null;
}

/**
 * Process one recovery session: decrement recoverySessionsLeft on all eligible injuries.
 * When an injury reaches 0 sessions left it is healed automatically (stat effects reversed).
 * Mutates fighter.injuries in place. Call fighter.save() afterwards.
 * Returns array of healed injury labels.
 */
function processRecoverySession(fighter) {
    const healed = [];
    if (!fighter.injuries || !fighter.injuries.length) return healed;
    const remaining = [];
    for (const inj of fighter.injuries) {
        if (!inj.requiresDoctorVisit && inj.recoverySessionsLeft > 0) {
            inj.recoverySessionsLeft -= 1;
            if (inj.recoverySessionsLeft <= 0) {
                reverseInjuryFromFighter(fighter, inj);
                healed.push(inj.label);
                continue;
            }
        }
        remaining.push(inj);
    }
    fighter.injuries = remaining;
    return healed;
}

module.exports = {
    rollForSparringInjury,
    rollForFightInjury,
    buildInjury,
    applyInjuryToFighter,
    reverseInjuryFromFighter,
    isFightBlocked,
    isSparringBlocked,
    isBagWorkBlocked,
    processRecoverySession,
};
