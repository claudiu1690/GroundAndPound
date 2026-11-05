/**
 * Next goal for the fight result screen (first-session contract B.5, spec 2.3).
 * Pure: reads only the post-resolve fighter document; no DB, no Redis.
 *
 * THIS JSDoc IS THE SOURCE OF TRUTH FOR THE NextGoal SHAPE (summary.nextGoal on
 * POST /fights/resolve/:fighterId). The client renders it by `key` with its own copy.
 *
 * @typedef {Object} NextGoalSecondary
 * @property {"pvp_unlock"} key
 * @property {number} current   career wins toward the unlock, capped at target
 * @property {3} target
 *
 * @typedef {Object} NextGoal
 * @property {"rank"|"pvp_unlock"|"top5"|"title"|"tier"|"top"} key
 * @property {?number} current   progress numerator (rank: fightsInTier; pvp_unlock: wins;
 *                               title: top-5 wins in tier; tier: OVR); null for top5 / top
 * @property {?number} target    progress denominator; null for top5 / top
 * @property {?number} rank      top5 only: the fighter's current DISPLAY rank
 * @property {?string} tier      tier only: the next tier
 * @property {?number} threshold tier only: the next tier's minOverall
 * @property {?string} titleTier  top5 / title / tier: the tier whose title the fighter is chasing
 *                               (the current tier). Since 2026-11-04 the tier goal is framed as
 *                               that title: OVR is only the first gate, the promotion itself is
 *                               won by beating the champion (GDD §8).
 * @property {?NextGoalSecondary} secondary  Proving Ground progress while PvP is locked and
 *                               the main key is not pvp_unlock; else null
 *
 * Priority (first match):
 *   1. unranked                          -> rank        fightsInTier / RANKED_AFTER_FIGHTS
 *   2. Proving Ground locked             -> pvp_unlock  min(wins, 3) / 3
 *   3. title contender, not top 5        -> top5        rank = display rank
 *   4. contender, top 5, title wins left -> title       topFiveWinsInTier / titleWins
 *   5. a next tier exists                -> tier        OVR / next tier minOverall
 *   6. otherwise (GCS)                   -> top
 */
const rankingService = require("./rankingService");
const fightService = require("./fightService");

const PVP_UNLOCK_WINS = 3;

function goal(key, fields = {}) {
    return {
        key,
        current: fields.current ?? null,
        target: fields.target ?? null,
        rank: fields.rank ?? null,
        tier: fields.tier ?? null,
        threshold: fields.threshold ?? null,
        titleTier: fields.titleTier ?? null,
        secondary: null,
    };
}

/**
 * @param {Object} fighter post-resolve Fighter doc (hydrated or plain)
 * @returns {NextGoal}
 */
function computeNextGoal(fighter) {
    const f = fighter || {};
    const wins = Number(f.record?.wins) || 0;
    const pvpLocked = !f.pvpOnboarding?.unlocked;
    const pvpProgress = { key: "pvp_unlock", current: Math.min(wins, PVP_UNLOCK_WINS), target: PVP_UNLOCK_WINS };

    let out;
    const rank = f.ranking?.rank ?? null;
    if (rank == null) {
        out = goal("rank", {
            current: Number(f.ranking?.fightsInTier) || 0,
            target: rankingService.RANKED_AFTER_FIGHTS,
        });
    } else if (pvpLocked) {
        out = goal("pvp_unlock", { current: pvpProgress.current, target: pvpProgress.target });
    } else {
        const contender = fightService.isTitleContender(f);
        const topFive = rankingService.isTopFive(f);
        const titleWins = fightService.getTitleShotConfig(f.promotionTier).titleWins;
        const topFiveWins = Number(f.topFiveWinsInTier) || 0;
        const ladder = fightService.TIER_LADDER.find((e) => e.from === f.promotionTier);
        if (contender && !topFive) {
            out = goal("top5", { rank: rankingService.toDisplayRank(rank), titleTier: f.promotionTier ?? null });
        } else if (contender && topFive && topFiveWins < titleWins) {
            out = goal("title", { current: topFiveWins, target: titleWins, titleTier: f.promotionTier ?? null });
        } else if (ladder) {
            out = goal("tier", {
                tier: ladder.to,
                threshold: ladder.minOverall,
                current: Number(f.overallRating) || 0,
                target: ladder.minOverall,
                titleTier: f.promotionTier ?? null,
            });
        } else {
            out = goal("top");
        }
    }

    if (out.key !== "pvp_unlock" && pvpLocked) out.secondary = pvpProgress;
    return out;
}

module.exports = { computeNextGoal, PVP_UNLOCK_WINS };
