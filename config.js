// Load environment variables from .env (local dev / server) before anything
// else reads process.env. Safe no-op if the file is missing — falls through
// to OS-level env vars (e.g. those set by the hosting platform).
require('dotenv').config();

/**
 * LOCAL_MODE — the master "everything local" switch.
 *
 * Set LOCAL_MODE=true in .env and the app forces local Mongo + local Redis
 * regardless of any other URL settings. Set it to false (or remove it) and
 * the remote services are used. One toggle, both back-ends. On deployed
 * hosts (Railway etc.) leave it unset so the platform-provided MONGODB_URI /
 * REDIS_URL take effect.
 */
const LOCAL_MODE = String(process.env.LOCAL_MODE || '').toLowerCase() === 'true';

/**
 * MongoDB URI precedence:
 *   1. LOCAL_MODE=true → MONGODB_URI_LOCAL (master override, wins over everything).
 *   2. MONGODB_URI    → explicit override (CI / prod / per-command).
 *   3. USE_ATLAS=true → MONGODB_URI_ATLAS (the Atlas cluster).
 *   4. Fall through to MONGODB_URI_LOCAL, then localhost default.
 */
function resolveMongoUri() {
    if (LOCAL_MODE) return process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/mmaGame';
    if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
    const useAtlas = String(process.env.USE_ATLAS || '').toLowerCase() === 'true';
    if (useAtlas && process.env.MONGODB_URI_ATLAS) return process.env.MONGODB_URI_ATLAS;
    return process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/mmaGame';
}

/**
 * Redis URL precedence:
 *   1. LOCAL_MODE=true → REDIS_URL_LOCAL (master override).
 *   2. REDIS_URL       → explicit override (Railway/Render/Upstash inject this).
 *   3. Fall through to REDIS_URL_LOCAL, then localhost default.
 */
function resolveRedisUrl() {
    if (LOCAL_MODE) return process.env.REDIS_URL_LOCAL || 'redis://127.0.0.1:6379';
    if (process.env.REDIS_URL) return process.env.REDIS_URL;
    return process.env.REDIS_URL_LOCAL || 'redis://127.0.0.1:6379';
}

/**
 * Feature flags — PHASE 2 of "Your Camp".
 *
 * BOTH DEFAULT TO TODAY'S BEHAVIOUR. Unset ⇒ the gym paths are byte-identical to what
 * shipped, and the camp teach channel is ON. Each flag is "reversible without a deploy":
 * flip the env var, restart. That is why the gym cutover is a FLAG FLIP and not a release —
 * a rollback is a restart, and nothing changed at the moment of the flip.
 *
 *   GYMS_RETIRED        — default FALSE. true ⇒ the seven gym endpoints return 410
 *                         `gyms_retired` via middleware/gymsRetiredMiddleware.js and the
 *                         frontend drops the Gym tab. While false the middleware is a no-op.
 *   CAMP_TEACH_CHANNEL  — default TRUE. Set to the literal string "false" for a no-deploy
 *                         KILL SWITCH on coach-taught moves. A promotion that teaches nothing
 *                         is still a perfectly valid promotion — this is a brake on the move
 *                         economy, NOT a rollout gate, and it never removes an already-taught
 *                         move (those were earned and paid for).
 *
 * Parsed as strings on purpose: an unset var, "", "0" and "no" must all resolve to the
 * documented default rather than to JS truthiness.
 */
const features = {
    gymsRetired: String(process.env.GYMS_RETIRED || '').toLowerCase() === 'true',
    campTeachChannel: String(process.env.CAMP_TEACH_CHANNEL || '').toLowerCase() !== 'false',
};

const mongoUri = resolveMongoUri();
const redisUrl = resolveRedisUrl();

// Mask passwords for logging.
const maskUrl = (u) => u.replace(/\/\/([^:/@]+):[^@]+@/, '//$1:***@');

const usingRemoteMongo = mongoUri.startsWith('mongodb+srv://');
const usingRemoteRedis = !redisUrl.includes('127.0.0.1') && !redisUrl.includes('localhost');

// One-line breadcrumb at boot so it's obvious where we connected.
console.log(`[config] Mode: ${LOCAL_MODE ? 'LOCAL_MODE (forced local)' : 'normal'}`);
console.log(`[config] Mongo: ${usingRemoteMongo ? 'REMOTE' : 'LOCAL'} → ${maskUrl(mongoUri)}`);
console.log(`[config] Redis: ${usingRemoteRedis ? 'REMOTE' : 'LOCAL'} → ${maskUrl(redisUrl)}`);
// Both flags printed at boot, in the same shape as the Mongo/Redis lines: after a restart the
// FIRST question is always "which side of the cutover is this process on?" and the answer must
// be in the log, not inferred from behaviour.
console.log(`[config] Features: GYMS_RETIRED=${features.gymsRetired} · CAMP_TEACH_CHANNEL=${features.campTeachChannel}`);

module.exports = {
    port: process.env.PORT || 4001,
    localMode: LOCAL_MODE,
    features,
    database: {
        url: mongoUri,
        options: {}
    },
    redis: {
        url: redisUrl,
    },
    jwtSecret: process.env.JWT_SECRET || 'gnp_super_secret_key_change_in_prod_2026',
    jwtExpiresIn: '30d',
    // Guests have no fallback credential unless they save their recovery code, so
    // their JWT (the "device token") is long-lived. Env-overridable for tuning.
    guestJwtExpiresIn: process.env.GUEST_JWT_EXPIRES_IN || '365d',
};
