/**
 * Picks a random fight commentary line for a given event/outcome key.
 * Supports {{playerName}} and {{opponentName}} placeholders.
 */
const path = require("path");
const fs = require("fs");

let _commentary = null;

function loadCommentary() {
    if (_commentary) return _commentary;
    const filePath = path.join(__dirname, "..", "data", "fightCommentary.json");
    const raw = fs.readFileSync(filePath, "utf8");
    _commentary = JSON.parse(raw);
    return _commentary;
}

function substituteNames(line, playerName = "Your fighter", opponentName = "Opponent") {
    if (!line || typeof line !== "string") return line;
    return line
        .replace(/\{\{playerName\}\}/g, playerName)
        .replace(/\{\{opponentName\}\}/g, opponentName);
}

/**
 * @param {string} key - Key in fightCommentary.json (e.g. strikingExchange, koFinish)
 * @param {string} [playerName] - Display name for the player's fighter
 * @param {string} [opponentName] - Display name for the opponent
 * @returns {string} Random line for that key, with names substituted
 */
function getLine(key, playerName, opponentName) {
    const data = loadCommentary();
    const arr = data[key];
    if (!Array.isArray(arr) || arr.length === 0) return `[${key}]`;
    const line = arr[Math.floor(Math.random() * arr.length)];
    return substituteNames(line, playerName, opponentName);
}

function getCommentaryLine(key, playerName, opponentName) {
    return getLine(key, playerName, opponentName);
}

/**
 * Get the final result line (who won/lost or draw).
 * @param {"player"|"opponent"|"draw"} winner
 * @param {string} outcome - e.g. "KO/TKO", "Decision (unanimous)", "Draw"
 * @param {string} playerName
 * @param {string} opponentName
 */
function getResultLine(winner, outcome, playerName, opponentName) {
    const data = loadCommentary();
    const method = outcome
        .replace(/^Loss \(decision\)$/, "decision")
        .replace(/^Loss \(KO\/TKO\)$/, "KO/TKO")
        .replace(/^Loss \(submission\)$/, "submission")
        .replace(/^Decision \(unanimous\)$/, "unanimous decision")
        .replace(/^Decision \(split\)$/, "split decision");
    if (winner === "draw") {
        const arr = data.resultDraw;
        const line = (Array.isArray(arr) && arr.length) ? arr[Math.floor(Math.random() * arr.length)] : `Draw: ${playerName} vs ${opponentName}.`;
        return substituteNames(line, playerName, opponentName);
    }
    const winnerName = winner === "player" ? playerName : opponentName;
    const loserName = winner === "player" ? opponentName : playerName;
    const arr = winner === "player" ? data.resultWinner : data.resultLoser;
    const line = (Array.isArray(arr) && arr.length) ? arr[Math.floor(Math.random() * arr.length)] : `${winnerName} defeats ${loserName} by ${method}.`;
    return line
        .replace(/\{\{winnerName\}\}/g, winnerName)
        .replace(/\{\{loserName\}\}/g, loserName)
        .replace(/\{\{playerName\}\}/g, playerName)
        .replace(/\{\{opponentName\}\}/g, opponentName)
        .replace(/\{\{method\}\}/g, method);
}

module.exports = { getLine, getCommentaryLine, getResultLine, loadCommentary, substituteNames };
