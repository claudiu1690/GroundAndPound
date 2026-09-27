/**
 * Special Moves v2: engine branches in utils/fightResolution.js, driven by scripted Math.random.
 *
 * The commentary picker (utils/fightCommentary.js) also draws from Math.random. It is stubbed
 * out below, BEFORE the engine is required, so each scripted queue maps 1:1 onto the engine's
 * own draws. Draw order per round (ground position 0):
 *   staminaDrain, playerTdAttempt[, playerShoots], oppTdAttempt[, oppShoots][, coin],
 *   [playerTakedownSuccess][, subAttempt[, subSuccess]] | [oppTakedown[, oppSubAttempt[, ...]]],
 *   striking: oppStrikeVariance, playerStrikeVariance[, body][, clinch][, flashKO...], finish checks.
 * Ground continuation replaces the takedown and striking phases with:
 *   escape[, topSubAttempt[, topSubSuccess]][, guardAttempt[, guardSuccess]].
 * Every queue falls back to 0.99 once exhausted (no attempts, no escapes, no finishes).
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");

// ── Stub the commentary module (must run before fightResolution is required) ──────────────
const commentaryPath = require.resolve("../../utils/fightCommentary");
const stub = new Module(commentaryPath);
stub.filename = commentaryPath;
stub.loaded = true;
stub.exports = { getCommentaryLine: () => null, getResultLine: () => null };
require.cache[commentaryPath] = stub;

const { resolveFight, strikeDamage } = require("../../utils/fightResolution");
const specialMovesService = require("../../services/specialMovesService");
const { SPECIAL_MOVES_BY_ID } = require("../../consts/specialMovesCatalog");

const FALLBACK = 0.99;

function withRandom(seq, fn, fallback = FALLBACK) {
    const orig = Math.random;
    let i = 0;
    Math.random = () => (i < seq.length ? seq[i++] : fallback);
    try { return fn(); } finally { Math.random = orig; }
}

function fighter(overrides = {}) {
    return {
        health: 100, stamina: 100, maxStamina: 100,
        str: 40, spd: 40, leg: 30, wre: 25, gnd: 25, sub: 20, chn: 45, fiq: 30,
        ...overrides,
    };
}

function fight(seq, { p = {}, o = {}, maxRounds = 1, moveBonuses = [], fallback } = {}) {
    return withRandom(seq, () => resolveFight(fighter(p), fighter(o), { maxRounds, moveBonuses, sessionBonuses: [], wildcard: null }), fallback);
}

function built(ids, rarity = "LEGENDARY") {
    return specialMovesService.buildMoveBonuses({
        specialMovesOwned: ids.map((id) => ({ moveId: id, rarity, acquiredAt: new Date(0) })),
        specialMovesEquipped: [...ids],
    });
}

function entry(bonusType, effectiveValue, triggerCondition = "ALWAYS", effectType = "PASSIVE") {
    return { moveId: `TEST_${bonusType}_${triggerCondition}`, bonusType, effectiveValue, triggerCondition, effectType, triggered: false, triggerCount: 0 };
}

const find = (result, bonusType) => result.moveBonuses.find((b) => b.bonusType === bonusType);
const L = (id) => SPECIAL_MOVES_BY_ID[id].values.LEGENDARY;

// Reusable round-1 openings (mirror fighters, drain roll 0.5 -> 11 stamina).
const PLAYER_TD = [0.5, 0.0, 0.0, 0.99];              // player shoots, opponent doesn't; next draw = takedown roll
const OPP_TD = [0.5, 0.99, 0.0, 0.0];                  // opponent shoots, player doesn't; next draw = opp takedown roll
const STRIKE_ONLY = [0.5, 0.99, 0.99, 0.5, 0.5];       // nobody shoots; both strike variances = 1.0

// ── TAKEDOWN_SUCCESS (Double-Leg Precision) ───────────────────────────────────────────────

test("TAKEDOWN_SUCCESS: a 0.55 roll misses on the 0.50 mirror base and lands with Legendary (+0.08)", () => {
    const seq = [...PLAYER_TD, 0.55];
    const without = fight(seq);
    const withMove = fight(seq, { moveBonuses: built(["DOUBLE_LEG_PRECISION"]) });
    assert.equal(without.rounds[0].event, "Striking exchange.");
    assert.equal(withMove.rounds[0].event, "Takedown; ground and pound.");
    assert.equal(find(withMove, "TAKEDOWN_SUCCESS").triggerCount, 1);
});

test("TAKEDOWN_SUCCESS: marks only when the player shoots (opponent shot or nobody shot -> 0)", () => {
    const oppShot = fight([...OPP_TD, 0.99], { moveBonuses: built(["DOUBLE_LEG_PRECISION"]) });
    assert.equal(find(oppShot, "TAKEDOWN_SUCCESS").triggerCount, 0);
    const noShot = fight(STRIKE_ONLY, { moveBonuses: built(["DOUBLE_LEG_PRECISION"]) });
    assert.equal(find(noShot, "TAKEDOWN_SUCCESS").triggerCount, 0);
    assert.equal(find(noShot, "TAKEDOWN_SUCCESS").triggered, false);
});

// ── GROUND_DAMAGE_REDUCTION (Frame & Base) ────────────────────────────────────────────────

const HEAVY_TOP = { gnd: 80, str: 60 };

test("GROUND_DAMAGE_REDUCTION: applies to the opponent's takedown GnP", () => {
    const seq = [...OPP_TD, 0.0, 0.99];
    const without = fight(seq, { o: HEAVY_TOP });
    const withMove = fight(seq, { o: HEAVY_TOP, moveBonuses: built(["FRAME_AND_BASE"]) });
    assert.equal(without.rounds[0].event, "Opponent took you down.");
    assert.equal(withMove.rounds[0].playerDamage, Math.round(without.rounds[0].playerDamage * (1 - L("FRAME_AND_BASE"))));
    assert.ok(withMove.rounds[0].playerDamage < without.rounds[0].playerDamage);
    assert.equal(find(withMove, "GROUND_DAMAGE_REDUCTION").triggerCount, 1);
});

test("GROUND_DAMAGE_REDUCTION: applies on the continuation bottom (round 2 stuck under)", () => {
    const seq = [...OPP_TD, 0.0, 0.99, /* r2 */ 0.5, 0.99, 0.99, 0.99];
    const without = fight(seq, { o: HEAVY_TOP, maxRounds: 2 });
    const withMove = fight(seq, { o: HEAVY_TOP, maxRounds: 2, moveBonuses: built(["FRAME_AND_BASE"]) });
    assert.equal(without.rounds[1].event, "Stuck on bottom; opponent grinds.");
    assert.equal(withMove.rounds[1].event, "Stuck on bottom; opponent grinds.");
    assert.equal(withMove.rounds[1].playerDamage, Math.round(without.rounds[1].playerDamage * (1 - L("FRAME_AND_BASE"))));
    assert.equal(find(withMove, "GROUND_DAMAGE_REDUCTION").triggerCount, 2);
});

test("GROUND_DAMAGE_REDUCTION: does NOT touch striking damage", () => {
    const o = { str: 90, leg: 90, spd: 90 };
    const without = fight(STRIKE_ONLY, { o });
    const withMove = fight(STRIKE_ONLY, { o, moveBonuses: built(["FRAME_AND_BASE"]) });
    assert.equal(withMove.rounds[0].event, "Striking exchange.");
    assert.equal(withMove.rounds[0].playerDamage, without.rounds[0].playerDamage);
    assert.equal(find(withMove, "GROUND_DAMAGE_REDUCTION").triggerCount, 0);
});

// ── SUBMISSION_SUCCESS (Guillotine Choke) at all three player-attempt sites ──────────────
// Mirror submission chance = 0.18 + grapplingProfileMod(-0.0296) = 0.1504; +0.11 = 0.2604.
// Guard chance = 0.1504 * 0.6 = 0.0902; +0.11 flat = 0.2002.

test("SUBMISSION_SUCCESS site 1: after the player's takedown (0.2 roll fails bare, finishes with the move)", () => {
    const seq = [...PLAYER_TD, 0.0, 0.0, 0.2];
    const without = fight(seq);
    const withMove = fight(seq, { moveBonuses: built(["GUILLOTINE_CHOKE"]) });
    assert.notEqual(without.outcome, "Submission");
    assert.equal(withMove.outcome, "Submission");
    assert.equal(find(withMove, "SUBMISSION_SUCCESS").triggerCount, 1);
});

test("SUBMISSION_SUCCESS site 2: continuation top submission when the PLAYER is on top", () => {
    const seq = [...PLAYER_TD, 0.0, 0.99, /* r2 */ 0.5, 0.99, 0.0, 0.2];
    const without = fight(seq, { maxRounds: 2 });
    const withMove = fight(seq, { maxRounds: 2, moveBonuses: built(["GUILLOTINE_CHOKE"]) });
    assert.equal(without.rounds[1].event, "Holding top control; ground and pound.");
    assert.notEqual(without.outcome, "Submission");
    assert.equal(withMove.outcome, "Submission");
    assert.equal(withMove.rounds.length, 2);
    assert.equal(find(withMove, "SUBMISSION_SUCCESS").triggerCount, 1, "round 1 had no attempt, round 2 did");
});

test("SUBMISSION_SUCCESS site 3: guard submission when the PLAYER is on the bottom (flat add after the guard mult)", () => {
    const seq = [...OPP_TD, 0.0, 0.99, /* r2 */ 0.5, 0.99, 0.99, 0.0, 0.15];
    const without = fight(seq, { maxRounds: 2 });
    const withMove = fight(seq, { maxRounds: 2, moveBonuses: built(["GUILLOTINE_CHOKE"]) });
    assert.equal(without.rounds[1].event, "Stuck on bottom; opponent grinds.");
    assert.notEqual(without.outcome, "Submission");
    assert.equal(withMove.outcome, "Submission");
    assert.equal(find(withMove, "SUBMISSION_SUCCESS").triggerCount, 1);
});

test("SUBMISSION_SUCCESS: never helps the OPPONENT's continuation top submission", () => {
    // Opponent on top in r2 attempts (0.0) and rolls 0.2: fails on the bare 0.1504 chance either way.
    const seq = [...OPP_TD, 0.0, 0.99, /* r2 */ 0.5, 0.99, 0.0, 0.2, 0.99];
    const withMove = fight(seq, { maxRounds: 2, moveBonuses: built(["GUILLOTINE_CHOKE"]) });
    assert.notEqual(withMove.outcome, "Loss (submission)");
    assert.equal(find(withMove, "SUBMISSION_SUCCESS").triggerCount, 0);
});

test("SUBMISSION_SUCCESS is clamped at chanceMax: a 0.69 roll fails even with value 1.0; 0.67 lands", () => {
    const huge = () => [entry("SUBMISSION_SUCCESS", 1.0, "PLAYER_ATTEMPTS_SUBMISSION", "PROC")];
    const miss = fight([...PLAYER_TD, 0.0, 0.0, 0.69], { moveBonuses: huge() });
    assert.notEqual(miss.outcome, "Submission");
    const hit = fight([...PLAYER_TD, 0.0, 0.0, 0.67], { moveBonuses: huge() });
    assert.equal(hit.outcome, "Submission");
});

// ── OPPONENT_STAMINA_DRAIN (Pace Pusher) ──────────────────────────────────────────────────
// Opponent stamina is not in the round summary, so it is read back through the player's damage
// taken: playerDamage = round(rawOppStrike * oStamina / 100). Drain roll 0.5 -> d = 11.

test("OPPONENT_STAMINA_DRAIN: opponent stamina after round 1 = 100 - round(d * (1 + v))", () => {
    // Legendary 0.08 moves round-1 opponent stamina by only 1 (89 -> 88), so the raw hit must be
    // big enough (83 here) for that 1% to survive rounding in the player's damage taken.
    const p = { chn: 10 };
    const o = { str: 140, leg: 140, spd: 130 };
    const raw = withRandom([0.5], () => strikeDamage(fighter(o), fighter(p)));
    const d = 11;
    const dmgFor = (v) => Math.round(raw * ((100 - Math.round(d * (1 + v))) / 100));
    assert.notEqual(dmgFor(L("PACE_PUSHER")), dmgFor(0), "fixture sanity: the Legendary value is observable");

    const without = fight(STRIKE_ONLY, { p, o });
    assert.equal(without.rounds[0].playerDamage, dmgFor(0), "model sanity: bare opponent ends round 1 on 89");

    const legendary = fight(STRIKE_ONLY, { p, o, moveBonuses: built(["PACE_PUSHER"]) });
    assert.equal(legendary.rounds[0].playerDamage, dmgFor(L("PACE_PUSHER")));
    assert.ok(legendary.rounds[0].playerDamage < without.rounds[0].playerDamage);
    assert.equal(find(legendary, "OPPONENT_STAMINA_DRAIN").triggerCount, 1);

    const doubled = fight(STRIKE_ONLY, { p, o, moveBonuses: [entry("OPPONENT_STAMINA_DRAIN", 1.0)] });
    assert.equal(doubled.rounds[0].playerDamage, dmgFor(1.0));
});

// ── FLASH_KO_RESISTANCE (Fighting Spirit) ─────────────────────────────────────────────────
// Opponent flash chance here = 0.004 + 0.07 (profile) + (11 - 10)/180 = 0.0796; with -0.018 = 0.0616.

const FLASH_P = { chn: 70 };
const FLASH_O = { str: 60, leg: 60, spd: 50 };
const FLASH_SEQ = [...STRIKE_ONLY, 0.07];

test("FLASH_KO_RESISTANCE: active at round-start health < 25 (a 0.07 roll KOs bare, not with the move)", () => {
    const without = fight(FLASH_SEQ, { p: { ...FLASH_P, health: 20 }, o: FLASH_O });
    const withMove = fight(FLASH_SEQ, { p: { ...FLASH_P, health: 20 }, o: FLASH_O, moveBonuses: built(["FIGHTING_SPIRIT"]) });
    assert.equal(without.rounds[0].playerDamage, 11, "fixture sanity");
    assert.equal(without.outcome, "Loss (KO/TKO)");
    assert.notEqual(withMove.outcome, "Loss (KO/TKO)");
    assert.equal(find(withMove, "FLASH_KO_RESISTANCE").triggerCount, 1);
});

test("FLASH_KO_RESISTANCE: inactive at round-start health >= 25, even if the round ends below 25", () => {
    const withMove = fight(FLASH_SEQ, { p: { ...FLASH_P, health: 30 }, o: FLASH_O, moveBonuses: built(["FIGHTING_SPIRIT"]) });
    assert.equal(withMove.outcome, "Loss (KO/TKO)");
    assert.equal(find(withMove, "FLASH_KO_RESISTANCE").triggerCount, 0);
});

test("FLASH_KO_RESISTANCE: floored at minProb (value 1.0 vs a 0.0 roll: no KO; bare: KO)", () => {
    const seq = [...STRIKE_ONLY, 0.0];
    const bare = fight(seq, { p: { ...FLASH_P, health: 20 }, o: FLASH_O });
    assert.equal(bare.outcome, "Loss (KO/TKO)");
    const huge = fight(seq, { p: { ...FLASH_P, health: 20 }, o: FLASH_O, moveBonuses: [entry("FLASH_KO_RESISTANCE", 1.0, "PLAYER_HEALTH_BELOW_25", "PROC")] });
    assert.notEqual(huge.outcome, "Loss (KO/TKO)");
});

// ── STRIKE_DAMAGE gates ───────────────────────────────────────────────────────────────────

const HITTER = { str: 100, leg: 100, spd: 100 };
const SOFT = { chn: 10 };

test("SECOND_GEAR gate: contributes 0 at opponent stamina >= 70 and its full value below 70", () => {
    const at70 = fight(STRIKE_ONLY, { p: HITTER, o: { ...SOFT, stamina: 70 }, moveBonuses: built(["SECOND_GEAR"]) });
    const bare70 = fight(STRIKE_ONLY, { p: HITTER, o: { ...SOFT, stamina: 70 } });
    assert.equal(at70.rounds[0].opponentDamage, bare70.rounds[0].opponentDamage);
    assert.equal(find(at70, "STRIKE_DAMAGE").triggerCount, 0);

    const raw = withRandom([0.5], () => strikeDamage(fighter(HITTER), fighter(SOFT)));
    const at69 = fight(STRIKE_ONLY, { p: HITTER, o: { ...SOFT, stamina: 69 }, moveBonuses: built(["SECOND_GEAR"]) });
    assert.equal(at69.rounds[0].opponentDamage, Math.round(raw * (1 + L("SECOND_GEAR")) * 0.89));
    assert.ok(at69.rounds[0].opponentDamage > bare70.rounds[0].opponentDamage);
    assert.equal(find(at69, "STRIKE_DAMAGE").triggerCount, 1);
});

test("SECOND_GEAR gate is read at ROUND START: 75 -> drained below 70 opens it in round 2 only", () => {
    const r = fight([], { o: { stamina: 75 }, maxRounds: 2, moveBonuses: built(["SECOND_GEAR"]) });
    assert.ok(!r.rounds[0].campCommentary.includes("campStrikingAccuracy"));
    assert.ok(r.rounds[1].campCommentary.includes("campStrikingAccuracy"));
});

for (const [total, lateRounds] of [[3, [3]], [4, [3, 4]], [5, [4, 5]]]) {
    test(`DEEP_WATERS gate: fires only in rounds ${lateRounds.join(",")} of ${total}`, () => {
        const r = fight([], { maxRounds: total, moveBonuses: built(["DEEP_WATERS"]) });
        assert.equal(r.rounds.length, total, "fixture sanity: all-striking decision");
        const fired = r.rounds.filter((x) => x.campCommentary.includes("campStrikingAccuracy")).map((x) => x.round);
        assert.deepEqual(fired, lateRounds);
        assert.equal(find(r, "STRIKE_DAMAGE").triggerCount, lateRounds.length);
    });
}

test("STRIKE_DAMAGE: an entry with an unknown trigger contributes 0 and is never marked", () => {
    const bad = fight(STRIKE_ONLY, { p: HITTER, o: SOFT, moveBonuses: [entry("STRIKE_DAMAGE", 0.5, "FULL_MOON", "PROC")] });
    const bare = fight(STRIKE_ONLY, { p: HITTER, o: SOFT });
    assert.equal(bad.rounds[0].opponentDamage, bare.rounds[0].opponentDamage);
    assert.equal(bad.moveBonuses[0].triggerCount, 0);
    assert.equal(bad.moveBonuses[0].triggered, false);
});

test("STRIKE_DAMAGE: a null-trigger (persona / legacy snapshot) entry is open, same as ALWAYS", () => {
    const legacy = fight(STRIKE_ONLY, { p: HITTER, o: SOFT, moveBonuses: [{ ...entry("STRIKE_DAMAGE", 0.035), triggerCondition: null }] });
    const always = fight(STRIKE_ONLY, { p: HITTER, o: SOFT, moveBonuses: built(["HEAVY_HANDS"]) });
    assert.equal(legacy.rounds[0].opponentDamage, always.rounds[0].opponentDamage);
    assert.equal(legacy.moveBonuses[0].triggerCount, 1);
});

test("STRIKE_DAMAGE trio sums when every gate is open (== one ALWAYS entry of the summed value)", () => {
    const opts = { p: HITTER, o: { ...SOFT, stamina: 60 }, maxRounds: 2 };
    const trio = fight([], { ...opts, moveBonuses: built(["HEAVY_HANDS", "SECOND_GEAR", "DEEP_WATERS"]) });
    const summed = L("HEAVY_HANDS") + L("SECOND_GEAR") + L("DEEP_WATERS");
    const single = fight([], { ...opts, moveBonuses: [entry("STRIKE_DAMAGE", summed)] });
    assert.equal(trio.rounds[1].opponentDamage, single.rounds[1].opponentDamage, "round 2: all three gates open");
    const byId = Object.fromEntries(trio.moveBonuses.map((b) => [b.moveId, b.triggerCount]));
    assert.deepEqual(byId, { HEAVY_HANDS: 2, SECOND_GEAR: 2, DEEP_WATERS: 1 });
});

// ── Signatures ────────────────────────────────────────────────────────────────────────────

test("SIG_FAST_START: fires once, on the round-1 exchange only", () => {
    const p = { str: 60, leg: 60, spd: 50 };
    const bare = fight([], { p, maxRounds: 3 });
    const sig = fight([], { p, maxRounds: 3, moveBonuses: built(["SUPERMAN_PUNCH"]) });
    assert.equal(sig.rounds.length, 3, "fixture sanity: goes the distance");
    assert.equal(find(sig, "SIG_FAST_START").triggerCount, 1);
    assert.ok(sig.rounds[0].opponentDamage > bare.rounds[0].opponentDamage);
    assert.equal(sig.rounds[1].opponentDamage, bare.rounds[1].opponentDamage);
    assert.equal(sig.rounds[2].opponentDamage, bare.rounds[2].opponentDamage);
});

test("SIG_FAST_START: never fires when round 1 was a takedown (and does not carry into round 2)", () => {
    const seq = [...PLAYER_TD, 0.0, 0.99, /* r2: escape, then nobody shoots */ 0.5, 0.0];
    const bare = fight(seq, { maxRounds: 2 });
    const sig = fight(seq, { maxRounds: 2, moveBonuses: built(["SUPERMAN_PUNCH"]) });
    assert.equal(sig.rounds[0].event, "Takedown; ground and pound.");
    assert.equal(sig.rounds[1].event, "Striking exchange.");
    assert.equal(find(sig, "SIG_FAST_START").triggerCount, 0);
    assert.equal(sig.rounds[1].opponentDamage, bare.rounds[1].opponentDamage);
});

// Two landed player takedowns: r1, then escape + a fresh takedown in r2.
const TWO_TAKEDOWNS = [...PLAYER_TD, 0.0, 0.99, /* r2 */ 0.5, 0.0, 0.0, 0.0, 0.99, 0.0, 0.99];

test("SIG_TAKEDOWN_BLITZ: boosts GnP on the first player takedown only", () => {
    const bare = fight(TWO_TAKEDOWNS, { maxRounds: 2 });
    const sig = fight(TWO_TAKEDOWNS, { maxRounds: 2, moveBonuses: built(["BLAST_DOUBLE"]) });
    assert.equal(bare.rounds[1].event, "Takedown; ground and pound.", "fixture sanity: second takedown landed");
    assert.equal(sig.rounds[0].opponentDamage, Math.round(bare.rounds[0].opponentDamage * (1 + L("BLAST_DOUBLE"))));
    assert.equal(sig.rounds[1].opponentDamage, bare.rounds[1].opponentDamage);
    assert.equal(find(sig, "SIG_TAKEDOWN_BLITZ").triggerCount, 1);
    assert.ok(!sig.rounds[0].campCommentary.includes("campGnpPosture"), "posture commentary is for camp/move GnP, not the signature");
});

test("SIG_SUBMISSION_HUNT: adds to the first takedown round's submission (0.2 roll: bare fails, armed finishes)", () => {
    const seq = [...PLAYER_TD, 0.0, 0.0, 0.2];
    const bare = fight(seq);
    const sig = fight(seq, { moveBonuses: built(["ARM_TRIANGLE"]) });
    assert.notEqual(bare.outcome, "Submission");
    assert.equal(sig.outcome, "Submission");
    assert.equal(find(sig, "SIG_SUBMISSION_HUNT").triggerCount, 1);
});

test("SIG_SUBMISSION_HUNT: spent on arming even with no attempt; the second takedown's submission gets nothing", () => {
    // r1 lands, no attempt; r2 escape, lands again, attempts (0.0) and rolls 0.2.
    const seq = [...PLAYER_TD, 0.0, 0.99, /* r2 */ 0.5, 0.0, 0.0, 0.0, 0.99, 0.0, 0.0, 0.2];
    const sig = fight(seq, { maxRounds: 2, moveBonuses: built(["ARM_TRIANGLE"]) });
    assert.equal(sig.rounds[1].event, "Takedown; ground and pound.");
    assert.notEqual(sig.outcome, "Submission");
    assert.equal(find(sig, "SIG_SUBMISSION_HUNT").triggerCount, 1);
});

test("signatures re-arm per fight: back-to-back fights with a fresh buildMoveBonuses leak nothing", () => {
    const ids = ["SUPERMAN_PUNCH", "BLAST_DOUBLE", "ARM_TRIANGLE"];
    const run = () => fight(TWO_TAKEDOWNS, { p: HITTER, o: SOFT, maxRounds: 3, moveBonuses: built(ids) });
    const first = run();
    const second = run();
    assert.deepEqual(second.rounds, first.rounds);
    assert.equal(second.outcome, first.outcome);
    for (const bt of ["SIG_TAKEDOWN_BLITZ", "SIG_SUBMISSION_HUNT"]) {
        assert.equal(find(first, bt).triggerCount, 1, `${bt} fired in fight 1`);
        assert.equal(find(second, bt).triggerCount, 1, `${bt} re-armed in fight 2`);
    }
});

// ── Inertness ─────────────────────────────────────────────────────────────────────────────

test("moveBonuses = [] is inert against every scripted path above (same as omitting the key)", () => {
    for (const seq of [STRIKE_ONLY, [...PLAYER_TD, 0.0, 0.0, 0.2], [...OPP_TD, 0.0, 0.99, 0.5, 0.99, 0.99, 0.0, 0.15], TWO_TAKEDOWNS]) {
        const a = withRandom(seq, () => resolveFight(fighter(), fighter(), { maxRounds: 3, moveBonuses: [] }));
        const b = withRandom(seq, () => resolveFight(fighter(), fighter(), { maxRounds: 3 }));
        assert.deepEqual(a.rounds, b.rounds);
        assert.equal(a.outcome, b.outcome);
    }
});
