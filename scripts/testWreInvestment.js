/**
 * Does a Boxer who invests XP into WRE win more often against grapplers?
 *
 * Compares three Boxer builds at OVR 50 against the same opponents:
 *   1. Standard Boxer  — primaries pumped, WRE left near baseline (~28)
 *   2. +WRE Boxer      — moderate WRE (~50) at the cost of LEG/GND/SUB
 *   3. ++WRE Boxer     — heavy WRE (~70), trades STR/SPD too
 */
const { resolveFight } = require("../utils/fightResolution");
const { calculateOverall } = require("../utils/overallRating");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");

const SIMS = 1000;

function makeFighter(stats) {
    return {
        firstName: stats.label || "Test", lastName: "B", style: "Boxer",
        maxStamina: 100, stamina: 100, health: 100,
        strategy: stats.strategy || "Pressure Fighter",
        ...stats,
    };
}

function tuneToOvr(stats, target) {
    // Tweak STR until OVR matches target. Used to keep total OVR fixed when swapping points.
    let safety = 200;
    while (calculateOverall({ ...stats, style: "Boxer" }) < target && safety-- > 0 && stats.str < 95) stats.str++;
    while (calculateOverall({ ...stats, style: "Boxer" }) > target && safety-- > 0 && stats.str > 1) stats.str--;
    return stats;
}

const standardBoxer = tuneToOvr({ str: 70, spd: 65, chn: 60, leg: 40, wre: 28, gnd: 28, sub: 28, fiq: 35 }, 50);
const wreBoxer      = tuneToOvr({ str: 70, spd: 65, chn: 60, leg: 28, wre: 55, gnd: 28, sub: 28, fiq: 35 }, 50);
const heavyWreBoxer = tuneToOvr({ str: 65, spd: 55, chn: 55, leg: 25, wre: 75, gnd: 35, sub: 25, fiq: 35 }, 50);

console.log("Boxer builds (all OVR 50):");
console.log("  Standard:     STR", standardBoxer.str, "SPD", standardBoxer.spd, "CHN", standardBoxer.chn, "WRE", standardBoxer.wre, "GND", standardBoxer.gnd);
console.log("  +WRE:         STR", wreBoxer.str, "SPD", wreBoxer.spd, "CHN", wreBoxer.chn, "WRE", wreBoxer.wre, "GND", wreBoxer.gnd);
console.log("  ++WRE (trade):STR", heavyWreBoxer.str, "SPD", heavyWreBoxer.spd, "CHN", heavyWreBoxer.chn, "WRE", heavyWreBoxer.wre, "GND", heavyWreBoxer.gnd);
console.log("");

function runMatch(playerBuild, oppStyle, sims = SIMS) {
    let wins = 0;
    for (let i = 0; i < sims; i++) {
        const player = makeFighter(playerBuild);
        const oppStats = buildScaledOpponentStats(oppStyle, 50);
        const opp = makeFighter({ ...oppStats, style: oppStyle, strategy: strategyForStyle(oppStyle) });
        const r = resolveFight(player, opp, {
            playerName: "P", opponentName: "O",
            playerStrategy: player.strategy,
            sessionBonuses: [], wildcard: null,
        });
        if (r.winner === "player") wins++;
    }
    return ((wins / sims) * 100).toFixed(1);
}

const opponents = ["Wrestler", "Brazilian Jiu-Jitsu", "Judo", "Sambo", "Boxer", "Muay Thai"];

console.log(`Win rate over ${SIMS} sims (all matchups OVR 50 vs OVR 50):\n`);
console.log("opponent              standard   +WRE   ++WRE");
for (const opp of opponents) {
    const a = runMatch(standardBoxer, opp);
    const b = runMatch(wreBoxer, opp);
    const c = runMatch(heavyWreBoxer, opp);
    console.log(`${opp.padEnd(22)}  ${a.padStart(5)}%   ${b.padStart(5)}%   ${c.padStart(5)}%`);
}
