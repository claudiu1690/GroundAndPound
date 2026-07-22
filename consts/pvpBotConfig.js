/**
 * Ground & Pound — PVP ladder bot activity config (single source of truth).
 *
 * Bots are non-account Fighters (isPvpBot:true) that attack the ladder on a slow,
 * human-looking cadence: roughly once every 30-48h, jittered, and always inside a
 * per-bot 4-hour UTC "band" so each bot reads like a person with a routine rather
 * than a cron job.
 *
 * Everything here is a knob. The ONLY derived value is BOT_MAX_DP — see below.
 */

const { divisionFloor } = require("./pvpConfig");

// Base cadence per bot (a fixed value in this range is stored on PvpBotState.baseIntervalHours).
const BOT_INTERVAL_MIN_HOURS = 30;
const BOT_INTERVAL_MAX_HOURS = 48;

// ±20% jitter applied to the base interval on EVERY reschedule, so a bot never fires
// on a perfectly repeating clock.
const BOT_JITTER_PCT = 0.20;

// Width (hours) of a bot's personal activity band. computeNext snaps the jittered
// target time into [hourBandStart, hourBandStart + BOT_HOUR_BAND_WIDTH) UTC.
const BOT_HOUR_BAND_WIDTH = 4;

// When a bot can't fight (no opponents, error, protected pool, season down), we push it
// out by this much rather than retrying in a hot loop.
const BOT_SKIP_RETRY_HOURS = 1;

// A bot will not attack the SAME defender twice inside this window. Keeps bots from
// farming one human and from stacking the weekly repeat penalty.
const BOT_SAME_DEFENDER_COOLDOWN_DAYS = 7;

/**
 * Hard DP ceiling for a bot. DERIVED — one below the elite floor, so a bot can climb
 * the whole Challenger division but can NEVER promote into Elite (the divisions that
 * carry belts, top rewards and Hall of Fame are reserved for real players).
 *
 * DO NOT hardcode this to 2499. It must track consts/pvpConfig.DIVISIONS: if the elite
 * floor is ever retuned, a literal silently becomes wrong and bots start promoting into
 * (or getting stranded below) a division that no longer exists where the literal said.
 */
const BOT_MAX_DP = divisionFloor("elite") - 1;

module.exports = {
    BOT_INTERVAL_MIN_HOURS,
    BOT_INTERVAL_MAX_HOURS,
    BOT_JITTER_PCT,
    BOT_HOUR_BAND_WIDTH,
    BOT_SKIP_RETRY_HOURS,
    BOT_SAME_DEFENDER_COOLDOWN_DAYS,
    BOT_MAX_DP,
};
