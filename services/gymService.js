const Gym = require("../models/gymModel");
const { GYM_TIERS } = require("../consts/gameConstants");

async function listGyms(tier = null) {
    const filter = tier ? { tier } : {};
    const gyms = await Gym.find(filter).lean();
    return gyms.map(g => ({
        ...g,
        tierInfo: GYM_TIERS[g.tier] || null
    }));
}

async function getGymById(id) {
    const gym = await Gym.findById(id);
    if (!gym) throw new Error("Gym not found");
    return gym;
}

async function createGym(data) {
    const gym = new Gym(data);
    await gym.save();
    return gym;
}

module.exports = { listGyms, getGymById, createGym };
