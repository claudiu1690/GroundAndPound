/**
 * Sponsor clauses — each clause defines how a fight outcome feeds the contract's progress,
 * whether the clause is satisfied (complete), or immediately broken.
 *
 * `evaluate(state)` returns one of: "active" | "complete" | "broken"
 * where `state` is { progress, fightOutcome, contract }.
 *
 * Progress is incremented in the service by calling `applyFightToProgress` before `evaluate`.
 * Keep pure — no mongoose, no network.
 */

/** Win-method categories derived from fightService outcomes */
function classifyOutcome(outcome) {
    if (outcome === "KO/TKO")               return { isWin: true,  method: "KO" };
    if (outcome === "Submission")            return { isWin: true,  method: "SUB" };
    if (outcome === "Decision (unanimous)")  return { isWin: true,  method: "DEC" };
    if (outcome === "Decision (split)")      return { isWin: true,  method: "DEC" };
    if (outcome === "Draw")                  return { isWin: false, method: "DRAW" };
    if (outcome === "Loss (decision)")       return { isWin: false, method: "LOSS_DEC" };
    if (outcome === "Loss (KO/TKO)")         return { isWin: false, method: "LOSS_KO" };
    if (outcome === "Loss (submission)")     return { isWin: false, method: "LOSS_SUB" };
    return { isWin: false, method: "UNKNOWN" };
}

/**
 * Clause definitions. Every clause has:
 *   - describe(params) → human-readable clause text
 *   - apply(progress, ctx) → mutate progress in place based on the fight
 *   - evaluate(progress, params) → "active" | "complete" | "broken"
 */
const CLAUSE_TYPES = {
    /** Win the next N fights (any method). Loss or draw breaks. */
    WIN_NEXT_N: {
        describe: (p) => `Win your next ${p.n} fight${p.n === 1 ? "" : "s"}.`,
        apply: (progress, ctx) => {
            const c = classifyOutcome(ctx.outcome);
            progress.fights = (progress.fights || 0) + 1;
            if (c.isWin) progress.wins = (progress.wins || 0) + 1;
        },
        evaluate: (progress, p) => {
            if (progress.fights > progress.wins) return "broken"; // any loss/draw
            if ((progress.wins || 0) >= p.n) return "complete";
            return "active";
        },
        progressLabel: (progress, p) => `${progress.wins || 0} / ${p.n} wins`,
    },

    /** Get N finishes (KO or Sub) in the next N fights. Any loss breaks. */
    FINISH_NEXT_N: {
        describe: (p) => `Finish your next ${p.n} fight${p.n === 1 ? "" : "s"} (KO or Sub).`,
        apply: (progress, ctx) => {
            const c = classifyOutcome(ctx.outcome);
            progress.fights = (progress.fights || 0) + 1;
            if (c.isWin && (c.method === "KO" || c.method === "SUB")) {
                progress.finishes = (progress.finishes || 0) + 1;
            }
        },
        evaluate: (progress, p) => {
            if (progress.fights > (progress.finishes || 0)) return "broken";
            if ((progress.finishes || 0) >= p.n) return "complete";
            return "active";
        },
        progressLabel: (progress, p) => `${progress.finishes || 0} / ${p.n} finishes`,
    },

    /** Win any N fights — losses allowed but count against duration. */
    WIN_ANY_N: {
        describe: (p) => `Win ${p.n} fight${p.n === 1 ? "" : "s"} before the contract runs out.`,
        apply: (progress, ctx) => {
            const c = classifyOutcome(ctx.outcome);
            progress.fights = (progress.fights || 0) + 1;
            if (c.isWin) progress.wins = (progress.wins || 0) + 1;
        },
        evaluate: (progress, p) => {
            if ((progress.wins || 0) >= p.n) return "complete";
            return "active";
        },
        progressLabel: (progress, p) => `${progress.wins || 0} / ${p.n} wins`,
    },

    /** Score at least 1 KO in any of the next N fights. */
    LAND_ONE_KO: {
        describe: (p) => `Win by KO at least once in your next ${p.n} fight${p.n === 1 ? "" : "s"}.`,
        apply: (progress, ctx) => {
            const c = classifyOutcome(ctx.outcome);
            progress.fights = (progress.fights || 0) + 1;
            if (c.isWin && c.method === "KO") {
                progress.kos = (progress.kos || 0) + 1;
            }
        },
        evaluate: (progress, p) => {
            if ((progress.kos || 0) >= 1) return "complete";
            if ((progress.fights || 0) >= p.n) return "broken";
            return "active";
        },
        progressLabel: (progress, p) => `${progress.kos || 0} KO (fight ${progress.fights || 0}/${p.n})`,
    },

    /** Don't miss weight across the next N fights. */
    NO_WEIGHT_MISS: {
        describe: (p) => `Make weight for the next ${p.n} fight${p.n === 1 ? "" : "s"}.`,
        apply: (progress, ctx) => {
            progress.fights = (progress.fights || 0) + 1;
            if (ctx.weightMissed) progress.misses = (progress.misses || 0) + 1;
        },
        evaluate: (progress, p) => {
            if ((progress.misses || 0) > 0) return "broken";
            if ((progress.fights || 0) >= p.n) return "complete";
            return "active";
        },
        progressLabel: (progress, p) => `${progress.fights || 0} / ${p.n} on weight`,
    },

    /** Don't lose by finish (KO or Sub) across the next N fights. Decision losses ok. */
    NO_FINISH_LOSS: {
        describe: (p) => `Don't get finished (KO/Sub) in your next ${p.n} fight${p.n === 1 ? "" : "s"}.`,
        apply: (progress, ctx) => {
            const c = classifyOutcome(ctx.outcome);
            progress.fights = (progress.fights || 0) + 1;
            if (c.method === "LOSS_KO" || c.method === "LOSS_SUB") {
                progress.finishLosses = (progress.finishLosses || 0) + 1;
            }
        },
        evaluate: (progress, p) => {
            if ((progress.finishLosses || 0) > 0) return "broken";
            if ((progress.fights || 0) >= p.n) return "complete";
            return "active";
        },
        progressLabel: (progress, p) => `${progress.fights || 0} / ${p.n} without finish loss`,
    },
};

/** Returns true when a clause type key is recognised. */
function clauseTypeExists(type) {
    return Object.prototype.hasOwnProperty.call(CLAUSE_TYPES, type);
}

/** Apply a fight to the progress of a given clause (pure). */
function applyFightToProgress(clauseType, progress, ctx) {
    const def = CLAUSE_TYPES[clauseType];
    if (!def) return progress;
    const next = { ...(progress || {}) };
    def.apply(next, ctx);
    return next;
}

function evaluateClause(clauseType, progress, params) {
    const def = CLAUSE_TYPES[clauseType];
    if (!def) return "broken";
    return def.evaluate(progress || {}, params || {});
}

function describeClause(clauseType, params) {
    const def = CLAUSE_TYPES[clauseType];
    if (!def) return "Unknown clause";
    return def.describe(params || {});
}

function describeProgress(clauseType, progress, params) {
    const def = CLAUSE_TYPES[clauseType];
    if (!def) return "";
    return def.progressLabel(progress || {}, params || {});
}

module.exports = {
    CLAUSE_TYPES,
    clauseTypeExists,
    applyFightToProgress,
    evaluateClause,
    describeClause,
    describeProgress,
    classifyOutcome,
};
