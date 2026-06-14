/**
 * Ground & Pound — Proving Ground (PVP) Batch-1 achievement-badge evaluator.
 *
 * These badges are awarded IMPERATIVELY against fighter.badgesEarned via the existing
 * idempotent pvpRewardService.awardBadge (guards already-earned). This module ONLY
 * mutates fighter.badgesEarned — it NEVER saves. The caller (pvpFightService /
 * pvpRewardService) owns persistence ordering.
 *
 * require cycle note: pvpFightService → pvpBadgeService → pvpRewardService → … so
 * awardBadge is pulled in via a LAZY require inside the functions to break the cycle.
 */

const { DIVISION_KEYS } = require("../consts/pvpConfig");

const FINISH_METHODS = new Set(["ko", "submission"]);

/** Rank index of a division key in the DP ladder order (-1 if unknown). */
function divisionRank(divKey) {
    return DIVISION_KEYS.indexOf(divKey);
}

/**
 * Per-fight badge evaluation. Mutates `fighter.badgesEarned` only.
 *
 * @param {object} fighter loaded (or fresh) fighter doc — mutated in place
 * @param {object} record  THIS fighter's PVP record (post applyDpAndDivision: division/winStreak final)
 * @param {object} pvpCtx  {
 *   attackerWon, isDraw, method, bracketTier, isRivalryResolved,
 *   isBeltHolderFight, twistApplied, viewerIsAttacker
 * }
 */
function evaluatePvpFightBadges(fighter, record, pvpCtx) {
    if (!fighter || !record || !pvpCtx) return;
    const { awardBadge } = require("./pvpRewardService");

    const {
        attackerWon,
        isDraw,
        method,
        bracketTier,
        isRivalryResolved,
        isBeltHolderFight,
        twistApplied,
        viewerIsAttacker,
    } = pvpCtx;

    const viewerWon = viewerIsAttacker ? !!attackerWon : (!attackerWon && !isDraw);

    // First win (attacker only — a successful defense isn't an attacker "win" here).
    if (viewerIsAttacker && attackerWon && !isDraw) {
        awardBadge(fighter, "pvp_first_blood");
    }
    // First finish (any viewer-side win by KO/sub).
    if (viewerWon && !isDraw && FINISH_METHODS.has(method)) {
        awardBadge(fighter, "pvp_first_finish");
    }
    // First successful defense (defender held — attacker did not win, not a draw).
    if (!viewerIsAttacker && !attackerWon && !isDraw) {
        awardBadge(fighter, "pvp_first_defense");
    }

    // Division-reach (cumulative high-water — rank >= target rank).
    const rank = divisionRank(record.division);
    if (rank >= divisionRank("contender")) awardBadge(fighter, "pvp_reach_contender");
    if (rank >= divisionRank("challenger")) awardBadge(fighter, "pvp_reach_challenger");
    if (rank >= divisionRank("elite")) awardBadge(fighter, "pvp_reach_elite");
    if (rank >= divisionRank("champion")) awardBadge(fighter, "pvp_reach_champion");

    // Win streaks (record.winStreak is final post-fight).
    const streak = Number(record.winStreak) || 0;
    if (streak >= 3) awardBadge(fighter, "pvp_streak_3");
    if (streak >= 5) awardBadge(fighter, "pvp_streak_5");
    if (streak >= 10) awardBadge(fighter, "pvp_streak_10");

    // Giant killer/slayer — attacker beat an up-bracketed opponent.
    if (viewerIsAttacker && attackerWon && bracketTier !== "none") {
        awardBadge(fighter, "pvp_giant_killer");
    }
    if (viewerIsAttacker && attackerWon && bracketTier === "plus25") {
        awardBadge(fighter, "pvp_giant_slayer");
    }

    // Rivalry resolved (attacker's 3rd win over the rival).
    if (viewerIsAttacker && isRivalryResolved) {
        awardBadge(fighter, "pvp_rival_first");
    }

    // Belt defender — held the record while it was a belt-holder fight (defender side).
    if (!viewerIsAttacker && isBeltHolderFight && !attackerWon && !isDraw) {
        awardBadge(fighter, "pvp_belt_defense");
    }

    // Twist master — won under an active season twist.
    if (viewerWon && !isDraw && twistApplied) {
        awardBadge(fighter, "pvp_twist_master");
    }
}

/**
 * Per-season belt/placement badge evaluation. Mutates `fighter.badgesEarned` only.
 *
 * MUST be called AFTER the per-season belt id (pvp_belt_s<N>_<wc>) has already been
 * minted into fighter.badgesEarned for the belt holder, so belt_first/2/b2b count the
 * current season.
 *
 * @param {object} fighter   loaded fighter doc — mutated in place
 * @param {object} record    THIS fighter's PVP record for the ended season
 * @param {object} seasonCtx { isBelt, ladderRank, weightClass, seasonNumber }
 */
function evaluatePvpSeasonBadges(fighter, record, seasonCtx) {
    if (!fighter || !record || !seasonCtx) return;
    const { awardBadge } = require("./pvpRewardService");

    const { isBelt, ladderRank } = seasonCtx;
    const earned = Array.isArray(fighter.badgesEarned) ? fighter.badgesEarned : [];
    const earnedIds = earned.map((e) => e && e.badgeId).filter(Boolean);

    // Distinct per-season belt ids: pvp_belt_s<N>_<wc>
    const beltSeasons = new Set();
    for (const id of earnedIds) {
        const m = /^pvp_belt_s(\d+)_/.exec(id);
        if (m) beltSeasons.add(Number(m[1]));
    }

    if (isBelt) {
        awardBadge(fighter, "pvp_belt_first");
        if (Number(record.losses) === 0) awardBadge(fighter, "pvp_undefeated_champ");
    }

    if (beltSeasons.size >= 2) {
        awardBadge(fighter, "pvp_belt_2");
    }

    // Back-to-back: any season N where N and N+1 are both held.
    for (const n of beltSeasons) {
        if (beltSeasons.has(n + 1)) {
            awardBadge(fighter, "pvp_belt_b2b");
            break;
        }
    }

    if (earnedIds.includes("pvp_belt_s1_open")) {
        awardBadge(fighter, "pvp_open_champion");
    }

    if (Number(ladderRank) >= 1 && Number(ladderRank) <= 3) {
        awardBadge(fighter, "pvp_top3");
    }

    if (Number(record.losses) === 0 && Number(record.wins) >= 10) {
        awardBadge(fighter, "pvp_unbeaten_season");
    }
}

module.exports = { evaluatePvpFightBadges, evaluatePvpSeasonBadges };
