const Fighter = require("../models/fighterModel");
const { ENERGY } = require("../consts/gameConstants");
const { redis, ensureRedisConnected } = require("../lib/redis");

/** Build the Redis hash key for a fighter's live energy state. */
const ENERGY_KEY = (id) => `energy:${id}`;

/**
 * Normalize Mongo fighter energy shape into the canonical object form.
 * Supports legacy numeric `energy` values for backward compatibility.
 * @param {Object} fighter
 * @returns {{ current: number, max: number }}
 */
function readMongoEnergy(fighter) {
    if (!fighter) return { current: ENERGY.max, max: ENERGY.max };
    if (fighter.energy && typeof fighter.energy === "object") {
        return {
            current: Number.isFinite(fighter.energy.current) ? fighter.energy.current : ENERGY.max,
            max: Number.isFinite(fighter.energy.max) ? fighter.energy.max : ENERGY.max,
        };
    }
    // Backward compatibility with legacy numeric field.
    if (Number.isFinite(fighter.energy)) {
        return { current: fighter.energy, max: ENERGY.max };
    }
    return { current: ENERGY.max, max: ENERGY.max };
}

/**
 * Read live energy from Redis, falling back to MongoDB on cold start.
 * @param {string} characterId
 * @returns {Promise<{ current: number, max: number }>}
 */
async function getEnergy(characterId) {
    await ensureRedisConnected();
    const cached = await redis.hgetall(ENERGY_KEY(characterId));
    if (cached && cached.current !== undefined && cached.max !== undefined) {
        return { current: parseInt(cached.current, 10), max: parseInt(cached.max, 10) };
    }

    const fighter = await Fighter.findById(characterId).select("energy");
    if (!fighter) throw new Error("Fighter not found");

    const mongoEnergy = readMongoEnergy(fighter);
    await redis.hset(ENERGY_KEY(characterId), {
        current: mongoEnergy.current,
        max: mongoEnergy.max,
    });
    return mongoEnergy;
}

/**
 * Spend energy atomically in Redis and asynchronously persist backup to Mongo.
 * @param {string} characterId
 * @param {number} amount
 * @returns {Promise<{ current: number, max: number }>}
 */
async function deductEnergy(characterId, amount) {
    const { current, max } = await getEnergy(characterId);
    if (current < amount) throw new Error("Not enough energy");
    const newValue = current - amount;

    await ensureRedisConnected();
    await redis.hset(ENERGY_KEY(characterId), "current", newValue);
    Fighter.findByIdAndUpdate(characterId, {
        "energy.current": newValue,
        "energy.max": max,
        "energy.lastSyncedAt": new Date(),
    }).catch((err) => console.error("Energy MongoDB sync error:", err));

    return { current: newValue, max };
}

/**
 * Add energy (capped at max) and persist snapshot to Mongo backup.
 * @param {string} characterId
 * @param {number} amount
 * @returns {Promise<{ current: number, max: number }>}
 */
async function addEnergy(characterId, amount) {
    const { current, max } = await getEnergy(characterId);
    const newValue = Math.min(current + amount, max);
    await ensureRedisConnected();
    await redis.hset(ENERGY_KEY(characterId), "current", newValue);
    Fighter.findByIdAndUpdate(characterId, {
        "energy.current": newValue,
        "energy.max": max,
        "energy.lastSyncedAt": new Date(),
    }).catch((err) => console.error("Energy MongoDB sync error:", err));
    return { current: newValue, max };
}

/**
 * Update a fighter's energy max in Redis and Mongo.
 * Current value is clamped to the new max.
 * @param {string} characterId
 * @param {number} max
 * @returns {Promise<{ current: number, max: number }>}
 */
async function setEnergyMax(characterId, max) {
    const normalizedMax = Number.isFinite(max) ? max : ENERGY.max;
    const current = await getEnergy(characterId);
    const currentClamped = Math.min(current.current, normalizedMax);

    await ensureRedisConnected();
    await redis.hset(ENERGY_KEY(characterId), {
        current: currentClamped,
        max: normalizedMax,
    });
    await Fighter.findByIdAndUpdate(characterId, {
        "energy.current": currentClamped,
        "energy.max": normalizedMax,
        "energy.lastSyncedAt": new Date(),
    });

    return { current: currentClamped, max: normalizedMax };
}

/**
 * BullMQ tick worker body: increment every active Redis energy key by 1.
 * @returns {Promise<void>}
 */
async function tickAllActiveEnergy() {
    await ensureRedisConnected();
    let cursor = "0";
    do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "energy:*", "COUNT", 500);
        cursor = nextCursor;

        if (keys.length === 0) continue;

        const readPipeline = redis.pipeline();
        for (const key of keys) readPipeline.hgetall(key);
        const rows = await readPipeline.exec();

        const updatePipeline = redis.pipeline();
        for (let i = 0; i < keys.length; i++) {
            const data = rows[i][1] || {};
            const current = parseInt(data.current, 10);
            const max = parseInt(data.max, 10);
            if (!Number.isFinite(current) || !Number.isFinite(max)) continue;
            if (current < max) updatePipeline.hset(keys[i], "current", Math.min(current + 1, max));
        }
        await updatePipeline.exec();
    } while (cursor !== "0");
}

/**
 * BullMQ sync worker body: write Redis energy snapshots back to Mongo.
 * @returns {Promise<number>} Number of synced fighter records
 */
async function syncRedisEnergyToMongo() {
    await ensureRedisConnected();
    const bulkOps = [];
    let cursor = "0";

    do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "energy:*", "COUNT", 500);
        cursor = nextCursor;
        if (keys.length === 0) continue;

        const readPipeline = redis.pipeline();
        for (const key of keys) readPipeline.hgetall(key);
        const rows = await readPipeline.exec();

        for (let i = 0; i < keys.length; i++) {
            const data = rows[i][1] || {};
            const current = parseInt(data.current, 10);
            const max = parseInt(data.max, 10);
            if (!Number.isFinite(current) || !Number.isFinite(max)) continue;
            const fighterId = keys[i].replace("energy:", "");
            bulkOps.push({
                updateOne: {
                    filter: { _id: fighterId },
                    update: {
                        $set: {
                            "energy.current": current,
                            "energy.max": max,
                            "energy.lastSyncedAt": new Date(),
                        },
                    },
                },
            });
        }
    } while (cursor !== "0");

    if (bulkOps.length > 0) {
        await Fighter.bulkWrite(bulkOps, { ordered: false });
    }

    return bulkOps.length;
}

module.exports = {
    ENERGY_KEY,
    getEnergy,
    deductEnergy,
    addEnergy,
    setEnergyMax,
    tickAllActiveEnergy,
    syncRedisEnergyToMongo,
};
