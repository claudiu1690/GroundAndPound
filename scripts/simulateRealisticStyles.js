/**
 * Realistic style matchups — stronger focus stats rather than uniformly boosted.
 * A true "wrestler" has high WRE/GND/STR but lower striking stats.
 */
const { resolveFight } = require("../utils/fightResolution");

const SIMS = 500;

function makeSpecialist(overrides) {
    return {
        firstName: "F", lastName: "T",
        maxStamina: 100, stamina: 100, health: 100,
        str: 45, spd: 45, leg: 45, wre: 45, gnd: 45, sub: 45, chn: 45, fiq: 45,
        ...overrides,
    };
}

function matchup(label, pStats, oStats) {
    const results = { wins: 0, losses: 0, draws: 0, outcomes: {} };
    for (let i = 0; i < SIMS; i++) {
        const player = makeSpecialist(pStats);
        const opponent = makeSpecialist(oStats);
        const r = resolveFight(player, opponent, { sessionBonuses: [], wildcard: null });
        results.outcomes[r.outcome] = (results.outcomes[r.outcome] ?? 0) + 1;
        if (r.winner === "player") results.wins++;
        else if (r.winner === "opponent") results.losses++;
        else results.draws++;
    }
    const pct = (n) => `${((n / SIMS) * 100).toFixed(1)}%`;
    console.log(`${label.padEnd(50)} W: ${pct(results.wins)}   L: ${pct(results.losses)}`);
    const top = Object.entries(results.outcomes).sort(([, a], [, b]) => b - a).slice(0, 3);
    console.log(`   └─ ${top.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
}

console.log("\n── Realistic specialist matchups (equal OVR ~50) ──\n");

// Boxer: high striking, low grappling
const boxer = { str: 70, spd: 65, chn: 65, leg: 45, wre: 30, gnd: 30, sub: 30, fiq: 50 };
// Wrestler: high wrestling/GND, low striking
const wrestler = { str: 55, spd: 40, chn: 50, leg: 35, wre: 75, gnd: 70, sub: 45, fiq: 50 };
// BJJ: top-tier sub/ground, low striking
const bjj = { str: 40, spd: 45, chn: 45, leg: 35, wre: 55, gnd: 75, sub: 75, fiq: 55 };
// Muay Thai: high leg/str, ok chin, weak grappling
const mt = { str: 65, spd: 55, chn: 55, leg: 70, wre: 35, gnd: 30, sub: 30, fiq: 50 };

matchup("Boxer vs Wrestler", boxer, wrestler);
matchup("Wrestler vs Boxer", wrestler, boxer);
matchup("Boxer vs BJJ", boxer, bjj);
matchup("BJJ vs Boxer", bjj, boxer);
matchup("Muay Thai vs Wrestler", mt, wrestler);
matchup("Wrestler vs BJJ", wrestler, bjj);
matchup("BJJ vs Wrestler", bjj, wrestler);
matchup("Muay Thai vs BJJ", mt, bjj);
matchup("BJJ vs Muay Thai", bjj, mt);

console.log("\n── Upset scenarios ──\n");
// Wrestler with huge wrestling advantage
const elite_wrestler = { str: 60, spd: 45, chn: 55, leg: 40, wre: 85, gnd: 80, sub: 50, fiq: 55 };
const mediocre_boxer = { str: 55, spd: 50, chn: 50, leg: 45, wre: 35, gnd: 35, sub: 30, fiq: 45 };
matchup("Elite wrestler (85 WRE) vs mid boxer (35 WRE)", elite_wrestler, mediocre_boxer);
matchup("Mid boxer vs elite wrestler", mediocre_boxer, elite_wrestler);
