/**
 * Balance sweep — drives the REAL fight engine (utils/fightResolution.js) across
 * styles and PvP gameplans to surface over/under-powered builds. No DB/Redis.
 *
 *   node scripts/balanceSweep.js          # full run (default sims)
 *   node scripts/balanceSweep.js 400      # quick run, 400 sims/cell
 *
 * Notes on method: style does NOT enter combat math — it only shapes the stat
 * distribution (via OVR weighting). So "style balance" = does a style's natural,
 * same-OVR specialist build win more in the engine? Fighters are rebuilt fresh
 * per fight because the engine mutates health/stamina in place.
 */
const { resolveFight } = require("../utils/fightResolution");
const { STYLES } = require("../consts/gameConstants");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");
const { GAMEPLAN_WEIGHTS, GAMEPLAN_STRATEGY } = require("../consts/pvpConfig");

const SIMS = parseInt(process.argv[2], 10) || 1500;
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const STYLE_NAMES = Object.keys(STYLES);
const GAMEPLANS = Object.keys(GAMEPLAN_WEIGHTS);

// Short display labels
const SHORT = {
  "Boxer": "Box", "Kickboxer": "Kick", "Wrestler": "Wres",
  "Brazilian Jiu-Jitsu": "BJJ", "Muay Thai": "MT", "Judo": "Judo",
  "Sambo": "Sambo", "Capoeira": "Capo",
};
const lbl = (s) => SHORT[s] || s.slice(0, 5);

// ── Fighter builders (fresh per fight; engine mutates health/stamina) ──
function buildFighter(style, ovr) {
  const stats = buildScaledOpponentStats(style, ovr);
  return { firstName: "A", lastName: "B", style, maxStamina: 100, stamina: 100, health: 100, ...stats };
}
function uniformFighter(ovr) {
  const f = { firstName: "U", lastName: "U", style: "Boxer", maxStamina: 100, stamina: 100, health: 100 };
  STAT_KEYS.forEach((k) => { f[k] = ovr; });
  return f;
}
// Replicates services/pvpFightService.weightedStats for plain objects.
function applyGameplan(fighter, gameplan) {
  const w = GAMEPLAN_WEIGHTS[gameplan] || {};
  const c = { ...fighter };
  for (const k of STAT_KEYS) {
    let v = typeof c[k] === "number" ? c[k] : 10;
    if (w[k]) v = Math.round(v * w[k]);
    c[k] = Math.max(1, v);
  }
  c.stamina = c.maxStamina ?? 100;
  c.health = 100;
  return c;
}

function classify(outcome) {
  if (/KO\/TKO/.test(outcome)) return "KO";
  if (/[Ss]ubmission/.test(outcome)) return "Sub";
  if (/Draw/.test(outcome)) return "Draw";
  return "Dec";
}

// ── Core matchers ──
// PvE: each fighter uses its natural style-strategy.
function pveMatch(styleA, styleB, ovr, sims) {
  let aw = 0, bw = 0, d = 0; const m = { KO: 0, Sub: 0, Dec: 0 };
  const sA = strategyForStyle(styleA), sB = strategyForStyle(styleB);
  for (let i = 0; i < sims; i++) {
    const a = buildFighter(styleA, ovr); a.strategy = sA;
    const b = buildFighter(styleB, ovr); b.strategy = sB;
    const r = resolveFight(a, b, { playerStrategy: sA, opponentStrategy: sB, sessionBonuses: [], wildcard: null });
    if (r.winner === "player") { aw++; const c = classify(r.outcome); if (m[c] != null) m[c]++; }
    else if (r.winner === "opponent") bw++; else d++;
  }
  return { aw, bw, d, m, sims };
}
// PvP: weighted stats + gameplan strategy. Attacker = player.
function pvpMatch(attBuild, attGp, defBuild, defGp, sims) {
  let aw = 0, bw = 0, d = 0;
  for (let i = 0; i < sims; i++) {
    const a = applyGameplan(attBuild(), attGp);
    const b = applyGameplan(defBuild(), defGp);
    const r = resolveFight(a, b, {
      playerStrategy: GAMEPLAN_STRATEGY[attGp] || undefined,
      opponentStrategy: GAMEPLAN_STRATEGY[defGp] || undefined,
      sessionBonuses: [], wildcard: null,
    });
    if (r.winner === "player") aw++; else if (r.winner === "opponent") bw++; else d++;
  }
  return { aw, bw, d, sims };
}

const pctN = (n, t) => (100 * n / t);
const p1 = (n, t) => pctN(n, t).toFixed(1).padStart(5);

// ════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log(` GROUND & POUND — BALANCE SWEEP   (${SIMS} fights / cell)`);
console.log(`${"═".repeat(70)}`);

// ── 1. PvE STYLE ROUND-ROBIN at OVR 50 ──
function styleRoundRobin(ovr, sims, matchFn) {
  // matrix[i][j] = style i (player) win% vs style j (opponent)
  const n = STYLE_NAMES.length;
  const rowWin = STYLE_NAMES.map(() => 0);
  const matrix = [];
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    let rWins = 0, rTotal = 0;
    for (let j = 0; j < n; j++) {
      const res = matchFn(STYLE_NAMES[i], STYLE_NAMES[j], ovr, sims);
      const wr = pctN(res.aw, res.sims);
      matrix[i][j] = wr;
      rWins += res.aw; rTotal += res.sims;
    }
    rowWin[i] = pctN(rWins, rTotal);
  }
  return { matrix, rowWin };
}

function printMatrix(matrix, rowWin) {
  const header = "        " + STYLE_NAMES.map((s) => lbl(s).padStart(6)).join("") + "   | AVG";
  console.log(header);
  console.log("   " + "─".repeat(header.length - 3));
  STYLE_NAMES.forEach((s, i) => {
    const row = matrix[i].map((v) => v.toFixed(0).padStart(6)).join("");
    console.log(`${lbl(s).padEnd(7)}|${row}   | ${rowWin[i].toFixed(1).padStart(5)}`);
  });
}

console.log(`\n── 1. PvE STYLE BALANCE — win% as ROW vs COLUMN, OVR 50 ──`);
console.log(`   (each style uses its natural strategy; diagonal mirror ≈ 50 = no role bias)`);
const pve50 = styleRoundRobin(50, SIMS, pveMatch);
printMatrix(pve50.matrix, pve50.rowWin);

// ── 2. OVR SCALING — per-style aggregate win% at 30/50/70 ──
console.log(`\n── 2. PvE STYLE BALANCE ACROSS OVR TIERS — aggregate win% vs the field ──`);
const tiers = [30, 50, 70];
const tierData = {};
for (const t of tiers) tierData[t] = styleRoundRobin(t, Math.round(SIMS * 0.7), pveMatch).rowWin;
console.log("        " + tiers.map((t) => `OVR${t}`.padStart(8)).join("") + "     style");
STYLE_NAMES.forEach((s, i) => {
  const cells = tiers.map((t) => tierData[t][i].toFixed(1).padStart(8)).join("");
  console.log(`${lbl(s).padEnd(7)}|${cells}     ${s}`);
});

// ── 3. PvP GAMEPLAN MATRIX — identical (uniform OVR-50) fighters ──
console.log(`\n── 3. PvP GAMEPLAN BALANCE — attacker(row) vs defender(col), identical fighters ──`);
console.log(`   (win% of ATTACKER gameplan; isolates the gameplan modifiers, no style/stat edge)`);
const gpHeader = "          " + GAMEPLANS.map((g) => g.slice(0, 6).padStart(8)).join("") + "   | AVG";
console.log(gpHeader);
console.log("   " + "─".repeat(gpHeader.length - 3));
const gpAvg = GAMEPLANS.map(() => ({ w: 0, t: 0 }));
GAMEPLANS.forEach((ga, i) => {
  const cells = [];
  let rw = 0, rt = 0;
  GAMEPLANS.forEach((gd) => {
    const res = pvpMatch(() => uniformFighter(50), ga, () => uniformFighter(50), gd, SIMS);
    const wr = pctN(res.aw, res.sims);
    cells.push(wr.toFixed(0).padStart(8));
    rw += res.aw; rt += res.sims;
    gpAvg[i].w += res.aw; gpAvg[i].t += res.sims;
  });
  console.log(`${ga.slice(0, 8).padEnd(9)}|${cells.join("")}   | ${pctN(rw, rt).toFixed(1).padStart(5)}`);
});

// ── 4. PvP STYLE SWEEP — each style attacks with its BEST gameplan vs Balanced defense ──
console.log(`\n── 4. PvP STYLE BALANCE — attacker(best gameplan) vs same-style-field on Balanced defense, OVR 50 ──`);
// Find each style's best gameplan vs a balanced-defending mirror of itself.
const bestGp = {};
for (const s of STYLE_NAMES) {
  let best = "balanced", bestWr = -1;
  for (const g of GAMEPLANS) {
    const res = pvpMatch(() => buildFighter(s, 50), g, () => buildFighter(s, 50), "balanced", Math.round(SIMS * 0.6));
    const wr = pctN(res.aw, res.sims);
    if (wr > bestWr) { bestWr = wr; best = g; }
  }
  bestGp[s] = { gp: best, mirrorWr: bestWr };
}
// Each style (best gp) vs every other style on Balanced defense → aggregate.
console.log("        " + "bestGP".padStart(10) + "  vsMirror   aggWin%  (vs all styles, balanced D)");
const pvpAgg = [];
for (const s of STYLE_NAMES) {
  let w = 0, t = 0;
  for (const opp of STYLE_NAMES) {
    const res = pvpMatch(() => buildFighter(s, 50), bestGp[s].gp, () => buildFighter(opp, 50), "balanced", SIMS);
    w += res.aw; t += res.sims;
  }
  const agg = pctN(w, t);
  pvpAgg.push({ s, agg });
  console.log(`${lbl(s).padEnd(7)}|${bestGp[s].gp.padStart(10)}  ${bestGp[s].mirrorWr.toFixed(1).padStart(7)}   ${agg.toFixed(1).padStart(6)}`);
}

// ════════════════════════════════════════════════════════════════
// FINDINGS — auto-flag imbalance
// ════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(70)}`);
console.log(` FINDINGS`);
console.log(`${"═".repeat(70)}`);

// Role-bias sanity (mean of PvE diagonal)
const diag = STYLE_NAMES.map((_, i) => pve50.matrix[i][i]);
const diagMean = diag.reduce((a, b) => a + b, 0) / diag.length;
console.log(`\n• Role-bias check (PvE mirror diagonal mean): ${diagMean.toFixed(1)}%  (≈50 = engine is symmetric)`);

function rankAndFlag(label, arr, lo = 47, hi = 53) {
  const sorted = [...arr].sort((a, b) => b.v - a.v);
  console.log(`\n• ${label} — ranked by win% vs the field:`);
  sorted.forEach((x) => {
    const flag = x.v > hi ? "  ◀ STRONG" : x.v < lo ? "  ◀ WEAK" : "";
    console.log(`     ${x.name.padEnd(20)} ${x.v.toFixed(1).padStart(5)}%${flag}`);
  });
  const spread = sorted[0].v - sorted[sorted.length - 1].v;
  console.log(`     spread (best − worst): ${spread.toFixed(1)} pts`);
}

rankAndFlag("PvE styles (OVR 50)", STYLE_NAMES.map((s, i) => ({ name: s, v: pve50.rowWin[i] })));
rankAndFlag("PvP gameplans (vs field, identical fighters)",
  GAMEPLANS.map((g, i) => ({ name: g, v: pctN(gpAvg[i].w, gpAvg[i].t) })), 47, 55);
rankAndFlag("PvP styles (best gameplan, OVR 50)", pvpAgg.map((x) => ({ name: x.s, v: x.agg })));

console.log("");
