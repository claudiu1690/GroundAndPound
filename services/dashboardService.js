/**
 * Dashboard aggregator — READ-ONLY composition endpoint.
 *
 * Composes the player "home" view from existing reads:
 *   identity, vitals, hero CTA, camp, offers, injuries, feed, ranking,
 *   resources, sponsorship, nudge.
 *
 * Design rules (see CLAUDE.md):
 *   - The spine read (fighterService.getFighterById) is required; if it throws
 *     "Fighter not found" we propagate so the controller maps it to 404.
 *   - EVERY other module is wrapped in its own try/catch and degrades to an
 *     empty/safe value on failure — one broken module must never take down the
 *     whole dashboard. Failures are logged server-side, never leaked.
 *   - This file owns ALL aggregation + the hero-CTA pure function. It reuses
 *     existing service functions; it does not re-implement rank/offer/camp logic.
 *   - No new writes. Note: getFighterById and generateOffers have PRE-EXISTING
 *     write side effects (energy/health/injury reconciliation, nemesis cleanup);
 *     those are inherited, not introduced here.
 */

const Fighter = require("../models/fighterModel");
const ActivityLog = require("../models/activityLogModel");
const fighterService = require("./fighterService");
const fightService = require("./fightService");
const campService = require("./campService");
const rankingService = require("./rankingService");
const sponsorshipService = require("./sponsorshipService");
const pvpSeasonService = require("./pvpSeasonService");
const pvpRecordService = require("./pvpRecordService");
const { PROMOTION_TIERS } = require("../consts/gameConstants");

/**
 * Stable 1-20 photo index from the fighter's Mongo _id string.
 * Mirrors frontend App.jsx `fighterPhotoIndex` exactly so the dashboard portrait
 * matches the rest of the UI: (sum of _id char codes % 20) + 1.
 */
function fighterPhotoIndex(id) {
    if (!id) return 1;
    const str = String(id);
    let sum = 0;
    for (let i = 0; i < str.length; i += 1) sum += str.charCodeAt(i);
    return (sum % 20) + 1;
}

function fightEnergyCostFor(tier) {
    const cfg = PROMOTION_TIERS[tier];
    return cfg && Number.isFinite(cfg.fightEnergyCost) ? cfg.fightEnergyCost : 0;
}

function signingFeeFor(tier) {
    const cfg = PROMOTION_TIERS[tier];
    return cfg && Number.isFinite(cfg.signingFee) ? cfg.signingFee : null;
}

/**
 * Hero CTA — pure, table-driven, exported for unit testing.
 * First match wins.
 *
 * @param {Object} input
 * @param {boolean} input.mentalResetRequired
 * @param {Array<{cannotFight:boolean,label?:string}>} input.injuries
 * @param {string|null} input.acceptedFightId
 * @param {{slotsRemaining:number,finalised:boolean,isTitleFight:boolean}|null} input.camp
 * @param {Array<{type:string,locked?:boolean}>} input.offers
 * @param {number} input.energyCurrent
 * @param {number} input.fightEnergyCost
 * @param {boolean} input.comebackActive
 * @param {string|null} input.nemesisName
 * @returns {{key:string,label:string,sublabel:string,linkTarget:string}}
 */
function computeHeroAction(input) {
    const {
        mentalResetRequired = false,
        injuries = [],
        acceptedFightId = null,
        camp = null,
        offers = [],
        energyCurrent = 0,
        fightEnergyCost = 0,
        comebackActive = false,
        nemesisName = null,
    } = input || {};

    // 1. Mental reset required
    if (mentalResetRequired === true) {
        return {
            key: "mental_reset",
            label: "Clear Your Head",
            sublabel: "A mental reset is required before you can fight again.",
            linkTarget: "hospital",
        };
    }

    // 2. Blocking injury
    if (Array.isArray(injuries) && injuries.some((i) => i && i.cannotFight)) {
        return {
            key: "injury",
            label: "Visit the Hospital",
            sublabel: "An injury is keeping you out of the cage. Get treated.",
            linkTarget: "hospital",
        };
    }

    // 3. Camp in progress with slots left
    if (acceptedFightId && camp && !camp.finalised && camp.slotsRemaining > 0) {
        const n = camp.slotsRemaining;
        return {
            key: "continue_camp",
            label: "Continue Fight Camp",
            sublabel: `${n} training slot${n === 1 ? "" : "s"} left before fight night.`,
            linkTarget: "fights",
        };
    }

    // 4. Camp full, not finalised
    if (acceptedFightId && camp && !camp.finalised && camp.slotsRemaining === 0) {
        return {
            key: "finalise_camp",
            label: "Finalise Your Camp",
            sublabel: "Camp's done — lock it in and step into the cage.",
            linkTarget: "fights",
        };
    }

    // 5. Unlocked title shot on the table
    if (Array.isArray(offers) && offers.some((o) => o && o.type === "TitleShot" && !o.locked)) {
        return {
            key: "title_shot",
            label: "Fight for the Belt",
            sublabel: "A title shot is on the table. Take it.",
            linkTarget: "fights",
        };
    }

    // 6. Comeback bonuses live
    if (comebackActive === true) {
        if (nemesisName) {
            return {
                key: "comeback_nemesis",
                label: "Settle the Score",
                sublabel: `Fight ${nemesisName} for revenge and +150 fame — paid even if fame is frozen.`,
                linkTarget: "fights",
            };
        }
        return {
            key: "comeback_fight",
            label: "Comeback Fight Waiting",
            sublabel: "Your next win pays +30% cash and ×1.5 XP. Get back in the cage.",
            linkTarget: "fights",
        };
    }

    // 7. Regular fight offers waiting
    const nonTitle = Array.isArray(offers)
        ? offers.filter((o) => o && o.type !== "TitleShot")
        : [];
    if (nonTitle.length > 0) {
        const n = nonTitle.length;
        return {
            key: "fight_offer",
            label: "Pick Your Next Fight",
            sublabel: `${n} offer${n === 1 ? "" : "s"} waiting in the Fight Hub.`,
            linkTarget: "fights",
        };
    }

    // 8. Low energy
    if (energyCurrent < fightEnergyCost) {
        return {
            key: "recover_energy",
            label: "Rest & Recover",
            sublabel: "Energy's low — train light or wait for it to refill.",
            linkTarget: "gym",
        };
    }

    // 9. Default — train
    return {
        key: "train",
        label: "Hit the Gym",
        sublabel: "No fights lined up. Train to raise your OVR.",
        linkTarget: "gym",
    };
}

// ── Module builders (each degrades independently) ──────────────────────────────

function buildVitals(fighter) {
    const energy = fighter.energy && typeof fighter.energy === "object" ? fighter.energy : {};
    const current = Number.isFinite(energy.current) ? energy.current : 0;
    const max = Number.isFinite(energy.max) ? energy.max : 0;
    const tier = fighter.promotionTier;
    const fightCost = fightEnergyCostFor(tier);

    let energyState;
    if (current <= 0) energyState = "empty";
    else if (current < fightCost) energyState = "low";
    else energyState = "ok";

    const health = Number.isFinite(fighter.health) ? fighter.health : 100;
    let healthState;
    if (health < 25) healthState = "critical";
    else if (health < 60) healthState = "hurt";
    else healthState = "ok";

    const injuriesActive = Array.isArray(fighter.injuries) ? fighter.injuries.length : 0;

    return {
        energy: {
            current,
            max,
            etaMinutes: Math.max(0, max - current),
            state: energyState,
        },
        health: {
            value: health,
            etaMinutes: (100 - health) * 5,
            state: healthState,
            injuriesActive,
        },
        mentalResetRequired: !!fighter.mentalResetRequired,
    };
}

async function buildCamp(fighter, id) {
    if (!fighter.acceptedFightId) return null;
    try {
        const state = await campService.getCampState(String(fighter.acceptedFightId), id);
        return {
            fightId: String(fighter.acceptedFightId),
            slotsUsed: state.slotsUsed ?? 0,
            slotsRemaining: state.slotsRemaining ?? 0,
            maxSlots: state.maxSlots ?? 0,
            finalised: !!state.finalisedAt,
            isTitleFight: !!state.isTitleFight,
            previewGrade: state.previewRating?.grade ?? null,
        };
    } catch (err) {
        console.error("[dashboard] camp module failed:", err.message);
        return null;
    }
}

/**
 * Returns { offers, summary } where `offers` is the raw list (for computeHeroAction)
 * and `summary` is the { count, best } public shape.
 */
async function buildOffers(id, tier) {
    try {
        const result = await fightService.generateOffers(id);
        const offers = Array.isArray(result) ? result : [];
        return { offers, summary: summariseOffers(offers, tier) };
    } catch (err) {
        // generateOffers throws on blocking injury / invalid tier — that's a normal
        // game state for the dashboard, not an error to surface. Degrade quietly.
        console.error("[dashboard] offers module failed:", err.message);
        return { offers: [], summary: { count: 0, best: null } };
    }
}

/**
 * Build the { count, best } offers summary.
 * - count excludes a locked TitleShot.
 * - best: an UNLOCKED TitleShot wins; else highest purse (signingFee); tiebreak OVR.
 */
function summariseOffers(offers, tier) {
    const list = Array.isArray(offers) ? offers : [];

    const counted = list.filter((o) => {
        if (!o) return false;
        if (o.type === "TitleShot" && o.locked) return false;
        return true;
    });

    const purse = signingFeeFor(tier);

    const toBest = (o) => ({
        offerType: o.type,
        opponentName: o.opponent?.name ?? null,
        opponentOvr: o.opponent?.overallRating ?? null,
        isTitleShot: o.type === "TitleShot",
        purse, // PROMOTION_TIERS[tier].signingFee — same for every offer in the tier; null if tier unknown
    });

    // Unlocked title shot takes precedence.
    const titleShot = counted.find((o) => o.type === "TitleShot" && !o.locked);
    if (titleShot) {
        return { count: counted.length, best: toBest(titleShot) };
    }

    // Else highest purse, tiebreak opponent OVR. All non-title offers share the same
    // tier signingFee purse, so the tiebreak (OVR) is the effective discriminator.
    const ranked = counted
        .filter((o) => o.type !== "TitleShot")
        .slice()
        .sort((a, b) => {
            const pa = purse ?? -Infinity;
            const pb = purse ?? -Infinity;
            if (pb !== pa) return pb - pa;
            return (b.opponent?.overallRating ?? -Infinity) - (a.opponent?.overallRating ?? -Infinity);
        });

    return { count: counted.length, best: ranked.length ? toBest(ranked[0]) : null };
}

async function buildFeed(id) {
    try {
        const logs = await ActivityLog.find({ fighterId: id })
            .sort({ createdAt: -1 })
            .limit(3)
            .lean();
        return (logs || []).map((l) => ({
            type: l.type,
            detail: l.detail,
            tier: l.tier ?? null,
            createdAt: l.createdAt,
            meta: l.meta ?? {},
        }));
    } catch (err) {
        console.error("[dashboard] feed module failed:", err.message);
        return [];
    }
}

/**
 * Ranking module. `displayRank` comes from the already-shifted public fighter.
 * The delta must be computed from RAW ranks (gazette.rankBeforeLastFight is raw),
 * so we read the raw doc and shift BOTH sides through toDisplayRank.
 */
async function buildRanking(fighter, rawFighter, id) {
    const tier = fighter.promotionTier;
    const rosterSize = (rankingService.ROSTER_SIZE[tier] || 0) + 1;
    const rank = fighter.ranking && typeof fighter.ranking.rank === "number"
        ? fighter.ranking.rank
        : null;

    let isTopFive = false;
    try {
        isTopFive = !!rankingService.isTopFive(rawFighter || fighter);
    } catch (err) {
        console.error("[dashboard] isTopFive failed:", err.message);
    }

    let delta = null;
    try {
        const rawCurrent = rawFighter?.ranking?.rank;
        const rawBefore = rawFighter?.gazette?.rankBeforeLastFight;
        if (Number.isFinite(rawCurrent) && Number.isFinite(rawBefore)) {
            const displayCurrent = rankingService.toDisplayRank(rawCurrent);
            const displayBefore = rankingService.toDisplayRank(rawBefore);
            if (displayCurrent != null && displayBefore != null) {
                delta = displayBefore - displayCurrent; // positive = climbed
            }
        }
    } catch (err) {
        console.error("[dashboard] rank delta failed:", err.message);
    }

    // Title-shot conditions (surfaced as a checklist on the Rankings tile). All from
    // the already-loaded fighter — no extra reads. OVR is "met" once pendingPromotion
    // is set (it's set exactly when OVR reaches the next tier's floor).
    const titleWins = fightService.getTitleShotConfig(tier).titleWins;
    // Title shot is gated on wins earned WHILE ranked top-5 (not raw tier wins).
    const winsInTier = fighter.topFiveWinsInTier ?? 0;
    const titleShot = {
        ovrMet: !!fighter.pendingPromotion,
        topFive: isTopFive,
        winsMet: winsInTier >= titleWins,
        // Display the count capped at the requirement so it reads "2/2", never "4/2".
        winsInTier: Math.min(winsInTier, titleWins),
        titleWins,
    };

    return { rank, rosterSize, isTopFive, delta, division: tier, titleShot };
}

/**
 * PvP / Proving Ground summary for the dashboard tile. Two light reads (active
 * season + this player's record); error-safe — returns null on any failure so the
 * tile degrades gracefully, like every other dashboard module.
 */
async function buildPvp(fighter) {
    try {
        const season = await pvpSeasonService.getCurrentSeasonForFighter(fighter.weightClass);
        if (!season) return null;
        const record = await pvpRecordService.getRecord(fighter._id, season._id);
        const weeksRemaining = season.endDate
            ? Math.max(0, Math.ceil((new Date(season.endDate).getTime() - Date.now()) / (7 * 24 * 3600 * 1000)))
            : null;
        return {
            wins: record?.wins ?? 0,
            losses: record?.losses ?? 0,
            dp: record?.dp ?? 0,
            hasPlayed: !!record,
            seasonLabel: `Season ${season.seasonNumber}${season.name ? ` — ${season.name}` : ""}`,
            crossWeightClass: !!(season.config && season.config.crossWeightClass),
            weeksRemaining,
            // Pre-season: the tile renders a live countdown to startsAt instead of
            // the stats/weeks layout when status is "upcoming".
            status: season.status,
            startsAt: season.startDate ? new Date(season.startDate).toISOString() : null,
        };
    } catch (err) {
        console.error("[dashboard] pvp summary failed:", err.message);
        return null;
    }
}

async function buildSponsorship(id) {
    try {
        const active = await sponsorshipService.listActive(id);
        if (!Array.isArray(active) || active.length === 0) return null;
        const s = active[0];
        return {
            id: s.id ?? String(s._id),
            brand: s.brand ?? null,
            clauseText: s.clauseText ?? null,
            progressText: s.progressText ?? null,
            // Persona-adjusted when a payout modifier is live — matches what's paid.
            rewardPerFight: s.rewardPerFightAdjusted ?? s.rewardPerFight ?? 0,
        };
    } catch (err) {
        console.error("[dashboard] sponsorship module failed:", err.message);
        return null;
    }
}

function buildInjuries(fighter) {
    try {
        const list = Array.isArray(fighter.injuries) ? fighter.injuries : [];
        return list
            .slice()
            .sort((a, b) => (a.recoveryHoursLeft ?? Infinity) - (b.recoveryHoursLeft ?? Infinity))
            .slice(0, 3)
            .map((inj) => ({
                type: inj.type ?? null,
                label: inj.label ?? null,
                severity: inj.severity ?? null,
                cannotFight: !!inj.cannotFight,
                requiresDoctorVisit: !!inj.requiresDoctorVisit,
                recoveryHoursLeft: inj.recoveryHoursLeft ?? 0,
            }));
    } catch (err) {
        console.error("[dashboard] injuries module failed:", err.message);
        return [];
    }
}

function buildNudge(fighter, ranking) {
    const rank = ranking?.rank ?? null;
    const isTopFive = !!ranking?.isTopFive;

    const titleWins = fightService.getTitleShotConfig(fighter.promotionTier).titleWins;
    const wins = fighter.topFiveWinsInTier ?? 0; // title shot now gated on wins earned while top-5
    const cooldown = fighter.titleShotCooldown ?? 0;
    const pending = fighter.pendingPromotion;

    // a. Post-loss rematch cooldown blocks everything else.
    if (cooldown > 0) {
        return {
            text: `Title shot locked — win ${cooldown} more ${cooldown === 1 ? "fight" : "fights"} to earn a rematch (${2 - cooldown}/2).`,
            linkTarget: "fights",
        };
    }
    // b. Contender, top-5, wins met → title shot ready (Amateur = turn pro).
    if (pending && isTopFive && wins >= titleWins) {
        return {
            text: pending === "Regional Pro"
                ? "You're ready to turn pro — go take the fight."
                : "Your title shot is ready — go fight for the belt.",
            linkTarget: "fights",
        };
    }
    // c. Contender, top-5, still grinding wins-in-tier.
    if (pending && isTopFive && wins < titleWins) {
        const need = titleWins - wins;
        return {
            text: `Win ${need} more ${need === 1 ? "fight" : "fights"} to earn your ${pending === "Regional Pro" ? "shot at turning pro" : "title shot"}.`,
            linkTarget: "fights",
        };
    }
    // d. Ranked but not yet top-5.
    if (!isTopFive && rank != null) {
        return { text: "Break into the top 5 to unlock a title shot.", linkTarget: "rankings" };
    }
    // e. Comeback bonuses live — low-priority fallback.
    if (fighter.comebackMode) {
        return {
            text: "Comeback bonuses are live — +30% cash and ×1.5 XP on your next win.",
            linkTarget: "fights",
        };
    }
    // f. Default.
    return { text: "Keep training to raise your OVR.", linkTarget: "gym" };
}

// ── Composition ────────────────────────────────────────────────────────────────

/**
 * Build the full dashboard payload for a fighter.
 * @param {string} id Fighter id
 * @returns {Promise<Object>} dashboard payload (see route contract)
 */
async function buildDashboard(id) {
    // Required spine — propagate "Fighter not found" (→404). Pre-existing write
    // side effects (energy/health/injury reconcile) are inherited, not new.
    const fighter = await fighterService.getFighterById(id);

    // Raw doc for ranking delta (gazette.rankBeforeLastFight + raw ranking.rank are
    // un-shifted; getFighterById already display-shifted fighter.ranking.rank).
    let rawFighter = null;
    try {
        rawFighter = await Fighter.findById(id).select("ranking gazette").lean();
    } catch (err) {
        console.error("[dashboard] raw rank read failed:", err.message);
    }

    const tier = fighter.promotionTier;

    // Run independent modules concurrently. Each builder swallows its own errors.
    const [camp, offersData, feed, sponsorship, pvp] = await Promise.all([
        buildCamp(fighter, id),
        buildOffers(id, tier),
        buildFeed(id),
        buildSponsorship(id),
        buildPvp(fighter),
    ]);

    const ranking = await buildRanking(fighter, rawFighter, id);
    const injuries = buildInjuries(fighter);
    const vitals = buildVitals(fighter);

    const comebackActive = !!fighter.comebackMode;
    const nemesisName = fighter.nemesis?.opponentName ?? null;

    const heroAction = computeHeroAction({
        mentalResetRequired: !!fighter.mentalResetRequired,
        injuries,
        acceptedFightId: fighter.acceptedFightId ? String(fighter.acceptedFightId) : null,
        camp,
        offers: offersData.offers,
        energyCurrent: vitals.energy.current,
        fightEnergyCost: fightEnergyCostFor(tier),
        comebackActive,
        nemesisName,
    });

    const record = fighter.record || {};
    const notoriety = fighter.notoriety || {};

    return {
        identity: {
            id: String(fighter._id),
            firstName: fighter.firstName,
            lastName: fighter.lastName,
            nickname: fighter.nickname ?? null,
            weightClass: fighter.weightClass,
            promotionTier: fighter.promotionTier,
            overallRating: fighter.overallRating,
            record: {
                wins: record.wins ?? 0,
                losses: record.losses ?? 0,
                draws: record.draws ?? 0,
            },
            photoIndex: fighterPhotoIndex(fighter._id),
            comebackActive,
            nemesisName,
        },
        vitals,
        heroAction,
        camp,
        offers: offersData.summary,
        injuries,
        feed,
        ranking,
        resources: {
            iron: fighter.iron ?? 0,
            fame: notoriety.score ?? 0,
        },
        sponsorship,
        pvp,
        nudge: buildNudge(fighter, ranking),
    };
}

module.exports = {
    buildDashboard,
    computeHeroAction,
    // exported for testing
    fighterPhotoIndex,
    summariseOffers,
};
