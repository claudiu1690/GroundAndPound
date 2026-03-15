/**
 * Build NPC opponent stats from a fighting style (same STYLES.start as player creation).
 * Adds small variance so opponents aren't identical. Returns { str, spd, leg, wre, gnd, sub, chn, fiq } and overallRating.
 */
const { STYLES, STAT_NAMES, STAT_TO_KEY } = require("../consts/gameConstants");
const { calculateOverall } = require("../utils/overallRating");

/**
 * @param {string} style - Style key from STYLES (e.g. "Boxer", "Wrestler")
 * @returns {{ str, spd, leg, wre, gnd, sub, chn, fiq, overallRating }}
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
    return { ...stats, overallRating };
}

module.exports = { buildOpponentStatsFromStyle };
