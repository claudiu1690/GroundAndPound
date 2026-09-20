/**
 * Your Camp PHASE 1 -- LIVE-MONGO round trip for disciplineFamiliarity, a Mixed-type field
 * (contract Section 4.3, risk #5: "disciplineFamiliarity is Mixed -- markModified in BOTH
 * bank/consume; Q4 asserts after reload").
 *
 * DB: LOCAL Mongo only, dedicated throwaway database mmaGame_qa_campp1_familiarity. Dropped at
 * the end. No HTTP server, no port touched.
 *
 * Run with: node --test tests/services/homeCampMarketService.familiarity.qa.test.js
 */
const assert = require("node:assert");
const { test, before, after } = require("node:test");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp1_familiarity";
let dbAvailable = false;

let Fighter, HomeCamp, marketService, coachService, COACH_RANKS;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error(`[QA] Mongo unreachable at ${DB_URI} -- skipping familiarity round-trip tests:`, e.message);
        return;
    }
    Fighter = require("../../models/fighterModel");
    HomeCamp = require("../../models/homeCampModel");
    marketService = require("../../services/homeCampMarketService");
    coachService = require("../../services/homeCampCoachService");
    COACH_RANKS = require("../../consts/homeCampConfig").COACH_RANKS;
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

test("firing a rank-3+ coach banks familiarity and it survives a fresh reload from the database", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    const camp = await HomeCamp.create({
        fighterId: fighter._id,
        name: "Familiarity Camp",
        focusDomain: "WRESTLING",
        tier: 3,
        condition: { value: 100, lastNeglectDayKey: null, lastSessionDayKey: null },
        coaches: [
            coachService.createStarterCoach("WRESTLING"),
            {
                archetype: "BJJ", name: "Head Coach", initials: "HC", rarity: "RARE",
                rank: 4, wage: 750, isStarter: false,
            },
        ],
        market: { weekIndex: -1, candidates: [], slotCooldownUntil: null },
        disciplineFamiliarity: {},
        lastWeeklyTickIndex: -1,
    });
    const bjjCoachId = String(camp.coaches[1]._id);

    await marketService.fireCoach(String(fighter._id), bjjCoachId);

    const reloaded = await HomeCamp.findOne({ _id: camp._id });
    assert.deepEqual(
        reloaded.disciplineFamiliarity.BJJ,
        { bankedSessions: COACH_RANKS[2].sessions, bankedWins: COACH_RANKS[2].wins },
        "the banked familiarity must survive a fresh reload -- this is the whole point of markModified on a Mixed field"
    );
});

test("firing a rank 1/2 coach banks nothing", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    const camp = await HomeCamp.create({
        fighterId: fighter._id,
        name: "No Bank Camp",
        focusDomain: "WRESTLING",
        tier: 2,
        condition: { value: 100, lastNeglectDayKey: null, lastSessionDayKey: null },
        coaches: [
            coachService.createStarterCoach("WRESTLING"),
            {
                archetype: "STRIKING", name: "Rookie Coach", initials: "RC", rarity: "COMMON",
                rank: 2, wage: 150, isStarter: false,
            },
        ],
        market: { weekIndex: -1, candidates: [], slotCooldownUntil: null },
        disciplineFamiliarity: {},
        lastWeeklyTickIndex: -1,
    });
    const rookieId = String(camp.coaches[1]._id);

    await marketService.fireCoach(String(fighter._id), rookieId);

    const reloaded = await HomeCamp.findOne({ _id: camp._id });
    assert.deepEqual(reloaded.disciplineFamiliarity, {}, "a rank 1/2 departure must never bank anything");
});

test("hiring a coach in a banked domain consumes the bank capped at Rank 2 requirements, and the bank is gone after a fresh reload", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    const camp = await HomeCamp.create({
        fighterId: fighter._id,
        name: "Consume Camp",
        focusDomain: "WRESTLING",
        tier: 2,
        condition: { value: 100, lastNeglectDayKey: null, lastSessionDayKey: null },
        coaches: [coachService.createStarterCoach("WRESTLING")],
        market: { weekIndex: -1, candidates: [], slotCooldownUntil: null },
        disciplineFamiliarity: { BJJ: { bankedSessions: 9999, bankedWins: 9999 } },
        lastWeeklyTickIndex: -1,
    });

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candidate = marketService.generateCandidate(() => 0.3, { domain: "BJJ", rarity: "COMMON", taken: new Set() });
    candidate.hireFee = 500;
    camp.market.weekIndex = wk;
    camp.market.candidates = [candidate];
    await camp.save();
    const fresh = await HomeCamp.findOne({ _id: camp._id });
    const candidateId = String(fresh.market.candidates[0]._id);

    const { hire } = await marketService.hireCandidate(String(fighter._id), candidateId);
    assert.deepEqual(
        hire.familiarityApplied,
        { sessions: COACH_RANKS[2].sessions, wins: COACH_RANKS[2].wins },
        "the credit must be capped at Rank 2 own requirements, never an instant Rank 4 from a huge bank"
    );

    const reloadedCamp = await HomeCamp.findOne({ _id: camp._id });
    const hiredCoach = reloadedCamp.coaches.find((c) => String(c._id) === hire.coachId);
    assert.equal(hiredCoach.sessionsCompleted, COACH_RANKS[2].sessions);
    assert.equal(hiredCoach.relevantWins, COACH_RANKS[2].wins);

    assert.equal(
        reloadedCamp.disciplineFamiliarity.BJJ, undefined,
        "the bank must be cleared after being spent, verified against a fresh reload of the Mixed field"
    );
});
