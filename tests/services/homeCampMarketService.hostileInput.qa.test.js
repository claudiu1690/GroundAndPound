/**
 * Your Camp PHASE 1 -- hostile-input audit for the 5 new endpoints (market, hire, fire,
 * renovate, deep-clean). CLAUDE.md: "Validate all request bodies. Assume hostile input."
 *
 * market / renovate / deep-clean take no meaningful body -- their only input is fighterId,
 * which is already guarded by ownFighterParam before any service code runs, so their hostile-
 * input surface is effectively covered by the middleware layer (not re-tested here).
 *
 * hire and fire both take an untrusted candidateId / coachId path segment that flows straight
 * into Mongoose subdocument .id(...) lookups. This file throws garbage at both and asserts
 * every case resolves to a clean, contract-listed error code (never a 500, never a crash, never
 * an accidental match via prototype pollution or cross-camp id reuse).
 *
 * DB: LOCAL Mongo only, dedicated throwaway database mmaGame_qa_campp1_hostile. Dropped at the
 * end. No HTTP server, no port touched.
 *
 * Run with: node --test tests/services/homeCampMarketService.hostileInput.qa.test.js
 */
const assert = require("node:assert");
const { test, before, after } = require("node:test");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp1_hostile";
let dbAvailable = false;

let Fighter, HomeCamp, marketService, coachService;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error(`[QA] Mongo unreachable at ${DB_URI} -- skipping hostile-input tests:`, e.message);
        return;
    }
    Fighter = require("../../models/fighterModel");
    HomeCamp = require("../../models/homeCampModel");
    marketService = require("../../services/homeCampMarketService");
    coachService = require("../../services/homeCampCoachService");
    await HomeCamp.deleteMany({});
    await Fighter.deleteMany({});
});

after(async () => {
    if (!dbAvailable) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

function skip(t) {
    if (!dbAvailable) { t.skip("Mongo not reachable at " + DB_URI); return true; }
    return false;
}

async function makeFighter(over = {}) {
    return Fighter.create({
        firstName: "Test",
        lastName: "Fighter" + Math.random().toString(36).slice(2, 8),
        weightClass: "Lightweight",
        style: "Wrestler",
        iron: 100000,
        promotionTier: "Amateur",
        ...over,
    });
}

async function makeCampAtTier(fighter, tier, over) {
    tier = tier || 2;
    over = over || {};
    return HomeCamp.create({
        fighterId: fighter._id,
        name: "Test Camp",
        focusDomain: "WRESTLING",
        tier,
        condition: { value: 100, lastNeglectDayKey: null, lastSessionDayKey: null },
        coaches: [coachService.createStarterCoach("WRESTLING")],
        market: { weekIndex: -1, candidates: [], slotCooldownUntil: null },
        disciplineFamiliarity: {},
        lastWeeklyTickIndex: -1,
        ...over,
    });
}

const HOSTILE_ID_STRINGS = [
    "",
    " ",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "null",
    "undefined",
    "0",
    "-1",
    "DROP TABLE coaches",
    "a".repeat(5000),
    "not-a-valid-object-id",
    "ffffffffffffffffffffffff",
];

test("hireCandidate: every hostile candidateId string resolves to a clean 4xx, never a 500/crash, and never charges", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    await makeCampAtTier(fighter, 2);

    for (const hostile of HOSTILE_ID_STRINGS) {
        await assert.rejects(
            () => marketService.hireCandidate(String(fighter._id), hostile),
            (err) => {
                assert.ok(err.code, `candidateId ${JSON.stringify(hostile)} must raise a coded error, got: ${err.message}`);
                assert.ok(
                    ["candidate_not_found", "market_locked", "candidate_expired"].includes(err.code),
                    `candidateId ${JSON.stringify(hostile)} raised unexpected code ${err.code}`
                );
                return true;
            },
            `candidateId ${JSON.stringify(hostile)} must not throw an uncoded/500 error`
        );
    }

    const finalFighter = await Fighter.findById(fighter._id);
    assert.equal(finalFighter.iron, 10000, "no hostile candidateId may ever result in a charge");
});

test("hireCandidate: non-string candidateId types (object, array, number) are rejected as candidate_not_found, not a crash", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    await makeCampAtTier(fighter, 2);

    const nonStrings = [null, undefined, 12345, {}, [], { $ne: null }, true];
    for (const bad of nonStrings) {
        await assert.rejects(
            () => marketService.hireCandidate(String(fighter._id), bad),
            (err) => {
                assert.equal(err.code, "candidate_not_found", `non-string candidateId ${JSON.stringify(bad)} must be candidate_not_found`);
                return true;
            }
        );
    }
});

test("fireCoach: every hostile coachId string resolves to a clean 4xx, never a 500/crash, and never fires anyone", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    const camp = await makeCampAtTier(fighter, 2);
    camp.coaches.push({
        archetype: "STRIKING", name: "Extra Coach", initials: "EC",
        rarity: "COMMON", wage: 150, isStarter: false,
    });
    await camp.save();

    for (const hostile of HOSTILE_ID_STRINGS) {
        await assert.rejects(
            () => marketService.fireCoach(String(fighter._id), hostile),
            (err) => {
                assert.ok(["coach_not_found", "last_coach"].includes(err.code),
                    `coachId ${JSON.stringify(hostile)} raised unexpected code ${err.code}`);
                return true;
            },
            `coachId ${JSON.stringify(hostile)} must not throw an uncoded/500 error`
        );
    }

    const finalCamp = await HomeCamp.findOne({ _id: camp._id });
    assert.equal(finalCamp.coaches.length, 2, "no hostile coachId may ever remove a coach");
});

test("hireCandidate: a candidateId belonging to a DIFFERENT fighter market is candidate_not_found, never a cross-camp hire", async (t) => {
    if (skip(t)) return;

    const fighterA = await makeFighter({ iron: 10000 });
    const fighterB = await makeFighter({ iron: 10000 });
    const campA = await makeCampAtTier(fighterA, 2);
    const wkNow = require("../../consts/homeCampConfig").homeCampWeekIndex();
    await makeCampAtTier(fighterB, 2, { market: { weekIndex: wkNow, candidates: [], slotCooldownUntil: null } });

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candidate = marketService.generateCandidate(() => 0.3, { domain: "STRIKING", rarity: "COMMON", taken: new Set() });
    candidate.hireFee = 500;
    campA.market.weekIndex = wk;
    campA.market.candidates = [candidate];
    await campA.save();
    const freshA = await HomeCamp.findOne({ _id: campA._id });
    const candidateIdFromA = String(freshA.market.candidates[0]._id);

    await assert.rejects(
        () => marketService.hireCandidate(String(fighterB._id), candidateIdFromA),
        (err) => err.code === "candidate_not_found"
    );

    const finalFighterB = await Fighter.findById(fighterB._id);
    assert.equal(finalFighterB.iron, 10000, "fighter B must never be charged for fighter A candidate");
    const finalCampA = await HomeCamp.findOne({ _id: campA._id });
    assert.equal(finalCampA.market.candidates.length, 1, "fighter A own candidate must be untouched by fighter B attempt");
});

test("fireCoach: a coachId belonging to a DIFFERENT fighter roster is coach_not_found, never a cross-camp fire", async (t) => {
    if (skip(t)) return;

    const fighterA = await makeFighter({ iron: 10000 });
    const fighterB = await makeFighter({ iron: 10000 });
    const campA = await makeCampAtTier(fighterA, 2);
    await makeCampAtTier(fighterB, 2);

    const coachIdFromA = String(campA.coaches[0]._id);

    await assert.rejects(
        () => marketService.fireCoach(String(fighterB._id), coachIdFromA),
        (err) => err.code === "coach_not_found"
    );

    const finalCampA = await HomeCamp.findOne({ _id: campA._id });
    assert.equal(finalCampA.coaches.length, 1, "fighter A coach must be untouched by fighter B attempt to fire it");
});
