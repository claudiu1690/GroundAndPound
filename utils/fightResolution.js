/**
 * Ground & Pound — Simplified fight resolution (GDD Section 8).
 * Text-resolved rounds: damage (STR/LEG vs CHN), stamina drain, KO/TKO and submission checks.
 */

const { getCommentaryLine, getResultLine } = require("./fightCommentary");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

const EVENT_TO_KEY = {
    "Striking exchange.": "strikingExchange",
    "Takedown; ground and pound.": "takedownPlayer",
    "Opponent took you down.": "takedownOpponent"
};

function outcomeToCommentaryKey(outcome) {
    if (!outcome) return "decision";
    if (outcome === "KO/TKO") return "koFinish";
    if (outcome === "Submission") return "submissionWin";
    if (outcome === "Loss (KO/TKO)") return "koLoss";
    if (outcome === "Loss (submission)") return "submissionLoss";
    if (outcome === "Loss (decision)" || outcome === "Draw") return "decision";
    if (outcome === "Decision (unanimous)" || outcome === "Decision (split)") return "decision";
    return "decision";
}

function getStat(obj, key) {
    const v = obj[key];
    return typeof v === "number" ? v : 10;
}

/**
 * Damage from striker: (attack * 0.5 + SPD * 0.2) - (opponent CHN * 0.3) with ±15% variance.
 */
function strikeDamage(attacker, defender) {
    const attack = (getStat(attacker, "str") + getStat(attacker, "leg")) / 2;
    const spd = getStat(attacker, "spd");
    const chn = getStat(defender, "chn");
    const base = Math.max(0, attack * 0.5 + spd * 0.2 - chn * 0.3);
    const variance = 0.85 + Math.random() * 0.3;
    return Math.max(0, Math.round(base * variance));
}

/**
 * Takedown success: WRE vs WRE with some variance.
 */
function takedownSuccess(attacker, defender) {
    const aWre = getStat(attacker, "wre");
    const dWre = getStat(defender, "wre");
    const roll = Math.random();
    return roll < 0.4 + (aWre - dWre) / 250;
}

/**
 * Submission attempt: SUB vs SUB. Success if roll < (attacker SUB - defender SUB + 20) / 100.
 */
function submissionSuccess(attacker, defender) {
    const aSub = getStat(attacker, "sub");
    const dSub = getStat(defender, "sub");
    const roll = Math.random();
    const chance = Math.max(0.05, Math.min(0.6, 0.2 + (aSub - dSub) / 100));
    return roll < chance;
}

/**
 * KO/TKO check when health drops below 25. Probability scales with recent damage and low CHN.
 * ironWillPerk reduces KO probability by 5%.
 */
function koCheck(defender, damageThisRound, ironWillPerk = false) {
    const health = defender.health;
    if (health > 25) return false;
    const chn = getStat(defender, "chn");
    const perkMod = ironWillPerk ? -0.05 : 0;
    const prob = 0.15 + (25 - health) / 100 - chn / 500 + damageThisRound / 200 + perkMod;
    return Math.random() < Math.max(0.02, Math.min(0.7, prob));
}

/**
 * Strategy modifiers (GDD 8.3): bias takedown attempt, strike damage, defence.
 */
function getTakedownAttemptChance(playerStrategy) {
    if (!playerStrategy) return 0.4;
    if (playerStrategy === "Takedown Heavy" || playerStrategy === "Ground & Pound") return 0.58;
    if (playerStrategy === "Submission Hunter") return 0.5;
    return 0.4;
}

function getStrikeDamageMod(playerStrategy, isAttacker) {
    if (!playerStrategy) return 1;
    if (isAttacker && (playerStrategy === "Pressure Fighter" || playerStrategy === "Clinch Bully")) return 1.1;
    if (!isAttacker && playerStrategy === "Counter Striker") return 0.9;
    if (!isAttacker && playerStrategy === "Survival Mode") return 0.92;
    return 1;
}

function getSubAttemptChance(playerStrategy) {
    if (!playerStrategy) return 0.25;
    if (playerStrategy === "Submission Hunter" || playerStrategy === "Ground & Pound") return 0.38;
    return 0.25;
}

/**
 * Resolve one round.
 * @param {Object} player
 * @param {Object} opponent
 * @param {number} roundNum
 * @param {string|null} playerStrategy
 * @param {boolean} ironWillPerk - Applies only to player's KO loss check
 * @returns {{ playerDamage: number, opponentDamage: number, playerStamina: number, opponentStamina: number, event: string|null, finished: boolean, outcome: string|null, playerHealth: number, opponentHealth: number }}
 */
function resolveRound(player, opponent, roundNum, playerStrategy, ironWillPerk = false) {
    const staminaDrain = 8 + Math.floor(Math.random() * 6);
    let playerDamage = 0;
    let opponentDamage = 0;
    let event = null;
    let finished = false;
    let outcome = null;

    const pStamina = Math.max(0, (player.stamina || 100) - staminaDrain);
    const oStamina = Math.max(0, (opponent.stamina || 100) - staminaDrain);
    const pStaminaMod = pStamina / 100;
    const oStaminaMod = oStamina / 100;

    const takedownChance = getTakedownAttemptChance(playerStrategy);
    if (roundNum <= 2 && Math.random() < takedownChance) {
        const playerShoots = getStat(player, "wre") > getStat(opponent, "wre");
        if (playerShoots && takedownSuccess(player, opponent)) {
            opponentDamage = Math.round((getStat(player, "gnd") * 0.4) * oStaminaMod);
            event = "Takedown; ground and pound.";
            const subChance = getSubAttemptChance(playerStrategy);
            if (getStat(player, "sub") > 50 && Math.random() < subChance) {
                if (submissionSuccess(player, opponent)) {
                    finished = true;
                    outcome = "Submission";
                }
            }
        } else if (!playerShoots && takedownSuccess(opponent, player)) {
            playerDamage = Math.round((getStat(opponent, "gnd") * 0.4) * pStaminaMod);
            event = "Opponent took you down.";
            if (getStat(opponent, "sub") > 50 && Math.random() < 0.25) {
                if (submissionSuccess(opponent, player)) {
                    finished = true;
                    outcome = "Loss (submission)";
                }
            }
        }
    }

    if (!event) {
        const oppStrike = strikeDamage(opponent, player) * getStrikeDamageMod(playerStrategy, false);
        const plStrike = strikeDamage(player, opponent) * getStrikeDamageMod(playerStrategy, true);
        playerDamage = Math.round(oppStrike * pStaminaMod);
        opponentDamage = Math.round(plStrike * oStaminaMod);
        event = "Striking exchange.";
    }

    player.health = Math.max(0, (player.health || 100) - playerDamage);
    opponent.health = Math.max(0, (opponent.health || 100) - opponentDamage);
    player.stamina = pStamina;
    opponent.stamina = oStamina;

    if (!finished && player.health <= 0) {
        finished = true;
        outcome = "Loss (KO/TKO)";
    }
    if (!finished && opponent.health <= 0) {
        finished = true;
        outcome = "KO/TKO";
    }
    if (!finished && player.health < 25 && koCheck(player, playerDamage, ironWillPerk)) {
        finished = true;
        outcome = "Loss (KO/TKO)";
    }
    if (!finished && opponent.health < 25 && koCheck(opponent, opponentDamage, false)) {
        finished = true;
        outcome = "KO/TKO";
    }

    return {
        playerDamage,
        opponentDamage,
        playerStamina: pStamina,
        opponentStamina: oStamina,
        event,
        finished,
        outcome,
        playerHealth: player.health,
        opponentHealth: opponent.health
    };
}

/**
 * GDD 8.7: Three judges with bias (striker-friendly, grappler-friendly, balanced). Score each round 10-9 or 10-8.
 */
function scoreRoundForJudge(round, judgeBias) {
    const pd = round.playerDamage ?? 0; // damage to player
    const od = round.opponentDamage ?? 0; // damage to opponent
    const net = od - pd; // positive = player dealt more (player won round)
    let playerRound = 9;
    let oppRound = 9;
    if (net > 8) {
        playerRound = 10;
        oppRound = net > 18 ? 8 : 9;
    } else if (net < -8) {
        oppRound = 10;
        playerRound = net < -18 ? 8 : 9;
    } else {
        if (judgeBias === "striker") playerRound = net >= 0 ? 10 : 9;
        else if (judgeBias === "grappler") playerRound = net > 0 ? 10 : 9;
        else playerRound = net >= 0 ? 10 : 9;
        oppRound = 20 - playerRound;
    }
    return { player: playerRound, opponent: oppRound };
}

function judgeScorecard(rounds) {
    const biases = ["striker", "grappler", "balanced"];
    const totals = { player: 0, opponent: 0 };
    const scorecard = [];
    for (const b of biases) {
        let p = 0, o = 0;
        for (const r of rounds) {
            const s = scoreRoundForJudge(r, b);
            p += s.player;
            o += s.opponent;
        }
        scorecard.push({ bias: b, player: p, opponent: o });
        if (p > o) {
            totals.player += 1;
        } else if (o > p) {
            totals.opponent += 1;
        } else {
            // Exact tie on a judge's card — break it randomly (draws should be extremely rare).
            // Slight lean to whichever fighter won the last round.
            const lastRound = rounds[rounds.length - 1];
            const lastNet = (lastRound?.opponentDamage ?? 0) - (lastRound?.playerDamage ?? 0);
            if (lastNet >= 0) totals.player += 1;
            else totals.opponent += 1;
        }
    }
    return { scorecard, playerRounds: totals.player, opponentRounds: totals.opponent };
}

/**
 * Full fight: up to 5 rounds. Returns { outcome, rounds[], winner: 'player'|'opponent'|'draw' }.
 * options: { maxRounds, playerStrategy, playerName, opponentName, ironWillPerk }.
 */
function resolveFight(player, opponent, options = {}) {
    const maxRounds = options.maxRounds ?? 5;
    const playerStrategy = options.playerStrategy || null;
    const ironWillPerk = !!options.ironWillPerk;
    const playerName = options.playerName || "Your fighter";
    const opponentName = options.opponentName || "Opponent";
    const rounds = [];
    const commentary = [];
    let p = {
        health: player.health ?? 100,
        stamina: player.stamina ?? 100,
        str: player.str, spd: player.spd, leg: player.leg, wre: player.wre,
        gnd: player.gnd, sub: player.sub, chn: player.chn, fiq: player.fiq
    };
    let o = {
        health: opponent.health ?? 100,
        stamina: opponent.stamina ?? 100,
        str: opponent.str, spd: opponent.spd, leg: opponent.leg, wre: opponent.wre,
        gnd: opponent.gnd, sub: opponent.sub, chn: opponent.chn, fiq: opponent.fiq
    };

    for (let r = 1; r <= maxRounds; r++) {
        const result = resolveRound(p, o, r, playerStrategy, ironWillPerk);
        rounds.push({
            round: r,
            event: result.event,
            playerDamage: result.playerDamage,
            opponentDamage: result.opponentDamage,
            playerHealth: result.playerHealth,
            opponentHealth: result.opponentHealth
        });
        const eventKey = EVENT_TO_KEY[result.event] || "strikingExchange";
        const line = getCommentaryLine(eventKey, playerName, opponentName);
        if (line) commentary.push(`Round ${r}: ${line}`);
        if (result.finished) {
            const outcomeKey = outcomeToCommentaryKey(result.outcome);
            const outcomeLine = getCommentaryLine(outcomeKey, playerName, opponentName);
            if (outcomeLine) commentary.push(outcomeLine);
            let winner = "draw";
            if (result.outcome === "KO/TKO" || result.outcome === "Submission") winner = "player";
            else if (result.outcome && result.outcome.startsWith("Loss")) winner = "opponent";
            const resultLine = getResultLine(winner, result.outcome, playerName, opponentName);
            if (resultLine) commentary.push(resultLine);
            return { outcome: result.outcome, rounds, winner, playerHealthAfter: p.health, playerStaminaAfter: p.stamina, commentary };
        }
    }

    // GDD 8.7: Judge scorecard — 3 judges with bias; majority determines winner and unanimous/split.
    const { scorecard, playerRounds, opponentRounds } = judgeScorecard(rounds);
    let outcome;
    let winner;
    if (playerRounds > opponentRounds) {
        // Player wins majority of judges
        outcome = playerRounds === 3 ? "Decision (unanimous)" : "Decision (split)";
        winner = "player";
    } else if (opponentRounds > playerRounds) {
        // Opponent wins majority
        outcome = "Loss (decision)";
        winner = "opponent";
    } else {
        // Genuine equal split (extremely rare with tie-breaking above)
        outcome = "Draw";
        winner = "draw";
    }
    const outcomeKey = outcomeToCommentaryKey(outcome);
    const outcomeLine = getCommentaryLine(outcomeKey, playerName, opponentName);
    if (outcomeLine) commentary.push(outcomeLine);
    const resultLine = getResultLine(winner, outcome, playerName, opponentName);
    if (resultLine) commentary.push(resultLine);
    return { outcome, rounds, winner, playerHealthAfter: p.health, playerStaminaAfter: p.stamina, commentary, scorecard };
}

module.exports = { resolveFight, strikeDamage, submissionSuccess };
