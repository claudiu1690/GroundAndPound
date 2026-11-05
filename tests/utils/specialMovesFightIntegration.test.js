const assert = require("node:assert");
const { test } = require("node:test");

const { resolveFight } = require("../../utils/fightResolution");
const specialMovesService = require("../../services/specialMovesService");
const { RARITY } = require("../../consts/specialMovesCatalog");

function withStubbedRandom(seq, fn) {
    const orig = Math.random;
    let i = 0;
    Math.random = () => seq[i++ % seq.length];
    try { return fn(); } finally { Math.random = orig; }
}

function fighter(overrides = {}) {
    return {
        health: 100, stamina: 100, maxStamina: 100,
        str: 40, spd: 40, leg: 30, wre: 25, gnd: 25, sub: 20, chn: 45, fiq: 30,
        ...overrides,
    };
}

function ownedFighter(moveIds, rarity) {
    return {
        promotionTier: "National",
        specialMovesOwned: moveIds.map((id) => ({ moveId: id, rarity, acquiredAt: new Date() })),
        specialMovesEquipped: [...moveIds],
    };
}

const SEQ = [0.5, 0.42, 0.6, 0.55, 0.48, 0.51, 0.5, 0.47, 0.53, 0.49, 0.5, 0.52, 0.5, 0.5];

test("PvP path (no moveBonuses option passed) matches moveBonuses equals empty array, no bleed into Proving Ground", () => {
    const a1 = withStubbedRandom(SEQ, () => resolveFight(fighter(), fighter(), { maxRounds: 3 }));
    const a2 = withStubbedRandom(SEQ, () => resolveFight(fighter(), fighter(), { maxRounds: 3, moveBonuses: [] }));
    assert.strictEqual(a1.outcome, a2.outcome);
    for (let i = 0; i < a1.rounds.length; i++) {
        assert.strictEqual(a1.rounds[i].playerDamage, a2.rounds[i].playerDamage);
        assert.strictEqual(a1.rounds[i].opponentDamage, a2.rounds[i].opponentDamage);
    }
});

test("no-moves fighter with moveBonuses empty array is numerically identical to omitting the key (additive branches are inert when empty)", () => {
    const withKey = withStubbedRandom(SEQ, () =>
        resolveFight(fighter(), fighter(), { maxRounds: 5, sessionBonuses: [], moveBonuses: [] })
    );
    const withoutKey = withStubbedRandom(SEQ, () =>
        resolveFight(fighter(), fighter(), { maxRounds: 5, sessionBonuses: [] })
    );
    assert.deepStrictEqual(
        withKey.rounds.map((r) => [r.playerDamage, r.opponentDamage, r.playerHealth, r.opponentHealth]),
        withoutKey.rounds.map((r) => [r.playerDamage, r.opponentDamage, r.playerHealth, r.opponentHealth])
    );
    assert.strictEqual(withKey.outcome, withoutKey.outcome);
});

test("Signature independence: THE_FINISHER (opponent below 75 percent, next striking exchange) and KILLER_INSTINCT (below 50 percent, from top) fire independently, keyed per moveId", () => {
    const equippedFighter = ownedFighter(["THE_FINISHER", "KILLER_INSTINCT"], RARITY.LEGENDARY);
    const moveBonuses = specialMovesService.buildMoveBonuses(equippedFighter);
    assert.equal(moveBonuses.length, 2, "both signatures present as separate entries");

    const strongPlayer = fighter({ str: 90, spd: 80, leg: 70, chn: 90 });
    const weakOpponent = fighter({ str: 10, spd: 10, leg: 10, chn: 5 });

    const seq = new Array(200).fill(0.5);
    const result = withStubbedRandom(seq, () =>
        resolveFight(strongPlayer, weakOpponent, { maxRounds: 5, moveBonuses })
    );

    const finisherEntry = result.moveBonuses.find((b) => b.moveId === "THE_FINISHER");
    const killerEntry = result.moveBonuses.find((b) => b.moveId === "KILLER_INSTINCT");
    assert.ok(finisherEntry, "THE_FINISHER entry must survive in the result");
    assert.ok(killerEntry, "KILLER_INSTINCT entry must survive in the result");
    // Health at the START of round i is the previous round's end health (100 before round 1).
    const startHealth = (i) => (i === 0 ? 100 : result.rounds[i - 1].opponentHealth);
    const finisherShouldFire = result.rounds.some((r, i) => r.event === "Striking exchange." && startHealth(i) < 75);
    const killerShouldApply = result.rounds.some((r, i) => r.event === "Holding top control; ground and pound." && startHealth(i) < 50);
    assert.equal(finisherEntry.triggerCount, finisherShouldFire ? 1 : 0, "THE_FINISHER fires once, on a striking exchange after the opponent is below 75 percent");
    assert.equal(killerEntry.triggered, killerShouldApply, "KILLER_INSTINCT only counts rounds where it actually held the opponent down");
});

test("moveBonuses freshness across back to back fights on the SAME fighter object, no cross fight state leak", () => {
    const equippedFighter = ownedFighter(["THE_FINISHER"], RARITY.LEGENDARY);

    const strongPlayer = () => fighter({ str: 90, spd: 80, leg: 70, chn: 90 });
    const weakOpponent = () => fighter({ str: 10, spd: 10, leg: 10, chn: 5 });
    const seq = new Array(200).fill(0.5);

    const moveBonuses1 = specialMovesService.buildMoveBonuses(equippedFighter);
    const result1 = withStubbedRandom(seq, () =>
        resolveFight(strongPlayer(), weakOpponent(), { maxRounds: 5, moveBonuses: moveBonuses1 })
    );
    const entry1 = result1.moveBonuses.find((b) => b.moveId === "THE_FINISHER");

    const moveBonuses2 = specialMovesService.buildMoveBonuses(equippedFighter);
    assert.notStrictEqual(moveBonuses1, moveBonuses2, "fresh array reference per call");
    assert.notStrictEqual(moveBonuses1[0], moveBonuses2[0], "fresh entry object per call");
    assert.equal(moveBonuses2[0].triggered, false, "a freshly built entry must start untriggered regardless of fight 1 outcome");

    const result2 = withStubbedRandom(seq, () =>
        resolveFight(strongPlayer(), weakOpponent(), { maxRounds: 5, moveBonuses: moveBonuses2 })
    );
    const entry2 = result2.moveBonuses.find((b) => b.moveId === "THE_FINISHER");

    if (result1.rounds.some((r) => r.opponentHealth < 25)) {
        assert.equal(entry1.triggered, true);
    }
    if (result2.rounds.some((r) => r.opponentHealth < 25)) {
        assert.equal(entry2.triggered, true, "fight 2 must be able to arm THE_FINISHER again, no cross fight state leak");
    }
    assert.deepStrictEqual(
        result1.rounds.map((r) => [r.playerHealth, r.opponentHealth]),
        result2.rounds.map((r) => [r.playerHealth, r.opponentHealth])
    );
});

test("Passive COLLAPSE rule end to end: GRANITE_JAW plus HIGH_GUARD equipped together reduce opponent damage by the SUM, not just one move value", () => {
    const soloFighter = ownedFighter(["GRANITE_JAW"], RARITY.LEGENDARY);
    const stackedFighter = ownedFighter(["GRANITE_JAW", "HIGH_GUARD"], RARITY.LEGENDARY);

    const soloBonuses = specialMovesService.buildMoveBonuses(soloFighter);
    const stackedBonuses = specialMovesService.buildMoveBonuses(stackedFighter);

    assert.equal(soloBonuses.length, 1);
    assert.equal(stackedBonuses.length, 1, "still collapses to ONE OPPONENT_DAMAGE_REDUCTION entry");
    assert.ok(stackedBonuses[0].effectiveValue > soloBonuses[0].effectiveValue, "stacked value must exceed solo value");

    const attacker = fighter({ str: 60, spd: 50, leg: 40 });
    const seq = new Array(60).fill(0.5);

    const soloResult = withStubbedRandom(seq, () =>
        resolveFight(fighter(), attacker, { maxRounds: 3, moveBonuses: soloBonuses })
    );
    const stackedResult = withStubbedRandom(seq, () =>
        resolveFight(fighter(), attacker, { maxRounds: 3, moveBonuses: stackedBonuses })
    );
    const soloTotalDamageTaken = soloResult.rounds.reduce((s, r) => s + r.playerDamage, 0);
    const stackedTotalDamageTaken = stackedResult.rounds.reduce((s, r) => s + r.playerDamage, 0);
    assert.ok(stackedTotalDamageTaken <= soloTotalDamageTaken, "stacked defensive value must reduce or match damage taken vs solo");
});

// ── Fight replay highlights (contract A.5): rounds[].moveFired accounts for every fire ─────
// For every PROC/SIGNATURE entry, the per-round recorder's counts sum to the engine's own
// triggerCount, and each record carries the entry's moveIds. PASSIVE / persona entries never
// produce a record. Seeded so it is deterministic.
const { SPECIAL_MOVES } = require("../../consts/specialMovesCatalog");

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function withSeed(seed, fn) {
    const orig = Math.random;
    Math.random = mulberry32(seed);
    try { return fn(); } finally { Math.random = orig; }
}

test("moveFired: per-round counts sum to each PROC/SIGNATURE entry's triggerCount, with the entry's moveIds", () => {
    const allIds = SPECIAL_MOVES.map((m) => m.id);
    const nonPassive = SPECIAL_MOVES.filter((m) => m.effectType !== "PASSIVE").map((m) => m.id);
    const loadouts = [allIds]; // everything equipped: exercises merged entries (Full Mount + Top Control)
    for (let i = 0; i < nonPassive.length; i += 3) loadouts.push(nonPassive.slice(i, i + 3));
    const matchups = [
        [fighter({ str: 60, spd: 55, leg: 50, chn: 50 }), fighter({ wre: 65, gnd: 60, sub: 60 }), "Counter Striker", "Takedown Heavy"],
        [fighter({ wre: 80, gnd: 75, sub: 80 }), fighter({ str: 60, spd: 55, chn: 30 }), "Ground & Pound", "Pressure Fighter"],
        [fighter(), fighter(), null, "Submission Hunter"],
        [fighter({ str: 90, spd: 80, leg: 70, chn: 80 }), fighter({ str: 15, spd: 15, chn: 10 }), "Pressure Fighter", null],
    ];
    const firedIds = new Set();
    let records = 0;
    for (const [li, ids] of loadouts.entries()) {
        for (const [mi, [p, o, ps, os]] of matchups.entries()) {
            for (const seed of [3, 17, 29, 101]) {
                const moveBonuses = specialMovesService.buildMoveBonuses(ownedFighter(ids, RARITY.LEGENDARY));
                const result = withSeed(seed * 31 + li * 7 + mi, () =>
                    resolveFight({ ...p, stamina: 100 }, { ...o }, { maxRounds: 5, playerStrategy: ps, opponentStrategy: os, moveBonuses })
                );
                const where = `loadout ${li} matchup ${mi} seed ${seed}`;
                const all = result.rounds.flatMap((r) => r.moveFired || []);
                records += all.length;
                for (const rec of all) {
                    assert.ok(rec.effectType === "PROC" || rec.effectType === "SIGNATURE", `${where}: passive recorded`);
                    assert.ok(rec.count > 0, `${where}: empty record`);
                    assert.ok(typeof rec.site === "string" && rec.site.length > 0, `${where}: record without site`);
                }
                for (const entry of result.moveBonuses) {
                    const recs = all.filter((r) => r.moveId === entry.moveId);
                    if (entry.effectType !== "PROC" && entry.effectType !== "SIGNATURE") {
                        assert.equal(recs.length, 0, `${where}: ${entry.moveId} (${entry.effectType}) must never record`);
                        continue;
                    }
                    const sum = recs.reduce((s, r) => s + r.count, 0);
                    assert.equal(sum, entry.triggerCount || 0, `${where}: ${entry.moveId} recorded ${sum} vs triggerCount ${entry.triggerCount}`);
                    const expectedIds = entry.moveIds ?? [entry.moveId];
                    for (const r of recs) assert.deepStrictEqual(r.moveIds, expectedIds, `${where}: ${entry.moveId} moveIds`);
                    if (sum > 0) for (const id of expectedIds) firedIds.add(id);
                }
            }
        }
    }
    assert.ok(records > 0, "fixture sanity: some move fired");
    assert.ok(firedIds.size >= 8, `fixture sanity: a broad set of PROC/SIGNATURE moves fired (got ${[...firedIds].join(",")})`);
});
