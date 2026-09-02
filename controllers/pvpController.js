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
const analyticsService = require("../services/analyticsService");
const { WEIGHT_CLASSES_PVP, SEASON_WEIGHT_CLASSES, OPEN_WEIGHT_CLASS, DIVISION_KEYS } = require("../consts/pvpConfig");

// Accepted weightClass query values for the full ladder screen: FW|LW|MW|HW or "All".
const LADDER_WC_PARAMS = ["FW", "LW", "MW", "HW", "All"];

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
    // Twist + weight-class copy comes from pvpSeasonService — one producer, so this
    // block and the public landing hero can never word the same twist differently.
    const { twistName, twistEffect } = pvpSeasonService.twistCopyFor(season.twist);
    const crossWeightClass = !!(season.config && season.config.crossWeightClass);
    return {
        id: String(season._id),
        seasonNumber: season.seasonNumber,
        name: season.name,
        twist: season.twist,
        twistName,
        twistEffect,
        weightClass: season.weightClass,
        crossWeightClass,
        weightClassLabel: pvpSeasonService.publicWeightClassLabel(season),
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

// ── GET /pvp/ladder ─────────────────────────────────────────────────────────
// Query-param, division-filtered, paginated full ladder. Actor = req.user.fighterId.
async function getLadder(req, res) {
    try {
        const seasonId = req.query.seasonId;
        if (!seasonId || !mongoose.isValidObjectId(seasonId)) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }
        const season = await Season.findById(seasonId);
        if (!season) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }

        // division — optional enum.
        let division = null;
        if (req.query.division != null && req.query.division !== "") {
            if (!DIVISION_KEYS.includes(req.query.division)) {
                return res.status(400).json({ message: "Invalid division.", code: "bad_division" });
            }
            division = req.query.division;
        }

        // weightClass — optional FW|LW|MW|HW or All (default All).
        let wcParam = "All";
        if (req.query.weightClass != null && req.query.weightClass !== "") {
            if (!LADDER_WC_PARAMS.includes(req.query.weightClass)) {
                return res.status(400).json({ message: "Invalid weight class.", code: "bad_weight_class" });
            }
            wcParam = req.query.weightClass;
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = clampLimit(req.query.limit, 20, 20);

        const { rows, total, divisionCounts } = await pvpRecordService.getLadderPage({
            seasonId: season._id,
            season,
            division,
            wcParam,
            page,
            limit,
            viewerId: req.user.fighterId,
        });

        const totalPages = Math.max(1, Math.ceil(total / limit));
        return res.json({
            season: shapeSeasonBlock(season, await beltHolderName(season)),
            divisionCounts,
            rows,
            page,
            limit,
            total,
            totalPages,
            hasMore: page < totalPages,
        });
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/ladder/position ────────────────────────────────────────────────
// The viewer's OWN standing (regardless of any filter). { position: null } if none.
async function getLadderPosition(req, res) {
    try {
        const seasonId = req.query.seasonId;
        if (!seasonId || !mongoose.isValidObjectId(seasonId)) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }
        const season = await Season.findById(seasonId);
        if (!season) {
            return res.status(404).json({ message: "Season not found.", code: "season_not_found" });
        }
        const result = await pvpRecordService.getPositionForViewer(req.user.fighterId, season);
        return res.json(result);
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/challenge-eligibility/:playerId ────────────────────────────────
async function getChallengeEligibility(req, res) {
    try {
        const { playerId } = req.params;
        if (!mongoose.isValidObjectId(playerId)) {
            return res.status(404).json({ message: "Fighter not found.", code: "fighter_not_found" });
        }
        const viewer = await Fighter.findById(req.user.fighterId)
            .select("overallRating weightClass").lean();
        if (!viewer) {
            return res.status(404).json({ message: "Fighter not found.", code: "fighter_not_found" });
        }
        const result = await pvpRecordService.getChallengeEligibility(viewer, playerId);
        return res.json(result);
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

        // Unlock gate — a locked fighter must not reach matchmaking OR have a record
        // created for them (creating a record would otherwise slip them past the gate).
        try {
            const changed = await pvpRecordService.ensureUnlocked(fighter);
            if (changed) await fighter.save();
        } catch (e) {
            console.error("[pvpController] ensureUnlocked failed:", e.message);
        }
        if (!fighter.pvpOnboarding || !fighter.pvpOnboarding.unlocked) {
            return res.status(403).json({ message: "The Proving Ground unlocks at 3 career wins.", code: "pvp_locked" });
        }

        const season = await pvpSeasonService.getCurrentSeasonForFighter(fighter.weightClass);
        if (!season || season.status !== "active") {
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

        // Fire-and-forget analytics — fires on EVERY pvp fight. Dedup to "first"
        // happens at query time in the retention aggregation, not here.
        analyticsService.track(
            req.user.id,
            "pvp_first_fight",
            { pvpFightId: result?.fightId ?? null },
            { fighterId: req.user.fighterId }
        );

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
            // Accept any SEASON weight class, including the "Open" sentinel (the frontend
            // HoF tab passes season.weightClass, which is "Open" during an Open season).
            if (!SEASON_WEIGHT_CLASSES.includes(weightClass)) {
                return res.status(400).json({ message: "Invalid weight class.", code: "bad_weight_class" });
            }
            // Open-season HoF entries (weightClass:"Open") surface for EVERY viewer regardless
            // of their filter, so a per-WC filter always sees the Open belt entry too. When the
            // filter already IS "Open", just match Open (dedupe).
            const classes = weightClass === OPEN_WEIGHT_CLASS
                ? [OPEN_WEIGHT_CLASS]
                : [weightClass, OPEN_WEIGHT_CLASS];
            filter.weightClass = { $in: classes };
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
        const season = await pvpSeasonService.getCurrentSeasonForFighter(weightClass);
        if (!season) {
            return res.json({ season: null, yourRecord: null, beltUnclaimed: true, poolCount: 0 });
        }

        let yourRecord = null;
        let poolCount = 0;
        // HYDRATED (not lean) — ensureUnlocked may mutate pvpOnboarding and we save it.
        const fighter = await Fighter.findById(req.user.fighterId)
            .select("firstName lastName nickname weightClass overallRating record pvpOnboarding pvpDefenseGameplan");

        // Self-heal the unlock flag; persist only if it actually changed.
        if (fighter) {
            try {
                const changed = await pvpRecordService.ensureUnlocked(fighter);
                if (changed) await fighter.save();
            } catch (e) {
                console.error("[pvpController] ensureUnlocked failed:", e.message);
            }
        }

        // The resolved season governs eligibility: in an Open season every fighter belongs
        // regardless of real class, so only gate the per-WC case on the route param matching
        // the actor's real class.
        const eligible = fighter && (
            pvpSeasonService.isCrossWeightClass(season) || fighter.weightClass === weightClass
        );

        let myRecordDoc = null;
        if (eligible) {
            const record = await PVPRecord.findOne({ playerId: req.user.fighterId, seasonId: season._id });
            if (record) {
                myRecordDoc = record;
                const rank = await pvpRecordService.computeRank(record);
                const beltId = await pvpRecordService.currentBeltHolderId(season._id, season.weightClass);
                yourRecord = pvpRecordService.shapeRecord(record, fighter, {
                    season,
                    rank,
                    isBeltHolder: beltId != null && String(req.user.fighterId) === beltId,
                    name: pvpRecordService.fighterName(fighter),
                });
                poolCount = await PVPRecord.countDocuments({
                    seasonId: season._id,
                    weightClass: season.weightClass,
                    division: record.division,
                });
            }
        }

        // "Your last season just ended" signal — drives SeasonEndModal/NewSeasonModal.
        const { justEnded, lastSeasonRecord } = await pvpRecordService.getJustEndedBlock(
            req.user.fighterId,
            weightClass
        );

        // ── PVP New Player Experience onboarding block (additive). ───────────
        const ob = (fighter && fighter.pvpOnboarding) || {};
        const nowMs = Date.now();
        const unlocked = !!ob.unlocked;
        const placementActive = unlocked && !ob.placementComplete;
        const shieldActive = !!(ob.shieldExpiresAt && nowMs < new Date(ob.shieldExpiresAt).getTime());
        const cuActive = !!(
            myRecordDoc &&
            myRecordDoc.catchUpExpiresAt &&
            nowMs < new Date(myRecordDoc.catchUpExpiresAt).getTime() &&
            myRecordDoc.division !== "elite" &&
            myRecordDoc.division !== "champion"
        );
        const onboarding = {
            locked: !unlocked,
            careerWins: (fighter && fighter.record && fighter.record.wins) || 0,
            winsNeeded: 3,
            placement: placementActive
                ? { active: true, fights: ob.placementFights || 0, wins: ob.placementWins || 0, needed: 3 }
                : null,
            shield: shieldActive
                ? { active: true, expiresAt: ob.shieldExpiresAt }
                : null,
            catchUp: cuActive
                ? { active: true, expiresAt: myRecordDoc.catchUpExpiresAt }
                : null,
        };

        return res.json({
            season: shapeSeasonBlock(season, await beltHolderName(season)),
            yourRecord,
            beltUnclaimed: !season.beltHolderId,
            poolCount,
            justEnded,
            lastSeasonRecord,
            onboarding,
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

// ── GET /pvp/fights/by-id/:fightId/breakdown ─────────────────────────────────
// Fight Description System — viewer-relative round-by-round breakdown. Viewer must
// be attacker or defender (service returns null otherwise → 404, no existence leak).
async function getPvpFightBreakdown(req, res) {
    try {
        const { fightId } = req.params;
        if (!mongoose.isValidObjectId(fightId)) {
            return res.status(404).json({ message: "Fight not found.", code: "fight_not_found" });
        }
        const breakdown = await pvpFightService.getFightBreakdown(fightId, req.user.fighterId);
        if (!breakdown) {
            return res.status(404).json({ message: "Fight not found.", code: "fight_not_found" });
        }
        return res.json(breakdown);
    } catch (err) {
        return handleError(res, err);
    }
}

// ── GET /pvp/season/public ───────────────────────────────────────────────────
// PUBLIC (unauthenticated) — powers the marketing landing "Live Now / countdown"
// band. No req.user (route bypasses authMiddleware). Cheap + safe to poll.

// Dedicated shaper — must NOT reuse shapeSeasonBlock (it leaks twist/belt/id fields).
// Strict allow-list: returns EXACTLY these 9 fields, nothing else. Any new field is an
// explicit decision, never a spread.
//
// twistEffect + weightClassLabel are player-facing STRINGS and are produced by
// pvpSeasonService (twistCopyFor / publicWeightClassLabel) — the controller derives
// no copy of its own, so the landing hero and the in-game season block always agree.
//
// The response adds one key on top of these: `next`, which is either null or an
// object shaped by THIS SAME function. Reusing the shaper is deliberate — it is
// what guarantees the teaser season can never leak a field the current one won't.
// `next` is attached at the call site, never inside this shaper.
function shapePublicSeason(season) {
    return {
        status: season.status,
        seasonNumber: season.seasonNumber,
        name: season.name,
        startDate: new Date(season.startDate).toISOString(),
        endDate: new Date(season.endDate).toISOString(),
        crossWeightClass: !!(season.config && season.config.crossWeightClass),
        weightClass: season.weightClass,
        twistEffect: pvpSeasonService.twistCopyFor(season.twist).twistEffect,
        weightClassLabel: pvpSeasonService.publicWeightClassLabel(season),
    };
}

/**
 * Resolve the (purely cosmetic) next-season teaser. ISOLATED on purpose: this endpoint
 * is public, unauthenticated and polled every 5-30s by every landing visitor, so a
 * transient failure in an optional second lookup must never discard an already-
 * successful primary season fetch. Any failure degrades to `next: null` and is logged
 * server-side (never surfaced to the client).
 */
async function resolveNextTease(season) {
    try {
        // The live season is forwarded as the tease anchor — its endDate IS when the
        // next one opens. Forwarding only: the derivation lives in pvpSeasonService.
        const next = await pvpSeasonService.getNextSeason(season);
        if (!next) return null;
        // Never tease the season we are already showing: same doc, or the same logical
        // season number (a collapsed per-WC cycle / derived tease has a different id).
        const isSameSeason =
            String(next._id) === String(season._id) || next.seasonNumber === season.seasonNumber;
        return isSameSeason ? null : shapePublicSeason(next);
    } catch (err) {
        console.error("[pvpController] getPublicSeason next-season teaser failed (degraded to null)", err);
        return null;
    }
}

async function getPublicSeason(req, res) {
    try {
        const season = await pvpSeasonService.getPublicSeason();
        res.set("Cache-Control", "public, max-age=10");
        if (!season) return res.json(null);

        // Tease the season after this one, so the landing can run a countdown to
        // the next season while the current one is still live.
        const next = await resolveNextTease(season);

        return res.json({
            ...shapePublicSeason(season),
            next,
        });
    } catch (err) {
        console.error("[pvpController] getPublicSeason", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    getLadder,
    getLadderPosition,
    getChallengeEligibility,
    getRecord,
    getOpponents,
    postFight,
    getFights,
    getDefenseResults,
    setDefenseGameplan,
    getHof,
    getCurrentSeason,
    acknowledgeSeason,
    getPvpFightBreakdown,
    getPublicSeason,
};
