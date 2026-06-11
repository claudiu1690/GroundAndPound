/**
 * Ground & Pound — PVP rivalry service.
 *
 * A rivalry forms when one player beats the same opponent repeatedly in a season:
 *   - 2nd win vs the same opponent → upsert an ACTIVE rival (player1 = attacker).
 *   - 3rd win → resolve the rival (+25 DP applied on THAT fight via the DP calc).
 *
 * The +25 must be available to the DP calc BEFORE it runs (the resolving fight earns
 * the bonus). The orchestrator predicts `isRivalryResolved` from the prior win count,
 * then calls processRivalry to persist the doc AFTER DP is applied.
 */

const PVPFight = require("../models/pvpFightModel");
const PVPRival = require("../models/pvpRivalModel");

/**
 * How many times has `attackerId` already beaten `defenderId` this season (prior to
 * the current, not-yet-written fight)?
 */
async function priorWinCount(seasonId, attackerId, defenderId) {
    return PVPFight.countDocuments({ seasonId, winnerId: attackerId, loserId: defenderId });
}

/**
 * Persist rivalry state after a win is known. Call AFTER the DP/fight write.
 *  - priorWins === 1 (this is the 2nd win) → set/refresh an active rival.
 *  - priorWins === 2 (this is the 3rd win) → resolve.
 * @returns {{ isRivalryFight:boolean, isRivalryResolved:boolean }}
 */
async function processRivalry(seasonId, attackerId, defenderId, priorWins) {
    if (priorWins == null) {
        // eslint-disable-next-line no-param-reassign
        priorWins = await priorWinCount(seasonId, attackerId, defenderId);
    }
    const totalWins = priorWins + 1; // include the current win

    if (totalWins < 2) {
        return { isRivalryFight: false, isRivalryResolved: false };
    }

    // Scope strictly to THIS direction (player1=attacker, player2=defender). A→B and
    // B→A are independent docs and must never cross-mutate: if we matched either
    // direction here, A's win count could clobber the opposite B→A doc's `wins`.
    let rival = await PVPRival.findOne({
        seasonId,
        player1Id: attackerId,
        player2Id: defenderId,
    });

    if (totalWins === 2) {
        if (!rival) {
            try {
                rival = await PVPRival.create({
                    seasonId,
                    player1Id: attackerId,
                    player2Id: defenderId,
                    wins: totalWins,
                    status: "active",
                });
            } catch (err) {
                if (!(err && err.code === 11000)) throw err;
                rival = await PVPRival.findOne({ seasonId, player1Id: attackerId, player2Id: defenderId });
            }
        } else if (rival.status === "active") {
            rival.wins = totalWins;
            await rival.save();
        }
        return { isRivalryFight: true, isRivalryResolved: false };
    }

    // totalWins >= 3 → resolve.
    if (rival && rival.status === "active") {
        rival.wins = totalWins;
        rival.status = "resolved";
        rival.resolvedAt = new Date();
        await rival.save();
        return { isRivalryFight: true, isRivalryResolved: true };
    }

    // Already resolved (4th+ win) — still flagged as a rivalry fight but no new resolution.
    return { isRivalryFight: true, isRivalryResolved: false };
}

/**
 * Is there an active rivalry between these two players this season (either direction)?
 */
async function hasActiveRivalry(seasonId, aId, bId) {
    const r = await PVPRival.findOne({
        seasonId,
        status: "active",
        $or: [
            { player1Id: aId, player2Id: bId },
            { player1Id: bId, player2Id: aId },
        ],
    }).select("_id").lean();
    return !!r;
}

module.exports = { priorWinCount, processRivalry, hasActiveRivalry };
