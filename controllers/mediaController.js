const mediaHubService = require("../services/mediaHubService");

const NOT_FOUND_MESSAGES = new Set([
    "Fighter not found",
    "Target opponent not found",
]);

// Client-facing 400 messages. Anything not in here (and not a 404) is a 500.
const CLIENT_400_MESSAGES = new Set([
    // podcast
    "Pick exactly 2 segments",
    "Segments must be distinct",
    "Unknown podcast segment",
    "Podcast already recorded today",
    "No completed fight to talk about",
    "Segment unavailable",
    "Target opponent required",
    "Target is not a valid opponent right now",
    "Guest segment requires a tone (TRASH or RESPECT)",
    "Requires Regional Pro",
    "Requires National",
    "Requires GCS Contender",
    "Requires GCS",
    "Not enough energy",
    // documentary
    "Invalid documentary focus",
    "Invalid documentary tone",
    "Invalid documentary timing",
    "You've already recorded your documentary",
    "Documentary unlocks at Star fame tier",
    // appearances
    "Appearance expired — pool refreshed",
    "Appearance already taken",
    "Appearance has expired",
    "Unknown appearance type",
    "Active sponsor required for this appearance",
    "Tone required (TRASH or RESPECT)",
    // persona
    "Invalid persona preview request",
]);

function handleError(res, err) {
    if (NOT_FOUND_MESSAGES.has(err.message)) {
        return res.status(404).json({ message: err.message });
    }
    if (CLIENT_400_MESSAGES.has(err.message) || /^Requires /.test(err.message || "")) {
        return res.status(400).json({ message: err.message });
    }
    console.error("[media]", err);
    return res.status(500).json({ message: "Internal server error" });
}

async function getState(req, res) {
    try {
        res.json(await mediaHubService.getHubState(req.params.fighterId));
    } catch (err) {
        handleError(res, err);
    }
}

async function getTargets(req, res) {
    try {
        res.json(await mediaHubService.getTargets(req.params.fighterId));
    } catch (err) {
        handleError(res, err);
    }
}

async function postPodcast(req, res) {
    try {
        res.json(await mediaHubService.recordPodcast(req.params.fighterId, req.body || {}));
    } catch (err) {
        handleError(res, err);
    }
}

async function postDocumentary(req, res) {
    try {
        res.status(201).json(await mediaHubService.recordDocumentary(req.params.fighterId, req.body || {}));
    } catch (err) {
        handleError(res, err);
    }
}

async function getAppearances(req, res) {
    try {
        res.json(await mediaHubService.getAppearances(req.params.fighterId));
    } catch (err) {
        handleError(res, err);
    }
}

async function postAppearance(req, res) {
    try {
        res.json(await mediaHubService.takeAppearance(
            req.params.fighterId,
            req.params.instanceId,
            req.body || {},
        ));
    } catch (err) {
        handleError(res, err);
    }
}

async function postPersonaPreview(req, res) {
    try {
        res.json(await mediaHubService.previewPersona(req.params.fighterId, req.body || {}));
    } catch (err) {
        handleError(res, err);
    }
}

async function getRivalry(req, res) {
    try {
        res.json(await mediaHubService.getRivalry(req.params.fighterId));
    } catch (err) {
        handleError(res, err);
    }
}

async function getArchive(req, res) {
    try {
        res.json(await mediaHubService.getArchive(req.params.fighterId, {
            filter: req.query.filter || "all",
            page: req.query.page || 1,
        }));
    } catch (err) {
        handleError(res, err);
    }
}

module.exports = {
    getState,
    getTargets,
    postPodcast,
    postDocumentary,
    getAppearances,
    postAppearance,
    postPersonaPreview,
    getRivalry,
    getArchive,
};
