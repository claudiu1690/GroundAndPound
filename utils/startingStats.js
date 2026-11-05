/**
 * Starting stats for a new fighter (character creation). Pure: requires only
 * consts/gameConstants, so the debut Monte Carlo (scripts/simDebutOvr.js) builds
 * fighters exactly the way fighterService.createFighter does, with no DB.
 */
const { STYLES, BACKSTORIES } = require("../consts/gameConstants");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const STAT_NAMES = ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"];

/**
 * Build starting stats from style and optional backstory.
 * Returns lowercase stat keys (str..fiq) and, when the backstory grants one,
 * `maxStaminaBonus` (the caller turns it into maxStamina and deletes it).
 *
 * @param {string} style       a STYLES key
 * @param {?string} backstory  a BACKSTORIES key, or null
 * @returns {Object}
 */
function buildStartingStats(style, backstory) {
    const start = STYLES[style] && STYLES[style].start ? { ...STYLES[style].start } : {};
    const stats = {};
    for (const s of STAT_NAMES) {
        const key = s.toLowerCase();
        stats[key] = Math.min(100, Math.max(1, start[s] || 10));
    }
    if (backstory && BACKSTORIES[backstory]) {
        const bonus = BACKSTORIES[backstory];
        if (bonus.allStats) {
            STAT_KEYS.forEach(k => { stats[k] = Math.min(100, stats[k] + bonus.allStats); });
        }
        STAT_NAMES.forEach(s => {
            const key = s.toLowerCase();
            if (bonus[key] || bonus[s]) stats[key] = Math.min(100, stats[key] + (bonus[key] || bonus[s] || 0));
        });
        if (bonus.maxStaminaBonus) stats.maxStaminaBonus = bonus.maxStaminaBonus;
    }
    return stats;
}

module.exports = { buildStartingStats };
