/**
 * Seed the new gym system from data/gyms.json.
 * Usage: node scripts/seedGyms.js [--reset]
 *   --reset  Clear Gym collection before inserting.
 */
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const config = require("../config");
const Gym = require("../models/gymModel");

const GYMS_PATH = path.join(__dirname, "..", "data", "gyms.json");

async function run() {
    const reset = process.argv.includes("--reset");

    if (!fs.existsSync(GYMS_PATH)) {
        console.error("Missing data/gyms.json");
        process.exit(1);
    }

    const gyms = JSON.parse(fs.readFileSync(GYMS_PATH, "utf8"));
    console.log(`Loaded ${gyms.length} gym definitions`);

    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    if (reset) {
        await Gym.deleteMany({});
        console.log("Gym collection cleared (--reset)");
    }

    let created = 0;
    let skipped = 0;
    for (const g of gyms) {
        const existing = await Gym.findOne({ slug: g.slug });
        if (existing) {
            // Update existing gym with latest data
            Object.assign(existing, g);
            await existing.save();
            skipped++;
            console.log(`  Updated: ${g.name}`);
            continue;
        }
        await Gym.create(g);
        created++;
        console.log(`  Created: ${g.name}`);
    }

    console.log(`Done: ${created} created, ${skipped} updated. Total: ${await Gym.countDocuments({})} gyms.`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
