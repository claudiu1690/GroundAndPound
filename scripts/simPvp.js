/**
 * PvP battle simulator (dev tool — not wired into the app).
 *
 * Reuses the REAL fight engine (utils/fightResolution.resolveFight), the bot
 * stat generator (scripts/seedPvpBots.buildBot), the real rank-point math
 * (rankingService.calcDelta), and the actual reward constants (consts/pvpConfig,
 * PROMOTION_TIERS). No DB connection — pure in-memory Monte-Carlo.
 *
 * Run: node scripts/simPvp.js
 */
const { resolveFight } = require("../utils/fightResolution");
const { buildBot, tierForOvr } = require("./seedPvpBots");
const { calcDelta } = require("../services/rankingService");
const campService = require("../services/campService");
const { PROMOTION_TIERS } = require("../consts/gameConstants");
const {
    PVP_GAP_DIVISOR, PVP_IRON_WIN_FRAC, PVP_FAME_WIN_FRAC,
} = require("../consts/pvpConfig");

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const gapFactor = (ovrDiff) => clamp01(1 - Math.max(0, ovrDiff) / PVP_GAP_DIVISOR);

/** Build a fight-ready stat block at a target OVR (random style), full health/stamina. */
function fighterAt(ovr) {
    const f = buildBot(ovr, 0, 1, 0);           // rung args only affect record/rank, not stats
    f.health = 100;
    f.stamina = f.maxStamina ?? 100;
    return f;
}

/** Normalize the engine outcome string to a method bucket. */
function methodOf(outcome) {
    if (outcome === "Draw") return "Draw";
    if (/KO|TKO/i.test(outcome)) return "KO";
    if (/Submission/i.test(outcome)) return "SUB";
    return "DEC";
}

/** Run N attacks: attacker at attOvr vs defender at defOvr, optional offensive camp. */
function runMatchup(attOvr, defOvr, N, camp = []) {
    const tally = { att: 0, def: 0, draw: 0, KO: 0, SUB: 0, DEC: 0 };
    for (let i = 0; i < N; i++) {
        const A = fighterAt(attOvr);
        const D = fighterAt(defOvr);
        const sessionBonuses = campService.buildOffensiveBonuses(camp, A.style, D.style);
        const r = resolveFight(A, D, {
            sessionBonuses, wildcard: null,
            ctx: { playerStyle: A.style, opponentStyle: D.style, tier: tierForOvr(attOvr),
                   playerOvr: attOvr, opponentOvr: defOvr },
        });
        const m = methodOf(r.outcome);
        if (r.winner === "player") tally.att++;
        else if (r.winner === "opponent") tally.def++;
        else tally.draw++;
        if (m !== "Draw") tally[m]++;
    }
    return tally;
}

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const signingFee = (ovr) => PROMOTION_TIERS[tierForOvr(ovr)].signingFee;

console.log("════════════════════════════════════════════════════════════════");
console.log("  PvP BATTLE SIMULATION  (real engine, empty offensive camp)");
console.log("════════════════════════════════════════════════════════════════\n");

// ── 1. Win-rate & finish distribution vs OVR gap (defender fixed at 50) ──────
const N = 3000;
const DEF = 50;
console.log(`1) ATTACKER WIN-RATE vs OVR GAP   (defender OVR ${DEF}, ${N} fights each, no camp)`);
console.log("   gap = attackerOVR − defenderOVR.  +gap = attacker stronger.\n");
console.log("   gap  | attOVR | attacker win | KO%  | SUB% | DEC% | draw%");
console.log("   -----+--------+--------------+------+------+------+------");
for (const gap of [-8, -5, -2, 0, 2, 5, 8]) {
    const att = DEF + gap;
    const t = runMatchup(att, DEF, N);
    const fin = t.att + t.def + t.draw;
    console.log(
        `   ${String(gap).padStart(3)}  |  ${String(att).padStart(4)}  |   ${pct(t.att, fin).padStart(7)}    | ${pct(t.KO, fin).padStart(4)} | ${pct(t.SUB, fin).padStart(4)} | ${pct(t.DEC, fin).padStart(4)} | ${pct(t.draw, fin).padStart(4)}`
    );
}

// ── 2. Reward economics: iron per WIN across the gap (gapFactor scaling) ─────
console.log(`\n2) IRON PER WIN vs OVR GAP   (attacker tier signingFee × ${PVP_IRON_WIN_FRAC} × gapFactor)`);
console.log("   Shows 'punching down pays little, upsets pay full'.\n");
console.log("   gap | gapFactor | Amateur(att~20) | National(att~50) | GCS(att~80)");
console.log("   ----+-----------+-----------------+------------------+------------");
for (const gap of [-8, 0, 4, 8]) {
    const gf = gapFactor(gap);
    const ironAt = (ovr) => Math.round(signingFee(ovr + gap >= 0 ? ovr : ovr) * PVP_IRON_WIN_FRAC * gf);
    const am = Math.round(signingFee(20) * PVP_IRON_WIN_FRAC * gf);
    const na = Math.round(signingFee(50) * PVP_IRON_WIN_FRAC * gf);
    const gcs = Math.round(signingFee(80) * PVP_IRON_WIN_FRAC * gf);
    console.log(`   ${String(gap).padStart(3)} |   ${gf.toFixed(2)}    |     ${String(am).padStart(6)}      |      ${String(na).padStart(6)}       |   ${String(gcs).padStart(6)}`);
}

// ── 3. Rank points per result (the calcDelta rules) ─────────────────────────
console.log(`\n3) RANK POINTS PER RESULT   (real calcDelta)`);
console.log("   vs equal-ranked: win=+1 (+2 finish);  vs higher-ranked (upset): +2/+4;  loss=−1 (−2 upset)\n");
const dShow = (res, pr, or) => calcDelta(res, pr, or);
console.log("   • Win by decision, equal opponent      : " + dShow({ isWin: true, method: "DEC" }, 10, 10));
console.log("   • Win by KO/Sub, equal opponent        : " + dShow({ isWin: true, method: "KO" }, 10, 10));
console.log("   • Win by KO/Sub vs HIGHER-ranked (upset): " + dShow({ isWin: true, method: "KO" }, 12, 6) + "  (max)");
console.log("   • Loss vs equal/higher opponent        : " + dShow({ isLoss: true, method: "DEC" }, 10, 8));
console.log("   • Loss vs LOWER-ranked opponent (upset) : " + dShow({ isLoss: true, method: "DEC" }, 6, 12));

// ── 4. The genesis climb: a fresh OVR-14 player vs the low bots ─────────────
console.log(`\n4) NEW-PLAYER CLIMB   (fresh OVR-14 attacker vs the in-bracket genesis bots)`);
console.log("   These are the only legal first targets (rungs 12 & 18, within ±8 of 14).\n");
for (const botOvr of [12, 18]) {
    const t = runMatchup(14, botOvr, N);
    const fin = t.att + t.def + t.draw;
    console.log(`   vs Bot OVR ${botOvr}:  win ${pct(t.att, fin)}  | finishes ${pct(t.KO + t.SUB, fin)}  | rank pts per win ≈ +1 (decision) / +2 (finish)`);
}

console.log("\n════════════════════════════════════════════════════════════════");
console.log("  Note: empty offensive camp = pure stat baseline. A well-matched");
console.log("  camp shifts win-rate toward the attacker (the skill layer).");
console.log("════════════════════════════════════════════════════════════════");
