/**
 * Ranking System v1.0 — controllers for the Rankings tab and player rank queries.
 */
const Opponent = require("../models/opponentModel");
const Fighter = require("../models/fighterModel");
const { ROSTER_SIZE, displayRankForNpc, toDisplayRank } = require("../services/rankingService");

const PUBLIC_OPPONENT_FIELDS = "name nickname style overallRating record fixedRank isChampion weightClass promotionTier";

/**
 * GET /rankings/:tier?weightClass=...&fighterId=...
 *
 * Returns the full NPC roster for (tier, weightClass) sorted by rank, plus the player's
 * row appended at the end if their fighter is in the same tier/wc (with isPlayer flag).
 *
 * Unranked player → row appears with rank: null, isUnranked: true.
 * Ranked player   → row appears with their current rank, isUnranked: false.
 */
async function getRankings(req, res) {
    try {
        const { tier } = req.params;
        const { weightClass, fighterId } = req.query;

        if (!ROSTER_SIZE[tier]) {
            return res.status(400).json({ message: `Unknown tier: ${tier}` });
        }
        if (!weightClass) {
            return res.status(400).json({ message: "weightClass query param is required" });
        }

        // NPCs in the requested roster, sorted by fixedRank ascending (1 = champion first).
        const npcs = await Opponent.find({
            promotionTier: tier,
            weightClass,
            fixedRank: { $ne: null },
        })
            .select(PUBLIC_OPPONENT_FIELDS)
            .sort({ fixedRank: 1 })
            .lean();

        // Fetch player first so we know if they're in this (tier, wc) — needed to compute
        // displaced NPC ranks (player inserts → NPCs at/below shift down by 1).
        let playerRow = null;
        let playerRankInTier = null;
        if (fighterId) {
            const fighter = await Fighter.findById(fighterId).select(
                "firstName lastName nickname promotionTier weightClass style overallRating record ranking"
            ).lean();
            if (fighter && fighter.promotionTier === tier && fighter.weightClass === weightClass) {
                const r = fighter.ranking || {};
                playerRankInTier = r.rank ?? null;
                playerRow = {
                    id: String(fighter._id),
                    rank: toDisplayRank(r.rank ?? null),
                    name: `${fighter.firstName} ${fighter.lastName}`.trim(),
                    nickname: fighter.nickname || null,
                    ovr: fighter.overallRating,
                    style: fighter.style,
                    record: fighter.record
                        ? `${fighter.record.wins ?? 0}-${fighter.record.losses ?? 0}${(fighter.record.draws ?? 0) > 0 ? `-${fighter.record.draws}` : ""}`
                        : "0-0",
                    isChampion: false,
                    isPlayer: true,
                    isUnranked: r.rank == null,
                };
            }
        }

        const roster = npcs.map((npc) => ({
            id: String(npc._id),
            rank: toDisplayRank(displayRankForNpc(npc.fixedRank, playerRankInTier)),
            fixedRank: npc.fixedRank,
            name: npc.name,
            nickname: npc.nickname || null,
            ovr: npc.overallRating,
            style: npc.style,
            record: npc.record
                ? `${npc.record.wins ?? 0}-${npc.record.losses ?? 0}${(npc.record.draws ?? 0) > 0 ? `-${npc.record.draws}` : ""}`
                : "0-0",
            isChampion: !!npc.isChampion,
            isPlayer: false,
        }));

        res.json({
            tier,
            weightClass,
            rosterSize: ROSTER_SIZE[tier] + 1,
            roster,
            player: playerRow,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * GET /fighters/:id/rank
 *
 * Returns the player's ranking subdoc plus their tier context — used by the
 * Title Shot Available indicator and the Rankings tab header.
 */
async function getFighterRank(req, res) {
    try {
        const fighter = await Fighter.findById(req.params.id)
            .select("promotionTier weightClass overallRating winsInCurrentTier ranking")
            .lean();
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });
        const r = fighter.ranking || { rank: null, fightsInTier: 0, entryRecordAtFight3: null };
        res.json({
            tier: fighter.promotionTier,
            weightClass: fighter.weightClass,
            overallRating: fighter.overallRating,
            winsInCurrentTier: fighter.winsInCurrentTier ?? 0,
            rank: r.rank ?? null,
            fightsInTier: r.fightsInTier ?? 0,
            entryRecordAtFight3: r.entryRecordAtFight3 || null,
            rosterSize: (ROSTER_SIZE[fighter.promotionTier] || 0) + 1,
            isTopFive: r.rank != null && r.rank <= 5,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { getRankings, getFighterRank };
