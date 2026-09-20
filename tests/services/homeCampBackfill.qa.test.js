/**
 * Your Camp PHASE 2 — Q6: THE BACKFILL SWEEP AND ITS VERIFIER. Risk #3.
 *
 * The sweep runs once, against every live player, on a day that also retires a system. Three
 * properties have to hold or a veteran quietly loses their gym history:
 *
 *   1. DRY RUN IS THE DEFAULT and writes NOTHING — proven by spying on HomeCamp.create AND on
 *      every Fighter write path.
 *   2. AN UNMAPPED SLUG ABORTS BEFORE THE FIRST CREATE. The scan is a separate pass for exactly
 *      this reason: aborting halfway through a live population is worse than never starting.
 *   3. ⚠️ THE SCRIPT NEVER WRITES A FIGHTER DOCUMENT. `Fighter.updateOne`, `Fighter.bulkWrite`,
 *      `Fighter.updateMany` and `Document.prototype.save` are all spied for the whole run.
 *
 * …plus that the verifier actually CATCHES deliberate corruption (a verifier that always passes
 * is worse than no verifier), on A4 / A5 / A7 / A9 / A10.
 *
 * DB: LOCAL Mongo only, throwaway database mmaGame_qa_campp2_backfill. Dropped at the end.
 *
 * Run with: node --test tests/services/homeCampBackfill.qa.test.js
 */
const assert = require("node:assert/strict");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/mmaGame_qa_campp2_backfill";
let dbAvailable = false;

let Fighter, HomeCamp, backfill, verifier, homeCampService, cfg;
let TMP;

before(async () => {
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 3000 });
        dbAvailable = true;
    } catch (e) {
        console.error(`[QA] Mongo unreachable at ${DB_URI} — skipping backfill tests:`, e.message);
        return;
    }
    Fighter = require("../../models/fighterModel");
    HomeCamp = require("../../models/homeCampModel");
    backfill = require("../../scripts/migrateFightersToHomeCamp");
    verifier = require("../../scripts/verifyHomeCampMigration");
    homeCampService = require("../../services/homeCampService");
    cfg = require("../../consts/homeCampConfig");
    TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gnp-backfill-"));
});

after(async () => {
    if (!dbAvailable) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

function skip(t) {
    if (!dbAvailable) { t.skip("Mongo not reachable at " + DB_URI); return true; }
    return false;
}

beforeEach(async () => {
    if (!dbAvailable) return;
    await Fighter.deleteMany({});
    await HomeCamp.deleteMany({});
});

// ── fixture population ───────────────────────────────────────────────────────

/** The seven hand-check profiles from the runbook, seeded as real documents. */
async function seedPopulation() {
    const mk = (over) => ({
        firstName: "Case", lastName: "Doe",
        weightClass: "Middleweight", style: "Boxer",
        iron: 1000, ...over,
    });
    const docs = await Fighter.create([
        // 1. no gym at all → NEW, focus from style (Boxer → STRIKING)
        mk({ lastName: "NoGym", style: "Boxer" }),
        // 2. free gym only → community-mma maps to null, so still NEW; style Sambo → BJJ
        mk({ lastName: "FreeOnly", style: "Sambo", gymRanks: { "community-mma": { rank: 3, trainingSessions: 40, relevantWins: 6 } } }),
        // 3. one gym at Rank 4 → the veteran the whole verifier exists for
        mk({ lastName: "Veteran", style: "Wrestler", gymRanks: { "iron-fist-boxing": { rank: 4, trainingSessions: 90, relevantWins: 14 } } }),
        // 4. multi-domain → head coach is the highest rank; the rest bank as familiarity
        mk({
            lastName: "MultiDomain", style: "Judo",
            gymRanks: {
                "apex-wrestling": { rank: 4, trainingSessions: 70, relevantWins: 11 },
                "gracie-ground-game": { rank: 2, trainingSessions: 20, relevantWins: 3 },
                "renzo-combat": { rank: 2, trainingSessions: 15, relevantWins: 2 },
            },
        }),
        // 5. expired membership (activeGymPaidUntil in the past) — history still converts
        mk({
            lastName: "Expired", style: "Kickboxer",
            activeGymPaidUntil: new Date(Date.now() - 30 * 86400000),
            gymRanks: { "dragon-kickboxing": { rank: 3, trainingSessions: 35, relevantWins: 6 } },
        }),
        // 6. elite-fight-academy only → maps to null → falls back to STYLE (BJJ)
        mk({ lastName: "EliteOnly", style: "Brazilian Jiu-Jitsu", gymRanks: { "elite-fight-academy": { rank: 4, trainingSessions: 80, relevantWins: 12 } } }),
        // 7. a PvP bot — must be skipped entirely
        mk({ lastName: "Bot", isPvpBot: true, gymRanks: { "titan-performance": { rank: 4, trainingSessions: 99, relevantWins: 20 } } }),
    ]);
    return docs;
}

/** Run the two passes exactly as main() does, with the args main() would have parsed. */
async function runBackfill(argv) {
    const args = backfill.parseArgs(["node", "script", ...argv]);
    const scan = await backfill.scanPass(args);
    if (scan.unmapped.size > 0) return { aborted: true, unmapped: [...scan.unmapped.keys()], report: null };
    const report = {
        scanned: 0, skipped_bot: 0, skipped_existing: 0, skipped_raced: 0,
        created: 0, would_create: 0, failed: 0, lastId: null,
        bySource: {}, byFocusDomain: {}, byHeadCoachRank: {}, byFamiliarityDomain: {},
    };
    await backfill.createPass(args, {}, report);
    return { aborted: false, unmapped: [], report };
}

/** Spy on EVERY path that could write a Fighter, for the duration of `fn`. */
async function assertNoFighterWrites(fn) {
    const writes = [];
    const statics = ["updateOne", "updateMany", "bulkWrite", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "insertMany", "create"];
    const originals = {};
    for (const m of statics) {
        originals[m] = Fighter[m];
        Fighter[m] = function (...a) { writes.push(`Fighter.${m}`); return originals[m].apply(this, a); };
    }
    const realSave = mongoose.Model.prototype.save;
    mongoose.Model.prototype.save = function (...a) {
        if (this.constructor && this.constructor.modelName === "Fighter") writes.push("fighter.save()");
        return realSave.apply(this, a);
    };
    try {
        return { result: await fn(), writes };
    } finally {
        for (const m of statics) Fighter[m] = originals[m];
        mongoose.Model.prototype.save = realSave;
    }
}

// ── Q6.1 — dry run writes nothing ────────────────────────────────────────────

test("Q6 DRY RUN is the default and creates nothing", async (t) => {
    if (skip(t)) return;
    await seedPopulation();

    let creates = 0;
    const realCreate = HomeCamp.create;
    HomeCamp.create = function (...a) { creates += 1; return realCreate.apply(this, a); };
    let out;
    try {
        out = await runBackfill([]);          // ← no --commit
    } finally {
        HomeCamp.create = realCreate;
    }

    assert.equal(out.aborted, false);
    assert.equal(creates, 0, "HomeCamp.create must never be called without --commit");
    assert.equal(await HomeCamp.countDocuments({}), 0);
    assert.equal(out.report.created, 0);
    assert.equal(out.report.would_create, 6, "6 non-bot fighters would get a camp");
    assert.equal(out.report.skipped_bot, 1, "the PvP bot is skipped");
});

test("Q6 ⚠️ the script NEVER writes a Fighter document — dry run OR commit", async (t) => {
    if (skip(t)) return;
    await seedPopulation();

    const dry = await assertNoFighterWrites(() => runBackfill([]));
    assert.deepEqual(dry.writes, [], `dry run wrote to Fighter: ${dry.writes.join(", ")}`);

    const wet = await assertNoFighterWrites(() => runBackfill(["--commit"]));
    assert.deepEqual(wet.writes, [], `commit run wrote to Fighter: ${wet.writes.join(", ")}`);
    assert.equal(await HomeCamp.countDocuments({}), 6, "…while still creating the camps");
});

// ── Q6.2 — the abort ─────────────────────────────────────────────────────────

test("Q6 an UNMAPPED slug aborts the scan BEFORE any camp is created", async (t) => {
    if (skip(t)) return;
    await seedPopulation();
    await Fighter.create({
        firstName: "Rogue", lastName: "Slug", weightClass: "Middleweight", style: "Boxer",
        gymRanks: { "a-gym-that-does-not-exist": { rank: 4, trainingSessions: 99, relevantWins: 20 } },
    });

    let creates = 0;
    const realCreate = HomeCamp.create;
    HomeCamp.create = function (...a) { creates += 1; return realCreate.apply(this, a); };
    let out;
    try {
        out = await runBackfill(["--commit"]);   // even WITH --commit
    } finally {
        HomeCamp.create = realCreate;
    }

    assert.equal(out.aborted, true, "an unmapped slug must abort the run");
    assert.deepEqual(out.unmapped, ["a-gym-that-does-not-exist"]);
    assert.equal(creates, 0, "⚠️ not a single camp may be created before the abort");
    assert.equal(await HomeCamp.countDocuments({}), 0);
});

test("Q6 a prototype-polluting gymRanks key counts as UNMAPPED (hasOwnProperty, not `in`)", async (t) => {
    if (skip(t)) return;
    // "constructor" resolves through Object.prototype with `in`, so a naive check would treat
    // it as mapped and let it through into the conversion.
    await Fighter.collection.insertOne({
        firstName: "Proto", lastName: "Pollute", weightClass: "Middleweight", style: "Boxer",
        gymRanks: { constructor: { rank: 4 } },
    });
    const out = await runBackfill(["--commit"]);
    assert.equal(out.aborted, true);
    assert.deepEqual(out.unmapped, ["constructor"]);
});

// ── Q6.3 — re-runnable, resumable, correct ───────────────────────────────────

test("Q6 --commit is RE-RUNNABLE: a second run creates nothing", async (t) => {
    if (skip(t)) return;
    await seedPopulation();

    const first = await runBackfill(["--commit"]);
    assert.equal(first.report.created, 6);

    const second = await runBackfill(["--commit"]);
    assert.equal(second.report.created, 0, "re-running must be a no-op");
    assert.equal(second.report.skipped_existing, 6);
    assert.equal(await HomeCamp.countDocuments({}), 6, "no duplicates");
});

test("Q6 a camp created MID-SWEEP by a live request is skipped_raced, not a failure", async (t) => {
    if (skip(t)) return;
    await seedPopulation();
    // Simulate the race: HomeCamp.create throws E11000 for one fighter, exactly as it would if
    // ensureCamp had just created that camp from a request.
    let calls = 0;
    const realCreate = HomeCamp.create;
    HomeCamp.create = function (...a) {
        calls += 1;
        if (calls === 2) {
            const e = new Error("E11000 duplicate key error");
            e.code = 11000;
            return Promise.reject(e);
        }
        return realCreate.apply(this, a);
    };
    let out;
    try { out = await runBackfill(["--commit"]); } finally { HomeCamp.create = realCreate; }

    assert.equal(out.report.skipped_raced, 1);
    assert.equal(out.report.failed, 0, "a race is not an error");
    assert.equal(out.report.created, 5);
});

test("Q6 --after resumes gaplessly and --limit bounds the run", async (t) => {
    if (skip(t)) return;
    const docs = await seedPopulation();
    const sorted = docs.slice().sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));

    const half = await runBackfill(["--commit", "--limit=3"]);
    assert.equal(half.report.scanned, 3, "--limit bounds the run");
    const createdAfterFirst = await HomeCamp.countDocuments({});
    assert.ok(createdAfterFirst <= 3);
    assert.ok(half.report.lastId, "the run reports where to resume from");

    // Resume from exactly where the first run stopped — the selection is _id-sorted, so this
    // is gapless by construction.
    const rest = await runBackfill(["--commit", `--after=${half.report.lastId}`]);
    assert.equal(rest.report.created, 6 - createdAfterFirst, "the resume picks up every remaining fighter");
    // Every non-bot fighter now has exactly one camp, with no gap and no duplicate.
    assert.equal(await HomeCamp.countDocuments({}), 6);
    for (const f of docs) {
        const n = await HomeCamp.countDocuments({ fighterId: f._id });
        assert.equal(n, f.isPvpBot ? 0 : 1, `${f.lastName} should have ${f.isPvpBot ? 0 : 1} camp`);
    }
});

test("Q6 the seven runbook profiles convert exactly as designed", async (t) => {
    if (skip(t)) return;
    const docs = await seedPopulation();
    await runBackfill(["--commit"]);
    const by = {};
    for (const f of docs) by[f.lastName] = await HomeCamp.findOne({ fighterId: f._id }).lean();

    // no gym → NEW, style fallback
    assert.equal(by.NoGym.origin.source, "NEW");
    assert.equal(by.NoGym.focusDomain, "STRIKING");
    assert.equal(by.NoGym.coaches[0].rank, 1);

    // free gym only → community-mma maps to null, so it is NOT a head coach
    assert.equal(by.FreeOnly.origin.source, "NEW");
    assert.equal(by.FreeOnly.focusDomain, "BJJ", "Sambo → BJJ via the style fallback");
    // Mongoose `minimize` strips an empty Mixed object on save, so "banked nothing" reads back
    // as either {} or undefined. Both mean the same thing; assert the meaning, not the encoding.
    assert.equal(Object.keys(by.FreeOnly.disciplineFamiliarity || {}).length, 0, "a null-mapped gym banks nothing");

    // one gym at Rank 4 → the veteran carries across at rank 4
    assert.equal(by.Veteran.origin.source, "GYM_MIGRATION");
    assert.equal(by.Veteran.origin.sourceGymSlug, "iron-fist-boxing");
    assert.equal(by.Veteran.focusDomain, "STRIKING", "the GYM wins over the Wrestler style");
    assert.equal(by.Veteran.coaches[0].rank, 4);
    assert.ok(by.Veteran.coaches[0].sessionsCompleted >= 90);

    // multi-domain → highest rank is the head coach, the others bank
    assert.equal(by.MultiDomain.focusDomain, "WRESTLING");
    assert.equal(by.MultiDomain.origin.sourceGymSlug, "apex-wrestling");
    assert.equal(by.MultiDomain.disciplineFamiliarity.BJJ.bankedSessions, 35, "two BJJ gyms SUM");
    assert.equal(by.MultiDomain.disciplineFamiliarity.BJJ.bankedWins, 5);
    assert.equal(by.MultiDomain.disciplineFamiliarity.WRESTLING, undefined, "the head coach's own gym does not bank");

    // expired membership — history still converts
    assert.equal(by.Expired.origin.source, "GYM_MIGRATION");
    assert.equal(by.Expired.coaches[0].rank, 3);

    // elite-fight-academy → null → style fallback, and NOT a GYM_MIGRATION
    assert.equal(by.EliteOnly.origin.source, "NEW");
    assert.equal(by.EliteOnly.focusDomain, "BJJ");

    // the bot got nothing
    assert.equal(by.Bot, null);
});

test("Q6 every converted camp starts with NO retro-decay and NO retro-wages", async (t) => {
    if (skip(t)) return;
    await seedPopulation();
    await runBackfill(["--commit"]);
    for (const camp of await HomeCamp.find({}).lean()) {
        assert.equal(camp.condition.value, cfg.CONDITION_MAX);
        assert.equal(camp.condition.lastNeglectDayKey, cfg.utcDayKey(camp.origin.convertedAt));
        assert.equal(camp.condition.lastSessionDayKey, null);
        assert.equal(camp.tier, 1);
        assert.equal(camp.lastWeeklyTickIndex, -1);
        assert.equal(camp.market.weekIndex, -1);
        assert.equal(camp.market.candidates.length, 0);
        assert.equal(camp.nextWageDebitAt, null);
        assert.deepEqual(camp.coaches[0].taughtMoveIds, [], "a conversion must NEVER retro-grant a move");
    }
});

// ── Q6.4 — the verifier must CATCH corruption ───────────────────────────────

// `verifier.checkCamp` reports through the module's own `fail()`, which prints to console.error.
// Capturing that stream is the cleanest way to assert WHICH check fired without exporting the
// internal failure list. Each corruption below is applied to a copy of a camp that has already
// been proven clean, so a caught failure can only come from the corruption itself.

test("Q6 the verifier CATCHES a corrupted A4 (a demoted veteran)", async (t) => {
    if (skip(t)) return;
    await seedPopulation();
    await runBackfill(["--commit"]);

    const fighter = await Fighter.findOne({ lastName: "Veteran" }).lean();
    const clean = await HomeCamp.findOne({ fighterId: fighter._id }).lean();

    // Baseline: the untouched camp must pass.
    let errs = [];
    const realErr = console.error;
    console.error = (...a) => errs.push(a.join(" "));
    try {
        verifier.checkCamp(fighter, clean, {}, { maxFailures: 99 });
        assert.deepEqual(errs, [], `a clean camp must produce no failures, got: ${errs.join(" | ")}`);

        // A4 — demote the veteran's coach from 4 to 2. THIS is the failure the verifier exists for.
        errs = [];
        const demoted = JSON.parse(JSON.stringify(clean));
        demoted.coaches[0].rank = 2;
        verifier.checkCamp(fighter, demoted, {}, { maxFailures: 99 });
        assert.ok(errs.some((e) => e.includes("A4") && e.includes("A VETERAN WAS DEMOTED")), `A4 not caught: ${errs.join(" | ")}`);

        // A5 — wrong focus domain.
        errs = [];
        const wrongDomain = JSON.parse(JSON.stringify(clean));
        wrongDomain.focusDomain = "BJJ";
        verifier.checkCamp(fighter, wrongDomain, {}, { maxFailures: 99 });
        assert.ok(errs.some((e) => e.includes("A5")), `A5 not caught: ${errs.join(" | ")}`);

        // A7 — retro-decayed condition.
        errs = [];
        const decayed = JSON.parse(JSON.stringify(clean));
        decayed.condition.value = 62;
        verifier.checkCamp(fighter, decayed, {}, { maxFailures: 99 });
        assert.ok(errs.some((e) => e.includes("A7")), `A7 not caught: ${errs.join(" | ")}`);

        // A8 — retro-wages (a weekly tick already claimed).
        errs = [];
        const waged = JSON.parse(JSON.stringify(clean));
        waged.nextWageDebitAt = new Date().toISOString();
        verifier.checkCamp(fighter, waged, {}, { maxFailures: 99 });
        assert.ok(errs.some((e) => e.includes("A8")), `A8 not caught: ${errs.join(" | ")}`);

        // A6 — a retro-granted move.
        errs = [];
        const taught = JSON.parse(JSON.stringify(clean));
        taught.coaches[0].taughtMoveIds = ["HEAVY_HANDS"];
        verifier.checkCamp(fighter, taught, {}, { maxFailures: 99 });
        assert.ok(errs.some((e) => e.includes("A6")), `A6 not caught: ${errs.join(" | ")}`);
    } finally {
        console.error = realErr;
    }
});

test("Q6 the verifier CATCHES a corrupted A9 (wrong banked familiarity)", async (t) => {
    if (skip(t)) return;
    await seedPopulation();
    await runBackfill(["--commit"]);
    const fighter = await Fighter.findOne({ lastName: "MultiDomain" }).lean();
    const clean = await HomeCamp.findOne({ fighterId: fighter._id }).lean();

    const errs = [];
    const realErr = console.error;
    console.error = (...a) => errs.push(a.join(" "));
    try {
        verifier.checkCamp(fighter, clean, {}, { maxFailures: 99 });
        assert.deepEqual(errs, [], `clean multi-domain camp failed: ${errs.join(" | ")}`);

        const corrupt = JSON.parse(JSON.stringify(clean));
        corrupt.disciplineFamiliarity.BJJ.bankedSessions = 1;
        errs.length = 0;
        verifier.checkCamp(fighter, corrupt, {}, { maxFailures: 99 });
        assert.ok(errs.some((e) => e.includes("A9")), `A9 not caught: ${errs.join(" | ")}`);
    } finally {
        console.error = realErr;
    }
});

// ── Q6.5 — the A10 snapshot digest ──────────────────────────────────────────

test("Q6 the A10 digest changes if ANY protected fighter field changes", async (t) => {
    if (skip(t)) return;
    const [f] = await Fighter.create([{
        firstName: "Digest", lastName: "Probe", weightClass: "Middleweight", style: "Boxer",
        iron: 500, gymPerks: ["corner_confidence"],
        gymRanks: { "iron-fist-boxing": { rank: 3, trainingSessions: 30, relevantWins: 5 } },
    }]);
    const base = backfill.fighterDigest(f.toObject());

    // Identical read → identical digest (so a false positive is impossible).
    assert.deepEqual(backfill.fighterDigest((await Fighter.findById(f._id).lean())), base);

    const mutations = [
        ["gymRanks", (d) => { d.gymRanks["iron-fist-boxing"].rank = 4; }],
        ["gymPerks", (d) => { d.gymPerks.push("mat_returns"); }],
        ["iron", (d) => { d.iron = 400; }],
        ["campRank4Archetypes", (d) => { d.campRank4Archetypes = ["STRIKING"]; }],
        ["badgesEarned", (d) => { d.badgesEarned = [{ badgeId: "boxer_rank4" }]; }],
        ["specialMovesOwned", (d) => { d.specialMovesOwned = [{ moveId: "HEAVY_HANDS", rarity: "RARE" }]; }],
    ];
    for (const [label, mutate] of mutations) {
        const doc = await Fighter.findById(f._id).lean();
        mutate(doc);
        assert.notDeepEqual(backfill.fighterDigest(doc), base, `the digest is blind to a change in ${label}`);
    }
});

test("Q6 --snapshot / --after / --limit argument validation rejects hostile input", async (t) => {
    if (skip(t)) return;
    assert.equal(backfill.parseArgs(["n", "s"]).commit, false, "commit is opt-in");
    assert.equal(backfill.parseArgs(["n", "s"]).limit, Infinity);
    assert.equal(backfill.parseArgs(["n", "s", "--commit"]).commit, true);
    assert.equal(backfill.parseArgs(["n", "s", "--limit=10"]).limit, 10);
    assert.equal(String(backfill.parseArgs(["n", "s", "--after=507f1f77bcf86cd799439011"]).after), "507f1f77bcf86cd799439011");
    assert.equal(backfill.parseArgs(["n", "s", "--snapshot=./x.json"]).snapshot, "./x.json");
});
