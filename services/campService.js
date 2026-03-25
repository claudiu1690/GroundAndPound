const Fight = require("../models/fightModel");
const FightCamp = require("../models/fightCampModel");
const Opponent = require("../models/opponentModel");
const energyService = require("./energyService");
const {
    CAMP_SESSIONS,
    STYLE_SESSION_MAP,
    CAMP_SLOT_CONFIG,
    CAMP_RATING_CONFIG,
    DIMINISHING_RETURNS,
    SKIP_CAMP_MODIFIER,
    CAMP_INJURY_CONFIG,
    STYLE_TENDENCY,
    STAT_STRENGTH_LABELS,
    STAT_WEAKNESS_LABELS,
} = require("../consts/campConfig");

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the fight and load its opponent. Throws if not found or wrong status.
 */
async function loadAcceptedFightWithOpponent(fightId) {
    const fight = await Fight.findOne({ _id: fightId, status: "accepted" }).populate("opponentId");
    if (!fight) throw new Error("Fight not found or not accepted");
    if (!fight.opponentId) throw new Error("Opponent not found");
    return fight;
}

/**
 * Verify the camp belongs to the given fighter. Throws on mismatch.
 */
function assertCampOwnership(camp, fighterId) {
    if (String(camp.fighterId) !== String(fighterId)) {
        throw new Error("Forbidden");
    }
}

/**
 * Determine matchStatus for a session type against an opponent style.
 * GAME_PLAN_STUDY and SPARRING_GENERAL always contribute via alwaysContributes flag.
 */
function getMatchStatus(sessionType, opponentStyle) {
    const sessionCfg = CAMP_SESSIONS[sessionType];
    if (!sessionCfg) return "not_a_match";
    if (sessionCfg.alwaysContributes) return "matched";
    const recommended = STYLE_SESSION_MAP[opponentStyle] || [];
    return recommended.includes(sessionType) ? "matched" : "not_a_match";
}

/**
 * Count how many times a session type already appears in existing sessions.
 * Used to compute the diminishing returns factor.
 */
function countPriorOccurrences(sessions, sessionType) {
    return sessions.filter((s) => s.sessionType === sessionType).length;
}

/**
 * Pick a random camp injury type weighted by probability.
 */
function rollInjuryType() {
    const entries = Object.entries(CAMP_INJURY_CONFIG);
    const total = entries.reduce((sum, [, cfg]) => sum + cfg.probability, 0);
    let roll = Math.random() * total;
    for (const [type, cfg] of entries) {
        roll -= cfg.probability;
        if (roll <= 0) return type;
    }
    return entries[0][0]; // fallback
}

/**
 * Calculate camp score percentage and letter grade from current sessions.
 * Returns { score (0-100), grade, campModifier (float), campBonuses, campBreakdown }.
 */
function computeCampRating(sessions, maxSlots) {
    const maxPossiblePoints = maxSlots * 3; // 3 = highest single session contribution

    let totalPoints = 0;
    const campBreakdown = [];
    const accumulatedBonuses = {};

    for (const session of sessions) {
        totalPoints += session.pointsEarned;
        const sessionCfg = CAMP_SESSIONS[session.sessionType];
        campBreakdown.push({
            sessionType: session.sessionType,
            label: sessionCfg?.label ?? session.sessionType,
            matchStatus: session.matchStatus,
            pointsEarned: session.pointsEarned,
        });

        // Accumulate campBonuses from matched sessions
        if (session.matchStatus === "matched" && sessionCfg?.campBonuses) {
            for (const [key, value] of Object.entries(sessionCfg.campBonuses)) {
                // For multiplicative bonuses like staminaDrainMult, stack multiplicatively
                if (key === "playerStaminaDrainMult") {
                    accumulatedBonuses[key] = (accumulatedBonuses[key] ?? 1) * value;
                } else {
                    accumulatedBonuses[key] = (accumulatedBonuses[key] ?? 0) + value;
                }
            }
        }
    }

    const campModifier = totalPoints / 100; // e.g. 33 points → 0.33 multiplier
    const scorePercent = maxPossiblePoints > 0
        ? Math.min(100, Math.round((totalPoints / maxPossiblePoints) * 100))
        : 0;

    // Find the matching grade bracket (descending min order)
    const ratingEntry = CAMP_RATING_CONFIG.find((r) => scorePercent >= r.min) || CAMP_RATING_CONFIG[CAMP_RATING_CONFIG.length - 1];

    return {
        score: scorePercent,
        grade: ratingEntry.grade,
        campModifier,
        campBonuses: accumulatedBonuses,
        campBreakdown,
    };
}

/**
 * Drop the grade by N brackets and recalculate the campModifier accordingly.
 * Used when the player chooses STOP after an injury.
 */
function dropGrade(currentGrade, drops) {
    const grades = CAMP_RATING_CONFIG.map((r) => r.grade); // ['S','A','B','C','D','F']
    const idx = grades.indexOf(currentGrade);
    if (idx === -1) return currentGrade;
    const newIdx = Math.min(grades.length - 1, idx + drops);
    return grades[newIdx];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a FightCamp document immediately after a fight is accepted.
 * Called from fightService.acceptOffer.
 */
async function createCamp(fightId, fighterId, promotionTier, isShortNotice = false) {
    const slotCfg = CAMP_SLOT_CONFIG[promotionTier] || CAMP_SLOT_CONFIG["Amateur"];
    const maxSlots = isShortNotice ? slotCfg.shortNoticeSlots : slotCfg.normalSlots;

    const camp = new FightCamp({
        fightId,
        fighterId,
        maxSlots,
        isShortNotice,
    });
    await camp.save();
    return camp;
}

/**
 * Generate the Fighter Report from the opponent's stats and fight history.
 * Computed on request — never persisted.
 */
async function getFighterReport(fightId) {
    const fight = await Fight.findById(fightId).populate("opponentId");
    if (!fight) throw new Error("Fight not found");
    if (!fight.opponentId) throw new Error("Opponent not found");

    const opp = fight.opponentId;
    const stats = { STR: opp.str, SPD: opp.spd, LEG: opp.leg, WRE: opp.wre, GND: opp.gnd, SUB: opp.sub, CHN: opp.chn, FIQ: opp.fiq };
    const statValues = Object.entries(stats).sort(([, a], [, b]) => b - a);
    const statAvg = Object.values(stats).reduce((s, v) => s + v, 0) / 8;

    // Known strengths: top 2 stats (by value)
    const knownStrengths = statValues.slice(0, 2).map(([stat]) => STAT_STRENGTH_LABELS[stat]).filter(Boolean);

    // Suspected weaknesses: stats below average, up to 2, prioritising CHN if it's low
    const weakCandidates = statValues
        .slice()
        .reverse()
        .filter(([, val]) => val < statAvg);
    const weakStats = [];
    // Prioritise CHN weakness (chin concern is most strategically relevant)
    const chnEntry = weakCandidates.find(([s]) => s === "CHN");
    if (chnEntry) weakStats.push(chnEntry[0]);
    for (const [stat] of weakCandidates) {
        if (weakStats.length >= 2) break;
        if (!weakStats.includes(stat)) weakStats.push(stat);
    }
    const suspectedWeaknesses = weakStats.map((stat) => STAT_WEAKNESS_LABELS[stat]).filter(Boolean);

    // Record string
    const { wins = 0, losses = 0, draws = 0 } = opp.record || {};
    const history = opp.fightHistory || [];
    const winsByKo = history.filter((h) => h.result === "win" && h.method === "KO/TKO").length;
    const winsBySub = history.filter((h) => h.result === "win" && h.method === "Submission").length;
    const winsByDec = history.filter((h) => h.result === "win" && h.method === "Decision").length;
    const recordDetail = [
        winsByKo > 0 ? `${winsByKo} wins by KO/TKO` : null,
        winsBySub > 0 ? `${winsBySub} by Submission` : null,
        winsByDec > 0 ? `${winsByDec} by Decision` : null,
    ].filter(Boolean).join(", ");

    const tendencyData = STYLE_TENDENCY[opp.style] || {
        tendency: "Adapts game plan based on opponent.",
        warning: "Well-rounded — no obvious primary finish method.",
    };

    return {
        opponentId: opp._id,
        name: opp.name,
        nickname: opp.nickname || null,
        style: opp.style,
        overallRating: opp.overallRating,
        record: `${wins}-${losses}${draws > 0 ? `-${draws}` : ""}`,
        recordDetail: recordDetail || null,
        knownStrengths,
        suspectedWeaknesses,
        tendency: tendencyData.tendency,
        warning: tendencyData.warning,
    };
}

/**
 * Get the current camp state with derived display fields.
 */
async function getCampState(fightId, fighterId) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    const slotsUsed = camp.sessions.length;
    const slotsRemaining = Math.max(0, camp.maxSlots - slotsUsed);

    // Compute a live preview rating (before finalise)
    let preview = null;
    if (!camp.finalisedAt && slotsUsed > 0) {
        const { grade, campModifier } = computeCampRating(camp.sessions, camp.maxSlots);
        preview = { grade, campModifier };
    }

    return {
        ...camp.toObject(),
        slotsUsed,
        slotsRemaining,
        previewRating: camp.finalisedAt ? null : preview,
    };
}

/**
 * Add a training session to the camp.
 * Validates: not finalised, not injured without a choice, slots remaining, energy available.
 * If SPARRING_GENERAL: rolls for camp injury.
 */
async function addCampSession(fightId, fighterId, sessionType) {
    const fight = await loadAcceptedFightWithOpponent(fightId);
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    if (camp.finalisedAt) throw new Error("Camp is already finalised");
    if (camp.isInjured && !camp.injuryChoice) throw new Error("Resolve camp injury before adding more sessions");

    const slotsUsed = camp.sessions.length;
    if (slotsUsed >= camp.maxSlots) throw new Error("No slots remaining");

    const sessionCfg = CAMP_SESSIONS[sessionType];
    if (!sessionCfg) throw new Error(`Invalid session type: ${sessionType}`);

    // Check and deduct energy
    await energyService.deductEnergy(String(fighterId), sessionCfg.energy);

    // Compute match status and diminishing returns
    const opponentStyle = fight.opponentId.style;
    const matchStatus = getMatchStatus(sessionType, opponentStyle);
    const priorCount = countPriorOccurrences(camp.sessions, sessionType);
    const diminishingFactor = DIMINISHING_RETURNS[Math.min(priorCount, DIMINISHING_RETURNS.length - 1)];

    // Matched sessions (or always-contributes) earn points; unmatched earn 0
    const basePoints = (matchStatus === "matched") ? sessionCfg.modifierContribution : 0;
    const pointsEarned = Math.round(basePoints * diminishingFactor);

    camp.sessions.push({
        sessionType,
        slotIndex: slotsUsed,
        energySpent: sessionCfg.energy,
        matchStatus,
        pointsEarned,
        diminishingFactor,
    });

    // Sparring injury roll
    let injuryTriggered = null;
    if (sessionType === "SPARRING_GENERAL" && Math.random() < sessionCfg.injuryRisk) {
        const injuryType = rollInjuryType();
        const injuryCfg = CAMP_INJURY_CONFIG[injuryType];
        camp.isInjured = true;
        camp.injuryType = injuryType;
        injuryTriggered = {
            type: injuryType,
            label: injuryCfg.label,
            description: injuryCfg.description,
            stopDescription: injuryCfg.stopDescription,
        };
    }

    await camp.save();

    const slotsRemaining = Math.max(0, camp.maxSlots - camp.sessions.length);
    const { grade, campModifier } = computeCampRating(camp.sessions, camp.maxSlots);

    return {
        camp: camp.toObject(),
        slotsUsed: camp.sessions.length,
        slotsRemaining,
        previewRating: { grade, campModifier },
        injuryTriggered,
    };
}

/**
 * Resolve a camp injury — either stop camp or push through.
 * STOP: forfeit remaining slots, recalculate rating with grade drops.
 * PUSH_THROUGH: store injuryPenalty for fight resolution.
 */
async function resolveInjury(fightId, fighterId, choice) {
    if (!["STOP", "PUSH_THROUGH"].includes(choice)) throw new Error("Invalid choice — must be STOP or PUSH_THROUGH");

    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    if (!camp.isInjured || !camp.injuryType) throw new Error("No active camp injury");
    if (camp.injuryChoice) throw new Error("Injury already resolved");

    const injuryCfg = CAMP_INJURY_CONFIG[camp.injuryType];
    camp.injuryChoice = choice;

    if (choice === "STOP") {
        // Pre-finalise: forfeit remaining slots, display grade drops but the
        // modifier is whatever was actually earned from completed sessions.
        const { grade: currentGrade, campModifier, campBreakdown, campBonuses } = computeCampRating(camp.sessions, camp.maxSlots);
        const newGrade = dropGrade(currentGrade, injuryCfg.gradeDrops);

        camp.campRating = newGrade;
        camp.campModifier = campModifier; // session-earned modifier — grade drop is display only
        camp.campBonuses = campBonuses;
        camp.campBreakdown = campBreakdown;
        camp.finalisedAt = new Date();
    } else {
        // PUSH_THROUGH: store fight penalty, leave remaining slots open
        camp.injuryPenalty = { ...injuryCfg.fightPenalty };
    }

    await camp.save();
    return camp.toObject();
}

/**
 * Finalise the camp — compute rating and lock it.
 * If skip=true, apply the skip penalty (-20%) and mark as skipped.
 */
async function finaliseCamp(fightId, fighterId, skip = false) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    if (camp.finalisedAt) throw new Error("Camp is already finalised");

    if (skip) {
        camp.wasSkipped = true;
        camp.campModifier = SKIP_CAMP_MODIFIER;
        camp.campRating = "F";
        camp.campBonuses = {};
        camp.campBreakdown = [];
    } else {
        if (camp.isInjured && !camp.injuryChoice) throw new Error("Resolve camp injury before finalising");

        const { grade, campModifier, campBonuses, campBreakdown } = computeCampRating(
            camp.sessions,
            camp.maxSlots
        );
        camp.campRating = grade;
        camp.campModifier = campModifier;
        camp.campBonuses = campBonuses;
        camp.campBreakdown = campBreakdown;
    }

    camp.finalisedAt = new Date();
    await camp.save();

    return {
        campRating: camp.campRating,
        campModifier: camp.campModifier,
        campBonuses: camp.campBonuses,
        campBreakdown: camp.campBreakdown,
        wasSkipped: camp.wasSkipped,
        injuryPenalty: camp.injuryPenalty ?? null,
        injuryChoice: camp.injuryChoice ?? null,
        sessions: camp.sessions,
    };
}

module.exports = {
    createCamp,
    getFighterReport,
    getCampState,
    addCampSession,
    resolveInjury,
    finaliseCamp,
};
