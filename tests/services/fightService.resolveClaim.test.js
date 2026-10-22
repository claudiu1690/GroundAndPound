/**
 * Resolve claim for fightService.resolveFightAndApply: one resolve per accepted fight.
 *
 *   - two concurrent resolves of the same fight: exactly one applies rewards, the other
 *     rejects with FIGHT_ALREADY_RESOLVED (409) before touching its fighter
 *   - a throw before the commit (blocking injury) releases the claim back to "accepted"
 *   - a throw after the commit (opponent.save) does NOT release
 *   - a stale "resolving" claim (older than 60 s) is reclaimed, a fresh one is rejected
 *   - a lost claim on a "completed" fight clears the dangling acceptedFightId conditionally
 *     and logs the never-applied rewards server-side
 *   - a lost claim on a missing Fight document clears the pointer and answers "Fight not found"
 *   - the claim filter shape is asserted literally; the release filter carries our exact
 *     resolvingAt stamp, so a reclaimed (different stamp) claim is never freed
 *   - the FightCamp snapshot is written only after the commit (exactly once, after fight.save),
 *     so a pre-commit throw plus retry never double-applies persona merges; a camp save
 *     failure after the commit does not fail the resolve
 *
 * Same no-Mongo harness as fightService.resolveGcsTitle.test.js: real models for defaults,
 * statics and stateful services stubbed. Fight.updateOne runs against an in-memory fight
 * state and applies the claim / release filters the way Mongo would (atomically: the stub
 * mutates synchronously before its first await, so a concurrent caller sees the result).
 */
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const fightResolution = require("../../utils/fightResolution");
const realResolve = fightResolution.resolveFight;
// fightService destructures resolveFight at require time, so the installed stub delegates to
// a per-test swappable engine.
const defaultEngine = () => ({
    outcome: "KO/TKO",
    rounds: [{ round: 1, event: "x", playerHealth: 80, opponentHealth: 0 }],
    commentary: [],
    playerHealthAfter: 80,
    playerStaminaAfter: 50,
    sessionBonuses: [],
    moveBonuses: [],
    wildcard: null,
    log: [],
});
let engine = defaultEngine;
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
const personaService = require("../../services/personaService");

const FIGHTER_ID = new mongoose.Types.ObjectId("507f1f77bcf86cd799439044");
const FIGHT_ID = "507f1f77bcf86cd799439011";
const TTL = fightService.RESOLVE_CLAIM_TTL_MS;

const restores = [];
function stub(obj, key, val) {
    const orig = obj[key];
    obj[key] = val;
    restores.push(() => { obj[key] = orig; });
}

// ── Per-test state (reset in beforeEach) ────────────────────────────────────
let fightState;          // the "persisted" Fight row
let fighterQueue;        // each Fighter.findById await pops one (one instance per request)
let fightUpdateCalls;    // [filter, update] for every Fight.updateOne
let fighterUpdateCalls;  // [filter, update] for every Fighter.updateOne
let logs;
let questCalls;
let opponentSaves;
let opponentSaveThrows;
let fightGone;           // the Fight document no longer exists
let fightSaveHook;       // optional (doc) => void run inside fight.save (may throw)
let campState;           // the "persisted" FightCamp row, or null for no camp
let campSaveThrows;
let saveOrder;           // "fight" / "camp" in persisted-write order
let personaOverride;     // optional fields merged over the real getFightModifiers result

beforeEach(() => {
    fightState = { _id: FIGHT_ID, fighterId: FIGHTER_ID, status: "accepted", resolvingAt: null };
    fighterQueue = [];
    fightUpdateCalls = [];
    fighterUpdateCalls = [];
    logs = [];
    questCalls = 0;
    opponentSaves = 0;
    opponentSaveThrows = false;
    fightGone = false;
    fightSaveHook = null;
    campState = null;
    campSaveThrows = false;
    saveOrder = [];
    personaOverride = null;
    engine = defaultEngine;
});

const clone = (v) => JSON.parse(JSON.stringify(v));

function sameId(a, b) { return String(a) === String(b); }

/** Mongo-like evaluation of the two filters resolveFightAndApply sends. */
function fightUpdateOne(filter, update) {
    fightUpdateCalls.push([filter, update]);
    if (fightGone || !sameId(filter._id, fightState._id)) return { matchedCount: 0, modifiedCount: 0 };
    let match;
    if (filter.$or) {
        // Claim filter.
        match = sameId(filter.fighterId, fightState.fighterId) && filter.$or.some((c) => {
            if (c.status !== fightState.status) return false;
            if (c.resolvingAt && c.resolvingAt.$lt) {
                return fightState.resolvingAt instanceof Date && fightState.resolvingAt < c.resolvingAt.$lt;
            }
            return true;
        });
    } else {
        // Release filter: exact status, and an exact resolvingAt stamp when one is given.
        match = filter.status === fightState.status && (
            !("resolvingAt" in filter) ||
            (filter.resolvingAt instanceof Date && fightState.resolvingAt instanceof Date &&
                filter.resolvingAt.getTime() === fightState.resolvingAt.getTime())
        );
    }
    if (!match) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(fightState, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
}

function makeOpponent() {
    return {
        _id: "507f1f77bcf86cd799439022", name: "Rival", style: "Boxing", overallRating: 70,
        fixedRank: null, fightHistory: [],
        save: async () => {
            if (opponentSaveThrows) throw new Error("opponent save failed");
            opponentSaves += 1;
        },
        toObject() { const { save, toObject, ...rest } = this; return rest; },
    };
}

/** A fresh Fight document per populate() read, reflecting the persisted state. */
function makeFightDoc() {
    return {
        _id: FIGHT_ID, fighterId: FIGHTER_ID, status: fightState.status, offerType: "Even",
        promotionTier: "GCS", opponentId: makeOpponent(), purse: 1000, weightCut: "easy",
        async save() {
            if (fightSaveHook) fightSaveHook(this);
            fightState.status = this.status;
            saveOrder.push("fight");
        },
    };
}

/** A fresh FightCamp document per findOne read, reflecting the persisted state. */
function makeCampDoc() {
    if (!campState) return null;
    return {
        fightId: FIGHT_ID, finalisedAt: new Date("2026-10-01T00:00:00Z"), campRating: "B",
        injuryChoice: null, injuryPenalty: null, selectedBuffId: null, wildcard: null,
        sessionBonuses: clone(campState.sessionBonuses),
        moveBonuses: clone(campState.moveBonuses),
        async save() {
            if (campSaveThrows) throw new Error("camp save failed");
            campState = { sessionBonuses: clone(this.sessionBonuses), moveBonuses: clone(this.moveBonuses) };
            saveOrder.push("camp");
        },
    };
}

before(() => {
    stub(Fighter, "findById", () => ({
        // Lazily popped on await so getFightBreakdown's select().lean() read does not consume one.
        then(res, rej) { return Promise.resolve(fighterQueue.shift() || null).then(res, rej); },
        select() { return { lean: async () => null }; },
    }));
    stub(Fighter, "updateOne", async (filter, update) => {
        fighterUpdateCalls.push([filter, update]);
        return { matchedCount: 1, modifiedCount: 1 };
    });
    stub(Fight, "findById", () => ({
        populate: async () => makeFightDoc(),
        select() { return this; },
        lean: async () => (fightGone ? null : { _id: FIGHT_ID, status: fightState.status }),
    }));
    stub(Fight, "updateOne", async (filter, update) => fightUpdateOne(filter, update));
    stub(FightCamp, "findOne", async () => makeCampDoc());
    const realMods = personaService.getFightModifiers;
    stub(personaService, "getFightModifiers", (f, ctx) => (
        personaOverride ? { ...realMods(f, ctx), ...personaOverride } : realMods(f, ctx)
    ));
    stub(FameEvent, "create", async (row) => row);
    stub(questService, "onFight", async () => { questCalls += 1; return []; });
    stub(activityLogService, "log", (...a) => { logs.push(a); });
    stub(analyticsService, "track", () => {});
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

function makeFighter(over = {}) {
    const f = new Fighter({
        _id: FIGHTER_ID,
        firstName: "Test", lastName: "Fighter", weightClass: "Lightweight",
        promotionTier: "GCS", overallRating: 80,
        ranking: { rank: 3, fightsInTier: 12 },
        winsInCurrentTier: 2, topFiveWinsInTier: 1, titleShotCooldown: 0,
        record: { wins: 20, losses: 2, draws: 0 },
        iron: 500,
        ...over,
    });
    f.notoriety = { score: 5000, peakTier: "UNKNOWN" };
    f.acceptedFightId = FIGHT_ID;
    f.saveCount = 0;
    f.save = async () => { f.saveCount += 1; return f; };
    return f;
}

function resolve() {
    return fightService.resolveFightAndApply(String(FIGHTER_ID), "user1");
}

const releaseCalls = () => fightUpdateCalls.filter(([filter]) => !filter.$or);
const winLogs = () => logs.filter((l) => l[1] === "FIGHT_WIN");

async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

/** Run body with console.error captured; returns { value, errors } (errors as joined lines). */
async function captureErrors(body) {
    const orig = console.error;
    const errors = [];
    console.error = (...a) => { errors.push(a.map(String).join(" ")); };
    try { return { value: await body(), errors }; } finally { console.error = orig; }
}

test("claim filter shape is literal: own accepted fight, or a resolving claim older than 60 s", async () => {
    assert.equal(TTL, 60 * 1000);
    const f = makeFighter();
    fighterQueue.push(f);
    await resolve();

    const [filter, update] = fightUpdateCalls[0];
    const setAt = update.$set.resolvingAt;
    assert.ok(setAt instanceof Date);
    assert.deepEqual(update, { $set: { status: "resolving", resolvingAt: setAt } });
    assert.deepEqual(Object.keys(filter), ["_id", "fighterId", "$or"]);
    assert.ok(sameId(filter._id, FIGHT_ID));
    assert.ok(sameId(filter.fighterId, FIGHTER_ID));
    assert.deepEqual(filter.$or, [
        { status: "accepted" },
        { status: "resolving", resolvingAt: { $lt: new Date(setAt.getTime() - TTL) } },
    ]);
    // Happy path: committed, never released.
    assert.equal(fightState.status, "completed");
    assert.equal(releaseCalls().length, 0);
});

test("two concurrent resolves: exactly one applies rewards, the other is FIGHT_ALREADY_RESOLVED 409", async () => {
    const a = makeFighter();
    const b = makeFighter();
    fighterQueue.push(a, b);

    const settled = await Promise.allSettled([resolve(), resolve()]);
    const ok = settled.filter((s) => s.status === "fulfilled");
    const bad = settled.filter((s) => s.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);
    assert.equal(bad[0].reason.code, "FIGHT_ALREADY_RESOLVED");
    assert.equal(bad[0].reason.status, 409);
    assert.equal(bad[0].reason.message, "This fight has already been resolved.");

    // The first request to call updateOne won (a); the loser (b) never touched its fighter.
    assert.ok(a.saveCount > 0);
    assert.equal(b.saveCount, 0);
    assert.equal(b.record.wins, 20);
    assert.equal(b.iron, 500);
    assert.ok(sameId(b.acceptedFightId, FIGHT_ID));

    // Rewards applied exactly once overall.
    assert.equal(a.record.wins, 21);
    assert.equal(winLogs().length, 1);
    assert.equal(questCalls, 1);
    assert.equal(opponentSaves, 1);
    assert.equal(fightState.status, "completed");

    // A lost claim on a still-resolving (or completed by the winner) fight is never released,
    // and only a "completed" read may clear the pointer.
    assert.equal(releaseCalls().length, 0);
    for (const [filter] of fighterUpdateCalls) {
        assert.ok(sameId(filter.acceptedFightId, FIGHT_ID));
    }
});

test("lost claim on a fight still resolving: 409, acceptedFightId is NOT cleared", async () => {
    fightState.status = "resolving";
    fightState.resolvingAt = new Date(Date.now() - 5 * 1000);
    const f = makeFighter();
    fighterQueue.push(f);

    await assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED" && err.status === 409);
    assert.equal(fighterUpdateCalls.length, 0);
    assert.equal(f.saveCount, 0);
    assert.equal(fightState.status, "resolving");
    assert.equal(releaseCalls().length, 0);
});

test("a throw before the commit (blocking injury) releases the claim and propagates the original error", async () => {
    const f = makeFighter();
    f.injuries = [{ label: "Concussion", cannotFight: true, doctorVisited: false, recoveryHoursLeft: 0 }];
    fighterQueue.push(f);

    await assert.rejects(resolve(), (err) => /^Still recovering from a Concussion/.test(err.message) && !err.code);
    assert.equal(fightState.status, "accepted");
    assert.equal(fightState.resolvingAt, null);
    const rel = releaseCalls();
    assert.equal(rel.length, 1);
    assert.deepEqual(Object.keys(rel[0][0]), ["_id", "status", "resolvingAt"]);
    assert.ok(sameId(rel[0][0]._id, FIGHT_ID));
    assert.equal(rel[0][0].status, "resolving");
    // Only our own claim: the release carries the exact stamp the claim wrote.
    const claimStamp = fightUpdateCalls[0][1].$set.resolvingAt;
    assert.ok(claimStamp instanceof Date);
    assert.equal(rel[0][0].resolvingAt, claimStamp);
    assert.deepEqual(rel[0][1], { $set: { status: "accepted", resolvingAt: null } });
    assert.equal(f.saveCount, 0);

    // Released: the next resolve can claim it again.
    f.injuries = [];
    fighterQueue.push(f);
    await resolve();
    assert.equal(fightState.status, "completed");
});

test("a failing release is logged, never masks the original error", async () => {
    const f = makeFighter();
    f.injuries = [{ label: "Concussion", cannotFight: true, doctorVisited: false }];
    fighterQueue.push(f);
    const orig = Fight.updateOne;
    Fight.updateOne = async (filter, update) => {
        if (!filter.$or) throw new Error("mongo down");
        return fightUpdateOne(filter, update);
    };
    try {
        await quiet(() => assert.rejects(resolve(), /Still recovering from a Concussion/));
    } finally {
        Fight.updateOne = orig;
    }
    assert.equal(fightState.status, "resolving");
});

test("a throw after the commit (opponent.save) does not release the claim", async () => {
    opponentSaveThrows = true;
    const f = makeFighter();
    fighterQueue.push(f);

    await assert.rejects(resolve(), /opponent save failed/);
    assert.equal(fightState.status, "completed");
    assert.equal(releaseCalls().length, 0);
});

test("a stale claim (older than 60 s) is reclaimed and resolved", async () => {
    fightState.status = "resolving";
    fightState.resolvingAt = new Date(Date.now() - TTL - 1000);
    const f = makeFighter();
    fighterQueue.push(f);

    const out = await resolve();
    assert.equal(out.summary.recordChange, "W");
    assert.equal(fightState.status, "completed");
    assert.equal(f.record.wins, 21);
});

test("a fresh claim (under 60 s) is rejected with 409 and no side effects", async () => {
    fightState.status = "resolving";
    fightState.resolvingAt = new Date(Date.now() - TTL + 5000);
    const f = makeFighter();
    fighterQueue.push(f);

    await assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED" && err.status === 409);
    assert.equal(f.saveCount, 0);
    assert.equal(questCalls, 0);
    assert.equal(winLogs().length, 0);
});

test("dangling pointer to a completed fight: acceptedFightId cleared conditionally, then 409", async () => {
    fightState.status = "completed";
    const f = makeFighter();
    fighterQueue.push(f);

    await quiet(() =>
        assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED" && err.status === 409)
    );
    assert.equal(fighterUpdateCalls.length, 1);
    const [filter, update] = fighterUpdateCalls[0];
    assert.deepEqual(Object.keys(filter), ["_id", "acceptedFightId"]);
    assert.ok(sameId(filter._id, FIGHTER_ID));
    assert.ok(sameId(filter.acceptedFightId, FIGHT_ID));
    assert.deepEqual(update, { $set: { acceptedFightId: null } });
    assert.equal(f.saveCount, 0);
    assert.equal(releaseCalls().length, 0);
    assert.equal(fightState.status, "completed");
});

test("claim for another fighter's fight is lost (fighterId is part of the filter)", async () => {
    fightState.fighterId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439099");
    const f = makeFighter();
    fighterQueue.push(f);

    await assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED");
    assert.equal(fightState.status, "accepted");
    assert.equal(f.saveCount, 0);
});

// ── Release only our own claim ───────────────────────────────────────────────

test("a release whose stamp no longer matches (claim reclaimed after the lease) is a no-op", async () => {
    const f = makeFighter();
    fighterQueue.push(f);
    const otherStamp = new Date(Date.now() + 1234);
    // While this request is still pre-commit, another request reclaims the fight (new stamp),
    // then this request throws before its commit.
    fightSaveHook = () => {
        fightState.resolvingAt = otherStamp;
        throw new Error("fight save failed");
    };

    await assert.rejects(resolve(), /fight save failed/);
    const rel = releaseCalls();
    assert.equal(rel.length, 1);
    assert.notEqual(rel[0][0].resolvingAt.getTime(), otherStamp.getTime());
    // The new owner's claim is untouched.
    assert.equal(fightState.status, "resolving");
    assert.equal(fightState.resolvingAt, otherStamp);
});

// ── Lost claim: missing fight document, completed-fight heal log ────────────

test("lost claim on a missing Fight document: pointer cleared conditionally, then 'Fight not found' (404 mapping)", async () => {
    fightGone = true;
    const f = makeFighter();
    fighterQueue.push(f);

    await assert.rejects(resolve(), (err) => err.message === "Fight not found" && !err.code && !err.status);
    assert.equal(fighterUpdateCalls.length, 1);
    const [filter, update] = fighterUpdateCalls[0];
    assert.deepEqual(Object.keys(filter), ["_id", "acceptedFightId"]);
    assert.ok(sameId(filter._id, FIGHTER_ID));
    assert.ok(sameId(filter.acceptedFightId, FIGHT_ID));
    assert.deepEqual(update, { $set: { acceptedFightId: null } });
    assert.equal(f.saveCount, 0);
    assert.equal(releaseCalls().length, 0);
});

test("healing a dangling pointer to a completed fight logs one error line with fighterId and fightId", async () => {
    fightState.status = "completed";
    const f = makeFighter();
    fighterQueue.push(f);

    const { errors } = await captureErrors(() =>
        assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED" && err.status === 409)
    );
    const healLines = errors.filter((l) => l.includes("dangling acceptedFightId"));
    assert.equal(healLines.length, 1);
    assert.ok(healLines[0].includes(`fighterId=${FIGHTER_ID}`));
    assert.ok(healLines[0].includes(`fightId=${FIGHT_ID}`));
    assert.match(healLines[0], /never applied/);
});

test("a lost claim on a still-resolving fight logs no heal line", async () => {
    fightState.status = "resolving";
    fightState.resolvingAt = new Date();
    fighterQueue.push(makeFighter());

    const { errors } = await captureErrors(() =>
        assert.rejects(resolve(), (err) => err.code === "FIGHT_ALREADY_RESOLVED")
    );
    assert.equal(errors.filter((l) => l.includes("dangling acceptedFightId")).length, 0);
});

// ── FightCamp snapshot is written only after the commit ──────────────────────

const CAMP_SESSION = [{ label: "Wrestling Drills", sessionType: "WRESTLING", value: 0.1, triggered: false, triggerCount: 0 }];
const CAMP_MOVES = [{ moveId: "iron_chin", bonusType: "OPPONENT_DAMAGE_REDUCTION", effectiveValue: 0.05, effectType: "PASSIVE", triggered: false, triggerCount: 0 }];

/** Engine stub that records what it was given and echoes the arrays back "triggered" once. */
function echoEngine(inputs) {
    return (_p, _o, opts) => {
        inputs.push({ sessionBonuses: clone(opts.sessionBonuses), moveBonuses: clone(opts.moveBonuses) });
        for (const b of opts.sessionBonuses) { b.triggered = true; b.triggerCount = (b.triggerCount || 0) + 1; }
        for (const b of opts.moveBonuses) { b.triggered = true; b.triggerCount = (b.triggerCount || 0) + 1; }
        return { ...defaultEngine(), sessionBonuses: opts.sessionBonuses, moveBonuses: opts.moveBonuses };
    };
}

function setupPersonaCamp() {
    campState = { sessionBonuses: clone(CAMP_SESSION), moveBonuses: clone(CAMP_MOVES) };
    // Comeback x2 on bonus values + Boogeyman 0.1 damage reduction merged into the lane.
    personaOverride = { comebackBonusMult: 2, damageReductionFrac: 0.1 };
}

test("a throw before the commit leaves the persisted camp untouched; a retry sees the same persona-merged inputs", async () => {
    // Reference: one clean first attempt.
    setupPersonaCamp();
    const refInputs = [];
    engine = echoEngine(refInputs);
    fighterQueue.push(makeFighter({ comebackMode: true }));
    await resolve();
    const refCamp = clone(campState);
    assert.equal(refInputs.length, 1);
    // Sanity: the persona merge really changed the inputs (0.1*2 and 0.05*2 + 0.1).
    assert.ok(Math.abs(refInputs[0].sessionBonuses[0].value - 0.2) < 1e-9);
    assert.ok(Math.abs(refInputs[0].moveBonuses[0].effectiveValue - 0.2) < 1e-9);

    // Fresh run: fail at the commit, then retry.
    fightState = { _id: FIGHT_ID, fighterId: FIGHTER_ID, status: "accepted", resolvingAt: null };
    saveOrder = [];
    setupPersonaCamp();
    const inputs = [];
    engine = echoEngine(inputs);
    let failOnce = true;
    fightSaveHook = () => {
        if (failOnce) { failOnce = false; throw new Error("fight save failed"); }
    };
    fighterQueue.push(makeFighter({ comebackMode: true }));
    await assert.rejects(resolve(), /fight save failed/);

    // Nothing persisted to the camp, claim released.
    assert.deepEqual(campState, { sessionBonuses: CAMP_SESSION, moveBonuses: CAMP_MOVES });
    assert.deepEqual(saveOrder, []);
    assert.equal(fightState.status, "accepted");

    fighterQueue.push(makeFighter({ comebackMode: true }));
    await resolve();
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[1], inputs[0]);
    assert.deepEqual(inputs[1], refInputs[0]);
    // Persisted snapshot equals a clean single attempt: merges applied once, triggerCount 1.
    assert.deepEqual(campState, refCamp);
    assert.equal(campState.sessionBonuses[0].triggerCount, 1);
    assert.equal(campState.moveBonuses[0].triggerCount, 1);
    assert.equal(campState.moveBonuses.length, 1);
});

test("camp snapshot is saved exactly once on success, after the fight save", async () => {
    setupPersonaCamp();
    engine = echoEngine([]);
    fighterQueue.push(makeFighter());
    await resolve();
    assert.deepEqual(saveOrder, ["fight", "camp"]);
    assert.equal(campState.sessionBonuses[0].triggered, true);
});

test("a camp save failure after the commit is logged and does not fail the resolve", async () => {
    setupPersonaCamp();
    campSaveThrows = true;
    engine = echoEngine([]);
    const f = makeFighter();
    fighterQueue.push(f);

    const { value: out, errors } = await captureErrors(() => resolve());
    assert.equal(out.summary.recordChange, "W");
    assert.equal(fightState.status, "completed");
    assert.equal(releaseCalls().length, 0);
    assert.equal(f.record.wins, 21);
    // Camp keeps its pre-fight snapshot; the failure is logged server-side.
    assert.deepEqual(campState, { sessionBonuses: CAMP_SESSION, moveBonuses: CAMP_MOVES });
    assert.ok(errors.some((l) => l.includes("post-fight camp snapshot save failed") && l.includes(`fightId=${FIGHT_ID}`)));
});
