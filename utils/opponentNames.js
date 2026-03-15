/**
 * Generate random NPC fighter names from data/opponentNames.json.
 * Returns { name: "FirstName LastName", nickname: string|null }.
 */
const path = require("path");
const fs = require("fs");

let _data = null;

function loadNames() {
    if (_data) return _data;
    const filePath = path.join(__dirname, "..", "data", "opponentNames.json");
    const raw = fs.readFileSync(filePath, "utf8");
    _data = JSON.parse(raw);
    return _data;
}

function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random full name and optional nickname.
 * @param {boolean} [includeNickname=true] - If true, ~40% chance of a nickname
 * @returns {{ name: string, nickname: string|null }}
 */
function generateOpponentName(includeNickname = true) {
    const data = loadNames();
    const first = pickRandom(data.firstNames) || "Fighter";
    const last = pickRandom(data.lastNames) || "Unknown";
    const name = `${first} ${last}`;
    const nickname = includeNickname && Math.random() < 0.4 ? pickRandom(data.nicknames) : null;
    return { name, nickname };
}

module.exports = { loadNames, generateOpponentName, pickRandom };
