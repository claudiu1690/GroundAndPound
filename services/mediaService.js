const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");
const Opponent = require("../models/opponentModel");
const notorietyService = require("./notorietyService");
const energyService = require("./energyService");
const mainEventService = require("./mainEventService");
const { tierRank } = require("../consts/notorietyConfig");
const {
    PODCAST_ENERGY_COST,
    PODCAST_SEGMENTS,
    DOCUMENTARY,
    DIVISION_ROSTER_LIMIT_PER_TIER,
} = require("../consts/mediaConfig");

// ─────────────────────────────────────────────────────────────
// Calendar-day helpers for the podcast cooldown
// ─────────────────────────────────────────────────────────────

function isSameCalendarDay(a, b) {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear()
        && x.getMonth() === y.getMonth()
        && x.getDate() === y.getDate();
}

/** Next midnight after a given date (defaults to now). */
function nextMidnight(after = new Date()) {
    const d = new Date(after);
    d.setHours(24, 0, 0, 0); // rolls into next day at 00:00
    return d;
}

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

async function getMediaState(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const lastPodcastAt = fighter.media?.lastPodcastAt || null;
    const podcastedToday = lastPodcastAt ? isSameCalendarDay(lastPodcastAt, new Date()) : false;
    const canPodcast = !podcastedToday;
    const podcastReadyAt = podcastedToday ? nextMidnight() : null;

    const lastFight = await Fight.findOne({ fighterId, status: "completed" })
        .sort({ completedAt: -1, updatedAt: -1 })
        .lean();

    const docUnlocked = tierRank(fighter.notoriety?.peakTier || "UNKNOWN") >= tierRank(DOCUMENTARY.unlockTier);
    const documentaryUsed = !!fighter.notoriety?.documentaryUsed;

    return {
        fame: fighter.notoriety?.score || 0,
        peakTier: fighter.notoriety?.peakTier || "UNKNOWN",
        podcast: {
            canPodcast,
            energyCost: PODCAST_ENERGY_COST,
            cooldownEndsAt: podcastReadyAt,
            lastPodcastAt,
            count: fighter.media?.podcastCount || 0,
            hasLastFight: !!lastFight,
        },
        documentary: {
            unlocked: docUnlocked,
            used: documentaryUsed,
            unlockTier: DOCUMENTARY.unlockTier,
            fameReward: DOCUMENTARY.fameReward,
            ironReward: DOCUMENTARY.ironReward,
        },
        flags: {
            beef: fighter.beefFlags || [],
            respect: fighter.respectFlags || [],
        },
    };
}

async function listDivisionRoster(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    // Same-tier roster, no champion, not nemesis, not the existing callout target.
    const exclude = [];
    if (fighter.nemesis?.opponentId) exclude.push(fighter.nemesis.opponentId);
    if (fighter.activeCallout?.opponentId) exclude.push(fighter.activeCallout.opponentId);

    const query = {
        weightClass: fighter.weightClass,
        promotionTier: fighter.promotionTier,
        isChampion: { $ne: true },
    };
    if (exclude.length) query._id = { $nin: exclude };

    const roster = await Opponent.find(query)
        .sort({ overallRating: -1 })
        .limit(DIVISION_ROSTER_LIMIT_PER_TIER)
        .select("name nickname style overallRating record")
        .lean();

    // Mark existing flags so the UI can show indicators.
    const beefSet = new Set((fighter.beefFlags || []).map((f) => String(f.opponentId)));
    const respSet = new Set((fighter.respectFlags || []).map((f) => String(f.opponentId)));

    return roster.map((o) => ({
        id: String(o._id),
        name: o.name,
        nickname: o.nickname,
        style: o.style,
        overallRating: o.overallRating,
        record: o.record || { wins: 0, losses: 0, draws: 0 },
        hasBeef: beefSet.has(String(o._id)),
        hasRespect: respSet.has(String(o._id)),
    }));
}

// ─────────────────────────────────────────────────────────────
// Podcast
// ─────────────────────────────────────────────────────────────

async function doPodcast(fighterId, { segment, tone, targetOpponentId, mainEventId, pickedSide, pickedMethod }) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    // Cooldown gate — one podcast per calendar day (resets at midnight).
    if (fighter.media?.lastPodcastAt && isSameCalendarDay(fighter.media.lastPodcastAt, new Date())) {
        throw new Error("Podcast is on cooldown — next one unlocks at midnight");
    }
    // Energy gate — deductEnergy throws "Not enough energy" if insufficient;
    // it also writes the new energy value to Redis + Mongo itself.
    await energyService.deductEnergy(fighterId, PODCAST_ENERGY_COST);

    const seg = PODCAST_SEGMENTS[segment];
    if (!seg) throw new Error("Unknown podcast segment");

    let fameDelta = 0;
    let ironDelta = 0;
    let fameReason = "Podcast appearance";
    let extra = null;

    if (segment === "RECAP") {
        const last = await Fight.findOne({ fighterId, status: "completed" }).sort({ completedAt: -1 }).lean();
        if (!last) throw new Error("No completed fight to recap");
        fameDelta = seg.fameReward;
        ironDelta = seg.ironReward;
        fameReason = "Podcast recap";
    } else if (segment === "DIVISION") {
        if (!tone || !seg.tones[tone]) throw new Error("Invalid division-talk tone");
        if (!targetOpponentId) throw new Error("Target opponent required for division talk");
        const opp = await Opponent.findById(targetOpponentId).lean();
        if (!opp) throw new Error("Target opponent not found");
        if (opp.weightClass !== fighter.weightClass) throw new Error("Target must share your weight class");
        if (opp.promotionTier !== fighter.promotionTier) throw new Error("Target must share your promotion tier");

        const toneDef = seg.tones[tone];
        fameDelta = toneDef.fameReward;
        fameReason = `Podcast: ${toneDef.label} on ${opp.name}`;

        if (toneDef.emitBeefFlag) {
            fighter.beefFlags = fighter.beefFlags || [];
            const existing = fighter.beefFlags.find((f) => String(f.opponentId) === String(opp._id));
            if (existing) {
                existing.expiresAfterFights = toneDef.beefExpiresAfterFights;
                existing.source = "PODCAST";
                existing.createdAt = new Date();
            } else {
                fighter.beefFlags.push({
                    opponentId: opp._id,
                    opponentName: opp.name,
                    source: "PODCAST",
                    expiresAfterFights: toneDef.beefExpiresAfterFights,
                    createdAt: new Date(),
                });
            }
            extra = { flag: "beef", opponentName: opp.name, expiresAfterFights: toneDef.beefExpiresAfterFights };
        }
        if (toneDef.emitRespectFlag) {
            fighter.respectFlags = fighter.respectFlags || [];
            if (!fighter.respectFlags.some((f) => String(f.opponentId) === String(opp._id))) {
                fighter.respectFlags.push({
                    opponentId: opp._id,
                    opponentName: opp.name,
                    source: "PODCAST",
                    expiresAfterFights: toneDef.respectExpiresAfterFights,
                    createdAt: new Date(),
                });
            }
            extra = { flag: "respect", opponentName: opp.name };
        }
    } else if (segment === "PREDICT") {
        if (!mainEventId || !pickedSide) throw new Error("Event + prediction required");
        // Delegates to mainEventService. Its own validation applies; payouts come later at resolve time.
        const pred = await mainEventService.submitPrediction(fighterId, mainEventId, pickedSide, pickedMethod);
        extra = { prediction: pred };
        fameReason = "Podcast prediction logged";
    } else {
        throw new Error("Unsupported podcast segment");
    }

    // Apply fame (only for RECAP and DIVISION — PREDICT pays out at resolution).
    if (fameDelta !== 0) {
        notorietyService.applyNotorietyDelta(fighter, fameDelta, {
            code: "PODCAST",
            reason: fameReason,
            meta: { segment, tone: tone || null },
        });
        notorietyService.touchLastEvent(fighter);
    }
    if (ironDelta > 0) fighter.iron = (fighter.iron || 0) + ironDelta;

    // Set podcast cooldown (energy already deducted by deductEnergy above).
    fighter.media = fighter.media || { podcastCount: 0, interviewCount: 0 };
    fighter.media.lastPodcastAt = new Date();
    fighter.media.podcastCount = (fighter.media.podcastCount || 0) + 1;

    await fighter.save();

    return {
        segment,
        fameDelta,
        ironDelta,
        fameReason,
        extra,
        cooldownEndsAt: nextMidnight(fighter.media.lastPodcastAt),
    };
}

// ─────────────────────────────────────────────────────────────
// Documentary — once per career, Star+
// ─────────────────────────────────────────────────────────────

async function doDocumentary(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);

    if (fighter.notoriety.documentaryUsed) throw new Error("You've already recorded your documentary");
    if (tierRank(fighter.notoriety.peakTier) < tierRank(DOCUMENTARY.unlockTier)) {
        throw new Error(`Documentary unlocks at ${DOCUMENTARY.unlockTier.replace("_", " ")} fame tier`);
    }

    // Apply rewards.
    notorietyService.applyNotorietyDelta(fighter, DOCUMENTARY.fameReward, {
        skipFreezeBlock: true,
        code: "DOCUMENTARY",
        reason: "Career documentary released",
    });
    notorietyService.touchLastEvent(fighter);
    fighter.iron = (fighter.iron || 0) + DOCUMENTARY.ironReward;

    // Add the Documentary badge → unlocks BADGE_DOCUMENTARY banner piece.
    fighter.badges = fighter.badges || [];
    if (!fighter.badges.includes(DOCUMENTARY.badge)) fighter.badges.push(DOCUMENTARY.badge);

    fighter.notoriety.documentaryUsed = true;
    await fighter.save();

    return {
        fameDelta: DOCUMENTARY.fameReward,
        ironDelta: DOCUMENTARY.ironReward,
        badge: DOCUMENTARY.badge,
    };
}

// ─────────────────────────────────────────────────────────────
// Interview archive
// ─────────────────────────────────────────────────────────────

async function listInterviewArchive(fighterId, limit = 20) {
    const rows = await Fight.find({
        fighterId,
        status: "completed",
        "interview.done": true,
    })
        .sort({ "interview.resolvedAt": -1, completedAt: -1 })
        .limit(Math.max(1, Math.min(50, limit)))
        .populate("opponentId", "name nickname")
        .lean();

    return rows.map((f) => ({
        id: String(f._id),
        outcome: f.outcome,
        opponentName: f.opponentId?.name || "Opponent",
        opponentNickname: f.opponentId?.nickname || null,
        promotionTier: f.promotionTier,
        interview: {
            choice: f.interview?.choice,
            targetOpponentId: f.interview?.targetOpponentId ? String(f.interview.targetOpponentId) : null,
            fameGained: f.interview?.fameGained || 0,
            resolvedAt: f.interview?.resolvedAt,
        },
    }));
}

module.exports = {
    getMediaState,
    listDivisionRoster,
    doPodcast,
    doDocumentary,
    listInterviewArchive,
};
