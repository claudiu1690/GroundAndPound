/**
 * Unit tests for the Octagon Gazette v2.0 persisted regeneration engine.
 *
 * Stubs Mongoose models (Fighter / Fight / Sponsorship) so we can exercise
 * regenerateGazette + the activityLogService regen trigger without a DB.
 *
 * Run: node scripts/testGazette.js
 */

// ── Mock the models BEFORE requiring the services ────────────────────────────
const Module = require("module");
const origResolve = Module._resolveFilename;
const stubs = {};
function stub(path, value) {
    stubs[require("path").resolve(__dirname, "..", path) + ".js"] = value;
}

// Holders the tests mutate per-case.
global.__savedFighter = null;   // the doc most recently passed to .save()
global.__nextFighter = null;    // doc returned by Fighter.findById
global.__nextFight = null;      // doc returned by Fight.findOne(...).lean()
global.__nextSponsorship = null;
global.__activityCreateCalls = [];

stub("models/fighterModel", {
    findById: () => Promise.resolve(global.__nextFighter),
});
stub("models/fightModel", {
    findOne: () => ({
        populate: function () { return this; },
        sort:     function () { return this; },
        lean:     () => Promise.resolve(global.__nextFight ?? null),
    }),
});
stub("models/sponsorshipModel", {
    findOne: () => ({
        sort: function () { return this; },
        lean: () => Promise.resolve(global.__nextSponsorship ?? null),
    }),
});
stub("models/activityLogModel", {
    create: (doc) => { global.__activityCreateCalls.push(doc); return Promise.resolve(doc); },
});

const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
    const fullPath = origResolve.call(this, request, parent);
    if (stubs[fullPath]) return stubs[fullPath];
    return origLoad.call(this, request, parent, ...rest);
};

// ── Now require the services under test ──────────────────────────────────────
const gazetteService = require("../services/gazetteService");
const activityLogService = require("../services/activityLogService");
const { makeGazetteRng, fnv1a } = require("../utils/gazetteRng");

let pass = 0, fail = 0, failed = [];
function assert(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; failed.push(label); console.log(`  FAIL ${label}`); console.log(`     actual:   ${JSON.stringify(actual)}`); console.log(`     expected: ${JSON.stringify(expected)}`); }
}
function assertTrue(label, cond) { assert(label, !!cond, true); }
function section(t) { console.log(`\n-- ${t} --`); }

/** Build a savable mock fighter doc (mimics a Mongoose doc enough for regen). */
function mkFighter(overrides = {}) {
    const doc = {
        _id: "fighter-1",
        firstName: "Jake", lastName: "Torres",
        promotionTier: "Regional Pro",
        overallRating: 42,
        winStreak: 0,
        consecutiveLosses: 0,
        iron: 1500,
        record: { wins: 1, losses: 0, draws: 0, koWins: 0, subWins: 0 },
        ranking: { rank: null, fightsInTier: 1 },
        notoriety: { score: 100, peakTier: "UNKNOWN" },
        energy: { current: 100, max: 100 },
        injuries: [],
        badgesEarned: [],
        gymRanks: {},
        careerTrainingSessions: 0,
        acceptedFightId: null,
        mentalResetRequired: false,
        activeGymId: null,
        nemesis: { opponentName: null, lossCount: 0 },
        pvpOnboarding: { unlocked: false },
        gazette: { issueNumber: 0 },
        ...overrides,
    };
    doc.markModified = function () {};
    doc.save = function () { global.__savedFighter = this; return Promise.resolve(this); };
    return doc;
}

async function regenWith(fighter, type = "FIGHT_WIN", fight = null, sponsorship = null) {
    global.__nextFighter = fighter;
    global.__nextFight = fight;
    global.__nextSponsorship = sponsorship;
    global.__savedFighter = null;
    await gazetteService.regenerateGazette(fighter._id, type);
    return global.__savedFighter ? global.__savedFighter.gazette : null;
}

const WIN_KO_FIGHT = {
    outcome: "KO/TKO",
    opponentId: { name: "Darius Vance" },
    opponentRankAtFight: 8,
    finishRound: 2,
    rounds: ["r1", "r2"],
    offerType: "Even",
};

(async () => {
    // ── RNG determinism (per issueNumber) ───────────────────────────────────
    section("Deterministic RNG (per issueNumber)");
    const a1 = makeGazetteRng("1", "abc123");
    const a2 = makeGazetteRng("1", "abc123");
    assert("Same (issue,fighter) -> same first roll", a1.next(), a2.next());
    const b = makeGazetteRng("2", "abc123");
    assertTrue("Different issue -> different roll",
        makeGazetteRng("1", "abc123").next() !== b.next());
    assert("FNV-1a deterministic", fnv1a("hello"), fnv1a("hello"));

    // ── issueNumber increments 0 -> 1 ───────────────────────────────────────
    section("Issue number increments");
    const f1 = mkFighter();
    const g1 = await regenWith(f1, "FIGHT_WIN", WIN_KO_FIGHT);
    assert("issueNumber 0 -> 1", g1.issueNumber, 1);
    assertTrue("updatedAt set", g1.updatedAt instanceof Date);
    assert("triggeringEventType captured", g1.triggeringEventType, "FIGHT_WIN");

    const f2 = mkFighter({ gazette: { issueNumber: 7 } });
    const g2 = await regenWith(f2, "FIGHT_WIN", WIN_KO_FIGHT);
    assert("issueNumber 7 -> 8", g2.issueNumber, 8);

    // ── Builder cardinality ─────────────────────────────────────────────────
    section("Builder cardinality");
    const fc = mkFighter({
        winStreak: 1,
        record: { wins: 2, losses: 0, draws: 0, koWins: 1, subWins: 0 },
        activeGymId: "gym-1",
        gymRanks: { ftw: { rank: 2 } },
        injuries: [{ label: "Bruised Ribs", cannotFight: true, recoveryHoursLeft: 6 }],
        careerTrainingSessions: 60,
        pvpOnboarding: { unlocked: true },
        nemesis: { opponentName: "Karl Wynn", lossCount: 1 },
    });
    const gc = await regenWith(fc, "FIGHT_WIN", WIN_KO_FIGHT, { brand: "IronWorks", rewardPerFight: 200, clause: {} });
    assert("Sidebar exactly 4", gc.sidebarItems.length, 4);
    assert("Secondary exactly 3", gc.secondaryStories.length, 3);
    assertTrue("InBrief 4..6", gc.inBrief.length >= 4 && gc.inBrief.length <= 6);
    assertTrue("Lead story present", gc.leadStory && gc.leadStory.type === "last_fight");
    assertTrue("Lead has pullQuote", gc.leadStory.pullQuote && gc.leadStory.pullQuote.text);
    assertTrue("Lead resultBand WIN", gc.leadStory.resultBand && gc.leadStory.resultBand.outcomeLabel === "WIN");
    assert("campGrade degraded to null", gc.leadStory.resultBand.campGrade, null);

    // ── Sparse early-career fighter doesn't crash, still cardinal ────────────
    section("Sparse early-career fighter");
    const fsparse = mkFighter({ gazette: { issueNumber: 0 } });
    const gs = await regenWith(fsparse, "BADGE_EARNED", null, null);
    assert("Sparse: issue 1", gs.issueNumber, 1);
    assert("Sparse: sidebar 4", gs.sidebarItems.length, 4);
    assert("Sparse: secondary 3", gs.secondaryStories.length, 3);
    assertTrue("Sparse: inBrief 4..6", gs.inBrief.length >= 4 && gs.inBrief.length <= 6);
    assertTrue("Sparse: spotlight lead fallback", gs.leadStory.type === "spotlight");

    // ── Old/legacy sparse gazette doc doesn't crash ─────────────────────────
    section("Legacy gazette doc");
    const flegacy = mkFighter({
        gazette: {
            lastShownDate: "2026-01-01", lastNotorietyLogged: 50,
            rankBeforeLastFight: null, tierBeforeLastFight: null, fameTierBeforeLastLogin: "Unknown",
            // NO issueNumber / new fields — must default cleanly.
        },
    });
    const gl = await regenWith(flegacy, "FIGHT_WIN", WIN_KO_FIGHT);
    assert("Legacy: issue defaults 0 -> 1", gl.issueNumber, 1);
    assert("Legacy: rankBeforeLastFight preserved", gl.rankBeforeLastFight, null);

    // ── Missing fighter -> silent (no throw, no save) ───────────────────────
    section("Missing fighter");
    global.__nextFighter = null;
    global.__savedFighter = null;
    let threw = false;
    try { await gazetteService.regenerateGazette("nope", "FIGHT_WIN"); }
    catch (e) { threw = true; }
    assert("Missing fighter does not throw", threw, false);
    assert("Missing fighter does not save", global.__savedFighter, null);

    // ── Never-throw when a builder throws ───────────────────────────────────
    section("Never-throw on builder error");
    const fbad = mkFighter();
    // Poison: make a field a builder reads blow up when accessed.
    Object.defineProperty(fbad, "record", { get() { throw new Error("boom"); } });
    let threw2 = false;
    try { await regenWith(fbad, "FIGHT_WIN", WIN_KO_FIGHT); }
    catch (e) { threw2 = true; }
    assert("Builder throw is swallowed", threw2, false);

    // ── activityLogService regen wiring ─────────────────────────────────────
    section("activityLogService regen triggers");
    // Allowlisted type -> regen runs (fighter saved).
    const fAllow = mkFighter();
    global.__nextFighter = fAllow;
    global.__nextFight = WIN_KO_FIGHT;
    global.__nextSponsorship = null;
    global.__savedFighter = null;
    global.__activityCreateCalls = [];
    await activityLogService.log(fAllow._id, "FIGHT_WIN", "won a fight", {});
    assert("log() wrote feed entry", global.__activityCreateCalls.length, 1);
    assertTrue("Allowlisted type regenerated (saved)", global.__savedFighter != null);

    // Non-allowlisted type -> NO regen (no save).
    const fSkip = mkFighter();
    global.__nextFighter = fSkip;
    global.__savedFighter = null;
    global.__activityCreateCalls = [];
    await activityLogService.log(fSkip._id, "pvp_draw", "a draw", {});
    assert("Non-allowlisted feed still written", global.__activityCreateCalls.length, 1);
    assert("Non-allowlisted type did NOT regenerate", global.__savedFighter, null);

    // ── Results ─────────────────────────────────────────────────────────────
    console.log("\n" + "=".repeat(50));
    console.log(`Results: ${pass} passed, ${fail} failed`);
    console.log("=".repeat(50));
    if (fail > 0) { failed.forEach((l) => console.log(`  - ${l}`)); process.exit(1); }
    console.log("\nAll gazette tests passed.");
    process.exit(0);
})();
