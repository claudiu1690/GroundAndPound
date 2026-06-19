/**
 * Octagon Gazette v2.0 — PERSISTED edition engine.
 *
 * The gazette is no longer composed on read. Instead it is REGENERATED and saved onto
 * `fighter.gazette` after every meaningful career-feed event (see activityLogService —
 * REGEN_TRIGGERS). The frontend reads `fighter.gazette` directly off the serialized
 * fighter payload; there is no fetch/compose endpoint.
 *
 * Each saved edition holds:
 *   - issueNumber (incrementing)         - leadStory  (large headline + deck + body)
 *   - sidebarItems  (exactly 4)          - secondaryStories (exactly 3)
 *   - inBrief       (4..6)               - masthead fields (edition/breakingLabel/...)
 *
 * Determinism: makeGazetteRng is seeded per (issueNumber, fighterId). Re-serializing a
 * saved edition is deterministic because the content is already on disk.
 *
 * Hard rules (see RISKS in the build contract):
 *   - NO DB query inside any builder. All data is pre-loaded in regenerateGazette and
 *     passed in via a `ctx` bag ({ fighter, lastFight, sponsorship }).
 *   - regenerateGazette is bounded to <= 3 reads + 1 write.
 *   - regenerateGazette guards its own body defensively; the authoritative never-throw
 *     lives in activityLogService.log().
 */
const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");
const FightCamp = require("../models/fightCampModel");
const Sponsorship = require("../models/sponsorshipModel");
const { TEMPLATES } = require("../consts/gazetteTemplates");
const { makeGazetteRng } = require("../utils/gazetteRng");
const { toDisplayRank } = require("./rankingService");
const { NOTORIETY_TIERS } = require("../consts/notorietyConfig");

const RANK_JUMP_THRESHOLD = 5;
const LOSS_STREAK_MIN = 2;
const FAME_DELTA_THRESHOLD = 100;
const RANKED_MIN_FIGHTS = 3;

// ── Palette (hex per build contract) ─────────────────────────────────────────
const COLOR = {
    rankings: "#D4A820",
    nemesis:  "#C8102E",
    offers:   "#3A9A4A",
    pvp:      "#3B82F6",
    injuries: "#F87171",
    gym:      "#14B8A6",
    contracts:"#C87A10",
    fame:     "#8B5CF6",
    camp:     "#3A9A4A",
    badge:    "#D4A820",
    comeback: "#C8102E",
    milestone:"#D4A820",
    spotlight:"#7A6A50",
};

const TRAINING_MILESTONES = [50, 100, 250];
const KO_MILESTONES = new Set([1, 3, 5, 10]);
const SUB_MILESTONES = new Set([1, 3, 5]);

// ── Pull-quote pools (ported server-side from frontend gazetteContent.js) ────
const QUOTE_POOLS = {
    win: [
        "Patient, composed, relentless. The blueprint is working.",
        "Another night, another statement. The division is on notice.",
        "They came with a plan. It did not survive contact.",
    ],
    loss: [
        "A setback, not a sentence. Champions are forged on nights like these.",
        "The margins were thin. The lessons will not be.",
        "Every great run has a chapter like this one.",
    ],
    title: [
        "Gold changes a career. The whole division feels it.",
        "This is the fight they will talk about for years.",
    ],
    notoriety: [
        "At this rate, the champion will have no choice but to answer.",
        "The whole division is saying the name now.",
        "Buzz like this does not fade — it builds.",
    ],
    streak: [
        "Nobody has solved the riddle yet. Few look close.",
        "A run like this writes its own headlines.",
    ],
    ranking: [
        "Every name above is now looking over a shoulder.",
        "The climb is steep. The ascent looks effortless.",
    ],
    fame: [
        "From unknown to unmissable in a single season.",
        "The lights find some fighters. This one walked into them.",
    ],
    comeback: [
        "Down is not out. The story is far from finished.",
        "Write them off at your peril.",
    ],
    generic: [
        "The fight game rewards the relentless.",
        "Some names you remember. This is becoming one of them.",
    ],
};

function quoteThemeForLead(lead) {
    switch (lead.type) {
        case "last_fight":
            return lead._playerWon ? "win" : "loss";
        case "title_fight":
            return lead._won ? "title" : "title";
        case "first_loss_in_title": return "title";
        case "first_loss":          return "loss";
        case "win_streak":          return "streak";
        case "rank_jump":
        case "rank_entry":
        case "auto_promotion":      return "ranking";
        case "mental_reset_required": return "comeback";
        default:                    return "generic";
    }
}

// ── Small helpers ────────────────────────────────────────────────────────────

function fighterDisplayName(fighter) {
    const first = fighter.firstName || "";
    const last = fighter.lastName || "";
    return `${first} ${last}`.trim() || "The Fighter";
}

function recordString(fighter) {
    const r = fighter.record || {};
    return `${r.wins || 0}-${r.losses || 0}${(r.draws || 0) > 0 ? `-${r.draws}` : ""}`;
}

function methodFromOutcome(outcome) {
    if (outcome === "KO/TKO" || outcome === "Loss (KO/TKO)") return "KO";
    if (outcome === "Submission" || outcome === "Loss (submission)") return "Submission";
    return "Decision";
}

function isWinOutcome(outcome) {
    return ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"].includes(outcome);
}

/** "{METHOD} · Round {N}" — decision without a finish round → "Decision". */
function methodRoundLabel(lastFight) {
    if (!lastFight) return null;
    const method = methodFromOutcome(lastFight.outcome);
    const round = lastFight.finishRound
        ?? (Array.isArray(lastFight.rounds) ? lastFight.rounds.length : null);
    if (method === "Decision" || round == null) {
        return method === "Decision" ? "Decision" : method;
    }
    return `${method.toUpperCase()} · Round ${round}`;
}

function fameTierLabel(peakTier) {
    const def = NOTORIETY_TIERS[peakTier] || NOTORIETY_TIERS.UNKNOWN;
    return def.label;
}

/** Highest gym rank across all gymRanks entries (no query needed). */
function highestGymRank(fighter) {
    const ranks = fighter.gymRanks || {};
    let max = 0;
    for (const key of Object.keys(ranks)) {
        const r = ranks[key]?.rank || 0;
        if (r > max) max = r;
    }
    return max;
}

/** Substitute {VAR} tokens in a template string. */
function substitute(str, vars) {
    if (!str) return null;
    return str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? vars[key] : `{${key}}`));
}

/** Seeded headline pick from a template group + substitution. */
function pickHeadline(rng, group, vars) {
    const variants = TEMPLATES[group] || [];
    const chosen = rng.pick(variants);
    if (!chosen) return null;
    return substitute(chosen.headline, vars);
}

// ── LEAD BUILDERS ────────────────────────────────────────────────────────────
// Each returns either null (not eligible) or a lead-spec:
//   { type, templateGroup, vars, _won?, _playerWon? }
// where templateGroup resolves to the existing body templates.

function buildLastFightContext(fighter, lastFight) {
    const opponentName = lastFight?.opponentId?.name || "their opponent";
    return {
        FIGHTER: fighterDisplayName(fighter),
        OPPONENT: opponentName,
        METHOD: lastFight ? methodFromOutcome(lastFight.outcome) : "Decision",
        ROUND: String(lastFight?.finishRound ?? lastFight?.rounds?.length ?? 1),
        TIER: fighter.gazette?.tierBeforeLastFight || fighter.promotionTier,
        RECORD: recordString(fighter),
    };
}

function buildMentalResetStory(ctx) {
    const { fighter } = ctx;
    if (!fighter.mentalResetRequired) return null;
    return {
        type: "mental_reset_required",
        templateGroup: "mental_reset_required",
        vars: { FIGHTER: fighterDisplayName(fighter) },
    };
}

function buildFirstLossInTitleStory(ctx) {
    const { fighter, lastFight } = ctx;
    if (!lastFight) return null;
    const wasTitleShot = lastFight.offerType === "TitleShot";
    const wasLoss = !isWinOutcome(lastFight.outcome) && lastFight.outcome !== "Draw";
    const isFirstLoss = (fighter.record?.losses || 0) === 1 && wasLoss;
    if (!wasTitleShot || !isFirstLoss) return null;
    return {
        type: "first_loss_in_title",
        templateGroup: "first_loss_in_title",
        vars: buildLastFightContext(fighter, lastFight),
    };
}

function buildTitleFightStory(ctx) {
    const { fighter, lastFight } = ctx;
    if (!lastFight || lastFight.offerType !== "TitleShot") return null;
    const won = isWinOutcome(lastFight.outcome);
    return {
        type: "title_fight",
        templateGroup: won ? "title_won" : "title_lost",
        vars: buildLastFightContext(fighter, lastFight),
        _won: won,
    };
}

function buildFirstLossStory(ctx) {
    const { fighter, lastFight } = ctx;
    if (!lastFight) return null;
    const wasLoss = !isWinOutcome(lastFight.outcome) && lastFight.outcome !== "Draw";
    const isFirstLoss = (fighter.record?.losses || 0) === 1 && wasLoss;
    if (!isFirstLoss) return null;
    return {
        type: "first_loss",
        templateGroup: "first_loss",
        vars: buildLastFightContext(fighter, lastFight),
    };
}

function buildAutoPromotionStory(ctx) {
    const { fighter, lastFight } = ctx;
    if (!lastFight) return null;
    const oldTier = fighter.gazette?.tierBeforeLastFight;
    if (!oldTier || oldTier === fighter.promotionTier) return null;
    if (lastFight.offerType === "TitleShot") return null;
    return {
        type: "auto_promotion",
        templateGroup: "auto_promotion",
        vars: { FIGHTER: fighterDisplayName(fighter), TIER: fighter.promotionTier },
    };
}

function buildRankEntryStory(ctx) {
    const { fighter, lastFight } = ctx;
    if (!lastFight) return null;
    const oldRank = fighter.gazette?.rankBeforeLastFight;
    const newRank = fighter.ranking?.rank;
    if (oldRank != null || newRank == null) return null;
    return {
        type: "rank_entry",
        templateGroup: "rank_entry",
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            TIER: fighter.promotionTier,
            NEW_RANK: String(toDisplayRank(newRank) ?? newRank),
        },
    };
}

function buildWinStreakStory(ctx) {
    const { fighter } = ctx;
    const streak = fighter.winStreak || 0;
    if (streak !== 5 && streak !== 10) return null;
    return {
        type: "win_streak",
        templateGroup: "win_streak",
        vars: { FIGHTER: fighterDisplayName(fighter), STREAK: String(streak) },
    };
}

function buildRankJumpStory(ctx) {
    const { fighter } = ctx;
    const oldRank = fighter.gazette?.rankBeforeLastFight;
    const newRank = fighter.ranking?.rank;
    if (oldRank == null || newRank == null) return null;
    const jump = oldRank - newRank; // positive = climbed
    if (jump < RANK_JUMP_THRESHOLD) return null;
    return {
        type: "rank_jump",
        templateGroup: "rank_jump",
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            OLD_RANK: String(toDisplayRank(oldRank) ?? oldRank),
            NEW_RANK: String(toDisplayRank(newRank) ?? newRank),
            TIER: fighter.promotionTier,
        },
    };
}

function buildLastFightStory(ctx) {
    const { fighter, lastFight } = ctx;
    if (!lastFight) return null;
    let templateGroup;
    const win = isWinOutcome(lastFight.outcome);
    if (lastFight.outcome === "KO/TKO") templateGroup = "win_ko";
    else if (lastFight.outcome === "Submission") templateGroup = "win_sub";
    else if (win) templateGroup = "win_dec";
    else if (lastFight.outcome === "Draw") return null;
    else templateGroup = "loss";
    return {
        type: "last_fight",
        templateGroup,
        vars: buildLastFightContext(fighter, lastFight),
        _playerWon: win,
    };
}

function buildSpotlightStory(ctx) {
    const { fighter } = ctx;
    const ranked = fighter.ranking?.rank != null;
    return {
        type: "spotlight",
        templateGroup: ranked ? "spotlight_ranked" : "spotlight_unranked",
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            TIER: fighter.promotionTier || "Amateur",
            RANK: ranked ? String(toDisplayRank(fighter.ranking.rank) ?? fighter.ranking.rank) : "—",
        },
    };
}

// ── LEAD: result band + masthead helpers ─────────────────────────────────────

function buildResultBand(lead, ctx) {
    const { fighter, lastFight, lastCampGrade } = ctx;
    const record = recordString(fighter);
    const mr = methodRoundLabel(lastFight);
    // campGrade for the bout — sourced from the FightCamp doc (ctx.lastCampGrade).
    const campGrade = lastCampGrade ?? null;
    // ranking: current career ladder rank as a "#N" display string, or null if unranked.
    const rk = fighter && fighter.ranking && fighter.ranking.rank != null
        ? (toDisplayRank(fighter.ranking.rank) ?? fighter.ranking.rank)
        : null;
    const ranking = rk != null ? `#${rk}` : null;
    // context kicker: "{Tier} · {WeightClass} · Fight {N}" (N = total bouts on record).
    const r = fighter.record || {};
    const fightNo = (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
    const tier = fighter.promotionTier || "Amateur";
    const wc = fighter.weightClass || "";
    const context = [tier, wc, fightNo > 0 ? `Fight ${fightNo}` : null].filter(Boolean).join(" · ");
    switch (lead.type) {
        case "title_fight":
            return lead._won
                ? { outcomeLabel: "WIN — TITLE CAPTURED", methodRound: mr, record, campGrade, ranking, context }
                : { outcomeLabel: "LOSS — TITLE FIGHT", methodRound: mr, record, campGrade, ranking, context };
        case "first_loss_in_title":
            return { outcomeLabel: "LOSS — TITLE FIGHT", methodRound: mr, record, campGrade, ranking, context };
        case "first_loss":
            return { outcomeLabel: "LOSS — FIRST DEFEAT", methodRound: mr, record, campGrade, ranking, context };
        case "last_fight":
            return {
                outcomeLabel: lead._playerWon ? "WIN" : "LOSS",
                methodRound: mr, record, campGrade, ranking, context,
            };
        case "auto_promotion":
            return { outcomeLabel: "PROMOTION", methodRound: null, record, campGrade: null, ranking, context };
        case "rank_entry":
            return { outcomeLabel: "RANKED", methodRound: null, record: null, campGrade: null, ranking, context };
        case "rank_jump":
            return { outcomeLabel: "RANKING UPDATE", methodRound: null, record: null, campGrade: null, ranking, context };
        case "win_streak":
            return { outcomeLabel: "WIN STREAK", methodRound: null, record: null, campGrade: null, ranking, context };
        case "mental_reset_required":
            return { outcomeLabel: "ACTION REQUIRED", methodRound: null, record: null, campGrade: null, ranking: null, context };
        case "spotlight":
            return { outcomeLabel: null, methodRound: null, record, campGrade: null, ranking, context };
        default:
            return null;
    }
}

function breakingLabelForLead(lead) {
    switch (lead.type) {
        case "mental_reset_required": return "NOTICE";
        case "event_result":          return "MAIN EVENT RESULT";
        case "title_fight":           return lead._won ? "NEW CHAMPION" : "TITLE FIGHT RESULT";
        case "first_loss_in_title":   return "TITLE FIGHT · FIRST LOSS";
        case "first_loss":            return "FIRST CAREER DEFEAT";
        case "auto_promotion":        return "PROMOTION";
        case "rank_entry":            return "NEWLY RANKED";
        case "win_streak":            return "WIN STREAK";
        case "rank_jump":             return "RANKING MOVE";
        case "last_fight":            return "FIGHT RESULT";
        case "spotlight":             return "DIVISION UPDATE";
        default:                      return "DIVISION UPDATE";
    }
}

function editionForTrigger(triggeringEventType) {
    switch (triggeringEventType) {
        case "FIGHT_WIN":               return "Fight Night Edition";
        case "FIGHT_LOSS":
        case "FIGHT_DRAW":              return "Post-Fight Edition";
        case "TIER_PROMOTION":
        case "TITLE_WON":               return "Championship Edition";
        case "NEMESIS_SET":
        case "NEMESIS_CLEARED":         return "Rivalry Edition";
        case "BADGE_EARNED":            return "Achievement Edition";
        case "pvp_belt_won":            return "Championship Edition";
        default:
            if (typeof triggeringEventType === "string" && triggeringEventType.startsWith("pvp_")) {
                return "Proving Ground Edition";
            }
            if (typeof triggeringEventType === "string" && triggeringEventType.startsWith("NEMESIS_")) {
                return "Rivalry Edition";
            }
            return "Career Edition";
    }
}

function volNumberFromYear() {
    return new Date().getFullYear() - 2014;
}

// ── LEAD ASSEMBLY ────────────────────────────────────────────────────────────

/**
 * Compose the lead's body paragraphs. The template's one-liner stays as the deck
 * (standfirst); this builds the fuller article beneath it from real fight/career
 * context so the main column doesn't read as a single repeated sentence. Variants
 * are picked via the seeded rng so successive issues don't read identically.
 */
function composeLeadBody(spec, ctx, rng) {
    const { fighter, lastFight } = ctx;
    const name = fighterDisplayName(fighter);
    const tier = fighter.promotionTier || "Amateur";
    const record = recordString(fighter);
    const rankDisp = fighter.ranking?.rank != null
        ? `#${toDisplayRank(fighter.ranking.rank) ?? fighter.ranking.rank}`
        : null;
    const rankClause = rankDisp ? `, ranked ${rankDisp} in the ${tier} division` : ` in the ${tier} division`;

    const isFightLead = ["last_fight", "title_fight", "first_loss", "first_loss_in_title"].includes(spec.type);
    if (isFightLead && lastFight) {
        const opp = lastFight.opponentId?.name || "their opponent";
        const won = isWinOutcome(lastFight.outcome);
        const method = methodFromOutcome(lastFight.outcome); // KO | Submission | Decision
        const m = method.toLowerCase();
        const round = lastFight.finishRound ?? (Array.isArray(lastFight.rounds) ? lastFight.rounds.length : null);
        const isFinish = method !== "Decision" && round != null;
        const paras = [];

        // P1 — the bout itself
        if (isFinish) {
            paras.push(won
                ? rng.pick([
                    `${name} ended matters against ${opp} in round ${round}, the ${m} arriving the moment the opening appeared.`,
                    `There was nothing left for the judges to weigh — ${name} found the ${m} on ${opp} in round ${round} and never looked back.`,
                  ])
                : rng.pick([
                    `It was ${opp} who landed the decisive sequence, the ${m} closing the show on ${name} in round ${round}.`,
                    `${name} could find no way out as ${opp} forced the ${m} in round ${round}.`,
                  ]));
        } else {
            paras.push(won
                ? rng.pick([
                    `No finish came, but across the full distance ${name} did enough on the cards to leave ${opp} with nothing to show for the effort.`,
                    `It went the distance, and when the scorecards were read it was ${name} who had out-worked ${opp}.`,
                  ])
                : rng.pick([
                    `It went the distance, but the cards favoured ${opp}; ${name} came up short over the full fight.`,
                    `${name} pushed ${opp} the full fight yet finished on the wrong side of the judges' math.`,
                  ]));
        }

        // P2 — where it leaves them
        paras.push(rng.pick([
            `The result moves ${name} to ${record}${rankClause}.`,
            `${name} now stands at ${record}${rankClause}.`,
        ]));

        // P3 — forward look
        paras.push(won
            ? rng.pick([
                `Attention turns to who steps up next; every win tightens the chase at the top of the division.`,
                `The momentum is real — the only question now is how far up the card ${name} can climb.`,
              ])
            : rng.pick([
                `The response is what matters now. Careers are measured as much by the bounce-back as the setback.`,
                `There is work to do, but a single result rarely defines a division campaign.`,
              ]));
        return paras;
    }

    // Non-fight leads (rankings/promotion/spotlight): one supporting paragraph
    // beneath the template deck.
    return [rng.pick([
        `It is the kind of move that reshapes a division's pecking order, and ${name} sits squarely in the conversation.`,
        `The picture in the ${tier} division shifts again, with ${name} at the centre of it.`,
    ])];
}

function assembleLead(rng, ctx) {
    const builders = [
        buildMentalResetStory,      // 0
        // event_result (priority 1) intentionally omitted — optional, needs a card
        buildFirstLossInTitleStory, // 2
        buildTitleFightStory,       // 3
        buildFirstLossStory,        // 4
        buildAutoPromotionStory,    // 5
        buildRankEntryStory,        // 6
        buildWinStreakStory,        // 7
        buildRankJumpStory,         // 8
        buildLastFightStory,        // 9
    ];
    let spec = null;
    for (const b of builders) {
        spec = b(ctx);
        if (spec) break;
    }
    if (!spec) spec = buildSpotlightStory(ctx); // 10 — fallback

    // Body: paragraph 1 = the existing template body.
    const group = TEMPLATES[spec.templateGroup] || [];
    const tpl = rng.pick(group);
    const headline = tpl ? substitute(tpl.headline, spec.vars) : null;
    const body = tpl && tpl.body ? substitute(tpl.body, spec.vars) : null;

    // Pull quote: deterministic via seeded RNG.
    const pool = QUOTE_POOLS[quoteThemeForLead(spec)] || QUOTE_POOLS.generic;
    const quoteText = rng.pick(pool);
    const pullQuote = quoteText ? { text: quoteText, source: "The Octagon Gazette" } : null;

    const resultBand = buildResultBand(spec, ctx);

    return {
        type: spec.type,
        kicker: breakingLabelForLead(spec),
        kickerColor: COLOR.rankings,
        headline,
        deck: body,                       // one-line deck (standfirst) under the headline
        bodyParagraphs: composeLeadBody(spec, ctx, rng),
        resultBand,
        pullQuote,
        linkTarget: spec.type === "mental_reset_required" ? "fights" : "career",
        _breakingLabel: breakingLabelForLead(spec),
    };
}

// ── SIDEBAR BUILDERS (exactly 4) ─────────────────────────────────────────────

function sidebarRankings(rng, ctx) {
    const { fighter } = ctx;
    const ranked = fighter.ranking?.rank != null;
    const fightsInTier = fighter.ranking?.fightsInTier || 0;
    const isUnranked = !ranked || fightsInTier < RANKED_MIN_FIGHTS;
    const displayRank = ranked ? String(toDisplayRank(fighter.ranking.rank) ?? fighter.ranking.rank) : "—";
    const tier = fighter.promotionTier || "Amateur";
    const vars = { RANK: displayRank, TIER: tier, N: String(Math.max(0, RANKED_MIN_FIGHTS - fightsInTier)) };
    const headline = isUnranked
        ? pickHeadline(rng, "sidebar_rankings_unranked", vars)
        : pickHeadline(rng, "sidebar_rankings_ranked", vars);
    const body = isUnranked
        ? `${Math.max(0, RANKED_MIN_FIGHTS - fightsInTier)} more fight(s) in the ${tier} division and the rankings open up.`
        : `Holding #${displayRank} in ${tier}. The title chase runs straight through the names above.`;
    return {
        categoryLabel: "RANKINGS", categoryColor: COLOR.rankings,
        headline, body, linkTarget: "rankings", goPill: true, goPillLabel: "View Rankings",
    };
}

function sidebarNemesis(rng, ctx) {
    const { fighter } = ctx;
    const opp = fighter.nemesis?.opponentName;
    if (!opp) return null;
    const losses = fighter.nemesis?.lossCount || 1;
    const vars = { OPP: opp };
    return {
        categoryLabel: "NEMESIS", categoryColor: COLOR.nemesis,
        headline: pickHeadline(rng, "sidebar_nemesis", vars),
        body: `${opp} has beaten you ${losses} time(s). Settle the score and clear the grudge.`,
        linkTarget: "fights", goPill: true, goPillLabel: "Settle the Score",
    };
}

function sidebarFightOffers(rng, ctx) {
    const { fighter } = ctx;
    if (fighter.acceptedFightId != null) return null;
    if (fighter.mentalResetRequired) return null;
    return {
        categoryLabel: "FIGHT OFFERS", categoryColor: COLOR.offers,
        headline: pickHeadline(rng, "sidebar_fight_offers", {}),
        body: "Fresh matchups are on the table. Request your next bout and get back in the cage.",
        linkTarget: "fights", goPill: true, goPillLabel: "View Offers",
    };
}

function sidebarPvp(rng, ctx) {
    const { fighter } = ctx;
    if (fighter.pvpOnboarding?.unlocked !== true) return null;
    return {
        categoryLabel: "PROVING GROUND", categoryColor: COLOR.pvp,
        headline: pickHeadline(rng, "sidebar_pvp", {}),
        body: "The Proving Ground ladder is live. Division Points are there for the taking.",
        linkTarget: "pvp", goPill: true, goPillLabel: "Enter the Proving Ground",
    };
}

function sidebarInjuries(rng, ctx) {
    const { fighter } = ctx;
    const injuries = fighter.injuries || [];
    if (injuries.length === 0) return null;
    // Prefer a fight-blocking injury for the headline.
    const blocking = injuries.find((i) => i.cannotFight);
    const worst = blocking || injuries[0];
    const label = worst.label || worst.type || "Injury";
    const hours = worst.recoveryHoursLeft || 0;
    const vars = { LABEL: label };
    const body = worst.cannotFight
        ? `${label} is keeping you out of the cage. ${hours}h until recovery.`
        : `${label} on the mend — ${hours}h of recovery left.`;
    return {
        categoryLabel: "INJURY", categoryColor: COLOR.injuries,
        headline: pickHeadline(rng, "sidebar_injuries", vars),
        body, linkTarget: "hospital", goPill: true, goPillLabel: "Visit Hospital",
    };
}

function sidebarGym(rng, ctx) {
    const { fighter } = ctx;
    if (!fighter.activeGymId) return null;
    const rank = highestGymRank(fighter);
    const vars = { RANK: String(rank || 1) };
    return {
        categoryLabel: "GYM MASTERY", categoryColor: COLOR.gym,
        headline: pickHeadline(rng, "sidebar_gym", vars),
        body: `Keep grinding sessions at your gym to climb the mastery ranks and unlock perks.`,
        linkTarget: "gym", goPill: false, goPillLabel: null,
    };
}

function sidebarContracts(rng, ctx) {
    const { sponsorship } = ctx;
    if (!sponsorship) return null;
    const brand = sponsorship.brand || "your sponsor";
    const reward = sponsorship.rewardPerFight || 0;
    const vars = { BRAND: brand };
    return {
        categoryLabel: "CONTRACTS", categoryColor: COLOR.contracts,
        headline: pickHeadline(rng, "sidebar_contracts", vars),
        body: `${brand} pays ${reward} cash per fight while the clause holds. Keep the deal alive.`,
        linkTarget: "contracts", goPill: true, goPillLabel: "View Contract",
    };
}

function sidebarFamePlaceholder(rng, ctx) {
    const { fighter } = ctx;
    const tier = fameTierLabel(fighter.notoriety?.peakTier || "UNKNOWN");
    const score = fighter.notoriety?.score || 0;
    return {
        categoryLabel: "FAME", categoryColor: COLOR.fame,
        headline: pickHeadline(rng, "sidebar_fame", { TIER: tier }) || `FAME: ${tier} TIER`,
        body: `Fame score sits at ${score}. Win, finish, and feud to push the name higher.`,
        linkTarget: "career", goPill: false, goPillLabel: null,
    };
}

function sidebarSpotlightPlaceholder(rng, ctx) {
    return {
        categoryLabel: "DIVISION", categoryColor: COLOR.spotlight,
        headline: pickHeadline(rng, "sidebar_spotlight", {}) || "THE DIVISION KEEPS MOVING",
        body: "The roster never sleeps. Stay active to keep climbing.",
        linkTarget: "rankings", goPill: false, goPillLabel: null,
    };
}

function assembleSidebar(rng, ctx) {
    const candidates = [
        sidebarRankings,     // always
        sidebarNemesis,
        sidebarFightOffers,
        sidebarPvp,
        sidebarInjuries,
        sidebarGym,
        sidebarContracts,
    ];
    const items = [];
    for (const c of candidates) {
        if (items.length >= 4) break;
        const item = c(rng, ctx);
        if (item) items.push(item);
    }
    // Fill to exactly 4 with placeholders.
    const placeholders = [sidebarFamePlaceholder, sidebarSpotlightPlaceholder];
    let pIdx = 0;
    while (items.length < 4) {
        const ph = placeholders[pIdx % placeholders.length](rng, ctx);
        items.push(ph);
        pIdx++;
    }
    return items.slice(0, 4);
}

// ── SECONDARY BUILDERS (exactly 3, exclude lead type) ────────────────────────

function secondaryCampReport(rng, ctx) {
    const { lastFight } = ctx;
    if (!lastFight) return null;
    // No persisted camp grade — emit a generic fight-prep story.
    return {
        categoryLabel: "CAMP REPORT", categoryColor: COLOR.camp,
        headline: pickHeadline(rng, "secondary_camp_report", {}),
        body: "The training camp told its own story this time out. The work shows up when the cage door closes.",
        linkTarget: "gym",
    };
}

function secondaryGymMilestone(rng, ctx) {
    const { fighter } = ctx;
    const sessions = fighter.careerTrainingSessions || 0;
    const last = fighter.gazette?.lastTrainingMilestoneLogged || 0;
    const crossed = TRAINING_MILESTONES.find((m) => sessions >= m && last < m);
    if (!crossed) return null;
    return {
        categoryLabel: "GYM MILESTONE", categoryColor: COLOR.gym,
        headline: pickHeadline(rng, "secondary_gym_milestone", { SESSIONS: String(crossed) }),
        body: `${crossed} lifetime training sessions logged. The grind compounds.`,
        linkTarget: "gym",
    };
}

function secondaryContracts(rng, ctx) {
    const { sponsorship } = ctx;
    if (!sponsorship) return null;
    const brand = sponsorship.brand || "a sponsor";
    return {
        categoryLabel: "CONTRACTS", categoryColor: COLOR.contracts,
        headline: pickHeadline(rng, "sidebar_contracts", { BRAND: brand }) || `CONTRACT IN PLAY — ${brand}`,
        body: `${brand} is watching every fight. Hold up your end and the bonuses keep landing.`,
        linkTarget: "contracts",
    };
}

function secondaryBadge(rng, ctx) {
    const { fighter } = ctx;
    const earned = fighter.badgesEarned || [];
    const unseen = earned.find((b) => b && b.seen === false);
    if (!unseen) return null;
    return {
        categoryLabel: "ACHIEVEMENT", categoryColor: COLOR.badge,
        headline: pickHeadline(rng, "secondary_badge", {}),
        body: "A new badge just landed in the cabinet. Check the career page to see what you unlocked.",
        linkTarget: "career",
    };
}

function secondaryComeback(rng, ctx) {
    const { fighter } = ctx;
    const streak = fighter.consecutiveLosses || 0;
    if (streak < LOSS_STREAK_MIN) return null;
    return {
        categoryLabel: "COMEBACK", categoryColor: COLOR.comeback,
        headline: pickHeadline(rng, "comeback", {
            FIGHTER: fighterDisplayName(fighter), LOSS_STREAK: String(streak),
        }) || "BACK AGAINST THE WALL",
        body: `${streak} losses deep. This is where the comeback story gets written.`,
        linkTarget: "gym",
    };
}

function secondaryRecordMilestone(rng, ctx) {
    const { fighter } = ctx;
    const r = fighter.record || {};
    const wins = r.wins || 0, losses = r.losses || 0, draws = r.draws || 0;
    const total = wins + losses + draws;
    const koWins = r.koWins || 0, subWins = r.subWins || 0;
    let label = null;
    if (wins === 5 && losses === 0)       label = "5-0";
    else if (wins === 10 && losses === 0) label = "10-0";
    else if (total === 10)                label = "10 Fights";
    else if (total === 20)                label = "20 Fights";
    else if (koWins === 5)                label = "5 KO Wins";
    else if (subWins === 5)               label = "5 Submission Wins";
    if (!label) return null;
    return {
        categoryLabel: "MILESTONE", categoryColor: COLOR.milestone,
        headline: pickHeadline(rng, "record_milestone", {
            FIGHTER: fighterDisplayName(fighter), RECORD: recordString(fighter), MILESTONE_LABEL: label,
        }) || `MILESTONE: ${label}`,
        body: `${label} reached. The record reads ${recordString(fighter)}.`,
        linkTarget: "career",
    };
}

// Distinct evergreen fillers used when fewer than 3 real secondary stories
// qualify. Ordered by preference; de-duplicated by categoryLabel so a quiet
// early-career paper never prints three identical cards.
function secondaryFillers(rng, ctx) {
    const { fighter } = ctx;
    const tier = fighter.promotionTier || "Amateur";
    return [
        {
            categoryLabel: "DIVISION", categoryColor: COLOR.spotlight,
            headline: pickHeadline(rng, "spotlight_unranked", {
                FIGHTER: fighterDisplayName(fighter), TIER: tier, RANK: "—",
            }) || "THE JOURNEY CONTINUES",
            body: "Every quiet week is a chance for someone else to climb. Stay busy.",
            linkTarget: "rankings",
        },
        {
            categoryLabel: "TRAINING", categoryColor: COLOR.gym,
            headline: "BACK IN THE GYM",
            body: "Titles are won in the weeks nobody watches. The next session is the only one that counts.",
            linkTarget: "gym",
        },
        {
            categoryLabel: "OUTLOOK", categoryColor: COLOR.milestone,
            headline: `THE ${String(tier).toUpperCase()} ROAD AHEAD`,
            body: "Rankings shift with every result. Keep winning and the picture changes fast.",
            linkTarget: "rankings",
        },
    ];
}

// Lead story types that would read as a duplicate if also run as a secondary.
const LEAD_TO_SECONDARY_LABEL = {
    record_milestone: "MILESTONE",
    comeback: "COMEBACK",
};

function assembleSecondary(rng, ctx, leadType) {
    const candidates = [
        secondaryCampReport,
        secondaryGymMilestone,
        secondaryContracts,
        secondaryBadge,
        secondaryComeback,
        secondaryRecordMilestone,
    ];
    const excludeLabel = LEAD_TO_SECONDARY_LABEL[leadType] || null;
    const items = [];
    const seenLabels = new Set();
    for (const c of candidates) {
        if (items.length >= 3) break;
        const item = c(rng, ctx);
        if (!item) continue;
        if (excludeLabel && item.categoryLabel === excludeLabel) continue; // already the lead
        if (seenLabels.has(item.categoryLabel)) continue;
        seenLabels.add(item.categoryLabel);
        items.push(item);
    }
    // Fill to exactly 3 with distinct fillers — never repeat a category label.
    for (const filler of secondaryFillers(rng, ctx)) {
        if (items.length >= 3) break;
        if (seenLabels.has(filler.categoryLabel)) continue;
        seenLabels.add(filler.categoryLabel);
        items.push(filler);
    }
    return items.slice(0, 3);
}

// ── IN BRIEF (target 6, 4..6) ────────────────────────────────────────────────

function assembleInBrief(ctx) {
    const { fighter, lastFight } = ctx;
    const items = [];
    const push = (text, linkTarget = null, pillLabel = null) => {
        if (items.length >= 6) return;
        items.push({ text, linkTarget, pillLabel });
    };

    const injuries = fighter.injuries || [];
    if (injuries.length > 0) {
        const worst = injuries.find((i) => i.cannotFight) || injuries[0];
        const label = worst.label || worst.type || "Injury";
        const hours = worst.recoveryHoursLeft || 0;
        push(`<strong>${injuries.length} injuries</strong> active — ${label} (${hours}h to heal).`, "hospital", "Recover");
    }
    if (fighter.acceptedFightId == null && !fighter.mentalResetRequired) {
        push(`<strong>Fight offers</strong> available — request your next matchup.`, "fights", "New Offer");
    }
    const unseenBadge = (fighter.badgesEarned || []).find((b) => b && b.seen === false);
    if (unseenBadge) {
        push(`<strong>New badge</strong> unlocked — view it on your career page.`, "career", "View");
    }
    const lossStreak = fighter.consecutiveLosses || 0;
    if (lossStreak >= LOSS_STREAK_MIN) {
        push(`<strong>Comeback mode</strong> — ${lossStreak} losses deep. Next win pays ×1.5 XP.`);
    }
    const koWins = fighter.record?.koWins || 0;
    if (KO_MILESTONES.has(koWins)) {
        push(`<strong>${koWins} KO wins</strong> on the record.`);
    }
    const subWins = fighter.record?.subWins || 0;
    if (SUB_MILESTONES.has(subWins)) {
        push(`<strong>${subWins} submission wins</strong> on the record.`);
    }
    if (lastFight) {
        push(`<strong>Post-fight XP</strong> applied — all stats progressing.`);
    }
    const gymRank = highestGymRank(fighter);
    if (gymRank > (fighter.gazette?.lastGymRankLogged || 0)) {
        push(`<strong>Gym rank ${gymRank}</strong> reached — new mastery perks in reach.`, "gym", "Train");
    }
    const energy = fighter.energy || {};
    if ((energy.current ?? 100) < 30) {
        push(`Energy at <strong>${energy.current ?? 0}/${energy.max ?? 100}</strong> — +1/min.`);
    }
    const score = fighter.notoriety?.score || 0;
    const lastNot = fighter.gazette?.lastNotorietyLogged || 0;
    if (Math.abs(score - lastNot) >= FAME_DELTA_THRESHOLD) {
        const delta = score - lastNot;
        push(`<strong>Fame ${delta >= 0 ? "+" : ""}${delta}</strong> — notoriety now at ${score}.`, "career", null);
    }

    // Fill to >= 4 with always-true fillers (cap at 6).
    const fillers = [
        () => `<strong>Energy</strong> regenerates at +1/min — max ${fighter.energy?.max ?? 100}.`,
        () => `Rankings reset with every tier promotion. Fight to climb.`,
    ];
    let fIdx = 0;
    while (items.length < 4) {
        push(fillers[fIdx % fillers.length]());
        fIdx++;
        if (fIdx > 10) break; // safety
    }
    return items.slice(0, 6);
}

// ── REGENERATION (public) ────────────────────────────────────────────────────

/**
 * Regenerate and persist the Octagon Gazette for a fighter after a triggering event.
 * Resolves void. Bounded to <= 3 reads + 1 write. Guards its own body defensively;
 * the authoritative never-throw boundary lives in activityLogService.log().
 *
 * @param {string|import("mongoose").Types.ObjectId} fighterId
 * @param {string} triggeringEventType  the ActivityLog `type` that triggered regen
 * @returns {Promise<void>}
 */
async function regenerateGazette(fighterId, triggeringEventType) {
    try {
        // 1. Load the full fighter doc (need .save()).
        const fighter = await Fighter.findById(fighterId);
        if (!fighter) return; // missing → silent

        // 2. Next issue number.
        const nextIssue = (fighter.gazette?.issueNumber || 0) + 1;

        // 3. Seeded RNG per (issueNumber, fighterId).
        const rng = makeGazetteRng(String(nextIssue), String(fighter._id));

        // 4. Bounded supporting reads (<= 2 more reads).
        const lastFight = await Fight.findOne({ fighterId: fighter._id, status: "completed" })
            .populate("opponentId")
            .sort({ completedAt: -1 })
            .lean();
        const sponsorship = await Sponsorship.findOne({ fighterId: fighter._id, status: "active" })
            .sort({ createdAt: -1 })
            .lean();
        // Camp grade for the last fight — lives on the FightCamp doc (keyed by fightId),
        // not the Fight doc, so the hero result band can surface it.
        const lastCamp = lastFight
            ? await FightCamp.findOne({ fightId: lastFight._id }).select("campRating").lean()
            : null;

        const ctx = { fighter, lastFight, sponsorship, lastCampGrade: lastCamp?.campRating ?? null };

        // 5. Builders.
        const leadStory = assembleLead(rng, ctx);
        const sidebarItems = assembleSidebar(rng, ctx);
        const secondaryStories = assembleSecondary(rng, ctx, leadStory.type);
        const inBrief = assembleInBrief(ctx);

        // 6. Masthead.
        const edition = editionForTrigger(triggeringEventType);
        const breakingLabel = leadStory._breakingLabel || breakingLabelForLead(leadStory);
        const volNumber = volNumberFromYear();
        const fighterMeta = `${fighterDisplayName(fighter)} · ${fighter.promotionTier || "Amateur"} · OVR ${fighter.overallRating ?? 0}`;
        const fameTier = fameTierLabel(fighter.notoriety?.peakTier || "UNKNOWN");
        const cashFameMeta = `${fighter.iron || 0} cash · ${fighter.notoriety?.score || 0} fame (${fameTier})`;

        // 7. Capture baselines (READ old values were already consumed by the delta
        //    builders above; now overwrite for next issue). Do NOT touch
        //    rankBeforeLastFight / tierBeforeLastFight (owned by fightService).
        const newLastNotorietyLogged = fighter.notoriety?.score || 0;
        const newFameTierBeforeLastLogin = fighter.notoriety?.peakTier || "Unknown";
        const newLastGymRankLogged = highestGymRank(fighter);
        const newLastTrainingMilestoneLogged = (() => {
            const sessions = fighter.careerTrainingSessions || 0;
            let m = fighter.gazette?.lastTrainingMilestoneLogged || 0;
            for (const t of TRAINING_MILESTONES) if (sessions >= t && t > m) m = t;
            return m;
        })();

        // 8. Assign. Strip lead-only private flags before persisting.
        const cleanLead = { ...leadStory };
        delete cleanLead._breakingLabel;

        fighter.gazette = {
            // retained legacy + new baselines
            lastShownDate: fighter.gazette?.lastShownDate ?? null,
            lastNotorietyLogged: newLastNotorietyLogged,
            rankBeforeLastFight: fighter.gazette?.rankBeforeLastFight ?? null,
            tierBeforeLastFight: fighter.gazette?.tierBeforeLastFight ?? null,
            fameTierBeforeLastLogin: newFameTierBeforeLastLogin,
            lastGymRankLogged: newLastGymRankLogged,
            lastTrainingMilestoneLogged: newLastTrainingMilestoneLogged,
            // edition state
            issueNumber: nextIssue,
            volNumber,
            edition,
            breakingLabel,
            fighterMeta,
            cashFameMeta,
            updatedAt: new Date(),
            triggeringEventType,
            // content
            leadStory: cleanLead,
            sidebarItems,
            secondaryStories,
            inBrief,
        };
        fighter.markModified("gazette");

        // 9. Persist.
        await fighter.save();
    } catch (err) {
        // Defensive inner guard: a builder bug must not reject. The feed write is
        // already protected by activityLogService's outer try/catch, but we also
        // refuse to throw here so callers never see a rejection.
        console.warn("[gazette] regenerateGazette failed:", err.message);
    }
}

module.exports = { regenerateGazette };
