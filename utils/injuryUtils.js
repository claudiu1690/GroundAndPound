/**
 * GDD 8.9 – Injury utility functions.
 * Handles rolling for injuries, building injury docs, applying/reversing stat effects,
 * blocking actions, and ticking the daily auto-heal counter.
 */
const {
    INJURY_TYPES,
    MINOR_FIGHT_INJURIES,
    MAJOR_FIGHT_INJURIES,
    MINOR_SPARRING_INJURIES,
    MAJOR_SPARRING_INJURIES,
    FULL_RECOVERY_DISCOUNT,
    INJURY_GRACE_FIGHTS,
    docVisitIronFor,
} = require("../consts/injuryDefinitions");

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * New-fighter grace: true while a fighter is still in their first INJURY_GRACE_FIGHTS
 * fights. During the grace window, fight-blocking injuries (Concussion, Cut, Torn
 * Ligament) are NOT applied — a rough start can't lock a new player out of the game.
 *
 * Counts fights already on the record, so call this BEFORE the current fight's result
 * is added to the record (the in-progress fight is the (count+1)-th).
 */
function injuryGraceActive(fighter) {
    const r = (fighter && fighter.record) || {};
    const total = (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
    return total < INJURY_GRACE_FIGHTS;
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
 * SEVERITY SPLIT ONLY — pick WHICH sparring injury lands, given that one already has.
 *
 * rollForSparringInjury (above) owns both the rate AND the severity. The Home Camp gates on
 * each drill's own injuryPct instead, so it needs the severity split on its own; this keeps
 * that split in ONE place rather than re-deriving the 0.003/0.033 ratio at the call site.
 *
 * At FIQ 10 the major share is the historical 0.003 / (0.003 + 0.03) ≈ 9.1%. Higher FIQ
 * shifts the mix toward minor injuries, matching rollForSparringInjury's fiq reduction.
 *
 * @param {number} fiq
 * @returns {string} an injury type key (never null — the caller decides IF an injury happens)
 */
function pickSparringInjuryType(fiq = 10) {
    const fiqReduction = Math.max(0, ((Number(fiq) || 10) - 10) * 0.001);
    const majorChance = Math.max(0.001, 0.003 - fiqReduction);
    const minorChance = Math.max(0.01, 0.03 - fiqReduction);
    const majorShare = majorChance / (majorChance + minorChance);
    return Math.random() < majorShare
        ? pickRandom(MAJOR_SPARRING_INJURIES)
        : pickRandom(MINOR_SPARRING_INJURIES);
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
function buildInjury(typeKey, tier) {
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
        recoveryHoursLeft: def.recoveryHoursNeeded || 0,
        recoveryLastTickAt: def.recoveryHoursNeeded ? new Date() : null,
        docVisitEnergy: def.docVisitEnergy || 0,
        // Tier-scaled (e.g. cheaper Amateur concussion); falls back to base when no tier.
        docVisitIron: docVisitIronFor(typeKey, tier),
        recoverySkipIron: def.recoverySkipIron || 0,
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
        if (inj.cannotSpar && !inj.doctorVisited) return inj;
    }
    return null;
}

/**
 * Returns the first injury that blocks bag/pad work, or null if none.
 */
function isBagWorkBlocked(fighter) {
    if (!fighter.injuries || !fighter.injuries.length) return null;
    for (const inj of fighter.injuries) {
        if (inj.cannotBagWork && !inj.doctorVisited) return inj;
    }
    return null;
}

/**
 * Decrement recoveryHoursLeft on every injury that still has a recovery timer by the
 * number of full 1h periods elapsed since the last tick. Heals injuries that hit 0
 * and reverses their stat penalties. This covers both auto-heal injuries and
 * doctor-required injuries — the latter can be skipped early with a paid doctor visit,
 * but if left alone they heal on their own here, so no injury is ever permanent.
 * Mutates fighter.injuries in place. Call fighter.save() afterwards.
 *
 * Legacy support: pre-migration injuries store `recoveryDaysLeft` (24h units). On
 * first tick we convert those to `recoveryHoursLeft` by multiplying by 24, then
 * proceed normally. The old field is cleared so it doesn't get re-converted.
 *
 * Returns array of healed injury labels.
 */
function tickRecoveryForFighter(fighter, now = new Date()) {
    const healed = [];
    if (!fighter.injuries || !fighter.injuries.length) return healed;
    const remaining = [];
    for (const inj of fighter.injuries) {
        // Migrate legacy day-based injuries to hours on first sight.
        if ((inj.recoveryHoursLeft == null || inj.recoveryHoursLeft === 0) && inj.recoveryDaysLeft > 0) {
            inj.recoveryHoursLeft = inj.recoveryDaysLeft * 24;
            inj.recoveryDaysLeft = 0;
        }
        if (!inj.recoveryHoursLeft || inj.recoveryHoursLeft <= 0) {
            remaining.push(inj);
            continue;
        }
        const last = inj.recoveryLastTickAt ? new Date(inj.recoveryLastTickAt) : new Date(inj.sustainedAt);
        const elapsedMs = now - last;
        const fullHours = Math.floor(elapsedMs / 3_600_000);
        if (fullHours <= 0) {
            remaining.push(inj);
            continue;
        }
        const newHoursLeft = Math.max(0, inj.recoveryHoursLeft - fullHours);
        inj.recoveryHoursLeft = newHoursLeft;
        // Advance the tick anchor by the consumed hours so sub-hour drift doesn't accumulate.
        inj.recoveryLastTickAt = new Date(last.getTime() + fullHours * 3_600_000);
        if (newHoursLeft <= 0) {
            reverseInjuryFromFighter(fighter, inj);
            healed.push(inj.label);
            continue; // drop from remaining
        }
        remaining.push(inj);
    }
    fighter.injuries = remaining;
    return healed;
}

/**
 * Compute the total iron + energy cost of a Full Recovery Package for a fighter.
 * Each active injury contributes its docVisitIron+docVisitEnergy (if doctor-required)
 * or its recoverySkipIron (if auto-heal). The total iron is discounted by FULL_RECOVERY_DISCOUNT.
 */
function quoteFullRecovery(fighter) {
    const injuries = fighter.injuries || [];
    let iron = 0;
    let energy = 0;
    let count = 0;
    for (const inj of injuries) {
        if (inj.requiresDoctorVisit && !inj.doctorVisited) {
            iron += inj.docVisitIron || 0;
            energy += inj.docVisitEnergy || 0;
            count += 1;
        } else if (!inj.requiresDoctorVisit && ((inj.recoveryHoursLeft || 0) > 0 || (inj.recoveryDaysLeft || 0) > 0)) {
            iron += inj.recoverySkipIron || 0;
            count += 1;
        }
    }
    const discountedIron = Math.round(iron * (1 - FULL_RECOVERY_DISCOUNT));
    return { iron: discountedIron, energy, ironBeforeDiscount: iron, count };
}

module.exports = {
    rollForSparringInjury,
    pickSparringInjuryType,
    rollForFightInjury,
    buildInjury,
    applyInjuryToFighter,
    reverseInjuryFromFighter,
    isFightBlocked,
    isSparringBlocked,
    isBagWorkBlocked,
    tickRecoveryForFighter,
    quoteFullRecovery,
    injuryGraceActive,
};
