const gymService = require("../services/gymService");

async function list(req, res) {
    try {
        const tier = req.query.tier || null;
        const gyms = await gymService.listGyms(tier);
        res.json(gyms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getById(req, res) {
    try {
        const gym = await gymService.getGymById(req.params.id);
        res.json(gym);
    } catch (err) {
        if (err.message === "Gym not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { list, getById };
