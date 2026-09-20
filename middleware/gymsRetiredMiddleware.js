/**
 * GYM RETIREMENT — the SINGLE HOME of the 410.
 *
 * When `GYMS_RETIRED=true` the ten gyms are closed and every gym endpoint answers 410 with one
 * fixed body. This lives in exactly one middleware, never as an inline `if (config.features…)`
 * inside a controller, for three reasons:
 *
 *   1. ⚠️ IT MUST RUN BEFORE THE CONTROLLER. `POST /fighters/:id/train` deducts energy through
 *      Redis (`energyService.deductBatchEnergy`) before it can fail. A flag check inside the
 *      controller would burn a mid-session player's energy on a request that returns 410. As a
 *      middleware, `deductBatchEnergy` is never reached and the 410 costs nothing.
 *   2. ONE BODY. The frontend detects the cutover by catching this exact `code` on a call it
 *      already makes at boot; seven hand-written 410s are seven chances for one of them to say
 *      something slightly different and leave the Gym tab on screen for that user.
 *   3. Flipping back is a restart. While the flag is false this function is a pure `next()` —
 *      byte-identical behaviour to the pre-Phase-2 build, which is what makes
 *      `GYMS_RETIRED=false` a total, instant, lossless rollback of the cutover.
 *
 * Wired at the `/gyms` mount (4 routes) and in front of `train` / `switch-gym` / `rank-up-gym`
 * in `routes/fighterRoutes.js` (3 routes).
 *
 * DELIBERATELY NOT WIRED: `GET /quests/:fighterId/:gymId`. Gym Side Quests retire with the gyms
 * (owner decision P2-D5), but that route degrades to an empty list on its own — 410'ing it would
 * turn a quiet ending into a red error on a screen the player can still open.
 */
const config = require("../config");

/** The exact 410 body. Frozen; every response gets a fresh copy so nothing can mutate it. */
const GYMS_RETIRED_BODY = Object.freeze({
    message: "The 10 gyms have closed. Training now happens in your own camp.",
    code: "gyms_retired",
});

function blockWhenGymsRetired(req, res, next) {
    // Read at request time, not at require time: tests (and a future admin toggle) flip
    // config.features.gymsRetired in place, and a cached boolean would ignore them.
    if (!config.features.gymsRetired) return next();
    return res.status(410).json({ ...GYMS_RETIRED_BODY });
}

module.exports = blockWhenGymsRetired;
module.exports.blockWhenGymsRetired = blockWhenGymsRetired;
module.exports.GYMS_RETIRED_BODY = GYMS_RETIRED_BODY;
