/**
 * Standalone unit check for pvpFightService.buildDefenseSummary (pure helper).
 * No DB/Redis touched — buildDefenseSummary does no I/O.
 *
 * Run: node scripts/checkDefenseSummary.js
 */
"use strict";

const assert = require("assert");
const { buildDefenseSummary } = require("../services/pvpFightService");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok  - ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL - ${name}`);
        console.error(`        ${err.message}`);
    }
}

const ZERO = {
    unreadCount: 0,
    heldCount: 0,
    lostCount: 0,
    totalDpChange: 0,
    injuries: [],
    reportFightId: null,
    reportFightKind: null,
};

function row(over = {}) {
    return {
        fightId: "f-default",
        fightAt: new Date(),
        attackerId: "a1",
        attackerName: "Test",
        youWon: true,
        method: "decision",
        dpChange: 0,
        isPlacement: false,
        noDpAtStake: false,
        injuriesSustained: [],
        ...over,
    };
}

test("empty set -> all-zero, null report", () => {
    assert.deepStrictEqual(buildDefenseSummary([]), ZERO);
});

test("non-array -> all-zero", () => {
    assert.deepStrictEqual(buildDefenseSummary(undefined), ZERO);
    assert.deepStrictEqual(buildDefenseSummary(null), ZERO);
});

test("placement-only set -> unreadCount>0, 0 held/lost, 0 DP, no injuries, report = most recent", () => {
    const results = [
        row({ fightId: "newest", isPlacement: true, youWon: false, dpChange: -5, injuriesSustained: ["cut"] }),
        row({ fightId: "older", noDpAtStake: true, youWon: true }),
    ];
    const s = buildDefenseSummary(results);
    assert.strictEqual(s.unreadCount, 2);
    assert.strictEqual(s.heldCount, 0);
    assert.strictEqual(s.lostCount, 0);
    assert.strictEqual(s.totalDpChange, 0);
    assert.deepStrictEqual(s.injuries, []);
    assert.strictEqual(s.reportFightId, "newest"); // most recent overall, no lost
    assert.strictEqual(s.reportFightKind, "pvp");
});

test("draw-only set -> counts as held, 0 lost", () => {
    const results = [
        row({ fightId: "d1", method: "draw", youWon: false }),
        row({ fightId: "d2", method: "draw", youWon: false }),
    ];
    const s = buildDefenseSummary(results);
    assert.strictEqual(s.heldCount, 2);
    assert.strictEqual(s.lostCount, 0);
    assert.strictEqual(s.totalDpChange, 0);
    assert.strictEqual(s.reportFightId, "d1"); // no lost -> most recent overall
});

test("mixed held+lost+injury -> report = most recent LOST, DP summed, distinct injuries", () => {
    const results = [
        // newest first
        row({ fightId: "held-recent", youWon: true, method: "decision" }),
        row({ fightId: "lost-recent", youWon: false, method: "ko", dpChange: -12, injuriesSustained: ["broken_nose", "cut"] }),
        row({ fightId: "held-old", youWon: true }),
        row({ fightId: "lost-old", youWon: false, method: "submission", dpChange: -8, injuriesSustained: ["cut", "rib_injury"] }),
    ];
    const s = buildDefenseSummary(results);
    assert.strictEqual(s.unreadCount, 4);
    assert.strictEqual(s.heldCount, 2);
    assert.strictEqual(s.lostCount, 2);
    assert.strictEqual(s.totalDpChange, -20); // -12 + -8
    // distinct, first-seen order across lost rows (newest-first)
    assert.deepStrictEqual(s.injuries, ["broken_nose", "cut", "rib_injury"]);
    assert.strictEqual(s.reportFightId, "lost-recent"); // first LOST in newest-first order
    assert.strictEqual(s.reportFightKind, "pvp");
});

test("placement is never counted as held/lost even when youWon false and dpChange set", () => {
    const results = [
        row({ fightId: "p1", isPlacement: true, youWon: false, method: "ko", dpChange: -30, injuriesSustained: ["cut"] }),
        row({ fightId: "real-loss", youWon: false, method: "ko", dpChange: -10, injuriesSustained: ["cut"] }),
    ];
    const s = buildDefenseSummary(results);
    assert.strictEqual(s.lostCount, 1);
    assert.strictEqual(s.totalDpChange, -10);
    assert.deepStrictEqual(s.injuries, ["cut"]);
    assert.strictEqual(s.reportFightId, "real-loss");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
