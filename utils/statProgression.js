/**
 * Ground & Pound — Stat progression: XP per point by range (GDD 5.1).
 * Stats 96–100 cannot be trained; only fight XP.
 */
const { XP_PER_POINT } = require("../consts/gameConstants");

const STAT_TO_XP_KEY = { STR: 'strXp', SPD: 'spdXp', LEG: 'legXp', WRE: 'wreXp', GND: 'gndXp', SUB: 'subXp', CHN: 'chnXp', FIQ: 'fiqXp' };
const STAT_TO_VAL_KEY = { STR: 'str', SPD: 'spd', LEG: 'leg', WRE: 'wre', GND: 'gnd', SUB: 'sub', CHN: 'chn', FIQ: 'fiq' };

/**
 * XP required to gain one point at current stat value.
 * @param {number} currentStat - Current stat value (1–100)
 * @returns {number|null} XP needed for next point, or null if 96+
 */
function xpRequiredForNextPoint(currentStat) {
    if (currentStat >= 96) return null;
    const band = XP_PER_POINT.find(b => currentStat >= b.min && currentStat <= b.max);
    return band ? band.xp : null;
}

/**
 * Apply XP to a stat; respect cap. Returns new stat value and remainder XP.
 * @param {number} currentStat - Current stat (1–100)
 * @param {number} currentXp - Current accumulated XP for this stat
 * @param {number} xpToAdd - XP to add
 * @param {number} statCap - Gym stat cap (e.g. 35 for T1)
 * @returns {{ newStat: number, newXp: number }} newStat capped at statCap and 95 (96+ is fight only)
 */
function applyXpToStat(currentStat, currentXp, xpToAdd, statCap) {
    const effectiveCap = Math.min(statCap, 95);
    if (currentStat >= effectiveCap) return { newStat: currentStat, newXp: currentXp };

    let stat = currentStat;
    let xp = currentXp + xpToAdd;

    while (stat < effectiveCap) {
        const required = xpRequiredForNextPoint(stat);
        if (required == null) break;
        if (xp < required) break;
        xp -= required;
        stat += 1;
    }

    return { newStat: stat, newXp: xp };
}

module.exports = { xpRequiredForNextPoint, applyXpToStat, STAT_TO_XP_KEY, STAT_TO_VAL_KEY };
