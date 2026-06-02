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

// ── Atomic batch deduction (Lua) ──────────────────────────────
// Registered once at module load. Operates on a single `energy:<id>` hash so the
// HGETALL → compute affordable-k → HSET sequence cannot interleave with the regen
// tick or another concurrent train request. Keeps energy from going negative and
// guarantees the funded count matches what was actually subtracted.
//
// KEYS[1] = energy:<id> hash
// ARGV[1] = costPerSession (>0)  ARGV[2] = maxSessions (>=0)
// Returns: {-1} when the hash is cold (caller seeds from Mongo + retries once),
//          otherwise {funded, current, max}.
const DEDUCT_BATCH_LUA = `
local data = redis.call('HGETALL', KEYS[1])
if #data == 0 then
  return {-1}
end
local cur, max
for i = 1, #data, 2 do
  if data[i] == 'current' then cur = tonumber(data[i+1]) end
  if data[i] == 'max' then max = tonumber(data[i+1]) end
end
if cur == nil or max == nil then
  return {-1}
end
local cost = tonumber(ARGV[1])
local maxSessions = tonumber(ARGV[2])
local affordable = math.floor(cur / cost)
local k = affordable
if maxSessions < k then k = maxSessions end
if k < 0 then k = 0 end
if k <= 0 then
  return {0, cur, max}
end
local newCur = cur - k * cost
redis.call('HSET', KEYS[1], 'current', newCur)
return {k, newCur, max}
`;

let deductBatchCommandReady = false;
function ensureDeductBatchCommand() {
    if (deductBatchCommandReady) return;
    // Register as a custom command so ioredis manages SHA caching/reloads.
    redis.defineCommand("gpDeductBatchEnergy", { numberOfKeys: 1, lua: DEDUCT_BATCH_LUA });
    deductBatchCommandReady = true;
}

/**
 * Atomically deduct energy for up to `maxSessions` sessions in one shot.
 * Funds as many whole sessions as live energy allows, never going below zero.
 *
 * Cold-start: if the Redis hash is missing, seed it from Mongo via getEnergy()
 * (the existing populate path) and retry the script exactly once.
 *
 * Mirrors the post-deduct snapshot to Mongo fire-and-forget, matching deductEnergy.
 *
 * @param {string} characterId
 * @param {number} costPerSession - energy cost of a single session (>0)
 * @param {number} maxSessions - upper bound on sessions to fund (>=0)
 * @returns {Promise<{ funded: number, current: number, max: number }>}
 */
async function deductBatchEnergy(characterId, costPerSession, maxSessions) {
    if (!(costPerSession > 0)) throw new Error("costPerSession must be > 0");
    const cap = Math.max(0, Math.floor(maxSessions) || 0);

    await ensureRedisConnected();
    ensureDeductBatchCommand();

    const key = ENERGY_KEY(characterId);
    let res = await redis.gpDeductBatchEnergy(key, costPerSession, cap);

    // Cold hash → seed from Mongo (getEnergy HSETs current+max), retry once.
    if (Array.isArray(res) && res.length === 1 && Number(res[0]) === -1) {
        await getEnergy(characterId);
        res = await redis.gpDeductBatchEnergy(key, costPerSession, cap);
        if (Array.isArray(res) && res.length === 1 && Number(res[0]) === -1) {
            // Still cold (e.g. fighter vanished mid-flight) — treat as unfunded.
            const snap = await getEnergy(characterId);
            return { funded: 0, current: snap.current, max: snap.max };
        }
    }

    const funded = Number(res[0]);
    const current = Number(res[1]);
    const max = Number(res[2]);

    if (funded > 0) {
        Fighter.findByIdAndUpdate(characterId, {
            "energy.current": current,
            "energy.max": max,
            "energy.lastSyncedAt": new Date(),
        }).catch((err) => console.error("Energy MongoDB sync error:", err));
    }

    return { funded, current, max };
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
    deductBatchEnergy,
    addEnergy,
    setEnergyMax,
    tickAllActiveEnergy,
    syncRedisEnergyToMongo,
};
