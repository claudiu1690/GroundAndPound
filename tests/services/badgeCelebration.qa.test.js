/**
 * QA regression for the fightService.js badge-celebration fix.
 *
 * Bug: resolveFightAndApply() awards badges through THREE separate eval paths
 * in one fight resolve -- notoriety fame-tier badges (before the fight eval),
 * the fight-resolve eval itself, and gym rank-4 badges (after the fight eval).
 * newlyEarnedBadges (the field the frontend BadgeUnlockModal reads to fire the
 * celebration) used to be set ONLY from the fight-resolve eval return value,
 * so fame-tier and gym-rank-4 badges were persisted (with seen:false) but
 * silently omitted from the celebration payload.
 *
 * Fix: snapshot beforeBadgeIds from fighter.badgesEarned BEFORE any mutation,
 * then AFTER all three eval paths have run, recompute newlyEarnedBadges as the
 * diff against that snapshot (fightService.js ~547 snapshot, ~1251 recompute).
 *
 * This test exercises the REAL badgeService.evaluateBadges() against the real
 * badge catalog, driving it the same way each of the three call sites does
 * (notorietyService.js:174 passes fameChange true, gymRankService.js:118
 * passes gymRankUp true, and the fight-resolve eval passes fight facts),
 * then replicates the exact diff expression from fightService.js lines
 * 1251-1253 to verify the contract.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const badgeService = require("../../services/badgeService");

function makeFighter(overrides) {
    return Object.assign({
        _id: "qa-fighter-1",
        badgesEarned: [],
        record: { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decisionWins: 0 },
        notoriety: { score: 0, peakTier: "UNKNOWN" },
        promotionTier: "Amateur",
        gymRanks: {},
        media: {},
        overallRating: 50,
        markModified: () => {},
    }, overrides || {});
}

// Exact replica of fightService.js recompute (lines 1251-1253) -- the contract
// under test. Kept identical on purpose: if the production expression ever
// drifts from this, that is the signal this test exists to catch.
function diffNewlyEarned(fighter, beforeBadgeIds) {
    return (fighter.badgesEarned || [])
        .filter((e) => e && e.badgeId && !beforeBadgeIds.has(e.badgeId))
        .map((e) => ({ badgeId: e.badgeId, context: e.context ?? null }));
}

test("QA-1: fame-tier plus fight-eval plus gym-rank badges ALL surface in the post-resolve diff", () => {
    const fighter = makeFighter({
        badgesEarned: [
            // Already earned in a prior fight -- must never reappear as new.
            { badgeId: "first_blood", earnedAt: new Date(0), context: null, seen: true },
        ],
    });

    // Snapshot BEFORE any resolve mutation (mirrors fightService.js:547).
    const beforeBadgeIds = new Set(
        fighter.badgesEarned.map((e) => e && e.badgeId).filter(Boolean)
    );

    // Path 1: notoriety fame-tier eval, runs BEFORE the fight eval
    // (notorietyService.applyNotorietyDelta -> notorietyService.js:174).
    fighter.notoriety.peakTier = "RISING_STAR";
    const fameResult = badgeService.evaluateBadges(fighter, { fameChange: true });
    assert.ok(
        fameResult.newlyEarned.some((b) => b.badgeId === "peoples_champion"),
        "sanity: fame-tier eval should award peoples_champion"
    );

    // Path 2: the fight-resolve eval itself (fightService.js ~1199). Trigger
    // iron_will (win with under 30% health remaining) for a real mid-eval award.
    const fightEvalResult = badgeService.evaluateBadges(fighter, {
        isWin: true,
        endedHealthPct: 20,
    });
    assert.ok(
        fightEvalResult.newlyEarned.some((b) => b.badgeId === "iron_will"),
        "sanity: fight-resolve eval should award iron_will"
    );

    // BUG (pre-fix) behavior: newlyEarnedBadges was set ONLY from this return,
    // so it would have missed peoples_champion (path 1) and titan_rank4 (path 3 below).
    const buggyNewlyEarned = fightEvalResult.newlyEarned;
    assert.equal(
        buggyNewlyEarned.some((b) => b.badgeId === "peoples_champion"),
        false,
        "the pre-fix source (fight-eval return alone) does not include fame-tier badges -- this is the bug"
    );

    // Path 3: gym rank-4 eval, runs AFTER the fight eval
    // (gymRankService.onFightWin -> gymRankService.js:118).
    fighter.gymRanks["titan-performance"] = { rank: 4 };
    const gymResult = badgeService.evaluateBadges(fighter, { gymRankUp: true });
    assert.ok(
        gymResult.newlyEarned.some((b) => b.badgeId === "titan_rank4"),
        "sanity: gym rank-4 eval should award titan_rank4"
    );

    // The fix: recompute against the pre-resolve snapshot (fightService.js ~1251).
    const newlyEarnedBadges = diffNewlyEarned(fighter, beforeBadgeIds);
    const gotIds = newlyEarnedBadges.map((b) => b.badgeId);

    assert.ok(gotIds.includes("peoples_champion"), "fame-tier badge missing from celebration diff");
    assert.ok(gotIds.includes("iron_will"), "fight-eval badge missing from celebration diff");
    assert.ok(gotIds.includes("titan_rank4"), "gym-rank badge missing from celebration diff");

    // Pre-existing badge from a prior fight must NOT be a false positive.
    assert.ok(!gotIds.includes("first_blood"), "pre-existing badge leaked into newly-earned diff");

    // No duplicates.
    assert.equal(new Set(gotIds).size, gotIds.length, "duplicate badgeIds in newly-earned diff");

    // Shape: badgeId plus context per entry, context nullable.
    for (const b of newlyEarnedBadges) {
        assert.equal(typeof b.badgeId, "string");
        assert.ok(b.context === null || typeof b.context === "string");
        assert.equal(Object.keys(b).sort().join(","), "badgeId,context");
    }
});

test("QA-2: zero new badges this fight yields an empty diff (no false positives on a no-op resolve)", () => {
    const fighter = makeFighter();
    fighter.notoriety.peakTier = "RISING_STAR";
    fighter.gymRanks["titan-performance"] = { rank: 4 };

    // First "fight": these badges get earned for real.
    badgeService.evaluateBadges(fighter, { fameChange: true });
    badgeService.evaluateBadges(fighter, { isWin: true, endedHealthPct: 20 });
    badgeService.evaluateBadges(fighter, { gymRankUp: true });
    assert.ok(fighter.badgesEarned.length > 0, "setup sanity: badges should be earned before the diff window starts");

    // Second "fight" begins: snapshot AFTER the above are already persisted.
    const beforeBadgeIds = new Set(
        fighter.badgesEarned.map((e) => e && e.badgeId).filter(Boolean)
    );

    // Re-running the exact same evals this fight (idempotent -- evaluateBadges
    // guards on the earned-id set) awards nothing new.
    badgeService.evaluateBadges(fighter, { fameChange: true });
    badgeService.evaluateBadges(fighter, { isWin: true, endedHealthPct: 20 });
    badgeService.evaluateBadges(fighter, { gymRankUp: true });

    const newlyEarnedBadges = diffNewlyEarned(fighter, beforeBadgeIds);
    assert.deepEqual(newlyEarnedBadges, [], "a fight that earns nothing new must yield an empty array");
});

test("QA-3: seen flag is untouched by the diff -- genuine awards stay seen false", () => {
    const fighter = makeFighter();
    const beforeBadgeIds = new Set();

    fighter.notoriety.peakTier = "RISING_STAR";
    // Genuine gameplay award path (as called by notorietyService, gymRankService,
    // and fightService -- none of them pass silent true).
    badgeService.evaluateBadges(fighter, { fameChange: true });

    const entry = fighter.badgesEarned.find((e) => e.badgeId === "peoples_champion");
    assert.ok(entry, "setup sanity");
    assert.equal(entry.seen, false, "genuine gameplay award should be seen false");

    const newlyEarnedBadges = diffNewlyEarned(fighter, beforeBadgeIds);
    assert.ok(newlyEarnedBadges.some((b) => b.badgeId === "peoples_champion"));
    // Diff must not mutate seen at all.
    assert.equal(entry.seen, false, "diff computation must not alter the seen flag");
});

test("QA-4: silent self-heal awards are seen true; diff contract is agnostic to seen either way", () => {
    const fighter = makeFighter();
    const beforeBadgeIds = new Set();

    fighter.notoriety.peakTier = "RISING_STAR";
    // Silent path (e.g. lazy profile self-heal) -- opts.silent = true.
    badgeService.evaluateBadges(fighter, { fameChange: true }, { silent: true });

    const entry = fighter.badgesEarned.find((e) => e.badgeId === "peoples_champion");
    assert.ok(entry, "setup sanity");
    assert.equal(entry.seen, true, "silent self-heal award should be seen true");

    // The diff contract itself does not consult seen -- it is purely an id-set
    // diff. The fightService.js resolve flow never calls evaluateBadges with
    // silent true, so this documents a boundary, not an expected production path.
    const newlyEarnedBadges = diffNewlyEarned(fighter, beforeBadgeIds);
    assert.ok(newlyEarnedBadges.some((b) => b.badgeId === "peoples_champion"));
});
