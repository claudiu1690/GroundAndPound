const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
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
