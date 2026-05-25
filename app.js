const express = require("express");
const cors = require("cors");
const fighterRoutes = require("./routes/fighterRoutes");
const gymRoutes = require("./routes/gymRoutes");
const fightRoutes = require("./routes/fightRoutes");
const questRoutes = require("./routes/questRoutes");
const authRoutes = require("./routes/authRoutes");
const sponsorshipRoutes = require("./routes/sponsorshipRoutes");
const mainEventRoutes = require("./routes/mainEventRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const rankingRoutes = require("./routes/rankingRoutes");
const gazetteRoutes = require("./routes/gazetteRoutes");
const tutorialRoutes = require("./routes/tutorialRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const mongoose = require("mongoose");
const config = require("./config");
const swagger = require("./swagger");
const scheduler = require("./modules/scheduler");
const { ENERGY } = require("./consts/gameConstants");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public — no auth required
app.use("/auth", authRoutes);

// Protected — JWT required for all game routes
app.use("/fighters", authMiddleware, fighterRoutes);
app.use("/gyms", authMiddleware, gymRoutes);
app.use("/fights", authMiddleware, fightRoutes);
app.use("/quests", authMiddleware, questRoutes);
app.use("/sponsorships", authMiddleware, sponsorshipRoutes);
app.use("/events", authMiddleware, mainEventRoutes);
app.use("/media", authMiddleware, mediaRoutes);
app.use("/rankings", authMiddleware, rankingRoutes);
app.use("/gazette", authMiddleware, gazetteRoutes);
app.use("/tutorial", authMiddleware, tutorialRoutes);

swagger(app);

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
            if (inj.recoveryDaysLeft && inj.recoveryDaysLeft > 0) continue; // already timed
            const def = INJURY_TYPES[inj.type];
            if (!def || !def.recoveryDaysNeeded) continue;
            inj.recoveryDaysLeft = def.recoveryDaysNeeded;
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

mongoose.connect(config.database.url, config.database.options)
    .then(async () => {
        console.log("Connected to MongoDB");
        await migrateLegacyEnergyShape();
        await migrateLegacyNotorietyNumber();
        await migrateWeightClassRename();
        await backfillFighterGymFromQuestProgress();
        await backfillTutorialForLegacyFighters();
        await backfillDoctorInjuryTimers();
        await backfillClearNewFighterBlockingInjuries();
        await scheduler.startEnergyIncrementScheduler();
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
