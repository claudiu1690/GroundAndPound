/**
 * Your Camp PHASE 2 — Q4: THE LEGENDARY MASTERCLASS IS GATED ON THE COACH, NOT THE ARCHETYPE.
 * Risk #10.
 *
 * `drillKey` comes from the client. If `runDrill` resolved the masterclass by ARCHETYPE, any
 * player with a $500 COMMON Striking coach could POST `legend_striking_masterclass` and train
 * the best drill in the game. The defence is one function — `drillForCoach` — which matches the
 * posted key against the coach's OWN stored `exclusiveSessionKey`, and which runs BEFORE
 * `deductBatchEnergy` so a rejection is free.
 *
 * Covers:
 *   · a COMMON coach posting the key → 400 `unknown_drill`, ZERO energy spent
 *   · a LEGENDARY at Rank 3 → 400 `drill_locked` (and the card renders as a locked goal)
 *   · a LEGENDARY at Rank 4 → 200, and THE CARD'S NUMBERS EQUAL THE CHARGED NUMBERS
 *   · NIGHT_OWL gets NO energy discount on it (isFlagship:false is load-bearing)
 *   · the 5-drill payload shape (GET + market card)
 *
 * DB: LOCAL Mongo only, throwaway database mmaGame_qa_campp2_master. Dropped at the end.
 *
 * Run with: node --test tests/services/homeCampTrainingService.masterclass.qa.test.js
 */
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp2_master";
let dbAvailable = false;

let Fighter, HomeCamp, trainingService, coachService, energyService, cfg;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error(`[QA] Mongo unreachable at ${DB_URI} — skipping masterclass tests:`, e.message);
        return;
    }
    Fighter = require("../../models/fighterModel");
    HomeCamp = require("../../models/homeCampModel");
    trainingService = require("../../services/homeCampTrainingService");
    coachService = require("../../services/homeCampCoachService");
    energyService = require("../../services/energyService");
    cfg = require("../../consts/homeCampConfig");
    await HomeCamp.deleteMany({});
    await Fighter.deleteMany({});
});

after(async () => {
    if (!dbAvailable) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    // energyService holds a live ioredis connection; without this the test process never exits.
    try { await require("../../lib/redis").redis.quit(); } catch (_) { /* already closed */ }
});

function skip(t) {
    if (!dbAvailable) { t.skip("Mongo not reachable at " + DB_URI); return true; }
    return false;
}

const MASTERCLASS = "legend_striking_masterclass";
const NO_BLOCKS = { spar: null, bag: null, none: null };

let seq = 0;
async function seed({ rarity = "LEGENDARY", rank = 4, traitKey = null, exclusive = true } = {}) {
    seq += 1;
    const fighter = await Fighter.create({
        firstName: "Master", lastName: `Case${seq}`,
        weightClass: "Middleweight", style: "Boxer",
        iron: 50000,
        energy: { current: 100, max: 100, lastSyncedAt: new Date() },
    });
    const camp = await HomeCamp.create({
        fighterId: fighter._id,
        name: `Case${seq} Camp`,
        focusDomain: "STRIKING",
        tier: 4,
        coaches: [{
            archetype: "STRIKING", name: "Ivan Kessler", initials: "IK",
            rarity, traitKey, wage: 2250, hireFee: 5000, isStarter: false,
            rank, sessionsCompleted: 60, relevantWins: 10, morale: 100,
            exclusiveSessionKey: exclusive ? MASTERCLASS : null,
            teachPoolMoveIds: ["HEAVY_HANDS", "BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER"],
            taughtMoveIds: [],
        }],
    });
    // Energy lives in Redis-backed energyService; make sure the fighter is topped up there too.
    await energyService.getEnergy(String(fighter._id)).catch(() => {});
    return { fighter, camp, coachId: String(camp.coaches[0]._id) };
}

// ── the hostile-input gate ───────────────────────────────────────────────────

test("Q4 a COMMON coach posting the masterclass key gets 400 unknown_drill and spends ZERO energy", async (t) => {
    if (skip(t)) return;
    const { fighter, coachId } = await seed({ rarity: "COMMON", rank: 4, exclusive: false });
    const before = await energyService.getEnergy(String(fighter._id));

    let err = null;
    try {
        await trainingService.runDrill(String(fighter._id), { coachId, drillKey: MASTERCLASS, quantity: 1 });
    } catch (e) { err = e; }

    assert.ok(err, "a Common coach must not be able to train a Legendary masterclass");
    assert.equal(err.code, "unknown_drill");
    assert.equal(err.status, 400);

    const after = await energyService.getEnergy(String(fighter._id));
    assert.equal(after.current, before.current, "the rejection must happen BEFORE deductBatchEnergy");
});

test("Q4 a RARE coach (still not Legendary) posting the key is rejected identically", async (t) => {
    if (skip(t)) return;
    const { fighter, coachId } = await seed({ rarity: "RARE", rank: 4, exclusive: false });
    const before = await energyService.getEnergy(String(fighter._id));
    await assert.rejects(
        () => trainingService.runDrill(String(fighter._id), { coachId, drillKey: MASTERCLASS }),
        (e) => e.code === "unknown_drill"
    );
    const after = await energyService.getEnergy(String(fighter._id));
    assert.equal(after.current, before.current);
});

test("Q4 posting ANOTHER archetype's masterclass key is rejected", async (t) => {
    if (skip(t)) return;
    // A Legendary STRIKING coach must not be able to train the BJJ room just because the key exists.
    const { fighter, coachId } = await seed({ rarity: "LEGENDARY", rank: 4 });
    await assert.rejects(
        () => trainingService.runDrill(String(fighter._id), { coachId, drillKey: "legend_bjj_masterclass" }),
        (e) => e.code === "unknown_drill"
    );
});

test("Q4 a LEGENDARY at Rank 3 gets drill_locked, not a free session", async (t) => {
    if (skip(t)) return;
    const { fighter, coachId } = await seed({ rank: 3 });
    const before = await energyService.getEnergy(String(fighter._id));
    await assert.rejects(
        () => trainingService.runDrill(String(fighter._id), { coachId, drillKey: MASTERCLASS }),
        (e) => e.code === "drill_locked" && e.status === 400
    );
    const after = await energyService.getEnergy(String(fighter._id));
    assert.equal(after.current, before.current, "a locked drill costs nothing either");
});

// ── the happy path: card numbers == charged numbers ─────────────────────────

test("Q4 a LEGENDARY at Rank 4 trains it, and the CARD's numbers are the CHARGED numbers", async (t) => {
    if (skip(t)) return;
    const { fighter, camp, coachId } = await seed({ rank: 4 });
    const coach = camp.coaches.id(coachId);

    const card = coachService.buildDrillViews(coach, NO_BLOCKS).find((d) => d.key === MASTERCLASS);
    assert.ok(card, "the masterclass must be on the card list");
    assert.equal(card.locked, false);
    assert.equal(card.isExclusive, true);
    assert.equal(card.isFlagship, false);
    assert.deepEqual(card.stats, ["STR", "SPD", "CHN", "FIQ"], "4 stats — the wider spread is what a Legendary buys");

    const energyBefore = (await energyService.getEnergy(String(fighter._id))).current;
    const res = await trainingService.runDrill(String(fighter._id), { coachId, drillKey: MASTERCLASS, quantity: 1 });

    assert.equal(res.completed, 1);
    assert.equal(res.energySpent, card.energy, "charged energy === advertised energy");
    assert.equal(energyBefore - res.energyAfter, card.energy);
    assert.equal(res.condition.delta, card.condDelta, "charged condition delta === advertised condDelta");
    assert.deepEqual(res.statChanges.map((s) => s.stat), card.stats, "trained stats === advertised stats");
});

test("Q4 NIGHT_OWL gets NO discount on the masterclass (it is not a flagship)", async (t) => {
    if (skip(t)) return;
    const { fighter, camp, coachId } = await seed({ rank: 4, traitKey: "NIGHT_OWL" });
    const coach = camp.coaches.id(coachId);
    const cards = coachService.buildDrillViews(coach, NO_BLOCKS);

    const master = cards.find((d) => d.key === MASTERCLASS);
    const flagship = cards.find((d) => d.isFlagship);
    const rawMaster = cfg.exclusiveDrillFor("STRIKING");
    const rawFlagship = cfg.COACH_DRILLS.STRIKING.find((d) => d.isFlagship);

    assert.equal(flagship.energy, rawFlagship.energy - 1, "Night Owl DOES discount his real flagship");
    assert.equal(master.energy, rawMaster.energy, "…and must NOT discount the masterclass");

    // And the resolver agrees with the card — the whole point of applyTraitToDrill being one home.
    const res = await trainingService.runDrill(String(fighter._id), { coachId, drillKey: MASTERCLASS, quantity: 1 });
    assert.equal(res.energySpent, rawMaster.energy);
    assert.equal(res.energySpent, master.energy);
});

// ── payload shape ────────────────────────────────────────────────────────────

test("Q4 a Rank-3 Legendary renders 5 drills with the last one locked + isExclusive", async (t) => {
    if (skip(t)) return;
    const { camp, coachId } = await seed({ rank: 3 });
    const drills = coachService.buildDrillViews(camp.coaches.id(coachId), NO_BLOCKS);

    assert.equal(drills.length, 5);
    const last = drills[4];
    assert.equal(last.key, MASTERCLASS);
    assert.equal(last.locked, true);
    assert.equal(last.unlockRank, 4);
    assert.equal(last.isExclusive, true);
    // A locked card must NOT leak the numbers — the UI renders "???".
    assert.equal(last.energy, undefined);
    assert.equal(last.stats, undefined);
});

test("Q4 isExclusive is present on EVERY drill of every shape, so the client never parses keys", async (t) => {
    if (skip(t)) return;
    const { camp, coachId } = await seed({ rank: 2 });   // mix of locked and unlocked
    for (const d of coachService.buildDrillViews(camp.coaches.id(coachId), NO_BLOCKS)) {
        assert.equal(typeof d.isExclusive, "boolean", `${d.key} is missing isExclusive`);
    }
});

test("Q4 a non-Legendary coach still renders exactly 4 drills, none exclusive", async (t) => {
    if (skip(t)) return;
    for (const rarity of ["COMMON", "UNCOMMON", "RARE"]) {
        const { camp, coachId } = await seed({ rarity, rank: 4, exclusive: false });
        const drills = coachService.buildDrillViews(camp.coaches.id(coachId), NO_BLOCKS);
        assert.equal(drills.length, 4, `${rarity} coach must not get a 5th card`);
        assert.equal(drills.some((d) => d.isExclusive), false);
    }
});

test("Q4 the Rank-4 development-track caption announces the masterclass", async (t) => {
    if (skip(t)) return;
    const { camp, coachId } = await seed({ rank: 3 });
    const coach = camp.coaches.id(coachId);
    const labels = coachService.buildRankLabels(coach);
    assert.match(labels[3], /Championship Camp Rounds/, "the Rank-4 node must sell the masterclass");
});

test("Q4 request isolation — drill objects handed out are FRESH copies", async (t) => {
    if (skip(t)) return;
    const { camp, coachId } = await seed({ rank: 4 });
    const coach = camp.coaches.id(coachId);
    const a = coachService.buildDrillViews(coach, NO_BLOCKS);
    a.find((d) => d.key === MASTERCLASS).energy = 1;
    a.find((d) => d.key === MASTERCLASS).stats.push("LEG");
    const b = coachService.buildDrillViews(coach, NO_BLOCKS);
    const fresh = b.find((d) => d.key === MASTERCLASS);
    assert.equal(fresh.energy, 10, "config leaked between requests");
    assert.deepEqual(fresh.stats, ["STR", "SPD", "CHN", "FIQ"], "stats array leaked between requests");
});
