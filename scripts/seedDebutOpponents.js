/**
 * Seed the debut opponent pool (docs/first-session-contract.md C.1) from
 * data/debutOpponents.json: 16 Amateur opponents, 4 per weight class, flagged isDebut.
 * The JSON is the one scripts/simDebutOvr.js simulates, so what is simulated is what is seeded.
 *
 * READ BEFORE RUNNING. The local .env talks to PRODUCTION unless LOCAL_MODE=true.
 *   Local:    npx cross-env LOCAL_MODE=true node scripts/seedDebutOpponents.js [--dry]
 *   Staging:  set -a; . ./.env.staging; set +a; USE_ATLAS=false LOCAL_MODE=false \
 *               node scripts/seedDebutOpponents.js --allow-remote --yes
 *   Production: only with the owner's explicit yes in chat, after staging.
 * Without LOCAL_MODE=true the script refuses to run unless BOTH --allow-remote and --yes are
 * given, and it exits before connecting. Check the "[config] Mongo:" line printed first.
 *
 * Idempotent upsert per entry, keyed on { isDebut: true, weightClass, name }. Never deletes,
 * never touches a non-debut opponent. --dry connects read-only and prints the plan.
 *
 * Note: scripts/migrateRankingSystem.js wipes non-debut opponents only; scripts/seedOpponents.js
 * ignores debut opponents in its gap-fill. If the Opponent collection is ever dropped by hand,
 * rerun this script.
 */
const path = require("path");
const fs = require("fs");
const config = require("../config"); // prints the [config] Mongo: line first
const mongoose = require("mongoose");
const Opponent = require("../models/opponentModel");
const { WEIGHT_CLASSES, STYLES } = require("../consts/gameConstants");

const DATA_PATH = path.join(__dirname, "..", "data", "debutOpponents.json");
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const ALLOW_REMOTE = args.has("--allow-remote");
const YES = args.has("--yes");

function dbLabel(url) {
    try {
        const u = new URL(url);
        return `${u.hostname} / db ${u.pathname.replace(/^\//, "") || "(default)"}`;
    } catch (_) {
        return "(unparseable URI)";
    }
}

function validEntry(e) {
    if (!e || typeof e !== "object") return "not an object";
    if (typeof e.name !== "string" || !e.name.trim()) return "name";
    if (!WEIGHT_CLASSES.includes(e.weightClass)) return "weightClass";
    if (!Object.prototype.hasOwnProperty.call(STYLES, e.style)) return "style";
    if (!Number.isFinite(e.overallRating)) return "overallRating";
    for (const k of STAT_KEYS) {
        if (!Number.isInteger(e[k]) || e[k] < 1 || e[k] > 100) return k;
    }
    return null;
}

function toSet(e) {
    return {
        name: e.name,
        nickname: e.nickname ?? null,
        weightClass: e.weightClass,
        style: e.style,
        strategy: null,
        overallRating: e.overallRating,
        ...Object.fromEntries(STAT_KEYS.map((k) => [k, e[k]])),
        record: {
            wins: e.record?.wins ?? 0,
            losses: e.record?.losses ?? 0,
            draws: e.record?.draws ?? 0,
        },
        fightHistory: Array.isArray(e.fightHistory) ? e.fightHistory : [],
        isDebut: true,
        promotionTier: "Amateur",
        fixedRank: null,
        isChampion: false,
        championTier: null,
    };
}

async function run() {
    console.log(`[seedDebutOpponents] Target: ${dbLabel(config.database.url)}${DRY ? " (dry run)" : ""}`);
    if (!config.localMode && !(ALLOW_REMOTE && YES)) {
        console.error("[seedDebutOpponents] Refusing: LOCAL_MODE is not true. A remote run needs BOTH --allow-remote and --yes.");
        process.exit(1);
    }

    const entries = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    if (!Array.isArray(entries) || entries.length === 0) throw new Error("data/debutOpponents.json is empty");
    for (const [i, e] of entries.entries()) {
        const bad = validEntry(e);
        if (bad) throw new Error(`data/debutOpponents.json entry ${i} invalid: ${bad}`);
    }

    await mongoose.connect(config.database.url, config.database.options);
    console.log(`[seedDebutOpponents] Connected (${mongoose.connection.name})`);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const e of entries) {
        const filter = { isDebut: true, weightClass: e.weightClass, name: e.name };
        if (DRY) {
            const exists = await Opponent.exists(filter);
            console.log(`  would ${exists ? "update" : "insert"}: ${e.weightClass} ${e.name} (${e.style}, OVR ${e.overallRating})`);
            if (exists) updated++; else inserted++;
            continue;
        }
        const res = await Opponent.updateOne(filter, { $set: toSet(e) }, { upsert: true, runValidators: true });
        if (res.upsertedCount > 0) inserted++;
        else if (res.modifiedCount > 0) updated++;
        else unchanged++;
    }

    const pool = await Opponent.countDocuments({ isDebut: true });
    console.log(
        `[seedDebutOpponents] ${DRY ? "Plan" : "Done"}: ${inserted} inserted, ${updated} updated`
        + `${DRY ? "" : `, ${unchanged} unchanged`}. Debut pool now ${pool}.`
    );
    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error("[seedDebutOpponents] failed:", err.message);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
});
