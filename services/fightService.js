const Fighter = require("../models/fighterModel");
const Opponent = require("../models/opponentModel");
const Fight = require("../models/fightModel");
const { PROMOTION_TIERS } = require("../consts/gameConstants");

/**
 * Tier promotion ladder. Each entry describes when a fighter advances to the next tier.
 * A fighter is promoted when their overallRating reaches the threshold AND they are winning
 * at their current tier (checked by record at time of fight).
 */
const TIER_LADDER = [
    { from: "Amateur",        to: "Regional Pro",   minOverall: 28 },
    { from: "Regional Pro",   to: "National",       minOverall: 44 },
    { from: "National",       to: "GCS Contender",  minOverall: 60 },
    { from: "GCS Contender",  to: "GCS",            minOverall: 72 },
];

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
const { applyXpToStat, STAT_TO_XP_KEY, STAT_TO_VAL_KEY } = require("../utils/statProgression");

/**
 * Generate 3 fight offers for the fighter (Easy, Even, Hard).
 * Uses opponents in DB for same weight class and promotion tier.
 */
async function generateOffers(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const tier = fighter.promotionTier;
    const tierConfig = PROMOTION_TIERS[tier];
    if (!tierConfig) throw new Error("Invalid promotion tier");

    const overall = fighter.overallRating || 14;
    const weightClass = fighter.weightClass;

    const [easyOpp, evenOpp, hardOpp] = await Promise.all([
        Opponent.find({
            weightClass,
            promotionTier: tier,
            overallRating: { $gte: Math.max(12, overall - 5), $lte: overall - 3 },
            _id: { $ne: fighter.acceptedFightId }
        }).limit(1).lean(),
        Opponent.find({
            weightClass,
            promotionTier: tier,
            overallRating: { $gte: overall - 3, $lte: overall + 3 }
        }).limit(1).lean(),
        Opponent.find({
            weightClass,
            promotionTier: tier,
            overallRating: { $gte: overall + 2, $lte: Math.min(95, overall + 5) }
        }).limit(1).lean()
    ]);

    const offers = [];
    if (easyOpp[0]) offers.push({ type: "Easy", opponent: easyOpp[0] });
    if (evenOpp[0]) offers.push({ type: "Even", opponent: evenOpp[0] });
    if (hardOpp[0]) offers.push({ type: "Hard", opponent: hardOpp[0] });

    return offers;
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
    const fight = await Fight.findOne({ _id: fightId, fighterId, status: "offered" });
    if (!fight) throw new Error("Fight not found or not available");

    const tierConfig = PROMOTION_TIERS[fight.promotionTier];
    const energyCost = tierConfig ? tierConfig.fightEnergyCost : 10;
    await fighterService.deductEnergy(fighterId, energyCost);

    fight.status = "accepted";
    await fight.save();

    await Fighter.findByIdAndUpdate(fighterId, {
        acceptedFightId: fight._id,
        trainingCampActions: 0
    });

    return fight;
}

/**
 * Add one training camp action (TCA) for the accepted fight.
 */
async function addCampAction(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    if (!fighter.acceptedFightId) throw new Error("No accepted fight");

    fighter.trainingCampActions = (fighter.trainingCampActions || 0) + 1;
    await fighter.save();
    return fighter;
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
 * Resolve the accepted fight: run simulation, apply outcome, update fighter and fight.
 */
async function resolveFightAndApply(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
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
    const energyCost = tierConfig ? tierConfig.fightEnergyCost : 10;
    await fighterService.deductEnergy(fighterId, energyCost);

    // GDD 8.2: Apply training camp penalty when TCA < recommended
    const recommendedTca = (tierConfig && tierConfig.recommendedTca) || 2;
    const tca = fighter.trainingCampActions ?? 0;
    const statPenalty = (tierConfig && tierConfig.penaltyStatPct) || 0.1;
    const staminaPenalty = (tierConfig && tierConfig.penaltyStaminaPct) || 0;
    const underCamped = tca < recommendedTca;
    const statMult = underCamped ? Math.max(0.5, 1 - statPenalty * (1 - tca / recommendedTca)) : 1;
    const staminaMult = underCamped && staminaPenalty > 0 ? Math.max(0.5, 1 - staminaPenalty * (1 - tca / recommendedTca)) : 1;

    const fightPlayer = { ...fighter.toObject() };
    if (underCamped) {
        ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"].forEach((k) => {
            if (typeof fightPlayer[k] === "number") fightPlayer[k] = Math.max(1, Math.round(fightPlayer[k] * statMult));
        });
        const maxSt = fightPlayer.maxStamina ?? 100;
        fightPlayer.stamina = Math.round((fightPlayer.stamina ?? maxSt) * staminaMult);
        fightPlayer.maxStamina = Math.round(maxSt * staminaMult);
    }

    // GDD 8.8: Apply weight cut modifier to fight player stats
    const weightCut = fight.weightCut || "easy";
    const WEIGHT_CUT_CONFIG = {
        easy:       { staminaPct: 1.0,  missPct: 0,    maxStaminaBonus: 0  },
        moderate:   { staminaPct: 0.9,  missPct: 0.05, maxStaminaBonus: 5  },
        aggressive: { staminaPct: 0.75, missPct: 0.20, maxStaminaBonus: 12 },
    };
    const wcConfig = WEIGHT_CUT_CONFIG[weightCut];
    const baseFightMaxStamina = fightPlayer.maxStamina ?? 100;
    fightPlayer.maxStamina = Math.round(baseFightMaxStamina + wcConfig.maxStaminaBonus);
    fightPlayer.stamina = Math.round((fightPlayer.stamina ?? baseFightMaxStamina) * wcConfig.staminaPct);
    const weightMissed = wcConfig.missPct > 0 && Math.random() < wcConfig.missPct;

    const playerName = fighter.nickname
        ? `${fighter.firstName} "${fighter.nickname}" ${fighter.lastName}`
        : `${fighter.firstName} ${fighter.lastName}`;
    const opponentName = opponent.nickname
        ? `${opponent.name} "${opponent.nickname}"`
        : opponent.name;

    // GDD 7.4: Iron Will perk → pass flag to reduce KO probability
    const result = resolveFight(fightPlayer, opponent, {
        playerStrategy: fight.playerStrategy || undefined,
        playerName,
        opponentName,
        ironWillPerk: !!(fighter.activePerks && fighter.activePerks.ironWill),
    });

    const isWin = ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"].includes(result.outcome);
    const isDraw = result.outcome === "Draw";
    const isLoss = !isWin && !isDraw;
    const isKoLoss = result.outcome === "Loss (KO/TKO)" || result.outcome === "Loss (submission)";

    // GDD 8.5 XP multipliers (corrected)
    let xpMult;
    if (result.outcome === "KO/TKO")               xpMult = 1.3;
    else if (result.outcome === "Submission")       xpMult = 1.25;
    else if (result.outcome === "Decision (unanimous)") xpMult = 1.1;
    else if (result.outcome === "Decision (split)") xpMult = 1.05;
    else if (result.outcome === "Draw")             xpMult = 1.0;
    else if (result.outcome === "Loss (decision)")  xpMult = 0.8;
    else                                            xpMult = 0.7; // Loss by KO/TKO or submission

    // GDD 8.6: Comeback Mode → 1.5× XP multiplier on comeback fight
    const isComeback = !!fighter.comebackMode;
    if (isComeback) xpMult = +(xpMult * 1.5).toFixed(2);

    // GDD 8.8: Weight miss → -20% iron purse + notoriety penalty
    const comebackIronMult = isComeback ? 1.3 : 1;
    const basePurse = tierConfig && fight.promotionTier !== "Amateur" ? (tierConfig.signingFee ? 1500 : 500) : 0;
    const outcomeIronMult = isWin ? 1 : (isDraw ? 0.5 : 0.7);
    // GDD 7.4: The Grind perk → +500 iron per fight while enrolled at that gym
    const grindBonus = (fighter.activePerks?.theGrindGymId &&
        String(fighter.activePerks.theGrindGymId) === String(fighter.gymId)) ? 500 : 0;
    let ironEarned = Math.round(basePurse * outcomeIronMult * comebackIronMult) + grindBonus;
    if (weightMissed) ironEarned = Math.round(ironEarned * 0.8);

    // GDD 8.5: Notoriety gains/losses (frozen after 3 consecutive losses)
    const notorietyFrozen = (fighter.consecutiveLosses || 0) >= 3;
    let notorietyGain = 0;
    if (!notorietyFrozen) {
        notorietyGain = isWin ? 100 : (isDraw ? 0 : -20);
    }
    if (weightMissed) notorietyGain = Math.min(0, notorietyGain - 30); // weight miss penalty

    // Build fight XP totals
    const fightXp = {};
    if (isWin && result.outcome === "KO/TKO") {
        fightXp.STR = 30; fightXp.CHN = 15; fightXp.SPD = 10;
    } else if (isWin && result.outcome === "Submission") {
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
        const fightInjuryType = rollForFightInjury(fighter.fiq || 10);
        if (fightInjuryType) {
            const inj = buildInjury(fightInjuryType);
            if (inj) {
                applyInjuryToFighter(fighter, inj);
                fighter.injuries = [...(fighter.injuries || []), inj];
                injuriesSustained.push(inj.label);
            }
        }
    }

    if (isWin) {
        fighter.record.wins += 1;
        if (result.outcome === "KO/TKO") fighter.record.koWins += 1;
        else if (result.outcome === "Submission") fighter.record.subWins += 1;
        else fighter.record.decisionWins += 1;
        fighter.consecutiveLosses = 0;
        fighter.mentalResetRequired = false;

        // GDD 8.6: Win on a comeback → earn Resilience badge
        if (isComeback) {
            fighter.badges = fighter.badges || [];
            if (!fighter.badges.includes("Resilience")) {
                fighter.badges.push("Resilience");
            }
        }
        fighter.comebackMode = false;
    } else if (isLoss) {
        fighter.record.losses += 1;
        const newConsecLosses = (fighter.consecutiveLosses || 0) + 1;
        fighter.consecutiveLosses = newConsecLosses;
        fighter.comebackMode = true;

        // GDD 8.5: 3 consecutive losses → Mental Reset required
        if (newConsecLosses >= 3) {
            fighter.mentalResetRequired = true;
        }
    } else {
        fighter.record.draws += 1;
    }

    fighter.iron += ironEarned;
    fighter.notoriety = Math.max(0, (fighter.notoriety || 0) + notorietyGain);

    const today = new Date().toDateString();
    if (fighter.lastFightDate && fighter.lastFightDate.toDateString() !== today) {
        fighter.fightsToday = 0;
    }
    fighter.fightsToday = (fighter.fightsToday || 0) + 1;
    fighter.lastFightDate = new Date();

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
            fighter[xpKey] = newXp;
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
    const healthEnd = result.playerHealthAfter ?? 100;
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
        notorietyFrozen,
        xpGained: fightXpApplied,
        statLevelUps,
        xpMultiplier: xpMult,
        isComeback,
        weightCut,
        weightMissed,
        injuriesSustained,
        newBadges: (isWin && isComeback) ? ["Resilience"] : [],
        mentalResetRequired: !!fighter.mentalResetRequired,
        completedQuests: completedQuests.map((q) => q.title),
        promoted,
    };

    return { fight, fighter, result, summary };
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
    addCampAction,
    setStrategy,
    setWeightCut,
    resolveFightAndApply,
    getOffers
};
