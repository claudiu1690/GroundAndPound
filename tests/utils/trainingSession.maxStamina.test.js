/**
 * B3 extraction guard — utils/trainingSession.applyMaxStaminaSession.
 *
 * This helper was lifted verbatim out of trainingService's `raisesMaxStamina` loop so the gym
 * S&C session and the camp's sc_plus drill share one implementation. These tests pin the exact
 * behaviour the gym had BEFORE the extraction; tests/services/trainingService.batch.test.js
 * must keep passing UNMODIFIED alongside them.
 *
 * Run with: node --test tests/utils/trainingSession.maxStamina.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const { applyMaxStaminaSession, MAX_STAMINA_CAP } = require("../../utils/trainingSession");

const fighter = (maxStamina, perks = []) => ({ maxStamina, gymPerks: perks });

test("base gain is +1 per session", () => {
    const f = fighter(100);
    assert.deepEqual(applyMaxStaminaSession(f), { gained: 1, capHit: false });
    assert.equal(f.maxStamina, 101);
});

test("iron_conditioning NO LONGER touches stamina gain — it is a health-regen perk now", () => {
    // The doubling was removed 2026-07-28: the perk takes 60 sessions with the Conditioning
    // coach to earn, but Max Stamina caps 20 sessions in, so it could never pay out. It now
    // speeds up health regeneration instead (fighterService.reconcileHealth), which gates how
    // often you can fight and never finishes.
    const f = fighter(100, ["iron_conditioning"]);
    assert.deepEqual(applyMaxStaminaSession(f), { gained: 1, capHit: false });
    assert.equal(f.maxStamina, 101, "everyone gains +1, perk or not");
});

test("an unrelated perk does not change the gain", () => {
    const f = fighter(100, ["strength_reserve", "corner_confidence"]);
    assert.equal(applyMaxStaminaSession(f).gained, 1);
});

test("a missing maxStamina defaults to 100 (legacy docs)", () => {
    const f = { gymPerks: [] };
    applyMaxStaminaSession(f);
    assert.equal(f.maxStamina, 101);
});

test("the cap is 120 and is never overshot", () => {
    const f = fighter(119, ["iron_conditioning"]);
    assert.deepEqual(applyMaxStaminaSession(f), { gained: 1, capHit: false });
    assert.equal(f.maxStamina, MAX_STAMINA_CAP);
});

test("at the cap the session gains nothing and reports capHit", () => {
    const f = fighter(120);
    assert.deepEqual(applyMaxStaminaSession(f), { gained: 0, capHit: true });
    assert.equal(f.maxStamina, 120);
});

test("above the cap (hand-edited doc) is left alone, never lowered", () => {
    const f = fighter(130);
    assert.deepEqual(applyMaxStaminaSession(f), { gained: 0, capHit: true });
    assert.equal(f.maxStamina, 130);
});

test("20 sessions from 100 land exactly on the cap, capHit only after it", () => {
    const f = fighter(100);
    let total = 0;
    let firstCapHitAt = null;
    for (let i = 1; i <= 25; i++) {
        const { gained, capHit } = applyMaxStaminaSession(f);
        total += gained;
        if (capHit && firstCapHitAt === null) firstCapHitAt = i;
    }
    assert.equal(f.maxStamina, 120);
    assert.equal(total, 20);
    assert.equal(firstCapHitAt, 21);
});
