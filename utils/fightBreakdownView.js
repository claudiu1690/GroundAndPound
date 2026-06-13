/**
 * Ground & Pound — Fight Description System: read-side view builder.
 *
 * PURE shaping of a PERSISTED `breakdown` (engine perspective) into the
 * viewer-relative response the frontend reads. Shared by the PvE and PvP
 * breakdown services so the swap/totals/method logic lives in exactly one place.
 *
 * VIEWER-PERSPECTIVE SWAP: persisted breakdown is engine-perspective (PvP attacker
 * = player). When the viewer is the engine-opponent (PvP defender) we swap every
 * [player,opponent] pair and flip every eventLog actorIsPlayer.
 */

// ── Outcome → vocabulary ─────────────────────────────────────────────────────
// Engine-perspective outcome string → { method, finishKind }.
//   method ∈ ko|tko|submission|decision|draw   (frontend-facing)
//   finishKind: whether the round was a finish (drives finishRound/finishTime).
function classifyOutcome(outcome) {
    switch (outcome) {
        case "KO/TKO":
        case "Loss (KO/TKO)":
            return { method: "ko", isFinish: true, isDraw: false };
        case "Submission":
        case "Loss (submission)":
            return { method: "submission", isFinish: true, isDraw: false };
        case "Draw":
            return { method: "draw", isFinish: false, isDraw: true };
        default:
            // Decision (unanimous|split) and "Loss (decision)"
            return { method: "decision", isFinish: false, isDraw: false };
    }
}

// PvP stores a method-ish field ("ko"|"submission"|"decision"|"draw"). Normalise to
// the same vocabulary so the view is identical across PvE/PvP.
function classifyPvpMethod(method, youWon) {
    if (method === "draw") return { method: "draw", isFinish: false, isDraw: true };
    if (method === "ko") return { method: "ko", isFinish: true, isDraw: false };
    if (method === "submission") return { method: "submission", isFinish: true, isDraw: false };
    return { method: "decision", isFinish: false, isDraw: false };
}

function outcomeWordFor({ isDraw, youWon }) {
    if (isDraw) return "DRAW";
    return youWon ? "VICTORY" : "DEFEAT";
}

// The HEADER method must come from the FINISH EVENT's templateKey, not the outcome
// string — the outcome string only distinguishes win/loss/submission, NOT KO-vs-TKO.
// This is the single source of truth for how the finish is labelled.
//   ko_finish → "KO" · tko_finish_ground|tko_finish_strike → "TKO"
//   submission_finish → "submission" · anything else → null (caller keeps decision/draw).
function methodFromFinishTemplate(templateKey) {
    switch (templateKey) {
        case "ko_finish":
            return "KO";
        case "tko_finish_ground":
        case "tko_finish_strike":
            return "TKO";
        case "submission_finish":
            return "submission";
        default:
            return null;
    }
}

// Swap a [player, opponent] pair when viewing from the opponent's seat.
function pair(p, o, swap) {
    return swap ? [o, p] : [p, o];
}

/**
 * Build the full viewer-relative response from a persisted breakdown.
 *
 * @param {Object} args
 *  - breakdown: persisted breakdown subdoc (version 1).
 *  - kind: "pve" | "pvp"
 *  - outcome: ENGINE-perspective outcome string (PvE) — used for method/words.
 *  - method: PvP stored method (ko|submission|decision|draw) — used when kind==="pvp".
 *  - youWon: viewer-relative win boolean (already computed by caller).
 *  - perspective: "player" | "opponent" (opponent ⇒ swap).
 *  - header: { opponentName, tier, campGrade, weightCut, ... } (caller fills).
 *  - campOutcomes: [] for PvP; PvE camp report rows.
 *  - wildcardText: string|null (PvE only).
 *  - fightId: string.
 */
function buildBreakdownResponse(args) {
    const {
        breakdown,
        kind,
        fightId,
        outcome,
        method: pvpMethod,
        youWon,
        perspective,
        header,
        campOutcomes = [],
        wildcardText = null,
    } = args;

    const swap = perspective === "opponent";

    const cls =
        kind === "pvp"
            ? classifyPvpMethod(pvpMethod, youWon)
            : classifyOutcome(outcome);

    const roundStats = breakdown.roundStats || [];
    const eventLog = breakdown.eventLog || [];

    // ── finishRound / finishTime / method ────────────────────────────────────
    // The finish event is the single source of truth for finishTime AND the header
    // method (KO vs TKO can ONLY be told apart by the finish event's templateKey).
    let finishRound = null;
    let finishTime = null;
    let method = cls.method; // decision/draw default; overridden by the finish event below.
    if (cls.isFinish && roundStats.length) {
        finishRound = roundStats[roundStats.length - 1].round;
        const finishEvt = [...eventLog].reverse().find((e) => e.type === "finish");
        finishTime = finishEvt ? finishEvt.timestamp : null;
        const m = finishEvt ? methodFromFinishTemplate(finishEvt.templateKey) : null;
        if (m) method = m;
    }

    // ── rounds (viewer-relative) ─────────────────────────────────────────────
    const rounds = roundStats.map((rs) => {
        let roundWinner = rs.roundWinner;
        if (swap) {
            if (roundWinner === "player") roundWinner = "opponent";
            else if (roundWinner === "opponent") roundWinner = "player";
        }
        return {
            round: rs.round,
            roundWinner,
            dominant: rs.dominant,
            strikes: pair(rs.strikesPlayer, rs.strikesOpponent, swap),
            takedowns: pair(rs.takedownsPlayer, rs.takedownsOpponent, swap),
            subAttempts: pair(rs.subAttemptsPlayer, rs.subAttemptsOpponent, swap),
            knockdowns: pair(rs.knockdownsPlayer, rs.knockdownsOpponent, swap),
            damage: pair(rs.damagePlayer, rs.damageOpponent, swap),
            controlTime: pair(rs.controlTimePlayer, rs.controlTimeOpponent, swap),
        };
    });

    // ── eventLog (flip actorIsPlayer on swap) ────────────────────────────────
    const eventLogOut = eventLog.map((e) => ({
        round: e.round,
        timestamp: e.timestamp,
        type: e.type,
        actorIsPlayer: swap ? !e.actorIsPlayer : e.actorIsPlayer,
        templateKey: e.templateKey,
        vars: {
            strike: e.vars ? e.vars.strike ?? null : null,
            sub: e.vars ? e.vars.sub ?? null : null,
            position: e.vars ? e.vars.position ?? null : null,
            bodyPart: e.vars ? e.vars.bodyPart ?? null : null,
        },
    }));

    // ── totals (sum strikes/td/sub/kd; damage = final-round cumulative) ──────
    let sP = 0, sO = 0, tP = 0, tO = 0, subPt = 0, subOt = 0, kP = 0, kO = 0, ctP = 0, ctO = 0;
    for (const rs of roundStats) {
        sP += rs.strikesPlayer; sO += rs.strikesOpponent;
        tP += rs.takedownsPlayer; tO += rs.takedownsOpponent;
        subPt += rs.subAttemptsPlayer; subOt += rs.subAttemptsOpponent;
        kP += rs.knockdownsPlayer; kO += rs.knockdownsOpponent;
        ctP += rs.controlTimePlayer; ctO += rs.controlTimeOpponent;
    }
    const last = roundStats.length ? roundStats[roundStats.length - 1] : { damagePlayer: 0, damageOpponent: 0 };
    const totals = {
        strikes: pair(sP, sO, swap),
        takedowns: pair(tP, tO, swap),
        subAttempts: pair(subPt, subOt, swap),
        knockdowns: pair(kP, kO, swap),
        damage: pair(last.damagePlayer, last.damageOpponent, swap),
        controlTime: pair(ctP, ctO, swap),
    };

    // ── intro / result context (swap giantKiller framing is NOT needed — the keys
    //    are viewer-relative only for "youWon"; persisted keys are attacker-relative.
    //    For the opponent viewer giantKiller/comeback etc. don't apply, so on swap we
    //    fall back to the neutral standard/nemesis/title bucket. Title/nemesis are
    //    symmetric (both fighters share them); the asymmetric ones we neutralise.) ──
    let introTemplateKey = breakdown.introTemplateKey || "standard";
    let resultContextKey = breakdown.resultContextKey || "standard";
    if (swap) {
        const symmetric = new Set(["title", "nemesis", "standard"]);
        if (!symmetric.has(introTemplateKey)) introTemplateKey = "standard";
        if (!symmetric.has(resultContextKey)) resultContextKey = "standard";
    }

    // header.playerName is the VIEWER-relative player display name (templates are
    // third-person, so the frontend needs the viewer's actual fighter name).
    const headerOut = {
        ...header,
        playerName: header && header.playerName != null ? header.playerName : null,
        outcomeWord: outcomeWordFor({ isDraw: cls.isDraw, youWon }),
    };

    return {
        fightId,
        kind,
        legacy: false,
        outcome,
        method,
        finishRound,
        finishTime,
        youWon: !!youWon,
        perspective,
        header: headerOut,
        introTemplateKey,
        resultContextKey,
        rounds,
        eventLog: eventLogOut,
        campOutcomes,
        wildcardText,
        totals,
    };
}

module.exports = {
    buildBreakdownResponse,
    classifyOutcome,
    classifyPvpMethod,
    outcomeWordFor,
};
