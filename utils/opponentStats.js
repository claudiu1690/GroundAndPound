/**
 * Build NPC opponent stats from a fighting style (same STYLES.start as player creation).
 * Stats are scaled with style-weighted growth — primaries grow faster than off-style stats,
 * mirroring how a real player progresses XP into the stats their style actually uses.
 * Returns { str, spd, leg, wre, gnd, sub, chn, fiq, overallRating, strategy }.
 */
const { STYLES, STAT_NAMES, STAT_TO_KEY } = require("../consts/gameConstants");
const { calculateOverall, getStatWeight } = require("../utils/overallRating");

// Style → default fight strategy. Picks a strategy that plays to the style's strengths,
// so an opponent's style and behaviour line up.
const STYLE_STRATEGY = {
    Boxer: 'Pressure Fighter',
    Kickboxer: 'Pressure Fighter',
    'Muay Thai': 'Leg Kick Attrition',
    Wrestler: 'Takedown Heavy',
    Judo: 'Takedown Heavy',
    'Brazilian Jiu-Jitsu': 'Submission Hunter',
    Sambo: 'Ground & Pound',
    Capoeira: 'Counter Striker',
};

function strategyForStyle(style) {
    return STYLE_STRATEGY[style] || 'Pressure Fighter';
}

// Opponents come in three specialisation flavours. Some are min-maxed (Specialist),
// some moderate (Balanced), some well-rounded (Generalist). Mixing these across the
// roster means the player faces a varied pool — a hyper-specialist player won't always
// fight another hyper-specialist, and a balanced player won't always fight one either.
const SCALE_PROFILES = [
    { name: "Specialist",  primary: 2.2, secondary: 0.9, offStyle: 0.3, weight: 0.35 },
    { name: "Balanced",    primary: 1.6, secondary: 1.0, offStyle: 0.55, weight: 0.40 },
    { name: "Generalist",  primary: 1.2, secondary: 1.0, offStyle: 0.85, weight: 0.25 },
];

function pickScaleProfile() {
    const total = SCALE_PROFILES.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * total;
    for (const p of SCALE_PROFILES) {
        roll -= p.weight;
        if (roll <= 0) return p;
    }
    return SCALE_PROFILES[0];
}

function tierForStat(style, statName, profile) {
    const w = getStatWeight(style, statName);
    if (w >= 1.2) return profile.primary;
    if (w >= 1.0) return profile.secondary;
    return profile.offStyle;
}

/**
 * Build a base "rookie" stat block for the given style with small variance.
 */
function buildOpponentStatsFromStyle(style) {
    const styleConfig = STYLES[style];
    const start = styleConfig && styleConfig.start ? { ...styleConfig.start } : {};
    const stats = {};
    for (const statName of STAT_NAMES) {
        const key = STAT_TO_KEY[statName];
        const base = start[statName] != null ? start[statName] : 10;
        const variance = Math.floor(Math.random() * 5) - 1;
        stats[key] = Math.min(100, Math.max(1, base + variance));
    }
    const overallRating = calculateOverall({ ...stats, style });
    return { ...stats, overallRating, strategy: strategyForStyle(style) };
}

/**
 * Scale a base stat block to a target OVR using style-weighted growth.
 * Primary stats climb faster than off-style stats, so an OVR-50 wrestler still
 * looks like a wrestler (high WRE/GND) rather than a stat-balanced everyman.
 *
 * Implementation: each stat grows by `gain × tierMultiplier` where `gain` is solved
 * iteratively until the computed OVR matches the target.
 */
function scaleStatsToOvr(baseStats, style, targetOvr, profile = null) {
    const out = { ...baseStats, style };
    const baseSnapshot = { ...baseStats };
    const useProfile = profile || pickScaleProfile();

    // Binary search the per-stat growth amount that lands us at targetOvr.
    let lo = 0;
    let hi = 100;
    for (let iter = 0; iter < 30; iter++) {
        const gain = (lo + hi) / 2;
        for (const statName of STAT_NAMES) {
            const key = STAT_TO_KEY[statName];
            const tier = tierForStat(style, statName, useProfile);
            const next = Math.round(baseSnapshot[key] + gain * tier);
            out[key] = Math.min(100, Math.max(1, next));
        }
        const ovr = calculateOverall(out);
        if (ovr < targetOvr) lo = gain;
        else hi = gain;
        if (Math.abs(ovr - targetOvr) <= 0.5) break;
    }
    out.overallRating = calculateOverall(out);
    return out;
}

/**
 * Convenience: build a rookie block then scale it to a target OVR with style-weighted growth.
 * Returns the same shape as buildOpponentStatsFromStyle plus an OVR matching `targetOvr`.
 */
function buildScaledOpponentStats(style, targetOvr) {
    const base = buildOpponentStatsFromStyle(style);
    if (!targetOvr || targetOvr <= base.overallRating) return base;
    const scaled = scaleStatsToOvr(base, style, targetOvr);
    return { ...scaled, strategy: strategyForStyle(style) };
}

module.exports = {
    buildOpponentStatsFromStyle,
    buildScaledOpponentStats,
    scaleStatsToOvr,
    strategyForStyle,
    STYLE_STRATEGY,
};
