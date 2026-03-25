/**
 * Fight balance simulation — camp modifier impact analysis.
 *
 * Runs N silent simulations across realistic camp modifier values derived from
 * actual session combinations, then prints a win-rate table.
 *
 * Usage:
 *   node scripts/simulateFightBalance.js [playerOvr] [opponentOvr] [runs]
 *
 * Examples:
 *   node scripts/simulateFightBalance.js           → default: 33 vs 37, 10000 runs
 *   node scripts/simulateFightBalance.js 33 40     → 33 vs 40, 10000 runs
 *   node scripts/simulateFightBalance.js 33 37 50000
 */

const { resolveFight } = require("../utils/fightResolution");
const { SKIP_CAMP_MODIFIER } = require("../consts/campConfig");

const PLAYER_OVR   = parseInt(process.argv[2], 10) || 33;
const OPPONENT_OVR = parseInt(process.argv[3], 10) || 37;
const RUNS         = parseInt(process.argv[4], 10) || 10_000;

// Realistic modifier values derived from actual session combinations.
// Grade labels are cosmetic — the modifier is session-earned, not grade-assigned.
const GRADES = [
    { label: `Skip camp (${(SKIP_CAMP_MODIFIER * 100).toFixed(0)}%)`, modifier: SKIP_CAMP_MODIFIER },
    { label: "No match (0%)",    modifier:  0.00 },
    { label: "Amateur best (+6%)",  modifier:  0.06 },
    { label: "RegPro best  (+8%)",  modifier:  0.08 },
    { label: "National best(+11%)", modifier:  0.11 },
    { label: "GCS-C best  (+16%)",  modifier:  0.16 },
    { label: "GCS best    (+18%)",  modifier:  0.18 },
];

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

// ── Build a flat, balanced fighter at a given OVR ─────────────────────────────
// All 8 stats equal → OVR ≈ target (since calculateOverall is a weighted average
// with weights ~0.85–1.2; using equal stats the average weight ≈ 1.0, so OVR ≈ stat value).
function makeFighter(ovr, name) {
    const obj = { name, style: "Boxer", health: 100, stamina: 100, maxStamina: 100 };
    for (const k of STAT_KEYS) obj[k] = ovr;
    return obj;
}

// ── Apply camp modifier to a copy of the fighter ─────────────────────────────
function applyMod(fighter, modifier) {
    const f = { ...fighter };
    if (modifier !== 0) {
        for (const k of STAT_KEYS) {
            f[k] = Math.max(1, Math.round(f[k] * (1 + modifier)));
        }
    }
    return f;
}

// ── Run one scenario N times, return { wins, losses, draws } ─────────────────
function runScenario(playerBase, opponentBase, campModifier) {
    const results = { wins: 0, losses: 0, draws: 0 };
    for (let i = 0; i < RUNS; i++) {
        const player   = applyMod(playerBase,   campModifier);
        const opponent = applyMod(opponentBase, 0); // opponent unaffected
        const fight = resolveFight(player, opponent, {
            playerName:   playerBase.name,
            opponentName: opponentBase.name,
        });
        const outcome = fight.outcome ?? "";
        if (outcome === "Decision (unanimous)" || outcome === "Decision (split)" ||
            outcome === "KO/TKO" || outcome === "Submission") {
            results.wins++;
        } else if (outcome === "Draw") {
            results.draws++;
        } else {
            results.losses++;
        }
    }
    return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const playerBase   = makeFighter(PLAYER_OVR,   "Player");
const opponentBase = makeFighter(OPPONENT_OVR, "Opponent");

console.log(`\n${"═".repeat(62)}`);
console.log(` FIGHT BALANCE SIMULATION`);
console.log(` Player OVR ${PLAYER_OVR}  vs  Opponent OVR ${OPPONENT_OVR}  |  ${RUNS.toLocaleString()} runs each`);
console.log(`${"═".repeat(62)}`);
console.log(` ${"Grade / Modifier".padEnd(18)} ${"Wins".padStart(7)} ${"Losses".padStart(7)} ${"Draws".padStart(7)}  ${"Win %".padStart(7)}`);
console.log(` ${"─".repeat(57)}`);

for (const grade of GRADES) {
    const r = runScenario(playerBase, opponentBase, grade.modifier);
    const winPct = ((r.wins / RUNS) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(r.wins / RUNS * 30));
    console.log(
        ` ${grade.label.padEnd(18)}` +
        ` ${String(r.wins).padStart(7)}` +
        ` ${String(r.losses).padStart(7)}` +
        ` ${String(r.draws).padStart(7)}` +
        `  ${winPct.padStart(6)}%  ${bar}`
    );
}

console.log(`${"═".repeat(62)}`);
console.log(` Baseline (no camp at all, OVR ${PLAYER_OVR} vs OVR ${OPPONENT_OVR}):`);
const base = runScenario(playerBase, opponentBase, 0);
console.log(` Win rate without any modifier: ${((base.wins / RUNS) * 100).toFixed(1)}%`);
console.log(`${"═".repeat(62)}\n`);
