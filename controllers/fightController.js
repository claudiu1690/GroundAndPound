const fightService = require("../services/fightService");

const FIGHT_ERROR_CODES = {
    DOCTOR_VISIT_REQUIRED: "FIGHT_DOCTOR_VISIT_REQUIRED",
    DAILY_CAP_REACHED: "FIGHT_DAILY_CAP_REACHED",
    NOT_ENOUGH_ENERGY: "FIGHT_NOT_ENOUGH_ENERGY",
    NO_ACCEPTED_FIGHT: "FIGHT_NO_ACCEPTED_FIGHT",
    INVALID_STRATEGY: "FIGHT_INVALID_STRATEGY",
    INVALID_WEIGHT_CUT: "FIGHT_INVALID_WEIGHT_CUT",
    MENTAL_RESET_REQUIRED: "FIGHT_MENTAL_RESET_REQUIRED",
};

async function getOffers(req, res) {
    try {
        const offers = await fightService.generateOffers(req.params.fighterId);
        res.json(offers);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message?.startsWith("Cannot fight:")) {
            return res.status(400).json({ message: err.message, code: FIGHT_ERROR_CODES.DOCTOR_VISIT_REQUIRED });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function createOffer(req, res) {
    try {
        const { fighterId } = req.params;
        const { opponentId, offerType } = req.body;
        const fight = await fightService.createOffer(fighterId, opponentId, offerType);
        res.status(201).json(fight);
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "Opponent not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("mismatch") || err.message.includes("required"))) return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function acceptOffer(req, res) {
    try {
        const { fighterId, fightId } = req.params;
        const fight = await fightService.acceptOffer(fighterId, fightId);
        res.json(fight);
    } catch (err) {
        if (err.message && err.message.includes("not found")) return res.status(404).json({ message: err.message });
        if (err.message === "Not enough energy"
            || err.message?.startsWith("Daily fight cap reached")) {
            return res.status(400).json({
                message: err.message,
                code: err.message?.startsWith("Daily fight cap reached")
                    ? FIGHT_ERROR_CODES.DAILY_CAP_REACHED
                    : FIGHT_ERROR_CODES.NOT_ENOUGH_ENERGY
            });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function setWeightCut(req, res) {
    try {
        const { fighterId, fightId, weightCut } = req.body;
        if (!fighterId || !fightId || !weightCut) {
            return res.status(400).json({ message: "fighterId, fightId, and weightCut are required" });
        }
        const fight = await fightService.setWeightCut(fighterId, fightId, weightCut);
        res.json(fight);
    } catch (err) {
        if (err.message === "Invalid weight cut strategy") {
            return res.status(400).json({ message: err.message, code: FIGHT_ERROR_CODES.INVALID_WEIGHT_CUT });
        }
        if (err.message === "Fight not found or not accepted") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function setStrategy(req, res) {
    try {
        const { fighterId, fightId, strategy } = req.body;
        if (!fighterId || !fightId || !strategy) {
            return res.status(400).json({ message: "fighterId, fightId, and strategy are required" });
        }
        const fight = await fightService.setStrategy(fighterId, fightId, strategy);
        res.json(fight);
    } catch (err) {
        if (err.message === "Invalid strategy") {
            return res.status(400).json({ message: err.message, code: FIGHT_ERROR_CODES.INVALID_STRATEGY });
        }
        if (err.message === "Fight not found or not accepted") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function resolveFight(req, res) {
    try {
        const result = await fightService.resolveFightAndApply(req.params.fighterId);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "Fight not found" || err.message === "Opponent not found") return res.status(404).json({ message: err.message });
        if (err.message === "No accepted fight" || err.message === "Not enough energy"
            || err.message?.startsWith("Cannot fight:")
            || err.message?.startsWith("Mental Reset required")) {
            let code = null;
            if (err.message === "No accepted fight") code = FIGHT_ERROR_CODES.NO_ACCEPTED_FIGHT;
            else if (err.message === "Not enough energy") code = FIGHT_ERROR_CODES.NOT_ENOUGH_ENERGY;
            else if (err.message?.startsWith("Cannot fight:")) code = FIGHT_ERROR_CODES.DOCTOR_VISIT_REQUIRED;
            else if (err.message?.startsWith("Mental Reset required")) code = FIGHT_ERROR_CODES.MENTAL_RESET_REQUIRED;
            return res.status(400).json({ message: err.message, code });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getOffers, createOffer, acceptOffer, setWeightCut, setStrategy, resolveFight };
