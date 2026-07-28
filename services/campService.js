const Fight = require("../models/fightModel");
const FightCamp = require("../models/fightCampModel");
const Fighter = require("../models/fighterModel");
const energyService = require("./energyService");
const specialMovesService = require("./specialMovesService");
const { BUFFS } = require("../consts/shopConfig");
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
const { COACH_ARCHETYPES, STYLE_TO_DOMAIN } = require("../consts/homeCampConfig");

/**
 * The three rank-4 perks that act on the FIGHT CAMP (§9). Read from COACH_ARCHETYPES rather
 * than written as literals on purpose: these keys were dead for months precisely because
 * nothing referenced them, and a hand-typed string that drifts from the catalogue fails
 * silently — the perk simply stops working and no test notices.
 *
 * The fourth camp perk, CONDITIONING's `iron_conditioning`, acts on TRAINING, not on the
 * fight camp, and lives in utils/trainingSession.js. It is the only one that ever worked.
 */
const CORNER_CONFIDENCE = COACH_ARCHETYPES.STRIKING.perkKey;      // +1 slot vs a striker
const MAT_RETURNS = COACH_ARCHETYPES.WRESTLING.perkKey;           // TD Defence floors at PARTIAL
const SUBMISSION_AWARENESS = COACH_ARCHETYPES.BJJ.perkKey;        // Sub Escapes +5%

/** Extra bonus Submission Awareness adds to a Submission Escapes session. */
const SUBMISSION_AWARENESS_BONUS = 0.05;

const hasPerk = (perks, key) => Array.isArray(perks) && perks.includes(key);

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
function getMatchStatus(sessionType, opponentStyle, perks = []) {
    const sessionCfg = CAMP_SESSIONS[sessionType];
    if (!sessionCfg) return MATCH_STATUSES.UNMATCHED;

    // Game Plan Study is always PARTIAL — never fully matched, never wasted
    if (sessionCfg.partialContributor) return MATCH_STATUSES.PARTIAL;

    // Sparring is unconditionally matched
    if (sessionCfg.alwaysContributes) return MATCH_STATUSES.MATCHED;

    const recommended = STYLE_SESSION_MAP[opponentStyle] || [];
    const status = recommended.includes(sessionType)
        ? MATCH_STATUSES.MATCHED
        : MATCH_STATUSES.UNMATCHED;

    // Mat Returns (WRESTLING rank 4) — "Takedown Defence camp session always at least
    // PARTIAL match". A FLOOR, never a cap: when the opponent's style already makes it
    // MATCHED the perk must not drag it down to PARTIAL.
    if (sessionType === "TAKEDOWN_DEFENCE"
        && status === MATCH_STATUSES.UNMATCHED
        && hasPerk(perks, MAT_RETURNS)) {
        return MATCH_STATUSES.PARTIAL;
    }

    return status;
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
function buildSessionBonuses(sessions, perks = []) {
    const bonuses = [];
    for (const session of sessions) {
        const bonusCfg = SESSION_BONUSES[session.sessionType];
        if (!bonusCfg) continue;

        const multiplier = MATCH_STATUS_MULTIPLIERS[session.matchStatus] ?? 0;
        // Submission Awareness (BJJ rank 4) — "Submission Escapes camp session gives +5%
        // extra bonus". Applied as a multiplier on the session's own value, so it scales
        // with match status and diminishing returns rather than handing a flat bonus to a
        // session that was UNMATCHED (multiplier 0) and therefore earned nothing.
        const perkBoost = (session.sessionType === "SUBMISSION_ESCAPES" && hasPerk(perks, SUBMISSION_AWARENESS))
            ? 1 + SUBMISSION_AWARENESS_BONUS
            : 1;
        const effectiveValue = bonusCfg.bonusValue * multiplier * session.diminishingFactor * perkBoost;

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
function analyseFightHistory(fightHistory, maxLogs = 5) {
    const last5 = (fightHistory || []).slice(-maxLogs);
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
    // Top 2 stats with 1-2 fights → SUSPECTED
    if (rank <= 2 && domainEvidence >= 1) return RELIABILITY_TIERS.SUSPECTED;
    // Bottom 2 stats with evidence of weakness → SUSPECTED
    if (rank >= 7 && domainEvidence >= 1) return RELIABILITY_TIERS.SUSPECTED;
    // Everything else (no domain evidence, thin/zero tape, or middle stats) → UNKNOWN
    return RELIABILITY_TIERS.UNKNOWN;
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

async function createCamp(fightId, fighterId, promotionTier, isShortNotice = false, offerType = null) {
    // Title fights get maximum camp slots regardless of tier
    const slotKey = offerType === "TitleShot" ? "Title Fight" : promotionTier;
    const slotCfg = CAMP_SLOT_CONFIG[slotKey] || CAMP_SLOT_CONFIG["Amateur"];
    const baseSlots = isShortNotice ? slotCfg.shortNoticeSlots : slotCfg.normalSlots;

    // Snapshot the fighter's perks here — see the `perks` field on fightCampModel for why
    // they are frozen. Lean + projected: this runs on every fight acceptance.
    const owner = await Fighter.findById(fighterId).select("gymPerks").lean();
    const perks = (owner && owner.gymPerks) || [];

    // Corner Confidence (STRIKING rank 4) — "+1 camp slot when fighting a striker-style
    // opponent". "Striker-style" reuses STYLE_TO_DOMAIN, the same map the camp already uses
    // to pick a starter coach's discipline, rather than a second hand-maintained list of
    // which styles count as strikers.
    let extraSlots = 0;
    if (hasPerk(perks, CORNER_CONFIDENCE)) {
        const fight = await Fight.findById(fightId).populate("opponentId");
        const opponentStyle = fight && fight.opponentId ? fight.opponentId.style : null;
        if (opponentStyle && STYLE_TO_DOMAIN[opponentStyle] === "STRIKING") extraSlots = 1;
    }

    const camp = new FightCamp({
        fightId,
        fighterId,
        maxSlots: baseSlots + extraSlots,
        isShortNotice,
        perks,
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

    // Champions have limited public tape — fewer visible fight logs
    const reportLogLimit = opp.isChampion ? 2 : 5;
    // Analyse fight history for domain evidence
    const { domainCounts, totalFights } = analyseFightHistory(opp.fightHistory, reportLogLimit);

    // Phase 4: Called-out opponents reveal full intel regardless of tape.
    const fullIntel = !!fight.isCallout;

    // Classify each stat
    const confirmedStrengths = [];
    const suspectedWeaknesses = [];
    const unknownAreas = [];

    for (const [statKey, statValue] of sorted) {
        const rank = statRanks[statKey];
        const tier = fullIntel
            ? RELIABILITY_TIERS.CONFIRMED
            : classifyStat(statKey, statValue, rank, domainCounts, totalFights);
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

        // Phase 4: Callout full-intel — bucket by rank so middle-ranked stats don't
        // pile into "Confirmed Strengths". Every entry still reads CONFIRMED reliability.
        if (fullIntel) {
            if (isStrength)      confirmedStrengths.push(entry);
            else if (isWeakness) suspectedWeaknesses.push(entry);
            else                 unknownAreas.push(entry);
            continue;
        }

        switch (tier) {
            case RELIABILITY_TIERS.CONFIRMED:
                confirmedStrengths.push(entry);
                break;
            case RELIABILITY_TIERS.SUSPECTED:
                if (isWeakness) suspectedWeaknesses.push(entry);
                else confirmedStrengths.push({ ...entry, reliability: RELIABILITY_TIERS.SUSPECTED });
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
        unknownAreas,
        tendency: tendencyData.tendency,
        warning: tendencyData.warning,
        // Phase 4: flagged so the UI can render "Callout Intel" branding.
        fullIntel,
        isCallout: !!fight.isCallout,
    };
}

/**
 * Client-safe camp view. While a camp is being BUILT (not finalised), the
 * per-session match outcome is hidden — `matchStatus` and the `pointsEarned`
 * that encodes it are stripped — so players plan from the Fighter Report instead
 * of probing the camp (add a session, read the badge, remove for free, repeat).
 * The full per-session breakdown is revealed in the finalise summary.
 */
function toClientCamp(camp) {
    const obj = camp.toObject();
    if (!camp.finalisedAt) {
        obj.sessions = (obj.sessions || []).map((s) => ({
            sessionType: s.sessionType,
            slotIndex: s.slotIndex,
            energySpent: s.energySpent,
            diminishingFactor: s.diminishingFactor,
        }));
    }
    return obj;
}

/**
 * The live camp grade is only surfaced to support the in-camp injury STOP/PUSH
 * decision — a random, unfarmable event. Outside an active injury choice it
 * stays hidden, so the grade can't be read from API responses to binary-search
 * which sessions matched. Returns null when not building, not injured, or empty.
 */
function buildPreview(camp) {
    if (camp.finalisedAt) return null;
    if (!(camp.isInjured && !camp.injuryChoice)) return null;
    if (!camp.sessions || camp.sessions.length === 0) return null;
    const { grade } = computeCampRating(camp.sessions, camp.maxSlots);
    return { grade };
}

async function getCampState(fightId, fighterId) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    const fight = await Fight.findById(fightId).lean();
    const slotsUsed = camp.sessions.length;
    const slotsRemaining = Math.max(0, camp.maxSlots - slotsUsed);

    return {
        ...toClientCamp(camp),
        slotsUsed,
        slotsRemaining,
        previewRating: buildPreview(camp),
        isTitleFight: fight?.offerType === "TitleShot",
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
    // camp.perks is the snapshot frozen at creation, never the fighter's live array.
    const matchStatus = getMatchStatus(sessionType, opponentStyle, camp.perks);
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

    return {
        camp: toClientCamp(camp),
        slotsUsed: camp.sessions.length,
        slotsRemaining,
        previewRating: buildPreview(camp),
        injuryTriggered,
    };
}

async function removeSession(fightId, fighterId, slotIndex) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    if (camp.finalisedAt) throw new Error("Camp is already finalised");
    if (camp.isInjured && !camp.injuryChoice) throw new Error("Resolve camp injury before removing sessions");
    if (slotIndex < 0 || slotIndex >= camp.sessions.length) throw new Error("Invalid slot index");

    const removed = camp.sessions.splice(slotIndex, 1)[0];

    // Refund energy spent on that session
    await energyService.addEnergy(String(fighterId), removed.energySpent);

    // Re-index remaining sessions
    camp.sessions.forEach((s, i) => { s.slotIndex = i; });

    await camp.save();

    const slotsRemaining = Math.max(0, camp.maxSlots - camp.sessions.length);

    return {
        camp: toClientCamp(camp),
        slotsUsed: camp.sessions.length,
        slotsRemaining,
        previewRating: buildPreview(camp),
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
        camp.sessionBonuses = buildSessionBonuses(camp.sessions, camp.perks);
        // Special Moves: freeze the equipped loadout alongside sessionBonuses so a later
        // UPGRADE drop can't change this already-booked fight's power.
        camp.moveBonuses = await specialMovesService.buildMoveBonusesSnapshot(fighterId);
        camp.finalisedAt = new Date();
    } else {
        camp.injuryPenalty = { ...injuryCfg.fightPenalty };
    }

    await camp.save();
    return toClientCamp(camp);
}

/**
 * v2: Finalise the camp — compute rating, build session bonuses, generate wildcard.
 */
async function finaliseCamp(fightId, fighterId, skip = false) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    if (camp.finalisedAt) throw new Error("Camp is already finalised");

    // Special Moves: freeze the equipped loadout at finalise (both skip and normal paths).
    // Skipping camp forfeits SESSION bonuses but not the permanent, always-on special moves,
    // so the snapshot is taken regardless of skip.
    camp.moveBonuses = await specialMovesService.buildMoveBonusesSnapshot(fighterId);

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
        camp.sessionBonuses = buildSessionBonuses(camp.sessions, camp.perks);

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

/**
 * Shop v1.0 — select (or clear) the pre-fight supplement for this fight's camp.
 * Selecting does NOT decrement inventory; ownership is a UX guard here and the buff
 * is authoritatively re-validated and consumed at fight resolve.
 *
 * @param {string} fightId
 * @param {string} fighterId
 * @param {(string|null)} buffId  buff itemId, or null to clear the selection
 * @returns {Promise<{ selectedBuffId: (string|null), message: string }>}
 */
async function selectBuff(fightId, fighterId, buffId) {
    const camp = await FightCamp.findOne({ fightId });
    if (!camp) throw new Error("Camp not found");
    assertCampOwnership(camp, fighterId);

    // Block selection once the fight has already been resolved/completed.
    const fight = await Fight.findById(fightId).select("status");
    if (fight && fight.status === "completed") throw new Error("Fight already resolved");

    if (buffId === null || buffId === undefined || buffId === "") {
        camp.selectedBuffId = null;
        await camp.save();
        return { selectedBuffId: null, message: "Supplement cleared." };
    }

    const buffCfg = BUFFS[buffId];
    if (!buffCfg) throw new Error("Unknown supplement");

    // Ownership guard at selection time (re-checked authoritatively at resolve).
    const fighter = await Fighter.findById(fighterId).select("inventory");
    if (!fighter) throw new Error("Fighter not found");
    const owned = (fighter.inventory && fighter.inventory.prefightBuffs
        && fighter.inventory.prefightBuffs[buffId]) || 0;
    if (owned <= 0) throw new Error("You don't own that supplement");

    camp.selectedBuffId = buffId;
    await camp.save();
    return { selectedBuffId: buffId, message: `${buffCfg.name} selected for fight night.` };
}

module.exports = {
    createCamp,
    selectBuff,
    getFighterReport,
    getCampState,
    addCampSession,
    removeSession,
    resolveInjury,
    finaliseCamp,
    // Exported for fight resolution and testing
    buildSessionBonuses,
    getMatchStatus,
    generateWildcard,
};
