const crypto = require("crypto");
const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");
const Opponent = require("../models/opponentModel");
const PodcastEpisode = require("../models/podcastEpisodeModel");
const MediaArchiveEntry = require("../models/mediaArchiveModel");

const notorietyService = require("./notorietyService");
const energyService = require("./energyService");
const interviewService = require("./interviewService");
const sponsorshipService = require("./sponsorshipService");
const personaService = require("./personaService");

// ── Persona actionKey resolution (data-only maps; persona math lives in personaService) ──
function podcastPersonaActionKey(segKey, tone) {
    switch (segKey) {
        case "RECAP": return "PODCAST_RECAP";
        case "BREAKDOWN": return "PODCAST_BREAKDOWN";
        case "TRASH": return "PODCAST_TRASH";
        case "RESPECT": return "PODCAST_RESPECT";
        case "CRYPTIC": return "PODCAST_CRYPTIC";
        case "GUEST": return tone === "TRASH" ? "PODCAST_GUEST_BEEF" : "PODCAST_GUEST_RESPECT";
        default: return null;
    }
}
function appearancePersonaActionKey(type, tone) {
    switch (type) {
        case "MAGAZINE_COVER": return "APPEARANCE_MAGAZINE_COVER";
        case "PODCAST_GUEST": return tone === "TRASH" ? "APPEARANCE_PODCAST_GUEST_BEEF" : "APPEARANCE_PODCAST_GUEST_RESPECT";
        case "UNDERCARD_FEATURE": return "APPEARANCE_UNDERCARD_FEATURE";
        case "BRAND_DEAL_CLIP": return "APPEARANCE_BRAND_DEAL_CLIP";
        case "CHARITY_EXHIBITION": return "APPEARANCE_CHARITY_EXHIBITION";
        default: return null;
    }
}

/**
 * Aggregate a sequence of applyNudge reports (podcast has one per segment) into ONE
 * personaNudge response object: total delta, before(first)→after(last), OR-ed flags.
 * `stateBefore`/`stateAfter` are personaService.getState snapshots.
 */
function aggregatePersonaNudge(stateBefore, stateAfter, reports) {
    // Milestone payloads (Persona Moment modal): a multi-segment action can only
    // crown once (crownedArchetypes gates repeats), so the last report carrying
    // each block wins. signatureInfo is only kept when the AGGREGATE transition
    // activates the signature (a mid-action flicker that ends deactivated is not
    // a milestone).
    const crownedReport = [...reports].reverse().find(
        (r) => r && r.crowned && r.crowned === stateAfter.archetype
    );
    const signatureActivated = !stateBefore.signatureActive && stateAfter.signatureActive;
    const signatureReport = signatureActivated
        ? [...reports].reverse().find((r) => r && r.signatureInfo)
        : null;
    return {
        dx: stateAfter.x - stateBefore.x,
        dy: stateAfter.y - stateBefore.y,
        before: { x: stateBefore.x, y: stateBefore.y, heat: stateBefore.heat, archetype: stateBefore.archetype },
        after: { x: stateAfter.x, y: stateAfter.y, heat: stateAfter.heat, archetype: stateAfter.archetype },
        breakingCharacter: reports.some((r) => r && r.breakingCharacter),
        shattered: reports.some((r) => r && r.shattered),
        blackoutSet: reports.some((r) => r && r.blackoutSet),
        signatureActivated,
        signatureDeactivated: stateBefore.signatureActive && !stateAfter.signatureActive,
        crowned: crownedReport ? crownedReport.crowned : null,
        ...(crownedReport?.crownedInfo ? { crownedInfo: crownedReport.crownedInfo } : {}),
        ...(signatureReport?.signatureInfo ? { signatureInfo: signatureReport.signatureInfo } : {}),
    };
}

/** Documentary FOCUS → persona nudge map (display; combined nudge = focus+tone summed). */
function personaFocusNudges() {
    const out = {};
    for (const k of DOCUMENTARY_FOCUS_KEYS) out[k] = personaService.documentaryFocusNudge(k);
    return out;
}
/** Documentary TONE → persona nudge map (display). */
function personaToneNudges() {
    const out = {};
    for (const k of DOCUMENTARY_TONE_KEYS) out[k] = personaService.documentaryToneNudge(k);
    return out;
}

/** Fire-and-forget persona career-feed emit for an aggregate transition (after save). */
function emitPersonaFeed(fighterId, fighter, aggregateNudge) {
    try {
        for (const e of personaService.personaFeedEvents(fighter, aggregateNudge)) {
            require("./activityLogService").log(fighterId, e.type, e.detail, e.meta);
        }
    } catch (e) {
        console.error("[persona] media feed emit failed:", e.message);
    }
}

const { tierRank, calculateTierFromScore } = require("../consts/notorietyConfig");
const { NOTORIETY_TIERS } = require("../consts/notorietyConfig");
const { hashSeed, seededShuffle } = require("../utils/rotation");
const {
    PODCAST_ENERGY_COST,
    PODCAST_SEGMENT_COUNT,
    PODCAST_SEGMENTS,
    PODCAST_SEGMENT_KEYS,
    titleForEpisode,
    listenersFromScore,
    formatListeners,
    DOCUMENTARY_FOCUS,
    DOCUMENTARY_FOCUS_KEYS,
    DOCUMENTARY_TONE_KEYS,
    DOCUMENTARY_TIMING_KEYS,
    DOCUMENTARY_TIMING,
    DOCUMENTARY_UNLOCK_TIER,
    DOCUMENTARY_UNLOCK_THRESHOLD,
    DOCUMENTARY_BADGE,
    DOCUMENTARY_PENDING_MAX_FIGHTS,
    DOC_TECHNICIAN_BOOSTER_ID,
    DOC_TECHNICIAN_SESSIONS,
    computeDocumentaryReward,
    APPEARANCE_TYPES,
    APPEARANCE_TYPE_KEYS,
    APPEARANCE_POOL_SIZE,
    APPEARANCE_ROTATION_MS,
    RIVALRY_DISPLAY,
} = require("../consts/mediaHubConfig");

const WIN_OUTCOMES = ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"];
const MS_PER_DAY = 86400000;

const PROMOTION_TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];
function promotionTierRank(tier) {
    const idx = PROMOTION_TIER_ORDER.indexOf(tier);
    return idx < 0 ? 0 : idx;
}

// ─────────────────────────────────────────────────────────────
// UTC-day helpers (podcast gate is calendar-day in UTC)
// ─────────────────────────────────────────────────────────────

function isSameUtcDay(a, b) {
    const x = new Date(a);
    const y = new Date(b);
    return x.getUTCFullYear() === y.getUTCFullYear()
        && x.getUTCMonth() === y.getUTCMonth()
        && x.getUTCDate() === y.getUTCDate();
}

/** Next UTC midnight strictly after `from`. */
function nextUtcMidnight(from = new Date()) {
    const d = new Date(from);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
}

function peakTier(fighter) {
    return fighter?.notoriety?.peakTier || "UNKNOWN";
}
function tierLabelFor(tierKey) {
    return (NOTORIETY_TIERS[tierKey] || NOTORIETY_TIERS.UNKNOWN).label;
}

// ─────────────────────────────────────────────────────────────
// Shared target resolution (uses interviewService rules)
// ─────────────────────────────────────────────────────────────

/**
 * Resolve + validate a target opponent against the callout-candidate rules.
 * Returns the lean opponent doc. Throws a whitelisted message on failure.
 */
async function resolveValidTarget(fighter, opponentId) {
    if (!opponentId) throw new Error("Target opponent required");
    const candidates = await interviewService.listCalloutCandidates(fighter._id);
    const match = candidates.find((c) => String(c.id) === String(opponentId));
    if (!match) throw new Error("Target is not a valid opponent right now");
    const opp = await Opponent.findById(opponentId).lean();
    if (!opp) throw new Error("Target opponent not found");
    return opp;
}

/** Write/refresh a beef flag (matches interviewService shape). */
function writeBeefFlag(fighter, opp, source, expiresAfterFights) {
    fighter.beefFlags = fighter.beefFlags || [];
    const existing = fighter.beefFlags.find((f) => String(f.opponentId) === String(opp._id));
    if (existing) {
        existing.expiresAfterFights = expiresAfterFights;
        existing.createdAt = new Date();
        existing.source = source;
    } else {
        fighter.beefFlags.push({
            opponentId: opp._id,
            opponentName: opp.name,
            source,
            expiresAfterFights,
            createdAt: new Date(),
        });
        // Lifetime beefs-started counter (drives the `controversy` badge). Only a
        // genuinely NEW beef counts — refreshing an existing flag does not.
        fighter.media = fighter.media || {};
        fighter.media.beefsStarted = (fighter.media.beefsStarted || 0) + 1;
    }
    // Beef and Respect are mutually exclusive per opponent — last stance wins.
    fighter.respectFlags = (fighter.respectFlags || []).filter(
        (f) => String(f.opponentId) !== String(opp._id)
    );
}

/** Write a respect flag if one doesn't already exist (matches interviewService shape). */
function writeRespectFlag(fighter, opp, source, expiresAfterFights) {
    fighter.respectFlags = fighter.respectFlags || [];
    if (!fighter.respectFlags.some((f) => String(f.opponentId) === String(opp._id))) {
        fighter.respectFlags.push({
            opponentId: opp._id,
            opponentName: opp.name,
            source,
            expiresAfterFights,
            createdAt: new Date(),
        });
    }
    // Beef and Respect are mutually exclusive per opponent — last stance wins.
    fighter.beefFlags = (fighter.beefFlags || []).filter(
        (f) => String(f.opponentId) !== String(opp._id)
    );
}

// ─────────────────────────────────────────────────────────────
// Last fight
// ─────────────────────────────────────────────────────────────

async function getLastCompletedFight(fighterId) {
    return Fight.findOne({ fighterId, status: "completed" })
        .sort({ completedAt: -1, updatedAt: -1 })
        .populate("opponentId", "name nickname")
        .lean();
}

function summariseFight(fight) {
    if (!fight) return null;
    return {
        fightId: String(fight._id),
        outcome: fight.outcome,
        opponentName: fight.opponentId?.name || "Opponent",
        opponentNickname: fight.opponentId?.nickname || null,
        promotionTier: fight.promotionTier,
        completedAt: fight.completedAt || fight.updatedAt || null,
    };
}

// ─────────────────────────────────────────────────────────────
// Segment availability (for the catalog in hub state)
// ─────────────────────────────────────────────────────────────

function segmentLockReason(seg, fighter, hasLastFight) {
    if (seg.gating?.requiresLastFight && !hasLastFight) {
        return "Record after a completed fight";
    }
    if (seg.gating?.minPromotionTier) {
        if (promotionTierRank(fighter.promotionTier) < promotionTierRank(seg.gating.minPromotionTier)) {
            return `Requires ${seg.gating.minPromotionTier}`;
        }
    }
    return null;
}

function buildSegmentCatalog(fighter, hasLastFight) {
    return PODCAST_SEGMENT_KEYS.map((key) => {
        const seg = PODCAST_SEGMENTS[key];
        const lockReason = segmentLockReason(seg, fighter, hasLastFight);
        // Persona nudge for display. GUEST is tone-dependent — show the beef (TRASH) variant
        // as the representative; the preview endpoint resolves the exact tone at request time.
        const nudge = personaService.nudgeForAction(podcastPersonaActionKey(key, "TRASH"));
        return {
            key: seg.key,
            name: seg.name,
            fame: seg.fame,
            cash: seg.cash,
            needsTarget: !!seg.needsTarget,
            flag: seg.flag,
            deepLink: seg.deepLink || null,
            available: !lockReason,
            lockReason: lockReason || null,
            nudge,
        };
    });
}

// ─────────────────────────────────────────────────────────────
// Appearance pool generation (deterministic per rotation)
// ─────────────────────────────────────────────────────────────

function currentAppearanceRotation() {
    return Math.floor(Date.now() / APPEARANCE_ROTATION_MS);
}
function appearanceRotationRefreshAt(rotation) {
    return new Date((rotation + 1) * APPEARANCE_ROTATION_MS);
}

function appearanceEligibleTypes(fighter, hasActiveSponsor) {
    return APPEARANCE_TYPE_KEYS.filter((key) =>
        appearanceEligible(APPEARANCE_TYPES[key], fighter, hasActiveSponsor)
    );
}

/**
 * Build a fresh appearance pool for the current rotation. Deterministic given
 * fighterId + rotation. Snapshots sponsor cash basis for BRAND_DEAL_CLIP.
 */
function generateAppearancePool(fighter, rotation, hasActiveSponsor, sponsorCashBasis) {
    const eligible = appearanceEligibleTypes(fighter, hasActiveSponsor);
    if (eligible.length === 0) return [];
    const seed = hashSeed(`${fighter._id}:appearances:${rotation}`);
    // Weighted bag: repeat each type by its weight so the shuffle respects weighting.
    const bag = [];
    for (const key of eligible) {
        const w = APPEARANCE_TYPES[key].weight || 1;
        for (let i = 0; i < w; i += 1) bag.push(key);
    }
    const shuffled = seededShuffle(bag, seed);
    // Pick distinct types up to the pool size. Persona (People's Champ, heat≥70) grants +1
    // pool slot — surfaced through getModifiers so the math stays in personaService.
    const poolSize = APPEARANCE_POOL_SIZE + (personaService.getModifiers(fighter).appearancePoolBonus || 0);
    const chosen = [];
    for (const key of shuffled) {
        if (!chosen.includes(key)) chosen.push(key);
        if (chosen.length >= poolSize) break;
    }
    const now = Date.now();
    return chosen.map((key) => {
        const def = APPEARANCE_TYPES[key];
        const inst = {
            instanceId: crypto.randomUUID(),
            type: key,
            expiresAt: new Date(now + def.deadlineDays * MS_PER_DAY),
            requiresFightByDate: null,
            status: "available",
            takenAt: null,
            cashSnapshot: 0,
        };
        if (key === "BRAND_DEAL_CLIP") {
            inst.cashSnapshot = Math.round(0.5 * (sponsorCashBasis || 0));
        }
        return inst;
    });
}

async function sponsorContext(fighterId) {
    let active = [];
    try {
        active = await sponsorshipService.listActive(fighterId);
    } catch (_) {
        active = [];
    }
    const hasActiveSponsor = active.length > 0;
    // Cash basis: highest rewardPerFight among active sponsors.
    let basis = 0;
    for (const s of active) {
        if (Number.isFinite(s.rewardPerFight) && s.rewardPerFight > basis) basis = s.rewardPerFight;
    }
    return { hasActiveSponsor, sponsorCashBasis: basis };
}

/**
 * Lazily regenerate / expire the fighter's appearance pool in-memory.
 * Returns { changed } so the caller can decide whether to persist.
 * - Rotation advanced → expire unused (no rollover), generate a fresh pool.
 * - Same rotation → mark deadline-expired instances.
 */
async function reconcileAppearances(fighter) {
    const rotation = currentAppearanceRotation();
    const { hasActiveSponsor, sponsorCashBasis } = await sponsorContext(fighter._id);
    fighter.media = fighter.media || {};
    let changed = false;
    const now = Date.now();

    if (fighter.media.appearancesRotation !== rotation) {
        // No rollover — discard prior pool entirely, generate fresh.
        fighter.media.appearances = generateAppearancePool(fighter, rotation, hasActiveSponsor, sponsorCashBasis);
        fighter.media.appearancesRotation = rotation;
        changed = true;
    } else {
        // Same rotation — expire deadline-passed available instances.
        for (const inst of fighter.media.appearances || []) {
            if (inst.status === "available" && inst.expiresAt && new Date(inst.expiresAt).getTime() <= now) {
                inst.status = "expired";
                changed = true;
            }
        }
    }
    return { changed, rotation, hasActiveSponsor };
}

function appearanceFameForTier(def, tierKey) {
    if (Number.isFinite(def.flatFame)) return def.flatFame;
    return def.fameByTier?.[tierKey] ?? 0;
}

/**
 * Promotion-tier eligibility check for promotion-gated appearances.
 * Returns true if the fighter meets `def.gatingPromotionTier` (or there is none).
 */
function meetsPromotionGate(def, fighter) {
    if (!def.gatingPromotionTier) return true;
    return promotionTierRank(fighter.promotionTier) >= promotionTierRank(def.gatingPromotionTier);
}

/**
 * Unified eligibility for an appearance type given the fighter + sponsor context.
 * Promotion-gated types check promotionTier; the rest check fame peakTier.
 */
function appearanceEligible(def, fighter, hasActiveSponsor) {
    if (def.needsSponsor && !hasActiveSponsor) return false;
    if (def.gatingPromotionTier) return meetsPromotionGate(def, fighter);
    return tierRank(def.gatingTier) <= tierRank(peakTier(fighter));
}

function appearanceView(inst, fighter) {
    const def = APPEARANCE_TYPES[inst.type] || {};
    const now = Date.now();
    const expMs = inst.expiresAt ? new Date(inst.expiresAt).getTime() : null;
    const daysLeft = expMs != null ? Math.max(0, Math.ceil((expMs - now) / MS_PER_DAY)) : null;
    let lockReason = null;
    if (inst.status === "expired") lockReason = "Expired";
    else if (inst.status === "taken") lockReason = "Already taken";
    else if (def.gatingPromotionTier && !meetsPromotionGate(def, fighter)) {
        lockReason = `Requires ${def.gatingPromotionTier} promotion`;
    } else if (!def.gatingPromotionTier && tierRank(def.gatingTier) > tierRank(peakTier(fighter))) {
        lockReason = `Requires ${tierLabelFor(def.gatingTier)} fame`;
    }

    const fame = def.arms ? 0 : appearanceFameForTier(def, peakTier(fighter));
    const cash = inst.type === "BRAND_DEAL_CLIP" ? (inst.cashSnapshot || 0) : 0;

    return {
        instanceId: inst.instanceId,
        type: inst.type,
        label: def.label || inst.type,
        energyCost: def.energy || 0,
        fame,
        cash,
        arms: !!def.arms,
        needsTarget: !!def.needsTarget,
        needsSponsor: !!def.needsSponsor,
        gatingTier: def.gatingTier,
        gatingPromotionTier: def.gatingPromotionTier || null,
        deadlineDays: def.deadlineDays,
        daysLeft,
        expiresAt: inst.expiresAt || null,
        requiresFightByDate: inst.requiresFightByDate || null,
        status: inst.status,
        actionLabel: def.actionLabel || "Take",
        available: inst.status === "available" && !lockReason,
        lockReason,
        // Persona nudge for display. PODCAST_GUEST is tone-dependent — show the beef (TRASH)
        // variant as representative; preview resolves the exact tone at request time.
        nudge: personaService.nudgeForAction(appearancePersonaActionKey(inst.type, "TRASH")),
    };
}

// ─────────────────────────────────────────────────────────────
// Documentary status helpers
// ─────────────────────────────────────────────────────────────

function documentaryUnlocked(fighter) {
    return tierRank(peakTier(fighter)) >= tierRank(DOCUMENTARY_UNLOCK_TIER);
}

/**
 * Resolve the documentaryStatus the fighter SHOULD have, given notoriety state.
 * recorded > available > locked.
 */
function deriveDocumentaryStatus(fighter) {
    if (fighter.notoriety?.documentaryUsed || fighter.media?.documentaryRecordedAt) return "recorded";
    if (documentaryUnlocked(fighter)) return "available";
    return "locked";
}

// ─────────────────────────────────────────────────────────────
// GET hub state
// ─────────────────────────────────────────────────────────────

async function getHubState(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);
    fighter.media = fighter.media || {};

    let needsSave = false;

    // Lazy documentary status transition locked → available (persist only if changed).
    const desiredDocStatus = deriveDocumentaryStatus(fighter);
    if (fighter.media.documentaryStatus !== desiredDocStatus
        && !(fighter.media.documentaryStatus === "recorded")) {
        // never downgrade away from recorded
        if (!(desiredDocStatus === "locked" && fighter.media.documentaryStatus === "available")) {
            fighter.media.documentaryStatus = desiredDocStatus;
            needsSave = true;
        }
    }
    if (desiredDocStatus === "recorded" && fighter.media.documentaryStatus !== "recorded") {
        fighter.media.documentaryStatus = "recorded";
        needsSave = true;
    }

    // Lazy appearances regen (persist if pool changed).
    const { changed: apprChanged } = await reconcileAppearances(fighter);
    if (apprChanged) needsSave = true;

    const score = fighter.notoriety.score || 0;
    const pTier = peakTier(fighter);
    const listeners = listenersFromScore(score);

    const lastRecorded = fighter.media.lastRecordedDate || null;
    const recordedToday = lastRecorded ? isSameUtcDay(lastRecorded, new Date()) : false;
    const canRecord = !recordedToday;

    const lastFight = await getLastCompletedFight(fighterId);
    const hasLastFight = !!lastFight;

    const lastEpisode = await PodcastEpisode.findOne({ fighterId })
        .sort({ recordedAt: -1 })
        .lean();

    // Documentary progress (toward STAR threshold).
    const docStatus = fighter.media.documentaryStatus;
    const docProgress = {
        current: Math.min(score, DOCUMENTARY_UNLOCK_THRESHOLD),
        needed: DOCUMENTARY_UNLOCK_THRESHOLD,
        percent: Math.min(100, Math.round((score / DOCUMENTARY_UNLOCK_THRESHOLD) * 100)),
    };

    // Lazy podcast-name backfill: fighters created before the Media Hub feature have
    // no generated name. Generate + persist once so the UI never shows "Untitled".
    if (!fighter.media.podcastName) {
        const { generatePodcastName } = require("../consts/mediaHubConfig");
        fighter.media.podcastName = generatePodcastName(
            fighter.firstName, fighter.lastName, fighter.nickname || null
        );
        needsSave = true;
    }

    if (needsSave) await fighter.save();

    // Persona: cosmetic listeners bonus is surfaced (never alters listenersFromScore).
    const personaBlock = personaService.buildPersonaBlock(fighter);
    const listenersPersonaPct = personaService.getModifiers(fighter).listenersPct || 0;
    const listenersDisplayed = Math.round(listeners * (1 + listenersPersonaPct));

    return {
        fame: score,
        peakTier: pTier,
        tierLabel: tierLabelFor(pTier),
        listeners,
        listenersFormatted: formatListeners(listeners),
        listenersDisplayed,
        listenersDisplayedFormatted: formatListeners(listenersDisplayed),
        persona: personaBlock,
        podcast: {
            podcastName: fighter.media.podcastName || null,
            episodeCount: fighter.media.episodeCount || 0,
            nextEpisodeNumber: (fighter.media.episodeCount || 0) + 1,
            canRecord,
            energyCost: PODCAST_ENERGY_COST,
            resetsAtUtcMidnight: recordedToday ? nextUtcMidnight() : null,
            hasLastFight,
            lastFightSummary: summariseFight(lastFight),
            segments: buildSegmentCatalog(fighter, hasLastFight),
            lastEpisode: lastEpisode
                ? {
                      id: String(lastEpisode._id),
                      episodeNumber: lastEpisode.episodeNumber,
                      title: lastEpisode.title,
                      segments: lastEpisode.segments || [],
                      fameEarned: lastEpisode.fameEarned || 0,
                      cashEarned: lastEpisode.cashEarned || 0,
                      listenersAtTime: lastEpisode.listenersAtTime || 0,
                      recordedAt: lastEpisode.recordedAt,
                  }
                : null,
        },
        documentary: {
            status: docStatus,
            unlockTier: DOCUMENTARY_UNLOCK_TIER,
            unlockThreshold: DOCUMENTARY_UNLOCK_THRESHOLD,
            progress: docProgress,
            // Persona nudge per documentary FOCUS / TONE option; the combined nudge is
            // focus+tone summed (quadrant null). Frontend previews via /persona/preview.
            focusNudges: personaFocusNudges(),
            toneNudges: personaToneNudges(),
            choices: fighter.media.documentaryChoices || null,
            reward: fighter.media.documentaryReward || null,
            recordedAt: fighter.media.documentaryRecordedAt || null,
            pending: fighter.media.documentaryPending
                ? {
                      focus: fighter.media.documentaryPending.focus,
                      tone: fighter.media.documentaryPending.tone,
                      timing: fighter.media.documentaryPending.timing,
                      committedAt: fighter.media.documentaryPending.committedAt,
                      fightsSince: fighter.media.documentaryPending.fightsSince || 0,
                  }
                : null,
        },
    };
}

// ─────────────────────────────────────────────────────────────
// GET targets
// ─────────────────────────────────────────────────────────────

async function getTargets(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");
    const candidates = await interviewService.listCalloutCandidates(fighterId);
    const beefSet = new Set((fighter.beefFlags || []).map((f) => String(f.opponentId)));
    const respSet = new Set((fighter.respectFlags || []).map((f) => String(f.opponentId)));
    return {
        candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name,
            nickname: c.nickname,
            overallRating: c.overallRating,
            style: c.style,
            record: c.record,
            hasBeef: beefSet.has(String(c.id)),
            hasRespect: respSet.has(String(c.id)),
        })),
    };
}

// ─────────────────────────────────────────────────────────────
// POST podcast
// ─────────────────────────────────────────────────────────────

async function recordPodcast(fighterId, body) {
    const segments = Array.isArray(body?.segments) ? body.segments : null;
    const targets = (body && typeof body.targets === "object" && body.targets) || {};

    // Validate segment selection: exactly PODCAST_SEGMENT_COUNT distinct known keys.
    if (!segments || segments.length !== PODCAST_SEGMENT_COUNT) {
        throw new Error(`Pick exactly ${PODCAST_SEGMENT_COUNT} segments`);
    }
    const distinct = new Set(segments.map((s) => String(s)));
    if (distinct.size !== PODCAST_SEGMENT_COUNT) {
        throw new Error("Segments must be distinct");
    }
    for (const key of distinct) {
        if (!PODCAST_SEGMENTS[key]) throw new Error("Unknown podcast segment");
    }

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);
    fighter.media = fighter.media || {};

    // UTC-day gate (idempotent retry → 400).
    if (fighter.media.lastRecordedDate && isSameUtcDay(fighter.media.lastRecordedDate, new Date())) {
        throw new Error("Podcast already recorded today");
    }

    const segKeys = [...distinct];
    const lastFight = await getLastCompletedFight(fighterId);
    const hasLastFight = !!lastFight;

    // ── Validate ALL segments + targets BEFORE any side-effects ──
    const resolvedTargets = {}; // segKey → { opp, tone }
    for (const key of segKeys) {
        const seg = PODCAST_SEGMENTS[key];
        // Gating
        const lockReason = segmentLockReason(seg, fighter, hasLastFight);
        if (lockReason) {
            if (seg.gating?.requiresLastFight) throw new Error("No completed fight to talk about");
            if (seg.gating?.minPromotionTier) throw new Error(`Requires ${seg.gating.minPromotionTier}`);
            throw new Error("Segment unavailable");
        }
        if (seg.needsTarget) {
            const t = targets[key];
            if (!t || !t.opponentId) throw new Error("Target opponent required");
            const opp = await resolveValidTarget(fighter, t.opponentId);
            let tone = null;
            if (key === "GUEST") {
                tone = String(t.tone || "").toUpperCase();
                if (tone !== "TRASH" && tone !== "RESPECT") {
                    throw new Error("Guest segment requires a tone (TRASH or RESPECT)");
                }
            }
            resolvedTargets[key] = { opp, tone };
        }
    }

    // Both segments can't aim at the same fighter — you can't take two stances on
    // one person in a single episode (e.g. trash-talk AND respect the same guy).
    const targetedIds = Object.values(resolvedTargets).map((r) => String(r.opp._id));
    if (targetedIds.length === 2 && targetedIds[0] === targetedIds[1]) {
        throw new Error("You can't target the same fighter with both segments");
    }

    // ── Deduct energy AFTER all validation (throws "Not enough energy") ──
    await energyService.deductEnergy(fighterId, PODCAST_ENERGY_COST);

    // ── Apply rewards + flags ──
    let totalFame = 0;
    let totalCash = 0;
    const flagsCreated = [];
    const episodeTargets = [];

    // Persona: one applyNudge PER segment in order. Per-segment fame is scaled by the
    // persona BEFORE that segment's nudge (evolving identity). Aggregate report built after.
    const personaBefore = personaService.getState(fighter);
    const personaReports = [];

    for (const key of segKeys) {
        const seg = PODCAST_SEGMENTS[key];
        const resolved = resolvedTargets[key];
        const tone = resolved ? resolved.tone : null;
        const actionKey = podcastPersonaActionKey(key, tone);

        // Breaking Character (×2 fame) for THIS segment only — detected on the current
        // (evolving) persona before this segment's nudge is applied.
        const bcPreview = actionKey ? personaService.previewNudge(fighter, { actionKey }) : null;
        const segBreaksCharacter = !!(bcPreview && bcPreview.breakingCharacter);

        // Fame scaled by the current persona (per-segment canonical category), then ×2 on BC.
        if (seg.fame > 0) {
            const cat = personaService.fameCategoryForAction(actionKey);
            let segFame = personaService.applyFameMultiplier(fighter, seg.fame, cat);
            if (segBreaksCharacter) segFame *= 2;
            totalFame += segFame;
        }
        if (seg.cash > 0) totalCash += seg.cash;

        if (resolved) {
            episodeTargets.push({ opponentId: resolved.opp._id, opponentName: resolved.opp.name });
            let flagType = seg.flag;
            if (flagType === "byTone") flagType = resolved.tone === "TRASH" ? "beef" : "respect";
            if (flagType === "beef") {
                writeBeefFlag(fighter, resolved.opp, "PODCAST", seg.beefExpiresAfterFights || 4);
                flagsCreated.push({ type: "beef", targetId: resolved.opp._id });
            } else if (flagType === "respect") {
                writeRespectFlag(fighter, resolved.opp, "PODCAST", seg.respectExpiresAfterFights || 6);
                flagsCreated.push({ type: "respect", targetId: resolved.opp._id });
            }
        }

        // Nudge AFTER fame for this segment so the next segment sees the shifted identity.
        if (actionKey) personaReports.push(personaService.applyNudge(fighter, { actionKey }));
    }

    const personaAfter = personaService.getState(fighter);
    const personaNudge = aggregatePersonaNudge(personaBefore, personaAfter, personaReports);

    let fameApplied = 0;
    if (totalFame > 0) {
        const { applied } = notorietyService.applyNotorietyDelta(fighter, totalFame, {
            code: "PODCAST",
            reason: "Podcast recorded",
            meta: { segments: segKeys },
        });
        fameApplied = applied;
        notorietyService.touchLastEvent(fighter);
    }
    if (totalCash > 0) fighter.iron = (fighter.iron || 0) + totalCash;

    // ── Episode bookkeeping ──
    const episodeNumber = (fighter.media.episodeCount || 0) + 1;
    const title = titleForEpisode(segKeys, String(fighter._id), episodeNumber);
    const now = new Date();
    fighter.media.lastRecordedDate = now;
    fighter.media.lastPodcastAt = now; // legacy mirror
    fighter.media.episodeCount = episodeNumber;
    fighter.media.podcastCount = (fighter.media.podcastCount || 0) + 1; // legacy mirror

    const listenersAtTime = listenersFromScore(fighter.notoriety.score || 0);

    // Career Page badges (first_episode / media_star / controversy from any beef
    // flags written above). Mutation-only — the save below persists. Never throws.
    try {
        require("./badgeService").evaluateBadges(fighter, { podcast: true });
    } catch (e) {
        console.error("[badges] evaluate on podcast failed:", e.message);
    }

    await fighter.save();

    emitPersonaFeed(fighter._id, fighter, personaNudge);

    const episode = await PodcastEpisode.create({
        fighterId: fighter._id,
        episodeNumber,
        title,
        segments: segKeys,
        targets: episodeTargets,
        fameEarned: totalFame,
        cashEarned: totalCash,
        listenersAtTime,
        recordedAt: now,
        flagsCreated,
    });

    return {
        episode: {
            id: String(episode._id),
            episodeNumber,
            title,
            segments: segKeys,
            fameEarned: totalFame,
            cashEarned: totalCash,
            listenersAtTime,
            listenersFormatted: formatListeners(listenersAtTime),
            recordedAt: now,
            flagsCreated: flagsCreated.map((f) => ({ type: f.type, targetId: String(f.targetId) })),
        },
        fameDelta: fameApplied,
        cashDelta: totalCash,
        personaNudge,
        resetsAtUtcMidnight: nextUtcMidnight(now),
        podcast: {
            podcastName: fighter.media.podcastName || null,
            episodeCount: episodeNumber,
            nextEpisodeNumber: episodeNumber + 1,
        },
    };
}

// ─────────────────────────────────────────────────────────────
// POST documentary
// ─────────────────────────────────────────────────────────────

function grantTechnicianBooster(fighter) {
    fighter.activeBooster = {
        id: DOC_TECHNICIAN_BOOSTER_ID,
        sessionsLeft: DOC_TECHNICIAN_SESSIONS,
        totalSessions: DOC_TECHNICIAN_SESSIONS,
    };
}

async function recordDocumentary(fighterId, body) {
    const focus = String(body?.focus || "").toUpperCase();
    const tone = String(body?.tone || "").toUpperCase();
    const timing = String(body?.timing || "").toUpperCase();

    if (!DOCUMENTARY_FOCUS_KEYS.includes(focus)) throw new Error("Invalid documentary focus");
    if (!DOCUMENTARY_TONE_KEYS.includes(tone)) throw new Error("Invalid documentary tone");
    if (!DOCUMENTARY_TIMING_KEYS.includes(timing)) throw new Error("Invalid documentary timing");

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);
    fighter.media = fighter.media || {};

    if (fighter.notoriety.documentaryUsed || fighter.media.documentaryRecordedAt) {
        throw new Error("You've already recorded your documentary");
    }
    if (tierRank(peakTier(fighter)) < tierRank(DOCUMENTARY_UNLOCK_TIER)) {
        throw new Error("Documentary unlocks at Star fame tier");
    }

    const choices = { focus, tone, timing };
    const now = new Date();

    // Mark recorded + used + award badge in all cases.
    fighter.notoriety.documentaryUsed = true;
    fighter.media.documentaryStatus = "recorded";
    fighter.media.documentaryChoices = choices;
    fighter.media.documentaryRecordedAt = now;
    fighter.badges = fighter.badges || [];
    if (!fighter.badges.includes(DOCUMENTARY_BADGE)) fighter.badges.push(DOCUMENTARY_BADGE);

    // Persona: capture state, apply the summed focus+tone nudge (quadrant null → never
    // breaks character) BEFORE payout fame is scaled + before save.
    const personaBefore = personaService.getState(fighter);
    const docNudgeSpec = personaService.documentaryNudge(focus, tone);

    let reward;
    if (timing === "NOW") {
        // Pay immediately at timing mult 1.0. Persona LEGACY signature scales doc fame ×1.5.
        const r = computeDocumentaryReward(choices, DOCUMENTARY_TIMING.NOW.mult);
        const scaledFame = personaService.applyFameMultiplier(
            fighter, r.fame, personaService.FAME_CATEGORY.DOCUMENTARY
        );
        notorietyService.applyNotorietyDelta(fighter, scaledFame, {
            skipFreezeBlock: true,
            code: "DOCUMENTARY",
            reason: "Career documentary released",
            meta: { focus, tone, timing },
        });
        notorietyService.touchLastEvent(fighter);
        fighter.iron = (fighter.iron || 0) + r.cash;
        if (r.grantsBooster) grantTechnicianBooster(fighter);
        reward = { fame: scaledFame, cash: r.cash, deferred: false, boosterGranted: !!r.grantsBooster };
        fighter.media.documentaryReward = reward;
        fighter.media.documentaryPending = null;
    } else {
        // Deferred — arm pending, no payout yet.
        fighter.media.documentaryPending = {
            focus,
            tone,
            timing,
            committedAt: now,
            fightsSince: 0,
        };
        reward = { fame: 0, cash: 0, deferred: true, boosterGranted: false };
        fighter.media.documentaryReward = reward;
    }

    // Persona nudge (focus+tone summed, quadrant null), before save.
    const docReport = personaService.applyNudge(fighter, docNudgeSpec);
    const personaAfter = personaService.getState(fighter);
    const personaNudge = aggregatePersonaNudge(personaBefore, personaAfter, [docReport]);

    // Career Page badge: `documentary` (status now "recorded"). Mutation-only.
    try {
        require("./badgeService").evaluateBadges(fighter, { documentary: true });
    } catch (e) {
        console.error("[badges] evaluate on documentary failed:", e.message);
    }

    await fighter.save();

    emitPersonaFeed(fighter._id, fighter, personaNudge);

    return {
        status: "recorded",
        choices,
        reward,
        recordedAt: now,
        personaNudge,
        pending: fighter.media.documentaryPending
            ? {
                  focus,
                  tone,
                  timing,
                  committedAt: now,
                  fightsSince: 0,
              }
            : null,
        badge: DOCUMENTARY_BADGE,
    };
}

// ─────────────────────────────────────────────────────────────
// GET appearances
// ─────────────────────────────────────────────────────────────

async function getAppearances(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);
    fighter.media = fighter.media || {};

    const { changed, rotation } = await reconcileAppearances(fighter);
    if (changed) await fighter.save();

    return {
        rotation,
        refreshesAt: appearanceRotationRefreshAt(rotation),
        appearances: (fighter.media.appearances || []).map((inst) => appearanceView(inst, fighter)),
    };
}

// ─────────────────────────────────────────────────────────────
// POST appearance
// ─────────────────────────────────────────────────────────────

async function takeAppearance(fighterId, instanceId, body) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    notorietyService.ensureNotorietyShape(fighter);
    fighter.media = fighter.media || {};

    const beforeRotation = fighter.media.appearancesRotation;
    const { changed, hasActiveSponsor } = await reconcileAppearances(fighter);
    // If the rotation advanced, any instanceId from the old pool is stale.
    if (fighter.media.appearancesRotation !== beforeRotation) {
        if (changed) await fighter.save();
        throw new Error("Appearance expired — pool refreshed");
    }

    const inst = (fighter.media.appearances || []).find((a) => a.instanceId === instanceId);
    if (!inst) {
        if (changed) await fighter.save();
        throw new Error("Appearance expired — pool refreshed");
    }
    if (inst.status === "taken") throw new Error("Appearance already taken");
    if (inst.status === "expired") throw new Error("Appearance has expired");
    if (inst.expiresAt && new Date(inst.expiresAt).getTime() <= Date.now()) {
        inst.status = "expired";
        await fighter.save();
        throw new Error("Appearance has expired");
    }

    const def = APPEARANCE_TYPES[inst.type];
    if (!def) throw new Error("Unknown appearance type");

    // Eligibility gate — promotion-gated types check promotionTier; the rest check fame tier.
    if (def.gatingPromotionTier) {
        if (!meetsPromotionGate(def, fighter)) {
            throw new Error(`Requires ${def.gatingPromotionTier} promotion`);
        }
    } else if (tierRank(peakTier(fighter)) < tierRank(def.gatingTier)) {
        throw new Error(`Requires ${tierLabelFor(def.gatingTier)} fame`);
    }
    // Sponsor gate for brand deals.
    if (def.needsSponsor && !hasActiveSponsor) {
        throw new Error("Active sponsor required for this appearance");
    }

    // Target validation (PODCAST_GUEST).
    let resolvedOpp = null;
    let tone = null;
    if (def.needsTarget) {
        const targetOpponentId = body?.targetOpponentId;
        resolvedOpp = await resolveValidTarget(fighter, targetOpponentId);
        tone = String(body?.tone || "").toUpperCase();
        if (tone !== "TRASH" && tone !== "RESPECT") {
            throw new Error("Tone required (TRASH or RESPECT)");
        }
    }

    // ── Deduct energy AFTER validation ──
    await energyService.deductEnergy(fighterId, def.energy || 0);

    let fameDelta = 0;
    let cashDelta = 0;
    let flagCreated = null;
    let armed = false;

    // Persona: resolve the action + capture state before fame is applied.
    const personaActionKey = appearancePersonaActionKey(inst.type, tone);
    const personaBefore = personaService.getState(fighter);
    // Breaking Character (×2 fame) — detected on the PRE-action persona (arms types carry no
    // fame and their quadrant is null, so this is only ever true on the fame-paying types).
    const bcPreview = personaActionKey ? personaService.previewNudge(fighter, { actionKey: personaActionKey }) : null;
    const appearanceBreaksCharacter = !!(bcPreview && bcPreview.breakingCharacter);

    if (def.arms) {
        // UNDERCARD_FEATURE: arm only — pays on a qualifying fight within fightByDays.
        const armDays = def.fightByDays || 10;
        inst.requiresFightByDate = new Date(Date.now() + armDays * MS_PER_DAY);
        armed = true;
    } else {
        const rawFame = appearanceFameForTier(def, peakTier(fighter));
        // Persona fame multiplier (single canonical category for this appearance), ×2 on BC.
        const cat = personaService.fameCategoryForAction(personaActionKey);
        let fame = personaService.applyFameMultiplier(fighter, rawFame, cat);
        if (appearanceBreaksCharacter) fame *= 2;
        if (fame > 0) {
            const { applied } = notorietyService.applyNotorietyDelta(fighter, fame, {
                code: "APPEARANCE",
                reason: `Media appearance: ${def.label}`,
                meta: { appearanceType: inst.type },
            });
            fameDelta = applied;
            notorietyService.touchLastEvent(fighter);
        }
        if (inst.type === "BRAND_DEAL_CLIP") {
            cashDelta = inst.cashSnapshot || 0;
            if (cashDelta > 0) fighter.iron = (fighter.iron || 0) + cashDelta;
        }
    }

    if (def.needsTarget && resolvedOpp) {
        if (tone === "TRASH") {
            writeBeefFlag(fighter, resolvedOpp, "APPEARANCE", def.beefExpiresAfterFights || 4);
            flagCreated = { type: "beef", targetId: resolvedOpp._id };
        } else {
            writeRespectFlag(fighter, resolvedOpp, "APPEARANCE", def.respectExpiresAfterFights || 6);
            flagCreated = { type: "respect", targetId: resolvedOpp._id };
        }
    }

    // Persona nudge — after fame, before save. actionKey from inst.type (+tone for guest).
    let personaNudge = null;
    if (personaActionKey) {
        const report = personaService.applyNudge(fighter, { actionKey: personaActionKey });
        const personaAfter = personaService.getState(fighter);
        personaNudge = aggregatePersonaNudge(personaBefore, personaAfter, [report]);
    }

    inst.status = "taken";
    inst.takenAt = new Date();

    await fighter.save();

    if (personaNudge) emitPersonaFeed(fighter._id, fighter, personaNudge);

    await MediaArchiveEntry.create({
        fighterId: fighter._id,
        kind: "APPEARANCE",
        appearanceType: inst.type,
        label: def.label,
        fameEarned: fameDelta,
        cashEarned: cashDelta,
        flagCreated: flagCreated
            ? { type: flagCreated.type, targetId: flagCreated.targetId }
            : null,
        takenAt: inst.takenAt,
    });

    return {
        type: inst.type,
        fameDelta,
        cashDelta,
        flagCreated: flagCreated
            ? { type: flagCreated.type, targetId: String(flagCreated.targetId) }
            : null,
        armed,
        personaNudge,
    };
}

// ─────────────────────────────────────────────────────────────
// POST persona preview (pure — no mutation, no save)
// ─────────────────────────────────────────────────────────────

/**
 * Preview the persona nudge for a prospective media action WITHOUT mutating/saving.
 * Request is exactly ONE of:
 *   { segments:[...], targets:{key:{tone}} }   — podcast (sequence, aggregated)
 *   { appearanceType, tone? }                   — appearance
 *   { documentary: { focus, tone } }            — documentary (focus+tone summed)
 *   { actionKey }                               — raw persona actionKey
 * Response = previewNudge object. All bad input throws "Invalid persona preview request".
 */
async function previewPersona(fighterId, body) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    personaService.ensurePersonaShape(fighter);

    // Detached preview fighter — a persona CLONE + tier only, so nothing leaks or persists.
    const p0 = fighter.persona || {};
    const clone = {
        promotionTier: fighter.promotionTier,
        persona: {
            x: p0.x || 0,
            y: p0.y || 0,
            blackoutFightsRemaining: p0.blackoutFightsRemaining || 0,
            lastBreakingCharacterAt: p0.lastBreakingCharacterAt || null,
        },
        markModified() {},
    };

    const bad = () => { throw new Error("Invalid persona preview request"); };
    if (!body || typeof body !== "object") bad();

    // Podcast — a sequence of segment nudges aggregated into one preview.
    if (Array.isArray(body.segments)) {
        if (body.segments.length === 0 || body.segments.length > PODCAST_SEGMENT_COUNT) bad();
        const targets = (body.targets && typeof body.targets === "object") ? body.targets : {};
        const before = personaService.getState(clone);
        const reports = [];
        for (const rawKey of body.segments) {
            const key = String(rawKey);
            if (!PODCAST_SEGMENTS[key]) bad();
            const t = targets[key];
            const tone = t && t.tone ? String(t.tone).toUpperCase() : null;
            const actionKey = podcastPersonaActionKey(key, tone);
            if (!actionKey) bad();
            reports.push(personaService.applyNudge(clone, { actionKey }));
        }
        const after = personaService.getState(clone);
        const agg = aggregatePersonaNudge(before, after, reports);
        return {
            dx: agg.dx,
            dy: agg.dy,
            before: agg.before,
            after: agg.after,
            breakingCharacter: agg.breakingCharacter,
            shattered: agg.shattered,
            wouldSetBlackout: agg.blackoutSet,
        };
    }

    // Appearance.
    if (body.appearanceType) {
        const type = String(body.appearanceType);
        if (!APPEARANCE_TYPES[type]) bad();
        const tone = body.tone ? String(body.tone).toUpperCase() : null;
        const actionKey = appearancePersonaActionKey(type, tone);
        const preview = personaService.previewNudge(clone, { actionKey });
        if (!preview) bad();
        return preview;
    }

    // Documentary (focus + tone summed).
    if (body.documentary && typeof body.documentary === "object") {
        const focus = String(body.documentary.focus || "").toUpperCase();
        const tone = String(body.documentary.tone || "").toUpperCase();
        if (!DOCUMENTARY_FOCUS_KEYS.includes(focus) || !DOCUMENTARY_TONE_KEYS.includes(tone)) bad();
        const spec = personaService.documentaryNudge(focus, tone);
        const preview = personaService.previewNudge(clone, spec);
        if (!preview) bad();
        return preview;
    }

    // Raw actionKey.
    if (body.actionKey) {
        const preview = personaService.previewNudge(clone, { actionKey: String(body.actionKey) });
        if (!preview) bad();
        return preview;
    }

    return bad();
}

// ─────────────────────────────────────────────────────────────
// GET rivalry (read-only)
// ─────────────────────────────────────────────────────────────

async function getRivalry(fighterId) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const nemesis = fighter.nemesis && fighter.nemesis.opponentId
        ? {
              opponentId: String(fighter.nemesis.opponentId),
              opponentName: fighter.nemesis.opponentName || null,
              lossCount: fighter.nemesis.lossCount || 0,
              setAt: fighter.nemesis.setAt || null,
              fameBonus: RIVALRY_DISPLAY.nemesisFame,
          }
        : null;

    const beef = (fighter.beefFlags || []).map((f) => ({
        opponentId: String(f.opponentId),
        opponentName: f.opponentName || "",
        source: f.source,
        expiresAfterFights: f.expiresAfterFights,
        createdAt: f.createdAt,
        fameMultPct: RIVALRY_DISPLAY.beefFameMultPct,
        lapsePenalty: RIVALRY_DISPLAY.beefLapsePenalty,
    }));

    const respect = (fighter.respectFlags || []).map((f) => ({
        opponentId: String(f.opponentId),
        opponentName: f.opponentName || "",
        source: f.source,
        expiresAfterFights: f.expiresAfterFights,
        createdAt: f.createdAt,
        ironBonusPct: RIVALRY_DISPLAY.respectIronPct,
    }));

    const callout = fighter.activeCallout && fighter.activeCallout.opponentId
        ? {
              opponentId: String(fighter.activeCallout.opponentId),
              opponentName: fighter.activeCallout.opponentName || null,
              cost: fighter.activeCallout.cost || 0,
              isStretch: !!fighter.activeCallout.isStretch,
              calledAt: fighter.activeCallout.calledAt || null,
              pursePct: RIVALRY_DISPLAY.calloutPursePct,
          }
        : null;

    return { nemesis, beef, respect, callout };
}

// ─────────────────────────────────────────────────────────────
// GET archive
// ─────────────────────────────────────────────────────────────

const ARCHIVE_PAGE_SIZE = 10;

function podcastToEntry(ep) {
    return {
        kind: "podcast",
        id: String(ep._id),
        date: ep.recordedAt || ep.createdAt,
        title: ep.title || `Episode ${ep.episodeNumber}`,
        episodeNumber: ep.episodeNumber,
        segments: ep.segments || [],
        fameEarned: ep.fameEarned || 0,
        cashEarned: ep.cashEarned || 0,
        listenersAtTime: ep.listenersAtTime || 0,
    };
}
function fightInterviewToEntry(f) {
    return {
        kind: "postfight",
        id: String(f._id),
        date: f.interview?.resolvedAt || f.completedAt || f.updatedAt,
        outcome: f.outcome,
        opponentName: f.opponentId?.name || "Opponent",
        choice: f.interview?.choice || null,
        fameEarned: f.interview?.fameGained || 0,
    };
}
function appearanceToEntry(a) {
    return {
        kind: "appearance",
        id: String(a._id),
        date: a.takenAt || a.createdAt,
        appearanceType: a.appearanceType,
        label: a.label || a.appearanceType,
        fameEarned: a.fameEarned || 0,
        cashEarned: a.cashEarned || 0,
    };
}
function documentaryToEntry(fighter) {
    return {
        kind: "documentary",
        id: `doc:${fighter._id}`,
        date: fighter.media?.documentaryRecordedAt,
        title: "Career Documentary",
        choices: fighter.media?.documentaryChoices || null,
        reward: fighter.media?.documentaryReward || null,
    };
}

async function getArchive(fighterId, { filter = "all", page = 1 } = {}) {
    const fighter = await Fighter.findById(fighterId).lean();
    if (!fighter) throw new Error("Fighter not found");

    const validFilters = ["all", "podcast", "postfight", "appearances"];
    const f = validFilters.includes(filter) ? filter : "all";
    const p = Math.max(1, parseInt(page, 10) || 1);
    const skip = (p - 1) * ARCHIVE_PAGE_SIZE;

    // Single-source filters use native skip/limit (+1 for hasMore).
    if (f === "podcast") {
        const rows = await PodcastEpisode.find({ fighterId })
            .sort({ recordedAt: -1 })
            .skip(skip)
            .limit(ARCHIVE_PAGE_SIZE + 1)
            .lean();
        const hasMore = rows.length > ARCHIVE_PAGE_SIZE;
        return { entries: rows.slice(0, ARCHIVE_PAGE_SIZE).map(podcastToEntry), page: p, hasMore };
    }
    if (f === "postfight") {
        const rows = await Fight.find({ fighterId, status: "completed", "interview.done": true })
            .sort({ "interview.resolvedAt": -1, completedAt: -1 })
            .skip(skip)
            .limit(ARCHIVE_PAGE_SIZE + 1)
            .populate("opponentId", "name nickname")
            .lean();
        const hasMore = rows.length > ARCHIVE_PAGE_SIZE;
        return { entries: rows.slice(0, ARCHIVE_PAGE_SIZE).map(fightInterviewToEntry), page: p, hasMore };
    }
    if (f === "appearances") {
        const rows = await MediaArchiveEntry.find({ fighterId })
            .sort({ takenAt: -1 })
            .skip(skip)
            .limit(ARCHIVE_PAGE_SIZE + 1)
            .lean();
        const hasMore = rows.length > ARCHIVE_PAGE_SIZE;
        return { entries: rows.slice(0, ARCHIVE_PAGE_SIZE).map(appearanceToEntry), page: p, hasMore };
    }

    // "all" — over-fetch page*10+1 per source, merge, slice, hasMore via N+1.
    const overFetch = p * ARCHIVE_PAGE_SIZE + 1;
    const [podcasts, fights, appearances] = await Promise.all([
        PodcastEpisode.find({ fighterId }).sort({ recordedAt: -1 }).limit(overFetch).lean(),
        Fight.find({ fighterId, status: "completed", "interview.done": true })
            .sort({ "interview.resolvedAt": -1, completedAt: -1 })
            .limit(overFetch)
            .populate("opponentId", "name nickname")
            .lean(),
        MediaArchiveEntry.find({ fighterId }).sort({ takenAt: -1 }).limit(overFetch).lean(),
    ]);

    const merged = [
        ...podcasts.map(podcastToEntry),
        ...fights.map(fightInterviewToEntry),
        ...appearances.map(appearanceToEntry),
    ];
    if (fighter.media?.documentaryRecordedAt) {
        merged.push(documentaryToEntry(fighter));
    }

    merged.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
    });

    const pageSlice = merged.slice(skip, skip + ARCHIVE_PAGE_SIZE + 1);
    const hasMore = pageSlice.length > ARCHIVE_PAGE_SIZE;
    return { entries: pageSlice.slice(0, ARCHIVE_PAGE_SIZE), page: p, hasMore };
}

// ─────────────────────────────────────────────────────────────
// Post-fight hooks (called from fightService)
// ─────────────────────────────────────────────────────────────

function isWinOutcome(outcome) {
    return WIN_OUTCOMES.includes(outcome);
}
function isTitleFight(fight) {
    return fight?.offerType === "TitleShot";
}

/**
 * Resolve a pending (deferred) documentary against a just-completed fight.
 * Mutates fighter in-memory; the caller persists (fightService's fighter.save()).
 * Clears documentaryPending in the same mutation that applies the reward to guard
 * against double-pay.
 *
 *   BEFORE_TITLE → ×1.5 if a title fight occurs while pending; else base ×1.0 at fightsSince >= 10.
 *   AFTER_TITLE  → ×2.0 on a title-fight WIN while pending; else base ×1.0 at fightsSince >= 10.
 */
async function resolveDocumentaryOnFight(fighter, fight) {
    if (!fighter || !fight) return;
    notorietyService.ensureNotorietyShape(fighter);
    fighter.media = fighter.media || {};
    const pending = fighter.media.documentaryPending;
    if (!pending) return;

    // Count this fight.
    pending.fightsSince = (pending.fightsSince || 0) + 1;

    const titleFight = isTitleFight(fight);
    const titleWin = titleFight && isWinOutcome(fight.outcome);

    let timingMult = null;
    if (pending.timing === "BEFORE_TITLE") {
        if (titleFight) timingMult = DOCUMENTARY_TIMING.BEFORE_TITLE.mult; // 1.5
        else if (pending.fightsSince >= DOCUMENTARY_PENDING_MAX_FIGHTS) timingMult = DOCUMENTARY_TIMING.NOW.mult; // 1.0
    } else if (pending.timing === "AFTER_TITLE") {
        if (titleWin) timingMult = DOCUMENTARY_TIMING.AFTER_TITLE.mult; // 2.0
        else if (pending.fightsSince >= DOCUMENTARY_PENDING_MAX_FIGHTS) timingMult = DOCUMENTARY_TIMING.NOW.mult; // 1.0
    } else {
        // Unknown timing — fall back at window.
        if (pending.fightsSince >= DOCUMENTARY_PENDING_MAX_FIGHTS) timingMult = DOCUMENTARY_TIMING.NOW.mult;
    }

    if (timingMult == null) {
        // Not yet resolved — keep pending (fightsSince already incremented).
        fighter.media.documentaryPending = pending;
        fighter.markModified?.("media");
        return;
    }

    // Pay out and clear pending atomically (same in-memory mutation block).
    const choices = { focus: pending.focus, tone: pending.tone, timing: pending.timing };
    const r = computeDocumentaryReward(choices, timingMult);

    // Persona LEGACY signature scales deferred doc fame ×1.5 (same as the immediate path).
    const scaledFame = personaService.applyFameMultiplier(
        fighter, r.fame, personaService.FAME_CATEGORY.DOCUMENTARY
    );
    notorietyService.applyNotorietyDelta(fighter, scaledFame, {
        skipFreezeBlock: true,
        code: "DOCUMENTARY",
        reason: "Documentary deferred payout",
        meta: { ...choices, timingMult },
    });
    notorietyService.touchLastEvent(fighter);
    fighter.iron = (fighter.iron || 0) + r.cash;
    if (r.grantsBooster) grantTechnicianBooster(fighter);

    fighter.media.documentaryReward = {
        fame: scaledFame,
        cash: r.cash,
        deferred: false,
        boosterGranted: !!r.grantsBooster,
        timingMult,
    };
    fighter.media.documentaryPending = null; // guard against double-pay
    fighter.markModified?.("media");
}

/**
 * Arm/resolve undercard-feature appearances against a just-completed fight.
 * If an UNDERCARD_FEATURE instance is armed (requiresFightByDate set) and a fight
 * completes within the window, grant the deferred fame. Otherwise it lapses silently
 * (the instance just expires with the rotation).
 * Mutates fighter in-memory; caller persists.
 */
async function armUndercardOnFight(fighter, fight) {
    if (!fighter || !fight) return;
    fighter.media = fighter.media || {};
    const appearances = fighter.media.appearances || [];
    const now = Date.now();
    let mutated = false;

    for (const inst of appearances) {
        if (inst.type !== "UNDERCARD_FEATURE") continue;
        if (inst.status !== "taken") continue;
        if (!inst.requiresFightByDate) continue;
        const deadline = new Date(inst.requiresFightByDate).getTime();
        if (now > deadline) {
            // Lapsed silently — disarm so it can't pay later.
            inst.requiresFightByDate = null;
            mutated = true;
            continue;
        }
        // Qualifying fight within window — grant fame on this fight.
        const def = APPEARANCE_TYPES.UNDERCARD_FEATURE;
        const fame = appearanceFameForTier(def, peakTier(fighter));
        if (fame > 0) {
            notorietyService.applyNotorietyDelta(fighter, fame, {
                code: "APPEARANCE",
                reason: "Undercard feature fame",
                meta: { appearanceType: "UNDERCARD_FEATURE", fightId: fight._id },
            });
            notorietyService.touchLastEvent(fighter);
        }
        inst.requiresFightByDate = null; // consumed — pays once
        mutated = true;
        // Update the matching archive row's fameEarned (best-effort, fire-and-forget).
        MediaArchiveEntry.findOneAndUpdate(
            { fighterId: fighter._id, appearanceType: "UNDERCARD_FEATURE", fameEarned: 0 },
            { $set: { fameEarned: fame } },
            { sort: { takenAt: -1 } }
        ).catch(() => {});
    }
    if (mutated) fighter.markModified?.("media");
}

module.exports = {
    // endpoints
    getHubState,
    getTargets,
    recordPodcast,
    recordDocumentary,
    getAppearances,
    takeAppearance,
    previewPersona,
    getRivalry,
    getArchive,
    // fight hooks
    resolveDocumentaryOnFight,
    armUndercardOnFight,
    // exposed helpers
    listenersFromScore,
    formatListeners,
};
