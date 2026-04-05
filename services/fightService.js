const Fighter = require("../models/fighterModel");
const Opponent = require("../models/opponentModel");
const Fight = require("../models/fightModel");
const FightCamp = require("../models/fightCampModel");
const { PROMOTION_TIERS, FIGHT_OUTCOMES } = require("../consts/gameConstants");

const [
    OUT_KO_TKO,       // "KO/TKO"
    OUT_SUB,          // "Submission"
    OUT_DEC_UNAN,     // "Decision (unanimous)"
    OUT_DEC_SPLIT,    // "Decision (split)"
    OUT_DRAW,         // "Draw"
    OUT_LOSS_DEC,     // "Loss (decision)"
    OUT_LOSS_KO,      // "Loss (KO/TKO)"
    OUT_LOSS_SUB,     // "Loss (submission)"
] = FIGHT_OUTCOMES;
const campService = require("./campService");

/**
 * Tier promotion ladder derived from PROMOTION_TIERS.
 * Promotion threshold for each tier jump is the next tier's minOverall.
 * This keeps promotion logic and tier config aligned in one source of truth.
 */
const TIER_ORDER = Object.keys(PROMOTION_TIERS);

const MIN_STREAK_LENGTH    = 2;   // minimum consecutive results to show a streak badge
const LAST_RESULTS_COUNT   = 3;   // number of recent results shown on the offer card
const MAX_FIGHT_HISTORY    = 20;  // max fightHistory entries kept per opponent
const NEMESIS_WIN_BONUS    = 150; // notoriety awarded for defeating your nemesis

const OFFER_TYPE = { EASY: "Easy", EVEN: "Even", HARD: "Hard" };

// ── Nemesis helpers ───────────────────────────────────────────────────────────
const emptyNemesis = () => ({ opponentId: null, opponentName: null, lossCount: 0, setAt: null });

function getNemesisOpponentId(fighter) {
    return fighter.nemesis?.opponentId?.toString() ?? null;
}

function resolveNemesisOnWin(fighter, opponentId) {
    if (getNemesisOpponentId(fighter) !== opponentId.toString()) return false;
    fighter.nemesis.opponentId   = null;
    fighter.nemesis.opponentName = null;
    fighter.nemesis.lossCount    = 0;
    fighter.nemesis.setAt        = null;
    fighter.markModified("nemesis");
    return true;
}

function resolveNemesisOnLoss(fighter, opponentId, opponentName) {
    if (getNemesisOpponentId(fighter) === opponentId.toString()) {
        fighter.nemesis.lossCount = (fighter.nemesis.lossCount || 0) + 1;
        fighter.markModified("nemesis");
        return { wasNew: false };
    }
    fighter.nemesis.opponentId   = opponentId;
    fighter.nemesis.opponentName = opponentName;
    fighter.nemesis.lossCount    = 1;
    fighter.nemesis.setAt        = new Date();
    fighter.markModified("nemesis");
    return { wasNew: true };
}
// ─────────────────────────────────────────────────────────────────────────────

const TIER_LADDER = TIER_ORDER.slice(0, -1).map((fromTier, idx) => {
    const nextTier = TIER_ORDER[idx + 1];
    const minOverall = PROMOTION_TIERS[nextTier]?.minOverall ?? Infinity;
    return { from: fromTier, to: nextTier, minOverall };
});

/**
 * Check if a fighter qualifies for a tier promotion. Returns the new tier name or null.
 */
function checkPromotion(fighter) {
    const entry = TIER_LADDER.find((t) => t.from === fighter.promotionTier);
    if (!entry) return null;
    if ((fighter.overallRating || 0) >= entry.minOverall) return entry.to;
    return null;
}
const fighterService = require("./fighterService");
const questService = require("./questService");
const { resolveFight } = require("../utils/fightResolution");
const {
    rollForFightInjury,
    buildInjury,
    applyInjuryToFighter,
    isFightBlocked,
} = require("../utils/injuryUtils");
const { applyXpToStat, roundStatXp, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../utils/statProgression");
const notorietyService = require("./notorietyService");
const { tierRank } = require("../consts/notorietyConfig");
const { logFightResolve } = require("../utils/fightResolveLogger");

/**
 * Daily fight caps are per promotion tier. Legacy `fightsToday` was one global counter, so Amateur
 * fights incorrectly counted against Regional Pro's cap after promotion.
 */
function ensureDailyFightTierState(fighter) {
    const today = new Date().toDateString();
    if (fighter.fightDayKey == null) {
        fighter.fightsTodayByTier = fighter.fightsTodayByTier && typeof fighter.fightsTodayByTier === "object"
            ? { ...fighter.fightsTodayByTier }
            : {};
        if (fighter.lastFightDate && fighter.lastFightDate.toDateString() === today && (fighter.fightsToday || 0) > 0) {
            fighter.fightsTodayByTier.Amateur = (fighter.fightsTodayByTier.Amateur || 0) + (fighter.fightsToday || 0);
        }
        fighter.fightDayKey = today;
        return;
    }
    if (fighter.fightDayKey !== today) {
        fighter.fightsTodayByTier = {};
        fighter.fightDayKey = today;
        fighter.fightsToday = 0;
    }
    if (!fighter.fightsTodayByTier || typeof fighter.fightsTodayByTier !== "object") {
        fighter.fightsTodayByTier = {};
    }
}

function incrementFightsTodayForTier(fighter, tier) {
    ensureDailyFightTierState(fighter);
    fighter.fightsTodayByTier[tier] = (fighter.fightsTodayByTier[tier] || 0) + 1;
    fighter.fightsToday = (fighter.fightsToday || 0) + 1;
    fighter.lastFightDate = new Date();
}

/**
 * Generate 3 fight offers for the fighter (Easy, Even, Hard).
 * Uses opponents in DB for same weight class and promotion tier.
 */
function computeStreak(fightHistory) {
    if (!fightHistory || fightHistory.length < MIN_STREAK_LENGTH) return null;
    const last = fightHistory[fightHistory.length - 1];
    let count = 0;
    for (let i = fightHistory.length - 1; i >= 0; i--) {
        if (fightHistory[i].result === last.result) count++;
        else break;
    }
    if (count < MIN_STREAK_LENGTH) return null;
    return { result: last.result, count };
}

function classifyOfferType(nemesisOvr, fighterOvr) {
    const diff = nemesisOvr - fighterOvr;
    if (diff <= -3) return OFFER_TYPE.EASY;
    if (diff >= 2)  return OFFER_TYPE.HARD;
    return OFFER_TYPE.EVEN;
}

function buildOfferContext(opp) {
    const history = opp.fightHistory ?? [];
    // Derive record from fightHistory so it always reflects actual fights played.
    // Static opponent.record is seeded flavour only — never used for display.
    const record = history.reduce(
        (acc, f) => {
            if (f.result === "win")  acc.wins++;
            else if (f.result === "loss") acc.losses++;
            else acc.draws++;
            return acc;
        },
        { wins: 0, losses: 0, draws: 0 }
    );
    return {
        record,
        streak:    computeStreak(history),
        lastThree: history.slice(-LAST_RESULTS_COUNT).reverse(),
    };
}

async function generateOffers(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const blockingInjury = isFightBlocked(fighter);
    if (blockingInjury) {
        throw new Error(`Cannot fight: ${blockingInjury.label} requires a doctor visit first.`);
    }

    const tier = fighter.promotionTier;
    const tierConfig = PROMOTION_TIERS[tier];
    if (!tierConfig) throw new Error("Invalid promotion tier");

    const overall = fighter.overallRating || 14;
    const weightClass = fighter.weightClass;

    const randomOpp = (match) =>
        Opponent.aggregate([{ $match: match }, { $sample: { size: 1 } }]);

    // Resolve nemesis first so we can force them into the correct slot
    let nemesisMeta = null;
    let nemesisOpp  = null;
    if (fighter.nemesis?.opponentId) {
        const found = await Opponent.findById(fighter.nemesis.opponentId).lean();
        if (!found || found.promotionTier !== fighter.promotionTier) {
            fighter.nemesis = emptyNemesis();
            await fighter.save();
        } else {
            nemesisOpp  = found;
            nemesisMeta = { lossCount: fighter.nemesis.lossCount, setAt: fighter.nemesis.setAt };
        }
    }

    // Determine which slot the nemesis belongs to based on OVR distance
    const nemesisType = nemesisOpp ? classifyOfferType(nemesisOpp.overallRating, overall) : null;

    const base    = { weightClass, promotionTier: tier };
    const exclude = [];
    if (nemesisOpp) exclude.push(nemesisOpp._id); // never double-pick the nemesis

    const easyOpp = await randomOpp({ ...base, overallRating: { $gte: Math.max(12, overall - 5), $lte: overall - 3 }, _id: { $nin: exclude } });
    if (easyOpp[0]) exclude.push(easyOpp[0]._id);

    const evenOpp = await randomOpp({ ...base, overallRating: { $gte: overall - 3, $lte: overall + 3 }, _id: { $nin: exclude } });
    if (evenOpp[0]) exclude.push(evenOpp[0]._id);

    const hardOpp = await randomOpp({ ...base, overallRating: { $gte: overall + 2, $lte: Math.min(95, overall + 5) }, _id: { $nin: exclude } });

    // Build slot map; nemesis replaces whichever slot they belong to
    const slots = {
        [OFFER_TYPE.EASY]: easyOpp[0] ? { type: OFFER_TYPE.EASY, opponent: easyOpp[0], context: buildOfferContext(easyOpp[0]) } : null,
        [OFFER_TYPE.EVEN]: evenOpp[0] ? { type: OFFER_TYPE.EVEN, opponent: evenOpp[0], context: buildOfferContext(evenOpp[0]) } : null,
        [OFFER_TYPE.HARD]: hardOpp[0] ? { type: OFFER_TYPE.HARD, opponent: hardOpp[0], context: buildOfferContext(hardOpp[0]) } : null,
    };
    if (nemesisOpp && nemesisType) {
        slots[nemesisType] = { type: nemesisType, opponent: nemesisOpp, context: buildOfferContext(nemesisOpp), nemesisMeta };
    }

    return Object.values(OFFER_TYPE).filter(t => slots[t]).map(t => slots[t]);
}

/**
 * Create a fight offer (persist) and return the fight. Does not deduct energy yet.
 */
async function createOffer(fighterId, opponentId, offerType) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    const opponent = await Opponent.findById(opponentId);
    if (!opponent) throw new Error("Opponent not found");
    if (opponent.weightClass !== fighter.weightClass) throw new Error("Weight class mismatch");
    if (opponent.promotionTier !== fighter.promotionTier) throw new Error("Promotion tier mismatch");

    const fight = new Fight({
        fighterId,
        opponentId: opponent._id,
        offerType: offerType || "Even",
        promotionTier: fighter.promotionTier,
        status: "offered"
    });
    await fight.save();
    return fight;
}

/**
 * Accept a fight offer: deduct energy, set status to accepted, link to fighter.
 */
async function acceptOffer(fighterId, fightId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const fight = await Fight.findOne({ _id: fightId, fighterId, status: "offered" });
    if (!fight) throw new Error("Fight not found or not available");

    ensureDailyFightTierState(fighter);
    if (fighter.isModified && fighter.isModified()) await fighter.save();

    const tierConfig = PROMOTION_TIERS[fight.promotionTier];
    const dailyCap = tierConfig ? tierConfig.dailyFightCap : 1;
    const fightsThisTierToday = fighter.fightsTodayByTier[fight.promotionTier] || 0;
    if (fightsThisTierToday >= dailyCap) {
        throw new Error(`Daily fight cap reached for ${fight.promotionTier} (${dailyCap}/day). Come back tomorrow.`);
    }

    const energyCost = tierConfig ? tierConfig.fightEnergyCost : 10;
    await fighterService.deductEnergy(fighterId, energyCost);

    fight.status = "accepted";
    await fight.save();

    await Fighter.findByIdAndUpdate(fighterId, {
        acceptedFightId: fight._id,
        trainingCampActions: 0,
    });

    // Create the FightCamp document for this fight
    await campService.createCamp(fight._id, fighterId, fight.promotionTier, false);

    return fight;
}

/**
 * Set weight cut strategy for the accepted fight (GDD 8.8).
 * easy = 100% stamina, 0% miss risk
 * moderate = 90% stamina, 5% miss risk, +5 max stamina for fight
 * aggressive = 75% stamina, 20% miss risk, +12 max stamina for fight
 */
async function setWeightCut(fighterId, fightId, weightCut) {
    const valid = ["easy", "moderate", "aggressive"];
    if (!valid.includes(weightCut)) throw new Error("Invalid weight cut strategy");
    const fight = await Fight.findOne({ _id: fightId, fighterId, status: "accepted" });
    if (!fight) throw new Error("Fight not found or not accepted");
    fight.weightCut = weightCut;
    await fight.save();
    return fight;
}

/**
 * Set fight strategy for the accepted fight (GDD 8.3). Call before resolve.
 */
async function setStrategy(fighterId, fightId, strategy) {
    const { FIGHT_STRATEGIES } = require("../consts/gameConstants");
    if (!FIGHT_STRATEGIES || !Object.keys(FIGHT_STRATEGIES).includes(strategy)) {
        throw new Error("Invalid strategy");
    }
    const fight = await Fight.findOne({ _id: fightId, fighterId, status: "accepted" });
    if (!fight) throw new Error("Fight not found or not accepted");
    fight.playerStrategy = strategy;
    await fight.save();
    return fight;
}

/**
 * Legacy TCA penalty — applied to fights accepted before the camp overhaul.
 * Kept as a backward-compat fallback; removed from the main path.
 */
function applyLegacyTcaPenalty(fightPlayer, fighter, tierConfig) {
    const recommendedTca = (tierConfig && tierConfig.recommendedTca) || 2;
    const tca = fighter.trainingCampActions ?? 0;
    const statPenalty = (tierConfig && tierConfig.penaltyStatPct) || 0.1;
    const staminaPenalty = (tierConfig && tierConfig.penaltyStaminaPct) || 0;
    const underCamped = tca < recommendedTca;
    if (!underCamped) return;
    const statMult = Math.max(0.5, 1 - statPenalty * (1 - tca / recommendedTca));
    const staminaMult = staminaPenalty > 0
        ? Math.max(0.5, 1 - staminaPenalty * (1 - tca / recommendedTca))
        : 1;
    ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"].forEach((k) => {
        if (typeof fightPlayer[k] === "number") fightPlayer[k] = Math.max(1, Math.round(fightPlayer[k] * statMult));
    });
    const maxSt = fightPlayer.maxStamina ?? 100;
    fightPlayer.stamina = Math.round((fightPlayer.stamina ?? maxSt) * staminaMult);
    fightPlayer.maxStamina = Math.round(maxSt * staminaMult);
}

/**
 * Resolve the accepted fight: run simulation, apply outcome, update fighter and fight.
 */
async function resolveFightAndApply(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);
    if (!fighter.acceptedFightId) throw new Error("No accepted fight");

    const fight = await Fight.findById(fighter.acceptedFightId).populate("opponentId");
    if (!fight || fight.status !== "accepted") throw new Error("Fight not found or not accepted");

    const opponent = fight.opponentId;
    if (!opponent) throw new Error("Opponent not found");

    // GDD 8.9: Block fight if injury requires doctor visit first
    const blockingInjury = isFightBlocked(fighter);
    if (blockingInjury) {
        throw new Error(`Cannot fight: ${blockingInjury.label} requires a doctor visit first.`);
    }

    // GDD 8.5: Block fight if mental reset is required after 3 consecutive losses
    if (fighter.mentalResetRequired) {
        throw new Error("Mental Reset required before next fight. Complete the Mental Reset activity first.");
    }

    const tierConfig = PROMOTION_TIERS[fight.promotionTier];
    const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

    // Build a mutable copy of the fighter's stats for the fight simulation.
    // All modifiers are applied to this copy — the real fighter document is never mutated.
    const fightPlayer = { ...fighter.toObject() };

    // Load the FightCamp for this fight (created on accept; may be absent for old fights)
    const fightCamp = await FightCamp.findOne({ fightId: fight._id });

    if (fightCamp?.finalisedAt) {
        // ── Camp v2: NO flat stat modifier ───────────────────────────────────
        // Session bonuses are conditional and applied during fight resolution.
        // Only injury penalties still modify stats pre-fight.

        // Camp injury penalty (only if fighter pushed through sparring injury)
        if (fightCamp.injuryChoice === "PUSH_THROUGH" && fightCamp.injuryPenalty) {
            const pen = fightCamp.injuryPenalty;
            STAT_KEYS.forEach((k) => {
                if (pen[k] && typeof fightPlayer[k] === "number")
                    fightPlayer[k] = Math.max(1, Math.round(fightPlayer[k] * (1 + pen[k])));
            });
            if (pen.maxStamina) {
                const maxSt = fightPlayer.maxStamina ?? 100;
                fightPlayer.maxStamina = Math.round(maxSt * (1 + pen.maxStamina));
                fightPlayer.stamina = Math.min(fightPlayer.stamina ?? maxSt, fightPlayer.maxStamina);
            }
        }
    } else {
        // ── Legacy TCA fallback (for fights accepted before this deploy) ─────
        applyLegacyTcaPenalty(fightPlayer, fighter, tierConfig);
    }

    // GDD 8.8 (revised): Weight cut — stamina gamble with miss risk
    // Easy: no change. Moderate/Aggressive: random stamina roll (can be negative).
    const weightCut = fight.weightCut || "easy";
    const WEIGHT_CUT_CONFIG = {
        easy:       { min: 0,  max: 0,  missPct: 0    },
        moderate:   { min: -5, max: 10, missPct: 0.05 },
        aggressive: { min: -12, max: 18, missPct: 0.20 },
    };
    const wcConfig = WEIGHT_CUT_CONFIG[weightCut];
    const weightCutRoll = wcConfig.min === 0 && wcConfig.max === 0
        ? 0
        : wcConfig.min + Math.floor(Math.random() * (wcConfig.max - wcConfig.min + 1));
    fightPlayer.stamina = Math.max(1, (fightPlayer.stamina ?? 100) + weightCutRoll);
    const weightMissed = wcConfig.missPct > 0 && Math.random() < wcConfig.missPct;
    fight.weightCutRoll = weightCutRoll;

    const playerName = fighter.nickname
        ? `${fighter.firstName} "${fighter.nickname}" ${fighter.lastName}`
        : `${fighter.firstName} ${fighter.lastName}`;
    const opponentName = opponent.nickname
        ? `${opponent.name} "${opponent.nickname}"`
        : opponent.name;

    // GDD 7.4: Iron Will perk → pass flag to reduce KO probability
    const ironWillPerk = !!(fighter.activePerks && fighter.activePerks.ironWill);
    // v2: pass conditional session bonuses and wildcard instead of flat campBonuses
    const sessionBonuses = fightCamp?.sessionBonuses ? [...fightCamp.sessionBonuses.map(b => ({ ...b }))] : [];
    const wildcard = fightCamp?.wildcard ?? null;
    const result = resolveFight(fightPlayer, opponent, {
        playerStrategy: fight.playerStrategy || undefined,
        playerName,
        opponentName,
        ironWillPerk,
        sessionBonuses,
        wildcard,
    });

    // v2: save triggered session bonuses back to FightCamp for post-fight display
    if (fightCamp && result.sessionBonuses) {
        fightCamp.sessionBonuses = result.sessionBonuses;
        await fightCamp.save();
    }

    logFightResolve({
        fighter,
        fight,
        fightPlayer,
        opponent,
        result,
        campRating: fightCamp?.campRating ?? null,
        sessionBonuses: result.sessionBonuses ?? [],
        wildcard: result.wildcard ?? null,
        weightCut,
        weightCutRoll,
        weightMissed,
        ironWillPerk,
    });

    const isWin = [OUT_KO_TKO, OUT_SUB, OUT_DEC_UNAN, OUT_DEC_SPLIT].includes(result.outcome);
    const isDraw = result.outcome === OUT_DRAW;
    const isLoss = !isWin && !isDraw;
    const isKoLoss = result.outcome === OUT_LOSS_KO || result.outcome === OUT_LOSS_SUB;

    // GDD 8.5 XP multipliers (corrected)
    let xpMult;
    if (result.outcome === OUT_KO_TKO)      xpMult = 1.3;
    else if (result.outcome === OUT_SUB)      xpMult = 1.25;
    else if (result.outcome === OUT_DEC_UNAN) xpMult = 1.1;
    else if (result.outcome === OUT_DEC_SPLIT) xpMult = 1.05;
    else if (result.outcome === OUT_DRAW)     xpMult = 1.0;
    else if (result.outcome === OUT_LOSS_DEC) xpMult = 0.8;
    else                                      xpMult = 0.7; // Loss by KO/TKO or submission

    // GDD 8.6: Comeback Mode → 1.5× XP multiplier on comeback fight
    const isComeback = !!fighter.comebackMode;
    if (isComeback) xpMult = +(xpMult * 1.5).toFixed(2);

    // GDD 8.8: Weight miss → -20% iron purse + notoriety penalty
    const basePurse = tierConfig && fight.promotionTier !== "Amateur" ? Math.max(0, tierConfig.signingFee || 0) : 0;
    const outcomeIronMult = isWin ? 1 : (isDraw ? 0.5 : 0.7);
    // GDD 7.4: The Grind perk → +500 iron per fight while enrolled at that gym
    const grindBonus = (fighter.activePerks?.theGrindGymId &&
        String(fighter.activePerks.theGrindGymId) === String(fighter.gymId)) ? 500 : 0;
    const notorietyPurseFrac = notorietyService.getNotorietyPurseFraction(fighter.notoriety.peakTier);
    const comebackPurseFrac = isComeback ? 0.3 : 0;
    let ironEarned = Math.round(
        basePurse * outcomeIronMult * (1 + notorietyPurseFrac + comebackPurseFrac)
    ) + grindBonus;
    if (weightMissed) ironEarned = Math.round(ironEarned * 0.8);

    const wasFrozenBeforeFight = !!fighter.notoriety.isFrozen;
    const prevConsecutiveLosses = fighter.consecutiveLosses || 0;
    const prevWinStreak = fighter.winStreak || 0;
    const peakTierBefore = fighter.notoriety.peakTier;
    const opponentOvr = opponent.overallRating ?? 14;
    const fighterOvr = fighter.overallRating ?? 14;
    const healthEnd = result.playerHealthAfter ?? 100;
    const isFinishWin = isWin && (result.outcome === OUT_KO_TKO || result.outcome === OUT_SUB);
    const promoTier = fight.promotionTier;
    const firstFinishInThisPromotion =
        isFinishWin &&
        !(fighter.notoriety.firstFinishPromoTiers || []).includes(promoTier);
    const fightOfTheNight =
        isWin &&
        (result.outcome === OUT_DEC_UNAN || result.outcome === OUT_DEC_SPLIT) &&
        healthEnd < 50;
    const giantKiller = isWin && opponentOvr >= fighterOvr + 10;

    // Build fight XP totals
    const fightXp = {};
    if (isWin && result.outcome === OUT_KO_TKO) {
        fightXp.STR = 30; fightXp.CHN = 15; fightXp.SPD = 10;
    } else if (isWin && result.outcome === OUT_SUB) {
        fightXp.SUB = 30; fightXp.GND = 20; fightXp.WRE = 10;
    } else if (isWin) {
        ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"].forEach(s => { fightXp[s] = 15; });
        fightXp.FIQ = 20;
    } else if (isKoLoss) {
        fightXp.CHN = 20; fightXp.FIQ = 15;
    } else if (isLoss) {
        fightXp.FIQ = 25;
    }

    fight.status = "completed";
    fight.outcome = result.outcome;
    fight.ironEarned = ironEarned;
    fight.xpMultiplier = xpMult;
    fight.rounds = (result.rounds || []).map(r => `${r.round}: ${r.event} (P ${r.playerHealth} / O ${r.opponentHealth})`);
    fight.commentary = result.commentary || [];
    fight.completedAt = new Date();
    await fight.save();

    // GDD: post-fight health and stamina reflect fight outcome; recover via Rest/Recovery.
    const maxStamina = fighter.maxStamina ?? 100;
    fighter.health = Math.min(100, result.playerHealthAfter ?? 100);
    fighter.stamina = Math.min(maxStamina, result.playerStaminaAfter ?? maxStamina);
    fighter.acceptedFightId = null;
    fighter.trainingCampActions = 0;
    fighter.weightCut = "easy"; // reset for next fight

    // GDD 8.9: Roll for fight injuries; always add concussion on KO/TKO/Sub loss
    const injuriesSustained = [];
    if (isKoLoss) {
        const concussion = buildInjury("concussion");
        if (concussion) {
            applyInjuryToFighter(fighter, concussion);
            fighter.injuries = [...(fighter.injuries || []), concussion];
            injuriesSustained.push(concussion.label);
        }
    } else {
        const injuryRiskMult = (tierConfig && tierConfig.injuryRiskMult) || 1;
        const fightInjuryType = rollForFightInjury(fighter.fiq || 10, injuryRiskMult);
        if (fightInjuryType) {
            const inj = buildInjury(fightInjuryType);
            if (inj) {
                applyInjuryToFighter(fighter, inj);
                fighter.injuries = [...(fighter.injuries || []), inj];
                injuriesSustained.push(inj.label);
            }
        }
    }

    let nemesisCleared = false;
    let nemesisSet     = false;
    let nemesisName    = null;

    if (isWin) {
        fighter.record.wins += 1;
        if (result.outcome === OUT_KO_TKO) fighter.record.koWins += 1;
        else if (result.outcome === OUT_SUB) fighter.record.subWins += 1;
        else fighter.record.decisionWins += 1;
        fighter.consecutiveLosses = 0;
        fighter.mentalResetRequired = false;
        fighter.winStreak = (fighter.winStreak || 0) + 1;
        fighter.notoriety.isFrozen = false;

        // GDD 8.6: Win on a comeback → earn Resilience badge
        if (isComeback) {
            fighter.badges = fighter.badges || [];
            if (!fighter.badges.includes("Resilience")) {
                fighter.badges.push("Resilience");
            }
        }
        fighter.comebackMode = false;

        // Nemesis: defeat your nemesis → clear + record their name for summary
        const prevNemesisName = fighter.nemesis?.opponentName ?? null;
        nemesisCleared = resolveNemesisOnWin(fighter, opponent._id);
        if (nemesisCleared) nemesisName = prevNemesisName;
    } else if (isLoss) {
        fighter.record.losses += 1;
        const newConsecLosses = (fighter.consecutiveLosses || 0) + 1;
        fighter.consecutiveLosses = newConsecLosses;
        fighter.comebackMode = true;
        fighter.winStreak = 0;

        // GDD 8.5: 3 consecutive losses → Mental Reset required
        if (newConsecLosses >= 3) {
            fighter.mentalResetRequired = true;
            fighter.notoriety.isFrozen = true;
        }

        // Nemesis: the NPC that just beat us becomes (or stays) the nemesis
        const nemesisResult = resolveNemesisOnLoss(fighter, opponent._id, opponent.name);
        if (nemesisResult.wasNew) { nemesisSet = true; nemesisName = opponent.name; }
    } else {
        fighter.record.draws += 1;
        fighter.winStreak = 0;
    }

    fighter.iron += ironEarned;

    // ── Update opponent fightHistory only (record stays seeded — avoids inflation) ──
    const oppResult = isWin ? "loss" : isDraw ? "draw" : "win";
    const oppMethod = (() => {
        if (result.outcome === OUT_KO_TKO || result.outcome === OUT_LOSS_KO)  return OUT_KO_TKO;
        if (result.outcome === OUT_SUB     || result.outcome === OUT_LOSS_SUB) return OUT_SUB;
        return "Decision";
    })();
    const oppRound = result.rounds?.length ?? 1;

    opponent.fightHistory = opponent.fightHistory || [];
    opponent.fightHistory.push({ result: oppResult, method: oppMethod, round: oppRound });
    if (opponent.fightHistory.length > MAX_FIGHT_HISTORY) {
        opponent.fightHistory.splice(0, opponent.fightHistory.length - MAX_FIGHT_HISTORY);
    }
    await opponent.save();
    // ─────────────────────────────────────────────────────────────────────

    const winStreakAfterWin = isWin ? (fighter.winStreak || 0) : 0;
    const awardCtx = {
        promotionTier: promoTier,
        outcome: result.outcome,
        weightMissed,
        wasFrozenBeforeFight,
        isWin,
        opponentOverall: opponentOvr,
        fighterOverall: fighterOvr,
        prevConsecutiveLosses,
        winStreakAfterWin,
        firstFinishInThisPromotion,
        fightOfTheNight,
        giantKiller,
        grudgeMatchWin: false,
        titleFightWin: false,
        titleDefenceWin: false,
        finishedHigherRanked: false,
    };
    const fightNotoriety = notorietyService.computeFightNotorietyAward(awardCtx);
    let notorietyGain = fightNotoriety.total;
    const notorietyBreakdown = fightNotoriety.breakdown;

    if (notorietyGain !== 0) {
        notorietyService.applyNotorietyDelta(fighter, notorietyGain, {});
    }

    // Nemesis win bonus — awarded even if notoriety is frozen (skip freeze block)
    if (nemesisCleared) {
        notorietyBreakdown.push({ code: "NEMESIS_WIN", amount: NEMESIS_WIN_BONUS, note: "Nemesis defeated" });
        notorietyGain += NEMESIS_WIN_BONUS;
        notorietyService.applyNotorietyDelta(fighter, NEMESIS_WIN_BONUS, { skipFreezeBlock: true });
    }

    if (firstFinishInThisPromotion && isFinishWin) {
        notorietyService.registerFirstFinishInPromotion(fighter, promoTier);
    }
    const milestoneResult = isWin ? notorietyService.applyWinMilestoneBonuses(fighter) : { bonus: 0, notes: [] };
    notorietyService.touchLastEvent(fighter);

    let notorietyTierUp = null;
    if (tierRank(fighter.notoriety.peakTier) > tierRank(peakTierBefore)) {
        notorietyTierUp = { from: peakTierBefore, to: fighter.notoriety.peakTier };
    }

    incrementFightsTodayForTier(fighter, promoTier);

    /** Same progression as training: XP banks toward the next point, then stat increases (fixes raw XP like 80/50). */
    const statLevelUps = [];
    const fightXpApplied = {};
    if (Object.keys(fightXp).length > 0) {
        for (const [statName, baseXp] of Object.entries(fightXp)) {
            const xpAmount = Math.round(baseXp);
            fightXpApplied[statName] = xpAmount;
            const xpKey = STAT_TO_XP_KEY[statName];
            const valKey = STAT_TO_VAL_KEY[statName];
            if (!xpKey || !valKey) continue;
            const currentStat = fighter[valKey] ?? 10;
            const currentXp = fighter[xpKey] ?? 0;
            const { newStat, newXp } = applyXpToStat(
                currentStat,
                currentXp,
                xpAmount,
                100,
                { fightMode: true }
            );
            if (newStat > currentStat) statLevelUps.push(statName);
            fighter[valKey] = newStat;
            fighter[xpKey] = roundStatXp(newXp);
        }
    }

    await fighter.save();
    const { calculateOverall } = require("../utils/overallRating");
    fighter.overallRating = calculateOverall(fighter);

    // Tier promotion check — happens after overall is updated
    const oldTier = fighter.promotionTier;
    const newTier = checkPromotion(fighter);
    if (newTier) {
        fighter.promotionTier = newTier;
    }
    await fighter.save();

    // GDD 7.4: update quest progress after fight
    const completedQuests = await questService.onFight(fighterId, fighter, fight);

    const maxStaminaVal = fighter.maxStamina ?? 100;
    const staminaEnd = result.playerStaminaAfter ?? maxStaminaVal;
    const promoted = newTier ? { from: oldTier, to: newTier } : null;
    const summary = {
        outcome: result.outcome,
        recordChange: isWin ? "W" : isLoss ? "L" : "D",
        recordAfter: `${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}`,
        healthStart: 100,
        healthEnd,
        healthLost: Math.max(0, 100 - healthEnd),
        staminaStart: maxStaminaVal,
        staminaEnd,
        staminaLost: Math.max(0, maxStaminaVal - staminaEnd),
        ironEarned,
        notorietyGained: notorietyGain,
        notorietyBreakdown,
        notorietyTierUp,
        notorietyFrozen: !!fighter.notoriety.isFrozen,
        milestoneNotoriety: milestoneResult,
        xpGained: fightXpApplied,
        statLevelUps,
        xpMultiplier: xpMult,
        isComeback,
        weightCut,
        weightCutRoll,
        weightMissed,
        injuriesSustained,
        newBadges: (isWin && isComeback) ? ["Resilience"] : [],
        mentalResetRequired: !!fighter.mentalResetRequired,
        completedQuests: completedQuests.map((q) => q.title),
        promoted,
        nemesisCleared,
        nemesisSet,
        nemesisName,
        // v2: post-fight camp breakdown
        campBreakdown: fightCamp ? {
            rating: fightCamp.campRating,
            sessions: (result.sessionBonuses || []).map(b => ({
                label: b.label,
                sessionType: b.sessionType,
                matchStatus: b.matchStatus,
                triggered: b.triggered,
                triggerCount: b.triggerCount || 0,
                description: b.description,
            })),
            wildcard: result.wildcard ? {
                description: result.wildcard.description,
                wasCountered: result.wildcard.countered ?? false,
            } : null,
        } : null,
    };

    return { fight, fighter: fighterService.toPublicFighter(fighter), result, summary };
}

/**
 * Get current fight offers (from Fight collection with status offered for this fighter) or generate new ones.
 */
async function getOffers(fighterId) {
    const offered = await Fight.find({ fighterId, status: "offered" }).populate("opponentId").sort({ createdAt: -1 }).limit(10);
    return offered;
}

module.exports = {
    generateOffers,
    createOffer,
    acceptOffer,
    setStrategy,
    setWeightCut,
    resolveFightAndApply,
    getOffers,
};
