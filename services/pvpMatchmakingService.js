/**
 * Ground & Pound — PVP matchmaking.
 *
 * Surfaces up to MATCHMAKE_COUNT candidate opponents in the actor's season + weight
 * class, ranked by DP closeness, within an expanding OVR window. No AI fill — returns
 * however many real opponents exist.
 */

const PVPRecord = require("../models/pvpRecordModel");
const Fighter = require("../models/fighterModel");
const PVPRival = require("../models/pvpRivalModel");
const {
    DIVISIONS,
    divisionMeta,
    bracketTier,
    MATCHMAKE_COUNT,
    MATCH_OVR_STEPS,
} = require("../consts/pvpConfig");
const { fighterName } = require("./pvpRecordService");
const { isFightBlocked } = require("../utils/injuryUtils");

/**
 * @param {object} fighter actor Fighter doc (needs _id, overallRating)
 * @param {object} season  active Season doc
 * @param {object} myRecord the actor's PVPRecord (for dp closeness + OVR)
 * @returns {Array<object>} candidate DTOs (0..5)
 */
async function getOpponents(fighter, season, myRecord) {
    const myOvr = fighter.overallRating || 0;
    const myDp = myRecord ? myRecord.dp : 0;

    // Expand the OVR window until we have >= MATCHMAKE_COUNT (pre-rank) or steps exhausted.
    let candidates = [];
    const seen = new Set();
    for (const step of MATCH_OVR_STEPS) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await PVPRecord.find({
            seasonId: season._id,
            weightClass: season.weightClass,
            playerId: { $ne: fighter._id },
            overallRating: { $gte: myOvr - step, $lte: myOvr + step },
        }).limit(50).lean();
        for (const c of batch) {
            const key = String(c.playerId);
            if (!seen.has(key)) {
                seen.add(key);
                candidates.push(c);
            }
        }
        if (candidates.length >= MATCHMAKE_COUNT) break;
    }

    // Sort by DP closeness, take the best MATCHMAKE_COUNT.
    candidates.sort((a, b) => Math.abs(a.dp - myDp) - Math.abs(b.dp - myDp));
    candidates = candidates.slice(0, MATCHMAKE_COUNT);
    if (candidates.length === 0) return [];

    // Resolve names.
    const ids = candidates.map((c) => c.playerId);
    const fighters = await Fighter.find({ _id: { $in: ids } })
        .select("firstName lastName nickname overallRating weightClass style pvpOnboarding injuries health")
        .lean();
    const fighterMap = new Map(fighters.map((f) => [String(f._id), f]));

    // HIDE mid-placement defenders — they are protected and must not appear in the pool.
    candidates = candidates.filter((c) => {
        const f = fighterMap.get(String(c.playerId));
        const ob = f && f.pvpOnboarding;
        return !(ob && ob.unlocked && !ob.placementComplete);
    });
    if (candidates.length === 0) return [];

    // Belt holder this season = #1 in champion division with >=1 fight.
    const beltTop = await PVPRecord.findOne({
        seasonId: season._id,
        weightClass: season.weightClass,
        division: "champion",
        $expr: { $gt: [{ $add: ["$wins", "$losses"] }, 0] },
    }).sort({ dp: -1 }).select("playerId").lean();
    const beltHolderId = beltTop ? String(beltTop.playerId) : null;

    // Active rivalries involving the actor.
    const rivals = await PVPRival.find({
        seasonId: season._id,
        status: "active",
        $or: [{ player1Id: fighter._id }, { player2Id: fighter._id }],
    }).select("player1Id player2Id").lean();
    const rivalSet = new Set();
    for (const r of rivals) {
        rivalSet.add(String(r.player1Id));
        rivalSet.add(String(r.player2Id));
    }

    return candidates.map((c) => {
        const f = fighterMap.get(String(c.playerId));
        const meta = divisionMeta(c.division) || DIVISIONS[0];
        const cOvr = c.overallRating || (f ? f.overallRating : 0) || 0;
        let difficulty = "even";
        if (cOvr > myOvr + 3) difficulty = "hard";
        else if (cOvr < myOvr - 3) difficulty = "easy";
        return {
            playerId: String(c.playerId),
            name: fighterName(f),
            division: c.division,
            divisionColor: meta.color,
            dp: c.dp,
            overallRating: cOvr,
            realWeightClass: f ? f.weightClass : (c.realWeightClass || null),
            fightingStyle: f ? f.style : null,
            difficulty,
            bracketBonus: bracketTier(myOvr, cOvr),
            isBeltHolder: beltHolderId != null && String(c.playerId) === beltHolderId,
            isRival: rivalSet.has(String(c.playerId)),
            // Shielded (New Competitor Shield active) — surfaced for display; the fight
            // endpoint also rejects challenges against shielded defenders.
            isProtected: !!(
                f && f.pvpOnboarding && f.pvpOnboarding.shieldExpiresAt &&
                new Date() < new Date(f.pvpOnboarding.shieldExpiresAt)
            ),
            // Fight-blocking injury (needs a doctor visit). Shown with a pill + disabled,
            // NOT excluded from the pool (same UX as Protected).
            isRecovering: !!isFightBlocked(f || {}),
            lastActiveAt: c.lastActiveAt,
            wins: c.wins,
            losses: c.losses,
            defenseGameplan: c.defenseGameplan,
        };
    });
}

module.exports = { getOpponents };
