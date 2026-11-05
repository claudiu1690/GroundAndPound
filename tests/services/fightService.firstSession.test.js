/**
 * First session (docs/first-session-contract.md B.5, C.2, D.1) in fightService.resolveFightAndApply
 * and acceptOffer:
 *   - the $500 signing bonus is paid exactly once, on the FIRST PvE fight, and completes the tutorial
 *   - a second resolve of the same fight (409) pays nothing; fight 2 pays nothing
 *   - a fighter already stamped (End tutorial, legacy migration) gets no second bonus, but the
 *     tutorial is still completed by the debut resolve
 *   - summary carries fightNumber, isDebut, signingBonus, ovrBefore/After, rankEarned, nextGoal
 *   - a debut LOSS never sets the debut opponent as nemesis
 *   - fight_resolved / fight_accepted analytics carry fightNumber + offerType
 *
 * Same no-Mongo harness as fightService.resolveClaim.test.js: real models for defaults, statics
 * and stateful services stubbed, the engine swapped per test.
 */
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const fightResolution = require("../../utils/fightResolution");
const realResolve = fightResolution.resolveFight;
const engineResult = (outcome, playerHealthAfter = 80) => ({
    outcome,
    rounds: [{ round: 1, event: "x", playerHealth: playerHealthAfter, opponentHealth: 0 }],
    commentary: [],
    playerHealthAfter,
    playerStaminaAfter: 50,
    sessionBonuses: [],
    moveBonuses: [],
    wildcard: null,
    log: [],
});
let engine = () => engineResult("KO/TKO");
fightResolution.resolveFight = (...args) => engine(...args);

const mongoose = require("mongoose");
const Fighter = require("../../models/fighterModel");
const Fight = require("../../models/fightModel");
const FightCamp = require("../../models/fightCampModel");
const FameEvent = require("../../models/fameEventModel");
const fightService = require("../../services/fightService");
const questService = require("../../services/questService");
const activityLogService = require("../../services/activityLogService");
const analyticsService = require("../../services/analyticsService");

const FIGHTER_ID = new mongoose.Types.ObjectId("507f1f77bcf86cd799439055");
const FIGHT_ID = "507f1f77bcf86cd799439012";
const OPP_ID = "507f1f77bcf86cd799439023";

const restores = [];
function stub(obj, key, val) {
    const orig = obj[key];
    obj[key] = val;
    restores.push(() => { obj[key] = orig; });
}

let fightState;
let fighterQueue;
let offerType;
let tracks;

beforeEach(() => {
    fightState = { _id: FIGHT_ID, fighterId: FIGHTER_ID, status: "accepted", resolvingAt: null };
    fighterQueue = [];
    offerType = "Debut";
    tracks = [];
    engine = () => engineResult("KO/TKO");
});

function sameId(a, b) { return String(a) === String(b); }

function fightUpdateOne(filter, update) {
    if (!sameId(filter._id, fightState._id)) return { matchedCount: 0, modifiedCount: 0 };
    let match;
    if (filter.$or) {
        match = filter.$or.some((c) => c.status === fightState.status && !c.resolvingAt);
    } else {
        match = filter.status === fightState.status;
    }
    if (!match) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(fightState, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
}

function makeOpponent() {
    return {
        _id: OPP_ID, name: "Tommy Reyes-Bell", style: "Boxer", overallRating: 9,
        fixedRank: null, isDebut: true, fightHistory: [],
        save: async () => {},
        toObject() { const { save, toObject, ...rest } = this; return rest; },
    };
}

function makeFightDoc() {
    return {
        _id: FIGHT_ID, fighterId: FIGHTER_ID, status: fightState.status, offerType,
        promotionTier: "Amateur", opponentId: makeOpponent(), purse: 500, weightCut: "easy",
        async save() { fightState.status = this.status; },
    };
}

before(() => {
    stub(Fighter, "findById", () => ({
        then(res, rej) { return Promise.resolve(fighterQueue.shift() || null).then(res, rej); },
        select() { return { lean: async () => null }; },
    }));
    stub(Fighter, "updateOne", async () => ({ matchedCount: 1, modifiedCount: 1 }));
    stub(Fight, "findById", () => ({
        populate: async () => makeFightDoc(),
        select() { return this; },
        lean: async () => ({ _id: FIGHT_ID, status: fightState.status }),
    }));
    stub(Fight, "updateOne", async (filter, update) => fightUpdateOne(filter, update));
    stub(FightCamp, "findOne", async () => null);
    stub(FameEvent, "create", async (row) => row);
    stub(questService, "onFight", async () => []);
    stub(activityLogService, "log", () => {});
    stub(analyticsService, "track", (...a) => { tracks.push(a); });
    stub(require("../../services/gymRankService"), "onFightWin", async () => []);
    stub(require("../../services/homeCampCoachService"), "onFightResolved", async () => ({ credited: 0, conditionGained: 0 }));
    const mediaHub = require("../../services/mediaHubService");
    stub(mediaHub, "resolveDocumentaryOnFight", async () => {});
    stub(mediaHub, "armUndercardOnFight", async () => {});
    stub(require("../../services/sponsorshipService"), "resolveAfterFight", async () => ({ events: [], ironDelta: 0 }));
});

after(() => {
    fightResolution.resolveFight = realResolve;
    while (restores.length) restores.pop()();
});

/** A brand-new fighter (schema defaults: tutorial v2 at debut_home, no bonus yet). */
function newFighter(over = {}) {
    const f = new Fighter({
        _id: FIGHTER_ID,
        firstName: "New", lastName: "Fighter", weightClass: "Featherweight", style: "Boxer",
        promotionTier: "Amateur", overallRating: 14,
        str: 20, spd: 18, leg: 8, wre: 8, gnd: 8, sub: 8, chn: 18, fiq: 12,
        iron: 0,
        ...over,
    });
    f.notoriety = { score: 0, peakTier: "UNKNOWN" };
    f.acceptedFightId = FIGHT_ID;
    f.save = async () => f;
    return f;
}

function resolve() {
    return fightService.resolveFightAndApply(String(FIGHTER_ID), "user1");
}

async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

test("schema defaults: a new fighter starts the v2 debut flow with no bonus paid and tips/reveal on", () => {
    const f = new Fighter({ firstName: "A", lastName: "B", weightClass: "Lightweight", style: "Boxer", promotionTier: "Amateur" });
    assert.equal(f.tutorial.completed, false);
    assert.equal(f.tutorial.current_step, "debut_home");
    assert.equal(f.tutorial.version, 2);
    assert.equal(f.tutorial.signingBonusPaidAt, null);
    assert.deepEqual([...f.tutorial.tipsSeen], []);
    assert.equal(f.settings.playFightsOut, true);
    assert.equal(f.settings.sectionTips, true);
});

test("debut win: +$500 signing bonus once, tutorial completed, summary first-session fields", async () => {
    const f = newFighter();
    fighterQueue.push(f);
    const out = await quiet(resolve);
    const s = out.summary;

    assert.equal(s.signingBonus, 500);
    assert.equal(s.fightNumber, 1);
    assert.equal(s.isDebut, true);
    assert.equal(s.ironEarned, 500, "purse stays its own line");
    assert.equal(f.iron, 1000, "purse + bonus");
    assert.ok(f.tutorial.signingBonusPaidAt instanceof Date);
    assert.equal(f.tutorial.completed, true);
    assert.equal(f.tutorial.current_step, "complete");
    assert.ok(f.tutorial.completed_at instanceof Date);
    assert.equal(typeof s.ovrBefore, "number");
    assert.equal(typeof s.ovrAfter, "number");
    assert.equal(s.ovrBefore, 14);
    assert.equal(s.rankEarned, null, "fight 1 of 3 places nobody");
    assert.deepEqual(s.nextGoal, {
        key: "rank", current: 1, target: 3, rank: null, tier: null, threshold: null, titleTier: null,
        secondary: { key: "pvp_unlock", current: 1, target: 3 },
    });

    const resolved = tracks.find((t) => t[1] === "fight_resolved");
    assert.equal(resolved[2].fightNumber, 1);
    assert.equal(resolved[2].offerType, "Debut");
});

test("second resolve of the same debut fight is a 409 and pays nothing more", async () => {
    const a = newFighter();
    const b = newFighter();
    fighterQueue.push(a, b);
    const first = await quiet(resolve);
    assert.equal(first.summary.signingBonus, 500);
    await assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED");
    assert.equal(b.iron, 0);
    assert.equal(b.tutorial.signingBonusPaidAt, null);
});

test("fight 2: no bonus, fightNumber 2, isDebut false", async () => {
    offerType = "Easy";
    const f = newFighter({
        record: { wins: 1, losses: 0, draws: 0 },
        tutorial: { completed: true, current_step: "complete", signingBonusPaidAt: new Date("2026-11-01T00:00:00Z") },
        iron: 1000,
    });
    fighterQueue.push(f);
    const { summary } = await quiet(resolve);
    assert.equal(summary.signingBonus, 0);
    assert.equal(summary.fightNumber, 2);
    assert.equal(summary.isDebut, false);
    assert.equal(f.iron, 1500);
});

test("End tutorial then fight: the debut still pays the bonus once", async () => {
    const f = newFighter({ tutorial: { completed: true, current_step: "complete", completed_at: new Date() } });
    fighterQueue.push(f);
    const { summary } = await quiet(resolve);
    assert.equal(summary.signingBonus, 500);
    assert.equal(f.iron, 1000);
});

test("legacy zero-fight player already paid (stamped by the migration): no bonus, tutorial still completes", async () => {
    const f = newFighter({
        tutorial: { completed: false, current_step: "debut_camp", signingBonusPaidAt: new Date("2026-06-01T00:00:00Z") },
        iron: 800,
    });
    fighterQueue.push(f);
    const { summary } = await quiet(resolve);
    assert.equal(summary.signingBonus, 0);
    assert.equal(f.iron, 1300);
    assert.equal(f.tutorial.completed, true);
    assert.equal(f.tutorial.current_step, "complete");
});

test("debut LOSS: bonus still paid, comeback on, and the debut opponent never becomes the nemesis", async () => {
    engine = () => engineResult("Loss (decision)", 40);
    const f = newFighter();
    fighterQueue.push(f);
    const { summary } = await quiet(resolve);
    assert.equal(summary.recordChange, "L");
    assert.equal(summary.signingBonus, 500);
    assert.equal(summary.nemesisSet, false);
    assert.equal(f.nemesis.opponentId, null);
    assert.equal(f.comebackMode, true);
});

test("a non-debut loss still sets the nemesis (unchanged behaviour)", async () => {
    offerType = "Even";
    engine = () => engineResult("Loss (decision)", 40);
    const f = newFighter({
        record: { wins: 2, losses: 0, draws: 0 },
        tutorial: { completed: true, current_step: "complete", signingBonusPaidAt: new Date() },
    });
    fighterQueue.push(f);
    const { summary } = await quiet(resolve);
    assert.equal(summary.nemesisSet, true);
    assert.ok(sameId(f.nemesis.opponentId, OPP_ID));
});

test("rankEarned: the display rank on the fight that places the fighter (3rd in tier)", async () => {
    offerType = "Even";
    const f = newFighter({
        record: { wins: 2, losses: 0, draws: 0 },
        ranking: { rank: null, fightsInTier: 2, entryRecordAtFight3: null },
        tutorial: { completed: true, current_step: "complete", signingBonusPaidAt: new Date() },
    });
    fighterQueue.push(f);
    const { summary } = await quiet(resolve);
    assert.ok(f.ranking.rank != null, "placed");
    assert.equal(summary.rankEarned, f.ranking.rank - 1);
});
