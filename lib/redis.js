const Redis = require("ioredis");
const config = require("../config");

const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

redis.on("error", (err) => console.error("Redis error:", err));
redis.on("connect", () => console.log("Redis connected"));

async function ensureRedisConnected() {
    if (redis.status === "ready" || redis.status === "connecting") return;
    await redis.connect();
}

module.exports = { redis, ensureRedisConnected };
