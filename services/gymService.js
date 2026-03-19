const Gym = require("../models/gymModel");
const { GYM_TIERS } = require("../consts/gameConstants");

/**
 * Attach tier metadata used by the frontend for labels/caps.
 * @param {Object} gym
 * @returns {Object}
 */
function withTierInfo(gym) {
    return {
        ...gym,
        tierInfo: GYM_TIERS[gym.tier] || null,
    };
}

/**
 * List gyms, optionally filtered by tier.
 * @param {string|null} tier
 * @returns {Promise<Array<Object>>}
 */
async function listGyms(tier = null) {
    const filter = tier ? { tier } : {};
    const gyms = await Gym.find(filter).lean();
    return gyms.map(withTierInfo);
}

/**
 * Fetch a single gym by id.
 * @param {string} id
 * @returns {Promise<Object>}
 */
async function getGymById(id) {
    const gym = await Gym.findById(id);
    if (!gym) throw new Error("Gym not found");
    return gym;
}

/**
 * Create a gym document.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
async function createGym(data) {
    const gym = new Gym(data);
    await gym.save();
    return gym;
}

module.exports = { listGyms, getGymById, createGym };
