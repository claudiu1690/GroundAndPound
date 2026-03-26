const Fight = require("../models/fightModel");
const FightCamp = require("../models/fightCampModel");
const energyService = require("./energyService");
const {
    CAMP_SESSIONS,
    SESSION_BONUSES,
    MATCH_STATUSES,
    MATCH_STATUS_MULTIPLIERS,
    RELIABILITY_TIERS,
    STAT_COUNTER_SESSION,
    STAT_FIGHT_DOMAIN,
    WILDCARD_DESCRIPTIONS,
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

async function loadAcceptedFightWithOpponent(fightId) {
    const fight = await Fight.findOne({ _id: fightId, status: "accepted" }).populate("opponentId");
    if (!fight) throw new Error("Fight not found or not accepted");
    if (!fight.opponentId) throw new Error("Opponent not found");
    return fight;
}

function assertCampOwnership(camp, fighterId) {
    if (String(camp.fighterId) !== String(fighterId)) {
        throw new Error("Forbidden");
    }
}

/**
 * v2 match status: four-tier system.
 * - GAME_PLAN_STUDY → always PARTIAL
 * - SPARRING_GENERAL → always MATCHED (unconditional)
 * - In STYLE_SESSION_MAP → MATCHED
 * - Otherwise → UNMATCHED
 */
function getMatchStatus(sessionType, opponentStyle) {
    const sessionCfg = CAMP_SESSIONS[sessionType];
    if (!sessionCfg) return MATCH_STATUSES.UNMATCHED;

    // Game Plan Study is always PARTIAL — never fully matched, never wasted
    if (sessionCfg.partialContributor) return MATCH_STATUSES.PARTIAL;

    // Sparring is unconditionally matched
    if (sessionCfg.alwaysContributes) return MATCH_STATUSES.MATCHED;

    const recommended = STYLE_SESSION_MAP[opponentStyle] || [];
    return recommended.includes(sessionType)
        ? MATCH_STATUSES.MATCHED
        : MATCH_STATUSES.UNMATCHED;
}

function countPriorOccurrences(sessions, sessionType) {
    return sessions.filter((s) => s.sessionType === sessionType).length;
}

function rollInjuryType() {
    const entries = Object.entries(CAMP_INJURY_CONFIG);
    const total = entries.reduce((sum, [, cfg]) => sum + cfg.probability, 0);
    let roll = Math.random() * total;
    for (const [type, cfg] of entries) {
        roll -= cfg.probability;
        if (roll <= 0) return type;
    }
    return entries[0][0];
}

/**
 * v2: compute camp score/grade (visual only) and build sessionBonuses array.
 * The grade no longer applies a flat fight modifier.
 */
function computeCampRating(sessions, maxSlots) {
    const maxPossiblePoints = maxSlots * 3;

    let totalPoints = 0;
    const campBreakdown = [];

    for (const session of sessions) {
        totalPoints += session.pointsEarned;
        const sessionCfg = CAMP_SESSIONS[session.sessionType];
        campBreakdown.push({
            sessionType: session.sessionType,
            label: sessionCfg?.label ?? session.sessionType,
            matchStatus: session.matchStatus,
            pointsEarned: session.pointsEarned,
        });
    }

    const scorePercent = maxPossiblePoints > 0
        ? Math.min(100, Math.round((totalPoints / maxPossiblePoints) * 100))
        : 0;

    const ratingEntry = CAMP_RATING_CONFIG.find((r) => scorePercent >= r.min)
        || CAMP_RATING_CONFIG[CAMP_RATING_CONFIG.length - 1];

    return {
        score: scorePercent,
        grade: ratingEntry.grade,
        campBreakdown,
    };
}

/**
 * Build the sessionBonuses array for fight resolution.
 * Each entry has an effectiveValue based on matchStatus.
 */
function buildSessionBonuses(sessions) {
    const bonuses = [];
    for (const session of sessions) {
        const bonusCfg = SESSION_BONUSES[session.sessionType];
        if (!bonusCfg) continue;

        const multiplier = MATCH_STATUS_MULTIPLIERS[session.matchStatus] ?? 0;
        const effectiveValue = bonusCfg.bonusValue * multiplier * session.diminishingFactor;

        if (effectiveValue <= 0 && session.matchStatus !== MATCH_STATUSES.WRONG) continue;

        bonuses.push({
            sessionType:      session.sessionType,
            label:            CAMP_SESSIONS[session.sessionType]?.label ?? session.sessionType,
            matchStatus:      session.matchStatus,
            bonusType:        bonusCfg.bonusType,
            bonusValue:       bonusCfg.bonusValue,
            effectiveValue,
            triggerCondition: bonusCfg.triggerCondition,
            description:      bonusCfg.description,
            triggered:        false,
            triggerCount:     0,
            // Extra fields for specific bonus types
            ...(bonusCfg.bodyStaminaDrain != null && { bodyStaminaDrain: bonusCfg.bodyStaminaDrain * multiplier * session.diminishingFactor }),
            ...(bonusCfg.clinchChance != null && { clinchChance: bonusCfg.clinchChance }),
        });
    }
    return bonuses;
}

function dropGrade(currentGrade, drops) {
    const grades = CAMP_RATING_CONFIG.map((r) => r.grade);
    const idx = grades.indexOf(currentGrade);
    if (idx === -1) return currentGrade;
    const newIdx = Math.min(grades.length - 1, idx + drops);
    return grades[newIdx];
}

// ── Fighter Report helpers (v2: reliability tiers) ──────────────────────────

const STAT_KEYS_UPPER = ['STR', 'SPD', 'LEG', 'WRE', 'GND', 'SUB', 'CHN', 'FIQ'];

/**
 * Analyse fight history to find which domains have evidence.
 * Returns { domain: count } where count = number of last-5 fights
 * that feature that domain.
 */
function analyseFightHistory(fightHistory) {
    const last5 = (fightHistory || []).slice(-5);
    const domainCounts = {
        striking: 0,
        grappling: 0,
        submission: 0,
        durability: 0,
        tactical: 0,
    };

    for (const fight of last5) {
        const method = fight.method || '';
        if (method.includes('KO/TKO')) {
            domainCounts.striking++;
            if (fight.result === 'loss') domainCounts.durability++;
        }
        if (method.includes('Submission')) {
            domainCounts.submission++;
            domainCounts.grappling++;
        }
        if (method.includes('Decision')) {
            domainCounts.tactical++;
        }
        // Grappling is implied in any non-pure-striking fight
        if (method.includes('Submission') || method.includes('Decision')) {
            domainCounts.grappling++;
        }
    }

    return { domainCounts, totalFights: last5.length };
}

/**
 * Get the domain for a stat key.
 */
function getStatDomain(statKey) {
    const lower = statKey.toLowerCase();
    return STAT_FIGHT_DOMAIN[lower]?.domain ?? 'unknown';
}

/**
 * Classify a stat into a reliability tier based on:
 * - Relative rank among all 8 stats
 * - Fight history evidence for the stat's domain
 */
function classifyStat(statKey, statValue, rank, domainCounts, totalFights) {
    const domain = getStatDomain(statKey);
    const domainEvidence = domainCounts[domain] ?? 0;

    // Top 2 stats with 3+ fights showing this domain → CONFIRMED
    if (rank <= 2 && domainEvidence >= 3) return RELIABILITY_TIERS.CONFIRMED;

    // Top 2 stats with 1-2 fights → SUSPECTED (strong stat but limited evidence)
    if (rank <= 2 && domainEvidence >= 1) return RELIABILITY_TIERS.SUSPECTED;

    // Top 2 stats with zero evidence → UNVERIFIED
    if (rank <= 2 && totalFights >= 1) return RELIABILITY_TIERS.UNVERIFIED;

    // Bottom 2 stats with evidence of weakness → SUSPECTED
    if (rank >= 7 && domainEvidence >= 1) return RELIABILITY_TIERS.SUSPECTED;

    // Bottom 2 stats with no evidence → UNVERIFIED
    if (rank >= 7 && totalFights >= 1) return RELIABILITY_TIERS.UNVERIFIED;

    // Middle stats with few fights → UNVERIFIED
    if (totalFights >= 1 && totalFights < 3) return RELIABILITY_TIERS.UNVERIFIED;

    // No fight history at all → UNKNOWN
    if (totalFights === 0) return RELIABILITY_TIERS.UNKNOWN;

    // Middle stats with decent history but no evidence in this domain → UNKNOWN
    if (domainEvidence === 0) return RELIABILITY_TIERS.UNKNOWN;

    return RELIABILITY_TIERS.UNVERIFIED;
}

// ── Wildcard generation ─────────────────────────────────────────────────────

/**
 * Generate a hidden wildcard tendency for an NPC.
 * Picks from stats NOT in the top-2 or bottom-2 (the "middle" stats).
 * The wildcard is never shown in the Fighter Report.
 */
function generateWildcard(npc, reportedStatKeys) {
    const stats = {
        str: npc.str, spd: npc.spd, leg: npc.leg, wre: npc.wre,
        gnd: npc.gnd, sub: npc.sub, chn: npc.chn, fiq: npc.fiq,
    };

    // Find stats not already reported (confirmed strengths + suspected weaknesses)
    const reportedSet = new Set((reportedStatKeys || []).map(k => k.toLowerCase()));
    const middleStats = Object.entries(stats)
        .filter(([key]) => !reportedSet.has(key))
        .sort(([, a], [, b]) => b - a);

    if (middleStats.length === 0) {
        // Fallback: pick from all stats
        const all = Object.entries(stats).sort(([, a], [, b]) => b - a);
        const pick = all[Math.floor(Math.random() * Math.min(3, all.length))];
        return buildWildcardEntry(pick[0], pick[1]);
    }

    // Pick from top 3 of middle stats (the best "hidden" stats)
    const candidates = middleStats.slice(0, Math.min(3, middleStats.length));
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return buildWildcardEntry(pick[0], pick[1]);
}

function buildWildcardEntry(statKey, statValue) {
    return {
        stat:           statKey,
        value:          statValue,
        description:    WILDCARD_DESCRIPTIONS[statKey] || `has been developing ${statKey} in training`,
        counterSession: STAT_COUNTER_SESSION[statKey] || 'GAME_PLAN_STUDY',
        fightEffect:    0.15, // +15% boost in this domain for one occurrence
    };
}

// ── Public API ──────────────────────────────────────────────────────────────

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
 * v2: Fighter Report with reliability tiers.
 * Uses relative stat ranking — works at all promotion tiers.
 */
async function getFighterReport(fightId) {
    const fight = await Fight.findById(fightId).populate("opponentId");
    if (!fight) throw new Error("Fight not found");
    if (!fight.opponentId) throw new Error("Opponent not found");

    const opp = fight.opponentId;
    const stats = {
        STR: opp.str, SPD: opp.spd, LEG: opp.leg, WRE: opp.wre,
        GND: opp.gnd, SUB: opp.sub, CHN: opp.chn, FIQ: opp.fiq,
    };

    // Sort stats by value (descending) and assign ranks
    const sorted = Object.entries(stats).sort(([, a], [, b]) => b - a);
    const statRanks = {};
    sorted.forEach(([key], i) => { statRanks[key] = i + 1; }); // 1-based rank

    // Analyse fight history for domain evidence
    const { domainCounts, totalFights } = analyseFightHistory(opp.fightHistory);

    // Classify each stat
    const confirmedStrengths = [];
    const suspectedWeaknesses = [];
    const unverifiedAreas = [];
    const unknownAreas = [];

    for (const [statKey, statValue] of sorted) {
        const rank = statRanks[statKey];
        const tier = classifyStat(statKey, statValue, rank, domainCounts, totalFights);
        const isStrength = rank <= 2;
        const isWeakness = rank >= 7;

        const entry = {
            stat: statKey,
            value: statValue,
            reliability: tier,
            label: isStrength
                ? STAT_STRENGTH_LABELS[statKey]
                : isWeakness
                    ? STAT_WEAKNESS_LABELS[statKey]
                    : STAT_STRENGTH_LABELS[statKey], // neutral label for middle
        };

        switch (tier) {
            case RELIABILITY_TIERS.CONFIRMED:
                confirmedStrengths.push(entry);
                break;
            case RELIABILITY_TIERS.SUSPECTED:
                if (isWeakness) suspectedWeaknesses.push(entry);
                else confirmedStrengths.push({ ...entry, reliability: RELIABILITY_TIERS.SUSPECTED });
                break;
            case RELIABILITY_TIERS.UNVERIFIED:
                unverifiedAreas.push(entry);
                break;
            case RELIABILITY_TIERS.UNKNOWN:
                unknownAreas.push(entry);
                break;
        }
    }

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
        confirmedStrengths,
        suspectedWeaknesses,
        unverifiedAreas,
        unknownAreas,
        tendency: tendencyData.tendency,
        warning: tendencyData.warning,
    };
}

async function getCampState(fightId, fighterId) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    const slotsUsed = camp.sessions.length;
    const slotsRemaining = Math.max(0, camp.maxSlots - slotsUsed);

    let preview = null;
    if (!camp.finalisedAt && slotsUsed > 0) {
        const { grade } = computeCampRating(camp.sessions, camp.maxSlots);
        preview = { grade };
    }

    return {
        ...camp.toObject(),
        slotsUsed,
        slotsRemaining,
        previewRating: camp.finalisedAt ? null : preview,
    };
}

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

    await energyService.deductEnergy(String(fighterId), sessionCfg.energy);

    const opponentStyle = fight.opponentId.style;
    const matchStatus = getMatchStatus(sessionType, opponentStyle);
    const priorCount = countPriorOccurrences(camp.sessions, sessionType);
    const diminishingFactor = DIMINISHING_RETURNS[Math.min(priorCount, DIMINISHING_RETURNS.length - 1)];

    // v2: points based on match status multiplier
    const matchMultiplier = MATCH_STATUS_MULTIPLIERS[matchStatus] ?? 0;
    const basePoints = sessionCfg.modifierContribution;
    const pointsEarned = Math.round(basePoints * diminishingFactor * matchMultiplier);

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
    const { grade } = computeCampRating(camp.sessions, camp.maxSlots);

    return {
        camp: camp.toObject(),
        slotsUsed: camp.sessions.length,
        slotsRemaining,
        previewRating: { grade },
        injuryTriggered,
    };
}

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
        const { grade: currentGrade, campBreakdown } = computeCampRating(camp.sessions, camp.maxSlots);
        const newGrade = dropGrade(currentGrade, injuryCfg.gradeDrops);

        camp.campRating = newGrade;
        camp.campBreakdown = campBreakdown;
        camp.sessionBonuses = buildSessionBonuses(camp.sessions);
        camp.finalisedAt = new Date();
    } else {
        camp.injuryPenalty = { ...injuryCfg.fightPenalty };
    }

    await camp.save();
    return camp.toObject();
}

/**
 * v2: Finalise the camp — compute rating, build session bonuses, generate wildcard.
 */
async function finaliseCamp(fightId, fighterId, skip = false) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    if (camp.finalisedAt) throw new Error("Camp is already finalised");

    if (skip) {
        camp.wasSkipped = true;
        camp.campRating = "F";
        camp.sessionBonuses = [];
        camp.campBreakdown = [];
    } else {
        if (camp.isInjured && !camp.injuryChoice) throw new Error("Resolve camp injury before finalising");

        const { grade, campBreakdown } = computeCampRating(camp.sessions, camp.maxSlots);
        camp.campRating = grade;
        camp.campBreakdown = campBreakdown;
        camp.sessionBonuses = buildSessionBonuses(camp.sessions);

        // Generate wildcard from opponent stats
        const fight = await Fight.findById(fightId).populate("opponentId");
        if (fight?.opponentId) {
            // Collect stat keys already in the report (top 2 + bottom 2)
            const opp = fight.opponentId;
            const statEntries = [
                ['str', opp.str], ['spd', opp.spd], ['leg', opp.leg], ['wre', opp.wre],
                ['gnd', opp.gnd], ['sub', opp.sub], ['chn', opp.chn], ['fiq', opp.fiq],
            ].sort(([, a], [, b]) => b - a);
            const reportedKeys = [
                ...statEntries.slice(0, 2).map(([k]) => k),
                ...statEntries.slice(-2).map(([k]) => k),
            ];
            camp.wildcard = generateWildcard(opp, reportedKeys);
        }
    }

    camp.finalisedAt = new Date();
    await camp.save();

    return {
        campRating: camp.campRating,
        campBreakdown: camp.campBreakdown,
        sessionBonuses: camp.sessionBonuses,
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
    // Exported for fight resolution and testing
    buildSessionBonuses,
    generateWildcard,
};
