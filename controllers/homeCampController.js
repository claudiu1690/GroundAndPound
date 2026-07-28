/**
 * Home Camp — thin HTTP layer. Validates request SHAPE, calls a service, maps err.code → status.
 * No game logic lives here (see the §8.1 note about fighterController#rankUpGym — do not copy it).
 *
 * Error envelope is always { message, code } and the FE branches on `code`, never `message`.
 * Internal failures never leak details: 500 → { message:"Internal server error",
 * code:"internal_error" } with the real error console.error'd.
 */
const homeCampService = require("../services/homeCampService");
const homeCampTrainingService = require("../services/homeCampTrainingService");
const homeCampCoachService = require("../services/homeCampCoachService");
const homeCampMarketService = require("../services/homeCampMarketService");

/** Codes a service may raise, mapped to their HTTP status. Anything else is a 500. */
const CODE_STATUS = {
    fighter_not_found: 404,
    camp_not_found: 404,
    coach_not_found: 404,
    name_required: 400,
    name_length: 400,
    name_profanity: 400,
    drill_required: 400,
    quantity_invalid: 400,
    unknown_drill: 400,
    drill_locked: 400,
    not_enough_energy: 400,
    injury_blocked: 400,
    max_rank: 400,
    requirements_not_met: 400,
    insufficient_cash: 400,
    perk_not_claimable: 400,
    perk_already_held: 400,
    // PHASE 1 — market, hire/fire, renovation, deep clean
    market_locked: 403,
    candidate_not_found: 404,
    candidate_expired: 400,
    slot_cooldown: 400,
    no_slot: 400,
    archetype_taken: 400,
    archetype_locked: 400,
    last_coach: 400,
    max_tier: 400,
    renovation_unavailable: 400,
    condition_full: 400,
};

/**
 * Extra fields a given error code is allowed to put on the response body — a WHITELIST, so a
 * service error can never leak an internal property into an HTTP response by accident.
 */
const CODE_EXTRAS = {
    requirements_not_met: ["reqs"],
    insufficient_cash: ["cost", "have"],
    market_locked: ["requiredTier", "currentTier"],
    slot_cooldown: ["until", "daysLeft"],
    no_slot: ["unlocked", "filled"],
    archetype_taken: ["archetype"],
    archetype_locked: ["archetype", "minCampTier"],
};

function handleError(res, err, scope) {
    const status = err && err.code ? CODE_STATUS[err.code] : undefined;
    if (status) {
        const body = { message: err.message, code: err.code };
        for (const key of CODE_EXTRAS[err.code] || []) {
            if (err[key] !== undefined) body[key] = err[key];
        }
        return res.status(status).json(body);
    }
    console.error(`[homeCamp:${scope}]`, err);
    return res.status(500).json({ message: "Internal server error", code: "internal_error" });
}

/** GET /home-camp/:fighterId — creates the camp on first call, applies the lazy neglect tick. */
async function getCamp(req, res) {
    try {
        res.json(await homeCampService.getCampState(req.params.fighterId));
    } catch (err) {
        handleError(res, err, "get");
    }
}

/** PATCH /home-camp/:fighterId/name — body { name }. */
async function renameCamp(req, res) {
    try {
        const name = req.body ? req.body.name : undefined;
        res.json(await homeCampService.renameCamp(req.params.fighterId, name));
    } catch (err) {
        handleError(res, err, "rename");
    }
}

/** POST /home-camp/:fighterId/train — body { coachId, drillKey, quantity? }. */
async function train(req, res) {
    try {
        const b = req.body || {};
        res.json(await homeCampTrainingService.runDrill(req.params.fighterId, {
            coachId: b.coachId === undefined ? null : b.coachId,
            drillKey: b.drillKey,
            quantity: b.quantity,
        }));
    } catch (err) {
        handleError(res, err, "train");
    }
}

/** POST /home-camp/:fighterId/coaches/:coachId/promote — body {}. */
async function promoteCoach(req, res) {
    try {
        const { promotion, fighter, camp } = await homeCampCoachService.attemptPromotion(
            req.params.fighterId,
            req.params.coachId
        );
        // ONE builder for the camp payload — GET and promote can never drift apart.
        res.json({ promotion, camp: homeCampService.buildCampState(fighter, camp) });
    } catch (err) {
        handleError(res, err, "promote");
    }
}

/**
 * POST /home-camp/:fighterId/coaches/:coachId/claim-perk — body {}.
 * Free: hands over the rank-4 perk a max-rank coach already earned (the gym→camp migration
 * case, where the conversion deliberately writes nothing to the fighter).
 */
async function claimCoachPerk(req, res) {
    try {
        const { perkGranted, badgeGranted, newlyEarnedBadges, fighter, camp } =
            await homeCampCoachService.claimCoachPerk(req.params.fighterId, req.params.coachId);
        // Same ONE builder as GET and promote — the camp payload can never drift apart.
        // badgeGranted / newlyEarnedBadges use the SAME keys and shapes as promote and train,
        // so the client reuses one badge-toast loop for all three.
        res.json({
            perkGranted,
            badgeGranted,
            newlyEarnedBadges,
            camp: homeCampService.buildCampState(fighter, camp),
        });
    } catch (err) {
        handleError(res, err, "claimPerk");
    }
}

/** GET /home-camp/:fighterId/market — rolls this week's candidates lazily on read. */
async function getMarket(req, res) {
    try {
        res.json(await homeCampMarketService.getMarketState(req.params.fighterId));
    } catch (err) {
        handleError(res, err, "market");
    }
}

/** POST /home-camp/:fighterId/market/:candidateId/hire — body {}. */
async function hireCandidate(req, res) {
    try {
        const { hire, fighter, camp } = await homeCampMarketService.hireCandidate(
            req.params.fighterId,
            req.params.candidateId
        );
        // Same ONE builder as GET — the camp payload can never drift between endpoints.
        res.json({ hire, camp: homeCampService.buildCampState(fighter, camp) });
    } catch (err) {
        handleError(res, err, "hire");
    }
}

/** DELETE /home-camp/:fighterId/coaches/:coachId — fires a coach. */
async function fireCoach(req, res) {
    try {
        const { fired, fighter, camp } = await homeCampMarketService.fireCoach(
            req.params.fighterId,
            req.params.coachId
        );
        res.json({ fired, camp: homeCampService.buildCampState(fighter, camp) });
    } catch (err) {
        handleError(res, err, "fire");
    }
}

/** POST /home-camp/:fighterId/renovate — body {}. */
async function renovate(req, res) {
    try {
        const { renovation, fighter, camp } = await homeCampService.renovateCamp(req.params.fighterId);
        res.json({ renovation, camp: homeCampService.buildCampState(fighter, camp) });
    } catch (err) {
        handleError(res, err, "renovate");
    }
}

/** POST /home-camp/:fighterId/deep-clean — body {}. */
async function deepClean(req, res) {
    try {
        const { deepClean: result, fighter, camp } = await homeCampService.deepClean(req.params.fighterId);
        res.json({ deepClean: result, camp: homeCampService.buildCampState(fighter, camp) });
    } catch (err) {
        handleError(res, err, "deepClean");
    }
}

module.exports = {
    getCamp,
    renameCamp,
    train,
    promoteCoach,
    claimCoachPerk,
    getMarket,
    hireCandidate,
    fireCoach,
    renovate,
    deepClean,
};
