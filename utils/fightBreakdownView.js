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
 *
 * SHARED TYPES (single JSDoc home). fightService.getFightBreakdown,
 * pvpFightService.getFightBreakdown, fightController.getFightBreakdown and the resolve
 * response's `breakdownView` all return a BreakdownView. The frontend mirrors this list in
 * frontend/src/components/fights/reveal/revealModel.js (it cannot import it).
 */

/**
 * Outcome vocabulary of a `move_fired` event (`vars.outcome`), string or null:
 *   "stuffed"          the opponent's takedown failed (Sprawl)
 *   "takedown_landed"  a takedown landed on this exchange
 *   "ground_pound"     ground and pound from top on this exchange
 *   "absorbed"         the player took the hit and the move cut it (never set in a round the
 *                      player was finished)
 *   "escaped"          the player escaped (a submission, or out from under the top player)
 *   "sub_attempt"      the player's submission attempt was defended
 *   "sub_finished"     the player's submission finished the fight
 *   "tapped"           the opponent's submission finished the player
 *   "hurt"             the player's strike hurt the opponent
 *   "landed"           the player's strike landed
 *   "knockdown"        the player's strike scored a knockdown
 *   "finish"           the player's finish (KO/TKO) on this exchange
 *   null               no outcome proven (the line names the card and its trigger)
 *
 * @typedef {Object} EventLogVars
 * @property {string|null} strike
 * @property {string|null} sub
 * @property {string|null} position
 * @property {string|null} bodyPart
 * @property {string[]} moveIds        move_fired: every moveId of the (merged) entry; [] otherwise
 * @property {string|null} bonusType   move_fired only
 * @property {"PROC"|"SIGNATURE"|null} effectType  move_fired only
 * @property {string|null} outcome     move_fired only, vocabulary above
 * @property {string|null} stat        wildcard_fired only: str|spd|leg|wre|gnd|sub|chn|fiq
 * @property {number|null} count       move_fired only: triggerCount delta for this event
 *
 * @typedef {Object} EventLogEntry
 * @property {number} round
 * @property {string|null} timestamp   "M:SS", or null for a round-only event (a move_fired with
 *                                     no logged exchange to attach to, wildcard_fired)
 * @property {string} type             strike|takedown|submission|ground|knockdown|camp|finish|neutral|move|wildcard
 * @property {boolean} actorIsPlayer   viewer-relative (flipped on the opponent-seat swap; PvP
 *                                     never has move/wildcard events today)
 * @property {string} templateKey      e.g. move_fired, wildcard_fired, takedown_stuffed, camp_*_fired
 * @property {EventLogVars} vars
 *
 * @typedef {Object} LoadoutMoveRow
 * @property {string} moveId
 * @property {string} name
 * @property {string|null} rarity          COMMON|UNCOMMON|RARE|LEGENDARY
 * @property {"PASSIVE"|"PROC"|"SIGNATURE"|null} effectType
 * @property {string|null} bonusType
 * @property {string|null} triggerCondition
 * @property {string|null} art             asset key (frontend moveArtUrl)
 * @property {boolean} triggered
 * @property {number} firedCount           the engine's triggerCount (merged entries share it)
 *
 * @typedef {Object} LoadoutCampRow
 * @property {string|null} sessionType
 * @property {string|null} label
 * @property {string|null} matchStatus     MATCHED|PARTIAL|WRONG|UNMATCHED
 * @property {boolean} triggered
 * @property {number} firedCount
 *
 * @typedef {Object} LoadoutSnapshot
 * @property {LoadoutMoveRow[]} moves      equipped order
 * @property {LoadoutCampRow[]} camp       booked sessions that carry a bonus
 *
 * @typedef {Object} BreakdownView
 * @property {string} fightId
 * @property {"pve"|"pvp"} kind
 * @property {boolean} legacy
 * @property {string} outcome
 * @property {string} method
 * @property {number|null} finishRound
 * @property {string|null} finishTime
 * @property {boolean} youWon
 * @property {"player"|"opponent"} perspective
 * @property {Object} header
 * @property {string} introTemplateKey
 * @property {string} resultContextKey
 * @property {Array<Object>} rounds
 * @property {EventLogEntry[]} eventLog
 * @property {Array<Object>} campOutcomes
 * @property {string|null} wildcardText
 * @property {Object} totals
 * @property {LoadoutSnapshot|null} loadout  null for version-1 fights and for PvP
 * @property {number[]|null} staminaStart  [player, opponent] entering round 1; null on older fights
 * @property {number[]|null} healthStart  [player, opponent] health entering round 1 (the player's real HP)
 * @property {number|null} scheduledRounds  scheduled length of the fight; null on older fights
 *   (each rounds[i].health is [player, opponent] at the end of that round, or null)
 *   (each rounds[i].stamina is [player, opponent] through that round, or null)
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
 *  - breakdown: persisted breakdown subdoc (version 1, or 2 with `loadout` + move events).
 *  - kind: "pve" | "pvp"
 *  - outcome: ENGINE-perspective outcome string (PvE) — used for method/words.
 *  - method: PvP stored method (ko|submission|decision|draw) — used when kind==="pvp".
 *  - youWon: viewer-relative win boolean (already computed by caller).
 *  - perspective: "player" | "opponent" (opponent ⇒ swap).
 *  - header: { opponentName, tier, campGrade, weightCut, ... } (caller fills).
 *  - campOutcomes: [] for PvP; PvE camp report rows.
 *  - wildcardText: string|null (PvE only).
 *  - fightId: string.
 * @returns {BreakdownView}
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
            // [player, opponent] stamina through the round, or null (fights before stamina was saved).
            stamina: typeof rs.staminaPlayer === "number" && typeof rs.staminaOpponent === "number"
                ? pair(rs.staminaPlayer, rs.staminaOpponent, swap)
                : null,
            // [player, opponent] health at the end of the round, or null on older fights.
            health: typeof rs.healthPlayer === "number" && typeof rs.healthOpponent === "number"
                ? pair(rs.healthPlayer, rs.healthOpponent, swap)
                : null,
        };
    });

    // ── eventLog (flip actorIsPlayer on swap; move/wildcard flip like every event) ──
    const eventLogOut = eventLog.map((e) => {
        const v = e.vars || {};
        return {
            round: e.round,
            timestamp: e.timestamp ?? null, // null = round-only event
            type: e.type,
            actorIsPlayer: swap ? !e.actorIsPlayer : e.actorIsPlayer,
            templateKey: e.templateKey,
            vars: {
                strike: v.strike ?? null,
                sub: v.sub ?? null,
                position: v.position ?? null,
                bodyPart: v.bodyPart ?? null,
                moveIds: Array.isArray(v.moveIds) ? [...v.moveIds] : [],
                bonusType: v.bonusType ?? null,
                effectType: v.effectType ?? null,
                outcome: v.outcome ?? null,
                stat: v.stat ?? null,
                count: typeof v.count === "number" ? v.count : null,
            },
        };
    });

    // ── loadout (PvE v2 only; plain objects) ─────────────────────────────────
    const loadout = shapeLoadout(breakdown.loadout);
    const hsRaw = breakdown.healthStart ? Array.from(breakdown.healthStart) : null;
    const healthStart = hsRaw && hsRaw.length === 2 && hsRaw.every((v) => typeof v === "number")
        ? pair(hsRaw[0], hsRaw[1], swap)
        : null;
    // Stamina entering round 1 ([player, opponent]); null on older fights.
    const ssRaw = breakdown.staminaStart ? Array.from(breakdown.staminaStart) : null;
    const staminaStart = ssRaw && ssRaw.length === 2 && ssRaw.every((v) => typeof v === "number")
        ? pair(ssRaw[0], ssRaw[1], swap)
        : null;

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
        loadout,
        staminaStart,
        healthStart,
        scheduledRounds: Number.isInteger(breakdown.scheduledRounds) && breakdown.scheduledRounds > 0 ? breakdown.scheduledRounds : null,
    };
}

/**
 * Persisted breakdown.loadout (Mongoose subdoc or plain) → plain LoadoutSnapshot, or null when
 * the fight has none (version-1 fights, PvP).
 * @returns {LoadoutSnapshot|null}
 */
function shapeLoadout(raw) {
    if (!raw || typeof raw !== "object") return null;
    const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
    const moves = Array.isArray(raw.moves) ? raw.moves : [];
    const camp = Array.isArray(raw.camp) ? raw.camp : [];
    return {
        moves: moves.filter(Boolean).map((m) => ({
            moveId: m.moveId,
            name: m.name ?? null,
            rarity: m.rarity ?? null,
            effectType: m.effectType ?? null,
            bonusType: m.bonusType ?? null,
            triggerCondition: m.triggerCondition ?? null,
            art: m.art ?? null,
            triggered: !!m.triggered,
            firedCount: num(m.firedCount),
        })),
        camp: camp.filter(Boolean).map((c) => ({
            sessionType: c.sessionType ?? null,
            label: c.label ?? null,
            matchStatus: c.matchStatus ?? null,
            triggered: !!c.triggered,
            firedCount: num(c.firedCount),
        })),
    };
}

module.exports = {
    buildBreakdownResponse,
    classifyOutcome,
    classifyPvpMethod,
    outcomeWordFor,
};
