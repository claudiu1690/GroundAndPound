/**
 * Seed PVP ladder bots.
 *
 * Creates N non-account bot fighters (isPvpBot:true) and a PVPRecord for each in the
 * active Open season, with a spread of DP across all five divisions so the ladder,
 * division filters, and counts look realistic.
 *
 * Usage:
 *   node scripts/seedPvpBots.js          # default 10 bots
 *   node scripts/seedPvpBots.js 16       # custom count
 *
 * Idempotent: deletes any existing isPvpBot fighters + their PVP records first, then
 * creates exactly N. Re-run to reset. Remove them anytime with the same isPvpBot flag.
 */
const connectDB = require("../modules/dbConnect");
const mongoose = require("mongoose");
const Fighter = require("../models/fighterModel");
const Season = require("../models/seasonModel");
const PVPRecord = require("../models/pvpRecordModel");
const PVPFight = require("../models/pvpFightModel");
const PVPRival = require("../models/pvpRivalModel");
const { divisionForDp } = require("../consts/pvpConfig");

const DAY = 24 * 3600 * 1000;
const STYLES = ["Boxer", "Kickboxer", "Wrestler", "Brazilian Jiu-Jitsu", "Muay Thai", "Judo", "Sambo", "Capoeira"];
const GAMEPLANS = ["balanced", "aggressive", "counter"];
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

// 16 names / classes so a custom count up to 16 still gets variety; we use the first N.
const POOL = [
  { name: "Diego Cruz",     wc: "Featherweight", ovr: 16, dp: 80,   w: 1,  l: 1, lastDays: 0 },
  { name: "Yuri Volkov",    wc: "Lightweight",   ovr: 21, dp: 220,  w: 2,  l: 2, lastDays: 1 },
  { name: "Marcus Webb",    wc: "Middleweight",  ovr: 28, dp: 380,  w: 3,  l: 2, lastDays: 2 },
  { name: "Tank Mboto",     wc: "Heavyweight",   ovr: 33, dp: 620,  w: 5,  l: 3, lastDays: 4 },
  { name: "Eddie Stone",    wc: "Lightweight",   ovr: 37, dp: 980,  w: 7,  l: 3, lastDays: 6 },
  { name: "Kenji Sato",     wc: "Featherweight", ovr: 42, dp: 1350, w: 9,  l: 4, lastDays: 0 },
  { name: "Rafael Lima",    wc: "Middleweight",  ovr: 46, dp: 2050, w: 12, l: 5, lastDays: 3 },
  { name: "Boris Petrov",   wc: "Heavyweight",   ovr: 50, dp: 2700, w: 14, l: 6, lastDays: 8 },
  { name: "Andre Costa",    wc: "Lightweight",   ovr: 55, dp: 3900, w: 18, l: 7, lastDays: 10 },
  { name: "Cassius Moore",  wc: "Middleweight",  ovr: 60, dp: 5400, w: 22, l: 8, lastDays: 1 },
  { name: "Hiro Tanaka",    wc: "Featherweight", ovr: 19, dp: 150,  w: 1,  l: 0, lastDays: 5 },
  { name: "Sergei Orlov",   wc: "Heavyweight",   ovr: 31, dp: 510,  w: 4,  l: 4, lastDays: 7 },
  { name: "Leon Park",      wc: "Lightweight",   ovr: 44, dp: 1700, w: 10, l: 5, lastDays: 2 },
  { name: "Mateo Rossi",    wc: "Middleweight",  ovr: 52, dp: 3100, w: 16, l: 6, lastDays: 0 },
  { name: "Omar Haddad",    wc: "Featherweight", ovr: 39, dp: 1100, w: 8,  l: 4, lastDays: 12 },
  { name: "Viktor Reyes",   wc: "Heavyweight",   ovr: 58, dp: 4600, w: 20, l: 9, lastDays: 1 },
];

(async () => {
  const count = Math.max(1, Math.min(POOL.length, parseInt(process.argv[2], 10) || 10));
  await connectDB();

  const season = await Season.findOne({ status: "active", "config.crossWeightClass": true })
    || await Season.findOne({ status: "active" });
  if (!season) {
    console.error("No active season found — seed a season first (scripts/seedPvpSeason1.js).");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Target season: #${season.seasonNumber} wc=${season.weightClass} id=${season._id}`);

  // Reset existing bots (idempotent).
  const existing = await Fighter.find({ isPvpBot: true }).select("_id").lean();
  const exIds = existing.map((f) => f._id);
  if (exIds.length) {
    await PVPRecord.deleteMany({ playerId: { $in: exIds } });
    await PVPFight.deleteMany({ $or: [{ attackerId: { $in: exIds } }, { defenderId: { $in: exIds } }] });
    await PVPRival.deleteMany({ $or: [{ player1Id: { $in: exIds } }, { player2Id: { $in: exIds } }] });
    await Fighter.deleteMany({ _id: { $in: exIds } });
    console.log(`Cleared ${exIds.length} existing bot(s) + their PVP data.`);
  }

  const now = Date.now();
  let made = 0;
  for (let i = 0; i < count; i++) {
    const b = POOL[i];
    const stats = {};
    STAT_KEYS.forEach((k) => { stats[k] = Math.max(1, Math.min(99, b.ovr)); });

    const fighter = await Fighter.create({
      // "BOT" prefix so they're unmistakable on the ladder (e.g. "BOT Diego Cruz").
      firstName: "BOT",
      lastName: b.name,
      isPvpBot: true,
      weightClass: b.wc,
      style: STYLES[i % STYLES.length],
      overallRating: b.ovr,
      ...stats,
      record: { wins: b.w, losses: b.l },
      pvpOnboarding: { unlocked: true, placementComplete: true },
    });

    const lastFightAt = new Date(now - b.lastDays * DAY);
    await PVPRecord.create({
      playerId: fighter._id,
      seasonId: season._id,
      weightClass: season.weightClass,        // season-derived ("Open") — load-bearing for pool filters
      realWeightClass: b.wc,                   // true class — drives the cross-WC filter + [WC] pill
      division: divisionForDp(b.dp),
      dp: b.dp,
      peakDp: b.dp,
      overallRating: b.ovr,
      wins: b.w,
      losses: b.l,
      winStreak: i % 4 === 0 ? 3 : 0,          // a few show the streak pill
      longestStreak: i % 4 === 0 ? 3 : 0,
      defenseGameplan: GAMEPLANS[i % GAMEPLANS.length],
      lastFightAt,
      lastActiveAt: lastFightAt,
    });
    made++;
    console.log(`  + BOT ${b.name} (${b.wc}, OVR ${b.ovr}) → ${divisionForDp(b.dp)} @ ${b.dp} DP`);
  }

  const total = await PVPRecord.countDocuments({ seasonId: season._id });
  console.log(`\nCreated ${made} bots. Season now has ${total} PVP records.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
