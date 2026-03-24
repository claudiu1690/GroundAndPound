const express = require("express");
const cors = require("cors");
const fighterRoutes = require("./routes/fighterRoutes");
const gymRoutes = require("./routes/gymRoutes");
const fightRoutes = require("./routes/fightRoutes");
const questRoutes = require("./routes/questRoutes");
const authRoutes = require("./routes/authRoutes");
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

mongoose.connect(config.database.url, config.database.options)
    .then(async () => {
        console.log("Connected to MongoDB");
        await migrateLegacyEnergyShape();
        await migrateLegacyNotorietyNumber();
        await backfillFighterGymFromQuestProgress();
        await scheduler.startEnergyIncrementScheduler();
        app.listen(config.port, () => {
            console.log(`Ground & Pound API running on port ${config.port}`);
            console.log(`Swagger UI: http://localhost:${config.port}/api-docs`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err);
    });
