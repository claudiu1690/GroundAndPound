/**
 * Structured fight resolution logs for balance analysis.
 *
 * Default: ON when NODE_ENV is not "production" (normal local `npm run dev` / `node app.js`).
 * Turn off: FIGHT_RESOLVE_LOG=0
 * Force on in production: FIGHT_RESOLVE_LOG=1
 *
 * Optional file (NDJSON): FIGHT_RESOLVE_LOG_FILE=path
 * Console only off (still write file): FIGHT_RESOLVE_LOG_STDOUT=0
 */
const fs = require("fs");
const path = require("path");
const { calculateOverall } = require("./overallRating");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

function statsSlice(obj) {
    const o = {};
    for (const k of STAT_KEYS) {
        if (typeof obj[k] === "number") o[k] = obj[k];
    }
    return o;
}

function roundDamageTotals(rounds) {
    let dmgToPlayer = 0;
    let dmgToOpp = 0;
    for (const r of rounds || []) {
        dmgToPlayer += r.playerDamage || 0;
        dmgToOpp += r.opponentDamage || 0;
    }
    return { dmgToPlayer, dmgToOpp };
}

function loggingEnabled() {
    const v = process.env.FIGHT_RESOLVE_LOG;
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
    if (process.env.FIGHT_RESOLVE_LOG_FILE) return true;
    return process.env.NODE_ENV !== "production";
}

/**
 * @param {object} ctx
 * @param {import("mongoose").Document} ctx.fighter
 * @param {object} ctx.fight
 * @param {object} ctx.fightPlayer - stats as passed into resolveFight (after camp + weight cut stamina)
 * @param {object} ctx.opponent
 * @param {object} ctx.result - resolveFight return value
 * @param {string|null} ctx.campRating - e.g. "A" or null for legacy fights
 * @param {Array} ctx.sessionBonuses - v2 conditional session bonuses
 * @param {object|null} ctx.wildcard - v2 wildcard data
 * @param {string} ctx.weightCut
 * @param {boolean} ctx.weightMissed
 * @param {boolean} ctx.ironWillPerk
 */
function logFightResolve(ctx) {
    if (!loggingEnabled()) return;

    const { fighter, fight, fightPlayer, opponent, result } = ctx;
    const style = fighter.style || "Boxer";

    const rosterStats = statsSlice(fighter);
    const effectiveStats = statsSlice(fightPlayer);
    const oppStats = statsSlice(opponent);
    const { dmgToPlayer, dmgToOpp } = roundDamageTotals(result.rounds);

    const payload = {
        evt: "fight_resolve",
        ts: new Date().toISOString(),
        fighterId: String(fighter._id),
        fightId: String(fight._id),
        promotionTier: fight.promotionTier,
        offerType: fight.offerType || null,
        playerStrategy: fight.playerStrategy || null,
        camp: {
            campRating: ctx.campRating ?? null,
            sessionBonuses: ctx.sessionBonuses ?? [],
            wildcard: ctx.wildcard ?? null,
        },
        weightCut: {
            mode: ctx.weightCut,
            roll: ctx.weightCutRoll ?? 0,
            missed: ctx.weightMissed,
        },
        player: {
            style,
            rosterOvr: calculateOverall(fighter),
            rosterStats,
            effectiveOvr: calculateOverall({ ...fightPlayer, style }),
            effectiveStats,
            staminaFightStart: fightPlayer.stamina,
            maxStaminaFight: fightPlayer.maxStamina,
            ironWill: ctx.ironWillPerk,
        },
        opponent: {
            id: String(opponent._id),
            name: opponent.name,
            style: opponent.style,
            ovr: opponent.overallRating,
            stats: oppStats,
            staminaStart: opponent.stamina ?? 100,
            maxStaminaStart: opponent.maxStamina ?? 100,
        },
        result: {
            outcome: result.outcome,
            winner: result.winner,
            roundsFought: (result.rounds || []).length,
            dmgToPlayer,
            dmgToOpp,
            healthEnd: result.playerHealthAfter,
            staminaEnd: result.playerStaminaAfter,
        },
    };

    const json = JSON.stringify(payload);

    const stdoutOff = process.env.FIGHT_RESOLVE_LOG_STDOUT === "0" || process.env.FIGHT_RESOLVE_LOG_STDOUT === "false";
    if (!stdoutOff) {
        console.log(json);
    }

    const filePath = process.env.FIGHT_RESOLVE_LOG_FILE;
    if (filePath) {
        const dir = path.dirname(filePath);
        if (dir && dir !== ".") {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(filePath, `${json}\n`, "utf8");
    }
}

module.exports = { logFightResolve, loggingEnabled };
