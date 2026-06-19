/**
 * Profanity filter for player-entered, player-visible text — fighter first/last
 * name and nickname. Backend-authoritative (the frontend may mirror the error,
 * but this is the gate).
 *
 * Strategy (names are short and shown to ALL players on ladders/gazette/HoF):
 *  - COMMON list  → matched as whole WORDS only, so real surnames are safe
 *    ("Dickson" tokenises to "dickson", not "dick"; "Hancock" ≠ "cock").
 *  - SEVERE list  → slurs, matched as whole words AND as a substring of the
 *    fully-collapsed string, to defeat spaced/leet evasion ("n i g g e r",
 *    "f4g"). This can rarely flag a real surname (e.g. "Fagan", "Dyke"); that
 *    trade-off is intentional for slurs. Both lists live here and are easy to edit.
 *
 * Normalisation maps common leetspeak so "$h1t" / "f u c k" are caught.
 */

const LEET = {
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
    "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i",
};

// Mild/common profanity — WHOLE-WORD match only (surname-safe).
const COMMON = [
    "fuck", "fuk", "fck", "shit", "sht", "bitch", "biatch", "cunt", "asshole",
    "arsehole", "bastard", "dick", "dickhead", "pussy", "cock", "whore", "slut",
    "wanker", "bollocks", "prick", "twat", "douche", "motherfucker", "bullshit",
    "dumbass", "jackass", "ass", "arse", "piss", "bellend", "knob", "minge",
    "caca", "poop", "turd",
];

// Slurs / severe — WHOLE-WORD *and* collapsed-substring match (evasion-resistant).
const SEVERE = [
    "nigger", "nigga", "faggot", "fag", "retard", "spic", "chink", "kike",
    "wetback", "tranny", "coon", "paki", "dyke", "gook", "wop", "beaner",
    "raghead", "shemale",
];

function leetMap(s) {
    return String(s || "").toLowerCase().split("").map((ch) => LEET[ch] ?? ch).join("");
}

// Whole-word tokens after leet mapping (split on anything non-letter).
function tokenize(s) {
    return leetMap(s).split(/[^a-z]+/).filter(Boolean);
}

// Letters-only collapsed form ("f u c k" -> "fuck", "f4g" -> "fag").
function collapse(s) {
    return leetMap(s).replace(/[^a-z]/g, "");
}

/** True if the text contains disallowed language. */
function containsProfanity(text) {
    if (!text) return false;
    const toks = tokenize(text);
    if (toks.some((t) => COMMON.includes(t) || SEVERE.includes(t))) return true;
    const flat = collapse(text);
    if (SEVERE.some((w) => flat.includes(w))) return true;
    // Spaced/punctuated evasion of common words ("f u c k", "s.h.i.t"): only when
    // the text is mostly single characters (so real surnames like "Cockburn" —
    // one token, no single-char letters — are never collapse-matched here).
    const singles = toks.filter((t) => t.length === 1).length;
    if (singles >= 2 && COMMON.some((w) => flat.includes(w))) return true;
    return false;
}

/**
 * Throw a 400-tagged error if `text` is profane. `label` names the field for the
 * user-facing message (e.g. "First name", "Nickname").
 */
function assertCleanName(text, label) {
    if (containsProfanity(text)) {
        const err = new Error(`${label} contains language that isn't allowed. Please choose another.`);
        err.statusCode = 400;
        err.validation = true;
        throw err;
    }
}

module.exports = { containsProfanity, assertCleanName };
