const { Queue, Worker } = require("bullmq");
const { redis, ensureRedisConnected } = require("../lib/redis");
const {
    tickAllActiveEnergy,
    syncRedisEnergyToMongo,
} = require("../services/energyService");
const notorietyService = require("../services/notorietyService");
const injuryHealService = require("../services/injuryHealService");

const QUEUE_CONNECTION = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

const energyQueue = new Queue("energy", { connection: QUEUE_CONNECTION });
const energySyncQueue = new Queue("energy-sync", { connection: QUEUE_CONNECTION });
const notorietyDecayQueue = new Queue("notoriety-decay", { connection: QUEUE_CONNECTION });
const injuryHealQueue = new Queue("injury-heal", { connection: QUEUE_CONNECTION });

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

const notorietyDecayWorker = new Worker(
    "notoriety-decay",
    async () => {
        const n = await notorietyService.runNotorietyDecayBatch();
        if (n > 0) console.log(`[Notoriety decay] Applied inactivity decay to ${n} fighter(s).`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);

notorietyDecayWorker.on("error", (err) => console.error("[Notoriety decay] Worker error:", err));

const injuryHealWorker = new Worker(
    "injury-heal",
    async () => {
        const { touched, healed } = await injuryHealService.runInjuryHealBatch();
        if (touched > 0) console.log(`[Injury heal] Ticked ${touched} fighter(s); healed ${healed} injury(ies).`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);

injuryHealWorker.on("error", (err) => console.error("[Injury heal] Worker error:", err));

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

    await notorietyDecayQueue.add("decay", {}, {
        repeat: { every: 86_400_000 },
        jobId: "notoriety-inactivity-decay",
        removeOnComplete: true,
    });

    await injuryHealQueue.add("heal", {}, {
        repeat: { every: 86_400_000 },
        jobId: "injury-daily-heal",
        removeOnComplete: true,
    });

    console.log("[Energy] BullMQ scheduler started (tick: 60s, sync: 300s, notoriety decay: 24h, injury heal: 24h).");
}

module.exports = {
    startEnergyIncrementScheduler,
    energyQueue,
    energySyncQueue,
    notorietyDecayQueue,
    injuryHealQueue,
    energyWorker,
    energySyncWorker,
    notorietyDecayWorker,
    injuryHealWorker,
    redis,
};
