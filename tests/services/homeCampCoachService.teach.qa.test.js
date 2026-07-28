/**
 * Your Camp PHASE 2 — Q1: THE TEACH CHANNEL'S IDEMPOTENCY. Risk #1 in the phase.
 *
 * A rank-up that grants a move twice is the single worst failure mode here: it prints free
 * Legendary moves, it duplicates the reveal the player paid $5,000 for, and (via DUPLICATE
 * cash-outs) it mints iron. The design defends it with four separate mechanisms, and this file
 * exists to prove each one INDEPENDENTLY rather than trusting that they compose:
 *
 *   1. `taughtMoveIds` is written by THE SAME conditional `updateOne` as the rank bump, so the
 *      rank can never move without the teach record moving with it  → tests 1, 3
 *   2. `resolveTeachGrants` filters against `taughtMoveIds` BEFORE the write                → test 2
 *   3. the `taughtMoves` report array is RESET at the top of every `saveWithVersionRetry`
 *      mutator invocation, because the mutator re-runs on a VersionError                    → test 4
 *   4. the failure rollback `$pull`s only ids that were PROVABLY ABSENT beforehand          → test 3
 *
 * Also covers Q2 (teach correctness) as pure-function assertions: the rarity × rank matrix,
 * "rank 3 always teaches nothing", "a COMMON can never be positioned on a Signature", and the
 * CAMP_TEACH_CHANNEL kill switch.
 *
 * DB: LOCAL Mongo only, dedicated throwaway database mmaGame_qa_campp2_teach. Dropped at the
 * end. No HTTP server, no port touched, no Atlas.
 *
 * Run with: node --test tests/services/homeCampCoachService.teach.qa.test.js
 */
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp2_teach";
let dbAvailable = false;

let Fighter, HomeCamp, coachService, config, COACH_RANKS;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error(`[QA] Mongo unreachable at ${DB_URI} — skipping teach-channel tests:`, e.message);
        return;
    }
    Fighter = require("../../models/fighterModel");
    HomeCamp = require("../../models/homeCampModel");
    coachService = require("../../services/homeCampCoachService");
    config = require("../../config");
    ({ COACH_RANKS } = require("../../consts/homeCampConfig"));
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

// ── fixtures ─────────────────────────────────────────────────────────────────

const STRIKING_POOL = ["HEAVY_HANDS", "BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER"];

/** A coach subdoc shaped exactly like the market generates one. */
function coachDoc(over = {}) {
    return {
        archetype: "STRIKING",
        name: "Rico Vance",
        initials: "RV",
        rarity: "RARE",
        traitKey: null,
        wage: 750,
        hireFee: 3000,
        isStarter: false,
        hiredAt: new Date(),
        rank: 1,
        sessionsCompleted: 0,
        relevantWins: 0,
        morale: 100,
        exclusiveSessionKey: null,
        teachPoolMoveIds: STRIKING_POOL.slice(0, 3),   // RARE breadth = 3
        taughtMoveIds: [],
        ...over,
    };
}

let seq = 0;
/** Create a fighter + camp with one coach parked at `rank` and its requirements already met. */
async function seed({ rank = 1, iron = 100000, coach: coachOver = {}, owned = [] } = {}) {
    seq += 1;
    const next = rank + 1;
    const req = COACH_RANKS[next] || { sessions: 0, wins: 0 };
    const fighter = await Fighter.create({
        firstName: "Teach", lastName: `Case${seq}`,
        weightClass: "Middleweight", style: "Boxer",
        iron,
        specialMovesOwned: owned,
    });
    const camp = await HomeCamp.create({
        fighterId: fighter._id,
        name: `Case${seq} Camp`,
        focusDomain: "STRIKING",
        tier: 1,
        coaches: [coachDoc({
            rank,
            // Floor the counters at the NEXT rank's requirements so `reqsMet` is always true.
            sessionsCompleted: req.sessions,
            relevantWins: req.wins,
            ...coachOver,
        })],
    });
    return { fighter, camp, coachId: String(camp.coaches[0]._id) };
}

const reload = async (id) => Fighter.findById(id);
const reloadCoach = async (campId, coachId) =>
    (await HomeCamp.findById(campId)).coaches.id(coachId);

/**
 * Run `fn` with every Fighter document loaded through `Fighter.findById` carrying a patched
 * `save`. This is how the "the mutex won but the payment failed" and "another writer bumped
 * __v" paths are forced deterministically — both are otherwise unreachable from the outside,
 * and both are exactly where a half-applied teach would hide.
 */
async function withPatchedFighterSave(patchSave, fn) {
    const realFindById = Fighter.findById.bind(Fighter);
    Fighter.findById = (...args) => realFindById(...args).then((doc) => {
        if (doc) patchSave(doc);
        return doc;
    });
    try {
        return await fn();
    } finally {
        Fighter.findById = realFindById;
    }
}

// ── Q1.1 — concurrent double promote ─────────────────────────────────────────

test("Q1.1 two concurrent promotes: one 200, ONE charge, ONE grant, ONE teach record", async (t) => {
    if (skip(t)) return;
    const { fighter, camp, coachId } = await seed({ rank: 1 });
    const ironBefore = fighter.iron;

    const results = await Promise.allSettled([
        coachService.attemptPromotion(String(fighter._id), coachId),
        coachService.attemptPromotion(String(fighter._id), coachId),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    assert.equal(ok.length, 1, "exactly one promotion may succeed");
    assert.equal(failed.length, 1, "the loser of the race must fail, not double-charge");
    // Only contract error codes — a race must never surface as a 500.
    assert.ok(["requirements_not_met", "max_rank", "insufficient_cash"].includes(failed[0].reason.code),
        `unexpected race error code: ${failed[0].reason.code}`);

    const after = await reload(fighter._id);
    const cost = COACH_RANKS[2].cost;
    assert.equal(after.iron, ironBefore - cost, "exactly one promotion cost debited");

    // ONE grant of HEAVY_HANDS (slot 0 @ rank 2), at the coach's RARE rarity.
    const owned = after.specialMovesOwned.filter((o) => o.moveId === "HEAVY_HANDS");
    assert.equal(owned.length, 1, "grantOrUpgrade's one-entry-per-moveId invariant holds");
    assert.equal(owned[0].rarity, "RARE");

    // ONE teach record on the coach — this is the idempotency key, and a duplicate here would
    // be invisible today and catastrophic on the next promotion.
    const coach = await reloadCoach(camp._id, coachId);
    assert.deepEqual(coach.taughtMoveIds, ["HEAVY_HANDS"]);
    assert.equal(coach.rank, 2);

    // The winner reported exactly one taught move.
    assert.equal(ok[0].value.promotion.taughtMoves.length, 1);
    assert.equal(ok[0].value.promotion.taughtMoves[0].outcome, "NEW");
});

// ── Q1.2 — re-promote with taughtMoveIds already populated ───────────────────

test("Q1.2 re-promote after a rank reset with taughtMoveIds populated: taughtMoves [] and no move/cash movement", async (t) => {
    if (skip(t)) return;
    const { fighter, camp, coachId } = await seed({ rank: 1 });

    // First promotion: teaches HEAVY_HANDS.
    await coachService.attemptPromotion(String(fighter._id), coachId);
    const midway = await reload(fighter._id);
    const ownedBefore = JSON.parse(JSON.stringify(midway.specialMovesOwned));
    const ironBefore = midway.iron;
    assert.equal(ownedBefore.length, 1);

    // Simulate the admin-restore / rollback scenario the whole design fears: the RANK is put
    // back to 1 but taughtMoveIds SURVIVES (it is the durable record of what was handed over).
    await HomeCamp.updateOne(
        { _id: camp._id, "coaches._id": camp.coaches[0]._id },
        { $set: { "coaches.$.rank": 1 } }
    );

    const res = await coachService.attemptPromotion(String(fighter._id), coachId);

    assert.deepEqual(res.promotion.taughtMoves, [], "an already-taught move must never be granted twice");
    assert.equal(res.promotion.unlockedTeach, null);

    const after = await reload(fighter._id);
    assert.deepEqual(
        JSON.parse(JSON.stringify(after.specialMovesOwned)), ownedBefore,
        "specialMovesOwned must be byte-identical — no second grant, no upgrade, no duplicate"
    );
    // The promotion still legitimately costs cash; what must NOT happen is any teach-driven
    // cash movement (a DUPLICATE pay-out) on top of it.
    assert.equal(after.iron, ironBefore - COACH_RANKS[2].cost, "only the promotion cost moved");

    const coach = await reloadCoach(camp._id, coachId);
    assert.deepEqual(coach.taughtMoveIds, ["HEAVY_HANDS"], "no duplicate entry appended");
});

// ── Q1.3 — forced save failure rolls BOTH halves back ────────────────────────

test("Q1.3 a failed charge rolls back the rank AND taughtMoveIds, and never touches specialMovesOwned", async (t) => {
    if (skip(t)) return;
    const { fighter, camp, coachId } = await seed({ rank: 1 });
    const ironBefore = fighter.iron;

    // Force the fighter write to fail with a NON-VersionError (saveWithVersionRetry rethrows
    // those immediately), which is the exact "payment failed after the mutex won" path.
    let threw = null;
    await withPatchedFighterSave(
        (doc) => { doc.save = async () => { throw new Error("simulated disk failure"); }; },
        async () => {
            try {
                await coachService.attemptPromotion(String(fighter._id), coachId);
            } catch (e) { threw = e; }
        }
    );
    assert.ok(threw, "a failed charge must surface as an error, never a silent free promotion");

    const coach = await reloadCoach(camp._id, coachId);
    assert.equal(coach.rank, 1, "rank rolled back");
    assert.deepEqual(coach.taughtMoveIds, [], "taughtMoveIds rolled back — $pull removed exactly what $addToSet added");

    const after = await reload(fighter._id);
    assert.equal(after.iron, ironBefore, "no cash moved");
    assert.deepEqual(after.specialMovesOwned.map((o) => o.moveId), [], "no move granted");
});

test("Q1.3b the rollback $pull cannot over-remove a PREVIOUSLY taught id", async (t) => {
    if (skip(t)) return;
    // A RARE coach at rank 2 who already holds slot 0. Promoting to 4 teaches slots 1 and 2;
    // if the charge fails, the rollback must remove ONLY those two and leave slot 0 intact.
    const { fighter, camp, coachId } = await seed({
        rank: 2,
        owned: [{ moveId: "HEAVY_HANDS", rarity: "RARE", acquiredAt: new Date() }],
        coach: { taughtMoveIds: ["HEAVY_HANDS"] },
    });
    // Rank 2 → next is 3, which teaches nothing; jump the coach to 3 so the next promote is →4.
    await HomeCamp.updateOne(
        { _id: camp._id, "coaches._id": camp.coaches[0]._id },
        { $set: { "coaches.$.rank": 3, "coaches.$.sessionsCompleted": COACH_RANKS[4].sessions, "coaches.$.relevantWins": COACH_RANKS[4].wins } }
    );

    await withPatchedFighterSave(
        (doc) => { doc.save = async () => { throw new Error("simulated disk failure"); }; },
        () => coachService.attemptPromotion(String(fighter._id), coachId).catch(() => {})
    );

    const coach = await reloadCoach(camp._id, coachId);
    assert.equal(coach.rank, 3, "rank rolled back to 3");
    assert.deepEqual(coach.taughtMoveIds, ["HEAVY_HANDS"],
        "the previously-taught id survived the rollback — only provably-absent ids are pulled");
});

// ── Q1.4 — a VersionError retry must not duplicate the REPORT ───────────────

test("Q1.4 a VersionError retry re-runs the mutator without duplicating the taughtMoves report", async (t) => {
    if (skip(t)) return;
    const { fighter, coachId } = await seed({ rank: 1 });

    // Fail the FIRST save with a VersionError so saveWithVersionRetry reloads and re-runs the
    // mutator. Without the `taughtMoves = []` reset at the top of the mutator, the report would
    // come back with TWO entries for ONE grant and the client would fire two reveal modals.
    let saves = 0;
    const res = await withPatchedFighterSave(
        (doc) => {
            const realSave = doc.save.bind(doc);
            doc.save = async (...a) => {
                saves += 1;
                if (saves === 1) {
                    const err = new Error("No matching document found");
                    err.name = "VersionError";
                    throw err;
                }
                return realSave(...a);
            };
        },
        () => coachService.attemptPromotion(String(fighter._id), coachId)
    );

    assert.ok(saves >= 2, "the retry path must actually have been exercised");
    assert.equal(res.promotion.taughtMoves.length, 1, "ONE grant must report ONE taught move");
    assert.equal(res.promotion.taughtMoves[0].moveId, "HEAVY_HANDS");

    const after = await reload(fighter._id);
    assert.equal(after.specialMovesOwned.filter((o) => o.moveId === "HEAVY_HANDS").length, 1);
    assert.equal(after.iron, 100000 - COACH_RANKS[2].cost, "the cost was charged exactly once");
});

// ── Q2 — teach correctness matrix (pure) ─────────────────────────────────────

const POOLS = {
    STRIKING: ["HEAVY_HANDS", "BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER"],
    WRESTLING: ["SPRAWL_INSTINCT", "MOUNT_REAPER", "KILLER_INSTINCT"],
    BJJ: ["NEVER_TAP", "VETERAN_IQ", "IRON_RECOVERY"],
    CONDITIONING: ["GRANITE_JAW", "SECOND_WIND"],
};
const BREADTH = { COMMON: 1, UNCOMMON: 2, RARE: 3, LEGENDARY: Infinity };

function pureCoach(domain, rarity, over = {}) {
    const full = POOLS[domain];
    const n = BREADTH[rarity] === Infinity ? full.length : BREADTH[rarity];
    return {
        archetype: domain, rarity, rank: 1,
        teachPoolMoveIds: full.slice(0, n), taughtMoveIds: [],
        ...over,
    };
}

test("Q2 rank 3 NEVER teaches, for any rarity in any domain", async (t) => {
    if (skip(t)) return;
    for (const domain of Object.keys(POOLS)) {
        for (const rarity of Object.keys(BREADTH)) {
            assert.deepEqual(
                coachService.resolveTeachGrants(pureCoach(domain, rarity), 3), [],
                `${domain}/${rarity} taught something at rank 3`
            );
        }
    }
});

test("Q2 the rarity × rank matrix matches the contract exactly (4 rarities × 4 domains)", async (t) => {
    if (skip(t)) return;
    // The pool is ALREADY rarity-sliced at generation, so the whole matrix collapses to two
    // rules: rank 2 gives slot 0, rank 4 gives every remaining slot. The interesting part is
    // how the POOL LENGTH bounds it — e.g. CONDITIONING only has 2 moves, so a RARE coach there
    // reaches 1 move at rank 4 and a LEGENDARY reaches the same 1, not 3.
    const table = { COMMON: 1, UNCOMMON: 2, RARE: 3, LEGENDARY: Infinity };
    for (const domain of Object.keys(POOLS)) {
        for (const rarity of Object.keys(table)) {
            const c = pureCoach(domain, rarity);
            const n = c.teachPoolMoveIds.length;
            assert.equal(n, Math.min(table[rarity], POOLS[domain].length), `${domain}/${rarity} pool slice`);

            const r2 = coachService.resolveTeachGrants(c, 2);
            assert.equal(r2.length, Math.min(1, n), `${domain}/${rarity} @ rank 2 count`);
            if (n > 0) assert.equal(r2[0].moveId, POOLS[domain][0], "rank 2 always teaches slot 0");

            const r4 = coachService.resolveTeachGrants(c, 4);
            assert.equal(r4.length, Math.max(0, n - 1), `${domain}/${rarity} @ rank 4 count`);
            assert.deepEqual(r4.map((g) => g.moveId), c.teachPoolMoveIds.slice(1), "rank 4 teaches the rest, in pool order");
        }
    }
    // The headline asymmetry the market card is selling: a COMMON coach's rank 4 teaches NOTHING.
    assert.deepEqual(coachService.resolveTeachGrants(pureCoach("STRIKING", "COMMON"), 4), []);
});

test("Q2 a COMMON coach can NEVER be positioned on a Signature (the teach ceiling holds)", async (t) => {
    if (skip(t)) return;
    const { SPECIAL_MOVES_BY_ID, EFFECT_TYPE } = require("../../consts/specialMovesCatalog");
    for (const domain of Object.keys(POOLS)) {
        for (const rarity of ["COMMON", "UNCOMMON"]) {
            for (const rank of [2, 3, 4]) {
                for (const g of coachService.resolveTeachGrants(pureCoach(domain, rarity), rank)) {
                    const def = SPECIAL_MOVES_BY_ID[g.moveId];
                    assert.notEqual(def.effectType, EFFECT_TYPE.SIGNATURE,
                        `${rarity} coach in ${domain} reached Signature ${g.moveId} at rank ${rank}`);
                }
            }
        }
    }
});

test("Q2 the grant rarity is the COACH's rarity, floored by the move's minRarity", async (t) => {
    if (skip(t)) return;
    // A RARE Striking coach at R4 reaches BODY_SNATCHER (min COMMON) and CLINCH_KILLER (min
    // COMMON) — both must come in at RARE, which is what the hire fee bought.
    const grants = coachService.resolveTeachGrants(pureCoach("STRIKING", "RARE"), 4);
    assert.deepEqual(grants.map((g) => g.grantRarity), ["RARE", "RARE"]);
    // A LEGENDARY reaches THE_FINISHER (min RARE) — still granted at LEGENDARY, never floored down.
    const legend = coachService.resolveTeachGrants(pureCoach("STRIKING", "LEGENDARY"), 4);
    assert.deepEqual(legend.map((g) => g.moveId), ["BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER"]);
    assert.ok(legend.every((g) => g.grantRarity === "LEGENDARY"));
});

test("Q2 a stale / unknown pool id is skipped, never thrown on", async (t) => {
    if (skip(t)) return;
    const c = pureCoach("STRIKING", "RARE", { teachPoolMoveIds: ["NOT_A_REAL_MOVE", "BODY_SNATCHER", "CLINCH_KILLER"] });
    assert.deepEqual(coachService.resolveTeachGrants(c, 2), []);
    assert.deepEqual(coachService.resolveTeachGrants(c, 4).map((g) => g.moveId), ["BODY_SNATCHER", "CLINCH_KILLER"]);
});

test("Q2 resolveTeachGrants is PURE — it never mutates the coach it is handed", async (t) => {
    if (skip(t)) return;
    const c = pureCoach("STRIKING", "LEGENDARY");
    const snapshot = JSON.stringify(c);
    coachService.resolveTeachGrants(c, 2);
    coachService.resolveTeachGrants(c, 4);
    assert.equal(JSON.stringify(c), snapshot);
    // …and hands back FRESH objects, never a shared reference.
    const a = coachService.resolveTeachGrants(c, 4);
    const b = coachService.resolveTeachGrants(c, 4);
    assert.notEqual(a, b);
    assert.notEqual(a[0], b[0]);
    a[0].grantRarity = "MUTATED";
    assert.equal(coachService.resolveTeachGrants(c, 4)[0].grantRarity, "LEGENDARY");
});

// ── Q5 (teach half) — the CAMP_TEACH_CHANNEL kill switch ─────────────────────

test("Q5 CAMP_TEACH_CHANNEL off: promotions still succeed, teach nothing, and leave taughtMoveIds untouched", async (t) => {
    if (skip(t)) return;
    const { fighter, camp, coachId } = await seed({ rank: 1 });
    const ironBefore = fighter.iron;

    const real = config.features.campTeachChannel;
    config.features.campTeachChannel = false;
    let res;
    try {
        // The flag must silence the DESCRIPTION as well as the grant — a kill switch that keeps
        // advertising is worse than none at all.
        assert.deepEqual(coachService.resolveTeachGrants(pureCoach("STRIKING", "RARE"), 2), []);
        res = await coachService.attemptPromotion(String(fighter._id), coachId);
    } finally {
        config.features.campTeachChannel = real;
    }

    assert.equal(res.promotion.toRank, 2, "the promotion itself still succeeds — this is a brake, not a gate");
    assert.deepEqual(res.promotion.taughtMoves, []);
    assert.equal(res.promotion.unlockedTeach, null);

    const after = await reload(fighter._id);
    assert.equal(after.iron, ironBefore - COACH_RANKS[2].cost);
    assert.deepEqual(after.specialMovesOwned.map((o) => o.moveId), []);
    const coach = await reloadCoach(camp._id, coachId);
    assert.deepEqual(coach.taughtMoveIds, [], "no teach record written while the channel is off");
});

// ── The three-way outcome branch the reveal code must handle ────────────────

test("Q2 all three outcomes report correctly and cashAfter reflects DUPLICATE cash", async (t) => {
    if (skip(t)) return;
    const { DUPLICATE_CASH } = require("../../consts/specialMovesCatalog");
    // Rank 3 → 4 for a RARE coach teaches slots 1 (BODY_SNATCHER) and 2 (CLINCH_KILLER).
    // Own BODY_SNATCHER at COMMON  → UPGRADE to RARE.
    // Own CLINCH_KILLER at LEGENDARY → DUPLICATE (cash out).
    const { fighter, coachId } = await seed({
        rank: 3,
        owned: [
            { moveId: "BODY_SNATCHER", rarity: "COMMON", acquiredAt: new Date() },
            { moveId: "CLINCH_KILLER", rarity: "LEGENDARY", acquiredAt: new Date() },
        ],
    });
    const ironBefore = fighter.iron;

    const res = await coachService.attemptPromotion(String(fighter._id), coachId);
    const byId = Object.fromEntries(res.promotion.taughtMoves.map((m) => [m.moveId, m]));

    assert.equal(res.promotion.taughtMoves.length, 2);
    assert.equal(byId.BODY_SNATCHER.outcome, "UPGRADE");
    assert.equal(byId.BODY_SNATCHER.fromRarity, "COMMON");
    assert.equal(byId.BODY_SNATCHER.toRarity, "RARE");
    assert.equal(byId.CLINCH_KILLER.outcome, "DUPLICATE");
    assert.equal(byId.CLINCH_KILLER.cashAwarded, DUPLICATE_CASH.RARE);

    const cost = COACH_RANKS[4].cost;
    const expected = ironBefore - cost + DUPLICATE_CASH.RARE;
    const after = await reload(fighter._id);
    assert.equal(after.iron, expected, "persisted balance");
    assert.equal(res.promotion.cashAfter, expected, "cashAfter is read AFTER the duplicate cash-out");
    // Charge-before-teach: the duplicate pay-out must not be what funded the promotion.
    assert.ok(ironBefore >= cost, "fixture must be able to afford the promotion without the duplicate cash");

    // An UPGRADE is applied in place — still one entry, now at the coach's rarity.
    const bs = after.specialMovesOwned.filter((o) => o.moveId === "BODY_SNATCHER");
    assert.equal(bs.length, 1);
    assert.equal(bs[0].rarity, "RARE");
    // A DUPLICATE never lowers what you own.
    assert.equal(after.specialMovesOwned.find((o) => o.moveId === "CLINCH_KILLER").rarity, "LEGENDARY");
});
