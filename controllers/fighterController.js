const fighterService = require("../services/fighterService");

async function list(req, res) {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const fighters = await fighterService.listFighters(limit);
        res.json(fighters);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function create(req, res) {
    try {
        const fighter = await fighterService.createFighter(req.body);
        res.status(201).json(fighter);
    } catch (err) {
        if (err.message && err.message.includes("required")) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getById(req, res) {
    try {
        const fighter = await fighterService.getFighterById(req.params.id);
        const statProgress = fighterService.buildStatProgress(fighter);
        res.json({ ...fighter.toObject(), statProgress });
    } catch (err) {
        if (err.message === "Fighter not found") {
            return res.status(404).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function update(req, res) {
    try {
        const fighter = await fighterService.updateFighter(req.params.id, req.body);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") {
            return res.status(404).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function deductEnergy(req, res) {
    try {
        const amount = parseInt(req.body.amount || req.query.amount, 10) || 1;
        const fighter = await fighterService.deductEnergy(req.params.id, amount);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") res.status(404).json({ message: err.message });
        else if (err.message === "Not enough energy") res.status(400).json({ message: err.message });
        else {
            console.error(err);
            res.status(500).json({ message: "Internal server error" });
        }
    }
}

async function train(req, res) {
    try {
        const { id } = req.params;
        const { gymId, sessionType } = req.body;
        if (!gymId || !sessionType) {
            return res.status(400).json({ message: "gymId and sessionType are required" });
        }
        const trainingService = require("../services/trainingService");
        const result = await trainingService.doTraining(id, gymId, sessionType);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message === "Gym not found") return res.status(404).json({ message: err.message });
        if (err.message === "Not enough energy" || err.message === "Unknown training session type"
            || err.message.includes("gym") || err.message.startsWith("Cannot spar")
            || err.message.startsWith("Cannot do")) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function rest(req, res) {
    try {
        const fighter = await fighterService.rest(req.params.id);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message === "Not enough energy") return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function doctorVisit(req, res) {
    try {
        const { injuryType } = req.body;
        if (!injuryType) return res.status(400).json({ message: "injuryType is required" });
        const fighter = await fighterService.doctorVisit(req.params.id, injuryType);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("Not enough") || err.message.includes("not found") || err.message.includes("not require"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function mentalReset(req, res) {
    try {
        const fighter = await fighterService.mentalReset(req.params.id);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("Not enough") || err.message.includes("not required"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function payGymMembership(req, res) {
    try {
        const fighter = await fighterService.payGymMembership(req.params.id, req.body.gymId);
        res.json({ fighter, message: "Membership paid successfully." });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

module.exports = { list, create, getById, update, deductEnergy, train, rest, doctorVisit, mentalReset, payGymMembership };
