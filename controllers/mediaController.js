const mediaService = require("../services/mediaService");

async function getState(req, res) {
    try {
        const state = await mediaService.getMediaState(req.params.fighterId);
        res.json(state);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getDivisionRoster(req, res) {
    try {
        const roster = await mediaService.listDivisionRoster(req.params.fighterId);
        res.json({ roster });
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function postPodcast(req, res) {
    try {
        const result = await mediaService.doPodcast(req.params.fighterId, req.body || {});
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "Target opponent not found") {
            return res.status(404).json({ message: err.message });
        }
        const client = [
            "Podcast is on cooldown — next one unlocks at midnight",
            "Not enough energy",
            "Unknown podcast segment",
            "No completed fight to recap",
            "Invalid division-talk tone",
            "Target opponent required for division talk",
            "Target must share your weight class",
            "Target must share your promotion tier",
            "Event + prediction required",
            "Unsupported podcast segment",
            "Invalid side",
            "Invalid method",
            "Event already resolved",
            "You have already predicted this event",
        ];
        if (client.includes(err.message)) return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function postDocumentary(req, res) {
    try {
        const result = await mediaService.doDocumentary(req.params.fighterId);
        res.status(201).json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message === "You've already recorded your documentary"
            || err.message?.startsWith("Documentary unlocks at")) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getArchive(req, res) {
    try {
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
        const archive = await mediaService.listInterviewArchive(req.params.fighterId, limit);
        res.json({ archive });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getState, getDivisionRoster, postPodcast, postDocumentary, getArchive };
