/**
 * Seed PVP ladder bots — realistic filler so a new player never sees an empty ladder.
 *
 * Creates 15 non-account bot fighters (isPvpBot:true) and a PVPRecord for each in the
 * active Open season. Real-looking names + nicknames, a backstory tag, a record/DP that
 * fits their division, and a recent lastActive. Tier mix (NO elite, NO champions):
 *   8 Prospect · 4 Contender · 3 Challenger
 *
 * Usage:
 *   node scripts/seedPvpBots.js
 *   (against production: run with your prod Mongo env, e.g. LOCAL_MODE unset / Atlas URI)
 *
 * Idempotent: deletes ALL existing isPvpBot fighters + their PVP records/fights/rivalries
 * first, then creates exactly these 15. Re-run to reset. This is also how you "strip the
 * DB of bot users" — running it removes any prior bots before reseeding.
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
const GAMEPLANS = ["balanced", "striking", "wrestling", "submission", "counter"];
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

// 15 hand-built bots. dp drives division (divisionForDp): prospect <300, contender
// 300–1199, challenger 1200–2499. ovr is kept inside each tier's band; record + total
// fights scale up with tier; lastDays is 0–4 ("active in the last few days").
const POOL = [
  // ── 8 Prospects (dp 0–299, ovr 10–20) ──
  { first: "Jesse",   last: "Hooker",    nick: "The Kid",        wc: "Featherweight", style: "Boxer",               story: "Street Fighter",      ovr: 12, dp: 60,   w: 1,  l: 1,  lastDays: 1 },
  { first: "Dani",    last: "Reyes",     nick: "Pocket Rocket",  wc: "Featherweight", style: "Muay Thai",           story: "Late Bloomer",        ovr: 14, dp: 110,  w: 2,  l: 1,  lastDays: 0 },
  { first: "Tyrell",  last: "Banks",     nick: "Fresh",          wc: "Lightweight",   style: "Kickboxer",           story: "MMA Prodigy",         ovr: 13, dp: 90,   w: 2,  l: 2,  lastDays: 3 },
  { first: "Cole",    last: "Whitaker",  nick: "Greenhorn",      wc: "Middleweight",  style: "Wrestler",            story: "College Wrestler",    ovr: 16, dp: 180,  w: 3,  l: 2,  lastDays: 2 },
  { first: "Sami",    last: "Okafor",    nick: "Spark",          wc: "Lightweight",   style: "Capoeira",            story: "Street Fighter",      ovr: 11, dp: 40,   w: 0,  l: 2,  lastDays: 4 },
  { first: "Andre",   last: "Boateng",   nick: "Iron Lungs",     wc: "Heavyweight",   style: "Judo",                story: "Army Veteran",        ovr: 18, dp: 240,  w: 4,  l: 3,  lastDays: 1 },
  { first: "Marco",   last: "Bellini",   nick: "Stone Hands",    wc: "Middleweight",  style: "Boxer",               story: "Kickboxing Champion", ovr: 15, dp: 150,  w: 3,  l: 3,  lastDays: 3 },
  { first: "Jin",     last: "Park",      nick: "Lightning",      wc: "Featherweight", style: "Kickboxer",           story: "MMA Prodigy",         ovr: 17, dp: 200,  w: 3,  l: 1,  lastDays: 0 },

  // ── 4 Contenders (dp 300–1199, ovr 18–30) ──
  { first: "Rashad",  last: "Vance",     nick: "The Verdict",    wc: "Lightweight",   style: "Wrestler",            story: "College Wrestler",    ovr: 22, dp: 420,  w: 6,  l: 4,  lastDays: 1 },
  { first: "Bruno",   last: "Mendez",    nick: "El Toro",        wc: "Middleweight",  style: "Brazilian Jiu-Jitsu", story: "Late Bloomer",        ovr: 25, dp: 680,  w: 9,  l: 5,  lastDays: 2 },
  { first: "Sean",    last: "Gallagher", nick: "Cinderella",     wc: "Featherweight", style: "Boxer",               story: "Late Bloomer",        ovr: 27, dp: 920,  w: 11, l: 6,  lastDays: 0 },
  { first: "Dmitri",  last: "Sokolov",   nick: "The Bear",       wc: "Heavyweight",   style: "Sambo",               story: "Army Veteran",        ovr: 29, dp: 1120, w: 13, l: 6,  lastDays: 3 },

  // ── 3 Challengers (dp 1200–2499, ovr 25–40) ──
  { first: "Malik",   last: "Johnson",   nick: "Bad News",       wc: "Middleweight",  style: "Muay Thai",           story: "Street Fighter",      ovr: 31, dp: 1450, w: 16, l: 8,  lastDays: 1 },
  { first: "Hiroshi", last: "Nakamura",  nick: "The Surgeon",    wc: "Lightweight",   style: "Brazilian Jiu-Jitsu", story: "MMA Prodigy",         ovr: 35, dp: 1900, w: 19, l: 9,  lastDays: 0 },
  { first: "Gunnar",  last: "Olsen",     nick: "The Viking",     wc: "Heavyweight",   style: "Wrestler",            story: "Army Veteran",        ovr: 38, dp: 2300, w: 22, l: 10, lastDays: 2 },
];

(async () => {
  await connectDB();

  // Target the Open season whether it's live OR an upcoming countdown (so bots can be
  // seeded during the pre-season window and are ready on the ladder at go-live).
  const season = await Season.findOne({ status: { $in: ["active", "upcoming"] }, "config.crossWeightClass": true }).sort({ startDate: -1 })
    || await Season.findOne({ status: { $in: ["active", "upcoming"] } }).sort({ startDate: -1 });
  if (!season) {
    console.error("No active or upcoming season found — seed a season first (scripts/seedPreSeasonCountdown.js or seedPvpSeason1.js).");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Target season: #${season.seasonNumber} wc=${season.weightClass} id=${season._id}`);

  // Strip existing bots (idempotent — only touches isPvpBot:true, never real players).
  const existing = await Fighter.find({ isPvpBot: true }).select("_id").lean();
  const exIds = existing.map((f) => f._id);
  if (exIds.length) {
    await PVPRecord.deleteMany({ playerId: { $in: exIds } });
    await PVPFight.deleteMany({ $or: [{ attackerId: { $in: exIds } }, { defenderId: { $in: exIds } }] });
    await PVPRival.deleteMany({ $or: [{ player1Id: { $in: exIds } }, { player2Id: { $in: exIds } }] });
    await Fighter.deleteMany({ _id: { $in: exIds } });
    console.log(`Stripped ${exIds.length} existing bot(s) + their PVP data.`);
  }

  const now = Date.now();
  const counts = {};
  for (let i = 0; i < POOL.length; i++) {
    const b = POOL[i];
    const stats = {};
    STAT_KEYS.forEach((k) => { stats[k] = Math.max(1, Math.min(99, b.ovr)); });

    const fighter = await Fighter.create({
      firstName: b.first,
      lastName: b.last,
      nickname: b.nick,
      isPvpBot: true,
      weightClass: b.wc,
      style: b.style,
      backstory: b.story,
      overallRating: b.ovr,
      ...stats,
      record: { wins: b.w, losses: b.l },
      pvpOnboarding: { unlocked: true, placementComplete: true },
    });

    const div = divisionForDp(b.dp);
    counts[div] = (counts[div] || 0) + 1;
    const onStreak = i % 4 === 0; // a few show the streak pill
    const lastFightAt = new Date(now - b.lastDays * DAY);

    await PVPRecord.create({
      playerId: fighter._id,
      seasonId: season._id,
      weightClass: season.weightClass,   // season-derived ("Open") — load-bearing for pool filters
      realWeightClass: b.wc,              // true class — drives the cross-WC filter + [WC] pill
      division: div,
      dp: b.dp,
      peakDp: b.dp,
      overallRating: b.ovr,
      wins: b.w,
      losses: b.l,
      winStreak: onStreak ? 3 : 0,
      longestStreak: onStreak ? 3 : 0,
      defenseGameplan: GAMEPLANS[i % GAMEPLANS.length],
      lastFightAt,
      lastActiveAt: lastFightAt,
    });
    console.log(`  + ${b.first} "${b.nick}" ${b.last} (${b.wc}, ${b.style}, OVR ${b.ovr}) → ${div} @ ${b.dp} DP · ${b.w}-${b.l}`);
  }

  console.log(`\nCreated ${POOL.length} bots — ${JSON.stringify(counts)}`);
  const total = await PVPRecord.countDocuments({ seasonId: season._id });
  console.log(`Season now has ${total} PVP records.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
