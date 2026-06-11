/**
 * Ground & Pound — PVP record service.
 *
 * PVPRecord = a player's standing in one season. This service owns create/read of
 * records and the response DTO shaping. Division is ALWAYS recomputed from dp on a
 * write (never trusted from storage).
 */

const PVPRecord = require("../models/pvpRecordModel");
const Season = require("../models/seasonModel");
const HallOfFame = require("../models/hallOfFameModel");
const Fighter = require("../models/fighterModel");
const {
    DIVISIONS,
    REWARDS,
    SOFT_RESET,
    divisionForDp,
    divisionMeta,
    divisionFloor,
    badgeIdFor,
} = require("../consts/pvpConfig");
const { resolvePvpBadge } = require("../consts/pvpBadges");

function fighterName(fighter) {
    if (!fighter) return "Unknown";
    const nick = fighter.nickname ? ` "${fighter.nickname}"` : "";
    return `${fighter.firstName || ""}${nick} ${fighter.lastName || ""}`.trim();
}

/**
 * Load (or create) the active-season record for a fighter. Will NOT create records
 * for ended seasons.
 * @param {string} fighterId
 * @param {import("mongoose").Document} season  active Season doc
 * @param {import("mongoose").Document} [fighter] optional pre-loaded fighter for the OVR snapshot
 */
async function getOrCreateRecord(fighterId, season, fighter = null) {
    if (!season) throw new Error("season_required");
    let record = await PVPRecord.findOne({ playerId: fighterId, seasonId: season._id });
    if (record) return record;

    if (season.status !== "active") {
        // Don't auto-create into a non-active season.
        return null;
    }

    const f = fighter || (await Fighter.findById(fighterId).select("overallRating weightClass"));
    if (!f) throw new Error("fighter_not_found");

    try {
        record = await PVPRecord.create({
            playerId: fighterId,
            seasonId: season._id,
            // SEASON-DERIVED (load-bearing): equals season.weightClass — "Open" in an
            // Open season. Pool filters depend on this; do not change it.
            weightClass: season.weightClass,
            // The fighter's REAL class — used only for Open→per-WC redistribution.
            realWeightClass: f.weightClass || null,
            division: "prospect",
            dp: 0,
            peakDp: 0,
            overallRating: f.overallRating || 0,
            defenseGameplan: "balanced",
            lastFightAt: null,
            lastActiveAt: new Date(),
        });
        return record;
    } catch (err) {
        if (err && err.code === 11000) {
            // Raced with another request — load the winner.
            return PVPRecord.findOne({ playerId: fighterId, seasonId: season._id });
        }
        throw err;
    }
}

async function getRecord(playerId, seasonId) {
    return PVPRecord.findOne({ playerId, seasonId }).lean();
}

/**
 * Compute a record's ladder rank (1-based) within its season+weight class.
 * Accepts a record doc/lean OR an explicit { seasonId, weightClass, dp } shape.
 */
async function computeRank(record) {
    if (!record) return null;
    const higher = await PVPRecord.countDocuments({
        seasonId: record.seasonId,
        weightClass: record.weightClass,
        dp: { $gt: record.dp },
    });
    return higher + 1;
}

/**
 * Current belt holder for a season = highest-dp champion-division record with >=1 fight.
 * @returns {string|null} fighter id string or null (unclaimed)
 */
async function currentBeltHolderId(seasonId, weightClass) {
    const top = await PVPRecord.findOne({
        seasonId,
        weightClass,
        division: "champion",
        $expr: { $gt: [{ $add: ["$wins", "$losses"] }, 0] },
    }).sort({ dp: -1 }).select("playerId").lean();
    return top ? String(top.playerId) : null;
}

/**
 * Shape a single record into the §3.2 response DTO.
 * @param {object} record lean or hydrated
 * @param {object} [fighter] optional loaded fighter (for name)
 * @param {object} [opts] { season, rank, isBeltHolder }
 */
function shapeRecord(record, fighter, opts = {}) {
    if (!record) return null;
    const meta = divisionMeta(record.division) || DIVISIONS[0];
    const season = opts.season;
    return {
        playerId: String(record.playerId),
        name: opts.name || fighterName(fighter),
        seasonId: String(record.seasonId),
        seasonNumber: season ? season.seasonNumber : (opts.seasonNumber ?? null),
        weightClass: record.weightClass,
        // The fighter's real class (drives the Open-season WC pill on the "you" sticky row).
        // Additive; non-Open consumers ignore it.
        realWeightClass: record.realWeightClass || null,
        division: record.division,
        divisionColor: meta.color,
        dp: record.dp,
        peakDp: record.peakDp,
        promoteAt: meta.promoteAt,
        divisionFloor: meta.floor,
        wins: record.wins,
        losses: record.losses,
        winStreak: record.winStreak,
        longestStreak: record.longestStreak,
        defenseGameplan: record.defenseGameplan,
        promotionShield: record.promotionShield,
        rank: opts.rank ?? null,
        isBeltHolder: !!opts.isBeltHolder,
        lastFightAt: record.lastFightAt,
        lastActiveAt: record.lastActiveAt,
    };
}

/**
 * Career history for the profile card: last 3 ended seasons + current active record.
 */
async function getHistoryForCareer(playerId) {
    const records = await PVPRecord.find({ playerId })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();
    if (records.length === 0) return [];

    const seasonIds = records.map((r) => r.seasonId);
    const seasons = await Season.find({ _id: { $in: seasonIds } }).lean();
    const seasonMap = new Map(seasons.map((s) => [String(s._id), s]));

    const hofEntries = await HallOfFame.find({
        seasonId: { $in: seasonIds },
        beltHolderId: playerId,
    }).lean();
    const hofSet = new Set(hofEntries.map((h) => String(h.seasonId)));

    const rows = await Promise.all(records.map(async (r) => {
        const season = seasonMap.get(String(r.seasonId));
        const meta = divisionMeta(r.division) || DIVISIONS[0];
        const rank = await computeRank(r); // 1-based dp rank within that season's WC ladder
        return {
            seasonId: String(r.seasonId),
            seasonNumber: season ? season.seasonNumber : null,
            seasonName: season ? season.name : null,
            weightClass: r.weightClass,
            division: r.division,
            divisionColor: meta.color,
            dp: r.dp,
            rank,
            isActive: season ? season.status === "active" : false,
            isBeltHolder: hofSet.has(String(r.seasonId)),
        };
    }));

    // Keep the active one + up to 3 most-recent ended.
    const active = rows.filter((r) => r.isActive);
    const ended = rows.filter((r) => !r.isActive).slice(0, 3);
    return [...active, ...ended];
}

/** Mutation only — caller saves. */
function touchActive(record) {
    if (record) record.lastActiveAt = new Date();
}

/** Sync the OVR snapshot + recompute the denormalized division cache. Mutation only. */
function refreshOvrSnapshot(record, fighter) {
    if (!record) return;
    if (fighter && typeof fighter.overallRating === "number") {
        record.overallRating = fighter.overallRating;
    }
    record.division = divisionForDp(record.dp);
}

/**
 * Build the "your last season just ended" signal for GET /pvp/season/current.
 *
 * @returns {{ justEnded:boolean, lastSeasonRecord:object|null }}
 *   justEnded is true iff the actor has an ENDED-season PVPRecord for this weight class
 *   with seasonEndSeen=false AND wins+losses>=1. lastSeasonRecord is the shaped block
 *   for that record (else null).
 */
async function getJustEndedBlock(playerId, weightClass) {
    // Most-recent unacknowledged, eligible record whose season has ended.
    const candidates = await PVPRecord.find({
        playerId,
        // Match the real-WC arg OR an ended Open record (which carries weightClass:"Open").
        weightClass: { $in: [weightClass, "Open"] },
        seasonEndSeen: false,
        $expr: { $gte: [{ $add: ["$wins", "$losses"] }, 1] },
    }).sort({ createdAt: -1 }).limit(10).lean();

    for (const record of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const season = await Season.findById(record.seasonId).lean();
        if (!season || season.status !== "ended") continue;

        // Belt holder for that ended season.
        const beltId = season.beltHolderId ? String(season.beltHolderId) : null;
        const isBeltHolder = beltId != null && String(record.playerId) === beltId;

        // eslint-disable-next-line no-await-in-loop
        const rank = await computeRank(record);
        const meta = divisionMeta(record.division) || DIVISIONS[0];

        // Rewards earned at season end: belt REPLACES champion (no stack).
        const rewardKey = isBeltHolder ? "beltHolder" : record.division;
        const rewardCfg = REWARDS[rewardKey] || { iron: 0, fame: 0, drinks: 0, badge: null };
        let badgeName = null;
        if (rewardCfg.badge) {
            const badgeId = isBeltHolder
                ? badgeIdFor("belt", season.seasonNumber, season.weightClass)
                : badgeIdFor(record.division, season.seasonNumber, season.weightClass);
            const resolved = resolvePvpBadge(badgeId);
            badgeName = resolved ? resolved.name : null;
        }

        // Soft-reset landing spot in the new season.
        const newDivision = SOFT_RESET[record.division] || "prospect";
        const newDp = divisionFloor(newDivision);

        return {
            justEnded: true,
            lastSeasonRecord: {
                seasonId: String(record.seasonId),
                seasonNumber: season.seasonNumber,
                seasonName: season.name,
                weightClass: record.weightClass,
                division: record.division,
                divisionColor: meta.color,
                dp: record.dp,
                rank,
                isBeltHolder,
                rewards: {
                    iron: rewardCfg.iron || 0,
                    fame: rewardCfg.fame || 0,
                    drinks: rewardCfg.drinks || 0,
                    badge: badgeName,
                },
                newDivision,
                newDp,
            },
        };
    }

    return { justEnded: false, lastSeasonRecord: null };
}

/**
 * Acknowledge the SeasonEnd/NewSeason modal: mark the actor's record for `seasonId`
 * as seen. Idempotent.
 * @returns {{ acknowledged:boolean }}
 */
async function acknowledgeSeason(playerId, seasonId) {
    await PVPRecord.updateOne(
        { playerId, seasonId },
        { $set: { seasonEndSeen: true } }
    );
    return { acknowledged: true };
}

module.exports = {
    getOrCreateRecord,
    getRecord,
    computeRank,
    currentBeltHolderId,
    shapeRecord,
    getHistoryForCareer,
    getJustEndedBlock,
    acknowledgeSeason,
    touchActive,
    refreshOvrSnapshot,
    fighterName,
    divisionFloor,
};
