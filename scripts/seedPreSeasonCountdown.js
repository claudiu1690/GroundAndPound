/**
 * Going-live reset: wipe all PvP test data and (re)start SEASON 1 as a 72-hour
 * pre-season countdown.
 *
 * Everything in the Proving Ground so far was testing. This script gives a clean
 * launch slate:
 *   1. Wipes ALL PvP data — fights, rivalries, ladder records, and Hall of Fame
 *      (players + bots). Career/fighter docs are NOT touched (PvP only).
 *   2. Deletes ALL season docs and creates a single fresh OPEN Season 1 with
 *      status "upcoming" and startDate = now + 72h. Season 1 is the no-twist
 *      "Iron Circuit" baseline. The hub renders this as the pre-season countdown
 *      (frontend: PreSeasonCountdown.jsx); the transition sweep flips it to active
 *      at startDate (sweep runs every 10 min), and it auto-loads the live hub.
 *
 * After this, run `node scripts/seedPvpBots.js` to populate the launch ladder with
 * the 15 bots (it now targets the upcoming Open season, so they're ready at go-live).
 *
 * Usage:
 *   node scripts/seedPreSeasonCountdown.js                                  (local DB)
 *   USE_ATLAS=true LOCAL_MODE=false node scripts/seedPreSeasonCountdown.js  (prod Atlas)
 *
 * Idempotent: re-running re-wipes and re-arms a single upcoming Open Season 1 at +72h.
 * DESTRUCTIVE — deletes all PvP records/fights/rivalries/HoF. Run only for a clean launch.
 */
const connectDB = require("../modules/dbConnect");
const mongoose = require("mongoose");
const Season = require("../models/seasonModel");
const PVPRecord = require("../models/pvpRecordModel");
const PVPFight = require("../models/pvpFightModel");
const PVPRival = require("../models/pvpRivalModel");
const HallOfFame = require("../models/hallOfFameModel");
const { seedOpenSeason } = require("../services/pvpSeasonService");

// Countdown length in hours. Override with COUNTDOWN_HOURS env (e.g. 144 = 6 days).
const COUNTDOWN_HOURS = Number(process.env.COUNTDOWN_HOURS) || 72;
const LAUNCH_TWIST = "iron_circuit"; // Season 1 launch = no-twist baseline

(async () => {
  await connectDB();
  const startDate = new Date(Date.now() + COUNTDOWN_HOURS * 3600 * 1000);

  // 1. Wipe ALL PvP test data. Fighters/careers untouched.
  const [f, r, rec, hof] = await Promise.all([
    PVPFight.deleteMany({}),
    PVPRival.deleteMany({}),
    PVPRecord.deleteMany({}),
    HallOfFame.deleteMany({}),
  ]);
  console.log(`Wiped PvP test data: ${f.deletedCount} fights, ${r.deletedCount} rivalries, ${rec.deletedCount} records, ${hof.deletedCount} HoF entries.`);

  // 2. Drop ALL season docs so exactly one season exists after this (no stray active
  //    per-WC season can shadow the upcoming Open season in the hub resolver).
  const delSeasons = await Season.deleteMany({});
  console.log(`Removed ${delSeasons.deletedCount} season doc(s).`);

  // 3. Create the fresh Open Season 1 countdown.
  const s1 = await seedOpenSeason(1, LAUNCH_TWIST, startDate, "upcoming");

  console.log(`\nSeason 1 launch countdown armed:`);
  console.log(`  Season ${s1.seasonNumber} "${s1.name}" — twist: ${s1.twist} (Open / all weight classes)`);
  console.log(`  Starts: ${startDate.toISOString()}  (in ${COUNTDOWN_HOURS}h)`);
  console.log(`  Ends:   ${new Date(s1.endDate).toISOString()}`);
  console.log(`  Next: run scripts/seedPvpBots.js to populate the launch ladder with the 15 bots.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
