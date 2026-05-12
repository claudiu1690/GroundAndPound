/**
 * Comprehensive test suite for Ranking System v1.0 + Callout v1.1.
 * No DB required — uses plain objects to exercise the service logic.
 *
 * Run: node scripts/testRankingSystem.js
 */
const rs = require("../services/rankingService");

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(label, actual, expected) {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    if (passed) {
        passCount++;
    } else {
        failCount++;
        failures.push({ label, actual, expected });
        console.log(`  ❌ ${label}`);
        console.log(`     actual:   ${JSON.stringify(actual)}`);
        console.log(`     expected: ${JSON.stringify(expected)}`);
    }
}

function section(title) {
    console.log(`\n── ${title} ──`);
}

function mkFighter(tier = "Amateur", overrides = {}) {
    return {
        promotionTier: tier,
        winsInCurrentTier: 0,
        ranking: { rank: null, fightsInTier: 0, entryRecordAtFight3: null },
        ...overrides,
    };
}

// ── ROSTER SIZES ──────────────────────────────────────────
section("Roster sizes");
assert("Amateur",        rs.tierSize("Amateur"), 31);
assert("Regional Pro",   rs.tierSize("Regional Pro"), 26);
assert("National",       rs.tierSize("National"), 21);
assert("GCS Contender",  rs.tierSize("GCS Contender"), 16);
assert("GCS",            rs.tierSize("GCS"), 11);
assert("Unknown tier",   rs.tierSize("Random"), 0);

// ── ENTRY RANKS ───────────────────────────────────────────
section("Entry ranks (per tier)");
assert("Amateur 3-0",       rs.getEntryRank("Amateur", 3), 29);
assert("Amateur 2-1",       rs.getEntryRank("Amateur", 2), 31);
assert("Amateur 1-2",       rs.getEntryRank("Amateur", 1), 31);
assert("Amateur 0-3",       rs.getEntryRank("Amateur", 0), 31);
assert("Regional Pro 3-0",  rs.getEntryRank("Regional Pro", 3), 24);
assert("Regional Pro 2-1",  rs.getEntryRank("Regional Pro", 2), 26);
assert("National 3-0",      rs.getEntryRank("National", 3), 19);
assert("GCS 3-0",           rs.getEntryRank("GCS", 3), 9);

// ── CALC DELTA ────────────────────────────────────────────
section("Rank movement");
const d = (r, p, o) => rs.calcDelta(r, p, o);
assert("Win Dec same rank",         d({isWin:true, method:"DEC"}, 10, 10), 1);
assert("Win KO same rank",          d({isWin:true, method:"KO"}, 10, 10), 2);
assert("Win Sub same rank",         d({isWin:true, method:"SUB"}, 10, 10), 2);
assert("Win Dec upset (10→5)",      d({isWin:true, method:"DEC"}, 10, 5), 3);
assert("Win KO upset (10→5)",       d({isWin:true, method:"KO"}, 10, 5), 4);
assert("Win Dec NOT upset (10→15)", d({isWin:true, method:"DEC"}, 10, 15), 1);
assert("Loss base",                 d({isLoss:true, method:"DEC"}, 10, 10), -1);
assert("Loss upset (10 vs 15)",     d({isLoss:true, method:"DEC"}, 10, 15), -2);
assert("Loss to higher rank (10→5)",d({isLoss:true, method:"DEC"}, 10, 5), -1);
assert("Loss by KO base",           d({isLoss:true, method:"KO"}, 10, 10), -1);
assert("Draw any",                  d({isDraw:true}, 10, 10), 0);
assert("PvP win no opp rank",       d({isWin:true, method:"KO"}, 10, null), 2);
assert("PvP loss no opp rank",      d({isLoss:true, method:"DEC"}, 10, null), -1);

// ── CLAMP ─────────────────────────────────────────────────
section("Rank clamping");
assert("Clamp to ceiling (Amateur)",  rs.clampRank(1, "Amateur"), 2);
assert("Clamp to ceiling (-5)",       rs.clampRank(-5, "Amateur"), 2);
assert("Clamp to floor (Amateur)",    rs.clampRank(99, "Amateur"), 31);
assert("Clamp to floor (Regional Pro)", rs.clampRank(99, "Regional Pro"), 26);
assert("Mid range stays",             rs.clampRank(15, "Amateur"), 15);
assert("Edge: ceiling exact",         rs.clampRank(2, "Amateur"), 2);
assert("Edge: floor exact",           rs.clampRank(31, "Amateur"), 31);

// ── TOP 5 / CALLOUT ELIGIBILITY ──────────────────────────
section("Title shot + callout eligibility");
assert("Top 5: null",     rs.isTopFive({ranking:{rank:null}}), false);
assert("Top 5: rank 1",   rs.isTopFive({ranking:{rank:1}}), true);
assert("Top 5: rank 5",   rs.isTopFive({ranking:{rank:5}}), true);
assert("Top 5: rank 6",   rs.isTopFive({ranking:{rank:6}}), false);
assert("Top 15: null",    rs.isCalloutEligible({ranking:{rank:null}}), false);
assert("Top 15: rank 1",  rs.isCalloutEligible({ranking:{rank:1}}), true);
assert("Top 15: rank 15", rs.isCalloutEligible({ranking:{rank:15}}), true);
assert("Top 15: rank 16", rs.isCalloutEligible({ranking:{rank:16}}), false);
assert("Top 15: rank 30", rs.isCalloutEligible({ranking:{rank:30}}), false);

// ── UNRANKED PHASE (fights 1-2) ───────────────────────────
section("Unranked phase");
const f1 = mkFighter("Amateur");
rs.updatePlayerRank(f1, {isWin:true, method:"DEC", opponentRank:20});
assert("After F1 rank still null", f1.ranking.rank, null);
assert("After F1 fightsInTier=1",  f1.ranking.fightsInTier, 1);
rs.updatePlayerRank(f1, {isWin:true, method:"DEC", opponentRank:20});
assert("After F2 rank still null", f1.ranking.rank, null);
assert("After F2 fightsInTier=2",  f1.ranking.fightsInTier, 2);

// ── ENTRY ON FIGHT 3 ──────────────────────────────────────
section("Entry on fight 3");
const f2 = mkFighter("Amateur", {winsInCurrentTier:3});
f2.ranking.fightsInTier = 2;
rs.updatePlayerRank(f2, {isWin:true, method:"KO", opponentRank:28});
assert("3-0 entry rank",     f2.ranking.rank, 29);
assert("3-0 entry record",   f2.ranking.entryRecordAtFight3, "3-0");

const f3 = mkFighter("Amateur", {winsInCurrentTier:2});
f3.ranking.fightsInTier = 2;
rs.updatePlayerRank(f3, {isLoss:true, method:"DEC", opponentRank:25});
// 3rd fight, won 2/3 so far → entry rank = bottom (31)
assert("2-1 entry rank",     f3.ranking.rank, 31);
assert("2-1 entry record",   f3.ranking.entryRecordAtFight3, "2-1");

const f4 = mkFighter("Regional Pro", {winsInCurrentTier:3});
f4.ranking.fightsInTier = 2;
rs.updatePlayerRank(f4, {isWin:true, method:"KO", opponentRank:23});
assert("RP 3-0 entry rank",  f4.ranking.rank, 24);

// ── CAREER ARC (spec section 5.3) ─────────────────────────
section("Career arc — Amateur full progression");
const career = mkFighter("Amateur");
// Fights 1-3: all wins (entry at 3-0)
for (let i = 0; i < 3; i++) {
    career.winsInCurrentTier = i + 1;
    rs.updatePlayerRank(career, {isWin:true, method:"KO", opponentRank:30});
}
assert("Entry at rank 29 (3-0)", career.ranking.rank, 29);
// Fight 4: W KO vs #30 (lower-ranked = no upset, just finish bonus)
rs.updatePlayerRank(career, {isWin:true, method:"KO", opponentRank:30});
assert("F4 → 27",              career.ranking.rank, 27);
// Fight 5: W Dec vs #24 (upset by 3)
rs.updatePlayerRank(career, {isWin:true, method:"DEC", opponentRank:24});
assert("F5 → 24",              career.ranking.rank, 24);
// Fight 6: L Dec vs #25 (upset loss = -2)
rs.updatePlayerRank(career, {isLoss:true, method:"DEC", opponentRank:25});
assert("F6 → 26",              career.ranking.rank, 26);
// Fight 7: W KO vs #10 (finish+upset = +4)
rs.updatePlayerRank(career, {isWin:true, method:"KO", opponentRank:10});
assert("F7 → 22",              career.ranking.rank, 22);

// Test ceiling
const ceiling = mkFighter("Amateur");
ceiling.ranking.rank = 4;
ceiling.ranking.fightsInTier = 10;
rs.updatePlayerRank(ceiling, {isWin:true, method:"KO", opponentRank:1});
assert("Ceiling: can't go below rank 2", ceiling.ranking.rank, 2);

// Test floor
const floor = mkFighter("Amateur");
floor.ranking.rank = 30;
floor.ranking.fightsInTier = 10;
rs.updatePlayerRank(floor, {isLoss:true, method:"KO", opponentRank:31});
assert("Floor: can't go beyond last", floor.ranking.rank, 31);

// ── PROMOTION RESET ───────────────────────────────────────
section("Reset on promotion");
const promoted = mkFighter("Regional Pro", {winsInCurrentTier:5});
promoted.ranking = { rank: 8, fightsInTier: 12, entryRecordAtFight3: "3-0" };
rs.resetRankingForNewTier(promoted);
assert("Reset: rank null",    promoted.ranking.rank, null);
assert("Reset: fights=0",     promoted.ranking.fightsInTier, 0);
assert("Reset: entry null",   promoted.ranking.entryRecordAtFight3, null);

// ── BUILD FIGHT RESULT FROM OUTCOME ────────────────────────
section("Outcome → fight result");
assert("KO/TKO win",       rs.buildFightResultFromOutcome("KO/TKO"),              { isWin:true, isLoss:false, isDraw:false, method:"KO" });
assert("Submission win",   rs.buildFightResultFromOutcome("Submission"),          { isWin:true, isLoss:false, isDraw:false, method:"SUB" });
assert("Dec unanimous",    rs.buildFightResultFromOutcome("Decision (unanimous)"), { isWin:true, isLoss:false, isDraw:false, method:"DEC" });
assert("Dec split",        rs.buildFightResultFromOutcome("Decision (split)"),     { isWin:true, isLoss:false, isDraw:false, method:"DEC" });
assert("Draw",             rs.buildFightResultFromOutcome("Draw"),                 { isWin:false, isLoss:false, isDraw:true, method:"DEC" });
assert("Loss KO",          rs.buildFightResultFromOutcome("Loss (KO/TKO)"),        { isWin:false, isLoss:true, isDraw:false, method:"KO" });
assert("Loss Sub",         rs.buildFightResultFromOutcome("Loss (submission)"),    { isWin:false, isLoss:true, isDraw:false, method:"SUB" });
assert("Loss decision",    rs.buildFightResultFromOutcome("Loss (decision)"),      { isWin:false, isLoss:true, isDraw:false, method:"DEC" });

// ── EDGE CASES ────────────────────────────────────────────
section("Edge cases");

// Player at rank 2 wins title shot — rank should be reset to null AFTER updatePlayerRank but
// the rank update itself fires. Simulate the order.
const titleShot = mkFighter("Regional Pro", {winsInCurrentTier:5});
titleShot.ranking = { rank: 2, fightsInTier: 15, entryRecordAtFight3: "3-0" };
rs.updatePlayerRank(titleShot, {isWin:true, method:"KO", opponentRank:1});
assert("Title win: rank movement clamps to 2",  titleShot.ranking.rank, 2);
rs.resetRankingForNewTier(titleShot);
assert("After reset on title win: rank null",   titleShot.ranking.rank, null);

// What if updatePlayerRank is called WITHOUT a ranking subdoc?
const noRanking = { promotionTier: "Amateur", winsInCurrentTier: 0 };
rs.updatePlayerRank(noRanking, {isWin:true, method:"DEC", opponentRank:20});
assert("No ranking subdoc → initialised",     noRanking.ranking.fightsInTier, 1);

// Player on an unknown tier — should no-op
const unknownTier = { promotionTier: "Unknown", winsInCurrentTier: 0, ranking: { rank: null, fightsInTier: 0 } };
rs.updatePlayerRank(unknownTier, {isWin:true, method:"DEC", opponentRank:5});
assert("Unknown tier: no-op",                 unknownTier.ranking.fightsInTier, 0);

// Multiple fights past entry — verify fightsInTier keeps counting
const counting = mkFighter("Amateur", {winsInCurrentTier:3});
counting.ranking.fightsInTier = 2;
rs.updatePlayerRank(counting, {isWin:true, method:"KO", opponentRank:28});  // F3 entry
rs.updatePlayerRank(counting, {isWin:true, method:"KO", opponentRank:25});  // F4
rs.updatePlayerRank(counting, {isLoss:true, method:"DEC", opponentRank:20}); // F5
assert("FightsInTier keeps counting",         counting.ranking.fightsInTier, 5);

// Title-shot eligibility composite (the title shot gate logic)
section("Composite title-shot gates");
const gateCheck = (fighter) => ({
    winsMet:    (fighter.winsInCurrentTier ?? 0) >= 3,
    cooldownOk: (fighter.titleShotCooldown ?? 0) <= 0,
    rankMet:    rs.isTopFive(fighter),
});

const elig1 = { winsInCurrentTier: 3, titleShotCooldown: 0, ranking: { rank: 3 } };
assert("Eligible: wins+rank+cooldown OK", gateCheck(elig1), { winsMet: true, cooldownOk: true, rankMet: true });

const elig2 = { winsInCurrentTier: 2, titleShotCooldown: 0, ranking: { rank: 3 } };
assert("Not eligible: too few wins",      gateCheck(elig2).winsMet, false);

const elig3 = { winsInCurrentTier: 3, titleShotCooldown: 0, ranking: { rank: 10 } };
assert("Not eligible: rank too low",      gateCheck(elig3).rankMet, false);

const elig4 = { winsInCurrentTier: 3, titleShotCooldown: 2, ranking: { rank: 3 } };
assert("Not eligible: cooldown active",   gateCheck(elig4).cooldownOk, false);

// ── DISPLAY RANK SHIFT ────────────────────────────────────
section("Display rank — player insertion shifts NPCs below");
const dr = rs.displayRankForNpc;
// Player unranked: NPCs show their real rank
assert("Unranked: NPC 5 → 5",            dr(5, null), 5);
assert("Unranked: NPC 1 (champ) → 1",    dr(1, null), 1);
// Player at rank 15 in their tier
assert("Player 15, NPC 1 (champ) → 1",   dr(1, 15), 1);   // champion never shifted
assert("Player 15, NPC 5 → 5",           dr(5, 15), 5);   // above player, no shift
assert("Player 15, NPC 14 → 14",         dr(14, 15), 14); // just above, no shift
assert("Player 15, NPC 15 → 16",         dr(15, 15), 16); // collision, NPC shifts
assert("Player 15, NPC 16 → 17",         dr(16, 15), 17); // below, shifts
assert("Player 15, NPC 31 → 32",         dr(31, 15), 32); // last NPC shifts to 32
// Player at rank 2 (top, can't reach 1)
assert("Player 2, NPC 1 → 1",            dr(1, 2), 1);
assert("Player 2, NPC 2 → 3",            dr(2, 2), 3);
assert("Player 2, NPC 31 → 32",          dr(31, 2), 32);
// Player at last rank
assert("Player 30, NPC 29 → 29",         dr(29, 30), 29);
assert("Player 30, NPC 30 → 31",         dr(30, 30), 31);

// ── SUMMARY ───────────────────────────────────────────────
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log("=".repeat(50));
if (failCount > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f.label}`));
    process.exit(1);
} else {
    console.log("\n✅ All tests passed.");
    process.exit(0);
}
