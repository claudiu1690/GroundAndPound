/**
 * Ground & Pound — Fight resolution v2 (GDD Section 8 + Section 2B).
 * Text-resolved rounds with conditional camp session bonuses.
 *
 * v2 changes:
 * - Session bonuses are conditional (fire only on trigger)
 * - No flat campModifier on all stats (removed)
 * - Wildcard system applies one hidden penalty per fight
 * - Commentary hooks for camp-triggered events
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

function strikingProfileMod(fighter) {
    const diff = strikingComposite(fighter) - grapplingComposite(fighter);
    return clamp(diff / CFG.profile.divisor, CFG.profile.minMod, CFG.profile.maxMod);
}

function grapplingProfileMod(fighter) {
    const diff = grapplingComposite(fighter) - strikingComposite(fighter);
    return clamp(diff / CFG.profile.divisor, CFG.profile.minMod, CFG.profile.maxMod);
}

function strikeDamage(attacker, defender) {
    const attack = (getStat(attacker, "str") + getStat(attacker, "leg")) / 2;
    const spd = getStat(attacker, "spd");
    const chn = getStat(defender, "chn");
    const base = Math.max(0, attack * CFG.strikeDamage.attackWeight + spd * CFG.strikeDamage.speedWeight - chn * CFG.strikeDamage.chinWeight);
    const variance = CFG.strikeDamage.varianceMin + Math.random() * CFG.strikeDamage.varianceRange;
    return Math.max(0, Math.round(base * variance));
}

function takedownSuccess(attacker, defender) {
    const aWre = getStat(attacker, "wre");
    const dWre = getStat(defender, "wre");
    const roll = Math.random();
    return roll < CFG.takedown.baseSuccessChance + (aWre - dWre) / CFG.takedown.wreDiffDivisor;
}

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

function submissionDefenseMod(defender) {
    const antiSub = (getStat(defender, "sub") + getStat(defender, "wre")) / 2;
    return clamp(
        CFG.submissionDefense.base - (antiSub - CFG.submissionDefense.anchorStat) / CFG.submissionDefense.divisor,
        CFG.submissionDefense.minMod,
        CFG.submissionDefense.maxMod
    );
}

function koCheck(defender, damageThisRound, ironWillPerk = false, attacker = null) {
    const health = defender.health;
    const stamina = Math.max(0, defender.stamina ?? 100);
    const healthWindow = stamina < CFG.koCheck.healthWindow.lowStaminaThreshold
        ? CFG.koCheck.healthWindow.lowStaminaWindow
        : stamina < CFG.koCheck.healthWindow.midStaminaThreshold
            ? CFG.koCheck.healthWindow.midStaminaWindow
            : stamina < CFG.koCheck.healthWindow.highStaminaThreshold
                ? CFG.koCheck.healthWindow.highStaminaWindow
                : CFG.koCheck.healthWindow.normalWindow;
    if (health > healthWindow) return false;
    const chn = getStat(defender, "chn");
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

// ── Session bonus helpers ───────────────────────────────────────────────────

/**
 * Find the first active bonus of a given type and mark it triggered.
 * Returns the effectiveValue, or 0 if no bonus found.
 */
function triggerBonus(sessionBonuses, bonusType) {
    const bonus = sessionBonuses.find(b => b.bonusType === bonusType && b.effectiveValue > 0);
    if (!bonus) return 0;
    bonus.triggered = true;
    bonus.triggerCount = (bonus.triggerCount || 0) + 1;
    return bonus.effectiveValue;
}

/**
 * Get the effective value of a bonus type without triggering it.
 */
function getBonusValue(sessionBonuses, bonusType) {
    const bonus = sessionBonuses.find(b => b.bonusType === bonusType && b.effectiveValue > 0);
    return bonus ? bonus.effectiveValue : 0;
}

/**
 * Get a bonus entry by type (for accessing extra fields like clinchChance).
 */
function getBonus(sessionBonuses, bonusType) {
    return sessionBonuses.find(b => b.bonusType === bonusType && b.effectiveValue > 0) || null;
}

// ── Resolve round (v2 with conditional bonuses) ─────────────────────────────

function resolveRound(player, opponent, roundNum, playerStrategy, ironWillPerk = false, sessionBonuses = []) {
    const staminaDrain = CFG.round.staminaDrainBase + Math.floor(Math.random() * CFG.round.staminaDrainRandom);
    let playerDamage = 0;
    let opponentDamage = 0;
    let event = null;
    let grapplingControl = 0;
    let finished = false;
    let outcome = null;
    const campCommentary = []; // Camp-specific commentary for this round

    // ── Stamina drain ───────────────────────────────────────────────────
    // CARDIO_PUSH: fires only when player stamina is below 70%
    const currentPlayerStamina = player.stamina ?? CFG.defaults.stamina;
    let playerDrainMult = 1;
    if (currentPlayerStamina < 70) {
        const cardioBonusValue = triggerBonus(sessionBonuses, 'STAMINA_DRAIN');
        if (cardioBonusValue > 0) {
            playerDrainMult = 1 - cardioBonusValue; // e.g. 1 - 0.20 = 0.80
            campCommentary.push('campCardio');
        }
    }

    const pStamina = Math.max(0, currentPlayerStamina - Math.round(staminaDrain * playerDrainMult));
    const oStamina = Math.max(0, (opponent.stamina ?? CFG.defaults.stamina) - staminaDrain);
    const pStaminaMod = pStamina / 100;
    const oStaminaMod = oStamina / 100;

    // ── GAME_PLAN_STUDY: always active → reduce opponent damage ─────────
    const gamePlanReduction = getBonusValue(sessionBonuses, 'OPPONENT_DAMAGE_REDUCTION');
    if (gamePlanReduction > 0) {
        triggerBonus(sessionBonuses, 'OPPONENT_DAMAGE_REDUCTION');
    }

    // ── Takedown attempt phase ──────────────────────────────────────────
    const takedownChance = getTakedownAttemptChance(playerStrategy);
    if (roundNum <= CFG.round.takedownRoundsLimit && Math.random() < takedownChance) {
        const playerShoots = playerShootsTakedown(player, opponent);

        if (playerShoots && takedownSuccess(player, opponent)) {
            // Player gets top position
            let gnpDamage = Math.round((getStat(player, "gnd") * 0.4) * pStaminaMod);

            // GROUND_AND_POUND_POSTURE: +20% GnP damage from top
            const gnpBonus = triggerBonus(sessionBonuses, 'GNP_DAMAGE');
            if (gnpBonus > 0) {
                gnpDamage = Math.round(gnpDamage * (1 + gnpBonus));
                campCommentary.push('campGnpPosture');
            }

            opponentDamage = gnpDamage;
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

        } else if (!playerShoots) {
            // Opponent shoots — TAKEDOWN_DEFENCE may fire
            const sprawlBonus = getBonusValue(sessionBonuses, 'SPRAWL_SUCCESS');
            let tdSucceeded = false;

            if (sprawlBonus > 0) {
                // Reduce opponent's takedown success by the bonus
                const aWre = getStat(opponent, "wre");
                const dWre = getStat(player, "wre");
                const adjustedChance = CFG.takedown.baseSuccessChance + (aWre - dWre) / CFG.takedown.wreDiffDivisor - sprawlBonus;
                tdSucceeded = Math.random() < adjustedChance;
                triggerBonus(sessionBonuses, 'SPRAWL_SUCCESS');
                if (!tdSucceeded) {
                    campCommentary.push('campTakedownDefence');
                }
            } else {
                tdSucceeded = takedownSuccess(opponent, player);
            }

            if (tdSucceeded) {
                playerDamage = Math.round((getStat(opponent, "gnd") * 0.4) * oStaminaMod);
                event = "Opponent took you down.";
                grapplingControl = -1;

                // Opponent submission attempt
                const oppSubChance = clamp(
                    (0.25 + grapplingProfileMod(opponent)) * submissionDefenseMod(player),
                    CFG.submission.attemptMin,
                    CFG.submission.attemptMax
                );
                if (Math.random() < oppSubChance) {
                    // SUBMISSION_ESCAPES: reduce opponent's submission success
                    const escapeBonus = getBonusValue(sessionBonuses, 'ESCAPE_PROBABILITY');
                    let subSucceeded;
                    if (escapeBonus > 0) {
                        // Reduce success chance
                        const aSub = getStat(opponent, "sub");
                        const dSub = getStat(player, "sub");
                        const aWre = getStat(opponent, "wre");
                        const dWre = getStat(player, "wre");
                        const aGnd = getStat(opponent, "gnd");
                        const dGnd = getStat(player, "gnd");
                        const baseChance = clamp(
                            CFG.submission.baseChance +
                            (aSub - dSub) / CFG.submission.subDiffDivisor +
                            (aWre - dWre) / CFG.submission.wreDiffDivisor +
                            (aGnd - dGnd) / CFG.submission.gndDiffDivisor +
                            grapplingProfileMod(opponent),
                            CFG.submission.chanceMin,
                            CFG.submission.chanceMax
                        );
                        subSucceeded = Math.random() < (baseChance * (1 - escapeBonus));
                        triggerBonus(sessionBonuses, 'ESCAPE_PROBABILITY');
                        if (!subSucceeded) {
                            campCommentary.push('campSubmissionEscape');
                        }
                    } else {
                        subSucceeded = submissionSuccess(opponent, player);
                    }

                    if (subSucceeded) {
                        finished = true;
                        outcome = "Loss (submission)";
                    }
                }
            }
        }
    }

    // ── Striking exchange phase ─────────────────────────────────────────
    if (!event) {
        let oppStrike = strikeDamage(opponent, player) * getStrikeDamageMod(playerStrategy, false);
        let plStrike = strikeDamage(player, opponent) * getStrikeDamageMod(playerStrategy, true);

        // STRIKING_ACCURACY: +15% to player's strike damage
        const strikingBonus = triggerBonus(sessionBonuses, 'STRIKE_DAMAGE');
        if (strikingBonus > 0) {
            plStrike *= (1 + strikingBonus);
        }

        // GAME_PLAN_STUDY: reduce opponent damage
        if (gamePlanReduction > 0) {
            oppStrike *= (1 - gamePlanReduction);
        }

        // BODY_SHOT_FOCUS: roll for body attack (50% chance when bonus active)
        let bodyAttack = false;
        const bodyBonus = getBonus(sessionBonuses, 'BODY_DAMAGE');
        if (bodyBonus && Math.random() < 0.5) {
            bodyAttack = true;
            // Body shots do bonus damage and drain opponent stamina
            plStrike *= (1 + bodyBonus.effectiveValue);
            triggerBonus(sessionBonuses, 'BODY_DAMAGE');
            campCommentary.push('campBodyShot');
        }

        // CLINCH_CONTROL: chance of clinch during striking
        const clinchBonus = getBonus(sessionBonuses, 'CLINCH_DAMAGE');
        if (clinchBonus && Math.random() < (clinchBonus.clinchChance || 0.30)) {
            // Clinch occurs — bonus damage
            plStrike *= (1 + clinchBonus.effectiveValue);
            triggerBonus(sessionBonuses, 'CLINCH_DAMAGE');
            campCommentary.push('campClinchControl');
        }

        playerDamage = Math.round(oppStrike * oStaminaMod);
        opponentDamage = Math.round(plStrike * pStaminaMod);
        event = "Striking exchange.";

        // BODY_SHOT_FOCUS extra stamina drain on opponent
        if (bodyAttack && bodyBonus) {
            const extraDrain = Math.round(staminaDrain * (bodyBonus.bodyStaminaDrain || 0));
            opponent.stamina = Math.max(0, (opponent.stamina ?? oStamina) - extraDrain);
        }

        // Flash KO checks (unchanged)
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

    // ── Health & stamina updates ────────────────────────────────────────
    player.health = Math.max(CFG.round.healthZero, (player.health ?? CFG.defaults.health) - playerDamage);
    opponent.health = Math.max(CFG.round.healthZero, (opponent.health ?? CFG.defaults.health) - opponentDamage);
    player.stamina = pStamina;
    opponent.stamina = oStamina;

    // ── Finish checks (unchanged) ──────────────────────────────────────
    if (!finished && player.health <= 0) { finished = true; outcome = "Loss (KO/TKO)"; }
    if (!finished && opponent.health <= 0) { finished = true; outcome = "KO/TKO"; }
    if (!finished && exhaustionTkoCheck(player, playerDamage, ironWillPerk)) { finished = true; outcome = "Loss (KO/TKO)"; }
    if (!finished && exhaustionTkoCheck(opponent, opponentDamage, false)) { finished = true; outcome = "KO/TKO"; }
    if (!finished && player.health < CFG.koCheck.healthWindow.normalWindow && koCheck(player, playerDamage, ironWillPerk, opponent)) { finished = true; outcome = "Loss (KO/TKO)"; }
    if (!finished && opponent.health < CFG.koCheck.healthWindow.normalWindow && koCheck(opponent, opponentDamage, false, player)) { finished = true; outcome = "KO/TKO"; }

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
        opponentHealth: opponent.health,
        campCommentary,
    };
}

// ── Judging (unchanged) ─────────────────────────────────────────────────────

function scoreRoundForJudge(round, judgeBias) {
    const pd = round.playerDamage ?? 0;
    const od = round.opponentDamage ?? 0;
    let net = od - pd;
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
            playerRound = Math.random() < 0.5 ? 10 : 9;
        } else {
            playerRound = net > 0 ? 10 : 9;
        }
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
            const lastRound = rounds[rounds.length - 1];
            const lastNet = (lastRound?.opponentDamage ?? 0) - (lastRound?.playerDamage ?? 0);
            if (lastNet >= 0) totals.player += 1;
            else totals.opponent += 1;
        }
    }
    return { scorecard, playerRounds: totals.player, opponentRounds: totals.opponent };
}

// ── Main fight resolution (v2) ──────────────────────────────────────────────

function resolveFight(player, opponent, options = {}) {
    const maxRounds = options.maxRounds ?? CFG.defaults.maxRounds;
    const playerStrategy = options.playerStrategy || null;
    const ironWillPerk = !!options.ironWillPerk;
    const sessionBonuses = options.sessionBonuses ?? [];
    const wildcard = options.wildcard ?? null;
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

    // ── Pre-fight: Apply SPARRING_GENERAL (+10% all stats) ──────────────
    const sparringBonus = sessionBonuses.find(b => b.bonusType === 'ALL_STATS' && b.effectiveValue > 0);
    if (sparringBonus) {
        const boost = sparringBonus.effectiveValue;
        for (const k of STAT_KEYS) {
            if (typeof p[k] === "number") {
                p[k] = Math.max(1, Math.round(p[k] * (1 + boost)));
            }
        }
        sparringBonus.triggered = true;
        sparringBonus.triggerCount = 1;
    }

    // ── Wildcard: pick a round to fire (random round between 2 and maxRounds) ──
    let wildcardRound = null;
    let wildcardCountered = false;
    if (wildcard) {
        wildcardRound = 2 + Math.floor(Math.random() * Math.max(1, maxRounds - 1));
        // Check if player has the counter session
        wildcardCountered = sessionBonuses.some(
            b => b.sessionType === wildcard.counterSession && b.effectiveValue > 0
        );
    }

    for (let r = 1; r <= maxRounds; r++) {
        // Apply wildcard on the designated round
        let wildcardApplied = false;
        if (wildcard && r === wildcardRound && !wildcardCountered) {
            // Boost opponent's relevant stat temporarily
            const statKey = wildcard.stat;
            if (typeof o[statKey] === "number") {
                o[statKey] = Math.round(o[statKey] * (1 + wildcard.fightEffect));
                wildcardApplied = true;
            }
        }

        const result = resolveRound(p, o, r, playerStrategy, ironWillPerk, sessionBonuses);

        // Revert wildcard stat boost after the round
        if (wildcardApplied) {
            const statKey = wildcard.stat;
            if (typeof o[statKey] === "number") {
                o[statKey] = Math.round(o[statKey] / (1 + wildcard.fightEffect));
            }
        }

        rounds.push({
            round: r,
            event: result.event,
            grapplingControl: result.grapplingControl,
            playerDamage: result.playerDamage,
            opponentDamage: result.opponentDamage,
            playerHealth: result.playerHealth,
            opponentHealth: result.opponentHealth,
        });

        // Build commentary for this round
        const eventKey = EVENT_TO_KEY[result.event] || "strikingExchange";
        const line = getCommentaryLine(eventKey, playerName, opponentName);
        if (line) commentary.push(`Round ${r}: ${line}`);

        // Add camp-specific commentary
        for (const campKey of (result.campCommentary || [])) {
            const campLine = getCommentaryLine(campKey, playerName, opponentName);
            if (campLine) commentary.push(campLine);
        }

        // Wildcard commentary
        if (wildcard && r === wildcardRound) {
            if (wildcardCountered) {
                const wcLine = getCommentaryLine('wildcardCountered', playerName, opponentName);
                if (wcLine) commentary.push(wcLine);
            } else {
                const wcLine = getCommentaryLine('wildcardReveal', playerName, opponentName);
                if (wcLine) commentary.push(wcLine);
            }
        }

        if (result.finished) {
            const outcomeKey = outcomeToCommentaryKey(result.outcome);
            const outcomeLine = getCommentaryLine(outcomeKey, playerName, opponentName);
            if (outcomeLine) commentary.push(outcomeLine);
            let winner = "draw";
            if (result.outcome === "KO/TKO" || result.outcome === "Submission") winner = "player";
            else if (result.outcome && result.outcome.startsWith("Loss")) winner = "opponent";
            const resultLine = getResultLine(winner, result.outcome, playerName, opponentName);
            if (resultLine) commentary.push(resultLine);
            return {
                outcome: result.outcome, rounds, winner,
                playerHealthAfter: p.health, playerStaminaAfter: p.stamina,
                commentary, sessionBonuses, wildcard: wildcard ? { ...wildcard, countered: wildcardCountered } : null,
            };
        }
    }

    // Decision
    const { scorecard, playerRounds, opponentRounds } = judgeScorecard(rounds);
    let outcome;
    let winner;
    if (playerRounds > opponentRounds) {
        outcome = playerRounds === 3 ? "Decision (unanimous)" : "Decision (split)";
        winner = "player";
    } else if (opponentRounds > playerRounds) {
        outcome = "Loss (decision)";
        winner = "opponent";
    } else {
        outcome = "Draw";
        winner = "draw";
    }
    const outcomeKey = outcomeToCommentaryKey(outcome);
    const outcomeLine = getCommentaryLine(outcomeKey, playerName, opponentName);
    if (outcomeLine) commentary.push(outcomeLine);
    const resultLine = getResultLine(winner, outcome, playerName, opponentName);
    if (resultLine) commentary.push(resultLine);
    return {
        outcome, rounds, winner,
        playerHealthAfter: p.health, playerStaminaAfter: p.stamina,
        commentary, scorecard, sessionBonuses,
        wildcard: wildcard ? { ...wildcard, countered: wildcardCountered } : null,
    };
}

module.exports = { resolveFight, strikeDamage, submissionSuccess };
