/**
 * Ground & Pound — PVP ("Proving Ground") controller.
 *
 * Thin: parse params, call a service, map known service errors → status/code. The
 * actor is ALWAYS req.user.fighterId — never read from the body (one player can never
 * fight as another).
 */

const mongoose = require("mongoose");
const Fighter = require("../models/fighterModel");
const Season = require("../models/seasonModel");
const PVPRecord = require("../models/pvpRecordModel");
const HallOfFame = require("../models/hallOfFameModel");
const pvpSeasonService = require("../services/pvpSeasonService");
const pvpRecordService = require("../services/pvpRecordService");
const pvpMatchmakingService = require("../services/pvpMatchmakingService");
const pvpFightService = require("../services/pvpFightService");
const { WEIGHT_CLASSES_PVP, TWISTS, divisionMeta, DIVISIONS } = require("../consts/pvpConfig");

function isValidWeightClass(wc) {
    return WEIGHT_CLASSES_PVP.includes(wc);
}

function clampLimit(raw, def = 25, max = 100) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return def;
    return Math.min(n, max);
}

function shapeSeasonBlock(season, beltHolderName = null) {
    if (!season) return null;
    const twist = TWISTS[season.twist] || {};
    let twistEffect = null;
    if (twist.methods && typeof twist.pct === "number") {
        twistEffect = `+${Math.round(twist.pct * 100)}% DP on ${twist.methods.join("/")} wins`;
    } else if (typeof twist.streakFrom === "number") {
        twistEffect = `Streak bonus from ${twist.streakFrom} wins`;
    }
    return {
        id: String(season._id),
        seasonNumber: season.seasonNumber,
        name: season.name,
        twist: season.twist,
        twistName: twist.name || season.twist,
        twistEffect,
        weightClass: season.weightClass,
        status: season.status,
        beltHolderId: season.beltHolderId ? String(season.beltHolderId) : null,
        beltHolderName,
        startDate: season.startDate,
        endDate: season.endDate,
    };
}

async function beltHolderName(season) {
    if (!season || !season.beltHolderId) return null;
    const f = await Fighter.findById(season.beltHolderId).select("firstName lastName nickname").lean();
    return f ? pvpRecordService.fighterName(f) : null;
}

/** Map a PvpError (or generic) to the response. */
function handleError(res, err) {
    if (err && err.isPvp) {
        return res.status(err.status || 400).json({ message: err.message, code: err.code });
    }
    console.error("[pvpController]", err);
    return res.status(500).json({ message: "Internal server error" });
}

// ── GET /pvp/ladder/:weightClass/:seasonId ──────────────────────────────────
async function getLadder(req, res) {
    try {
        const { weightClass, seasonId } = req.params;
        if (!isValidWeightClass(weightClass)) {
            return res.status(400).json({ message: "Invalid weight class.", code: "bad_weight_class" });
        }
        if (!mongoose.isValidObjectId(seasonId)) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }
        const season = await Season.findById(seasonId);
        if (!season || season.weightClass !== weightClass) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = clampLimit(req.query.limit, 25, 100);
        const filter = { seasonId: season._id, weightClass };
        const total = await PVPRecord.countDocuments(filter);
        const records = await PVPRecord.find(filter)
            .sort({ dp: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const ids = records.map((r) => r.playerId);
        const fighters = await Fighter.find({ _id: { $in: ids } })
            .select("firstName lastName nickname").lean();
        const nameMap = new Map(fighters.map((f) => [String(f._id), pvpRecordService.fighterName(f)]));

        const beltId = await pvpRecordService.currentBeltHolderId(season._id, weightClass);
        const me = String(req.user.fighterId);

        const rows = records.map((r, i) => {
            const meta = divisionMeta(r.division) || DIVISIONS[0];
            return {
                rank: (page - 1) * limit + i + 1,
                playerId: String(r.playerId),
                name: nameMap.get(String(r.playerId)) || "Unknown",
                division: r.division,
                divisionColor: meta.color,
                dp: r.dp,
                wins: r.wins,
                losses: r.losses,
                winStreak: r.winStreak,
                overallRating: r.overallRating,
                isBeltHolder: beltId != null && String(r.playerId) === beltId,
                isYou: String(r.playerId) === me,
            };
        });

        return res.json({
            season: shapeSeasonBlock(season, await beltHolderName(season)),
            rows,
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/record/:playerId ───────────────────────────────────────────────
async function getRecord(req, res) {
    try {
        const { playerId } = req.params;
        if (!mongoose.isValidObjectId(playerId)) {
            return res.status(404).json({ message: "Fighter not found.", code: "fighter_not_found" });
        }
        const fighter = await Fighter.findById(playerId)
            .select("firstName lastName nickname weightClass overallRating").lean();
        if (!fighter) {
            return res.status(404).json({ message: "Fighter not found.", code: "fighter_not_found" });
        }

        const season = await pvpSeasonService.getCurrentSeason(fighter.weightClass);
        let recordDto = null;
        if (season) {
            const record = await PVPRecord.findOne({ playerId, seasonId: season._id });
            if (record) {
                const rank = await pvpRecordService.computeRank(record);
                const beltId = await pvpRecordService.currentBeltHolderId(season._id, season.weightClass);
                recordDto = pvpRecordService.shapeRecord(record, fighter, {
                    season,
                    rank,
                    isBeltHolder: beltId != null && String(playerId) === beltId,
                    name: pvpRecordService.fighterName(fighter),
                });
                // Read-through activity touch for own record.
                if (String(req.user.fighterId) === String(playerId)) {
                    pvpRecordService.touchActive(record);
                    pvpRecordService.refreshOvrSnapshot(record, fighter);
                    try { await record.save(); } catch (_) { /* non-fatal */ }
                }
            }
        }

        const history = await pvpRecordService.getHistoryForCareer(playerId);
        return res.json({ record: recordDto, history });
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/opponents ──────────────────────────────────────────────────────
async function getOpponents(req, res) {
    try {
        const fighter = await Fighter.findById(req.user.fighterId);
        if (!fighter) return res.status(404).json({ message: "Fighter not found.", code: "fighter_not_found" });

        const season = await Season.findOne({ weightClass: fighter.weightClass, status: "active" });
        if (!season) {
            return res.status(409).json({ message: "No active season for your weight class.", code: "season_not_active" });
        }

        const myRecord = await pvpRecordService.getOrCreateRecord(fighter._id, season, fighter);
        const candidates = await pvpMatchmakingService.getOpponents(fighter, season, myRecord);

        return res.json({
            season: shapeSeasonBlock(season, await beltHolderName(season)),
            you: {
                division: myRecord.division,
                dp: myRecord.dp,
                overallRating: fighter.overallRating || 0,
                record: { wins: myRecord.wins, losses: myRecord.losses },
            },
            candidates,
        });
    } catch (err) {
        return handleError(res, err);
    }
}

// ── POST /pvp/fight ─────────────────────────────────────────────────────────
async function postFight(req, res) {
    try {
        const body = req.body || {};
        const result = await pvpFightService.resolveFight(req.user.fighterId, {
            defenderId: body.defenderId,
            gameplan: body.gameplan,
            seasonId: body.seasonId,
            weightClass: body.weightClass,
        });
        return res.json(result);
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/fights/:seasonId ───────────────────────────────────────────────
async function getFights(req, res) {
    try {
        const { seasonId } = req.params;
        if (!mongoose.isValidObjectId(seasonId)) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }
        const result = await pvpFightService.listFights(seasonId, req.user.fighterId, {
            page: req.query.page,
            limit: req.query.limit,
        });
        return res.json(result);
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/defense-results ─────────────────────────────────────────────────
async function getDefenseResults(req, res) {
    try {
        const ack = req.query.ack !== "false"; // default true
        const result = await pvpFightService.listDefenseResults(req.user.fighterId, ack);
        return res.json(result);
    } catch (err) {
        return handleError(res, err);
    }
}

// ── POST /pvp/defense-gameplan ───────────────────────────────────────────────
async function setDefenseGameplan(req, res) {
    try {
        const result = await pvpFightService.setDefenseGameplan(req.user.fighterId, (req.body || {}).gameplan);
        return res.json(result);
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/hof ─────────────────────────────────────────────────────────────
async function getHof(req, res) {
    try {
        const { weightClass } = req.query;
        const limit = clampLimit(req.query.limit, 20, 100);
        const filter = {};
        if (weightClass) {
            if (!isValidWeightClass(weightClass)) {
                return res.status(400).json({ message: "Invalid weight class.", code: "bad_weight_class" });
            }
            filter.weightClass = weightClass;
        }
        const entries = await HallOfFame.find(filter)
            .sort({ seasonNumber: -1 })
            .limit(limit)
            .lean();

        const ids = entries.map((e) => e.beltHolderId).filter(Boolean);
        const fighters = await Fighter.find({ _id: { $in: ids } })
            .select("firstName lastName nickname").lean();
        const nameMap = new Map(fighters.map((f) => [String(f._id), pvpRecordService.fighterName(f)]));

        return res.json({
            entries: entries.map((e) => ({
                seasonId: String(e.seasonId),
                seasonNumber: e.seasonNumber,
                weightClass: e.weightClass,
                beltHolderId: e.beltHolderId ? String(e.beltHolderId) : null,
                beltHolderName: e.beltHolderId ? (nameMap.get(String(e.beltHolderId)) || "Unknown") : null,
                finalDp: e.finalDp,
                record: e.record || { wins: 0, losses: 0 },
                createdAt: e.createdAt,
            })),
        });
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/season/current/:weightClass ─────────────────────────────────────
async function getCurrentSeason(req, res) {
    try {
        const { weightClass } = req.params;
        if (!isValidWeightClass(weightClass)) {
            return res.status(400).json({ message: "Invalid weight class.", code: "bad_weight_class" });
        }
        const season = await pvpSeasonService.getCurrentSeason(weightClass);
        if (!season) {
            return res.json({ season: null, yourRecord: null, beltUnclaimed: true, poolCount: 0 });
        }

        let yourRecord = null;
        let poolCount = 0;
        const fighter = await Fighter.findById(req.user.fighterId)
            .select("firstName lastName nickname weightClass overallRating").lean();

        if (fighter && fighter.weightClass === weightClass) {
            const record = await PVPRecord.findOne({ playerId: req.user.fighterId, seasonId: season._id });
            if (record) {
                const rank = await pvpRecordService.computeRank(record);
                const beltId = await pvpRecordService.currentBeltHolderId(season._id, weightClass);
                yourRecord = pvpRecordService.shapeRecord(record, fighter, {
                    season,
                    rank,
                    isBeltHolder: beltId != null && String(req.user.fighterId) === beltId,
                    name: pvpRecordService.fighterName(fighter),
                });
                poolCount = await PVPRecord.countDocuments({
                    seasonId: season._id,
                    weightClass,
                    division: record.division,
                });
            }
        }

        // "Your last season just ended" signal — drives SeasonEndModal/NewSeasonModal.
        const { justEnded, lastSeasonRecord } = await pvpRecordService.getJustEndedBlock(
            req.user.fighterId,
            weightClass
        );

        return res.json({
            season: shapeSeasonBlock(season, await beltHolderName(season)),
            yourRecord,
            beltUnclaimed: !season.beltHolderId,
            poolCount,
            justEnded,
            lastSeasonRecord,
        });
    } catch (err) {
        return handleError(res, err);
    }
}

// ── POST /pvp/acknowledge-season ─────────────────────────────────────────────
async function acknowledgeSeason(req, res) {
    try {
        const { seasonId } = req.body || {};
        if (!seasonId || !mongoose.isValidObjectId(seasonId)) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }
        const result = await pvpRecordService.acknowledgeSeason(req.user.fighterId, seasonId);
        return res.json(result);
    } catch (err) {
        return handleError(res, err);
    }
}

module.exports = {
    getLadder,
    getRecord,
    getOpponents,
    postFight,
    getFights,
    getDefenseResults,
    setDefenseGameplan,
    getHof,
    getCurrentSeason,
    acknowledgeSeason,
};
