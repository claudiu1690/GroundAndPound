const Gym = require("../models/gymModel");
const Fighter = require("../models/fighterModel");
const gymRankService = require("../services/gymRankService");

async function list(req, res) {
    try {
        const gyms = await Gym.find({}).sort({ isFreeGym: -1, weeklyCost: 1 }).lean();
        res.json(gyms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getById(req, res) {
    try {
        const gym = await Gym.findById(req.params.id).lean();
        if (!gym) return res.status(404).json({ message: "Gym not found" });
        res.json(gym);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * Get a fighter's progress at a specific gym.
 */
async function getProgress(req, res) {
    try {
        const gym = await Gym.findById(req.params.id);
        if (!gym) return res.status(404).json({ message: "Gym not found" });
        const fighter = await Fighter.findById(req.params.fighterId);
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });

        const progress = gymRankService.getGymProgress(fighter, gym);
        res.json(progress);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * List all gyms with fighter's rank progress for each.
 */
async function listWithProgress(req, res) {
    try {
        const fighter = await Fighter.findById(req.params.fighterId);
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });

        const gyms = await Gym.find({}).sort({ isFreeGym: -1, weeklyCost: 1 }).lean();
        const enriched = gyms.map((gym) => {
            const progress = gym.isFreeGym
                ? { rank: 0, rankName: "Free Gym" }
                : gymRankService.getGymProgress(fighter, gym);

            const isActive = !gym.isFreeGym
                && String(fighter.activeGymId) === String(gym._id)
                && fighter.activeGymPaidUntil
                && new Date(fighter.activeGymPaidUntil) > new Date();

            const daysLeft = isActive
                ? Math.max(0, Math.ceil((new Date(fighter.activeGymPaidUntil) - Date.now()) / (24 * 60 * 60 * 1000)))
                : 0;

            return {
                ...gym,
                progress,
                membership: {
                    isActive,
                    daysLeft,
                    paidUntil: fighter.activeGymPaidUntil,
                },
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { list, getById, getProgress, listWithProgress };
