/**
 * Dashboard aggregator — READ-ONLY composition endpoint.
 *
 * THIS JSDoc BLOCK IS THE SINGLE SOURCE OF TRUTH FOR THE GET /fighters/:id/dashboard
 * PAYLOAD SHAPE. The frontend builds against it. Change the shape here and here only.
 *
 * Composes the player "home" view from existing reads:
 *   identity, vitals, hero CTA, heroBout, camp, homeCamp, offers, injuries, feed,
 *   ranking, resources, sponsorship, pvp, nudge.
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIGHT NIGHT HOME — the four payload blocks the redesign added. ADDITIVE ONLY:
 * every pre-existing field keeps its shape.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. offers — was {count,best}, now ALSO carries `list`:
 *
 *    offers: {
 *      count: number,                     // excludes a LOCKED TitleShot
 *      best: {offerType,opponentName,opponentOvr,isTitleShot,purse}|null,
 *      list: Array<OfferCard>             // max 4, generation order preserved, [] when none
 *    }
 *
 *    @typedef {Object} OfferCard
 *    @property {?string} opponentId       EPHEMERAL — see the warning below
 *    @property {?string} opponentName
 *    @property {?string} opponentNickname
 *    @property {?number} opponentOvr
 *    @property {?string} opponentStyle
 *    @property {?string} opponentTier
 *    @property {?string} opponentWeightClass
 *    @property {{wins:number,losses:number,draws:number}} record   from offer.context
 *    @property {?{result:"win"|"loss"|"draw",count:number}} streak from offer.context
 *    @property {"Easy"|"Even"|"Hard"|"TitleShot"} type
 *    @property {boolean} isTitleShot
 *    @property {boolean} isNemesis        offer.nemesisMeta != null
 *    @property {boolean} locked           true only for an ineligible TitleShot
 *    @property {?number} purse            PROMOTION_TIERS[tier].signingFee, tier-wide
 *
 *    ⚠️ opponentId IS NOT A DURABLE HANDLE. The offer set is regenerated on every
 *    request, so a card click must NAVIGATE to the Fight Hub. Home never posts an
 *    acceptance.
 *
 * 2. heroBout — the one fight the hero leads with. NULLABLE.
 *
 *    heroBout: {
 *      source: "accepted"|"offer",        // a signed fight always wins
 *      opponentId, opponentName, opponentNickname,
 *      opponentOvr, opponentTier, opponentWeightClass,
 *      record: {wins,losses,draws},
 *      isTitleShot: boolean,
 *      isNemesis: boolean,
 *      isRematch: false,                  // see below — ALWAYS false today
 *      purse: number|null,
 *      rounds: number|null                // scheduled length, from the engine config
 *    } | null
 *
 *    null means no bout is signed AND no offer is on the table (e.g. heroAction.key
 *    === "injury", where generateOffers throws and offers.list is []). The client then
 *    hides the rival plate and the VS mark and renders the heroAction CTA alone.
 *
 *    ⚠️ isRematch IS HARDCODED false. The contract defines it as "the opponent appears
 *    in the fighter's already-loaded fight history", but no such history is loaded:
 *    fighterModel has no per-opponent fight log, so answering it truthfully would need
 *    an extra Fight query on a hot endpoint, which the contract forbids. A client that
 *    wants "we have met before" can already infer it from isNemesis (a nemesis is by
 *    definition someone who has beaten you). Give the field a real answer only when a
 *    fought-opponent list lands on the fighter document.
 *
 * 3. pvp — gains the ladder standing and the season twist:
 *
 *    ladderRank: number|null              1-based dp rank (pvpRecordService.computeRank)
 *    ladderSize: number|null              PVPRecord.countDocuments{seasonId,weightClass}
 *    twistKey:   string|null              a key of consts/pvpConfig TWISTS
 *    twistName:  string|null              TWISTS[twistKey].name
 *
 *    ladderRank/ladderSize are BOTH null when the player has no record this season
 *    (hasPlayed false) — no count is issued in that case. There is deliberately NO
 *    ladderDelta: PVPRecord stores no historical rank, so a week-over-week delta would
 *    need a new field plus a snapshot job. The UI shows "#14 of 312" with no delta chip.
 *    The twist EFFECT SENTENCE is frontend i18n keyed off twistKey; the server never
 *    ships prose for it.
 *
 * 4. homeCamp — the "My Camp" tile. NULLABLE. This is the HOME camp; `camp` above is
 *    the FIGHT camp. Two separate tiles, two separate concepts, never merge them.
 *
 *    homeCamp: {
 *      campName: string|null,
 *      tier: number, tierLabel: string,   // effectiveTier, floored by promotion tier
 *      conditionValue: number,            // 0..CONDITION_MAX
 *      conditionBand: string,             // band KEY, not a label — style off it
 *      headCoach: {name,archetypeLabel,rank,morale}|null,
 *      wages: {weeklyTotal, nextDebitAt:ISO|null, nextDebitInDays:number|null,
 *              unpaidWeeks:number},
 *      market: {open:boolean, resetsAt:ISO|null, resetsInDays:number|null}
 *    } | null
 *
 *    null = the player has no camp doc yet ("No camp yet. Set one up."). Built from ONE
 *    HomeCamp.findOne plus the PURE homeCampService.buildDashboardCampSummary. It must
 *    never go through getCampState, which creates and saves a camp and ticks condition.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEAD FIELDS — still shipped, deliberately unread.
 *   identity.photoIndex (and the fighterPhotoIndex helper that produces it) is NO LONGER
 *   READ BY HOME. The Fight Night redesign dropped fighter portraits entirely (there is
 *   not enough art), so the home screen renders BannerPreview instead. The field stays in
 *   the payload so older clients do not break. DO NOT restore portraits from it.
 *
 * COST — the four blocks above add, per request: one Fight.findById plus its populated
 * Opponent (only when a fight is signed), two PVPRecord countDocuments (only when the
 * player has a season record), and one HomeCamp.findOne. All on primary keys or existing
 * indexes. Keep it that way; this endpoint is hit on every page load.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Fighter = require("../models/fighterModel");
const ActivityLog = require("../models/activityLogModel");
const Fight = require("../models/fightModel");
const HomeCamp = require("../models/homeCampModel");
const PVPRecord = require("../models/pvpRecordModel");
const fighterService = require("./fighterService");
const fightService = require("./fightService");
const campService = require("./campService");
const rankingService = require("./rankingService");
const sponsorshipService = require("./sponsorshipService");
const pvpSeasonService = require("./pvpSeasonService");
const pvpRecordService = require("./pvpRecordService");
const homeCampService = require("./homeCampService");
const { PROMOTION_TIERS } = require("../consts/gameConstants");
const { TWISTS } = require("../consts/pvpConfig");
const { FIGHT_RESOLUTION_CONFIG } = require("../consts/fightResolutionConfig");

/**
 * Every bout in this game is scheduled over the engine's maxRounds — the Fight document
 * stores a round-by-round LOG, not a scheduled length, so the scheduled number can only
 * come from config. Read once, never re-derived.
 */
const SCHEDULED_ROUNDS = FIGHT_RESOLUTION_CONFIG.defaults.maxRounds ?? null;

/** Own-property test — TWISTS is keyed by a stored string, so never use `in`. */
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Stable 1-20 photo index from the fighter's Mongo _id string.
 * Mirrors frontend App.jsx `fighterPhotoIndex` exactly: (sum of _id char codes % 20) + 1.
 *
 * ⚠️ DEAD FOR HOME. The Fight Night redesign removed fighter portraits, so nothing on the
 * home screen reads identity.photoIndex any more. Kept only so older clients still parse
 * the payload — see the "DEAD FIELDS" note at the top of this file.
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
        // Degrade through summariseOffers, never with a hand-written literal — that is how
        // the shape drifts (this path shipped without `list` until a test caught it).
        return { offers: [], summary: summariseOffers([], tier) };
    }
}

/** Max offer cards the Home undercard renders. generateOffers emits at most 4 anyway. */
const OFFERS_LIST_MAX = 4;

/** {wins,losses,draws} with every field a real number, whatever the source gave us. */
function normaliseRecord(rec) {
    const r = rec && typeof rec === "object" ? rec : {};
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return { wins: n(r.wins), losses: n(r.losses), draws: n(r.draws) };
}

/** Offers that count toward offers.count — a LOCKED TitleShot is not a real offer. */
function countedOffers(offers) {
    return (Array.isArray(offers) ? offers : []).filter((o) => {
        if (!o) return false;
        if (o.type === "TitleShot" && o.locked) return false;
        return true;
    });
}

/**
 * THE offer-precedence rule, in one place: an UNLOCKED TitleShot wins; else highest purse
 * (every non-title offer in a tier shares the same signingFee, so opponent OVR is the
 * effective discriminator). Returns the RAW offer so that offers.best and heroBout resolve
 * to the SAME bout — if those two ever disagreed, the hero would advertise a fight the
 * undercard does not highlight.
 *
 * @param {Array<Object>} offers raw generateOffers output
 * @returns {Object|null} the raw offer, or null
 */
function pickBestOffer(offers) {
    const counted = countedOffers(offers);
    const titleShot = counted.find((o) => o.type === "TitleShot" && !o.locked);
    if (titleShot) return titleShot;

    const ranked = counted
        .filter((o) => o.type !== "TitleShot")
        .slice()
        .sort((a, b) => (b.opponent?.overallRating ?? -Infinity) - (a.opponent?.overallRating ?? -Infinity));

    return ranked.length ? ranked[0] : null;
}

/**
 * One undercard card. Everything here is already in memory from buildOffers — ZERO extra
 * queries. opponentId is EPHEMERAL: the offer set is regenerated on every request, so the
 * client must treat it as a display key and navigate to the Fight Hub, never post it back.
 */
function offerListItem(offer, purse) {
    const o = offer.opponent || {};
    const ctx = offer.context || {};
    return {
        opponentId: o._id ? String(o._id) : null,
        opponentName: o.name ?? null,
        opponentNickname: o.nickname ?? null,
        opponentOvr: o.overallRating ?? null,
        opponentStyle: o.style ?? null,
        opponentTier: o.promotionTier ?? null,
        opponentWeightClass: o.weightClass ?? null,
        record: normaliseRecord(ctx.record),
        streak: ctx.streak ?? null,
        type: offer.type ?? null,
        isTitleShot: offer.type === "TitleShot",
        isNemesis: offer.nemesisMeta != null,
        locked: !!offer.locked,
        purse,
    };
}

/**
 * Build the { count, best, list } offers summary.
 * - count excludes a locked TitleShot.
 * - best: see pickBestOffer.
 * - list: EVERY offer in generation order (a locked TitleShot included, flagged
 *   locked:true so the card can render disabled), capped at OFFERS_LIST_MAX.
 */
function summariseOffers(offers, tier) {
    const all = (Array.isArray(offers) ? offers : []).filter(Boolean);
    const purse = signingFeeFor(tier);

    const toBest = (o) => ({
        offerType: o.type,
        opponentName: o.opponent?.name ?? null,
        opponentOvr: o.opponent?.overallRating ?? null,
        isTitleShot: o.type === "TitleShot",
        purse, // PROMOTION_TIERS[tier].signingFee — same for every offer in the tier; null if tier unknown
    });

    const best = pickBestOffer(all);

    return {
        count: countedOffers(all).length,
        best: best ? toBest(best) : null,
        list: all.slice(0, OFFERS_LIST_MAX).map((o) => offerListItem(o, purse)),
    };
}

/**
 * Opponent record derived from their fightHistory.
 *
 * ⚠️ MIRRORS fightService.buildOfferContext (the static opponent.record field is seeded
 * flavour and is never displayed). Only the ACCEPTED-fight branch of buildHeroBout needs
 * it — every offer already carries context.record. buildOfferContext is not exported; when
 * it is, delete this and call that instead.
 */
function recordFromHistory(history) {
    return (Array.isArray(history) ? history : []).reduce((acc, f) => {
        if (!f) return acc;
        if (f.result === "win") acc.wins += 1;
        else if (f.result === "loss") acc.losses += 1;
        else acc.draws += 1;
        return acc;
    }, { wins: 0, losses: 0, draws: 0 });
}

/**
 * The Fight Night hero bout — the ONE fight the home screen leads with.
 *
 * Precedence: a SIGNED fight (fighter.acceptedFightId) always wins; otherwise the same
 * offer that offers.best names; otherwise null (no bout, so the frontend hides the rival
 * plate and renders heroAction alone). Degrades accepted -> offer -> null, so a broken
 * Fight read can never take the tile down.
 *
 * QUERIES: at most ONE Fight.findById (primary key) plus its populated Opponent (also by
 * primary key), and only when a fight is actually signed. The offer branch adds none.
 *
 * isRematch is ALWAYS false — see the payload JSDoc at the top of this file.
 *
 * @param {Object} fighter public fighter (already loaded by buildDashboard)
 * @param {{offers:Array<Object>}} offersData buildOffers output
 * @returns {Promise<Object|null>}
 */
async function buildHeroBout(fighter, offersData) {
    try {
        const nemesisId = fighter?.nemesis?.opponentId ? String(fighter.nemesis.opponentId) : null;

        if (fighter?.acceptedFightId) {
            try {
                const fight = await Fight.findById(fighter.acceptedFightId).populate("opponentId").lean();
                const opp = fight && fight.opponentId;
                if (opp && typeof opp === "object" && opp._id) {
                    return {
                        source: "accepted",
                        opponentId: String(opp._id),
                        opponentName: opp.name ?? null,
                        opponentNickname: opp.nickname ?? null,
                        opponentOvr: opp.overallRating ?? null,
                        opponentTier: opp.promotionTier ?? null,
                        opponentWeightClass: opp.weightClass ?? null,
                        record: recordFromHistory(opp.fightHistory),
                        isTitleShot: fight.offerType === "TitleShot",
                        isNemesis: !!nemesisId && nemesisId === String(opp._id),
                        isRematch: false,
                        purse: signingFeeFor(fight.promotionTier ?? fighter.promotionTier),
                        rounds: SCHEDULED_ROUNDS,
                    };
                }
            } catch (err) {
                // A dangling or unreadable acceptedFightId must not cost the player their
                // hero tile — fall through to the offer branch.
                console.error("[dashboard] heroBout accepted-fight read failed:", err.message);
            }
        }

        const best = pickBestOffer(offersData && offersData.offers);
        if (!best || !best.opponent) return null;
        const o = best.opponent;
        return {
            source: "offer",
            opponentId: o._id ? String(o._id) : null,
            opponentName: o.name ?? null,
            opponentNickname: o.nickname ?? null,
            opponentOvr: o.overallRating ?? null,
            opponentTier: o.promotionTier ?? null,
            opponentWeightClass: o.weightClass ?? null,
            record: normaliseRecord(best.context?.record),
            isTitleShot: best.type === "TitleShot",
            isNemesis: best.nemesisMeta != null,
            isRematch: false,
            purse: signingFeeFor(fighter?.promotionTier),
            rounds: SCHEDULED_ROUNDS,
        };
    } catch (err) {
        console.error("[dashboard] heroBout module failed:", err.message);
        return null;
    }
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
 * Ladder standing for a PvP record: 1-based dp rank plus the size of that ladder.
 *
 * TWO countDocuments, both on the {seasonId, weightClass, dp:-1} index, and both only
 * when the player HAS a record — a fighter who has never entered the Proving Ground
 * costs the dashboard nothing here (and the tile hides the ladder row anyway).
 * Degrades to {null,null} on its own so a count failure cannot null the whole tile.
 *
 * @param {Object|null} record PVPRecord (lean or hydrated)
 * @returns {Promise<{ladderRank:number|null, ladderSize:number|null}>}
 */
async function buildLadderStanding(record) {
    if (!record) return { ladderRank: null, ladderSize: null };
    try {
        const [ladderRank, ladderSize] = await Promise.all([
            pvpRecordService.computeRank(record),
            PVPRecord.countDocuments({ seasonId: record.seasonId, weightClass: record.weightClass }),
        ]);
        return {
            ladderRank: Number.isFinite(ladderRank) ? ladderRank : null,
            ladderSize: Number.isFinite(ladderSize) ? ladderSize : null,
        };
    } catch (err) {
        console.error("[dashboard] ladder standing failed:", err.message);
        return { ladderRank: null, ladderSize: null };
    }
}

/**
 * PvP / Proving Ground summary for the dashboard tile. Two light reads (active
 * season + this player's record) plus the ladder standing pair; error-safe — returns
 * null on any failure so the tile degrades gracefully, like every other dashboard module.
 */
async function buildPvp(fighter) {
    try {
        const season = await pvpSeasonService.getCurrentSeasonForFighter(fighter.weightClass);
        if (!season) return null;
        const record = await pvpRecordService.getRecord(fighter._id, season._id);
        const weeksRemaining = season.endDate
            ? Math.max(0, Math.ceil((new Date(season.endDate).getTime() - Date.now()) / (7 * 24 * 3600 * 1000)))
            : null;
        const { ladderRank, ladderSize } = await buildLadderStanding(record);
        // Twist KEY + NAME only. The effect sentence is frontend i18n keyed off twistKey —
        // the server never ships player-facing prose for it.
        const twistKey = typeof season.twist === "string" && hasOwn(TWISTS, season.twist)
            ? season.twist
            : null;
        return {
            ladderRank,
            ladderSize,
            twistKey,
            twistName: twistKey ? (TWISTS[twistKey].name ?? null) : null,
            wins: record?.wins ?? 0,
            losses: record?.losses ?? 0,
            dp: record?.dp ?? 0,
            hasPlayed: !!record,
            seasonLabel: `Season ${season.seasonNumber}${season.name ? `, ${season.name}` : ""}`,
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

/**
 * "My Camp" tile — the HOME camp (services/homeCampService.js), NOT the fight camp that
 * buildCamp returns. Two separate tiles, two separate concepts.
 *
 * ⚠️ ONE HomeCamp.findOne on the unique {fighterId} index, and deliberately NOT
 * homeCampService.getCampState: that goes through ensureCamp, which CREATES and SAVES a
 * camp and applies the lazy condition tick. The dashboard is a GET and must not write. A
 * player with no camp doc gets null here and the "no camp yet" empty state on the client.
 *
 * @param {string} id fighter id
 * @param {Object} fighter loaded fighter — read-only, only promotionTier is used
 * @returns {Promise<Object|null>} DashboardCampSummary (see homeCampService) or null
 */
async function buildHomeCamp(id, fighter) {
    try {
        const camp = await HomeCamp.findOne({ fighterId: id }).lean();
        if (!camp) return null;
        return homeCampService.buildDashboardCampSummary(camp, fighter);
    } catch (err) {
        console.error("[dashboard] home camp module failed:", err.message);
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
    const [camp, offersData, feed, sponsorship, pvp, homeCamp] = await Promise.all([
        buildCamp(fighter, id),
        buildOffers(id, tier),
        buildFeed(id),
        buildSponsorship(id),
        buildPvp(fighter),
        buildHomeCamp(id, fighter),
    ]);

    // Depends on offersData, so it runs after the batch above rather than inside it.
    const heroBout = await buildHeroBout(fighter, offersData);

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
        heroBout,
        camp,
        homeCamp,
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
    buildHeroBout,
    buildHomeCamp,
    // exported for testing
    fighterPhotoIndex,
    summariseOffers,
    pickBestOffer,
    buildLadderStanding,
    buildPvp,
};
