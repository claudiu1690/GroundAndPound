/**
 * Ground & Pound — Simplified fight resolution (GDD Section 8).
 * Text-resolved rounds: damage (STR/LEG vs CHN), stamina drain, KO/TKO and submission checks.
 */

const { getCommentaryLine, getResultLine } = require("./fightCommentary");
const { FIGHT_RESOLUTION_CONFIG: CFG } = require("../consts/fightResolutionConfig");

const STAT_KEYS = CFG.statKeys;
const EVENT_TO_KEY = CFG.eventToCommentaryKey;

function outcomeToCommentaryKey(outcome) {
    if (!outcome) return "decision";
    return CFG.outcomeToCommentaryKey[outcome] || "decision";
}

function getStat(obj, key) {
    const v = obj[key];
    return typeof v === "number" ? v : CFG.defaults.stat;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function strikingComposite(f) {
    return (getStat(f, "str") + getStat(f, "spd") + getStat(f, "leg")) / 3;
}

function grapplingComposite(f) {
    return (getStat(f, "wre") + getStat(f, "gnd") + getStat(f, "sub")) / 3;
}

/**
 * Positive when a fighter is striking-heavy, negative when grappling-heavy.
 */
function strikingProfileMod(fighter) {
    const diff = strikingComposite(fighter) - grapplingComposite(fighter);
    return clamp(diff / CFG.profile.divisor, CFG.profile.minMod, CFG.profile.maxMod);
}

/**
 * Positive when a fighter is grappling-heavy, negative when striking-heavy.
 */
function grapplingProfileMod(fighter) {
    const diff = grapplingComposite(fighter) - strikingComposite(fighter);
    return clamp(diff / CFG.profile.divisor, CFG.profile.minMod, CFG.profile.maxMod);
}

/**
 * Damage from striker: (attack * 0.5 + SPD * 0.2) - (opponent CHN * 0.3) with ±15% variance.
 */
function strikeDamage(attacker, defender) {
    const attack = (getStat(attacker, "str") + getStat(attacker, "leg")) / 2;
    const spd = getStat(attacker, "spd");
    const chn = getStat(defender, "chn");
    const base = Math.max(0, attack * CFG.strikeDamage.attackWeight + spd * CFG.strikeDamage.speedWeight - chn * CFG.strikeDamage.chinWeight);
    const variance = CFG.strikeDamage.varianceMin + Math.random() * CFG.strikeDamage.varianceRange;
    return Math.max(0, Math.round(base * variance));
}

/**
 * Takedown success: WRE vs WRE with some variance.
 */
function takedownSuccess(attacker, defender) {
    const aWre = getStat(attacker, "wre");
    const dWre = getStat(defender, "wre");
    const roll = Math.random();
    return roll < CFG.takedown.baseSuccessChance + (aWre - dWre) / CFG.takedown.wreDiffDivisor;
}

/**
 * Choose takedown initiator with a fair, stat-weighted roll.
 * Equal wrestling = ~50/50 who initiates.
 */
function playerShootsTakedown(player, opponent) {
    const pWre = getStat(player, "wre");
    const oWre = getStat(opponent, "wre");
    const chance = clamp(
        CFG.takedown.shooterBaseChance + (pWre - oWre) / CFG.takedown.shooterDiffDivisor,
        CFG.takedown.shooterChanceMin,
        CFG.takedown.shooterChanceMax
    );
    return Math.random() < chance;
}

/**
 * Submission attempt: SUB vs SUB. Success if roll < (attacker SUB - defender SUB + 20) / 100.
 */
function submissionSuccess(attacker, defender) {
    const aSub = getStat(attacker, "sub");
    const dSub = getStat(defender, "sub");
    const aWre = getStat(attacker, "wre");
    const dWre = getStat(defender, "wre");
    const aGnd = getStat(attacker, "gnd");
    const dGnd = getStat(defender, "gnd");
    const roll = Math.random();
    const chance = clamp(
        CFG.submission.baseChance +
        (aSub - dSub) / CFG.submission.subDiffDivisor +
        (aWre - dWre) / CFG.submission.wreDiffDivisor +
        (aGnd - dGnd) / CFG.submission.gndDiffDivisor +
        grapplingProfileMod(attacker),
        CFG.submission.chanceMin,
        CFG.submission.chanceMax
    );
    return roll < chance;
}

/**
 * Defender with strong anti-grappling stats reduces submission opportunity frequency.
 */
function submissionDefenseMod(defender) {
    const antiSub = (getStat(defender, "sub") + getStat(defender, "wre")) / 2;
    // 10 -> ~1.0, 30 -> ~0.75, 40+ -> floor at 0.65
    return clamp(
        CFG.submissionDefense.base - (antiSub - CFG.submissionDefense.anchorStat) / CFG.submissionDefense.divisor,
        CFG.submissionDefense.minMod,
        CFG.submissionDefense.maxMod
    );
}

/**
 * KO/TKO check when health drops below 25. Probability scales with recent damage and low CHN.
 * ironWillPerk reduces KO probability by 5%.
 */
function koCheck(defender, damageThisRound, ironWillPerk = false, attacker = null) {
    const health = defender.health;
    const stamina = Math.max(0, defender.stamina ?? 100);
    // Exhaustion opens a wider finish window.
    const healthWindow = stamina < CFG.koCheck.healthWindow.lowStaminaThreshold
        ? CFG.koCheck.healthWindow.lowStaminaWindow
        : stamina < CFG.koCheck.healthWindow.midStaminaThreshold
            ? CFG.koCheck.healthWindow.midStaminaWindow
            : stamina < CFG.koCheck.healthWindow.highStaminaThreshold
                ? CFG.koCheck.healthWindow.highStaminaWindow
                : CFG.koCheck.healthWindow.normalWindow;
    if (health > healthWindow) return false;
    const chn = getStat(defender, "chn");
    // Exhausted fighters are easier to finish; ramps up strongly below 40 stamina.
    const lowStaminaMod = stamina < CFG.koCheck.lowStaminaThreshold
        ? (CFG.koCheck.lowStaminaThreshold - stamina) / CFG.koCheck.lowStaminaDivisor
        : 0;
    const attackerStrikingMod = attacker ? strikingProfileMod(attacker) : 0;
    const perkMod = ironWillPerk ? CFG.koCheck.ironWillMod : 0;
    const prob = CFG.koCheck.base
        + (healthWindow - health) / CFG.koCheck.healthDiffDivisor
        - chn / CFG.koCheck.chinDivisor
        + damageThisRound / CFG.koCheck.damageDivisor
        + lowStaminaMod
        + attackerStrikingMod
        + perkMod;
    return Math.random() < clamp(prob, CFG.koCheck.minProb, CFG.koCheck.maxProb);
}

/**
 * Exhaustion finish check: very low stamina can create TKO vulnerability.
 * This supplements normal KO logic and makes low stamina materially dangerous.
 */
function exhaustionTkoCheck(defender, damageThisRound, ironWillPerk = false) {
    const stamina = Math.max(0, defender.stamina ?? 100);
    if (stamina > CFG.exhaustionTko.maxStamina) return false;
    const health = defender.health ?? 100;
    const chn = getStat(defender, "chn");
    const staminaMod = stamina <= CFG.exhaustionTko.veryLowStamina
        ? CFG.exhaustionTko.veryLowBase
        : CFG.exhaustionTko.lowBase;
    const damageMod = Math.max(0, damageThisRound - CFG.exhaustionTko.damageFloor) / CFG.exhaustionTko.damageDivisor;
    const healthMod = health < CFG.exhaustionTko.healthThreshold
        ? (CFG.exhaustionTko.healthThreshold - health) / CFG.exhaustionTko.healthDivisor
        : 0;
    const perkMod = ironWillPerk ? CFG.exhaustionTko.ironWillMod : 0;
    const prob = staminaMod + damageMod + healthMod - chn / CFG.exhaustionTko.chinDivisor + perkMod;
    return Math.random() < clamp(prob, CFG.exhaustionTko.minProb, CFG.exhaustionTko.maxProb);
}

/**
 * Strategy modifiers (GDD 8.3): bias takedown attempt, strike damage, defence.
 */
function getTakedownAttemptChance(playerStrategy) {
    if (!playerStrategy) return CFG.strategy.takedownAttempt.default;
    if (playerStrategy === "Takedown Heavy" || playerStrategy === "Ground & Pound") return CFG.strategy.takedownAttempt.takedownHeavy;
    if (playerStrategy === "Submission Hunter") return CFG.strategy.takedownAttempt.submissionHunter;
    return CFG.strategy.takedownAttempt.default;
}

function getStrikeDamageMod(playerStrategy, isAttacker) {
    if (!playerStrategy) return CFG.strategy.strikeDamageMod.default;
    if (isAttacker && (playerStrategy === "Pressure Fighter" || playerStrategy === "Clinch Bully")) return CFG.strategy.strikeDamageMod.pressureAttacker;
    if (!isAttacker && playerStrategy === "Counter Striker") return CFG.strategy.strikeDamageMod.counterDefender;
    if (!isAttacker && playerStrategy === "Survival Mode") return CFG.strategy.strikeDamageMod.survivalDefender;
    return CFG.strategy.strikeDamageMod.default;
}

function getSubAttemptChance(playerStrategy) {
    if (!playerStrategy) return CFG.strategy.subAttempt.default;
    if (playerStrategy === "Submission Hunter" || playerStrategy === "Ground & Pound") return CFG.strategy.subAttempt.submissionHunter;
    return CFG.strategy.subAttempt.default;
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
    const staminaDrain = CFG.round.staminaDrainBase + Math.floor(Math.random() * CFG.round.staminaDrainRandom);
    let playerDamage = 0;
    let opponentDamage = 0;
    let event = null;
    let grapplingControl = 0;
    let finished = false;
    let outcome = null;

    const pStamina = Math.max(0, (player.stamina ?? CFG.defaults.stamina) - staminaDrain);
    const oStamina = Math.max(0, (opponent.stamina ?? CFG.defaults.stamina) - staminaDrain);
    const pStaminaMod = pStamina / 100;
    const oStaminaMod = oStamina / 100;

    const takedownChance = getTakedownAttemptChance(playerStrategy);
    if (roundNum <= CFG.round.takedownRoundsLimit && Math.random() < takedownChance) {
        const playerShoots = playerShootsTakedown(player, opponent);
        if (playerShoots && takedownSuccess(player, opponent)) {
            opponentDamage = Math.round((getStat(player, "gnd") * 0.4) * pStaminaMod);
            event = "Takedown; ground and pound.";
            grapplingControl = 1;
            const subChance = clamp(
                (getSubAttemptChance(playerStrategy) + grapplingProfileMod(player)) * submissionDefenseMod(opponent),
                CFG.submission.attemptMin,
                CFG.submission.attemptMax
            );
            if (Math.random() < subChance) {
                if (submissionSuccess(player, opponent)) {
                    finished = true;
                    outcome = "Submission";
                }
            }
        } else if (!playerShoots && takedownSuccess(opponent, player)) {
            playerDamage = Math.round((getStat(opponent, "gnd") * 0.4) * oStaminaMod);
            event = "Opponent took you down.";
            grapplingControl = -1;
            const oppSubChance = clamp(
                (0.25 + grapplingProfileMod(opponent)) * submissionDefenseMod(player),
                CFG.submission.attemptMin,
                CFG.submission.attemptMax
            );
            if (Math.random() < oppSubChance) {
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
        playerDamage = Math.round(oppStrike * oStaminaMod);
        opponentDamage = Math.round(plStrike * pStaminaMod);
        event = "Striking exchange.";

        // Flash KO path: high-impact striking builds can produce early finishes.
        if (!finished && opponentDamage >= CFG.flashKo.minDamage) {
            const flashKoChance = clamp(
                CFG.flashKo.baseChance + strikingProfileMod(player) + (opponentDamage - CFG.flashKo.minDamage) / CFG.flashKo.extraDamageDivisor,
                CFG.flashKo.minProb,
                CFG.flashKo.maxProb
            );
            if (Math.random() < flashKoChance) {
                finished = true;
                outcome = "KO/TKO";
            }
        }
        if (!finished && playerDamage >= CFG.flashKo.minDamage) {
            const oppFlashKoChance = clamp(
                CFG.flashKo.baseChance + strikingProfileMod(opponent) + (playerDamage - CFG.flashKo.minDamage) / CFG.flashKo.extraDamageDivisor,
                CFG.flashKo.minProb,
                CFG.flashKo.maxProb
            );
            if (Math.random() < oppFlashKoChance * (ironWillPerk ? CFG.flashKo.ironWillMultiplier : 1)) {
                finished = true;
                outcome = "Loss (KO/TKO)";
            }
        }
    }

    player.health = Math.max(CFG.round.healthZero, (player.health ?? CFG.defaults.health) - playerDamage);
    opponent.health = Math.max(CFG.round.healthZero, (opponent.health ?? CFG.defaults.health) - opponentDamage);
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
    if (!finished && exhaustionTkoCheck(player, playerDamage, ironWillPerk)) {
        finished = true;
        outcome = "Loss (KO/TKO)";
    }
    if (!finished && exhaustionTkoCheck(opponent, opponentDamage, false)) {
        finished = true;
        outcome = "KO/TKO";
    }
    if (!finished && player.health < CFG.koCheck.healthWindow.normalWindow && koCheck(player, playerDamage, ironWillPerk, opponent)) {
        finished = true;
        outcome = "Loss (KO/TKO)";
    }
    if (!finished && opponent.health < CFG.koCheck.healthWindow.normalWindow && koCheck(opponent, opponentDamage, false, player)) {
        finished = true;
        outcome = "KO/TKO";
    }

    return {
        playerDamage,
        opponentDamage,
        playerStamina: pStamina,
        opponentStamina: oStamina,
        event,
        grapplingControl,
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
    let net = od - pd; // positive = player dealt more (player won round)
    const control = round.grapplingControl ?? 0;
    if (judgeBias === "grappler") net += control * CFG.judging.controlWeights.grappler;
    if (judgeBias === "striker") net += control * CFG.judging.controlWeights.striker;
    let playerRound = 9;
    let oppRound = 9;
    if (net > CFG.judging.dominantRoundThreshold) {
        playerRound = 10;
        oppRound = net > CFG.judging.dominantRound10_8Threshold ? 8 : 9;
    } else if (net < -CFG.judging.dominantRoundThreshold) {
        oppRound = 10;
        playerRound = net < -CFG.judging.dominantRound10_8Threshold ? 8 : 9;
    } else {
        if (net === 0) {
            // True toss-up round: avoid structural side bias.
            playerRound = Math.random() < 0.5 ? 10 : 9;
        } else if (judgeBias === "striker") {
            playerRound = net > 0 ? 10 : 9;
        } else if (judgeBias === "grappler") {
            playerRound = net > 0 ? 10 : 9;
        } else {
            playerRound = net > 0 ? 10 : 9;
        }
        // Standard close round: 10-9 either way (never 11 points).
        oppRound = playerRound === 10 ? 9 : 10;
    }
    return { player: playerRound, opponent: oppRound };
}

function judgeScorecard(rounds) {
    const biases = CFG.judging.biases;
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
    const maxRounds = options.maxRounds ?? CFG.defaults.maxRounds;
    const playerStrategy = options.playerStrategy || null;
    const ironWillPerk = !!options.ironWillPerk;
    const playerName = options.playerName || "Your fighter";
    const opponentName = options.opponentName || "Opponent";
    const rounds = [];
    const commentary = [];
    let p = {
        health: player.health ?? CFG.defaults.health,
        stamina: player.stamina ?? CFG.defaults.stamina,
        str: player.str, spd: player.spd, leg: player.leg, wre: player.wre,
        gnd: player.gnd, sub: player.sub, chn: player.chn, fiq: player.fiq
    };
    let o = {
        health: opponent.health ?? CFG.defaults.health,
        stamina: opponent.stamina ?? CFG.defaults.stamina,
        str: opponent.str, spd: opponent.spd, leg: opponent.leg, wre: opponent.wre,
        gnd: opponent.gnd, sub: opponent.sub, chn: opponent.chn, fiq: opponent.fiq
    };

    for (let r = 1; r <= maxRounds; r++) {
        const result = resolveRound(p, o, r, playerStrategy, ironWillPerk);
        rounds.push({
            round: r,
            event: result.event,
            grapplingControl: result.grapplingControl,
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
