const { test } = require("node:test");
const assert = require("node:assert");

const { computeDp, applyDpAndDivision } = require("../../services/pvpDpService");
const { DP, divisionFloor, bracketTier } = require("../../consts/pvpConfig");

// ── bracketTier: bonus only when fighting UP (defender higher OVR) ───────────
test("bracketTier rewards fighting UP only", () => {
    // attacker OVR, defender OVR
    assert.strictEqual(bracketTier(30, 38), "plus10");   // up 8  → +10%
    assert.strictEqual(bracketTier(30, 45), "plus25");   // up 15 → +25%
    assert.strictEqual(bracketTier(30, 30), "none");     // even  → none
    assert.strictEqual(bracketTier(30, 33), "none");     // up 3 (below 6) → none
    assert.strictEqual(bracketTier(30, 55), "none");     // up 25 (beyond window) → none
    // Fighting DOWN must NEVER grant a bonus (the bug this guards against).
    assert.strictEqual(bracketTier(38, 30), "none");     // down 8
    assert.strictEqual(bracketTier(45, 30), "none");     // down 15
    assert.strictEqual(bracketTier(60, 16), "none");     // down 44
});

// ── computeDp: base cases ───────────────────────────────────────────────────

test("win base = +120 with no modifiers", () => {
    const { dpChange, breakdown } = computeDp({ isWin: true, isAttacker: true, method: "decision" });
    assert.strictEqual(dpChange, 120);
    assert.strictEqual(breakdown.base, 120);
    assert.strictEqual(breakdown.beltHolderBonus, 0);
    assert.strictEqual(breakdown.rivalryBonus, 0);
    assert.strictEqual(breakdown.bracketBonus, 0);
    assert.strictEqual(breakdown.streakMultiplier, 1);
    assert.strictEqual(breakdown.repeatPenalty, 1);
});

test("attacker loss base = -55", () => {
    const { dpChange } = computeDp({ isWin: false, isAttacker: true, method: "decision" });
    assert.strictEqual(dpChange, -55);
});

test("defender loss base = -28", () => {
    const { dpChange } = computeDp({ isWin: false, isAttacker: false, method: "decision" });
    assert.strictEqual(dpChange, -28);
});

test("draw = 0 regardless of side", () => {
    assert.strictEqual(computeDp({ isDraw: true, isAttacker: true }).dpChange, 0);
    assert.strictEqual(computeDp({ isDraw: true, isAttacker: false }).dpChange, 0);
});

// ── computeDp: ordered modifiers (belt → rivalry → bracket → twist → streak → repeat)

test("belt holder bonus adds +50 flat", () => {
    const { dpChange, breakdown } = computeDp({ isWin: true, isBeltHolderFight: true });
    assert.strictEqual(breakdown.beltHolderBonus, 50);
    assert.strictEqual(dpChange, 170); // 120 + 50
});

test("rivalry resolved bonus adds +25 flat", () => {
    const { dpChange, breakdown } = computeDp({ isWin: true, isRivalryResolved: true });
    assert.strictEqual(breakdown.rivalryBonus, 25);
    assert.strictEqual(dpChange, 145); // 120 + 25
});

test("bracket plus10 multiplies the running subtotal after flats", () => {
    // base 120 + belt 50 = 170, +10% = 17 → 187
    const { dpChange, breakdown } = computeDp({ isWin: true, isBeltHolderFight: true, bracketTier: "plus10" });
    assert.strictEqual(breakdown.bracketBonus, 17);
    assert.strictEqual(dpChange, 187);
});

test("bracket plus25 on base alone", () => {
    // 120 + 25% = 30 → 150
    const { dpChange, breakdown } = computeDp({ isWin: true, bracketTier: "plus25" });
    assert.strictEqual(breakdown.bracketBonus, 30);
    assert.strictEqual(dpChange, 150);
});

test("streak multiplier applies at threshold 3", () => {
    // 120 * 1.25 = 150
    const at = computeDp({ isWin: true, attackerStreak: 3 });
    assert.strictEqual(at.breakdown.streakMultiplier, 1.25);
    assert.strictEqual(at.dpChange, 150);
    // below threshold → no multiplier
    const below = computeDp({ isWin: true, attackerStreak: 2 });
    assert.strictEqual(below.breakdown.streakMultiplier, 1);
    assert.strictEqual(below.dpChange, 120);
});

test("repeat penalty: 2nd fight ×0.5, 3rd+ ×0.25", () => {
    const second = computeDp({ isWin: true, repeatCount: 1 });
    assert.strictEqual(second.breakdown.repeatPenalty, 0.5);
    assert.strictEqual(second.dpChange, 60); // 120 * 0.5

    const third = computeDp({ isWin: true, repeatCount: 2 });
    assert.strictEqual(third.breakdown.repeatPenalty, 0.25);
    assert.strictEqual(third.dpChange, 30); // 120 * 0.25
});

test("full ordered stack belt→rivalry→bracket→streak→repeat", () => {
    // base 120 + belt 50 + rivalry 25 = 195
    // bracket plus25: +round(195*.25)=49 → 244
    // streak ×1.25 → round(305) = 305
    // repeat 2nd ×0.5 → round(152.5) = 153
    const { dpChange } = computeDp({
        isWin: true,
        isBeltHolderFight: true,
        isRivalryResolved: true,
        bracketTier: "plus25",
        attackerStreak: 5,
        repeatCount: 1,
    });
    assert.strictEqual(dpChange, 153);
});

// ── computeDp: twist ────────────────────────────────────────────────────────

test("twist applies to matching method only and sets twistApplied", () => {
    // blood_sport: ko/submission +25%
    const ko = computeDp({ isWin: true, method: "ko", twist: "blood_sport" });
    assert.strictEqual(ko.twistApplied, true);
    assert.strictEqual(ko.dpChange, 150); // 120 * 1.25

    const dec = computeDp({ isWin: true, method: "decision", twist: "blood_sport" });
    assert.strictEqual(dec.twistApplied, false);
    assert.strictEqual(dec.dpChange, 120);
});

test("iron_circuit twist is a no-op", () => {
    const { dpChange, twistApplied } = computeDp({ isWin: true, method: "ko", twist: "iron_circuit" });
    assert.strictEqual(twistApplied, false);
    assert.strictEqual(dpChange, 120);
});

test("breakdown.twistBonus surfaces the twist contribution without changing dpChange", () => {
    // blood_sport ko: 120 * 1.25 = 150, so the twist's additive contribution is 30.
    const ko = computeDp({ isWin: true, method: "ko", twist: "blood_sport" });
    assert.strictEqual(ko.dpChange, 150);
    assert.strictEqual(ko.breakdown.twistBonus, 30);

    // Non-matching method (decision) — twist does not apply, twistBonus stays 0.
    const dec = computeDp({ isWin: true, method: "decision", twist: "blood_sport" });
    assert.strictEqual(dec.dpChange, 120);
    assert.strictEqual(dec.breakdown.twistBonus, 0);

    // No twist (iron_circuit) — twistBonus is 0, dpChange unchanged.
    const plain = computeDp({ isWin: true, method: "ko", twist: "iron_circuit" });
    assert.strictEqual(plain.dpChange, 120);
    assert.strictEqual(plain.breakdown.twistBonus, 0);

    // Loss branch returns before the twist slot — twistBonus is 0.
    const loss = computeDp({ isWin: false, isAttacker: true, method: "ko", twist: "blood_sport" });
    assert.strictEqual(loss.breakdown.twistBonus, 0);
});

test("the_contenders twist lowers streak threshold (still 3, no-op vs default)", () => {
    const { dpChange } = computeDp({ isWin: true, attackerStreak: 3, twist: "the_contenders" });
    assert.strictEqual(dpChange, 150); // streak applies at 3
});

// ── computeDp: catch-up ×2 (New Player Experience) ──────────────────────────

test("catch-up doubles a plain win and sets breakdown.catchUpMultiplier", () => {
    const { dpChange, breakdown } = computeDp({ isWin: true, catchUpActive: true });
    assert.strictEqual(breakdown.catchUpMultiplier, 2);
    assert.strictEqual(dpChange, 240); // 120 * 2
});

test("catch-up applies AFTER repeat penalty (last win step)", () => {
    // base 120, repeat 2nd ×0.5 = 60, then catch-up ×2 = 120.
    const { dpChange, breakdown } = computeDp({ isWin: true, repeatCount: 1, catchUpActive: true });
    assert.strictEqual(breakdown.repeatPenalty, 0.5);
    assert.strictEqual(breakdown.catchUpMultiplier, 2);
    assert.strictEqual(dpChange, 120);
});

test("catch-up inactive leaves catchUpMultiplier at 1 and dp unchanged", () => {
    const { dpChange, breakdown } = computeDp({ isWin: true, catchUpActive: false });
    assert.strictEqual(breakdown.catchUpMultiplier, 1);
    assert.strictEqual(dpChange, 120);
});

test("catch-up never affects a loss or draw (gains-only)", () => {
    assert.strictEqual(computeDp({ isWin: false, isAttacker: true, catchUpActive: true }).dpChange, -55);
    assert.strictEqual(computeDp({ isDraw: true, catchUpActive: true }).dpChange, 0);
});

// ── computeDp: clamps ───────────────────────────────────────────────────────

test("MIN_WIN_GAIN: a win never grants less than 1", () => {
    // 120 * 0.25 (3rd repeat) = 30 already > 1; force a tiny value via repeat on a base.
    // Construct: no flats, repeat 3rd → 30; still >1. Use a contrived low: confirm clamp floor.
    const { dpChange } = computeDp({ isWin: true, repeatCount: 5 });
    assert.ok(dpChange >= DP.MIN_WIN_GAIN);
    assert.strictEqual(dpChange, 30);
});

test("MAX_LOSS clamps attacker loss to -100 (here -55 within bound)", () => {
    const { dpChange } = computeDp({ isWin: false, isAttacker: true });
    assert.ok(dpChange >= DP.MAX_LOSS);
    assert.strictEqual(dpChange, -55);
});

test("loss skips all positive modifiers", () => {
    const { dpChange, breakdown } = computeDp({
        isWin: false,
        isAttacker: true,
        isBeltHolderFight: true,
        isRivalryResolved: true,
        bracketTier: "plus25",
        attackerStreak: 10,
    });
    assert.strictEqual(dpChange, -55);
    assert.strictEqual(breakdown.beltHolderBonus, 0);
    assert.strictEqual(breakdown.bracketBonus, 0);
});

// ── applyDpAndDivision: defender never gains ────────────────────────────────

test("defender never gains DP — attacker-loss yields defender change 0 (caller passes 0)", () => {
    // Per contract, a successful DEFENSE gives the defender 0. The orchestrator passes
    // dpChange=0 in that case; applyDpAndDivision must leave dp untouched.
    const record = { dp: 800, division: "contender", peakDp: 800, promotionShield: 0 };
    const res = applyDpAndDivision(record, 0, { isWin: false });
    assert.strictEqual(record.dp, 800);
    assert.strictEqual(res.dpAfter, 800);
    assert.strictEqual(record.division, "contender");
});

// ── applyDpAndDivision: floor on loss ───────────────────────────────────────

test("DP floor on loss — cannot drop below current division floor", () => {
    const record = { dp: 320, division: "contender", peakDp: 1000, promotionShield: 0 };
    applyDpAndDivision(record, -55, { isWin: false }); // 320-55=265 < 300 floor
    assert.strictEqual(record.dp, 300); // clamped to contender floor
    assert.strictEqual(record.division, "contender"); // no mid-season demotion
});

test("loss above floor reduces dp normally", () => {
    const record = { dp: 900, division: "contender", peakDp: 900, promotionShield: 0 };
    applyDpAndDivision(record, -55, { isWin: false });
    assert.strictEqual(record.dp, 845);
});

// ── applyDpAndDivision: promotion sets to floor (no carry) + shield ──────────

test("promotion sets dp to new division floor (no carry) and shield=3", () => {
    // contender promotes at 1200. dp 1180 + 150 = 1330 >= 1200 → promote to challenger (floor 1200)
    const record = { dp: 1180, division: "contender", peakDp: 1180, promotionShield: 0 };
    const res = applyDpAndDivision(record, 150, { isWin: true });
    assert.strictEqual(res.promoted, true);
    assert.strictEqual(record.division, "challenger");
    assert.strictEqual(record.dp, divisionFloor("challenger")); // 1200, no carry of the +130 overshoot
    assert.strictEqual(record.promotionShield, 3);
});

test("win below promoteAt does not promote", () => {
    const record = { dp: 500, division: "contender", peakDp: 500, promotionShield: 0 };
    const res = applyDpAndDivision(record, 120, { isWin: true });
    assert.strictEqual(res.promoted, false);
    assert.strictEqual(record.dp, 620);
    assert.strictEqual(record.division, "contender");
});

test("shield decrements every fight, win or loss", () => {
    const record = { dp: 1300, division: "challenger", peakDp: 1300, promotionShield: 3 };
    applyDpAndDivision(record, 120, { isWin: true });
    assert.strictEqual(record.promotionShield, 2);
    applyDpAndDivision(record, -55, { isWin: false });
    assert.strictEqual(record.promotionShield, 1);
});

test("peakDp tracks high-water mark", () => {
    const record = { dp: 500, division: "contender", peakDp: 500, promotionShield: 0 };
    applyDpAndDivision(record, 120, { isWin: true }); // 620
    assert.strictEqual(record.peakDp, 620);
    applyDpAndDivision(record, -55, { isWin: false }); // 565 — peak stays 620
    assert.strictEqual(record.peakDp, 620);
});
