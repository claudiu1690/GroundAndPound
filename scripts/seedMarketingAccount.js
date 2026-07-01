/**
 * Seed a polished MARKETING account — a believable Regional Pro fighter for
 * screenshots / promo materials. Login-able, tutorial already done, with a real
 * name, a fight record, a backdated career feed (Octagon Gazette regenerated),
 * badges, fame, and a few active injuries on the body map.
 *
 * Built through the real fighter-creation service, then tuned. Idempotent + scoped:
 * only touches the single marketing email below (removes prior user + fighter +
 * their activity log, then recreates). No other data altered.
 *
 * Usage:
 *   node scripts/seedMarketingAccount.js                                  (local DB)
 *   USE_ATLAS=true LOCAL_MODE=false node scripts/seedMarketingAccount.js  (prod Atlas)
 */
// Mongo-only by design: this script never touches Redis, so it works both locally and
// when run from your machine against prod Atlas (prod Redis is railway.internal and is
// NOT reachable from outside Railway). That's why we build the Fighter doc directly
// instead of fighterService.createFighter (whose getFighterById step reconciles energy
// via Redis and would hang).
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("../config");
const User = require("../models/userModel");
const Fighter = require("../models/fighterModel");
const ActivityLog = require("../models/activityLogModel");
const notorietyService = require("../services/notorietyService");
const { regenerateGazette } = require("../services/gazetteService");
const { buildInjury, applyInjuryToFighter } = require("../utils/injuryUtils");
const { calculateOverall } = require("../utils/overallRating");
const { ENERGY } = require("../consts/gameConstants");
const { generatePodcastName } = require("../consts/mediaHubConfig");

const EMAIL = "marketing@test.com";
const PASSWORD = "marketing123";

// Real-looking fighter — a boxer-puncher in the Regional Pro mid-tier.
const PROFILE = {
    firstName: "Marcus", lastName: "Reed", nickname: "The Hammer",
    weightClass: "Middleweight", style: "Boxer",
};
// Varied striker stats (averages into the Regional Pro band ~30-48 after injuries).
const STATS = { str: 43, spd: 44, leg: 38, wre: 34, gnd: 35, sub: 32, chn: 45, fiq: 40 };
const BADGES = ["First Blood", "KO Artist", "On a Roll"];
const ACTIVE_INJURIES = ["bruised_rib", "broken_nose", "sprained_ankle"];
const DAY = 24 * 3600 * 1000;

// Backdated career feed (most recent last). detail is what the feed/Gazette show.
const FEED = [
    { daysAgo: 41, type: "TIER_PROMOTION", detail: "Promoted to Regional Pro", tier: "Regional Pro", meta: { to: "Regional Pro" } },
    { daysAgo: 35, type: "FIGHT_WIN",  detail: "Defeated Danny Cole by unanimous decision", tier: "Regional Pro", meta: { opponentName: "Danny Cole", method: "Decision" } },
    { daysAgo: 28, type: "BADGE_EARNED", detail: "Earned badge: KO Artist", tier: "Regional Pro", meta: { badge: "KO Artist" } },
    { daysAgo: 26, type: "FIGHT_WIN",  detail: "Stopped Rashad Vance by KO in round 1", tier: "Regional Pro", meta: { opponentName: "Rashad Vance", method: "KO/TKO", round: 1 } },
    { daysAgo: 17, type: "FIGHT_LOSS", detail: "Lost to Bruno Mendez by split decision", tier: "Regional Pro", meta: { opponentName: "Bruno Mendez", method: "Decision" } },
    { daysAgo: 9,  type: "FIGHT_WIN",  detail: "Submitted Cole Whitaker by rear-naked choke in round 2", tier: "Regional Pro", meta: { opponentName: "Cole Whitaker", method: "Submission", round: 2 } },
    { daysAgo: 2,  type: "FIGHT_WIN",  detail: "Knocked out Sami Okafor in round 3", tier: "Regional Pro", meta: { opponentName: "Sami Okafor", method: "KO/TKO", round: 3 } },
];

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log(`Connected → ${mongoose.connection.name}`);

    // Idempotent cleanup — only this marketing account.
    const prior = await User.findOne({ email: EMAIL });
    if (prior) {
        if (prior.fighterId) {
            await Fighter.deleteOne({ _id: prior.fighterId });
            await ActivityLog.deleteMany({ fighterId: prior.fighterId });
        }
        await User.deleteOne({ _id: prior._id });
        console.log("Removed prior marketing account.");
    }

    // Build the fighter doc directly (Mongo-only — no Redis). Mirrors the field shape
    // of fighterService.createFighter, then tuned for a Regional Pro marketing profile.
    const fighter = new Fighter({
        firstName: PROFILE.firstName,
        lastName: PROFILE.lastName,
        nickname: PROFILE.nickname,
        weightClass: PROFILE.weightClass,
        style: PROFILE.style,
        backstory: null,
        ...STATS,
        maxStamina: 100,
        stamina: 100,
        health: 72, // banged up
        energy: { current: ENERGY.max, max: ENERGY.max, lastSyncedAt: new Date() },
        iron: 8500,
        winStreak: 0,
        notoriety: { score: 0, peakTier: "UNKNOWN", isFrozen: false, lastEventAt: null, documentaryUsed: false, milestones: {}, firstFinishPromoTiers: [] },
        promotionTier: "Regional Pro",
        record: { wins: 9, losses: 3, draws: 0 },
        winsInCurrentTier: 4,
        lastFightDate: new Date(Date.now() - 2 * DAY),
        overallRating: 14,
        media: { podcastName: generatePodcastName(PROFILE.firstName, PROFILE.lastName, PROFILE.nickname) },
        tutorial: { completed: true, completed_at: new Date() },
        pvpOnboarding: { unlocked: true, placementComplete: true, placementWins: 0, placementFights: 0, shieldExpiresAt: null, firstSeasonComplete: false },
        badges: [...BADGES],
        injuries: [],
    });

    // Fame / notoriety — a Regional Pro contender on the rise.
    notorietyService.ensureNotorietyShape(fighter);
    fighter.notoriety.score = 7500; // Rising Star fame tier — fits a 9-3 Regional Pro contender
    notorietyService.syncPeakTier(fighter);

    // Active injuries (applied AFTER base stats so OVR reflects the injured state, like
    // the live game).
    for (const key of ACTIVE_INJURIES) {
        const inj = buildInjury(key, fighter.promotionTier);
        if (!inj) { console.warn(`  unknown injury key: ${key}`); continue; }
        applyInjuryToFighter(fighter, inj);
        fighter.injuries.push(inj);
    }

    fighter.overallRating = calculateOverall(fighter);
    for (const k of ["record", "tutorial", "pvpOnboarding", "badges", "notoriety", "injuries"]) fighter.markModified(k);
    await fighter.save();

    // Login-able account (email pre-confirmed).
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await User.create({ email: EMAIL, passwordHash, emailConfirmed: true, fighterId: fighter._id });
    fighter.userId = user._id;
    await fighter.save();

    // Backdated career feed (raw insert to set createdAt past the timestamps default).
    const now = Date.now();
    await ActivityLog.collection.insertMany(FEED.map((e) => ({
        fighterId: fighter._id,
        type: e.type,
        detail: e.detail,
        tier: e.tier ?? null,
        meta: e.meta ?? {},
        createdAt: new Date(now - e.daysAgo * DAY),
        updatedAt: new Date(now - e.daysAgo * DAY),
    })));
    console.log(`Seeded ${FEED.length} career-feed entries.`);

    // Regenerate the Octagon Gazette so the dashboard tile is populated.
    try { await regenerateGazette(String(fighter._id), "FIGHT_WIN"); console.log("Regenerated Octagon Gazette."); }
    catch (e) { console.warn("Gazette regen skipped:", e.message); }

    console.log("\n========== MARKETING ACCOUNT READY ==========");
    console.log(`  Email:    ${EMAIL}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(`  Fighter:  ${fighter.firstName} "${fighter.nickname}" ${fighter.lastName} (${fighter.weightClass}, ${fighter.style})`);
    console.log(`  OVR:      ${fighter.overallRating}   Tier: ${fighter.promotionTier}   Record: ${fighter.record.wins}-${fighter.record.losses}`);
    console.log(`  Fame:     ${fighter.notoriety.score} (${fighter.notoriety.peakTier})   Badges: ${fighter.badges.join(", ")}`);
    console.log(`  Injuries: ${fighter.injuries.map((i) => i.label).join(", ")}   Health: ${fighter.health}`);
    console.log("=============================================\n");

    await mongoose.disconnect();
    console.log("Done.");
}

run().then(() => process.exit(0)).catch((err) => { console.error("Seed failed:", err); process.exit(1); });
