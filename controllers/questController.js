const questService = require("../services/questService");

async function getGymQuests(req, res) {
    try {
        const { fighterId, gymId } = req.params;
        const progress = await questService.getQuestProgress(fighterId, gymId);
        res.json(progress);
    } catch (err) {
        if (err.message === "Gym not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getGymQuests };
