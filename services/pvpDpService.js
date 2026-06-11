/**
 * Ground & Pound — PVP Division Points (DP) engine.
 *
 * PURE and unit-tested (tests/services/pvpDp.test.js). This is the heart of the
 * Proving Ground; it has NO DB / Redis / fighter dependencies so it can be reasoned
 * about and tested in isolation.
 *
 * Two responsibilities:
 *   1. computeDp(...)          → the per-fight DP change + breakdown (ordered modifiers + clamps).
 *   2. applyDpAndDivision(...) → mutate a PVPRecord with the change, handle promotion / floor /
 *                                shield (this one reads record state, still no I/O).
 */

const {
    DP,
    DIVISIONS,
    DIVISION_KEYS,
    TWISTS,
    divisionForDp,
    divisionFloor,
    divisionMeta,
    nextDivision,
} = require("../consts/pvpConfig");

/**
 * Compute the DP change for one side of a PVP fight.
 *
 * Ordered algorithm (contract §2 pvpDpService / §DP CALC). Modifiers apply to the
 * WIN branch only (attacker). Losses skip every positive modifier; draws are 0.
 *
 *   1. base                     win +120 / loss -55 (attacker) -28 (defender) / draw 0
 *   2. beltHolderBonus          +50 flat   (win & defender is belt holder)
 *   3. rivalryBonus             +25 flat   (win & this is the rivalry-resolving 3rd win)
 *   4. bracketBonus             +10% / +25% of the running subtotal (win & bracket != none)
 *   5. twist                    *(1+pct)   (win & twist applies to this method) — folded into val,
 *                                            surfaced via twistApplied/twistName (no breakdown slot)
 *   6. streakMultiplier         *1.25      (win & attackerStreak >= twist.streakFrom ?? 3)
 *   7. repeatPenalty            *0.5 (2nd) / *0.25 (3rd+) vs same opp this ISO week
 *   8. clamps                   win → max(1, val); loss → max(-100, val)
 *
 * The DP floor on a loss (max(divisionFloor, dp+change)) is applied by the CALLER
 * (applyDpAndDivision) because it needs the current division.
 *
 * @returns {{ dpChange:number, twistApplied:boolean, breakdown:{
 *   base, rivalryBonus, beltHolderBonus, bracketBonus, streakMultiplier, repeatPenalty } }}
 */
function computeDp({
    isWin = false,
    isDraw = false,
    isAttacker = true,
    method = "decision",
    attackerStreak = 0,
    isBeltHolderFight = false,
    isRivalryResolved = false,
    bracketTier = "none",
    twist = "iron_circuit",
    repeatCount = 0,
} = {}) {
    const breakdown = {
        base: 0,
        rivalryBonus: 0,
        beltHolderBonus: 0,
        bracketBonus: 0,
        streakMultiplier: 1,
        repeatPenalty: 1,
    };

    // ── 1. base ──────────────────────────────────────────────────────────────
    if (isDraw) {
        breakdown.base = 0;
        return { dpChange: 0, twistApplied: false, breakdown };
    }

    let base;
    if (isWin) {
        base = DP.WIN_BASE; // +120
    } else {
        base = isAttacker ? DP.LOSS_ATTACKER : DP.LOSS_DEFENDER; // -55 / -28
    }
    breakdown.base = base;

    // ── Loss branch: no positive modifiers, just the MAX_LOSS clamp. ─────────
    if (!isWin) {
        const clamped = Math.max(DP.MAX_LOSS, base);
        return { dpChange: clamped, twistApplied: false, breakdown };
    }

    // ── Win branch: ordered modifiers on a running `val`. ────────────────────
    let val = base;

    // 2. belt holder (flat)
    if (isBeltHolderFight) {
        breakdown.beltHolderBonus = DP.BELT_BONUS;
        val += DP.BELT_BONUS;
    }

    // 3. rivalry resolved (flat)
    if (isRivalryResolved) {
        breakdown.rivalryBonus = DP.RIVALRY_BONUS;
        val += DP.RIVALRY_BONUS;
    }

    // 4. bracket (% of running subtotal AFTER flat bonuses)
    if (bracketTier && bracketTier !== "none") {
        const pct = bracketTier === "plus25" ? DP.BRACKET_25_PCT : DP.BRACKET_10_PCT;
        const bonus = Math.round(val * pct);
        breakdown.bracketBonus = bonus;
        val += bonus;
    }

    // 5. twist (multiplier, no dedicated breakdown slot — surfaced via twistApplied)
    let twistApplied = false;
    const twistDef = TWISTS[twist];
    if (twistDef && Array.isArray(twistDef.methods) && typeof twistDef.pct === "number") {
        if (twistDef.methods.includes(method)) {
            val = Math.round(val * (1 + twistDef.pct));
            twistApplied = true;
        }
    }

    // 6. streak multiplier
    const streakMin = (twistDef && typeof twistDef.streakFrom === "number")
        ? twistDef.streakFrom
        : DP.STREAK_MIN;
    if (attackerStreak >= streakMin) {
        breakdown.streakMultiplier = DP.STREAK_MULT;
        val = Math.round(val * DP.STREAK_MULT);
    }

    // 7. repeat penalty (same opponent, this ISO week — repeatCount is PRIOR fights)
    if (repeatCount === 1) {
        breakdown.repeatPenalty = DP.REPEAT_2ND; // 2nd fight → ×0.5
        val = Math.round(val * DP.REPEAT_2ND);
    } else if (repeatCount >= 2) {
        breakdown.repeatPenalty = DP.REPEAT_3RD; // 3rd+ → ×0.25
        val = Math.round(val * DP.REPEAT_3RD);
    }

    // 8. clamp — a win always grants at least MIN_WIN_GAIN.
    val = Math.max(DP.MIN_WIN_GAIN, val);

    return { dpChange: val, twistApplied, breakdown };
}

/**
 * Apply a DP change to a PVPRecord and resolve division / promotion / shield / floor.
 * MUTATES the record in place (no save — caller owns persistence).
 *
 * Rules (contract §2 applyDpAndDivision):
 *  - peakDp tracks the high-water mark of dp after the change.
 *  - WIN: dp += change. If next division exists and dp >= current promoteAt → promote:
 *         set division=next, dp=next.floor (NO CARRY), promotionShield=3.
 *         Else recompute division upward only (never demote on a win).
 *  - LOSS: dp = max(divisionFloor(current division), dp + change). Division never
 *          demotes mid-season (soft reset happens only at season end).
 *  - DRAW (change 0): no division change, shield still decrements.
 *  - Shield decrements by 1 after EVERY fight (win/loss/draw) if > 0.
 *
 * @returns {{ promoted:boolean, newDivision:string, dpAfter:number }}
 */
function applyDpAndDivision(record, dpChange, { isWin = false } = {}) {
    const beforeDivision = record.division;
    let promoted = false;

    if (dpChange > 0 || (isWin && dpChange > 0)) {
        // WIN with positive gain.
        record.dp = record.dp + dpChange;
        const curMeta = divisionMeta(record.division);
        const next = nextDivision(record.division);
        if (next && curMeta && curMeta.promoteAt != null && record.dp >= curMeta.promoteAt) {
            record.division = next;
            record.dp = divisionFloor(next); // set to floor, no carry
            record.promotionShield = 3;
            promoted = true;
        } else {
            // Recompute upward only — a win must never demote.
            const derived = divisionForDp(record.dp);
            if (DIVISION_KEYS.indexOf(derived) > DIVISION_KEYS.indexOf(record.division)) {
                record.division = derived;
            }
        }
    } else if (dpChange < 0) {
        // LOSS. Floor at the current division's floor — no mid-season demotion.
        const floor = divisionFloor(record.division);
        record.dp = Math.max(floor, record.dp + dpChange);
    }
    // dpChange === 0 (draw / shut-out defense) → dp untouched.

    // peakDp high-water mark.
    if (record.dp > (record.peakDp || 0)) record.peakDp = record.dp;

    // Shield decrements after every fight — EXCEPT the fight that just promoted,
    // which freshly granted shield=3 (those 3 protected fights are the ones still to come).
    // DELIBERATE (H-1, not a bug): "promotionShield = 3" means 3 protected fights AFTER
    // promotion, so the promoting fight itself must not consume one of them.
    if (!promoted && record.promotionShield > 0) record.promotionShield -= 1;

    return { promoted, newDivision: record.division, dpAfter: record.dp, beforeDivision };
}

module.exports = {
    computeDp,
    applyDpAndDivision,
    // re-exported for convenience to keep callers off the const file's internals
    divisionForDp,
    divisionFloor,
    DIVISIONS,
};
