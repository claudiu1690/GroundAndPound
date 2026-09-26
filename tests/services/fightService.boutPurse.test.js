/**
 * Per-bout purse (GDD 7): deterministic slot multiplier on the tier signingFee plus an
 * OVR-gap bonus inside the slot window, rounded to $10. Pure function, no DB.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { boutPurse } = require("../../services/fightService");
const cfg = require("../../consts/offerBoardConfig");

test("Even at an equal OVR pays the signing fee plus half the gap bonus, rounded to 10", () => {
    assert.equal(boutPurse("Amateur", "Even", 42, 42), 510);
    assert.equal(boutPurse("National", "Even", 50, 50), 2260);
});

test("slot multipliers order Easy < Even < Hard < TitleShot", () => {
    const easy = boutPurse("Amateur", "Easy", 36, 42);
    const even = boutPurse("Amateur", "Even", 42, 42);
    const hard = boutPurse("Amateur", "Hard", 46, 42);
    const title = boutPurse("Amateur", "TitleShot", 60, 42);
    assert.ok(easy < even && even < hard && hard < title, `${easy} ${even} ${hard} ${title}`);
    assert.equal(easy, 350);
    assert.equal(hard, 720);
    assert.equal(title, 880);
});

test("a tougher opponent inside the same slot pays more, capped at the window edge", () => {
    const soft = boutPurse("National", "Hard", 52, 50);   // gap 2 = bottom of [2,6]
    const hardest = boutPurse("National", "Hard", 56, 50); // gap 6 = top
    const beyond = boutPurse("National", "Hard", 70, 50);  // clamped
    assert.equal(soft, 3080);
    assert.equal(hardest, 3230);
    assert.equal(beyond, hardest);
});

test("TitleShot takes no gap bonus and the result is always a multiple of 10", () => {
    assert.equal(boutPurse("GCS", "TitleShot", 95, 62), 12000 * cfg.OFFER_PURSE_MULT.TitleShot);
    for (const tier of ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"]) {
        for (const type of ["Easy", "Even", "Hard", "TitleShot"]) {
            assert.equal(boutPurse(tier, type, 50, 47) % cfg.OFFER_PURSE_ROUND_TO, 0);
        }
    }
});

test("unknown tier returns null; missing OVRs fall back to the bare multiplier", () => {
    assert.equal(boutPurse("Nope", "Even", 1, 1), null);
    assert.equal(boutPurse("Amateur", "Hard", null, 42), 700);
});
