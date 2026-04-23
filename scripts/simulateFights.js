/**
 * Fight balance simulator — no database, no Redis.
 * Runs N fights at various OVR gaps and prints win rates.
 *
 * Usage: node scripts/simulateFights.js
 */
const { resolveFight } = require("../utils/fightResolution");
const { STYLES } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");

const SIMS_PER_MATCHUP = 500;
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

/**
 * Build a fighter whose computed OVR lands close to the target, using the
 * starting-stat template for the given style as a baseline and scaling all
 * stats evenly until the OVR matches.
 */
function makeFighter(name, targetOvr, styleName) {
    const style = STYLES[styleName];
    if (!style) throw new Error(`Unknown style: ${styleName}`);

    const base = { ...style.start, FIQ: style.start.FIQ ?? 10 };
    // Fill missing stats at 10 baseline.
    STAT_KEYS.forEach((k) => {
        const upper = k.toUpperCase();
        if (base[upper] == null) base[upper] = 10;
    });

    const fighter = {
        firstName: name,
        lastName: "Test",
        style: styleName,
        maxStamina: 100,
        stamina: 100,
        health: 100,
    };
    STAT_KEYS.forEach((k) => {
        fighter[k] = base[k.toUpperCase()] ?? 10;
    });

    // Scale uniformly until calculated OVR >= targetOvr.
    let safety = 200;
    while (calculateOverall(fighter) < targetOvr && safety-- > 0) {
        STAT_KEYS.forEach((k) => {
            if (fighter[k] < 95) fighter[k] = Math.min(95, fighter[k] + 1);
        });
    }
    return fighter;
}

function runSim(playerOvr, opponentOvr, { style = "Boxer", oppStyle = "Boxer", sims = SIMS_PER_MATCHUP } = {}) {
    const results = {
        wins: 0,
        losses: 0,
        draws: 0,
        byOutcome: {},
    };

    for (let i = 0; i < sims; i++) {
        const player = makeFighter("Player", playerOvr, style);
        const opponent = makeFighter("Opp", opponentOvr, oppStyle);

        // Fight resolver mutates fighter objects — we already made fresh ones.
        const result = resolveFight(player, opponent, {
            playerName: "Player",
            opponentName: "Opp",
            sessionBonuses: [],
            wildcard: null,
        });

        results.byOutcome[result.outcome] = (results.byOutcome[result.outcome] ?? 0) + 1;

        if (result.winner === "player") results.wins++;
        else if (result.winner === "opponent") results.losses++;
        else results.draws++;
    }

    return results;
}

function pct(n, total) {
    return `${((n / total) * 100).toFixed(1)}%`;
}

function printMatchup(label, playerOvr, opponentOvr, opts) {
    const r = runSim(playerOvr, opponentOvr, opts);
    const total = r.wins + r.losses + r.draws;
    const outcomeSummary = Object.entries(r.byOutcome)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    console.log(
        `${label.padEnd(38)} W:${pct(r.wins, total).padStart(6)}  L:${pct(r.losses, total).padStart(6)}  D:${pct(r.draws, total).padStart(6)}`
    );
    console.log(`   └─ ${outcomeSummary}`);
}

console.log("");
console.log("═══════════════════════════════════════════════════════════════");
console.log(" FIGHT BALANCE SIMULATION  —  " + SIMS_PER_MATCHUP + " fights per matchup");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");
console.log("Equal OVR (Boxer vs Boxer) — expect ~50/50");
printMatchup("  OVR 40 vs OVR 40", 40, 40);
printMatchup("  OVR 50 vs OVR 50", 50, 50);
printMatchup("  OVR 60 vs OVR 60", 60, 60);
console.log("");

console.log("Player favoured (OVR advantage) — expect > 50% win rate");
printMatchup("  OVR 50 vs OVR 45 (+5)", 50, 45);
printMatchup("  OVR 50 vs OVR 40 (+10)", 50, 40);
printMatchup("  OVR 50 vs OVR 30 (+20)", 50, 30);
console.log("");

console.log("Player underdog (OVR deficit) — expect < 50% win rate");
printMatchup("  OVR 46 vs OVR 48 (-2)", 46, 48);
printMatchup("  OVR 45 vs OVR 50 (-5)", 45, 50);
printMatchup("  OVR 40 vs OVR 50 (-10)", 40, 50);
printMatchup("  OVR 30 vs OVR 50 (-20)", 30, 50);
console.log("");

console.log("Style matchups at equal OVR (50 vs 50)");
printMatchup("  Boxer vs Wrestler", 50, 50, { style: "Boxer", oppStyle: "Wrestler" });
printMatchup("  Wrestler vs Boxer", 50, 50, { style: "Wrestler", oppStyle: "Boxer" });
printMatchup("  BJJ vs Boxer", 50, 50, { style: "Brazilian Jiu-Jitsu", oppStyle: "Boxer" });
printMatchup("  Boxer vs BJJ", 50, 50, { style: "Boxer", oppStyle: "Brazilian Jiu-Jitsu" });
printMatchup("  Muay Thai vs Wrestler", 50, 50, { style: "Muay Thai", oppStyle: "Wrestler" });
printMatchup("  Wrestler vs BJJ", 50, 50, { style: "Wrestler", oppStyle: "Brazilian Jiu-Jitsu" });
console.log("");

console.log("High OVR matchups — championship range");
printMatchup("  OVR 70 vs OVR 70", 70, 70);
printMatchup("  OVR 80 vs OVR 75", 80, 75);
printMatchup("  OVR 90 vs OVR 85", 90, 85);
console.log("");
console.log("═══════════════════════════════════════════════════════════════");
