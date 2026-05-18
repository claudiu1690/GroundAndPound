/**
 * Fight commentary engine.
 *
 * Lines live in data/fightCommentary.json, grouped by event key. Each line is an
 * object { t, req } — `t` is the text (supports {{playerName}}, {{opponentName}},
 * {{round}}, {{winnerName}}, {{loserName}}, {{method}} placeholders) and `req` is an
 * optional list of tags that must ALL be active in the current fight for the line to
 * be eligible. Lines with no `req` are generic and always eligible.
 *
 * Selection filters the pool to eligible lines for the active tag set, favours more
 * specific (tagged) lines, and avoids repeating a line within the same fight.
 *
 * Legacy plain-string lines are still accepted so old data shapes don't break.
 */
const path = require("path");
const fs = require("fs");

let _commentary = null;

function loadCommentary() {
    if (_commentary) return _commentary;
    const filePath = path.join(__dirname, "..", "data", "fightCommentary.json");
    _commentary = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return _commentary;
}

function substitute(line, vars = {}) {
    if (!line || typeof line !== "string") return line;
    return line
        .replace(/\{\{playerName\}\}/g, vars.playerName ?? "Your fighter")
        .replace(/\{\{opponentName\}\}/g, vars.opponentName ?? "Opponent")
        .replace(/\{\{winnerName\}\}/g, vars.winnerName ?? "")
        .replace(/\{\{loserName\}\}/g, vars.loserName ?? "")
        .replace(/\{\{method\}\}/g, vars.method ?? "")
        .replace(/\{\{round\}\}/g, vars.round != null ? String(vars.round) : "")
        .replace(/%d/g, vars.round != null ? String(vars.round) : "%d");
}

/** Normalise a category entry to { t, req }. Accepts legacy plain strings. */
function normalizeLine(entry) {
    if (typeof entry === "string") return { t: entry, req: [] };
    if (!entry || typeof entry !== "object") return { t: "", req: [] };
    return {
        t: entry.t ?? entry.text ?? "",
        req: Array.isArray(entry.req) ? entry.req : [],
    };
}

/**
 * Pick a commentary line for `key`, honouring requirement tags and avoiding repeats.
 *
 * @param {string} key - Category key in fightCommentary.json
 * @param {object} [opts]
 * @param {Set<string>|string[]} [opts.tags]   - Active fight tags
 * @param {Set<string>}          [opts.recent] - Lines already used this fight (mutated)
 * @param {object}               [opts.vars]   - Placeholder substitution values
 * @returns {string|null} The chosen line, or null if the key has no usable lines.
 */
function pickLine(key, opts = {}) {
    const data = loadCommentary();
    const arr = data[key];
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const tags = opts.tags instanceof Set ? opts.tags : new Set(opts.tags || []);
    const recent = opts.recent instanceof Set ? opts.recent : null;

    const lines = arr.map(normalizeLine).filter((l) => l.t);
    if (lines.length === 0) return null;

    // Eligible = every required tag is active. Fall back to the full pool if nothing matches.
    let eligible = lines.filter((l) => l.req.every((tag) => tags.has(tag)));
    if (eligible.length === 0) eligible = lines;

    // Avoid repeating a line within the same fight, unless that would empty the pool.
    if (recent) {
        const fresh = eligible.filter((l) => !recent.has(l.t));
        if (fresh.length > 0) eligible = fresh;
    }

    // Weighted pick — more specific (more required tags) lines surface more often
    // when they're eligible, but generic lines still appear regularly.
    const weighted = eligible.map((l) => ({ l, w: 1 + 3 * l.req.length }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let roll = Math.random() * total;
    let chosen = weighted[weighted.length - 1].l;
    for (const x of weighted) {
        roll -= x.w;
        if (roll <= 0) { chosen = x.l; break; }
    }

    if (recent) recent.add(chosen.t);
    return substitute(chosen.t, opts.vars || {});
}

/**
 * Get a commentary line for an event key.
 * Legacy signature: getLine(key, playerName, opponentName)
 * New signature:    getLine(key, { tags, recent, vars })
 */
function getLine(key, a, b) {
    if (a && typeof a === "object") return pickLine(key, a);
    return pickLine(key, { vars: { playerName: a, opponentName: b } });
}

function getCommentaryLine(key, a, b) {
    return getLine(key, a, b);
}

/**
 * Get the final result line (who won/lost or draw).
 * Legacy signature: getResultLine(winner, outcome, playerName, opponentName)
 * New signature:    getResultLine(winner, outcome, { tags, recent, vars })
 *
 * @param {"player"|"opponent"|"draw"} winner
 * @param {string} outcome - e.g. "KO/TKO", "Decision (unanimous)", "Draw"
 */
function getResultLine(winner, outcome, a, b) {
    const opts = (a && typeof a === "object") ? a : { vars: { playerName: a, opponentName: b } };
    const vars = { ...(opts.vars || {}) };
    const playerName = vars.playerName ?? "Your fighter";
    const opponentName = vars.opponentName ?? "Opponent";
    const method = (outcome || "")
        .replace(/^Loss \(decision\)$/, "decision")
        .replace(/^Loss \(KO\/TKO\)$/, "KO/TKO")
        .replace(/^Loss \(submission\)$/, "submission")
        .replace(/^Submission$/, "submission")
        .replace(/^Decision \(unanimous\)$/, "unanimous decision")
        .replace(/^Decision \(split\)$/, "split decision");
    vars.method = method;

    if (winner === "draw") {
        return pickLine("resultDraw", { ...opts, vars })
            || `Draw: ${playerName} vs ${opponentName}.`;
    }

    const winnerName = winner === "player" ? playerName : opponentName;
    const loserName = winner === "player" ? opponentName : playerName;
    vars.winnerName = winnerName;
    vars.loserName = loserName;
    const key = winner === "player" ? "resultWinner" : "resultLoser";
    return pickLine(key, { ...opts, vars })
        || `${winnerName} defeats ${loserName} by ${method}.`;
}

function substituteNames(line, playerName, opponentName) {
    return substitute(line, { playerName, opponentName });
}

module.exports = {
    getLine,
    getCommentaryLine,
    getResultLine,
    pickLine,
    loadCommentary,
    substitute,
    substituteNames,
};
