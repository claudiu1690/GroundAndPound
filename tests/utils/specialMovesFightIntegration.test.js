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

test("Signature independence: THE_FINISHER and KILLER_INSTINCT both trigger on opponent health below 25 percent, fire independently, keyed per moveId", () => {
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
    if (result.rounds.some((r) => r.opponentHealth < 25)) {
        assert.equal(finisherEntry.triggered, true, "THE_FINISHER should have armed once opponent health crossed 25 percent");
        assert.equal(killerEntry.triggered, true, "KILLER_INSTINCT should have armed independently of THE_FINISHER");
    }
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

test("Passive COLLAPSE rule end to end: GRANITE_JAW plus VETERAN_IQ equipped together reduce opponent damage by the SUM, not just one move value", () => {
    const soloFighter = ownedFighter(["GRANITE_JAW"], RARITY.LEGENDARY);
    const stackedFighter = ownedFighter(["GRANITE_JAW", "VETERAN_IQ"], RARITY.LEGENDARY);

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
