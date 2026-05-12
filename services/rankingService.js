/**
 * Ranking System v1.0 — fixed-roster ranking layer.
 *
 * Each (tier, weightClass) pair has a fixed roster of NPC opponents with permanent ranks.
 * The player has a visible rank within their current tier; rank is the primary progression
 * signal and gates the title shot.
 *
 * This service is READ-ONLY relative to the fight engine — it never touches stats,
 * iron, or fight resolution. Only the title shot gate consumes the rank.
 *
 * Public surface:
 *   - ROSTER_SIZE: per-tier roster sizes (excludes champion)
 *   - updatePlayerRank(fighter, fightResult): apply entry/movement after each fight
 *   - resetRankingForNewTier(fighter): wipe ranking on tier promotion
 *   - isTopFive(fighter): boolean for title shot gating
 */

// Roster sizes per tier — excludes the champion (rank 1). Total slots = rosterSize + 1.
const ROSTER_SIZE = {
    Amateur:         30,
    "Regional Pro":  25,
    National:        20,
    "GCS Contender": 15,
    GCS:             10,
};

// Total tier roster including champion (rank 1). Returns 0 for unknown tiers so
// downstream code (clampRank, etc.) can detect bad inputs instead of treating a
// missing tier as a 1-fighter division.
function tierSize(tier) {
    const base = ROSTER_SIZE[tier];
    return typeof base === "number" ? base + 1 : 0;
}

// ── Entry rank (after fight 3) ──────────────────────────────────────────────

/**
 * After the player's 3rd fight in the tier, place them in the rankings based on record.
 * 3-0:  "bottom − 2" (small head-start)
 * 2-1:  bottom
 * 1-2 or worse: bottom (last)
 */
function getEntryRank(tier, winsAtFight3) {
    const last = tierSize(tier);
    if (last <= 1) return null;
    if (winsAtFight3 >= 3) return last - 2;
    return last; // 2-1 or worse all land at the bottom
}

function buildEntryRecord(fighter) {
    const wins = fighter.winsInCurrentTier || 0;
    const fights = fighter.ranking?.fightsInTier || 0;
    const losses = Math.max(0, fights - wins); // draws fold into losses for this snapshot
    return `${wins}-${losses}`;
}

// ── Movement math ────────────────────────────────────────────────────────────

/**
 * Compute the signed rank delta for a fight result.
 * Positive delta = move toward #1 (better rank).
 * Negative delta = move toward last (worse rank).
 *
 * Win base:        +1
 * Win by KO/SUB:   +2 (replaces base — finish bonus)
 * Win upset:       +2 (stacks with finish — max +4)
 * Loss base:       -1
 * Loss upset:      -2 (replaces base — upset loss)
 * Draw:             0
 */
function calcDelta(result, playerRank, opponentRank) {
    if (result.isDraw) return 0;

    if (result.isWin) {
        let delta = 1;
        if (result.method === "KO" || result.method === "SUB") delta = 2;
        if (opponentRank != null && opponentRank < playerRank) delta += 2;
        return delta;
    }

    if (result.isLoss) {
        let delta = -1;
        if (opponentRank != null && opponentRank > playerRank) delta = -2;
        return delta;
    }

    return 0;
}

/**
 * Clamp a new rank inside the legal range for the tier.
 * Ceiling = 2 (rank #1 is the champion, only reachable via title fight).
 * Floor   = tierSize(tier) (last position in the roster).
 */
function clampRank(newRank, tier) {
    const ceiling = 2;
    const floor = tierSize(tier);
    return Math.min(floor, Math.max(ceiling, newRank));
}

// ── Post-fight integration ──────────────────────────────────────────────────

/**
 * Called after every fight resolves. Mutates fighter.ranking in place.
 *
 * Phase 1 (fights 1-2): increment fightsInTier only.
 * Phase 2 (fight 3): insert player into rankings based on their record.
 * Phase 3 (fights 4+): apply rank movement based on result.
 *
 * @param fighter     Fighter doc (mongoose)
 * @param fightResult { isWin, isLoss, isDraw, method: "KO"|"SUB"|"DEC", opponentRank: number|null }
 */
function updatePlayerRank(fighter, fightResult) {
    if (!fighter.ranking) {
        fighter.ranking = { rank: null, fightsInTier: 0, entryRecordAtFight3: null };
    }
    const r = fighter.ranking;
    const tier = fighter.promotionTier;
    if (!ROSTER_SIZE[tier]) return; // unknown tier — no-op

    r.fightsInTier = (r.fightsInTier || 0) + 1;

    // Phase 2: entry on fight 3
    if (r.rank == null && r.fightsInTier === 3) {
        const winsAtFight3 = fighter.winsInCurrentTier || 0;
        r.rank = getEntryRank(tier, winsAtFight3);
        r.entryRecordAtFight3 = buildEntryRecord(fighter);
        if (typeof fighter.markModified === "function") fighter.markModified("ranking");
        return;
    }

    // Phase 3: already ranked — apply movement
    if (r.rank != null && r.fightsInTier > 3) {
        const delta = calcDelta(fightResult, r.rank, fightResult.opponentRank);
        // Positive delta = move toward #1 (lower rank number). Subtract from current rank.
        r.rank = clampRank(r.rank - delta, tier);
        if (typeof fighter.markModified === "function") fighter.markModified("ranking");
    }
}

/**
 * Wipe ranking state when the fighter is promoted to a new tier.
 * Called from fightService at the moment of promotion.
 */
function resetRankingForNewTier(fighter) {
    fighter.ranking = {
        rank: null,
        fightsInTier: 0,
        entryRecordAtFight3: null,
    };
    if (typeof fighter.markModified === "function") fighter.markModified("ranking");
}

/**
 * Title-shot gate. Player must be ranked top 5 (ranks 2-5) in addition to existing checks.
 * Returns true if rank exists AND is <= 5.
 */
function isTopFive(fighter) {
    const rank = fighter.ranking?.rank;
    return rank != null && rank <= 5;
}

/**
 * Callout v1.1 — eligibility threshold. Player must be ranked top 15 (1-15) to call out.
 * Locked while Unranked or ranked 16+.
 */
const CALLOUT_RANK_THRESHOLD = 15;

function isCalloutEligible(fighter) {
    const rank = fighter.ranking?.rank;
    return rank != null && rank <= CALLOUT_RANK_THRESHOLD;
}

/**
 * Compute the *displayed* rank for an NPC when the player is ranked in the same tier.
 * The player's rank logically inserts into the roster — NPCs at the player's rank or
 * below shift down by 1 visually, so both can't appear as the same #N.
 *
 * Underlying NPC fixedRank in the DB stays unchanged (spec: "NPC ranks are fixed and
 * never change"). This function only affects display.
 *
 * @param {number} npcFixedRank   The NPC's permanent rank in the DB
 * @param {number|null} playerRank The player's current rank, or null if Unranked
 * @returns {number} the rank to render on the UI
 */
function displayRankForNpc(npcFixedRank, playerRank) {
    if (typeof npcFixedRank !== "number") return npcFixedRank;
    // Champion (rank 1) is never displaced — player ceiling is rank 2.
    if (npcFixedRank === 1) return 1;
    if (playerRank == null) return npcFixedRank;
    if (npcFixedRank >= playerRank) return npcFixedRank + 1;
    return npcFixedRank;
}

/**
 * Map an outcome string from FIGHT_OUTCOMES into the result shape used by calcDelta().
 * Used by fightService to translate its outcome strings into the ranking input.
 */
function buildFightResultFromOutcome(outcome) {
    const isWin = ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"].includes(outcome);
    const isDraw = outcome === "Draw";
    const isLoss = !isWin && !isDraw;
    let method = "DEC";
    if (outcome === "KO/TKO" || outcome === "Loss (KO/TKO)") method = "KO";
    else if (outcome === "Submission" || outcome === "Loss (submission)") method = "SUB";
    return { isWin, isLoss, isDraw, method };
}

module.exports = {
    ROSTER_SIZE,
    tierSize,
    getEntryRank,
    calcDelta,
    clampRank,
    updatePlayerRank,
    resetRankingForNewTier,
    isTopFive,
    isCalloutEligible,
    CALLOUT_RANK_THRESHOLD,
    displayRankForNpc,
    buildFightResultFromOutcome,
};
