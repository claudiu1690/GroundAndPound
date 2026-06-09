/**
 * Legacy media config — superseded by consts/mediaHubConfig.js.
 *
 * Kept as a thin re-export of the two constants fightService still imports
 * (BEEF_LAPSE_PENALTY_FAME + RESPECT_WIN_IRON_MULT) so the fight-resolution flow
 * does not need to change its require paths.
 */
const { BEEF_LAPSE_PENALTY_FAME, RESPECT_WIN_IRON_MULT } = require("./mediaHubConfig");

module.exports = {
    BEEF_LAPSE_PENALTY_FAME,
    RESPECT_WIN_IRON_MULT,
};
