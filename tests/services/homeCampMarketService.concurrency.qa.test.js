/**
 * Your Camp PHASE 1 -- LIVE-MONGO concurrency + persistence audit.
 *
 * Every other tests/services/homeCamp*.qa.test.js file exercises the service functions against
 * hand-built plain-object doubles (camp/coach/fighter stand-ins). That is the right tool for
 * arithmetic (wages, morale, trait math), but it cannot prove the thing the contract calls out
 * as the top risk: that HomeCamp.updateOne with an $expr guard actually behaves atomically
 * against a real MongoDB server. A stubbed Fighter.updateOne always wins the race the way the
 * stub author intended -- only a real database can lose one.
 *
 * DB: LOCAL Mongo only (mongodb://localhost:27017), a DEDICATED throwaway database named
 * mmaGame_qa_campp1_concurrency, distinct from the owner's mmaGame and any other agent's
 * mmaGame_campp1. Dropped at the end of the run. Does not start any HTTP server or touch any
 * port.
 *
 * Run with: node --test tests/services/homeCampMarketService.concurrency.qa.test.js
 * Requires: a local mongod reachable at mongodb://localhost:27017 (docker compose up -d mongo
 * in this repo satisfies that). If unreachable, every test in this file is skipped rather than
 * failed, so it never blocks a suite run on a machine without Mongo.
 */
const assert = require("node:assert");
const { test, before, after } = require("node:test");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp1_concurrency";
let dbAvailable = false;

let Fighter, HomeCamp, marketService, coachService;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error(`[QA] Mongo unreachable at ${DB_URI} -- skipping live concurrency tests:`, e.message);
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

// ── 1. Two simultaneous hires for the SAME candidate, WITH slack slots ───────
// Tier 4 gives 4 unlocked slots against 1 starter coach, so the roster never fills up as a
// side-effect of the winning hire -- this isolates the candidate-identity race from the
// slot-capacity race (see the dedicated bug-repro test below for what happens when they collide).

test("two simultaneous hires for the same candidate (slack slots): exactly one success, one candidate_not_found, exactly one charge", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    const camp = await makeCampAtTier(fighter, 4);

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candidate = marketService.generateCandidate(() => 0.42, {
        domain: "STRIKING",
        rarity: "RARE",
        taken: new Set(),
    });
    candidate.hireFee = 3000;
    camp.market.weekIndex = wk;
    camp.market.candidates = [candidate];
    await camp.save();

    const fresh = await HomeCamp.findOne({ _id: camp._id });
    const candidateId = String(fresh.market.candidates[0]._id);

    const results = await Promise.allSettled([
        marketService.hireCandidate(String(fighter._id), candidateId),
        marketService.hireCandidate(String(fighter._id), candidateId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one hire attempt must succeed");
    assert.equal(rejected.length, 1, "exactly one hire attempt must lose the race");
    assert.equal(rejected[0].reason.code, "candidate_not_found", "the loser must be told the truth, not a generic 500");

    const finalFighter = await Fighter.findById(fighter._id);
    assert.equal(finalFighter.iron, 10000 - 3000, "the hire fee must be charged exactly once, never twice, never zero");

    const finalCamp = await HomeCamp.findOne({ _id: camp._id });
    assert.equal(finalCamp.coaches.length, 2, "exactly one coach must have been added");
    assert.equal(finalCamp.market.candidates.length, 0, "the candidate must be gone from the market, not duplicated");
});

// ── FIXED (was a QA finding): same race, but the winning hire ALSO fills the last slot ──
//
// hireCandidate's mutex-loss fallback used to check ONLY "is the roster now full", so when two
// requests raced for the SAME candidate into the LAST free slot, the winner's hire filled that
// slot as a side effect and the loser was told `no_slot`. Both facts were true at once, but
// no_slot is the wrong one to report: it answers a question about capacity when the player is
// looking at a specific coach who has just been signed by their other click, and it points the
// UI at "renovate for more space" instead of "he's gone".
//
// The fallback now checks IDENTITY FIRST -- is this candidate still listed in THIS week's
// market? -- and only falls back to capacity if he is. That matches contract Section 3.3's
// error order ("404 candidate_not_found (incl. lost hire race)" is listed BEFORE no_slot) and
// mirrors fireCoach's fallback, which already checked `stillThere` before last_coach.
test("a lost hire race reports candidate_not_found even when the winner also filled the last free slot", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    // Tier 2 = 2 unlocked slots, 1 starter already filled -> exactly ONE free slot.
    const camp = await makeCampAtTier(fighter, 2);

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candidate = marketService.generateCandidate(() => 0.42, {
        domain: "STRIKING",
        rarity: "RARE",
        taken: new Set(),
    });
    candidate.hireFee = 3000;
    camp.market.weekIndex = wk;
    camp.market.candidates = [candidate];
    await camp.save();

    const fresh = await HomeCamp.findOne({ _id: camp._id });
    const candidateId = String(fresh.market.candidates[0]._id);

    const results = await Promise.allSettled([
        marketService.hireCandidate(String(fighter._id), candidateId),
        marketService.hireCandidate(String(fighter._id), candidateId),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, "candidate_not_found",
        "the loser of a hire race is told the candidate is gone -- not that the camp is full");
    assert.equal(rejected[0].reason.status, 404, "candidate_not_found is a 404 (contract Section 3.3)");
    // no_slot's extras must NOT ride along on a candidate_not_found body.
    assert.equal(rejected[0].reason.unlocked, undefined);
    assert.equal(rejected[0].reason.filled, undefined);

    // The money/roster invariant is unchanged by the relabelling:
    const finalFighter = await Fighter.findById(fighter._id);
    assert.equal(finalFighter.iron, 10000 - 3000, "exactly one charge must occur");
    const finalCamp = await HomeCamp.findOne({ _id: camp._id });
    assert.equal(finalCamp.coaches.length, 2, "exactly one coach was added");
    assert.equal(finalCamp.market.candidates.length, 0, "the candidate is gone, not duplicated");
});

// A genuinely full roster (nobody raced for this candidate) must still say no_slot -- the fix
// above must not swallow the capacity case, which is the one where "renovate" IS the answer.
test("a hire into a genuinely full roster still reports no_slot, with its unlocked/filled extras", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 10000 });
    const camp = await makeCampAtTier(fighter, 2);

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candidate = marketService.generateCandidate(() => 0.42, {
        domain: "BJJ", rarity: "COMMON", taken: new Set(),
    });
    camp.market.weekIndex = wk;
    camp.market.candidates = [candidate];
    // Fill the second slot with an unrelated coach so the roster is at capacity BEFORE the hire.
    camp.coaches.push(marketService.generateCandidate(() => 0.7, {
        domain: "STRIKING", rarity: "COMMON", taken: new Set(),
    }));
    await camp.save();

    const fresh = await HomeCamp.findOne({ _id: camp._id });
    const candidateId = String(fresh.market.candidates[0]._id);

    await assert.rejects(
        () => marketService.hireCandidate(String(fighter._id), candidateId),
        (err) => {
            assert.equal(err.code, "no_slot");
            assert.equal(err.unlocked, 2);
            assert.equal(err.filled, 2);
            return true;
        }
    );
    const after = await Fighter.findById(fighter._id);
    assert.equal(after.iron, 10000, "a refused hire never charges");
});

// ── 2. A failed payment reverses the roster mutation ─────────────────────────

test("a hire whose payment fails after the mutex is won reverses the roster change (no free coach)", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 100 });
    const camp = await makeCampAtTier(fighter, 2);

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candidate = marketService.generateCandidate(() => 0.1, {
        domain: "STRIKING",
        rarity: "UNCOMMON",
        taken: new Set(),
    });
    candidate.hireFee = 1250;
    camp.market.weekIndex = wk;
    camp.market.candidates = [candidate];
    await camp.save();

    const fresh = await HomeCamp.findOne({ _id: camp._id });
    const candidateId = String(fresh.market.candidates[0]._id);

    await assert.rejects(
        () => marketService.hireCandidate(String(fighter._id), candidateId),
        (err) => err.code === "insufficient_cash"
    );

    const finalCamp = await HomeCamp.findOne({ _id: camp._id });
    assert.equal(finalCamp.coaches.length, 1, "no coach may be added when the payment failed");
    assert.equal(finalCamp.market.candidates.length, 1, "the candidate must be restored to the market, not lost");
    assert.equal(String(finalCamp.market.candidates[0]._id), candidateId, "the restored candidate must keep its original id");

    const finalFighter = await Fighter.findById(fighter._id);
    assert.equal(finalFighter.iron, 100, "an insufficient-cash hire must never charge a partial amount");
});

// ── 3. Firing down to the last coach is refused even concurrently ───────────

test("firing the second-to-last of two coaches concurrently: one succeeds, one gets last_coach, never a coachless camp", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 5000 });
    const camp = await makeCampAtTier(fighter, 2);
    camp.coaches.push({
        archetype: "STRIKING",
        name: "Second Coach",
        initials: "SC",
        rarity: "COMMON",
        wage: 150,
        isStarter: false,
    });
    await camp.save();
    const fresh = await HomeCamp.findOne({ _id: camp._id });
    assert.equal(fresh.coaches.length, 2);
    const coachA = fresh.coaches[0];
    const coachB = fresh.coaches[1];

    const results = await Promise.allSettled([
        marketService.fireCoach(String(fighter._id), String(coachA._id)),
        marketService.fireCoach(String(fighter._id), String(coachB._id)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent fire may succeed");
    assert.equal(rejected.length, 1, "the other concurrent fire must be refused");
    assert.equal(rejected[0].reason.code, "last_coach", "the camp must never be left coachless, even under a race");

    const finalCamp = await HomeCamp.findOne({ _id: camp._id });
    assert.equal(finalCamp.coaches.length, 1, "exactly one coach must remain");
});

// ── 4. Persisted candidate array is authoritative across reads ──────────────

test("a hire mutates the persisted candidate array; re-reading the market the same week does not resurrect the hired candidate", async (t) => {
    if (skip(t)) return;

    const fighter = await makeFighter({ iron: 20000 });
    await makeCampAtTier(fighter, 2);

    const before = await marketService.getMarketState(String(fighter._id));
    assert.ok(before.market.candidates.length > 0);
    const candidateId = before.market.candidates[0].candidateId;

    await marketService.hireCandidate(String(fighter._id), candidateId);

    const after = await marketService.getMarketState(String(fighter._id));
    const stillThere = after.market.candidates.some((c) => c.candidateId === candidateId);
    assert.equal(stillThere, false, "a hired candidate must never reappear in the same week market");
    assert.equal(after.market.weekIndex, before.market.weekIndex, "re-reading within the week must not reroll");
});

// ── 5. Request isolation — two fighters' camps/cash never cross-contaminate ──

test("request isolation: concurrent hires by two different fighters never touch each other cash or roster", async (t) => {
    if (skip(t)) return;

    const fighterA = await makeFighter({ iron: 10000 });
    const fighterB = await makeFighter({ iron: 10000 });
    const campA = await makeCampAtTier(fighterA, 2);
    const campB = await makeCampAtTier(fighterB, 2);

    const wk = require("../../consts/homeCampConfig").homeCampWeekIndex();
    const candA = marketService.generateCandidate(() => 0.2, { domain: "STRIKING", rarity: "COMMON", taken: new Set() });
    const candB = marketService.generateCandidate(() => 0.2, { domain: "STRIKING", rarity: "COMMON", taken: new Set() });
    candA.hireFee = 500;
    candB.hireFee = 500;
    campA.market.weekIndex = wk;
    campA.market.candidates = [candA];
    await campA.save();
    campB.market.weekIndex = wk;
    campB.market.candidates = [candB];
    await campB.save();

    const freshA = await HomeCamp.findOne({ _id: campA._id });
    const freshB = await HomeCamp.findOne({ _id: campB._id });
    const candidateIdA = String(freshA.market.candidates[0]._id);
    const candidateIdB = String(freshB.market.candidates[0]._id);

    await Promise.all([
        marketService.hireCandidate(String(fighterA._id), candidateIdA),
        marketService.hireCandidate(String(fighterB._id), candidateIdB),
    ]);

    const finalFighterA = await Fighter.findById(fighterA._id);
    const finalFighterB = await Fighter.findById(fighterB._id);
    assert.equal(finalFighterA.iron, 10000 - 500, "fighter A own hire must debit only fighter A");
    assert.equal(finalFighterB.iron, 10000 - 500, "fighter B own hire must debit only fighter B");

    const finalCampA = await HomeCamp.findOne({ _id: campA._id });
    const finalCampB = await HomeCamp.findOne({ _id: campB._id });
    assert.equal(finalCampA.coaches.length, 2);
    assert.equal(finalCampB.coaches.length, 2);
    assert.equal(finalCampA.coaches[1].name, candA.name, "fighter A roster must contain its OWN candidate, not fighter B's");
    assert.equal(finalCampB.coaches[1].name, candB.name, "fighter B roster must contain its OWN candidate, not fighter A's");
});
