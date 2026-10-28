/**
 * Not-enough-energy shortfall fields (`need` / `have`) on a service error.
 *
 * One home for the rule "only non-negative integers": producers (energyService.deductEnergy,
 * pvpFightService, homeCampTrainingService) mark the error with the live numbers at refusal;
 * consumers (the fight, Fight Camp, PvP and My Camp controllers) copy them onto the response
 * body. A value that is not a non-negative integer is never set, and a consumer only echoes
 * the pair when BOTH are present, so a malformed number can never reach the client.
 */

function isNonNegInt(n) {
    return Number.isInteger(n) && n >= 0;
}

/**
 * Attach `need` / `have` to an error when both are non-negative integers. Returns the error
 * so a producer can `throw markShortfall(new Error(...), need, have)`.
 * @param {Error} err
 * @param {number} need
 * @param {number} have
 * @returns {Error}
 */
function markShortfall(err, need, have) {
    if (err && typeof err === "object" && isNonNegInt(need) && isNonNegInt(have)) {
        err.need = need;
        err.have = have;
    }
    return err;
}

/**
 * The response-body fields for an error: `{ need, have }` when both are non-negative integers
 * on the error, otherwise `{}` (spread it into the JSON body).
 * @param {Error} err
 * @returns {{ need: number, have: number } | {}}
 */
function shortfallFields(err) {
    if (err && typeof err === "object" && isNonNegInt(err.need) && isNonNegInt(err.have)) {
        return { need: err.need, have: err.have };
    }
    return {};
}

module.exports = { markShortfall, shortfallFields };
