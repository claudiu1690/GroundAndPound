const { Queue, Worker } = require("bullmq");
const { redis, ensureRedisConnected } = require("../lib/redis");
const {
    tickAllActiveEnergy,
    syncRedisEnergyToMongo,
} = require("../services/energyService");

const QUEUE_CONNECTION = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

const energyQueue = new Queue("energy", { connection: QUEUE_CONNECTION });
const energySyncQueue = new Queue("energy-sync", { connection: QUEUE_CONNECTION });

const energyWorker = new Worker(
    "energy",
    async () => {
        await tickAllActiveEnergy();
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);

const energySyncWorker = new Worker(
    "energy-sync",
    async () => {
        const synced = await syncRedisEnergyToMongo();
        if (synced > 0) console.log(`[Energy Sync] Synced ${synced} Redis key(s) to MongoDB`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);

energyWorker.on("error", (err) => console.error("[Energy Tick] Worker error:", err));
energySyncWorker.on("error", (err) => console.error("[Energy Sync] Worker error:", err));

async function startEnergyIncrementScheduler() {
    await ensureRedisConnected();

    await energyQueue.add("tick", {}, {
        repeat: { every: 60_000 },
        jobId: "energy-tick",
        removeOnComplete: true,
    });

    await energySyncQueue.add("sync", {}, {
        repeat: { every: 300_000 },
        jobId: "energy-sync",
        removeOnComplete: true,
    });

    console.log("[Energy] BullMQ scheduler started (tick: 60s, sync: 300s).");
}

module.exports = {
    startEnergyIncrementScheduler,
    energyQueue,
    energySyncQueue,
    energyWorker,
    energySyncWorker,
    redis,
};
