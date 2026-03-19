const COMBAT_STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const DECISION_OUTCOMES = ["Decision (unanimous)", "Decision (split)"];
const WIN_OUTCOMES = ["KO/TKO", "Submission", ...DECISION_OUTCOMES];
const NATIONAL_PLUS_TIERS = ["National", "GCS Contender", "GCS"];
const GCS_TIERS = ["GCS Contender", "GCS"];

module.exports = {
    COMBAT_STAT_KEYS,
    DECISION_OUTCOMES,
    WIN_OUTCOMES,
    NATIONAL_PLUS_TIERS,
    GCS_TIERS,
};
