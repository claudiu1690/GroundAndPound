/**
 * PvP System v1 (Beta) — thin HTTP handlers.
 *
 * Routes mount at /pvp (no /api prefix). Attacker identity is always taken from
 * req.user.fighterId (JWT-trusted) — never from the client. Validation errors are
 * returned as { message, code }; internal errors as { message: "Internal server error" }
 * with no leaked detail.
 */
const pvpService = require("../services/pvpService");

// Map a pvpService validation `code` → HTTP status. 404 for not-found, else 400.
const STATUS_BY_CODE = {
    fighter_not_found: 404,
    contract_not_found: 404,
};

function sendValidationError(res, err) {
    const status = STATUS_BY_CODE[err.code] || 400;
    return res.status(status).json({ message: err.message, code: err.code });
}

function fighterIdFromReq(req) {
    return req.user && req.user.fighterId;
}

async function getLadder(req, res) {
    try {
        const viewerId = fighterIdFromReq(req);
        if (!viewerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const { page, limit, search } = req.query;
        const payload = await pvpService.getLadder({ page, limit, search, viewerId });
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getLadder failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getProfile(req, res) {
    try {
        // Pass the viewer (JWT-trusted) so the profile can compute rank_points_preview
        // for THIS viewer attacking the target. Never read the viewer from the client.
        const viewerId = fighterIdFromReq(req);
        const payload = await pvpService.getPvpProfile(req.params.fighterId, viewerId);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getProfile failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function attack(req, res) {
    try {
        const attackerId = fighterIdFromReq(req);
        if (!attackerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });

        const defenderId = req.params.defenderId;
        if (!defenderId || typeof defenderId !== "string") {
            return res.status(400).json({ message: "Missing defender id.", code: "fighter_not_found" });
        }

        // Validate body: offensive_camp must be an array of strings (hostile input).
        const raw = req.body ? req.body.offensive_camp : undefined;
        let offensiveCamp = [];
        if (raw !== undefined && raw !== null) {
            if (!Array.isArray(raw)) {
                return res.status(400).json({ message: "offensive_camp must be an array.", code: "invalid_camp" });
            }
            if (raw.some((s) => typeof s !== "string")) {
                return res.status(400).json({ message: "offensive_camp must contain session ids.", code: "invalid_camp" });
            }
            offensiveCamp = raw;
        }

        const payload = await pvpService.initiatePvpAttack(attackerId, defenderId, offensiveCamp);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] attack failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getHistory(req, res) {
    try {
        const fighterId = fighterIdFromReq(req);
        if (!fighterId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const { page, limit } = req.query;
        const payload = await pvpService.getHistory({ page, limit, fighterId });
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getHistory failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getPending(req, res) {
    try {
        const fighterId = fighterIdFromReq(req);
        if (!fighterId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const payload = await pvpService.getPending(fighterId);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getPending failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// ── The Circuit v1.1 ──────────────────────────────────────────────────────────

async function getHub(req, res) {
    try {
        const viewerId = fighterIdFromReq(req);
        if (!viewerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const payload = await pvpService.getPvpHub(viewerId);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getHub failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getRivalries(req, res) {
    try {
        const viewerId = fighterIdFromReq(req);
        if (!viewerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const payload = await pvpService.getRivalries(viewerId, { limit: req.query.limit });
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getRivalries failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function claimContract(req, res) {
    try {
        const fighterId = fighterIdFromReq(req);
        if (!fighterId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const { contractId } = req.params;
        if (!contractId || typeof contractId !== "string") {
            return res.status(404).json({ message: "Contract not found.", code: "contract_not_found" });
        }
        const payload = await pvpService.claimContract(fighterId, contractId);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] claimContract failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function setTitle(req, res) {
    try {
        const fighterId = fighterIdFromReq(req);
        if (!fighterId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        // Validate body: title must be a string or explicit null. Assume hostile input.
        const raw = req.body ? req.body.title : undefined;
        if (raw !== null && typeof raw !== "string") {
            return res.status(400).json({ message: "Invalid title.", code: "invalid_title" });
        }
        const payload = await pvpService.setActiveTitle(fighterId, raw === undefined ? null : raw);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] setTitle failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

// ── The Circuit v1.2 — Seasons & Bounties ─────────────────────────────────────

async function getBounties(req, res) {
    try {
        const viewerId = fighterIdFromReq(req);
        if (!viewerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const scope = typeof req.query.scope === "string" ? req.query.scope : "collectable";
        const payload = await pvpService.getBounties(viewerId, scope);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getBounties failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function postBounty(req, res) {
    try {
        const posterId = fighterIdFromReq(req);
        if (!posterId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });

        const body = req.body || {};
        // Validate body shape (hostile input). target_id required string; amount required;
        // method optional string. The service re-validates ranges + ownership.
        const targetId = body.target_id;
        if (!targetId || typeof targetId !== "string") {
            return res.status(400).json({ message: "Missing target id.", code: "fighter_not_found" });
        }
        if (body.amount === undefined || body.amount === null) {
            return res.status(400).json({ message: "Missing bounty amount.", code: "bounty_invalid_amount" });
        }
        const method = body.method_required === undefined ? "any" : body.method_required;
        if (method !== null && typeof method !== "string") {
            return res.status(400).json({ message: "Invalid bounty method.", code: "bounty_invalid_method" });
        }

        const payload = await pvpService.postBounty(posterId, targetId, body.amount, method);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] postBounty failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function getSeason(req, res) {
    try {
        const viewerId = fighterIdFromReq(req);
        if (!viewerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const payload = await pvpService.getSeason(viewerId);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] getSeason failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

async function markSeasonSeen(req, res) {
    try {
        const viewerId = fighterIdFromReq(req);
        if (!viewerId) return res.status(401).json({ message: "Unauthorized", code: "unauthorized" });
        const payload = await pvpService.markSeasonSeen(viewerId);
        return res.json(payload);
    } catch (err) {
        if (err.isPvpValidation) return sendValidationError(res, err);
        console.error("[pvp] markSeasonSeen failed:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    getLadder, getProfile, attack, getHistory, getPending,
    getHub, getRivalries, claimContract, setTitle,
    // The Circuit v1.2
    getBounties, postBounty, getSeason, markSeasonSeen,
};
