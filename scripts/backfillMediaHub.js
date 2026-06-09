/**
 * Backfill: Media Hub (Phase 6).
 *
 * Idempotent. For every fighter:
 *   - media.podcastName     ← generated if missing
 *   - media.episodeCount    ← existing episodeCount, else legacy podcastCount, else 0
 *   - media.lastRecordedDate← existing, else legacy lastPodcastAt, else null
 *   - media.documentaryStatus ← "recorded" if notoriety.documentaryUsed,
 *                                else "available" if peakTier >= STAR, else "locked"
 *   - media.appearancesRotation ← -1 (forces a fresh pool on next hub load)
 *
 * Does NOT reconstruct historical podcast episodes — old podcasts won't appear in
 * the Archive. Only newly recorded episodes are persisted to PodcastEpisode.
 *
 * Run: node scripts/backfillMediaHub.js
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const { generatePodcastName, DOCUMENTARY_UNLOCK_TIER } = require("../consts/mediaHubConfig");
const { tierRank } = require("../consts/notorietyConfig");

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const fighters = await Fighter.find({});
    let updated = 0;

    for (const fighter of fighters) {
        const media = fighter.media || {};
        let changed = false;

        if (!media.podcastName) {
            media.podcastName = generatePodcastName(fighter.firstName, fighter.lastName, fighter.nickname || null);
            changed = true;
        }

        const desiredEpisodeCount = media.episodeCount || media.podcastCount || 0;
        if (media.episodeCount !== desiredEpisodeCount) {
            media.episodeCount = desiredEpisodeCount;
            changed = true;
        }

        const desiredLastRecorded = media.lastRecordedDate || media.lastPodcastAt || null;
        if ((media.lastRecordedDate || null) !== (desiredLastRecorded || null)) {
            media.lastRecordedDate = desiredLastRecorded;
            changed = true;
        }

        const peak = fighter.notoriety?.peakTier || "UNKNOWN";
        let desiredDocStatus;
        if (fighter.notoriety?.documentaryUsed) desiredDocStatus = "recorded";
        else if (tierRank(peak) >= tierRank(DOCUMENTARY_UNLOCK_TIER)) desiredDocStatus = "available";
        else desiredDocStatus = "locked";
        // Never downgrade a fighter who is already marked recorded.
        if (media.documentaryStatus === "recorded") desiredDocStatus = "recorded";
        if (media.documentaryStatus !== desiredDocStatus) {
            media.documentaryStatus = desiredDocStatus;
            changed = true;
        }

        if (media.appearancesRotation !== -1) {
            media.appearancesRotation = -1;
            changed = true;
        }
        if (!Array.isArray(media.appearances)) {
            media.appearances = [];
            changed = true;
        }

        if (changed) {
            fighter.media = media;
            fighter.markModified("media");
            await fighter.save();
            updated += 1;
        }
    }

    console.log(`Backfill complete — updated ${updated}/${fighters.length} fighters`);
    await mongoose.disconnect();
}

run().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
