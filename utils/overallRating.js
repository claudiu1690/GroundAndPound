/**
 * Ground & Pound — Overall Rating calculation (weighted average by style).
 * GDD: Primary style stats ×1.2, secondary ×1.0, off-style ×0.85.
 */
const { STYLES, STAT_NAMES } = require("../consts/gameConstants");

const STAT_TO_KEY = { STR: 'str', SPD: 'spd', LEG: 'leg', WRE: 'wre', GND: 'gnd', SUB: 'sub', CHN: 'chn', FIQ: 'fiq' };

function getStatWeight(style, statName) {
    const styleConfig = STYLES[style];
    if (!styleConfig) return 1;
    if (styleConfig.primary && styleConfig.primary.includes(statName)) return 1.2;
    if (styleConfig.secondary && styleConfig.secondary.includes(statName)) return 1.0;
    return 0.85;
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
