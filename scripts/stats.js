/**
 * Read-only live stats snapshot — players online, DAU, accounts, activity.
 *
 * Usage:
 *   node scripts/stats.js              # targets whatever .env points at
 *   LOCAL_MODE=true node scripts/stats.js   # force local Mongo
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch
 * as the app. With the default prod .env (USE_ATLAS=true) this reads Atlas.
 *
 * NEVER writes — pure aggregation. Safe to run against production.
 *
 * Caveats surfaced in the output:
 *   - Auth is stateless JWT, so "online" is INFERRED from recent analytics
 *     events (a player idling on a screen without clicking reads as offline).
 *   - `session` events fire once per user per day → they count DAU, not logins.
 */
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const config = require("../config");

const oidSince = (d) => ObjectId.createFromTime(Math.floor(d.getTime() / 1000));
const pad = (label) => (label + " ").padEnd(24, ".");

async function main() {
    await mongoose.connect(config.database.url, config.database.options);
    const db = mongoose.connection;
    const users = db.collection("users");
    const ev = db.collection("analyticsevents");

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const min5 = new Date(Date.now() - 5 * 60 * 1000);
    const min15 = new Date(Date.now() - 15 * 60 * 1000);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const online5 = (await ev.distinct("userId", { createdAt: { $gte: min5 } })).length;
    const online15 = (await ev.distinct("userId", { createdAt: { $gte: min15 } })).length;
    const activeHour = (await ev.distinct("userId", { createdAt: { $gte: hourAgo } })).length;

    const dau = (await ev.distinct("userId", { day: today, type: "session" })).length;
    const newToday = await users.countDocuments({ _id: { $gte: oidSince(todayStart) } });
    const newWeek = await users.countDocuments({ _id: { $gte: oidSince(weekAgo) } });

    const total = await users.countDocuments({ deleted: { $ne: true } });
    const guests = await users.countDocuments({ isGuest: true, deleted: { $ne: true } });
    const emails = await users.countDocuments({ isGuest: { $ne: true }, deleted: { $ne: true } });
    const withRecovery = await users.countDocuments({ isGuest: true, recoveryCodeHash: { $ne: null } });

    const byType = await ev.aggregate([
        { $match: { day: today } },
        { $group: { _id: "$type", n: { $sum: 1 }, u: { $addToSet: "$userId" } } },
        { $sort: { n: -1 } },
    ]).toArray();

    const isRemote = config.database.url.startsWith("mongodb+srv://");
    console.log("");
    console.log(`  GROUND & POUND — stats @ ${now.toISOString()}  [${isRemote ? "PROD/Atlas" : "LOCAL"}]`);
    console.log("  " + "=".repeat(60));
    console.log("  ONLINE (inferred from recent activity — see caveat below)");
    console.log("    " + pad("last 5 min") + online5);
    console.log("    " + pad("last 15 min") + online15);
    console.log("    " + pad("last hour") + activeHour);
    console.log("");
    console.log(`  TODAY (${today})`);
    console.log("    " + pad("DAU (logged in)") + dau);
    console.log("    " + pad("new accounts") + newToday);
    console.log("");
    console.log("  ACCOUNTS");
    console.log("    " + pad("total") + total);
    console.log("    " + pad("email") + emails);
    console.log("    " + pad("guests (unclaimed)") + guests);
    console.log("    " + pad("  ↳ with recovery code") + withRecovery);
    console.log("    " + pad("new last 7 days") + newWeek);
    console.log("");
    console.log("  ACTIVITY TODAY (events / distinct users)");
    if (byType.length === 0) {
        console.log("    (no events yet today)");
    } else {
        byType.forEach((t) => console.log("    " + pad(t._id) + `${t.n} / ${t.u.length}`));
    }
    console.log("");
    console.log("  Note: 'online' is inferred from analytics events (stateless JWT auth");
    console.log("  has no true presence). Low counts in off-peak UTC hours are expected.");
    console.log("");

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error("stats.js failed:", err.message);
    process.exit(1);
});
