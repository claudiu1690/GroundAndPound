/**
 * Unit tests for the Octagon Gazette composer.
 * Stubs Mongoose models so we can exercise the eligibility + template engine
 * without a DB connection.
 *
 * Run: node scripts/testGazette.js
 */

// ── Mock the models BEFORE requiring the service ─────────────────────────────
const Module = require("module");
const origResolve = Module._resolveFilename;
const stubs = {};
function stub(path, value) {
    stubs[require("path").resolve(__dirname, "..", path) + ".js"] = value;
}

stub("models/fighterModel", { findById: () => Promise.resolve(null) });
stub("models/fightModel", {
    findOne: () => ({
        populate: function () { return this; },
        sort:     function () { return this; },
        lean:     () => Promise.resolve(global.__nextFight ?? null),
    }),
});
stub("models/mainEventModel", {
    findOne: () => ({
        sort: function () { return this; },
        lean: () => Promise.resolve(global.__nextCard ?? null),
    }),
});

const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
    const fullPath = origResolve.call(this, request, parent);
    if (stubs[fullPath]) return stubs[fullPath];
    return origLoad.call(this, request, parent, ...rest);
};

// ── Now require the service ──────────────────────────────────────────────────
const { composeGazette } = require("../services/gazetteService");
const { makeGazetteRng, fnv1a } = require("../utils/gazetteRng");

let pass = 0, fail = 0, failed = [];
function assert(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; failed.push({ label, actual, expected }); console.log(`  ❌ ${label}`); console.log(`     actual: ${JSON.stringify(actual)}`); console.log(`     expected: ${JSON.stringify(expected)}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }
function mkFighter(overrides = {}) {
    return {
        _id: "fighter-1",
        firstName: "Jake", lastName: "Torres",
        promotionTier: "Regional Pro",
        winStreak: 0,
        consecutiveLosses: 0,
        record: { wins: 1, losses: 0, draws: 0, koWins: 0, subWins: 0 },
        ranking: { rank: null, fightsInTier: 1 },
        notoriety: { score: 100, peakTier: "Unknown" },
        gazette: { lastShownDate: null, lastNotorietyLogged: 0, rankBeforeLastFight: null, tierBeforeLastFight: null, fameTierBeforeLastLogin: null },
        mentalResetRequired: false,
        ...overrides,
    };
}

// ── RNG tests ────────────────────────────────────────────────────────────────
section("Deterministic RNG");
const r1 = makeGazetteRng("2026-05-12", "abc123");
const r2 = makeGazetteRng("2026-05-12", "abc123");
assert("Same seed → same first roll",  r1.next(), r2.next());
const r3 = makeGazetteRng("2026-05-13", "abc123");
const v1 = makeGazetteRng("2026-05-12", "abc123").next();
const v3 = r3.next();
assert("Different date → different roll", v1 !== v3, true);

const r4 = makeGazetteRng("2026-05-12", "abc123");
const picks1 = [r4.pick([1,2,3,4,5]), r4.pick([1,2,3,4,5]), r4.pick([1,2,3,4,5])];
const r5 = makeGazetteRng("2026-05-12", "abc123");
const picks2 = [r5.pick([1,2,3,4,5]), r5.pick([1,2,3,4,5]), r5.pick([1,2,3,4,5])];
assert("Deterministic picks repeat", picks1, picks2);
assert("Empty array pick returns null", r4.pick([]), null);
assert("FNV-1a is deterministic", fnv1a("hello"), fnv1a("hello"));

// ── Composer: spotlight fallback when no fight history ────────────────────────
section("Composer — fallbacks");
(async () => {
    global.__nextFight = null;
    global.__nextCard = null;
    const f = mkFighter({ record: { wins: 1, losses: 0, draws: 0 } });
    const out = await composeGazette(f);
    assert("Spotlight fallback when no triggers", out.stories[0]?.type, "spotlight");

    // ── Mental reset overrides everything ──
    global.__nextFight = null;
    const fmr = mkFighter({ mentalResetRequired: true, consecutiveLosses: 3 });
    const outMr = await composeGazette(fmr);
    assert("Mental reset is lead", outMr.stories[0]?.type, "mental_reset_required");
    assert("Mental reset zone is lead", outMr.stories[0]?.zone, "lead");

    // ── Last fight win KO ──
    global.__nextFight = {
        outcome: "KO/TKO",
        opponentId: { name: "Darius Vance", fixedRank: 8 },
        opponentRankAtFight: 8,
        finishRound: 2,
        rounds: ["r1","r2"],
        offerType: "Even",
    };
    const fwko = mkFighter({ winStreak: 1, record: { wins: 2, losses: 0, draws: 0 } });
    const outKo = await composeGazette(fwko);
    assert("Last fight KO renders as last_fight type", outKo.stories[0]?.type, "last_fight");
    assert("KO headline mentions Round",
        outKo.stories[0]?.headline?.includes("ROUND") || outKo.stories[0]?.headline?.includes("KO") || outKo.stories[0]?.headline?.includes("KNOCKOUT") || outKo.stories[0]?.headline?.includes("LIGHTS") || outKo.stories[0]?.headline?.includes("CANVAS") || outKo.stories[0]?.headline?.includes("STATEMENT"),
        true);

    // ── First Loss (standalone) ──
    global.__nextFight = {
        outcome: "Loss (decision)",
        opponentId: { name: "Marcus Bell", fixedRank: 12 },
        opponentRankAtFight: 12,
        finishRound: null,
        rounds: ["r1","r2","r3"],
        offerType: "Hard",
    };
    const ffl = mkFighter({ winStreak: 0, consecutiveLosses: 1, record: { wins: 4, losses: 1, draws: 0 } });
    const outFl = await composeGazette(ffl);
    assert("First loss is lead", outFl.stories[0]?.type, "first_loss");

    // ── First Loss in Title (composite) ──
    global.__nextFight = {
        outcome: "Loss (decision)",
        opponentId: { name: "Marcus Bell", fixedRank: 1 },
        opponentRankAtFight: 1,
        finishRound: null,
        rounds: ["r1","r2","r3"],
        offerType: "TitleShot",
    };
    const fflt = mkFighter({ winStreak: 0, consecutiveLosses: 1, record: { wins: 4, losses: 1, draws: 0 } });
    const outFlt = await composeGazette(fflt);
    assert("First loss in title is lead", outFlt.stories[0]?.type, "first_loss_in_title");

    // ── Title win ──
    global.__nextFight = {
        outcome: "KO/TKO",
        opponentId: { name: "Victor Cruz", fixedRank: 1 },
        opponentRankAtFight: 1,
        finishRound: 3,
        rounds: ["r1","r2","r3"],
        offerType: "TitleShot",
    };
    const ftw = mkFighter({ winStreak: 1, record: { wins: 5, losses: 0, draws: 0 } });
    const outTw = await composeGazette(ftw);
    assert("Title fight win is lead", outTw.stories[0]?.type, "title_fight");

    // ── Auto-promotion ──
    global.__nextFight = {
        outcome: "Decision (unanimous)",
        opponentId: { name: "Jake Pruitt", fixedRank: 20 },
        opponentRankAtFight: 20,
        finishRound: null,
        rounds: ["r1","r2","r3"],
        offerType: "Even",
    };
    const fap = mkFighter({
        record: { wins: 5, losses: 1, draws: 0 },
        promotionTier: "Regional Pro",
        gazette: { ...mkFighter().gazette, tierBeforeLastFight: "Amateur" },
    });
    const outAp = await composeGazette(fap);
    assert("Auto-promotion is lead", outAp.stories[0]?.type, "auto_promotion");

    // ── Rank entry ──
    global.__nextFight = {
        outcome: "Decision (unanimous)",
        opponentId: { name: "Random NPC", fixedRank: 28 },
        opponentRankAtFight: 28,
        finishRound: null,
        rounds: ["r1","r2","r3"],
        offerType: "Even",
    };
    const fre = mkFighter({
        record: { wins: 2, losses: 1, draws: 0 },
        ranking: { rank: 30, fightsInTier: 3, entryRecordAtFight3: "2-1" },
        gazette: { ...mkFighter().gazette, rankBeforeLastFight: null, tierBeforeLastFight: "Regional Pro" },
    });
    const outRe = await composeGazette(fre);
    assert("Rank entry is lead", outRe.stories[0]?.type, "rank_entry");

    // ── Rank jump (≥5) ──
    global.__nextFight = {
        outcome: "KO/TKO",
        opponentId: { name: "Mid NPC", fixedRank: 10 },
        opponentRankAtFight: 10,
        finishRound: 2,
        rounds: ["r1","r2"],
        offerType: "Hard",
    };
    const frj = mkFighter({
        winStreak: 1,
        record: { wins: 6, losses: 1, draws: 0 },
        ranking: { rank: 13, fightsInTier: 8 },
        gazette: { ...mkFighter().gazette, rankBeforeLastFight: 18, tierBeforeLastFight: "Regional Pro" },
    });
    const outRj = await composeGazette(frj);
    // Could be rank_jump lead or composite — rank_jump beats last_fight in priority
    assert("Rank jump is lead", outRj.stories[0]?.type, "rank_jump");

    // ── Win streak milestone ──
    global.__nextFight = {
        outcome: "KO/TKO",
        opponentId: { name: "NPC", fixedRank: 12 },
        opponentRankAtFight: 12,
        finishRound: 1,
        rounds: ["r1"],
        offerType: "Even",
    };
    const fws = mkFighter({
        winStreak: 5,
        record: { wins: 5, losses: 0, draws: 0 },
        ranking: { rank: 10, fightsInTier: 5 },
        gazette: { ...mkFighter().gazette, rankBeforeLastFight: 11, tierBeforeLastFight: "Regional Pro" },
    });
    const outWs = await composeGazette(fws);
    assert("Win streak (5) is lead", outWs.stories[0]?.type, "win_streak");

    // ── Notoriety delta in secondary ──
    global.__nextFight = {
        outcome: "Decision (unanimous)",
        opponentId: { name: "NPC", fixedRank: 12 },
        opponentRankAtFight: 12,
        finishRound: null,
        rounds: ["r1","r2","r3"],
        offerType: "Even",
    };
    const fnd = mkFighter({
        winStreak: 1,
        record: { wins: 3, losses: 0, draws: 0 },
        ranking: { rank: 14, fightsInTier: 3 },
        notoriety: { score: 200, peakTier: "Prospect" },
        gazette: { ...mkFighter().gazette, lastNotorietyLogged: 100, rankBeforeLastFight: 14, tierBeforeLastFight: "Regional Pro" },
    });
    const outNd = await composeGazette(fnd);
    const hasNotoriety = outNd.stories.some((s) => s.type === "notoriety_gained" && s.zone !== "lead");
    assert("Notoriety gained appears in secondary/filler", hasNotoriety, true);

    // ── Deterministic stories: same fighter same date = same output ──
    global.__nextFight = {
        outcome: "KO/TKO",
        opponentId: { name: "NPC", fixedRank: 8 },
        opponentRankAtFight: 8,
        finishRound: 2,
        rounds: ["r1","r2"],
        offerType: "Even",
    };
    const fdet = mkFighter({ winStreak: 1, record: { wins: 3, losses: 0, draws: 0 } });
    const o1 = await composeGazette(fdet);
    const o2 = await composeGazette(fdet);
    assert("Same fighter+date = same headlines",
        o1.stories.map((s) => s.headline),
        o2.stories.map((s) => s.headline));

    console.log("\n" + "=".repeat(50));
    console.log(`Results: ${pass} passed, ${fail} failed`);
    console.log("=".repeat(50));
    if (fail > 0) {
        failed.forEach((f) => console.log(`  - ${f.label}`));
        process.exit(1);
    } else {
        console.log("\n✅ All gazette tests passed.");
        process.exit(0);
    }
})();
