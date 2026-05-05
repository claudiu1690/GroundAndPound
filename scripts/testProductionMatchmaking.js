/**
 * Production matchmaking test — simulates the real path:
 *   1. Player has fixed stats (mirrors a real saved fighter)
 *   2. Compute their OVR under the current formula
 *   3. Match them vs an opponent seeded at THEIR OVR
 *   4. Measure win rate — should converge to ~50%
 *
 * If a hyper-specialised player previously read as OVR 47 but is now OVR 49,
 * matchmaking sends a tougher opponent, which is the real fix.
 */
const { resolveFight } = require("../utils/fightResolution");
const { calculateOverall } = require("../utils/overallRating");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");

const SIMS = 500;
const STYLES = ["Boxer", "Kickboxer", "Muay Thai", "Wrestler", "Brazilian Jiu-Jitsu", "Judo", "Sambo"];

const PLAYER_BUILDS = [
    {
        name: "balanced (control)",
        style: "Boxer",
        stats: { str: 60, spd: 55, chn: 55, leg: 45, wre: 45, gnd: 45, sub: 45, fiq: 50 },
    },
    {
        name: "user case (3-stat pump)",
        style: "Boxer",
        stats: { str: 80, spd: 65, chn: 65, leg: 30, wre: 30, gnd: 30, sub: 30, fiq: 30 },
    },
    {
        name: "extreme min-max",
        style: "Boxer",
        stats: { str: 90, spd: 80, chn: 75, leg: 15, wre: 15, gnd: 15, sub: 15, fiq: 15 },
    },
    {
        name: "WRE counter-pick",
        style: "Boxer",
        stats: { str: 70, spd: 60, chn: 60, leg: 35, wre: 60, gnd: 35, sub: 30, fiq: 35 },
    },
    {
        name: "wrestler standard",
        style: "Wrestler",
        stats: { str: 65, spd: 50, chn: 50, leg: 35, wre: 80, gnd: 70, sub: 40, fiq: 35 },
    },
    {
        name: "BJJ specialist",
        style: "Brazilian Jiu-Jitsu",
        stats: { str: 40, spd: 50, chn: 45, leg: 35, wre: 65, gnd: 80, sub: 80, fiq: 45 },
    },
    {
        name: "wall (CHN+WRE)",
        style: "Boxer",
        stats: { str: 55, spd: 50, chn: 80, leg: 30, wre: 65, gnd: 35, sub: 30, fiq: 35 },
    },
];

function fighter(style, stats, strategy) {
    return {
        firstName: "P", lastName: "T", style,
        maxStamina: 100, stamina: 100, health: 100,
        strategy: strategy || strategyForStyle(style),
        ...stats,
    };
}

function runMatch(playerBuild, oppOvr, oppStyle, sims = SIMS) {
    let wins = 0;
    for (let i = 0; i < sims; i++) {
        const p = fighter(playerBuild.style, playerBuild.stats);
        const oppStats = buildScaledOpponentStats(oppStyle, oppOvr);
        const o = fighter(oppStyle, oppStats);
        const r = resolveFight(p, o, {
            playerName: "P", opponentName: "O",
            playerStrategy: p.strategy,
            sessionBonuses: [], wildcard: null,
        });
        if (r.winner === "player") wins++;
    }
    return wins / sims;
}

function pct(n) { return `${(n * 100).toFixed(0)}%`.padStart(4); }
function flag(rate) {
    if (rate > 0.65) return " ⚠ OP";
    if (rate < 0.35) return " ⚠ weak";
    return "";
}

console.log(`\n══ Production matchmaking test — ${SIMS} sims per matchup ══`);
console.log("Each player faces opponents seeded at their COMPUTED OVR — the real production path.\n");

for (const build of PLAYER_BUILDS) {
    const ovr = calculateOverall({ ...build.stats, style: build.style });
    console.log(`── ${build.name.padEnd(28)} (${build.style}, OVR ${ovr}) ──`);
    const stats = build.stats;
    console.log(`   STR ${stats.str} SPD ${stats.spd} CHN ${stats.chn} LEG ${stats.leg} WRE ${stats.wre} GND ${stats.gnd} SUB ${stats.sub} FIQ ${stats.fiq}`);

    const winRates = {};
    let totalWins = 0;
    for (const oppStyle of STYLES) {
        winRates[oppStyle] = runMatch(build, ovr, oppStyle);
        totalWins += winRates[oppStyle];
    }
    const overall = totalWins / STYLES.length;

    console.log(`   overall: ${pct(overall)}${flag(overall)}`);
    console.log(`   per style:`);
    for (const oppStyle of STYLES) {
        const r = winRates[oppStyle];
        console.log(`     vs ${oppStyle.padEnd(22)} ${pct(r)}${flag(r)}`);
    }
    console.log("");
}
