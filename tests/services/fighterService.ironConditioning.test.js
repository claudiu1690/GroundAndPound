/**
 * Iron Conditioning — the CONDITIONING coach's Rank-4 perk.
 *
 * It used to double Max Stamina gain per S&C session. That could NEVER pay out: the perk
 * arrives after 60 sessions with the coach, but Max Stamina caps 20 sessions in (100 → 120
 * at +1 each), so anyone who earned it normally was already finished — and once at the cap
 * the S&C session is blocked outright, leaving the perk with nothing to act on at all.
 *
 * It now speeds up health regeneration, which gates how often you can fight and never
 * "finishes". These tests pin the properties that make it worth a $5,000 promotion.
 */
const test = require("node:test");
const assert = require("node:assert");

const fighterService = require("../../services/fighterService");
const { applyMaxStaminaSession, MAX_STAMINA_CAP } = require("../../utils/trainingSession");

const PERK = "iron_conditioning";
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
const fighter = (perks, health = 50, h = 3) => ({ health, healthLastRegenAt: hoursAgo(h), gymPerks: perks });

test("the perk speeds up health regeneration", () => {
    const plain = fighterService.reconcileHealth(fighter([]));
    const perked = fighterService.reconcileHealth(fighter([PERK]));
    assert.ok(perked.health > plain.health,
        `perked ${perked.health} must beat unperked ${plain.health}`);
});

test("without the perk, regeneration is byte-identical to before", () => {
    // 5 minutes per point, unchanged — the perk must not have moved the baseline.
    const f = fighterService.reconcileHealth(fighter([], 50, 1));
    assert.equal(f.health, 50 + 12, "1 hour at 5 min/point is exactly +12");
});

test("an unrelated perk does not speed anything up", () => {
    const plain = fighterService.reconcileHealth(fighter([]));
    const other = fighterService.reconcileHealth(fighter(["corner_confidence", "mat_returns"]));
    assert.equal(other.health, plain.health);
});

test("regeneration still stops at full health, perk or not", () => {
    for (const perks of [[], [PERK]]) {
        const f = fighterService.reconcileHealth(fighter(perks, 95, 24));
        assert.equal(f.health, 100, "cannot overheal");
    }
});

test("a fighter already at full health is untouched", () => {
    const f = fighterService.reconcileHealth(fighter([PERK], 100, 5));
    assert.equal(f.health, 100);
});

test("partial progress is preserved — the timestamp advances by consumed time only", () => {
    // Regenerating to the cap must not throw away the leftover time as though it were spent.
    const f = fighterService.reconcileHealth(fighter([PERK], 99, 10));
    assert.equal(f.health, 100);
    assert.ok(f.healthLastRegenAt.getTime() < Date.now(), "timestamp must not jump to now");
});

test("the OLD effect is gone — the perk no longer doubles Max Stamina", () => {
    const withPerk = { maxStamina: 100, gymPerks: [PERK] };
    const without = { maxStamina: 100, gymPerks: [] };
    applyMaxStaminaSession(withPerk);
    applyMaxStaminaSession(without);
    assert.equal(withPerk.maxStamina, without.maxStamina,
        "holding the perk must no longer change stamina gain");
    assert.equal(withPerk.maxStamina, 101, "+1 per session for everyone");
});

test("the reason the old effect was dead: the cap arrives long before the perk", () => {
    const { COACH_RANKS } = require("../../consts/homeCampConfig");
    const sessionsToCap = MAX_STAMINA_CAP - 100;     // +1 each
    const sessionsToEarnPerk = COACH_RANKS[4].sessions;
    assert.ok(sessionsToCap < sessionsToEarnPerk,
        `capping takes ${sessionsToCap} sessions but the perk takes ${sessionsToEarnPerk} — ` +
        "if this ever inverts, the old doubling effect would become viable again");
});
