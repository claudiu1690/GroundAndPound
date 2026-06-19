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
const PVPRival = require("../models/pvpRivalModel");
const activityLogService = require("./activityLogService");
const {
    DIVISIONS,
    DIVISION_KEYS,
    REWARDS,
    SOFT_RESET,
    FIRST_SEASON_BONUS,
    PVP_UNLOCK_WINS,
    CATCHUP_DAYS,
    CATCHUP_JOIN_OFFSET_DAYS,
    WEIGHT_CLASSES_PVP,
    MATCH_OVR_STEPS,
    divisionForDp,
    divisionMeta,
    divisionFloor,
    nextDivision,
    badgeIdFor,
} = require("../consts/pvpConfig");
const { resolvePvpBadge } = require("../consts/pvpBadges");

const DAY_MS = 24 * 3600 * 1000;

function fighterName(fighter) {
    if (!fighter) return "Unknown";
    const nick = fighter.nickname ? ` "${fighter.nickname}"` : "";
    return `${fighter.firstName || ""}${nick} ${fighter.lastName || ""}`.trim();
}

/**
 * Self-heal the `pvpOnboarding.unlocked` flag on a (hydrated) fighter doc. Mutation
 * only — caller saves. Unlock when ANY of:
 *   - already unlocked (no-op),
 *   - the fighter has >= PVP_UNLOCK_WINS career wins,
 *   - the fighter already has at least one PVPRecord (legacy / pre-feature participant).
 * When healing because an existing PVPRecord exists, the fighter is a legacy participant
 * who never went through placement → also mark placementComplete so they aren't trapped
 * in a placement state that never resolves.
 *
 * @param {import("mongoose").Document} fighter HYDRATED fighter doc (not lean)
 * @returns {Promise<boolean>} whether anything changed (so the caller saves once)
 */
async function ensureUnlocked(fighter) {
    if (!fighter) return false;
    if (!fighter.pvpOnboarding) fighter.pvpOnboarding = {};
    const ob = fighter.pvpOnboarding;
    if (ob.unlocked) return false;

    // Unlock ONLY on the career-win gate. We must NOT treat "has a PVPRecord" as proof
    // of eligibility: record creation is itself gated on being unlocked, so a record can
    // only exist for an already-unlocked fighter. Auto-unlocking on record existence is
    // circular and lets any ungated record-creation path escalate a 0-win fighter past
    // the gate (and skip placement). The gate applies in Season 1 too, so there is no
    // legitimate <3-win record holder to back-fill.
    const careerWins = (fighter.record && fighter.record.wins) || 0;
    if (careerWins < PVP_UNLOCK_WINS) return false;

    ob.unlocked = true;
    fighter.markModified("pvpOnboarding");
    return true;
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

    // First-ever PVPRecord for this fighter? (Drives placement-start + first-season-bonus
    // semantics.) Computed BEFORE create so the just-created record is not counted.
    const isFirstEver = (await PVPRecord.countDocuments({ playerId: fighterId })) === 0;

    // Catch-up window: only for late joiners in a NON-Season-1 season (Season 1 is the
    // open launch season — everyone starts together, no catch-up). A joiner that registers
    // more than CATCHUP_JOIN_OFFSET_DAYS after season start earns a CATCHUP_DAYS window.
    const now = Date.now();
    let catchUpExpiresAt = null;
    if (
        season.seasonNumber !== 1 &&
        season.startDate &&
        now > season.startDate.getTime() + CATCHUP_JOIN_OFFSET_DAYS * DAY_MS
    ) {
        catchUpExpiresAt = new Date(now + CATCHUP_DAYS * DAY_MS);
    }

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
            catchUpExpiresAt,
        });
    } catch (err) {
        if (err && err.code === 11000) {
            // Raced with another request — load the winner WITHOUT re-running the
            // first-ever onboarding block (the winning create already handled it).
            return PVPRecord.findOne({ playerId: fighterId, seasonId: season._id });
        }
        throw err;
    }

    // First-ever record → onboarding bookkeeping on the FULL fighter doc (the passed `f`
    // may be lean / select-limited, so re-fetch hydrated).
    if (isFirstEver) {
        try {
            const fighterDoc = await Fighter.findById(fighterId);
            if (fighterDoc) {
                if (!fighterDoc.pvpOnboarding) fighterDoc.pvpOnboarding = {};
                if (season.seasonNumber === 1) {
                    // Season-1 skip: no placement, no shield, no feed. They enter directly.
                    fighterDoc.pvpOnboarding.placementComplete = true;
                } else {
                    // Standard onboarding — placement begins.
                    fighterDoc.pvpOnboarding.placementComplete = false;
                    try {
                        activityLogService.log(
                            fighterId,
                            "pvp_placement_start",
                            "Placement matches begin — 3 fights to set your division",
                            { seasonId: String(season._id), weightClass: season.weightClass }
                        );
                    } catch (_) { /* feed failures never block record creation */ }
                }
                fighterDoc.markModified("pvpOnboarding");
                await fighterDoc.save();
            }
        } catch (err) {
            console.error(`[PVP record] first-ever onboarding write failed for ${fighterId}:`, err.message);
        }
    }

    return record;
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
                // PVP New Player Experience — first-season welcome bonus signal. Only
                // present (and only true) when this ended record paid the bonus.
                firstSeasonBonusPaid: !!record.firstSeasonBonusPaid,
                ...(record.firstSeasonBonusPaid
                    ? { firstSeasonBonus: { iron: FIRST_SEASON_BONUS.iron, fame: FIRST_SEASON_BONUS.fame } }
                    : {}),
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

// ── Full Ladder Screen ──────────────────────────────────────────────────────

// Map the FW|LW|MW|HW query param to the stored (capitalized) real weight class.
const WC_PARAM_MAP = {
    FW: "Featherweight",
    LW: "Lightweight",
    MW: "Middleweight",
    HW: "Heavyweight",
};
const WC_PARAM_KEYS = Object.keys(WC_PARAM_MAP); // FW|LW|MW|HW
const ZERO_DIVISION_COUNTS = () =>
    DIVISION_KEYS.reduce((acc, k) => { acc[k] = 0; return acc; }, {});

/**
 * THE single source of truth for the cross-weight-class realWeightClass filter clause.
 * Used by BOTH the row query and the division-counts aggregation so they can never
 * diverge.
 *
 * Returns a real-WC clause ONLY when the season is cross-weight-class (Open) AND the
 * caller passed a specific class (not "All"). In a per-WC season the pool is already a
 * single weight class, so the wcParam is ignored entirely and `{}` is returned.
 *
 * @param {object} season  resolved Season doc/lean
 * @param {string|null} wcParam  validated FW|LW|MW|HW or "All"/null
 * @returns {object} {} or { realWeightClass: <Capitalized> }
 */
function wcMatchClause(season, wcParam) {
    const crossWc = !!(season && season.config && season.config.crossWeightClass);
    if (!crossWc) return {};
    if (!wcParam || wcParam === "All") return {};
    const real = WC_PARAM_MAP[wcParam];
    return real ? { realWeightClass: real } : {};
}

/**
 * Build one paginated, division-filtered, WC-filtered ladder page plus the zero-filled
 * division counts. Owns the filtered find+sort+skip+limit, the counts aggregation, the
 * single Fighter join, and every per-row flag (viewer, belt, rival, protected).
 *
 * @param {object} args
 * @param {import("mongoose").Types.ObjectId} args.seasonId
 * @param {object} args.season           resolved Season doc/lean
 * @param {string|null} args.division    validated division key or null (all)
 * @param {string|null} args.wcParam     validated FW|LW|MW|HW or "All"/null
 * @param {number} args.page             >=1
 * @param {number} args.limit            1..20
 * @param {string} args.viewerId         actor fighterId (from token)
 * @returns {Promise<{rows:Array, total:number, divisionCounts:object}>}
 */
async function getLadderPage({ seasonId, season, division, wcParam, page, limit, viewerId }) {
    const wcClause = wcMatchClause(season, wcParam);
    const baseFilter = { seasonId, weightClass: season.weightClass, ...wcClause };

    // Row filter additionally narrows by the division tab (counts do NOT — see below).
    const rowFilter = division ? { ...baseFilter, division } : baseFilter;

    const [total, records, countAgg] = await Promise.all([
        PVPRecord.countDocuments(rowFilter),
        PVPRecord.find(rowFilter)
            .sort({ dp: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        // Division counts are ALWAYS across all 5 divisions (independent of the division
        // filter) — same season+WC pool the rows are drawn from.
        PVPRecord.aggregate([
            { $match: { seasonId, weightClass: season.weightClass, ...wcClause } },
            { $group: { _id: "$division", count: { $sum: 1 } } },
        ]),
    ]);

    const divisionCounts = ZERO_DIVISION_COUNTS();
    for (const g of countAgg) {
        if (Object.prototype.hasOwnProperty.call(divisionCounts, g._id)) {
            divisionCounts[g._id] = g.count;
        }
    }

    if (records.length === 0) {
        return { rows: [], total, divisionCounts };
    }

    const ids = records.map((r) => r.playerId);
    const me = String(viewerId);
    const now = Date.now();

    // Single Fighter join (name / style / authoritative real class / shield).
    const fighters = await Fighter.find({ _id: { $in: ids } })
        .select("firstName lastName nickname style weightClass pvpOnboarding")
        .lean();
    const fighterMap = new Map(fighters.map((f) => [String(f._id), f]));

    // Belt holder for this season pool (champion #1 with >=1 fight).
    const beltId = await currentBeltHolderId(seasonId, season.weightClass);

    // Active rivals linking the viewer to anyone in this season → Set of "the other id".
    const rivals = await PVPRival.find({
        seasonId,
        status: "active",
        $or: [{ player1Id: viewerId }, { player2Id: viewerId }],
    }).select("player1Id player2Id").lean();
    const rivalSet = new Set();
    for (const r of rivals) {
        const a = String(r.player1Id);
        const b = String(r.player2Id);
        rivalSet.add(a === me ? b : a);
    }

    const rows = records.map((r, i) => {
        const pid = String(r.playerId);
        const f = fighterMap.get(pid) || {};
        const meta = divisionMeta(r.division) || DIVISIONS[0];
        const shieldExp = f.pvpOnboarding && f.pvpOnboarding.shieldExpiresAt;
        const isProtected = !!(shieldExp && new Date(shieldExp).getTime() > now);
        return {
            rank: (page - 1) * limit + i + 1,
            playerId: pid,
            name: fighterName(f),
            division: r.division,
            divisionColor: meta.color,
            dp: r.dp,
            wins: r.wins,
            losses: r.losses,
            winStreak: r.winStreak,
            ovr: r.overallRating,
            fightingStyle: f.style || null,
            // Authoritative real class from the fighter doc (record value is a fallback).
            realWeightClass: f.weightClass || r.realWeightClass || null,
            // Prefer last PVP fight (decay-relevant); fall back to last record activity
            // so a never-fought record shows its join time, not a blank "—".
            lastActiveAt: r.lastFightAt || r.lastActiveAt || null,
            isViewer: pid === me,
            isBeltHolder: beltId != null && pid === beltId,
            isRivalWithViewer: rivalSet.has(pid),
            isProtected,
        };
    });

    return { rows, total, divisionCounts };
}

/**
 * The viewer's OWN standing block (regardless of any ladder filter). Returns
 * { position: null } when the viewer has no record in this season.
 *
 * @param {string} viewerId
 * @param {object} season  resolved Season doc/lean
 * @returns {Promise<{position: object|null}>}
 */
async function getPositionForViewer(viewerId, season) {
    const record = await PVPRecord.findOne({ playerId: viewerId, seasonId: season._id }).lean();
    if (!record) return { position: null };

    const fighter = await Fighter.findById(viewerId)
        .select("firstName lastName nickname style weightClass overallRating pvpOnboarding")
        .lean();

    const meta = divisionMeta(record.division) || DIVISIONS[0];
    const now = Date.now();

    // Rank + total scoped to the viewer's OWN division within the season pool.
    const divFilter = {
        seasonId: season._id,
        weightClass: season.weightClass,
        division: record.division,
    };
    // Overall rank spans ALL divisions in the season+weight-class pool (no division
    // filter) — this is the headline "where do I stand in the whole ladder" number.
    const seasonFilter = { seasonId: season._id, weightClass: season.weightClass };
    const [higher, totalInDivision, overallHigher] = await Promise.all([
        PVPRecord.countDocuments({ ...divFilter, dp: { $gt: record.dp } }),
        PVPRecord.countDocuments(divFilter),
        PVPRecord.countDocuments({ ...seasonFilter, dp: { $gt: record.dp } }),
    ]);
    const rank = higher + 1;
    const overallRank = overallHigher + 1;

    const nextDiv = nextDivision(record.division); // null at champion
    const threshold = meta.promoteAt; // null at champion
    const dpToPromotion = threshold != null ? Math.max(0, threshold - record.dp) : null;

    const shieldExp = fighter && fighter.pvpOnboarding && fighter.pvpOnboarding.shieldExpiresAt;
    const shieldActive = !!(shieldExp && new Date(shieldExp).getTime() > now);

    // Catch-up re-applies the Elite/Champion cap (no catch-up at/above elite).
    const catchUpActive = !!(
        record.catchUpExpiresAt &&
        new Date(record.catchUpExpiresAt).getTime() > now &&
        record.division !== "elite" &&
        record.division !== "champion"
    );

    // Champion-only extras.
    let championRank = null;
    let totalChampions = null;
    let weeksRemaining = null;
    if (record.division === "champion") {
        championRank = rank;
        totalChampions = totalInDivision;
        if (season.endDate) {
            const ms = new Date(season.endDate).getTime() - now;
            weeksRemaining = Math.max(0, Math.ceil(ms / (7 * DAY_MS)));
        }
    }

    return {
        position: {
            playerId: String(record.playerId),
            name: fighterName(fighter),
            division: record.division,
            divisionColor: meta.color,
            realWeightClass: (fighter && fighter.weightClass) || record.realWeightClass || null,
            ovr: (fighter && fighter.overallRating) || record.overallRating || 0,
            dp: record.dp,
            peakDp: record.peakDp,
            wins: record.wins,
            losses: record.losses,
            winStreak: record.winStreak,
            streakActive: record.winStreak >= 3,
            rank,
            overallRank,
            totalInDivision,
            nextDivision: nextDiv,
            nextDivisionThreshold: threshold,
            divisionFloor: meta.floor,
            dpToPromotion,
            shieldActive,
            shieldExpiresAt: shieldActive ? shieldExp : null,
            // Counter dropped — kept for FE compat, always 0.
            shieldFightsRemaining: 0,
            catchUpActive,
            catchUpExpiresAt: catchUpActive ? record.catchUpExpiresAt : null,
            championRank,
            totalChampions,
            weeksRemaining,
        },
    };
}

/**
 * Challenge-button gate (no fight side effects). Returns the decision-tree result.
 * @param {object} viewerFighter  HYDRATED or lean fighter doc for the actor
 * @param {string} targetId       candidate playerId from the route
 * @returns {Promise<{eligible:boolean, reason:string|null, seasonId:string|null, weightClass:string|null}>}
 */
async function getChallengeEligibility(viewerFighter, targetId) {
    const pvpSeasonService = require("./pvpSeasonService");
    const viewerId = String(viewerFighter._id);

    // 1. Self.
    if (viewerId === String(targetId)) {
        return { eligible: false, reason: "self", seasonId: null, weightClass: null };
    }

    // 2. Viewer's active season.
    const season = await pvpSeasonService.getCurrentSeasonForFighter(viewerFighter.weightClass);
    if (!season || season.status !== "active") {
        return { eligible: false, reason: "season_not_active", seasonId: null, weightClass: null };
    }
    const seasonId = String(season._id);
    const weightClass = season.weightClass;

    // 3. Target must share that season pool.
    const targetRecord = await PVPRecord.findOne({ playerId: targetId, seasonId: season._id }).lean();
    if (!targetRecord) {
        return { eligible: false, reason: "not_same_season", seasonId, weightClass };
    }

    // 4. Target protected by an active shield.
    const targetFighter = await Fighter.findById(targetId)
        .select("overallRating pvpOnboarding").lean();
    if (!targetFighter) {
        // Target id had a record but no fighter doc — treat as not found.
        const err = new Error("fighter_not_found");
        err.isPvp = true;
        err.status = 404;
        err.code = "fighter_not_found";
        throw err;
    }
    const shieldExp = targetFighter.pvpOnboarding && targetFighter.pvpOnboarding.shieldExpiresAt;
    if (shieldExp && new Date(shieldExp).getTime() > Date.now()) {
        return { eligible: false, reason: "protected", seasonId, weightClass };
    }

    // 5. OVR range.
    const viewerOvr = viewerFighter.overallRating || 0;
    const targetOvr = targetFighter.overallRating || 0;
    const maxStep = MATCH_OVR_STEPS[MATCH_OVR_STEPS.length - 1];
    if (Math.abs(viewerOvr - targetOvr) > maxStep) {
        return { eligible: false, reason: "out_of_range", seasonId, weightClass };
    }

    return { eligible: true, reason: null, seasonId, weightClass };
}

module.exports = {
    ensureUnlocked,
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
    // Full Ladder Screen
    wcMatchClause,
    getLadderPage,
    getPositionForViewer,
    getChallengeEligibility,
    WC_PARAM_KEYS,
    WC_PARAM_MAP,
};
