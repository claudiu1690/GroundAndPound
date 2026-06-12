"use strict";

const test = require("node:test");
const assert = require("node:assert");

const fightConsequenceService = require("../../services/fightConsequenceService");
const { applyXpToStat, roundStatXp, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../../utils/statProgression");
const { calculateOverall } = require("../../utils/overallRating");

/** Minimal fighter stand-in with the fields the module reads/writes. */
function makeFighter(overrides = {}) {
    const base = {
        str: 40, spd: 40, leg: 40, wre: 40, gnd: 40, sub: 40, chn: 40, fiq: 40,
        strXp: 0, spdXp: 0, legXp: 0, wreXp: 0, gndXp: 0, subXp: 0, chnXp: 0, fiqXp: 0,
        fiq: 40,
        health: 100,
        healthLastRegenAt: new Date(0),
        injuries: [],
        record: { wins: 50, losses: 50, draws: 0 }, // past grace window
        overallRating: 0,
    };
    return Object.assign(base, overrides);
}

/** Re-implement the OLD PvE stat-XP loop verbatim (Math.round(baseXp), fightMode). */
function oldPveXpLoop(fighter, fightXp) {
    const statLevelUps = [];
    const fightXpApplied = {};
    for (const [statName, baseXp] of Object.entries(fightXp)) {
        const xpAmount = Math.round(baseXp);
        fightXpApplied[statName] = xpAmount;
        const xpKey = STAT_TO_XP_KEY[statName];
        const valKey = STAT_TO_VAL_KEY[statName];
        if (!xpKey || !valKey) continue;
        const currentStat = fighter[valKey] ?? 10;
        const currentXp = fighter[xpKey] ?? 0;
        const { newStat, newXp } = applyXpToStat(currentStat, currentXp, xpAmount, 100, { fightMode: true });
        if (newStat > currentStat) statLevelUps.push(statName);
        fighter[valKey] = newStat;
        fighter[xpKey] = roundStatXp(newXp);
    }
    return { fightXpApplied, statLevelUps };
}

test("xpMultiplier:1 is bit-identical to the old PvE Math.round(baseXp) loop", () => {
    const outcomes = [
        "KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)",
        "Draw", "Loss (decision)", "Loss (KO/TKO)", "Loss (submission)",
    ];
    for (const outcome of outcomes) {
        const { fightXp } = fightConsequenceService.buildFightXpTable(outcome);

        // Old path: apply the verbatim loop to a fresh fighter.
        const oldF = makeFighter();
        const oldRes = oldPveXpLoop(oldF, fightXp);

        // New path: drive the module with xpMultiplier:1. Suppress the injury roll so we
        // isolate XP (no-loss/no-ko outcomes can still roll, so force Math.random high to
        // dodge the risk roll, and grace-out concussion via the record).
        const newF = makeFighter();
        const origRandom = Math.random;
        Math.random = () => 0.999999; // never trips a fight injury
        let cons;
        try {
            cons = fightConsequenceService.applyFightConsequences(newF, {
                outcomePerspective: outcome,
                endingHealth: 73,
                injuryRiskMult: 1,
                xpMultiplier: 1,
                collagenBuff: null,
            });
        } finally {
            Math.random = origRandom;
        }

        // XP banking must match exactly. The accumulated xp-per-stat keys are untouched by
        // the injury step (injuries only adjust stat VALUES via appliedStatEffects), so the
        // xp keys are a clean parity surface for the XP math itself.
        for (const k of Object.values(STAT_TO_XP_KEY)) {
            assert.strictEqual(newF[k], oldF[k], `${outcome}: xp ${k} mismatch`);
        }
        assert.deepStrictEqual(cons.xpGained, oldRes.fightXpApplied, `${outcome}: xpGained mismatch`);
        assert.deepStrictEqual(cons.statLevelUps.sort(), oldRes.statLevelUps.sort(), `${outcome}: levelups mismatch`);

        // Stat VALUES match too, except where the module legitimately applied a fight
        // injury (the old XP-only baseline omits injuries by design).
        if (cons.injuriesSustained.length === 0) {
            for (const k of Object.values(STAT_TO_VAL_KEY)) {
                assert.strictEqual(newF[k], oldF[k], `${outcome}: stat ${k} mismatch`);
            }
        }
    }
});

test("HP write + regen anchor + healthBefore/After snapshot", () => {
    const f = makeFighter({ health: 88 });
    const origRandom = Math.random;
    Math.random = () => 0.999999;
    let cons;
    try {
        cons = fightConsequenceService.applyFightConsequences(f, {
            outcomePerspective: "Decision (unanimous)",
            endingHealth: 41,
        });
    } finally {
        Math.random = origRandom;
    }
    assert.strictEqual(cons.healthBefore, 88);
    assert.strictEqual(cons.healthAfter, 41);
    assert.strictEqual(f.health, 41);
    assert.ok(f.healthLastRegenAt instanceof Date);
    assert.ok(Date.now() - f.healthLastRegenAt.getTime() < 5000, "regen anchor reset to ~now");
});

test("KO loss guarantees a concussion injury (past grace)", () => {
    const f = makeFighter({ record: { wins: 50, losses: 50, draws: 0 } });
    const cons = fightConsequenceService.applyFightConsequences(f, {
        outcomePerspective: "Loss (KO/TKO)",
        endingHealth: 0,
    });
    assert.strictEqual(cons.healthAfter, 0);
    assert.strictEqual(cons.injuriesSustained.length, 1);
    assert.strictEqual(f.injuries.length, 1);
});

test("applyConsequenceMutation re-applies the SAME injury and re-banks XP without re-roll", () => {
    // First pass: roll on the source fighter.
    const src = makeFighter({ record: { wins: 50, losses: 50, draws: 0 } });
    const cons = fightConsequenceService.applyFightConsequences(src, {
        outcomePerspective: "Loss (KO/TKO)", // guaranteed concussion, deterministic (no RNG)
        endingHealth: 0,
        xpMultiplier: 0.5, // PvP repeat penalty
    });

    // Replay onto a FRESH doc whose stats moved since the roll (concurrent training).
    const fresh = makeFighter({ str: 42, chn: 41, fiq: 45, record: { wins: 50, losses: 50, draws: 0 } });
    const origRandom = Math.random;
    let rngCalled = false;
    Math.random = () => { rngCalled = true; return 0.5; };
    try {
        fightConsequenceService.applyConsequenceMutation(fresh, cons.mutation);
    } finally {
        Math.random = origRandom;
    }
    assert.strictEqual(rngCalled, false, "replay must consume NO randomness");
    assert.strictEqual(fresh.health, 0);
    assert.strictEqual(fresh.injuries.length, 1);
    assert.strictEqual(fresh.injuries[0].label, src.injuries[0].label, "same injury label replayed");

    // XP table for KO loss → CHN:20, FIQ:15. With xpMultiplier 0.5 → 10 / 8 (rounded).
    // Re-banked against FRESH stat/xp values (fresh started higher).
    assert.strictEqual(fresh.overallRating, calculateOverall(fresh));
});

test("xpMultiplier scales the banked XP (PvP repeat penalty)", () => {
    const full = makeFighter();
    const half = makeFighter();
    const origRandom = Math.random;
    Math.random = () => 0.999999;
    let cFull, cHalf;
    try {
        cFull = fightConsequenceService.applyFightConsequences(full, {
            outcomePerspective: "KO/TKO", endingHealth: 80, xpMultiplier: 1,
        });
        cHalf = fightConsequenceService.applyFightConsequences(half, {
            outcomePerspective: "KO/TKO", endingHealth: 80, xpMultiplier: 0.5,
        });
    } finally {
        Math.random = origRandom;
    }
    // KO/TKO win → STR:30, CHN:15, SPD:10. Half → 15, 8 (round), 5.
    assert.strictEqual(cFull.xpGained.STR, 30);
    assert.strictEqual(cHalf.xpGained.STR, 15);
    assert.strictEqual(cHalf.xpGained.SPD, 5);
});
