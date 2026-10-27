/**
 * Shared nickname rules for every path that writes Fighter.nickname from player
 * input: character creation (fighterService.createFighter, reached from
 * POST /fighters, /auth/register and /auth/guest), PUT /fighters/:id and the
 * Account tab's PATCH /account/:id/nickname (accountService.changeNickname).
 *
 * One home for the rules so no path can accept a nickname another path would
 * reject. The rule is the one players already know from the Account tab:
 * 2 to 20 characters, letters, numbers, spaces, hyphens and apostrophes.
 * Messages are player-readable and safe to return as-is.
 */
const { assertCleanName } = require("./profanity");

const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;
const NICKNAME_PATTERN = /^[a-zA-Z0-9\-' ]+$/;

/**
 * Validate a raw nickname.
 *
 * - non-string: invalid
 * - trimmed; empty after trim: ok with value null (no nickname / clear it)
 * - NICKNAME_MIN..NICKNAME_MAX characters after trim
 * - letters, digits, space, apostrophe, hyphen only (no periods, accents or emoji)
 * - no double spaces
 * - profanity gate (utils/profanity.js assertCleanName)
 *
 * @param {unknown} raw
 * @returns {{ ok: true, value: string|null } | { ok: false, message: string }}
 */
function validateNickname(raw) {
    if (typeof raw !== "string") {
        return { ok: false, message: "Nickname must be text." };
    }
    const nickname = raw.trim();
    if (nickname === "") return { ok: true, value: null };
    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
        return { ok: false, message: `Nickname must be ${NICKNAME_MIN} to ${NICKNAME_MAX} characters.` };
    }
    if (!NICKNAME_PATTERN.test(nickname)) {
        return { ok: false, message: "Nickname can only use letters, numbers, spaces, hyphens and apostrophes." };
    }
    if (nickname.includes("  ")) {
        return { ok: false, message: "Nickname can't contain double spaces." };
    }
    try {
        assertCleanName(nickname, "Nickname");
    } catch (err) {
        return { ok: false, message: err.message };
    }
    return { ok: true, value: nickname };
}

module.exports = { validateNickname, NICKNAME_MIN, NICKNAME_MAX };
