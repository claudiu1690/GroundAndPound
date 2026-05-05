/**
 * Ground & Pound — Overall Rating calculation (weighted average by style).
 *
 * Weights: primary ×1.4, secondary ×1.0, off-style ×0.6.
 * Wider gap than the original 1.2/1.0/0.85 — penalises stat dumping more honestly,
 * so a min-maxed specialist registers at a higher OVR (matchmaking sends them harder
 * fights) and a balanced fighter registers slightly lower. Closes the loophole where
 * pumping primary stats while dumping off-style stats was effectively "free" OVR.
 */
const { STYLES, STAT_NAMES } = require("../consts/gameConstants");

const STAT_TO_KEY = { STR: 'str', SPD: 'spd', LEG: 'leg', WRE: 'wre', GND: 'gnd', SUB: 'sub', CHN: 'chn', FIQ: 'fiq' };

function getStatWeight(style, statName) {
    const styleConfig = STYLES[style];
    if (!styleConfig) return 1;
    if (styleConfig.primary && styleConfig.primary.includes(statName)) return 1.4;
    if (styleConfig.secondary && styleConfig.secondary.includes(statName)) return 1.0;
    return 0.6;
}

/**
 * Compute Overall Rating from fighter's 8 stats and style.
 * @param {Object} fighter - Fighter doc with str, spd, leg, wre, gnd, sub, chn, fiq and style
 * @returns {number} Rounded Overall (e.g. 12–92)
 */
function calculateOverall(fighter) {
    const style = fighter.style || 'Boxer';
    let weightedSum = 0;
    let weightSum = 0;
    for (const stat of STAT_NAMES) {
        const key = STAT_TO_KEY[stat];
        const value = fighter[key] != null ? fighter[key] : 10;
        const w = getStatWeight(style, stat);
        weightedSum += value * w;
        weightSum += w;
    }
    const overall = weightSum ? weightedSum / weightSum : 10;
    return Math.round(overall);
}

module.exports = { calculateOverall, getStatWeight, STAT_TO_KEY };
