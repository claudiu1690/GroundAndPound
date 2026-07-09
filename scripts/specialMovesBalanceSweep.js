/**
 * QA TOOLING (temporary) — Special Moves balance sweep.
 *
 * Extends the existing balanceSweep.js / stressTestBalance.js Monte-Carlo harness
 * (drives the REAL utils/fightResolution.js engine) to measure the win-rate impact
 * of equipping Special Moves in a same-OVR, same-style mirror matchup — exactly the
 * scenario spec §11 "Balance Guardrails" targets (guardrail: ~5-10 point swing).
 *
 * Usage:
 *   node scripts/specialMovesBalanceSweep.js          # default 4000 sims/cell
 *   node scripts/specialMovesBalanceSweep.js 8000      # more sims/cell
 */
const { resolveFight } = require("../utils/fightResolution");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");
const { SPECIAL_MOVES, SPECIAL_MOVES_BY_ID, RARITY } = require("../consts/specialMovesCatalog");

const SIMS = parseInt(process.argv[2], 10) || 4000;
const MIRROR_STYLE = "Boxer";
const OVR = 50;

function buildFighter() {
  const stats = buildScaledOpponentStats(MIRROR_STYLE, OVR);
  return { firstName: "A", lastName: "B", style: MIRROR_STYLE, maxStamina: 100, stamina: 100, health: 100, ...stats };
}

// Build a moveBonuses entry exactly the way specialMovesService.buildMoveBonuses does,
// for a single move at a given rarity.
function bonusEntryFor(moveId, rarity) {
  const def = SPECIAL_MOVES_BY_ID[moveId];
  const value = def.values[rarity];
  return {
    moveId,
    bonusType: def.bonusType,
    effectiveValue: value,
    triggerCondition: def.triggerCondition,
    effectType: def.effectType,
    triggered: false,
    triggerCount: 0,
  };
}

function pctN(n, t) { return (100 * n) / t; }

function runMirror(playerMoveBonusesFn, sims = SIMS) {
  let pw = 0, ow = 0, d = 0;
  const strat = strategyForStyle(MIRROR_STYLE);
  for (let i = 0; i < sims; i++) {
    const a = buildFighter(); a.strategy = strat;
    const b = buildFighter(); b.strategy = strat;
    const moveBonuses = playerMoveBonusesFn ? playerMoveBonusesFn() : [];
    const r = resolveFight(a, b, {
      playerStrategy: strat, opponentStrategy: strat,
      sessionBonuses: [], wildcard: null, moveBonuses,
    });
    if (r.winner === "player") pw++;
    else if (r.winner === "opponent") ow++;
    else d++;
  }
  return { pw, ow, d, sims, wr: pctN(pw, sims) };
}

console.log(`\n${"=".repeat(78)}`);
console.log(` SPECIAL MOVES BALANCE SWEEP  (${SIMS} sims/cell, ${MIRROR_STYLE} mirror, OVR ${OVR})`);
console.log(`${"=".repeat(78)}`);

// ── 0. Baseline: no-moves mirror (must be ~50%, and moveBonuses=[] on both sides
//     must be numerically identical to the pre-feature engine — additive branches inert) ──
const baseline = runMirror(null, SIMS);
console.log(`\n-- 0. Baseline (moveBonuses=[] both sides) --`);
console.log(`   win rate: ${baseline.wr.toFixed(1)}%  (expect ~50%, sanity band 47-53)`);

// ── 1. Each single move at LEGENDARY, player-only, vs bare opponent ──
console.log(`\n-- 1. Single move equipped (LEGENDARY) vs bare opponent --`);
console.log(`   move                  bonusType                  winRate   delta-vs-baseline`);
const singleResults = [];
for (const def of SPECIAL_MOVES) {
  const rarity = def.values[RARITY.LEGENDARY] !== undefined ? RARITY.LEGENDARY
    : Object.keys(def.values).slice(-1)[0]; // fall back to best available
  const res = runMirror(() => [bonusEntryFor(def.id, rarity)], SIMS);
  const delta = res.wr - baseline.wr;
  singleResults.push({ id: def.id, rarity, wr: res.wr, delta });
  const flag = res.wr > 60 ? "  <== EXCEEDS GUARDRAIL (>60)" : (res.wr > 55 ? "  <== upper band" : "");
  console.log(`   ${def.id.padEnd(22)}${def.bonusType.padEnd(27)}${res.wr.toFixed(1).padStart(6)}%    ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}${flag}`);
}

// ── 2. The flagged worst-case offensive Legendary loadout ──
console.log(`\n-- 2. Flagged 3-Legendary offensive loadout: HEAVY_HANDS + THE_FINISHER + KILLER_INSTINCT --`);
const loadoutFn = () => [
  bonusEntryFor("HEAVY_HANDS", RARITY.LEGENDARY),
  bonusEntryFor("THE_FINISHER", RARITY.LEGENDARY),
  bonusEntryFor("KILLER_INSTINCT", RARITY.LEGENDARY),
];
const loadoutRes = runMirror(loadoutFn, SIMS * 2);
console.log(`   win rate: ${loadoutRes.wr.toFixed(1)}%  (delta vs baseline: ${(loadoutRes.wr - baseline.wr).toFixed(1)} pts)`);
console.log(`   guardrail target: baseline + 5-10 pts (i.e. ~55-60%). ${loadoutRes.wr > 60 ? "EXCEEDS GUARDRAIL." : "within guardrail."}`);

// ── 3. Isolate which single component of the loadout contributes most ──
console.log(`\n-- 3. Component isolation (each piece of the flagged loadout alone) --`);
for (const id of ["HEAVY_HANDS", "THE_FINISHER", "KILLER_INSTINCT"]) {
  const res = runMirror(() => [bonusEntryFor(id, RARITY.LEGENDARY)], SIMS);
  console.log(`   ${id.padEnd(20)} alone: ${res.wr.toFixed(1)}%  (delta ${(res.wr - baseline.wr >= 0 ? "+" : "")}${(res.wr - baseline.wr).toFixed(1)})`);
}

// ── 4. Pairwise combos to see where the swing accumulates ──
console.log(`\n-- 4. Pairwise combos --`);
const pairs = [
  ["HEAVY_HANDS", "THE_FINISHER"],
  ["HEAVY_HANDS", "KILLER_INSTINCT"],
  ["THE_FINISHER", "KILLER_INSTINCT"],
];
for (const [a, b] of pairs) {
  const res = runMirror(() => [bonusEntryFor(a, RARITY.LEGENDARY), bonusEntryFor(b, RARITY.LEGENDARY)], SIMS);
  console.log(`   ${a} + ${b}`.padEnd(45) + `: ${res.wr.toFixed(1)}%  (delta ${(res.wr - baseline.wr >= 0 ? "+" : "")}${(res.wr - baseline.wr).toFixed(1)})`);
}

console.log("");

// ── 5. COLLAPSE-RULE stacking: two moves sharing a bonusType (GRANITE_JAW + VETERAN_IQ,
//     both OPPONENT_DAMAGE_REDUCTION) SUM per buildMoveBonuses' collapse rule. This is a
//     legal, biggest-defensive-stack loadout worth checking against the guardrail too. ──
console.log(`\n-- 5. Collapse-rule stack: GRANITE_JAW + VETERAN_IQ (both OPPONENT_DAMAGE_REDUCTION, summed) --`);
const stackFn = () => {
  const a = bonusEntryFor("GRANITE_JAW", RARITY.LEGENDARY);
  const b = bonusEntryFor("VETERAN_IQ", RARITY.LEGENDARY);
  // Mirror buildMoveBonuses' collapse: one merged entry with summed effectiveValue.
  return [{ ...a, effectiveValue: a.effectiveValue + b.effectiveValue }];
};
const stackRes = runMirror(stackFn, SIMS);
console.log(`   merged effectiveValue: ${(0.08 + 0.06).toFixed(2)} (8% + 6%)`);
console.log(`   win rate: ${stackRes.wr.toFixed(1)}%  (delta vs baseline: ${(stackRes.wr - baseline.wr).toFixed(1)} pts)  ${stackRes.wr > 60 ? "<== EXCEEDS GUARDRAIL" : ""}`);
