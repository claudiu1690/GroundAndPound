/**
 * Ground & Pound — PVP ladder bot activity orchestrator.
 *
 * PURE ORCHESTRATION. There is NO fight logic in this file and there must never be.
 * A bot attacks through pvpFightService.resolveFight — the EXACT same entry point a
 * human's POST hits — so bot fights and human fights can never drift apart in DP,
 * energy, injuries, rivalry, feed or fight-doc shape. The only bot-specific behavior
 * (DP ceiling, no badges, no stat XP) lives inside pvpFightService, keyed off the
 * DB-loaded `isPvpBot` flag, not off anything this service passes.
 *
 * Cadence: an hourly BullMQ tick (modules/scheduler.js) claims every bot whose
 * nextActivityAt has passed and gives it EXACTLY ONE fight. Never a burst.
 *
 * Silence: every skip path here is console-only. Bots never write activity-feed rows
 * about their own non-events — players must not be able to infer the bot scheduler
 * from the feed.
 */

const Fighter = require("../models/fighterModel");
const PVPRecord = require("../models/pvpRecordModel");
const PVPFight = require("../models/pvpFightModel");
const PvpBotState = require("../models/pvpBotStateModel");
const pvpSeasonService = require("./pvpSeasonService");
const pvpMatchmakingService = require("./pvpMatchmakingService");
const pvpFightService = require("./pvpFightService");
const { GAMEPLAN_KEYS } = require("../consts/pvpConfig");
const {
    BOT_JITTER_PCT,
    BOT_HOUR_BAND_WIDTH,
    BOT_SKIP_RETRY_HOURS,
    BOT_SAME_DEFENDER_COOLDOWN_DAYS,
} = require("../consts/pvpBotConfig");

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Expected/benign PvpError codes — the pool or the bot simply isn't ready. Debug-log and
// try again next window. Anything NOT in this set is a real bug and gets console.error.
const BENIGN_CODES = new Set([
    "duplicate_in_flight",
    "insufficient_energy",
    "attacker_injured",
    "defender_protected",
    "defender_recovering",
    "defender_not_in_season",
    "defender_not_found",
    "season_not_active",
    "season_not_found",
]);

// ── Pure helpers (no I/O, injectable randomness → unit-testable) ─────────────

/**
 * Move `date` to the NEAREST hour that falls inside this bot's UTC activity band
 * [bandStart, bandStart + width) — preserving minutes/seconds — by shifting a whole
 * number of hours. The shift is always the shortest path around the clock, so it is
 * bounded by ±12h (in practice ≤ 24 - width, i.e. ≤ 10h for a 4h band).
 *
 * This is deliberately a SHIFT, not a filter. Implementing the band as a "only fire if
 * the current hour is in the band" gate would leave a due bot waiting up to ~10 extra
 * hours on every cycle, silently inflating the real cadence well past 48h.
 *
 * @param {Date} date target time from the jittered interval
 * @param {number} bandStart 0-23 UTC hour
 * @param {number} width band width in hours
 * @returns {Date} new Date (input is never mutated)
 */
function snapToBand(date, bandStart, width = BOT_HOUR_BAND_WIDTH) {
    const start = ((Math.trunc(Number(bandStart)) || 0) % 24 + 24) % 24;
    const w = Math.max(1, Math.min(24, Math.trunc(Number(width)) || 1));
    const hour = date.getUTCHours();

    // Already inside the band → nothing to do (minutes untouched).
    for (let i = 0; i < w; i++) {
        if ((start + i) % 24 === hour) return new Date(date.getTime());
    }

    // Shortest signed hour delta to any hour in the band. `((x + 12) % 24) - 12` maps a
    // circular hour difference into [-12, 11].
    let best = null;
    for (let i = 0; i < w; i++) {
        const target = (start + i) % 24;
        const delta = ((target - hour + 12 + 24) % 24) - 12;
        if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
    }
    return new Date(date.getTime() + best * HOUR_MS);
}

/**
 * Next activity time for a bot: base interval ± BOT_JITTER_PCT, snapped into its band.
 * PURE — pass `rand` to make it deterministic in tests.
 *
 * @param {{ baseIntervalHours:number, hourBandStart:number }} state
 * @param {Date} now
 * @param {() => number} rand [0,1)
 * @returns {Date}
 */
function computeNext(state, now, rand = Math.random) {
    const base = Number(state && state.baseIntervalHours) || 0;
    const jitter = 1 + (rand() * 2 - 1) * BOT_JITTER_PCT;
    const target = new Date(now.getTime() + base * jitter * HOUR_MS);
    const snapped = snapToBand(target, state ? state.hourBandStart : 0, BOT_HOUR_BAND_WIDTH);
    // Defensive floor. With base >= 30h and a band shift <= 12h this is unreachable, but a
    // past nextActivityAt would make the bot re-claimable every tick — a fight burst.
    if (snapped.getTime() <= now.getTime()) return new Date(now.getTime() + HOUR_MS);
    return snapped;
}

// ── Defender selection ──────────────────────────────────────────────────────

/**
 * Pick one defender for a bot from the SAME matchmaking pool a human gets.
 *
 * getOpponents is called UNMODIFIED and unweighted: a bot must not have access to a
 * better (or different) pool than a player, or "the bots only ever hit me" becomes true.
 *
 * Filters on top of the shared pool:
 *  - drop isProtected / isRecovering (resolveFight would reject them anyway — this just
 *    avoids burning the bot's one turn on a guaranteed rejection).
 *  - drop anyone this bot already attacked within BOT_SAME_DEFENDER_COOLDOWN_DAYS.
 *
 * Selection is UNIFORMLY RANDOM among survivors — NOT DP-closest. DP-closest looks
 * smarter but makes every bot converge on the same handful of humans, which is both a
 * bad experience for those players and an obvious pattern.
 *
 * @returns {Promise<object|null>} an opponent DTO, or null when nothing is eligible.
 */
async function selectDefender(botFighter, season, botRecord, rand = Math.random) {
    const candidates = await pvpMatchmakingService.getOpponents(botFighter, season, botRecord);
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    let pool = candidates.filter((c) => !c.isProtected && !c.isRecovering);
    if (pool.length === 0) return null;

    // Index-served by the existing { attackerId, defenderId, seasonId, fightAt } index —
    // the attackerId prefix + fightAt make this a cheap bounded scan. Adds NO new index.
    const since = new Date(Date.now() - BOT_SAME_DEFENDER_COOLDOWN_DAYS * DAY_MS);
    const recent = await PVPFight.distinct("defenderId", {
        attackerId: botFighter._id,
        fightAt: { $gte: since },
    });
    const recentSet = new Set(recent.map(String));
    pool = pool.filter((c) => !recentSet.has(String(c.playerId)));
    if (pool.length === 0) return null;

    return pool[Math.floor(rand() * pool.length)];
}

// ── Tick ────────────────────────────────────────────────────────────────────

/** Push a bot out by BOT_SKIP_RETRY_HOURS and count the skip. Never throws. */
async function rescheduleSkip(stateId, now) {
    try {
        await PvpBotState.updateOne(
            { _id: stateId },
            {
                $set: { nextActivityAt: new Date(now.getTime() + BOT_SKIP_RETRY_HOURS * HOUR_MS) },
                $inc: { consecutiveSkips: 1 },
            }
        );
    } catch (err) {
        console.error("[PVP bots] reschedule-skip failed:", err.message);
    }
}

/**
 * Attempt exactly one fight for an already-CLAIMED bot.
 * @returns {Promise<boolean>} true if a fight resolved, false if skipped.
 */
async function attemptOneFight(botFighter, state, now) {
    const season = await pvpSeasonService.getCurrentSeasonForFighter(botFighter.weightClass);
    if (!season || season.status !== "active") {
        console.debug(`[PVP bots] ${botFighter._id}: no active season — skipping.`);
        return false;
    }

    // The bot must already be registered. We never create records from the tick: seeding
    // is the seed script's job, and a silent create here would hide a broken seed.
    const botRecord = await PVPRecord.findOne({ playerId: botFighter._id, seasonId: season._id });
    if (!botRecord) {
        console.debug(`[PVP bots] ${botFighter._id}: no PVPRecord in season ${season._id} — skipping.`);
        return false;
    }

    const defender = await selectDefender(botFighter, season, botRecord);
    if (!defender) {
        console.debug(`[PVP bots] ${botFighter._id}: no eligible defender — skipping.`);
        return false;
    }

    const gameplan = GAMEPLAN_KEYS[(state.gameplanIndex || 0) % GAMEPLAN_KEYS.length];

    // The human entry point, unchanged. Do NOT add a bot-only variant: resolveFight holds
    // no request-scoped state (verified) and duplicating it would fork the DP economy.
    await pvpFightService.resolveFight(String(botFighter._id), {
        defenderId: String(defender.playerId),
        gameplan,
        seasonId: String(season._id),
    });

    await PvpBotState.updateOne(
        { _id: state._id },
        { $set: { lastFightAt: now, consecutiveSkips: 0 }, $inc: { gameplanIndex: 1 } }
    );
    return true;
}

/**
 * Hourly tick: give every due bot exactly one attempt at exactly one fight.
 *
 * Idempotency / retry: none needed. The job takes no arguments and no attempts/retries
 * are configured — a failed or half-finished tick is fully recovered by the next hourly
 * tick, because "due" is derived from nextActivityAt in the DB, not from job state.
 *
 * @returns {Promise<{ due:number, fought:number, skipped:number }>}
 */
async function runBotActivityTick() {
    const now = new Date();
    const due = await PvpBotState.find({ nextActivityAt: { $lte: now } }).limit(200).lean();
    let fought = 0;
    let skipped = 0;

    for (const state of due) {
        // eslint-disable-next-line no-await-in-loop
        const botFighter = await Fighter.findOne({ _id: state.fighterId, isPvpBot: true });
        if (!botFighter) {
            // Orphan state (fighter deleted). Leave the row alone — the seed script owns
            // lifecycle; silently deleting here would hide a broken reset.
            console.debug(`[PVP bots] state ${state._id}: no bot fighter ${state.fighterId} — skipping.`);
            continue;
        }

        // ── CLAIM BEFORE ACTING ──────────────────────────────────────────────
        // Atomically move nextActivityAt forward BEFORE the fight. If two ticks overlap
        // (a slow tick, a redeploy, more than one dyno), only one wins this conditional
        // update; the loser sees null and moves on.
        //
        // Yes, a crash between the claim and the fight burns the bot's turn. That is the
        // deliberate trade: a SKIPPED turn is invisible to players (a bot was quiet for a
        // day), while a DOUBLE fight is a visible anomaly in a human's defense log and
        // double DP loss. Do NOT "optimize" this by writing nextActivityAt after the
        // fight — that inverts the failure mode.
        // eslint-disable-next-line no-await-in-loop
        const claimed = await PvpBotState.findOneAndUpdate(
            { _id: state._id, nextActivityAt: { $lte: now } },
            { $set: { nextActivityAt: computeNext(state, now), lastAttemptAt: now } },
            { new: true }
        );
        if (!claimed) continue; // another tick got this bot.

        try {
            // eslint-disable-next-line no-await-in-loop
            const didFight = await attemptOneFight(botFighter, claimed, now);
            if (didFight) {
                fought += 1;
            } else {
                skipped += 1;
                // eslint-disable-next-line no-await-in-loop
                await rescheduleSkip(claimed._id, now);
            }
        } catch (err) {
            // One bad bot must never fail the tick for the other 24. Never rethrow.
            skipped += 1;
            if (err && err.isPvp && BENIGN_CODES.has(err.code)) {
                console.debug(`[PVP bots] ${botFighter._id}: ${err.code} — skipping.`);
            } else {
                console.error(`[PVP bots] ${botFighter._id}: unexpected failure:`, err && err.message, err);
            }
            // eslint-disable-next-line no-await-in-loop
            await rescheduleSkip(claimed._id, now);
        }
    }

    return { due: due.length, fought, skipped };
}

module.exports = {
    runBotActivityTick,
    selectDefender,
    computeNext,
    snapToBand,
};
