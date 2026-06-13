/**
 * Ground & Pound — Fight Description System: derivation layer.
 *
 * PURE. No I/O, no clock, no global RNG. Given the existing `resolveFight` engine
 * output it produces a deterministic round-by-round breakdown (stats + event log)
 * in ENGINE perspective (player = engine player = PvE fighter / PvP attacker).
 *
 * Determinism comes from a seeded FNV-1a hash keyed by `${fightId}:${round}:${slot}`,
 * so the same fight always derives the same narrative — no RNG, no clock.
 *
 * The combat loop is NOT rewritten; everything here is read-only derivation from
 * the engine's per-round { event, grapplingControl, playerDamage, opponentDamage,
 * playerHealth, opponentHealth, campCommentary } records.
 */

// ── Seeded PRNG ──────────────────────────────────────────────────────────────
// FNV-1a 32-bit over the seed string → float in [0,1). Deterministic, no globals.
function rand(fightId, round, slot) {
    const str = `${fightId}:${round}:${slot}`;
    let h = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        // FNV prime 16777619, kept in 32-bit via Math.imul.
        h = Math.imul(h, 0x01000193);
    }
    // Unsigned 32-bit → [0,1).
    return (h >>> 0) / 4294967296;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// ── Archetype classification ─────────────────────────────────────────────────
const ARCH = {
    STRIKE: "STRIKE",
    TD_PLAYER: "TD_PLAYER",
    TD_OPPONENT: "TD_OPPONENT",
    GROUND_PLAYER: "GROUND_PLAYER",
    GROUND_OPPONENT: "GROUND_OPPONENT",
};

function classify(event) {
    switch (event) {
        case "Takedown; ground and pound.":
            return ARCH.TD_PLAYER;
        case "Opponent took you down.":
            return ARCH.TD_OPPONENT;
        case "Holding top control; ground and pound.":
            return ARCH.GROUND_PLAYER;
        case "Stuck on bottom; opponent grinds.":
            return ARCH.GROUND_OPPONENT;
        case "Striking exchange.":
        default:
            return ARCH.STRIKE;
    }
}

function isControllerPlayer(arch) {
    return arch === ARCH.TD_PLAYER || arch === ARCH.GROUND_PLAYER;
}
function isControllerOpponent(arch) {
    return arch === ARCH.TD_OPPONENT || arch === ARCH.GROUND_OPPONENT;
}
function isGround(arch) {
    return arch === ARCH.GROUND_PLAYER || arch === ARCH.GROUND_OPPONENT;
}
function isTakedown(arch) {
    return arch === ARCH.TD_PLAYER || arch === ARCH.TD_OPPONENT;
}

// ── Strike vocabulary by style ───────────────────────────────────────────────
function styleStrikes(style) {
    const s = (style || "").toLowerCase();
    if (s.includes("boxer") || s === "boxing") return ["hook", "cross", "uppercut", "body shot"];
    if (s.includes("kickbox") || s.includes("muay")) return ["low kick", "head kick", "knee", "elbow"];
    if (s.includes("capoeira")) return ["spinning kick", "head kick"];
    // grapplers / unknown
    return ["overhand", "short elbows", "jab", "right hand", "combination", "counter"];
}

function pickStrike(style, fightId, round, slot) {
    const opts = styleStrikes(style);
    const idx = Math.floor(rand(fightId, round, slot) * opts.length);
    return opts[clamp(idx, 0, opts.length - 1)];
}

function bodyPartFor(strike, fromBodyShot) {
    if (fromBodyShot) return "body";
    if (strike === "body shot") return "body";
    if (strike === "low kick") return "leg";
    return "head";
}

// ── Submission vocabulary ────────────────────────────────────────────────────
function pickSub(style, positionKind, fightId, round, slot) {
    const s = (style || "").toLowerCase();
    let opts;
    if (positionKind === "guard") {
        // guard / off the back
        opts = ["triangle", "armbar", "guillotine"];
        if (s.includes("bjj") || s.includes("jiu")) opts = ["triangle", "armbar"];
        else if (s.includes("judo") || s.includes("sambo")) opts = ["armbar"];
    } else {
        // top control
        opts = ["arm-triangle", "kimura", "rear-naked choke"];
        if (s.includes("wrestl")) opts = ["arm-triangle", "rear-naked choke"];
    }
    const idx = Math.floor(rand(fightId, round, slot) * opts.length);
    return opts[clamp(idx, 0, opts.length - 1)];
}

function takedownVar(style, fightId, round, slot) {
    const s = (style || "").toLowerCase();
    if (s.includes("judo")) return "throw";
    if (s.includes("sambo")) return "trip";
    if (s.includes("wrestl")) {
        return rand(fightId, round, slot) < 0.5 ? "double-leg" : "single-leg";
    }
    const opts = ["double-leg", "single-leg", "trip", "throw"];
    const idx = Math.floor(rand(fightId, round, slot) * opts.length);
    return opts[clamp(idx, 0, opts.length - 1)];
}

// ── Outcome → method / words ─────────────────────────────────────────────────
function isFinishOutcome(outcome) {
    return (
        outcome === "KO/TKO" ||
        outcome === "Submission" ||
        outcome === "Loss (KO/TKO)" ||
        outcome === "Loss (submission)"
    );
}

// ── Main derivation ──────────────────────────────────────────────────────────
function deriveFightDetails(engineResult, ctx, fightId) {
    const rounds = engineResult.rounds || [];
    const outcome = engineResult.outcome;
    const sessionBonuses = engineResult.sessionBonuses || [];
    const isFinish = isFinishOutcome(outcome);
    const finishRoundNum = isFinish && rounds.length ? rounds[rounds.length - 1].round : null;
    // Engine cause of a (T)KO/submission ("ko" | "tko" | "submission" | null). Display-only.
    // Only consulted on the finish round; for legacy engine results lacking it we fall
    // back to a damage heuristic inside buildFinishEvent.
    const finishCause = engineResult.finishCause ?? null;

    const playerStyle = ctx.playerStyle;
    const opponentStyle = ctx.opponentStyle;

    // Camp bonus match-status guard (belt-and-braces). Map campCommentary key → the
    // bonusType it came from, and only emit a camp event when that bonus matched/partial.
    const matchedBonusTypes = new Set(
        sessionBonuses
            .filter((b) => b && (b.matchStatus === "MATCHED" || b.matchStatus === "PARTIAL"))
            .map((b) => b.bonusType)
    );
    // campCommentary key → bonusType that produces it (for the defensive guard).
    const CAMP_BONUS_TYPE = {
        campCardio: "STAMINA_DRAIN",
        campTakedownDefence: "SPRAWL_SUCCESS",
        campSubmissionEscape: "ESCAPE_PROBABILITY",
        campGnpPosture: "GNP_DAMAGE",
        campClinchControl: "CLINCH_DAMAGE",
        campStrikingAccuracy: "STRIKE_DAMAGE",
        campBodyShot: "BODY_DAMAGE",
    };
    const CAMP_TEMPLATE = {
        campCardio: "camp_cardio_fired",
        campTakedownDefence: "camp_takedown_defence_fired",
        campSubmissionEscape: "camp_submission_escape_fired",
        campGnpPosture: "camp_gnp_fired",
        campClinchControl: "camp_clinch_fired",
        campStrikingAccuracy: "camp_striking_accuracy_fired",
    };
    function campAllowed(key) {
        const bt = CAMP_BONUS_TYPE[key];
        // If we have no session bonus info at all (e.g. PvP), allow — the guard is
        // defensive against UNMATCHED leakage, not a hard requirement.
        if (!sessionBonuses.length) return true;
        if (!bt) return true;
        return matchedBonusTypes.has(bt);
    }

    const roundStats = [];
    const eventLog = [];

    let cumP = 0; // cumulative damage the PLAYER DEALT (dealt_p) — offensive output, matches strikes/round-winner
    let cumO = 0; // cumulative damage the OPPONENT DEALT (dealt_o)
    let consecutiveControlledByPlayer = 0; // for position escalation (player controlling)
    let consecutiveControlledByOpp = 0;

    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        const round = r.round;
        const arch = classify(r.event);
        const ctrl = r.grapplingControl || 0;
        const dealt_p = r.opponentDamage || 0; // player dealt → opponent took
        const dealt_o = r.playerDamage || 0; // opponent dealt → player took
        const campKeys = Array.isArray(r.campCommentary) ? r.campCommentary : [];
        const isFinishRound = isFinish && i === rounds.length - 1;

        const prevPlayerHealth = i === 0 ? 100 : rounds[i - 1].playerHealth ?? 100;
        const prevOppHealth = i === 0 ? 100 : rounds[i - 1].opponentHealth ?? 100;
        const playerHealth = r.playerHealth ?? 100;
        const oppHealth = r.opponentHealth ?? 100;

        // ── STRIKES ──────────────────────────────────────────────────────────
        let strikesP = 0;
        let strikesO = 0;
        const jit = (d, slot) => Math.floor(rand(fightId, round, slot) * 3) - 1;
        if (arch === ARCH.STRIKE) {
            strikesP = clamp(4 + Math.round(dealt_p / 1.6) + jit(dealt_p, "sjp"), 2, 28);
            strikesO = clamp(4 + Math.round(dealt_o / 1.6) + jit(dealt_o, "sjo"), 2, 28);
        } else if (isTakedown(arch)) {
            const ctrlDealt = isControllerPlayer(arch) ? dealt_p : dealt_o;
            const ctrlStrikes = clamp(3 + Math.round(ctrlDealt / 2.0), 3, 22);
            const otherStrikes = 1 + Math.floor(rand(fightId, round, "tdother") * 4);
            if (isControllerPlayer(arch)) {
                strikesP = ctrlStrikes;
                strikesO = otherStrikes;
            } else {
                strikesO = ctrlStrikes;
                strikesP = otherStrikes;
            }
        } else if (isGround(arch)) {
            const ctrlDealt = isControllerPlayer(arch) ? dealt_p : dealt_o;
            const ctrlStrikes = clamp(3 + Math.round(ctrlDealt / 2.0), 3, 22);
            const otherStrikes = Math.floor(rand(fightId, round, "gndother") * 4);
            if (isControllerPlayer(arch)) {
                strikesP = ctrlStrikes;
                strikesO = otherStrikes;
            } else {
                strikesO = ctrlStrikes;
                strikesP = otherStrikes;
            }
        }

        // ── TAKEDOWNS ────────────────────────────────────────────────────────
        let tdP = 0;
        let tdO = 0;
        if (arch === ARCH.TD_PLAYER) tdP = 1;
        else if (arch === ARCH.TD_OPPONENT) tdO = 1;

        // ── SUB ATTEMPTS ─────────────────────────────────────────────────────
        let subP = 0;
        let subO = 0;
        const subFinish = outcome === "Submission" || outcome === "Loss (submission)";
        if (isTakedown(arch) || isGround(arch)) {
            // controller top-position sub roll (0.30 flat display rate)
            if (rand(fightId, round, "sub:top") < 0.3) {
                if (isControllerPlayer(arch)) subP = 1;
                else subO = 1;
            }
            // bottom guard sub of GROUND_* (0.12)
            if (isGround(arch) && rand(fightId, round, "sub:bottom") < 0.12) {
                if (isControllerPlayer(arch)) subO += 1;
                else subP += 1;
            }
        }
        if (isFinishRound && subFinish) {
            // winner forced ≥1 (and 2 if rand<0.25)
            const winnerIsPlayer = outcome === "Submission";
            const forced = rand(fightId, round, "subforce") < 0.25 ? 2 : 1;
            if (winnerIsPlayer) subP = Math.max(subP, forced);
            else subO = Math.max(subO, forced);
        }
        if (arch === ARCH.STRIKE) {
            subP = 0;
            subO = 0;
        }
        subP = clamp(subP, 0, 2);
        subO = clamp(subO, 0, 2);

        // ── KNOCKDOWNS (event seeds only) ────────────────────────────────────
        // These flags seed the STRIKE-round knockdown EVENTS; the per-round knockdown
        // COUNTERS are derived afterwards by counting emitted knockdown events (single
        // source of truth — counter and event can never disagree). A clean KO finish
        // inserts its own knockdown event via _needsKnockdown; a tko_finish_* inserts
        // none, so its counter is 0.
        let kdP = 0; // player knocked down (seed)
        let kdO = 0; // opponent knocked down (seed)
        if (arch === ARCH.STRIKE) {
            // X knocked down iff dealt-to-X ≥12 AND X crossed below 35 this round.
            const playerCrossed = prevPlayerHealth >= 35 && playerHealth < 35;
            const oppCrossed = prevOppHealth >= 35 && oppHealth < 35;
            const playerKd = dealt_o >= 12 && playerCrossed;
            const oppKd = dealt_p >= 12 && oppCrossed;
            if (playerKd && oppKd) {
                // cap 1/round → higher-damage side
                if (dealt_p >= dealt_o) kdO = 1;
                else kdP = 1;
            } else if (oppKd) {
                kdO = 1;
            } else if (playerKd) {
                kdP = 1;
            }
        }

        // ── DAMAGE (cumulative %) — each side's OFFENSIVE output, so the winner
        //    (who deals more) shows the higher number, consistent with strikes,
        //    the momentum bar, and the round-winner net (dealt_p − dealt_o). ──
        cumP = clamp(cumP + dealt_p, 0, 100);
        cumO = clamp(cumO + dealt_o, 0, 100);
        const damageP = cumP;
        const damageO = cumO;

        // ── CONTROL TIME ─────────────────────────────────────────────────────
        let ctP = 0;
        let ctO = 0;
        if (arch === ARCH.STRIKE) {
            if (campKeys.includes("campClinchControl") && campAllowed("campClinchControl")) {
                ctP = 35 + Math.round((rand(fightId, round, "ct:clinch") - 0.5) * 20);
            }
        } else if (isTakedown(arch)) {
            const v = 170 + Math.round((rand(fightId, round, "ct:td") - 0.5) * 50);
            if (isControllerPlayer(arch)) ctP = v;
            else ctO = v;
        } else if (isGround(arch)) {
            const v = 265 + Math.round((rand(fightId, round, "ct:gnd") - 0.5) * 40);
            if (isControllerPlayer(arch)) ctP = v;
            else ctO = v;
        }

        // ── TIMESTAMPS ───────────────────────────────────────────────────────
        let T_end = 285;
        let T_f = null;
        if (isFinishRound) {
            const loserDealt = outcome === "KO/TKO" || outcome === "Submission" ? dealt_o : dealt_p;
            if (loserDealt >= 20) {
                T_f = 45 + Math.floor(rand(fightId, round, "tf") * 156);
            } else {
                T_f = 45 + Math.floor(rand(fightId, round, "tf") * 226);
            }
            T_end = T_f;
            // scale control time by T_f/300, clamp ≤ T_f-10
            const scale = T_f / 300;
            ctP = Math.min(Math.round(ctP * scale), Math.max(0, T_f - 10));
            ctO = Math.min(Math.round(ctO * scale), Math.max(0, T_f - 10));
        }
        ctP = Math.max(0, ctP);
        ctO = Math.max(0, ctO);

        // ── Position escalation tracking (for continuation rounds) ──────────
        let positionEscalated = null;
        if (isControllerPlayer(arch)) {
            consecutiveControlledByPlayer += 1;
            consecutiveControlledByOpp = 0;
            if (isGround(arch)) {
                if (consecutiveControlledByPlayer === 2) positionEscalated = "half guard";
                else if (consecutiveControlledByPlayer === 3) positionEscalated = "side control";
                else if (consecutiveControlledByPlayer >= 4) positionEscalated = "mount";
                else positionEscalated = "half guard";
            }
        } else if (isControllerOpponent(arch)) {
            consecutiveControlledByOpp += 1;
            consecutiveControlledByPlayer = 0;
            if (isGround(arch)) {
                if (consecutiveControlledByOpp === 2) positionEscalated = "half guard";
                else if (consecutiveControlledByOpp === 3) positionEscalated = "side control";
                else if (consecutiveControlledByOpp >= 4) positionEscalated = "mount";
                else positionEscalated = "half guard";
            }
        } else {
            consecutiveControlledByPlayer = 0;
            consecutiveControlledByOpp = 0;
        }

        // ── ROUND WINNER ─────────────────────────────────────────────────────
        let roundWinner;
        let dominant = false;
        const net = dealt_p - dealt_o + ctrl * 3;
        if (net >= 18) {
            roundWinner = "player";
            dominant = true;
        } else if (net >= 3) {
            roundWinner = "player";
        } else if (net > -3) {
            roundWinner = "even";
        } else if (net > -18) {
            roundWinner = "opponent";
        } else {
            roundWinner = "opponent";
            dominant = true;
        }
        if (isFinishRound) {
            const fightWinner =
                outcome === "KO/TKO" || outcome === "Submission" ? "player" : "opponent";
            roundWinner = fightWinner;
            dominant = true;
        }

        roundStats.push({
            round,
            strikesPlayer: strikesP,
            strikesOpponent: strikesO,
            takedownsPlayer: tdP,
            takedownsOpponent: tdO,
            subAttemptsPlayer: subP,
            subAttemptsOpponent: subO,
            // Overwritten below from the emitted knockdown EVENTS (single source of truth).
            knockdownsPlayer: 0,
            knockdownsOpponent: 0,
            damagePlayer: damageP,
            damageOpponent: damageO,
            controlTimePlayer: ctP,
            controlTimeOpponent: ctO,
            roundWinner,
            dominant,
        });

        // ── EVENT LOG for this round ─────────────────────────────────────────
        // Continuation = control carried from the prior round's takedown (no new TD this
        // round, controller has ≥2 consecutive controlled rounds). Drives the
        // ground_control_carried framing so "0 takedowns + top control" reads coherently.
        const isContinuation =
            isGround(arch) &&
            ((isControllerPlayer(arch) && consecutiveControlledByPlayer >= 2) ||
                (isControllerOpponent(arch) && consecutiveControlledByOpp >= 2));

        const events = buildRoundEvents({
            fightId,
            round,
            arch,
            dealt_p,
            dealt_o,
            campKeys,
            campAllowed,
            CAMP_TEMPLATE,
            subP,
            subO,
            kdP,
            kdO,
            isFinishRound,
            outcome,
            finishCause,
            playerStyle,
            opponentStyle,
            positionEscalated,
            isContinuation,
        });

        // ── KNOCKDOWN COUNTERS derived from emitted events (single source of truth) ──
        // A fighter's "knockdowns" = knockdowns they SCORED (dropped the other fighter),
        // matching MMA stat convention. The knockdown event's actor IS the scorer
        // (actorIsPlayer ⇒ the player dropped the opponent), so count by actor directly.
        let kdScoredByPlayer = 0; // player landed a knockdown → opponent went down
        let kdScoredByOpp = 0; // opponent landed a knockdown → player went down
        for (const e of events) {
            if (e.type !== "knockdown") continue;
            if (e.actorIsPlayer) kdScoredByPlayer = 1;
            else kdScoredByOpp = 1;
        }
        roundStats[roundStats.length - 1].knockdownsPlayer = kdScoredByPlayer;
        roundStats[roundStats.length - 1].knockdownsOpponent = kdScoredByOpp;

        // ── TIMESTAMP SLOTTING ───────────────────────────────────────────────
        const finishEvent = events.find((e) => e.isFinish) || null;
        const nonFinish = events.filter((e) => !e.isFinish);
        const N = nonFinish.length || 1;
        let prevT = -100;
        const slotMax = Math.max(15, T_end - 15);
        for (let k = 0; k < nonFinish.length; k++) {
            let t =
                15 +
                Math.floor(((T_end - 30) * (k + 0.2 + 0.6 * rand(fightId, round, "ts:" + k))) / N);
            if (t < prevT + 10) t = prevT + 10;
            if (t > slotMax && k > 0) {
                // drop trailing filler that would exceed window
                nonFinish.length = k;
                break;
            }
            t = clamp(t, 15, Math.max(15, T_end - 5));
            nonFinish[k]._t = t;
            prevT = t;
        }
        const ordered = nonFinish.slice();
        if (finishEvent) {
            finishEvent._t = T_f != null ? T_f : T_end;
            ordered.push(finishEvent);
        }

        for (const e of ordered) {
            eventLog.push({
                round,
                timestamp: fmtTime(e._t),
                type: e.type,
                actorIsPlayer: e.actorIsPlayer,
                templateKey: e.templateKey,
                vars: {
                    strike: e.vars && e.vars.strike != null ? e.vars.strike : null,
                    sub: e.vars && e.vars.sub != null ? e.vars.sub : null,
                    position: e.vars && e.vars.position != null ? e.vars.position : null,
                    bodyPart: e.vars && e.vars.bodyPart != null ? e.vars.bodyPart : null,
                },
            });
        }
    }

    // ── Intro / result context keys ──────────────────────────────────────────
    const winner = engineResult.winner;
    const giantKiller =
        winner === "player" && (ctx.opponentOvr || 0) - (ctx.playerOvr || 0) >= 8;

    let introTemplateKey;
    if (ctx.isTitle) introTemplateKey = "title";
    else if (ctx.isGrudge) introTemplateKey = "nemesis";
    else if (ctx.comeback) introTemplateKey = "comeback";
    else if (ctx.isCallout) introTemplateKey = "callout";
    else introTemplateKey = "standard";

    let resultContextKey;
    if (ctx.isTitle) resultContextKey = "title";
    else if (ctx.isGrudge) resultContextKey = "nemesis";
    else if (giantKiller) resultContextKey = "giantKiller";
    else if (ctx.comeback) resultContextKey = "comeback";
    else if (ctx.isCallout) resultContextKey = "callout";
    else resultContextKey = "standard";

    return { roundStats, eventLog, introTemplateKey, resultContextKey };
}

function fmtTime(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}

// ── Per-round event candidate builder ────────────────────────────────────────
function buildRoundEvents(o) {
    const {
        fightId,
        round,
        arch,
        dealt_p,
        dealt_o,
        campKeys,
        campAllowed,
        CAMP_TEMPLATE,
        subP,
        subO,
        kdP,
        kdO,
        isFinishRound,
        outcome,
        finishCause,
        playerStyle,
        opponentStyle,
        positionEscalated,
        isContinuation,
    } = o;

    const events = [];
    // Priority: lower number = keep first when trimming to ≤6.
    // camp(0) > knockdown(1) > finish(2) > biggest hurt(3) > td_secured(4) >
    //   td_stuffed(5) > fillers(6)
    const push = (e) => events.push(e);

    const ctrlPlayer = arch === "TD_PLAYER" || arch === "GROUND_PLAYER";
    const ctrlOpp = arch === "TD_OPPONENT" || arch === "GROUND_OPPONENT";
    const ctrlStyle = ctrlPlayer ? playerStyle : opponentStyle;
    const ctrlIsPlayer = ctrlPlayer;

    // Camp events (always highest priority). campBodyShot is special → a strike_body.
    for (const key of campKeys) {
        if (!campAllowed(key)) continue;
        if (key === "campBodyShot") {
            push({
                type: "strike",
                templateKey: "strike_body",
                actorIsPlayer: true,
                priority: 0,
                vars: { strike: "body shot", bodyPart: "body" },
            });
        } else if (CAMP_TEMPLATE[key]) {
            push({
                type: "camp",
                templateKey: CAMP_TEMPLATE[key],
                actorIsPlayer: true,
                priority: 0,
                vars: {},
            });
        }
    }

    if (arch === "STRIKE") {
        const playerLeads = dealt_p >= dealt_o; // higher-dealt side leads (tie→player)
        const leaderIsPlayer = playerLeads;
        const leaderStyle = leaderIsPlayer ? playerStyle : opponentStyle;
        const leaderStrike = pickStrike(leaderStyle, fightId, round, "lead");
        push({
            type: "strike",
            templateKey: "strike_clean",
            actorIsPlayer: leaderIsPlayer,
            priority: 6,
            vars: { strike: leaderStrike, bodyPart: bodyPartFor(leaderStrike, false) },
        });
        const otherDealt = leaderIsPlayer ? dealt_o : dealt_p;
        if (otherDealt >= 3) {
            const otherStyle = leaderIsPlayer ? opponentStyle : playerStyle;
            const st = pickStrike(otherStyle, fightId, round, "other");
            push({
                type: "strike",
                templateKey: "strike_clean",
                actorIsPlayer: !leaderIsPlayer,
                priority: 6,
                vars: { strike: st, bodyPart: bodyPartFor(st, false) },
            });
        }
        // hurt event: actor whose dealt≥10
        if (dealt_p >= 10) {
            const st = pickStrike(playerStyle, fightId, round, "hurtp");
            push({
                type: "strike",
                templateKey: "strike_hurt",
                actorIsPlayer: true,
                priority: 3,
                hurtDealt: dealt_p,
                vars: { strike: st, bodyPart: bodyPartFor(st, false) },
            });
        }
        if (dealt_o >= 10) {
            const st = pickStrike(opponentStyle, fightId, round, "hurto");
            push({
                type: "strike",
                templateKey: "strike_hurt",
                actorIsPlayer: false,
                priority: 3,
                hurtDealt: dealt_o,
                vars: { strike: st, bodyPart: bodyPartFor(st, false) },
            });
        }
        // knockdown
        if (kdO) {
            push({ type: "knockdown", templateKey: "knockdown", actorIsPlayer: true, priority: 1, vars: {} });
        }
        if (kdP) {
            push({ type: "knockdown", templateKey: "knockdown", actorIsPlayer: false, priority: 1, vars: {} });
        }
    } else if (arch === "TD_PLAYER" || arch === "TD_OPPONENT") {
        // optional strike_clean opener (rand<0.5), actor = controller's opponent
        if (rand(fightId, round, "tdopen") < 0.5) {
            const openerStyle = ctrlIsPlayer ? opponentStyle : playerStyle;
            const st = pickStrike(openerStyle, fightId, round, "tdopenstr");
            push({
                type: "strike",
                templateKey: "strike_clean",
                actorIsPlayer: !ctrlIsPlayer,
                priority: 6,
                vars: { strike: st, bodyPart: bodyPartFor(st, false) },
            });
        }
        push({
            type: "takedown",
            templateKey: "takedown_secured",
            actorIsPlayer: ctrlIsPlayer,
            priority: 4,
            vars: { strike: takedownVar(ctrlStyle, fightId, round, "tdv"), position: "top control" },
        });
        const ctrlDealt = ctrlIsPlayer ? dealt_p : dealt_o;
        if (ctrlDealt >= 5) {
            push({
                type: "ground",
                templateKey: "ground_pound",
                actorIsPlayer: ctrlIsPlayer,
                priority: 6,
                vars: { position: "top control" },
            });
        }
        // submission attempts (per derivation)
        addSubEvents(push, { fightId, round, arch, subP, subO, ctrlIsPlayer, ctrlStyle, playerStyle, opponentStyle, positionEscalated });
    } else if (arch === "GROUND_PLAYER" || arch === "GROUND_OPPONENT") {
        // Continuation round (control carried from a prior takedown) — open with a
        // carried-control beat so "0 takedowns + top control" reads coherently. The
        // takedown itself happened in the previous round (the 0-TD stat is correct).
        if (isContinuation) {
            push({
                type: "ground",
                templateKey: "ground_control_carried",
                actorIsPlayer: ctrlIsPlayer,
                priority: 5,
                vars: { position: positionEscalated || "half guard" },
            });
        }
        push({
            type: "ground",
            templateKey: "ground_pound",
            actorIsPlayer: ctrlIsPlayer,
            priority: 6,
            vars: { position: positionEscalated || "half guard" },
        });
        const ctrlDealt = ctrlIsPlayer ? dealt_p : dealt_o;
        if (ctrlDealt >= 14) {
            push({
                type: "ground",
                templateKey: "ground_pound",
                actorIsPlayer: ctrlIsPlayer,
                priority: 6,
                vars: { position: positionEscalated || "half guard" },
            });
        }
        addSubEvents(push, { fightId, round, arch, subP, subO, ctrlIsPlayer, ctrlStyle, playerStyle, opponentStyle, positionEscalated });
    }

    // ── Finish event ──────────────────────────────────────────────────────────
    if (isFinishRound) {
        const finishEvt = buildFinishEvent({
            outcome,
            finishCause,
            arch,
            dealt_p,
            dealt_o,
            events,
            playerStyle,
            opponentStyle,
            fightId,
            round,
        });
        if (finishEvt) {
            // KO insertion: if ko_finish and no knockdown present, insert one before.
            if (finishEvt._needsKnockdown) {
                const hasKd = events.some((e) => e.templateKey === "knockdown");
                if (!hasKd) {
                    push({
                        type: "knockdown",
                        templateKey: "knockdown",
                        actorIsPlayer: finishEvt.actorIsPlayer,
                        priority: 1,
                        vars: {},
                    });
                }
            }
            // Guard-sub upset: insert submission_attempt (off the back) before finish.
            if (finishEvt._needsGuardSubAttempt) {
                push({
                    type: "submission",
                    templateKey: "submission_attempt",
                    actorIsPlayer: finishEvt.actorIsPlayer,
                    priority: 2,
                    vars: {
                        sub: pickSub(
                            finishEvt.actorIsPlayer ? playerStyle : opponentStyle,
                            "guard",
                            fightId,
                            round,
                            "guardsub"
                        ),
                        position: "off the back",
                    },
                });
            }
            delete finishEvt._needsKnockdown;
            delete finishEvt._needsGuardSubAttempt;
            push(finishEvt);
        }
    }

    // ── Pad to ≥3 (strike_clean fillers, actor alternates, higher-dealt first) ──
    let guard = 0;
    const higherIsPlayer = dealt_p >= dealt_o;
    while (events.length < 3 && guard < 6) {
        const actorIsPlayer = guard % 2 === 0 ? higherIsPlayer : !higherIsPlayer;
        const st = pickStrike(actorIsPlayer ? playerStyle : opponentStyle, fightId, round, "pad" + guard);
        push({
            type: "strike",
            templateKey: "strike_clean",
            actorIsPlayer,
            priority: 6,
            vars: { strike: st, bodyPart: bodyPartFor(st, false) },
        });
        guard++;
    }

    // ── Trim to ≤6 by priority (keep lowest priority number), preserving order ──
    // INVARIANT: the finish event (if any) ALWAYS survives and stays last in its round.
    if (events.length > 6) {
        const indexed = events.map((e, idx) => ({ e, idx }));
        indexed.sort((a, b) => {
            if (a.e.priority !== b.e.priority) return a.e.priority - b.e.priority;
            // hurt: bigger dealt wins within same priority
            const ah = a.e.hurtDealt || 0;
            const bh = b.e.hurtDealt || 0;
            if (ah !== bh) return bh - ah;
            return a.idx - b.idx;
        });
        const keep = new Set(indexed.slice(0, 6).map((x) => x.idx));
        // Force-keep the finish event even if priority pushed it past the cut.
        events.forEach((e, idx) => { if (e.isFinish) keep.add(idx); });
        // If forcing the finish over the cap, drop the lowest-priority non-finish to stay ≤6.
        if (keep.size > 6) {
            const droppable = indexed.filter((x) => keep.has(x.idx) && !x.e.isFinish);
            // droppable is priority-ascending; remove from the END (lowest priority) until ≤6.
            for (let k = droppable.length - 1; k >= 0 && keep.size > 6; k--) {
                keep.delete(droppable[k].idx);
            }
        }
        return events.filter((_, idx) => keep.has(idx));
    }
    return events;
}

function addSubEvents(push, o) {
    const { fightId, round, arch, subP, subO, ctrlIsPlayer, ctrlStyle, playerStyle, opponentStyle } = o;
    // Top-control sub by controller.
    const ctrlSubs = ctrlIsPlayer ? subP : subO;
    const bottomSubs = ctrlIsPlayer ? subO : subP;
    // Controller's top sub(s) — derived sub belongs to the controller's side (sub:top).
    // We emit at most controller's count from the top, bottom guard goes to "off the back".
    // Reconstruct: top attempts = controller side count attributable to "sub:top" roll;
    // bottom attempts (GROUND_*) → other side, position "off the back".
    if (ctrlSubs > 0) {
        push({
            type: "submission",
            templateKey: "submission_attempt",
            actorIsPlayer: ctrlIsPlayer,
            priority: 6,
            vars: {
                sub: pickSub(ctrlStyle, "top", fightId, round, "topsub"),
                position: "top control",
            },
        });
    }
    if (bottomSubs > 0 && (arch === "GROUND_PLAYER" || arch === "GROUND_OPPONENT")) {
        const bottomIsPlayer = !ctrlIsPlayer;
        push({
            type: "submission",
            templateKey: "submission_attempt",
            actorIsPlayer: bottomIsPlayer,
            priority: 6,
            vars: {
                sub: pickSub(bottomIsPlayer ? playerStyle : opponentStyle, "guard", fightId, round, "botsub"),
                position: "off the back",
            },
        });
    }
}

// Ground-finish flavor "strike" var (single source of truth for the result line).
function pickGroundFinishStrike(style, fightId, round, slot) {
    const opts = ["ground and pound", "elbows", "hammerfists"];
    const idx = Math.floor(rand(fightId, round, slot) * opts.length);
    return opts[clamp(idx, 0, opts.length - 1)];
}

function buildFinishEvent(o) {
    const { outcome, finishCause, arch, dealt_p, dealt_o, fightId, round } = o;

    if (outcome === "Submission" || outcome === "Loss (submission)") {
        const actorIsPlayer = outcome === "Submission";
        // submission_finish keeps vars.sub and gets NO strike.
        const ev = {
            type: "finish",
            templateKey: "submission_finish",
            actorIsPlayer,
            isFinish: true,
            priority: 2,
            vars: {
                strike: null,
                sub: pickSub(
                    actorIsPlayer ? o.playerStyle : o.opponentStyle,
                    "top",
                    fightId,
                    round,
                    "subfin"
                ),
                position: "top control",
            },
        };
        // Guard-sub upset: loss-by-submission in a round the player controlled (or mirror)
        // — actor follows outcome even though the OTHER side controlled. Insert a guard
        // submission_attempt before the finish.
        const controllerIsPlayer = arch === "TD_PLAYER" || arch === "GROUND_PLAYER";
        const controllerIsOpp = arch === "TD_OPPONENT" || arch === "GROUND_OPPONENT";
        if ((controllerIsPlayer && !actorIsPlayer) || (controllerIsOpp && actorIsPlayer)) {
            ev._needsGuardSubAttempt = true;
            ev.vars.position = "off the back";
        }
        return ev;
    }

    if (outcome === "KO/TKO" || outcome === "Loss (KO/TKO)") {
        const actorIsPlayer = outcome === "KO/TKO";
        const winnerStyle = actorIsPlayer ? o.playerStyle : o.opponentStyle;
        const dealtToLoser = actorIsPlayer ? dealt_p : dealt_o; // damage onto the loser

        const isGroundArch =
            arch === "TD_PLAYER" || arch === "TD_OPPONENT" ||
            arch === "GROUND_PLAYER" || arch === "GROUND_OPPONENT";

        // Choose the finish key:
        //  - ground/takedown finishing round → tko_finish_ground
        //  - STRIKE round → ko_finish when the engine reports a clean KO, else
        //    tko_finish_strike (exhaustion/accumulation). Fall back to a damage
        //    heuristic only when finishCause is absent (legacy engine results).
        let templateKey;
        let strikeVar;
        if (isGroundArch) {
            templateKey = "tko_finish_ground";
            strikeVar = pickGroundFinishStrike(winnerStyle, fightId, round, "gndfin");
        } else {
            let cleanKo;
            if (finishCause === "ko") cleanKo = true;
            else if (finishCause === "tko") cleanKo = false;
            else cleanKo = dealtToLoser >= 12; // legacy fallback
            templateKey = cleanKo ? "ko_finish" : "tko_finish_strike";
            strikeVar = pickStrike(winnerStyle, fightId, round, "kofin");
        }

        const ev = {
            type: "finish",
            templateKey,
            actorIsPlayer,
            isFinish: true,
            priority: 2,
            // (T)KO finishes carry vars.strike, never vars.sub.
            vars: {
                strike: strikeVar,
                sub: null,
                bodyPart: bodyPartFor(strikeVar, false),
            },
        };
        // A clean KO must show a knockdown — insert the event if absent (counter then = 1).
        if (templateKey === "ko_finish") ev._needsKnockdown = true;
        return ev;
    }
    return null;
}

module.exports = { deriveFightDetails, rand, classify };
