// MUST be first — initializes Sentry before any other module loads so it can
// auto-instrument them. No-ops when SENTRY_DSN is unset.
require("./instrument");
const Sentry = require("@sentry/node");

const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const cors = require("cors");
const fighterRoutes = require("./routes/fighterRoutes");
const gymRoutes = require("./routes/gymRoutes");
// "Home camp" = the player's own training camp. `camp*` is the FIGHT camp (GDD §9).
const homeCampRoutes = require("./routes/homeCampRoutes");
const fightRoutes = require("./routes/fightRoutes");
const questRoutes = require("./routes/questRoutes");
const authRoutes = require("./routes/authRoutes");
const sponsorshipRoutes = require("./routes/sponsorshipRoutes");
const mainEventRoutes = require("./routes/mainEventRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const rankingRoutes = require("./routes/rankingRoutes");
const gazetteRoutes = require("./routes/gazetteRoutes");
const tutorialRoutes = require("./routes/tutorialRoutes");
const accountRoutes = require("./routes/accountRoutes");
const pvpRoutes = require("./routes/pvpRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const accountController = require("./controllers/accountController");
const pvpController = require("./controllers/pvpController");
const bugReportController = require("./controllers/bugReportController");
const authMiddleware = require("./middleware/authMiddleware");
// PHASE 2 gym retirement — a no-op while GYMS_RETIRED is unset/false.
const blockWhenGymsRetired = require("./middleware/gymsRetiredMiddleware");
const adminMiddleware = require("./middleware/adminMiddleware");
const optionalAuthMiddleware = require("./middleware/optionalAuthMiddleware");
const mongoose = require("mongoose");
const config = require("./config");
const swagger = require("./swagger");
const scheduler = require("./modules/scheduler");
const { ENERGY } = require("./consts/gameConstants");

const app = express();

// Behind Railway's edge proxy: trust the first hop so express-rate-limit (and
// req.ip) read the real client IP from X-Forwarded-For instead of lumping every
// request under the proxy's single IP.
app.set("trust proxy", 1);

// ── Rate limiting ──
// Global per-IP limiter: generous enough for normal click-resolved play (a busy
// session is well under this) but stops scraping/floods/DoS. Tunable via env.
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 300, // requests/min/IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many requests — slow down and try again shortly." },
});
// Stricter limiter for auth (login/register/forgot/reset) — blunts credential
// stuffing and signup floods from a single IP. Complements the existing
// per-email throttle in the auth controller.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 50, // attempts/15min/IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts — please wait a few minutes and try again." },
});
// Bug-report limiter — public endpoint, logged-out callers welcome, so throttle
// per-IP to stop a single source flooding the ops inbox / DB with reports.
const bugReportLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: Number(process.env.BUG_REPORT_RATE_LIMIT_MAX) || 5, // reports/10min/IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many bug reports — please wait a few minutes and try again." },
});
// Guest-creation limiter — dedicated per-IP throttle on top of authLimiter to
// blunt guest-account spam (each call creates a real User + Fighter). The daily
// purge job bounds long-term accumulation; this bounds the burst rate.
const guestCreateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.GUEST_CREATE_RATE_LIMIT_MAX) || 5, // guests/hour/IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Only successful creations consume the quota — a player hitting a
    // validation error or a server fault can retry without locking themselves
    // out of the signup path for an hour.
    skipFailedRequests: true,
    message: { message: "Too many guest accounts created — please wait a while and try again." },
});

// ── Security headers (first middleware, applies to every response) ──
// This is a JSON API consumed cross-origin by the separate frontend, so:
//   - contentSecurityPolicy OFF: CSP belongs on the frontend host; a default CSP
//     here would break the Swagger UI (/api-docs serves inline scripts/styles).
//   - crossOriginResourcePolicy "cross-origin": allow the frontend on another
//     origin to consume API responses (default "same-origin" would block it).
// Everything else (HSTS, X-Content-Type-Options, frameguard, etc.) stays on.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

/**
 * CORS allowlist. Same-origin (no Origin header — curl, server-to-server,
 * health checks) is always allowed. Browser-origin requests must match one
 * of the values below.
 *
 *   FRONTEND_URL — the deployed frontend (set on Railway → Variables).
 *                  Comma-separated if you have multiple (e.g. preview deploys).
 *   localhost:5173 — Vite dev server (your local frontend).
 *   localhost:4173 — Vite preview server.
 */
const corsAllowlist = [
    "http://localhost:5173",
    "http://localhost:4173",
    ...(process.env.FRONTEND_URL || "").split(",").map((s) => s.trim()).filter(Boolean),
];
app.use(cors({
    origin: (origin, cb) => {
        // No Origin header = same-origin or non-browser caller — always allow.
        if (!origin) return cb(null, true);
        if (corsAllowlist.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} not in allowlist`));
    },
    credentials: true,
}));
console.log(`[CORS] Allowlist: ${corsAllowlist.join(", ") || "(empty)"}`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global per-IP rate limit on the whole API.
app.use(globalLimiter);

// Public — no auth required (stricter per-IP throttle on top of the global one).
// Guest creation gets an extra dedicated per-IP limiter (mounted before the
// /auth router so it runs ahead of the route handler).
app.post("/auth/guest", guestCreateLimiter);
app.use("/auth", authLimiter, authRoutes);

// Public — hit from an email link, no JWT. Mounted before the protected
// /account routes so it doesn't get caught by the auth middleware.
app.get("/account/email/confirm", accountController.confirmEmailChange);

// Protected — JWT required for all game routes
app.use("/fighters", authMiddleware, fighterRoutes);
// All four /gyms reads sit behind the retirement gate. No-op until GYMS_RETIRED=true.
app.use("/gyms", authMiddleware, blockWhenGymsRetired, gymRoutes);
app.use("/home-camp", authMiddleware, homeCampRoutes);
app.use("/fights", authMiddleware, fightRoutes);
app.use("/quests", authMiddleware, questRoutes);
app.use("/sponsorships", authMiddleware, sponsorshipRoutes);
app.use("/events", authMiddleware, mainEventRoutes);
app.use("/media", authMiddleware, mediaRoutes);
app.use("/rankings", authMiddleware, rankingRoutes);
app.use("/gazette", authMiddleware, gazetteRoutes);
app.use("/tutorial", authMiddleware, tutorialRoutes);
app.use("/account", authMiddleware, accountRoutes);
// Public — powers the marketing landing "Live Now" band, no JWT. Mounted
// before the protected /pvp routes so it bypasses authMiddleware.
app.get("/pvp/season/public", pvpController.getPublicSeason);
app.use("/pvp", authMiddleware, pvpRoutes);

// Protected + admin-gated — internal analytics/telemetry reads.
app.use("/admin/analytics", authMiddleware, adminMiddleware, analyticsRoutes);

// Public — "Report a Bug". Works logged-out; optionalAuthMiddleware attaches
// identity when a valid JWT is present. Mounted before nothing auth-gated (all
// game routes above already require auth) and carries its own per-IP limiter.
app.post("/bug-reports", bugReportLimiter, optionalAuthMiddleware, bugReportController.submitBugReport);

swagger(app);

// ── 404 — unmatched routes (after all real routes + swagger) ──
app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

// Sentry error capture — after routes, before our own error handler. Captures
// the error (when SENTRY_DSN is set) then falls through to our handler, which
// sends the safe client response. No-op when Sentry isn't initialized.
Sentry.setupExpressErrorHandler(app);

// ── Global error handler (MUST be last; 4 args) ──
// Safety net for anything that throws or calls next(err): malformed JSON bodies,
// CORS rejections, and any uncaught error in a handler. Per project policy, never
// leak internal error details to the client — log full detail server-side, return
// a safe message. Client-fixable errors opt in via err.statusCode/err.validation.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const isBadJson = err.type === "entity.parse.failed";
    const isCors = typeof err.message === "string" && err.message.startsWith("CORS:");
    const status = isBadJson ? 400 : isCors ? 403 : (err.statusCode || err.status || 500);

    if (status >= 500) {
        console.error("[error]", req.method, req.originalUrl, "-", err.stack || err.message);
    } else {
        console.warn("[error]", req.method, req.originalUrl, "-", err.message);
    }

    let message = "Internal server error";
    if (isBadJson) message = "Invalid JSON in request body.";
    else if (isCors) message = "Origin not allowed.";
    else if (status < 500 && (err.expose || err.validation)) message = err.message;

    if (res.headersSent) return next(err);
    res.status(status).json({ message });
});

// ── Process-level safety nets ──
// Log unhandled promise rejections instead of crashing silently. On a truly
// uncaught exception, log and exit so the platform (Railway) restarts cleanly
// rather than running in a corrupted state.
process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err.stack || err.message);
    process.exit(1);
});

async function migrateLegacyEnergyShape() {
    const fighters = mongoose.connection.collection("fighters");
    const result = await fighters.updateMany(
        { energy: { $type: "number" } },
        [
            {
                $set: {
                    energy: {
                        current: "$energy",
                        max: ENERGY.max,
                        lastSyncedAt: "$$NOW",
                    },
                },
            },
        ]
    );

    if (result.modifiedCount > 0) {
        console.log(`[Migration] Converted ${result.modifiedCount} fighter(s) to energy object shape.`);
    }
}

async function migrateLegacyNotorietyNumber() {
    const { calculateTierFromScore } = require("./consts/notorietyConfig");
    const fighters = mongoose.connection.collection("fighters");
    const cursor = fighters.find({
        $or: [
            { notoriety: { $type: "double" } },
            { notoriety: { $type: "int" } },
            { notoriety: { $type: "long" } },
        ],
    });
    let count = 0;
    for await (const doc of cursor) {
        const score = Math.max(0, Number(doc.notoriety) || 0);
        await fighters.updateOne(
            { _id: doc._id },
            {
                $set: {
                    winStreak: doc.winStreak ?? 0,
                    notoriety: {
                        score,
                        peakTier: calculateTierFromScore(score),
                        isFrozen: false,
                        lastEventAt: doc.lastFightDate || null,
                        documentaryUsed: false,
                        milestones: {},
                        firstFinishPromoTiers: [],
                    },
                },
            }
        );
        count += 1;
    }
    if (count > 0) {
        console.log(`[Migration] Converted ${count} fighter(s) from legacy numeric notoriety to notoriety subdocument.`);
    }
}

async function backfillFighterGymFromQuestProgress() {
    const fighters = mongoose.connection.collection("fighters");
    const questProgress = mongoose.connection.collection("questprogresses");

    const latestGymPerFighter = await questProgress.aggregate([
        { $match: { gymId: { $ne: null } } },
        { $sort: { updatedAt: -1 } },
        {
            $group: {
                _id: "$fighterId",
                gymId: { $first: "$gymId" },
            },
        },
    ]).toArray();

    if (latestGymPerFighter.length === 0) return;

    const ops = latestGymPerFighter.map((row) => ({
        updateOne: {
            filter: {
                _id: row._id,
                $or: [{ gymId: null }, { gymId: { $exists: false } }],
            },
            update: { $set: { gymId: row.gymId } },
        },
    }));

    const result = await fighters.bulkWrite(ops, { ordered: false });
    if (result.modifiedCount > 0) {
        console.log(`[Migration] Backfilled gymId for ${result.modifiedCount} fighter(s) from quest progress.`);
    }
}

/**
 * Onboarding Tutorial v1.0 — fighters that predate the tutorial field have no
 * `tutorial` subdocument. Mark them as completed so only newly-created accounts
 * run the tutorial. New accounts get tutorial.completed=false from the schema
 * default, so this only ever touches genuinely legacy documents.
 */
async function backfillTutorialForLegacyFighters() {
    const fighters = mongoose.connection.collection("fighters");
    const now = new Date();
    const result = await fighters.updateMany(
        { tutorial: { $exists: false } },
        {
            $set: {
                tutorial: {
                    completed: true,
                    current_step: "complete",
                    started_at: now,
                    completed_at: now,
                },
            },
        }
    );
    if (result.modifiedCount > 0) {
        console.log(`[Migration] Marked tutorial complete for ${result.modifiedCount} existing fighter(s).`);
    }
}

/**
 * Shop, Inventory & Pre-Fight Supplements v1.0 — fighters that predate the feature
 * have no `inventory` subdocument. Give them the empty inventory shape + null active
 * booster so reads/writes never hit an undefined map. New fighters get these from the
 * schema defaults, so this only ever touches genuinely legacy documents.
 */
async function backfillInventoryShape() {
    const fighters = mongoose.connection.collection("fighters");
    const result = await fighters.updateMany(
        { inventory: { $exists: false } },
        {
            $set: {
                inventory: {
                    energyShots: 0,
                    energyDrinks: 0,
                    prefightBuffs: {},
                    usedBuffs: {},
                },
                activeBooster: null,
            },
        }
    );
    if (result.modifiedCount > 0) {
        console.log(`[Migration] Backfilled inventory shape for ${result.modifiedCount} existing fighter(s).`);
    }
}

/**
 * Injury auto-heal v2 — doctor-required injuries used to have no recovery timer, so a
 * player who couldn't afford treatment was permanently stuck (Concussion blocks fighting,
 * and Amateur fights pay no iron). They now heal on their own over time. Backfill a
 * recovery timer onto any pre-existing, untreated doctor injury. The tick anchor is set
 * to the injury's original date, so elapsed real time counts immediately — a fighter
 * who has been stuck for days will heal (fully or partly) on their next load.
 */
async function backfillDoctorInjuryTimers() {
    const { INJURY_TYPES } = require("./consts/injuryDefinitions");
    const Fighter = require("./models/fighterModel");
    const fighters = await Fighter.find({
        injuries: { $elemMatch: { requiresDoctorVisit: true, doctorVisited: { $ne: true } } },
    });
    let count = 0;
    for (const fighter of fighters) {
        let touched = false;
        for (const inj of fighter.injuries) {
            if (!inj.requiresDoctorVisit || inj.doctorVisited) continue;
            if (inj.recoveryHoursLeft && inj.recoveryHoursLeft > 0) continue; // already timed
            if (inj.recoveryDaysLeft   && inj.recoveryDaysLeft   > 0) continue; // legacy timer present
            const def = INJURY_TYPES[inj.type];
            if (!def || !def.recoveryHoursNeeded) continue;
            inj.recoveryHoursLeft = def.recoveryHoursNeeded;
            inj.recoveryLastTickAt = inj.sustainedAt || new Date();
            touched = true;
        }
        if (touched) { await fighter.save(); count += 1; }
    }
    if (count > 0) {
        console.log(`[Migration] Backfilled auto-heal timers on doctor injuries for ${count} fighter(s).`);
    }
}

/**
 * New-fighter injury grace — fighters in their first few fights should never carry a
 * fight-blocking injury (Concussion / Cut / Torn Ligament). Clear any such injury from
 * fighters who are still inside the grace window, so anyone already locked out by an
 * early-career KO loss is freed on the next boot. Stat penalties are reversed too.
 */
async function backfillClearNewFighterBlockingInjuries() {
    const Fighter = require("./models/fighterModel");
    const { reverseInjuryFromFighter } = require("./utils/injuryUtils");
    const { INJURY_GRACE_FIGHTS } = require("./consts/injuryDefinitions");
    const fighters = await Fighter.find({
        injuries: { $elemMatch: { cannotFight: true } },
    });
    let count = 0;
    for (const fighter of fighters) {
        const r = fighter.record || {};
        const totalFights = (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
        // Strictly inside the window — every fight they've had was grace-protected.
        if (totalFights >= INJURY_GRACE_FIGHTS) continue;
        const kept = [];
        let cleared = false;
        for (const inj of fighter.injuries) {
            if (inj.cannotFight && !inj.doctorVisited) {
                reverseInjuryFromFighter(fighter, inj);
                cleared = true;
            } else {
                kept.push(inj);
            }
        }
        if (cleared) {
            fighter.injuries = kept;
            await fighter.save();
            count += 1;
        }
    }
    if (count > 0) {
        console.log(`[Migration] Cleared fight-blocking injuries from ${count} new fighter(s) (injury grace).`);
    }
}

/**
 * Weight class rename (May 2026) — Bantamweight and Welterweight retired in favour of
 * Middleweight and Heavyweight. Remap existing fighters and opponents to their closest
 * surviving class so the new enum constraint accepts them and matchmaking still works:
 *   Bantamweight (135) → Featherweight (145)
 *   Welterweight (170) → Middleweight (185)
 * Old champions in retired classes lose their championship flag — ensureChampionsExist
 * will re-seed any missing belts (including all four Heavyweight champions, which are
 * brand new). Run `node scripts/seedOpponents.js` after first boot to populate the
 * Heavyweight opponent pool.
 */
async function migrateWeightClassRename() {
    const RENAME = { Bantamweight: "Featherweight", Welterweight: "Middleweight" };
    const fighters  = mongoose.connection.collection("fighters");
    const opponents = mongoose.connection.collection("opponents");

    // Strip championship from opponents in retired classes so ensureChampionsExist re-seeds.
    const champStripped = await opponents.updateMany(
        { weightClass: { $in: Object.keys(RENAME) }, isChampion: true },
        { $set: { isChampion: false } }
    );
    if (champStripped.modifiedCount > 0) {
        console.log(`[Migration] Cleared championship flag on ${champStripped.modifiedCount} opponent(s) in retired weight classes.`);
    }

    // Players (fighters) — no rank collision possible, bulk update is safe.
    for (const [oldWc, newWc] of Object.entries(RENAME)) {
        const r1 = await fighters.updateMany({ weightClass: oldWc }, { $set: { weightClass: newWc } });
        if (r1.modifiedCount > 0) {
            console.log(`[Migration] Renamed fighters ${oldWc} → ${newWc}: ${r1.modifiedCount}.`);
        }
    }

    // Opponents — must renumber fixedRank to avoid the unique
    // (promotionTier, weightClass, fixedRank) index colliding. The target class already
    // has its own ranked roster; incoming opponents go to the END of each tier's roster.
    for (const [oldWc, newWc] of Object.entries(RENAME)) {
        const retiredOpps = await opponents
            .find({ weightClass: oldWc })
            .sort({ promotionTier: 1, fixedRank: 1 })
            .toArray();
        if (retiredOpps.length === 0) continue;

        // Cache: per-tier next rank to assign. Initialised from the target class's current max.
        const nextRankByTier = {};
        async function nextRankFor(tier) {
            if (nextRankByTier[tier] != null) return nextRankByTier[tier]++;
            const maxDoc = await opponents
                .find({ promotionTier: tier, weightClass: newWc, fixedRank: { $type: "number" } })
                .sort({ fixedRank: -1 })
                .limit(1)
                .toArray();
            const start = (maxDoc[0]?.fixedRank ?? 0) + 1;
            nextRankByTier[tier] = start + 1;
            return start;
        }

        let renamed = 0;
        for (const opp of retiredOpps) {
            const update = { weightClass: newWc };
            if (typeof opp.fixedRank === "number") {
                update.fixedRank = await nextRankFor(opp.promotionTier);
            }
            await opponents.updateOne({ _id: opp._id }, { $set: update });
            renamed += 1;
        }
        console.log(`[Migration] Renamed opponents ${oldWc} → ${newWc}: ${renamed} (ranks renumbered to end of ${newWc} roster).`);
    }
}

/**
 * Event-betting migration — the events tab changed from a free fame/iron
 * prediction system to a real iron-staking betting system. Old Prediction docs
 * have the legacy shape (no `betType`, no `stake`, no `lockedOdds`) and would
 * crash the new resolve loop with "Cannot read properties of undefined".
 *
 * Clean cutover: delete any unresolved predictions (the player loses nothing —
 * they paid no iron under the old model). Resolved predictions stay in the DB
 * untouched so their fame/iron history still shows up in the History tab; the
 * new UI tolerates missing `stake` / `lockedOdds` on those rows.
 */
async function migrateClearLegacyPredictions() {
    const predictions = mongoose.connection.collection("predictions");
    const result = await predictions.deleteMany({
        $and: [
            { $or: [{ "resolution.resolved": false }, { "resolution.resolved": { $exists: false } }] },
            { $or: [{ stake: { $exists: false } }, { betType: { $exists: false } }] },
        ],
    });
    if (result.deletedCount > 0) {
        console.log(`[Migration] Cleared ${result.deletedCount} unresolved legacy prediction(s) (pre-betting model).`);
    }
}

/**
 * Amateur title-shot migration — the Amateur tier became a gated/champion tier.
 * Previously Amateurs auto-promoted to Regional Pro at OVR 30; now they must beat
 * the Amateur champion via a title shot. Any fighter currently sitting at OVR ≥ 30
 * in the Amateur tier never had pendingPromotion set, so they'd never see the title
 * shot card. Backfill pendingPromotion = "Regional Pro" for them.
 *
 * Idempotent: the pendingPromotion null/absent filter makes re-runs no-ops, and it
 * only ever sets the flag (never clears one a fighter legitimately has).
 */
async function migrateAmateurPendingPromotion() {
    const Fighter = require("./models/fighterModel");
    const result = await Fighter.updateMany(
        {
            promotionTier: "Amateur",
            overallRating: { $gte: 30 },
            $or: [{ pendingPromotion: null }, { pendingPromotion: { $exists: false } }],
        },
        { $set: { pendingPromotion: "Regional Pro" } }
    );
    if ((result.modifiedCount || 0) > 0) {
        console.log(`[Migration] Set pendingPromotion=Regional Pro for ${result.modifiedCount} stuck Amateur fighter(s) (OVR ≥ 30).`);
    }
}

// One-time backfill for the title-shot rule change (tier wins → wins-while-top-5).
// Fighters who had ALREADY earned the title shot under the old rule (pending + top-5 +
// enough tier wins) get topFiveWinsInTier granted up to the requirement so the change
// doesn't relock a shot they'd legitimately earned. Everyone else defaults to 0 and
// earns it naturally. Idempotent: only touches fighters whose counter is still 0/unset.
async function backfillTopFiveWinsForEarnedShots() {
    const Fighter = require("./models/fighterModel");
    const rankingService = require("./services/rankingService");
    const { getTitleShotConfig } = require("./services/fightService");
    const candidates = await Fighter.find({
        pendingPromotion: { $ne: null },
        $or: [{ topFiveWinsInTier: { $in: [0, null] } }, { topFiveWinsInTier: { $exists: false } }],
    });
    let n = 0;
    for (const f of candidates) {
        const titleWins = getTitleShotConfig(f.promotionTier).titleWins;
        if (rankingService.isTopFive(f) && (f.winsInCurrentTier ?? 0) >= titleWins) {
            f.topFiveWinsInTier = titleWins;
            await f.save();
            n++;
        }
    }
    if (n > 0) {
        console.log(`[Migration] Backfilled topFiveWinsInTier for ${n} fighter(s) with an already-earned title shot.`);
    }
}

mongoose.connect(config.database.url, config.database.options)
    .then(async () => {
        console.log("Connected to MongoDB");
        await migrateLegacyEnergyShape();
        await migrateLegacyNotorietyNumber();
        await migrateWeightClassRename();
        await migrateClearLegacyPredictions();
        await backfillFighterGymFromQuestProgress();
        await backfillTutorialForLegacyFighters();
        await backfillDoctorInjuryTimers();
        await backfillClearNewFighterBlockingInjuries();
        await backfillInventoryShape();
        await scheduler.startEnergyIncrementScheduler();
        await migrateAmateurPendingPromotion();
        await backfillTopFiveWinsForEarnedShots();
        const { ensureChampionsExist } = require("./services/championService");
        await ensureChampionsExist();
        app.listen(config.port, () => {
            console.log(`Ground & Pound API running on port ${config.port}`);
            console.log(`Swagger UI: http://localhost:${config.port}/api-docs`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err);
    });
