/**
 * Your Camp PHASE 2 QA - claimCoachPerk WRITE PATH.
 *
 * perk.qa.test.js (pure-function coverage for buildPerkView/buildRankLabels/grantsForRank)
 * explicitly says the claim ENDPOINT's write path -- idempotency, concurrency, additive grant,
 * badge integration -- "is verified live against local Mongo", but no test file anywhere in the
 * suite actually calls coachService.claimCoachPerk. This file fills that gap.
 *
 * DB: LOCAL Mongo only, dedicated throwaway database mmaGame_qa_campp2_claimperk. Dropped at
 * the end. No HTTP server, no port touched, no Atlas.
 *
 * Run with: node --test tests/services/homeCampCoachService.claimPerk.qa.test.js
 */
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp2_claimperk";
assert.ok(!DB_URI.includes("mongodb+srv"), "this suite must never point at Atlas");
let dbAvailable = false;

let Fighter, HomeCamp, coachService, perkForArchetype, COACH_MAX_RANK;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error("[QA] Mongo unreachable at " + DB_URI + " -- skipping claim-perk tests:", e.message);
        return;
    }
    Fighter = require("../../models/fighterModel");
    HomeCamp = require("../../models/homeCampModel");
    coachService = require("../../services/homeCampCoachService");
    ({ perkForArchetype, COACH_MAX_RANK } = require("../../consts/homeCampConfig"));
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

let seq = 0;
async function seed(opts) {
    opts = opts || {};
    const archetype = opts.archetype || "WRESTLING";
    const rank = opts.rank === undefined ? 4 : opts.rank;
    const gymPerks = opts.gymPerks || [];
    seq += 1;
    const fighter = await Fighter.create({
        firstName: "Claim", lastName: "Case" + seq,
        weightClass: "Middleweight", style: "Wrestler",
        iron: 100,
        gymPerks: gymPerks,
    });
    const camp = await HomeCamp.create({
        fighterId: fighter._id,
        name: "Case" + seq + " Camp",
        focusDomain: archetype,
        tier: 1,
        coaches: [{
            archetype: archetype, name: "Viktor Petrov", initials: "VP",
            rarity: "COMMON", traitKey: null, wage: 0, hireFee: 0,
            isStarter: true, hiredAt: new Date(),
            rank: rank, sessionsCompleted: 60, relevantWins: 10, morale: 100,
            exclusiveSessionKey: null,
            teachPoolMoveIds: ["SPRAWL_INSTINCT"],
            taughtMoveIds: [],
        }],
    });
    return { fighter: fighter, camp: camp, coachId: String(camp.coaches[0]._id) };
}

const reload = function (id) { return Fighter.findById(id); };

test("claimCoachPerk: grants the archetype perk additively and stamps campRank4Archetypes", async (t) => {
    if (skip(t)) return;
    const perk = perkForArchetype("WRESTLING");
    const seeded = await seed({ archetype: "WRESTLING", gymPerks: ["some_other_perk"] });

    const res = await coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId);

    assert.equal(res.perkGranted.key, perk.key);
    assert.ok(res.perkGranted.message.indexOf(perk.name) >= 0);

    const after = await reload(seeded.fighter._id);
    assert.deepEqual([...after.gymPerks].sort(), ["some_other_perk", perk.key].sort());
    assert.deepEqual(after.campRank4Archetypes, ["WRESTLING"]);
});

test("claimCoachPerk: never touches taughtMoveIds -- retro-teaching is deliberately excluded", async (t) => {
    if (skip(t)) return;
    const seeded = await seed({ archetype: "WRESTLING" });
    await coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId);

    const freshCamp = await HomeCamp.findOne({ fighterId: seeded.fighter._id });
    const coach = freshCamp.coaches.id(seeded.coachId);
    assert.deepEqual(coach.taughtMoveIds, []);

    const freshFighter = await reload(seeded.fighter._id);
    assert.deepEqual(freshFighter.specialMovesOwned || [], []);
});

test("claimCoachPerk: a second claim is 400 perk_already_held and gymPerks does not grow", async (t) => {
    if (skip(t)) return;
    const perk = perkForArchetype("WRESTLING");
    const seeded = await seed({ archetype: "WRESTLING" });

    await coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId);
    const midway = await reload(seeded.fighter._id);
    assert.equal(midway.gymPerks.filter(function (k) { return k === perk.key; }).length, 1);

    let err = null;
    try {
        await coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId);
    } catch (e) { err = e; }

    assert.ok(err);
    assert.equal(err.code, "perk_already_held");
    assert.equal(err.status, 400);

    const after = await reload(seeded.fighter._id);
    assert.equal(after.gymPerks.filter(function (k) { return k === perk.key; }).length, 1);
    assert.deepEqual(after.campRank4Archetypes, ["WRESTLING"]);
});

test("claimCoachPerk: two concurrent claims on the same coach yield exactly ONE grant", async (t) => {
    if (skip(t)) return;
    const perk = perkForArchetype("WRESTLING");
    const seeded = await seed({ archetype: "WRESTLING" });

    const results = await Promise.allSettled([
        coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId),
        coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId),
    ]);
    const ok = results.filter(function (r) { return r.status === "fulfilled"; });
    const failed = results.filter(function (r) { return r.status === "rejected"; });

    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.code, "perk_already_held");

    const after = await reload(seeded.fighter._id);
    assert.equal(after.gymPerks.filter(function (k) { return k === perk.key; }).length, 1);
});

test("claimCoachPerk: below rank 4 is perk_not_claimable and writes NOTHING", async (t) => {
    if (skip(t)) return;
    const seeded = await seed({ archetype: "WRESTLING", rank: 3 });
    const ironBefore = seeded.fighter.iron;

    let err = null;
    try {
        await coachService.claimCoachPerk(String(seeded.fighter._id), seeded.coachId);
    } catch (e) { err = e; }

    assert.ok(err);
    assert.equal(err.code, "perk_not_claimable");
    assert.equal(err.status, 400);

    const after = await reload(seeded.fighter._id);
    assert.deepEqual(after.gymPerks, []);
    assert.deepEqual(after.campRank4Archetypes || [], []);
    assert.equal(after.iron, ironBefore);
});

test("claimCoachPerk: an archetype with no perk config reads null via buildPerkView (defensive)", async (t) => {
    if (skip(t)) return;
    const view = coachService.buildPerkView(
        { archetype: "NOT_A_REAL_ARCHETYPE", rank: COACH_MAX_RANK },
        { gymPerks: [] }
    );
    assert.equal(view, null);
});

test("claimCoachPerk: a malformed coachId is coach_not_found (404), never a 500", async (t) => {
    if (skip(t)) return;
    const seeded = await seed({ archetype: "WRESTLING" });
    let err = null;
    try {
        await coachService.claimCoachPerk(String(seeded.fighter._id), "not-an-object-id");
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, "coach_not_found");
    assert.equal(err.status, 404);
});
