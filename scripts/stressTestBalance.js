/**
 * Balance stress test — sweep OVR levels and specialization patterns, hunt for OP builds.
 *
 * For each OVR (30, 50, 70, 90) we test build archetypes against a mixed pool of
 * style-default opponents at the same OVR. A build that wins >65% across the pool
 * is flagged as OVERPOWERED. A build that wins <35% is flagged as UNDERPOWERED.
 * Anything in 35–65% is healthy.
 */
const { resolveFight } = require("../utils/fightResolution");
const { calculateOverall } = require("../utils/overallRating");
const { buildScaledOpponentStats, strategyForStyle } = require("../utils/opponentStats");

const SIMS_PER = 300; // 300 × 8 styles × 4 OVRs × 7 archetypes = ~67k fights

const STYLES = ["Boxer", "Kickboxer", "Muay Thai", "Wrestler", "Brazilian Jiu-Jitsu", "Judo", "Sambo", "Capoeira"];
const OVRS   = [30, 50, 70, 90];

function fighter(stats) {
    return {
        firstName: "P", lastName: "T",
        maxStamina: 100, stamina: 100, health: 100,
        ...stats,
    };
}

/** Tune one stat key to land at the target OVR. Returns the same object for chaining. */
function tuneToOvr(stats, target, tuneKey = "fiq") {
    let safety = 300;
    while (calculateOverall(stats) < target && safety-- > 0 && stats[tuneKey] < 95) stats[tuneKey]++;
    while (calculateOverall(stats) > target && safety-- > 0 && stats[tuneKey] > 1) stats[tuneKey]--;
    return stats;
}

// ── Build archetypes — every archetype gets specialised to several styles ──────

function buildStandard(style, ovr) {
    return fighter({ ...buildScaledOpponentStats(style, ovr), style, strategy: strategyForStyle(style) });
}

/** Hyper-specialised: pump only the 3 primaries, dump everything else. */
function buildHyper(style, ovr) {
    const tier = { primary: 2.5, secondary: 0.4, offStyle: 0.2 };
    const stats = buildScaledOpponentStats(style, ovr);
    // Re-scale internally: take everyone's gain budget and concentrate it
    const scaled = { ...stats, style };
    // Quick fix: directly inflate primaries, deflate others until OVR matches
    const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
    STAT_KEYS.forEach((k) => { scaled[k] = Math.max(8, Math.min(95, scaled[k])); });
    // Aggressive primary pump, soft off-style cut
    const sCfg = require("../consts/gameConstants").STYLES[style];
    const STAT_TO_KEY = require("../utils/overallRating").STAT_TO_KEY;
    sCfg.primary.forEach((s) => { scaled[STAT_TO_KEY[s]] = Math.min(95, Math.round(scaled[STAT_TO_KEY[s]] * 1.25)); });
    Object.keys(scaled).forEach((k) => {
        if (typeof scaled[k] === "number" && STAT_KEYS.includes(k)) {
            const sn = k.toUpperCase();
            const isPrim = sCfg.primary.includes(sn);
            const isSec  = sCfg.secondary && sCfg.secondary.includes(sn);
            if (!isPrim && !isSec) scaled[k] = Math.max(5, Math.round(scaled[k] * 0.6));
        }
    });
    tuneToOvr(scaled, ovr);
    return fighter({ ...scaled, strategy: strategyForStyle(style) });
}

/** Glass cannon: max STR/SPD/LEG, dump CHN. */
function buildGlassCannon(style, ovr) {
    const stats = buildScaledOpponentStats(style, ovr);
    stats.str = Math.min(95, stats.str + 15);
    stats.spd = Math.min(95, stats.spd + 10);
    stats.leg = Math.min(95, stats.leg + 8);
    stats.chn = Math.max(8, stats.chn - 25);
    stats.style = style;
    tuneToOvr(stats, ovr);
    return fighter({ ...stats, strategy: strategyForStyle(style) });
}

/** Wall: high CHN, conservative offense, defensive WRE. */
function buildWall(style, ovr) {
    const stats = buildScaledOpponentStats(style, ovr);
    stats.chn = Math.min(95, stats.chn + 20);
    stats.wre = Math.min(95, stats.wre + 15);
    stats.str = Math.max(8, stats.str - 10);
    stats.spd = Math.max(8, stats.spd - 8);
    stats.style = style;
    tuneToOvr(stats, ovr);
    return fighter({ ...stats, strategy: strategyForStyle(style) });
}

/** Ground specialist: max GND/SUB/WRE regardless of style. */
function buildGroundSpec(style, ovr) {
    const stats = buildScaledOpponentStats(style, ovr);
    stats.wre = Math.min(95, stats.wre + 20);
    stats.gnd = Math.min(95, stats.gnd + 20);
    stats.sub = Math.min(95, stats.sub + 20);
    stats.str = Math.max(8, stats.str - 15);
    stats.spd = Math.max(8, stats.spd - 10);
    stats.style = style;
    tuneToOvr(stats, ovr);
    return fighter({ ...stats, strategy: "Ground & Pound" });
}

/** Pure striker dump — over-invest STR+SPD+LEG, abandon grappling entirely. */
function buildPureStriker(style, ovr) {
    const stats = buildScaledOpponentStats(style, ovr);
    stats.str = Math.min(95, stats.str + 12);
    stats.spd = Math.min(95, stats.spd + 12);
    stats.leg = Math.min(95, stats.leg + 12);
    stats.wre = Math.max(5, stats.wre - 15);
    stats.gnd = Math.max(5, stats.gnd - 15);
    stats.sub = Math.max(5, stats.sub - 15);
    stats.style = style;
    tuneToOvr(stats, ovr);
    return fighter({ ...stats, strategy: "Pressure Fighter" });
}

/** Anti-grappler boxer: WRE-investing strike specialist. */
function buildAntiGrappler(style, ovr) {
    const stats = buildScaledOpponentStats(style, ovr);
    stats.wre = Math.min(95, stats.wre + 25);
    stats.gnd = Math.min(95, stats.gnd + 10);
    stats.leg = Math.max(5, stats.leg - 10);
    stats.sub = Math.max(5, stats.sub - 10);
    stats.style = style;
    tuneToOvr(stats, ovr);
    return fighter({ ...stats, strategy: "Counter Striker" });
}

const ARCHETYPES = [
    { name: "standard",      build: buildStandard,     style: "Boxer" },
    { name: "hyper-special", build: buildHyper,        style: "Boxer" },
    { name: "glass cannon",  build: buildGlassCannon,  style: "Boxer" },
    { name: "wall",          build: buildWall,         style: "Boxer" },
    { name: "ground spec",   build: buildGroundSpec,   style: "Wrestler" },
    { name: "pure striker",  build: buildPureStriker,  style: "Muay Thai" },
    { name: "anti-grappler", build: buildAntiGrappler, style: "Boxer" },
];

function runOnePool(playerBuild, ovr, sims = SIMS_PER) {
    const wins = {};
    for (const oppStyle of STYLES) {
        let w = 0;
        for (let i = 0; i < sims; i++) {
            const player = playerBuild();
            const opp = buildStandard(oppStyle, ovr);
            const r = resolveFight(player, opp, {
                playerName: "P", opponentName: "O",
                playerStrategy: player.strategy,
                sessionBonuses: [], wildcard: null,
            });
            if (r.winner === "player") w++;
        }
        wins[oppStyle] = w / sims;
    }
    const overall = Object.values(wins).reduce((a, b) => a + b, 0) / STYLES.length;
    return { byStyle: wins, overall };
}

function pct(n) { return `${(n * 100).toFixed(0)}%`.padStart(4); }

function flag(rate) {
    if (rate > 0.65) return " ⚠ OP";
    if (rate < 0.35) return " ⚠ weak";
    return "";
}

console.log(`\n══ Balance stress test — ${SIMS_PER} sims per matchup ══\n`);
console.log("Win rate against a mixed pool of style-default opponents at the same OVR.");
console.log("Healthy band: 35%–65% overall. Outside that band → flagged.\n");

for (const ovr of OVRS) {
    console.log(`─── OVR ${ovr} ──────────────────────────────────────────────────`);
    console.log("archetype          overall  Box  Kick  MT  Wre  BJJ  Jdo  Sam  Cap");
    for (const arch of ARCHETYPES) {
        const builder = () => arch.build(arch.style, ovr);
        const r = runOnePool(builder, ovr);
        const styles = ["Boxer","Kickboxer","Muay Thai","Wrestler","Brazilian Jiu-Jitsu","Judo","Sambo","Capoeira"];
        const cells = styles.map((s) => pct(r.byStyle[s])).join(" ");
        console.log(`${arch.name.padEnd(18)} ${pct(r.overall)}${flag(r.overall).padEnd(8)} ${cells}`);
    }
    console.log("");
}

console.log("══ Cross-OVR upset check ══");
console.log("Specialised underdog vs standard higher-OVR opponent — should always be < 50%.\n");
const upsetCases = [
    { gap: -3, label: "OVR 47 hyper-special Boxer vs OVR 50 Boxer" },
    { gap: -5, label: "OVR 45 hyper-special Boxer vs OVR 50 Boxer" },
    { gap: -10, label: "OVR 40 hyper-special Boxer vs OVR 50 Boxer" },
    { gap: -3, label: "OVR 67 anti-grappler Boxer vs OVR 70 Wrestler" },
    { gap: -5, label: "OVR 65 ground spec Wrestler vs OVR 70 Boxer" },
];
for (const c of upsetCases) {
    const playerOvr = 50 + c.gap;
    const oppOvr = 50;
    let w = 0;
    const sims = 500;
    const builder = c.label.includes("anti-grappler") ? buildAntiGrappler
                  : c.label.includes("ground spec") ? buildGroundSpec
                  : buildHyper;
    const oppStyle = c.label.includes("Wrestler") && c.label.includes("vs OVR") ? c.label.split("vs OVR")[1].trim().split(" ").slice(1).join(" ") : "Boxer";
    const playerStyle = c.label.includes("ground spec") ? "Wrestler" : "Boxer";
    const oppStyleResolved = c.label.includes("vs OVR 70 Wrestler") ? "Wrestler"
                            : c.label.includes("vs OVR 70 Boxer") ? "Boxer"
                            : "Boxer";
    const playerOvrResolved = c.label.match(/OVR (\d+)/)[1];
    const oppOvrResolved = c.label.match(/vs OVR (\d+)/)[1];

    for (let i = 0; i < sims; i++) {
        const p = builder(playerStyle, +playerOvrResolved);
        const o = buildStandard(oppStyleResolved, +oppOvrResolved);
        const r = resolveFight(p, o, { playerName: "P", opponentName: "O", playerStrategy: p.strategy, sessionBonuses: [], wildcard: null });
        if (r.winner === "player") w++;
    }
    const rate = w / sims;
    console.log(`  ${c.label.padEnd(56)} W: ${pct(rate)}${rate > 0.5 ? " ⚠ upset rate too high" : ""}`);
}

console.log("");
