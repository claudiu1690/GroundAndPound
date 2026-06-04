const { Queue, Worker } = require("bullmq");
const config = require("../config");
const { redis, ensureRedisConnected } = require("../lib/redis");
const {
    tickAllActiveEnergy,
    syncRedisEnergyToMongo,
} = require("../services/energyService");
const notorietyService = require("../services/notorietyService");
const injuryHealService = require("../services/injuryHealService");
const accountService = require("../services/accountService");
const pvpService = require("../services/pvpService");

/**
 * Build the connection config BullMQ uses for every Queue and Worker.
 *
 * Priority:
 *   1. REDIS_URL — single connection string (Railway, Render, Heroku, Upstash all use this).
 *      Supports rediss:// for TLS endpoints (Railway's public proxy needs TLS;
 *      same-project internal URLs do not).
 *   2. REDIS_HOST / REDIS_PORT / REDIS_PASSWORD — legacy split-vars fallback.
 *   3. 127.0.0.1:6379 — local dev default.
 *
 * Returning a plain config object (not an ioredis instance) lets BullMQ create a
 * fresh connection per Queue/Worker, which is what BullMQ recommends — workers
 * can't safely share connections that are also used for non-streaming ops.
 *
 * maxRetriesPerRequest: null and enableReadyCheck: false are required by BullMQ
 * (the workers block forever on BRPOP / XREAD; otherwise ioredis will time them out).
 */
const BULLMQ_BASE_OPTS = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
};

function buildQueueConnection() {
    // config.redis.url already honors LOCAL_MODE + REDIS_URL + REDIS_URL_LOCAL precedence.
    const u = new URL(config.redis.url);
    return {
        ...BULLMQ_BASE_OPTS,
        host: u.hostname,
        port: Number(u.port) || 6379,
        username: u.username ? decodeURIComponent(u.username) : undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined,
        // rediss:// (TLS) — required by Railway's public Redis proxy and Upstash.
        tls: u.protocol === "rediss:" ? {} : undefined,
    };
}

const QUEUE_CONNECTION = buildQueueConnection();

// Boot breadcrumb (password masked) so it's obvious where the workers point.
console.log(
    `[scheduler] BullMQ Redis target: ${QUEUE_CONNECTION.host}:${QUEUE_CONNECTION.port}` +
    `${QUEUE_CONNECTION.tls ? " (TLS)" : ""}` +
    `${QUEUE_CONNECTION.password ? " (auth)" : ""}`
);

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
        const { touched, healed, failed } = await injuryHealService.runInjuryHealBatch();
        if (touched > 0) console.log(`[Injury heal] Ticked ${touched} fighter(s); healed ${healed} injury(ies).`);
        if (failed > 0) console.error(`[Injury heal] ${failed} fighter(s) failed to tick — see prior errors.`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);

injuryHealWorker.on("error", (err) => console.error("[Injury heal] Worker error:", err));

// ── Hard-delete sweep — purges soft-deleted accounts past their 30-day grace ─
const hardDeleteQueue = new Queue("hard-delete", { connection: QUEUE_CONNECTION });
const hardDeleteWorker = new Worker(
    "hard-delete",
    async () => {
        const { purged } = await accountService.runHardDeleteSweep();
        if (purged > 0) console.log(`[Hard delete] Permanently purged ${purged} account(s) past the 30-day grace window.`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);
hardDeleteWorker.on("error", (err) => console.error("[Hard delete] Worker error:", err));

// ── PvP v1 — nightly ladder recalc + belt decay ──────────────────────────────
const pvpLadderRecalcQueue = new Queue("pvp-ladder-recalc", { connection: QUEUE_CONNECTION });
const pvpBeltDecayQueue = new Queue("pvp-belt-decay", { connection: QUEUE_CONNECTION });

const pvpLadderRecalcWorker = new Worker(
    "pvp-ladder-recalc",
    async () => {
        const { ranked, championSeeded } = await pvpService.runLadderRecalcBatch();
        if (ranked > 0) {
            console.log(`[PvP ladder recalc] Reranked ${ranked} fighter(s)${championSeeded ? " (seeded champion)" : ""}.`);
        }
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);
pvpLadderRecalcWorker.on("failed", (job, err) =>
    console.error(`[PvP ladder recalc] Job ${job?.id} failed:`, err));
pvpLadderRecalcWorker.on("error", (err) => console.error("[PvP ladder recalc] Worker error:", err));

const pvpBeltDecayWorker = new Worker(
    "pvp-belt-decay",
    async () => {
        const { processed } = await pvpService.runBeltDecayBatch();
        if (processed > 0) console.log(`[PvP belt decay] Processed ${processed} champion(s).`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);
pvpBeltDecayWorker.on("failed", (job, err) =>
    console.error(`[PvP belt decay] Job ${job?.id} failed:`, err));
pvpBeltDecayWorker.on("error", (err) => console.error("[PvP belt decay] Worker error:", err));

// ── The Circuit v1.1 — nightly rivalry heat decay ─────────────────────────────
const pvpRivalryHeatDecayQueue = new Queue("pvp-rivalry-heat-decay", { connection: QUEUE_CONNECTION });
const pvpRivalryHeatDecayWorker = new Worker(
    "pvp-rivalry-heat-decay",
    async () => {
        const { decayed } = await pvpService.runRivalryHeatDecayBatch();
        if (decayed > 0) console.log(`[PvP rivalry heat decay] Cooled ${decayed} rivalry(ies).`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);
pvpRivalryHeatDecayWorker.on("failed", (job, err) =>
    console.error(`[PvP rivalry heat decay] Job ${job?.id} failed:`, err));
pvpRivalryHeatDecayWorker.on("error", (err) => console.error("[PvP rivalry heat decay] Worker error:", err));

// ── The Circuit v1.2 — nightly season rollover + bounty expiry ────────────────
const pvpSeasonRolloverQueue = new Queue("pvp-season-rollover", { connection: QUEUE_CONNECTION });
const pvpBountyExpiryQueue = new Queue("pvp-bounty-expiry", { connection: QUEUE_CONNECTION });

const pvpSeasonRolloverWorker = new Worker(
    "pvp-season-rollover",
    async () => {
        // No-op until now ≥ active.ends_at (the batch self-gates on the season state flip).
        const res = await pvpService.runSeasonRolloverBatch();
        if (res.rolledOver) {
            console.log(`[PvP season rollover] Season ${res.season} → ${res.nextSeason}: reset ${res.ranked} fighter(s), rewarded ${res.rewarded}, champion ${res.championId || "none"}.`);
        }
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);
pvpSeasonRolloverWorker.on("failed", (job, err) =>
    console.error(`[PvP season rollover] Job ${job?.id} failed:`, err));
pvpSeasonRolloverWorker.on("error", (err) => console.error("[PvP season rollover] Worker error:", err));

const pvpBountyExpiryWorker = new Worker(
    "pvp-bounty-expiry",
    async () => {
        const { expired, refunded_iron } = await pvpService.runBountyExpiryBatch();
        if (expired > 0) console.log(`[PvP bounty expiry] Expired ${expired} bounty(ies); refunded ${refunded_iron} iron.`);
    },
    { connection: QUEUE_CONNECTION, concurrency: 1 }
);
pvpBountyExpiryWorker.on("failed", (job, err) =>
    console.error(`[PvP bounty expiry] Job ${job?.id} failed:`, err));
pvpBountyExpiryWorker.on("error", (err) => console.error("[PvP bounty expiry] Worker error:", err));

async function startEnergyIncrementScheduler() {
    await ensureRedisConnected();

    // One-shot cleanup: a previous deploy registered a 24h repeatable job under
    // jobId "injury-daily-heal". The new hourly job uses a different jobId, so
    // without this both would fire indefinitely. Removing the old one is safe
    // (no-op if it doesn't exist).
    try {
        const repeatables = await injuryHealQueue.getRepeatableJobs();
        for (const r of repeatables) {
            if (r.id === "injury-daily-heal") {
                await injuryHealQueue.removeRepeatableByKey(r.key);
                console.log("[scheduler] Removed legacy daily injury-heal job.");
            }
        }
    } catch (e) {
        console.warn("[scheduler] Legacy injury-daily-heal cleanup failed (non-fatal):", e.message);
    }

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

    // Hourly — matches the hour-resolution recovery timer (see
    // injuryUtils.tickRecoveryForFighter). Lazy ticks on fighter load still
    // catch active players in real time; this just keeps idle accounts in sync.
    await injuryHealQueue.add("heal", {}, {
        repeat: { every: 3_600_000 },
        jobId: "injury-hourly-heal",
        removeOnComplete: true,
    });

    await hardDeleteQueue.add("sweep", {}, {
        repeat: { every: 86_400_000 },
        jobId: "account-hard-delete",
        removeOnComplete: true,
    });

    await pvpLadderRecalcQueue.add("recalc", {}, {
        repeat: { every: 86_400_000 },
        jobId: "pvp-ladder-recalc",
        removeOnComplete: true,
    });

    await pvpBeltDecayQueue.add("decay", {}, {
        repeat: { every: 86_400_000 },
        jobId: "pvp-belt-decay",
        removeOnComplete: true,
    });

    await pvpRivalryHeatDecayQueue.add("decay", {}, {
        repeat: { every: 86_400_000 },
        jobId: "pvp-rivalry-heat-decay",
        removeOnComplete: true,
    });

    await pvpSeasonRolloverQueue.add("rollover", {}, {
        repeat: { every: 86_400_000 },
        jobId: "pvp-season-rollover",
        removeOnComplete: true,
    });

    await pvpBountyExpiryQueue.add("expiry", {}, {
        repeat: { every: 86_400_000 },
        jobId: "pvp-bounty-expiry",
        removeOnComplete: true,
    });

    console.log("[Energy] BullMQ scheduler started (tick: 60s, sync: 300s, notoriety decay: 24h, injury heal: 1h, hard delete: 24h, pvp ladder recalc: 24h, pvp belt decay: 24h, pvp rivalry heat decay: 24h, pvp season rollover: 24h, pvp bounty expiry: 24h).");
}

module.exports = {
    startEnergyIncrementScheduler,
    energyQueue,
    energySyncQueue,
    notorietyDecayQueue,
    injuryHealQueue,
    hardDeleteQueue,
    pvpLadderRecalcQueue,
    pvpBeltDecayQueue,
    pvpRivalryHeatDecayQueue,
    pvpSeasonRolloverQueue,
    pvpBountyExpiryQueue,
    energyWorker,
    energySyncWorker,
    notorietyDecayWorker,
    injuryHealWorker,
    hardDeleteWorker,
    pvpLadderRecalcWorker,
    pvpBeltDecayWorker,
    pvpRivalryHeatDecayWorker,
    pvpSeasonRolloverWorker,
    pvpBountyExpiryWorker,
    redis,
};
