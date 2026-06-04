/**
 * Octagon Gazette v1.0 — story composition engine.
 *
 * On first login of each UTC day, the player sees a newspaper of up to 6 stories:
 *   - 1 Lead (large headline + body)
 *   - 2 Secondary (headline + 1-line blurb)
 *   - 3 Filler (one-liners, no body)
 *
 * This service:
 *   1. Evaluates all story types for eligibility based on fighter + fight state.
 *   2. Picks the highest-priority eligible story for the Lead slot.
 *   3. Assigns remaining eligible stories to secondary / filler.
 *   4. Renders each via a template (deterministic per (date, fighterId)).
 *
 * Reads (no writes). Dismiss endpoint handles state updates.
 */
const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");
const PvpFight = require("../models/pvpFightModel");
const FightCard = require("../models/mainEventModel");
const { TEMPLATES } = require("../consts/gazetteTemplates");
const { makeGazetteRng } = require("../utils/gazetteRng");
const { ROSTER_SIZE, toDisplayRank } = require("./rankingService");

const RANK_JUMP_THRESHOLD = 5;
const NOTORIETY_DELTA_THRESHOLD = 10;
const LOSS_STREAK_MIN = 2;

const FAME_TIERS_BY_RANK = ["Unknown", "Prospect", "Rising Star", "Contender", "Star", "Legend"];

function fameTierRank(tierName) {
    const i = FAME_TIERS_BY_RANK.indexOf(tierName);
    return i === -1 ? 0 : i;
}

function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}

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

function isFinishOutcome(outcome) {
    return ["KO/TKO", "Submission", "Loss (KO/TKO)", "Loss (submission)"].includes(outcome);
}

function isWinOutcome(outcome) {
    return ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"].includes(outcome);
}

function substituteTemplate(template, vars) {
    return {
        headline: (template.headline || "").replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`),
        body: template.body ? template.body.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`) : null,
    };
}

// ── Eligibility checkers ────────────────────────────────────────────────────
// Each builder returns either null (not eligible) or a story-spec object:
//   { type, templateGroup, zoneOptions: ["lead","secondary","filler"], vars: {...} }

async function buildEventResultStory(fighter, lastShownDate) {
    // Find the most recent Headliner fight resolved since lastShownDate (or ever, if first time).
    const card = await FightCard.findOne({ status: "resolved" })
        .sort({ resolvedAt: -1 })
        .lean();
    if (!card || !card.resolvedAt) return null;
    if (lastShownDate) {
        const resolvedDate = new Date(card.resolvedAt).toISOString().slice(0, 10);
        if (resolvedDate <= lastShownDate) return null; // already covered
    }
    const headliner = (card.fights || []).find((f) => f.slot === "HEADLINER");
    if (!headliner || !headliner.actualOutcome?.winnerSide || headliner.actualOutcome.winnerSide === "DRAW") return null;
    const a = headliner.fighterA;
    const b = headliner.fighterB;
    const isAWinner = headliner.actualOutcome.winnerSide === "A";
    const method = headliner.actualOutcome.method;
    const winner = isAWinner ? a.name : b.name;
    const loser = isAWinner ? b.name : a.name;
    const eventName = `GCS Fight Night ${card.cardNumber}`;
    let templateGroup = "event_result_dec";
    if (method === "KO/TKO") templateGroup = "event_result_ko";
    else if (method === "Submission") templateGroup = "event_result_sub";
    const methodLabel = method === "KO/TKO" ? "KO/TKO"
        : method === "Submission" ? "Submission" : "Decision";
    return {
        type: "event_result",
        templateGroup,
        zoneOptions: ["lead"],
        navigateTo: "events",
        // Structured fields for the event-card layout (kicker / matchup / result).
        meta: { eventName, winner, loser, methodLabel },
        vars: {
            WINNER: winner,
            LOSER:  loser,
            METHOD: method,
            ROUND:  String(headliner.finishRound ?? 2),
            EVENT_NAME: eventName,
        },
    };
}

function buildMentalResetStory(fighter) {
    if (!fighter.mentalResetRequired) return null;
    return {
        type: "mental_reset_required",
        templateGroup: "mental_reset_required",
        zoneOptions: ["lead"],
        vars: { FIGHTER: fighterDisplayName(fighter) },
    };
}

function buildLastFightContext(fighter, lastFight) {
    // Shared variable block used by Last Fight + Title + First Loss + composite stories.
    const opponentName = lastFight?.opponentId?.name || "their opponent";
    return {
        FIGHTER: fighterDisplayName(fighter),
        OPPONENT: opponentName,
        METHOD: lastFight ? methodFromOutcome(lastFight.outcome) : "Decision",
        ROUND: String(lastFight?.finishRound ?? lastFight?.rounds?.length ?? 1),
        OPPONENT_RANK: lastFight?.opponentRankAtFight ?? null,
        TIER: fighter.gazette?.tierBeforeLastFight || fighter.promotionTier,
        RECORD: recordString(fighter),
    };
}

function buildFirstLossInTitleStory(fighter, lastFight) {
    if (!lastFight) return null;
    const wasTitleShot = lastFight.offerType === "TitleShot";
    const wasLoss = !isWinOutcome(lastFight.outcome) && lastFight.outcome !== "Draw";
    const isFirstLoss = (fighter.record?.losses || 0) === 1 && wasLoss;
    if (!wasTitleShot || !isFirstLoss) return null;
    return {
        type: "first_loss_in_title",
        templateGroup: "first_loss_in_title",
        zoneOptions: ["lead"],
        vars: buildLastFightContext(fighter, lastFight),
    };
}

function buildTitleFightStory(fighter, lastFight) {
    if (!lastFight || lastFight.offerType !== "TitleShot") return null;
    const won = isWinOutcome(lastFight.outcome);
    return {
        type: "title_fight",
        templateGroup: won ? "title_won" : "title_lost",
        zoneOptions: ["lead"],
        vars: buildLastFightContext(fighter, lastFight),
    };
}

function buildFirstLossStory(fighter, lastFight) {
    if (!lastFight) return null;
    const wasLoss = !isWinOutcome(lastFight.outcome) && lastFight.outcome !== "Draw";
    const isFirstLoss = (fighter.record?.losses || 0) === 1 && wasLoss;
    if (!isFirstLoss) return null;
    return {
        type: "first_loss",
        templateGroup: "first_loss",
        zoneOptions: ["lead"],
        vars: buildLastFightContext(fighter, lastFight),
    };
}

function buildAutoPromotionStory(fighter, lastFight) {
    if (!lastFight) return null;
    const oldTier = fighter.gazette?.tierBeforeLastFight;
    if (!oldTier || oldTier === fighter.promotionTier) return null;
    // Title fight promotions are covered by Title Fight story.
    if (lastFight.offerType === "TitleShot") return null;
    return {
        type: "auto_promotion",
        templateGroup: "auto_promotion",
        zoneOptions: ["lead"],
        vars: { FIGHTER: fighterDisplayName(fighter), TIER: fighter.promotionTier },
    };
}

function buildRankEntryStory(fighter, lastFight) {
    if (!lastFight) return null;
    const oldRank = fighter.gazette?.rankBeforeLastFight;
    const newRank = fighter.ranking?.rank;
    if (oldRank != null || newRank == null) return null; // not an entry event
    return {
        type: "rank_entry",
        templateGroup: "rank_entry",
        zoneOptions: ["lead", "secondary"],
        vars: { FIGHTER: fighterDisplayName(fighter), TIER: fighter.promotionTier, NEW_RANK: String(toDisplayRank(newRank) ?? newRank) },
    };
}

function buildWinStreakStory(fighter) {
    const streak = fighter.winStreak || 0;
    if (streak !== 5 && streak !== 10) return null;
    return {
        type: "win_streak",
        templateGroup: "win_streak",
        zoneOptions: ["lead", "secondary"],
        vars: { FIGHTER: fighterDisplayName(fighter), STREAK: String(streak) },
    };
}

function buildRankJumpStory(fighter) {
    const oldRank = fighter.gazette?.rankBeforeLastFight;
    const newRank = fighter.ranking?.rank;
    if (oldRank == null || newRank == null) return null;
    const jump = oldRank - newRank; // positive = climbed
    if (jump < RANK_JUMP_THRESHOLD) return null;
    return {
        type: "rank_jump",
        templateGroup: "rank_jump",
        zoneOptions: ["lead", "secondary"],
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            OLD_RANK: String(toDisplayRank(oldRank) ?? oldRank),
            NEW_RANK: String(toDisplayRank(newRank) ?? newRank),
            TIER: fighter.promotionTier,
        },
    };
}

function buildLastFightStory(fighter, lastFight) {
    if (!lastFight) return null;
    let templateGroup;
    if (lastFight.outcome === "KO/TKO") templateGroup = "win_ko";
    else if (lastFight.outcome === "Submission") templateGroup = "win_sub";
    else if (isWinOutcome(lastFight.outcome)) templateGroup = "win_dec";
    else if (lastFight.outcome === "Draw") return null;
    else templateGroup = "loss";
    return {
        type: "last_fight",
        templateGroup,
        zoneOptions: ["lead", "secondary"],
        vars: buildLastFightContext(fighter, lastFight),
    };
}

function buildSpotlightStory(fighter) {
    const ranked = fighter.ranking?.rank != null;
    return {
        type: "spotlight",
        templateGroup: ranked ? "spotlight_ranked" : "spotlight_unranked",
        zoneOptions: ["lead"],
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            TIER: fighter.promotionTier || "Amateur",
            RANK: ranked ? String(toDisplayRank(fighter.ranking.rank) ?? fighter.ranking.rank) : "—",
        },
    };
}

function buildFameTierStory(fighter) {
    const current = fighter.notoriety?.peakTier;
    const prior = fighter.gazette?.fameTierBeforeLastLogin;
    if (!current || !prior || current === prior) return null;
    // Only show on tier-UP (don't depress the player with downgrades)
    if (fameTierRank(current) <= fameTierRank(prior)) return null;
    return {
        type: "fame_tier_up",
        templateGroup: "fame_tier_up",
        zoneOptions: ["secondary"],
        vars: { FIGHTER: fighterDisplayName(fighter), FAME_TIER: current },
    };
}

function buildNotorietyStory(fighter) {
    const current = fighter.notoriety?.score || 0;
    const prior = fighter.gazette?.lastNotorietyLogged || 0;
    const delta = current - prior;
    if (Math.abs(delta) < NOTORIETY_DELTA_THRESHOLD) return null;
    const gained = delta > 0;
    return {
        type: gained ? "notoriety_gained" : "notoriety_lost",
        templateGroup: gained ? "notoriety_gained" : "notoriety_lost",
        zoneOptions: ["secondary", "filler"],
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            NOTORIETY: String(current),
            CHANGE: `${gained ? "+" : ""}${delta}`,
        },
    };
}

function buildComebackStory(fighter) {
    const streak = fighter.consecutiveLosses || 0;
    if (streak < LOSS_STREAK_MIN) return null;
    return {
        type: "comeback",
        templateGroup: "comeback",
        zoneOptions: ["secondary", "filler"],
        vars: { FIGHTER: fighterDisplayName(fighter), LOSS_STREAK: String(streak) },
    };
}

function buildRecordMilestoneStory(fighter) {
    const r = fighter.record || {};
    const wins = r.wins || 0;
    const losses = r.losses || 0;
    const draws = r.draws || 0;
    const total = wins + losses + draws;
    const koWins = r.koWins || 0;
    const subWins = r.subWins || 0;
    let label = null;
    if (wins === 5 && losses === 0)      label = "5-0";
    else if (wins === 10 && losses === 0) label = "10-0";
    else if (total === 10)                label = "10 Fights";
    else if (total === 20)                label = "20 Fights";
    else if (koWins === 5)                label = "5 KO Wins";
    else if (subWins === 5)               label = "5 Submission Wins";
    if (!label) return null;
    return {
        type: "record_milestone",
        templateGroup: "record_milestone",
        zoneOptions: ["secondary", "filler"],
        vars: {
            FIGHTER: fighterDisplayName(fighter),
            RECORD: recordString(fighter),
            MILESTONE_LABEL: label,
        },
    };
}

/**
 * PvP belt change (v1). Finds the most recent belt-changing PvpFight involving this
 * fighter since the last gazette and renders the won/lost story. The other fighter's
 * name is fetched separately (one extra lookup). Only belt-change stories are reported
 * in v1 — regular PvP results surface via /pvp/pending, not the Gazette.
 */
async function buildPvpBeltStory(fighter, lastShownDate) {
    const fgt = await PvpFight.findOne({
        belt_changed: true,
        $or: [{ attacker_id: fighter._id }, { defender_id: fighter._id }],
    })
        .sort({ fought_at: -1 })
        .lean();
    if (!fgt) return null;

    // Don't re-surface a belt change already covered by a previous gazette.
    if (lastShownDate && fgt.fought_at) {
        const foughtDate = new Date(fgt.fought_at).toISOString().slice(0, 10);
        if (foughtDate <= lastShownDate) return null;
    }

    const me = String(fighter._id);
    const wonBelt = fgt.result?.winner_id && String(fgt.result.winner_id) === me;
    const otherId = String(fgt.attacker_id) === me ? String(fgt.defender_id) : String(fgt.attacker_id);
    const other = await Fighter.findById(otherId).select("firstName lastName nickname").lean();
    const otherName = other ? fighterDisplayName(other) : "a rival";

    if (wonBelt) {
        return {
            type: "pvp_belt_won",
            templateGroup: "pvp_belt_won",
            zoneOptions: ["lead"],
            navigateTo: "pvp",
            vars: { FIGHTER: fighterDisplayName(fighter), PREVIOUS_CHAMPION: otherName },
        };
    }
    return {
        type: "pvp_belt_lost",
        templateGroup: "pvp_belt_lost",
        zoneOptions: ["lead"],
        navigateTo: "pvp",
        vars: { FIGHTER: fighterDisplayName(fighter), NEW_CHAMPION: otherName },
    };
}

/**
 * The Circuit v1.1 — rivalry story. Surfaces a fresh REVENGE win or a newly-hot GRUDGE since
 * the last gazette. Reads the most recent PvpFight involving the fighter + the rivalry doc for
 * that pair. Revenge takes precedence over grudge.
 */
async function buildPvpRivalryStory(fighter, lastShownDate) {
    const Rivalry = require("../models/rivalryModel");
    const fgt = await PvpFight.findOne({
        $or: [{ attacker_id: fighter._id }, { defender_id: fighter._id }],
    })
        .sort({ fought_at: -1 })
        .lean();
    if (!fgt || !fgt.fought_at) return null;
    if (lastShownDate) {
        const d = new Date(fgt.fought_at).toISOString().slice(0, 10);
        if (d <= lastShownDate) return null;
    }

    const me = String(fighter._id);
    const otherId = String(fgt.attacker_id) === me ? String(fgt.defender_id) : String(fgt.attacker_id);
    const wonLast = fgt.result?.winner_id && String(fgt.result.winner_id) === me;

    const minId = me < otherId ? me : otherId;
    const maxId = me < otherId ? otherId : me;
    const riv = await Rivalry.findOne({ pair_key: `${minId}:${maxId}` }).lean();
    if (!riv) return null;

    const other = await Fighter.findById(otherId).select("firstName lastName nickname").lean();
    const otherName = other ? fighterDisplayName(other) : "a rival";

    // Revenge: the player just won and previously trailed/lost to this opponent recently.
    // We approximate "revenge" by: player won the latest fight AND the opponent had won the
    // one before (rivalry last_winner before this is hard to read post-fact, so gate on heat
    // + a win to keep it celebratory without false positives).
    const isGrudge = (riv.heat || 0) >= 4;
    if (wonLast && isGrudge) {
        return {
            type: "pvp_revenge",
            templateGroup: "pvp_revenge",
            zoneOptions: ["secondary", "filler"],
            navigateTo: "pvp",
            vars: { FIGHTER: fighterDisplayName(fighter), OPPONENT: otherName },
        };
    }
    if (isGrudge) {
        return {
            type: "pvp_grudge",
            templateGroup: "pvp_grudge",
            zoneOptions: ["secondary", "filler"],
            navigateTo: "pvp",
            vars: { FIGHTER: fighterDisplayName(fighter), OPPONENT: otherName },
        };
    }
    return null;
}

/**
 * The Circuit v1.1 — PvP streak story. Fires when the fighter's persisted current_streak is at
 * a milestone (3/5/10/15).
 */
function buildPvpStreakStory(fighter) {
    const streak = fighter.pvp?.current_streak || 0;
    if (![3, 5, 10, 15].includes(streak)) return null;
    return {
        type: "pvp_streak",
        templateGroup: "pvp_streak",
        zoneOptions: ["secondary", "filler"],
        navigateTo: "pvp",
        vars: { FIGHTER: fighterDisplayName(fighter), STREAK: String(streak) },
    };
}

/**
 * The Circuit v1.1 — title unlock story. Announces the fighter's most recently unlocked title
 * (the last entry of pvp.titles). Cheap heuristic — UI dedupe handles repeats.
 */
function buildPvpTitleStory(fighter) {
    const { PVP_TITLES } = require("../consts/pvpConfig");
    const titles = Array.isArray(fighter.pvp?.titles) ? fighter.pvp.titles : [];
    if (titles.length === 0) return null;
    const key = titles[titles.length - 1];
    const label = PVP_TITLES[key]?.label || key;
    return {
        type: "pvp_title_unlock",
        templateGroup: "pvp_title_unlock",
        zoneOptions: ["secondary", "filler"],
        navigateTo: "pvp",
        vars: { FIGHTER: fighterDisplayName(fighter), TITLE: label },
    };
}

/**
 * The Circuit v1.2 — season story. Fires once after a rollover the viewer hasn't acknowledged yet
 * (season_number_seen < the most-recent ended season's number). If the viewer holds that season's
 * champion title it renders the champion variant; otherwise the rollover variant with their
 * finishing division. Read-only — POST /pvp/season/seen clears it.
 */
async function buildPvpSeasonStory(fighter) {
    const PvpSeason = require("../models/pvpSeasonModel");
    const lastEnded = await PvpSeason.findOne({ status: "ended" }).sort({ season_number: -1 }).lean();
    if (!lastEnded) return null;
    const seen = fighter.pvp?.season_number_seen || 0;
    if (seen >= lastEnded.season_number) return null; // already acknowledged

    const titles = Array.isArray(fighter.pvp?.season_titles) ? fighter.pvp.season_titles : [];
    const championTitle = `season_${lastEnded.season_number}_champion`;
    const isChampion = titles.includes(championTitle);

    // Reconstruct the finishing division label from the season's flair title, if present.
    let divisionLabel = "the ladder";
    const prefix = `season_${lastEnded.season_number}_`;
    for (const t of titles) {
        if (t.startsWith(prefix) && t !== championTitle) {
            const { PVP_DIVISION_BANDS } = require("../consts/pvpConfig");
            const key = t.slice(prefix.length);
            const band = PVP_DIVISION_BANDS.find((b) => b.key === key);
            divisionLabel = band ? band.label : key;
            break;
        }
    }

    if (isChampion) {
        return {
            type: "pvp_season_champion",
            templateGroup: "pvp_season_champion",
            zoneOptions: ["lead", "secondary"],
            navigateTo: "pvp",
            vars: { FIGHTER: fighterDisplayName(fighter), SEASON: String(lastEnded.season_number) },
        };
    }
    return {
        type: "pvp_season_rollover",
        templateGroup: "pvp_season_rollover",
        zoneOptions: ["secondary", "filler"],
        navigateTo: "pvp",
        vars: { FIGHTER: fighterDisplayName(fighter), SEASON: String(lastEnded.season_number), DIVISION: divisionLabel },
    };
}

// ── Composer ────────────────────────────────────────────────────────────────

/**
 * Compose the gazette for a fighter. Read-only — returns rendered stories ordered
 * by zone. Does NOT mutate the fighter or update last-shown-date.
 *
 * @param {Object} fighter Mongoose fighter doc (or .lean() plain object)
 * @returns {{ date, masthead, stories }}
 */
async function composeGazette(fighter) {
    const date = todayUtc();
    const rng = makeGazetteRng(date, String(fighter._id));
    const lastShownDate = fighter.gazette?.lastShownDate || null;

    // Load the player's last fight for "since last login" context.
    const lastFight = await Fight.findOne({
        fighterId: fighter._id,
        status: "completed",
    })
        .populate("opponentId")
        .sort({ completedAt: -1 })
        .lean();

    // ── Run every eligibility check ─────────────────────────────────────────
    const eventStory      = await buildEventResultStory(fighter, lastShownDate);
    const pvpBeltStory    = await buildPvpBeltStory(fighter, lastShownDate);
    const pvpRivalry      = await buildPvpRivalryStory(fighter, lastShownDate);
    const pvpStreak       = buildPvpStreakStory(fighter);
    const pvpTitle        = buildPvpTitleStory(fighter);
    const pvpSeason       = await buildPvpSeasonStory(fighter);
    const mentalReset     = buildMentalResetStory(fighter);
    const firstLossTitle  = buildFirstLossInTitleStory(fighter, lastFight);
    const titleFight      = buildTitleFightStory(fighter, lastFight);
    const firstLoss       = buildFirstLossStory(fighter, lastFight);
    const autoPromo       = buildAutoPromotionStory(fighter, lastFight);
    const rankEntry       = buildRankEntryStory(fighter, lastFight);
    const winStreak       = buildWinStreakStory(fighter);
    const rankJump        = buildRankJumpStory(fighter);
    const lastFightStory  = buildLastFightStory(fighter, lastFight);
    const fameTier        = buildFameTierStory(fighter);
    const notoriety       = buildNotorietyStory(fighter);
    const comeback        = buildComebackStory(fighter);
    const recordMilestone = buildRecordMilestoneStory(fighter);

    // ── Lead priority order ─────────────────────────────────────────────────
    const leadCandidates = [
        mentalReset,        // 0 — forced lead, blocks fighting
        (pvpSeason && pvpSeason.type === "pvp_season_champion") ? pvpSeason : null, // 0.4 — season champion crown
        pvpBeltStory,       // 0.5 — PvP belt change (won/lost) since last login
        eventStory,         // 1 — recent Headliner
        firstLossTitle,     // 2 — composite (first loss + title)
        titleFight,         // 3 — title fight (won or lost)
        firstLoss,          // 4 — first loss (standalone)
        autoPromo,          // 5 — auto-promotion
        rankEntry,          // 6 — rank entry
        winStreak,          // 7 — 5 or 10 streak
        rankJump,           // 8 — ≥5 rank jump
        lastFightStory,     // 9 — default last fight
    ];
    let lead = leadCandidates.find(Boolean);
    if (!lead) lead = buildSpotlightStory(fighter); // 10 — fallback

    // ── Pool the remaining eligible stories for secondary / filler ──────────
    const pool = [
        rankJump, winStreak, rankEntry, lastFightStory,
        pvpRivalry, pvpStreak, pvpTitle,   // The Circuit v1.1 — PvP flair (secondary/filler)
        pvpSeason,                          // The Circuit v1.2 — season rollover / champion (secondary/filler)
        fameTier, notoriety, comeback, recordMilestone,
    ].filter((s) => s && s !== lead && s.zoneOptions.length > 0);

    // De-duplicate same-type stories (defensive)
    const seenTypes = new Set([lead?.type]);
    const remaining = pool.filter((s) => {
        if (seenTypes.has(s.type)) return false;
        seenTypes.add(s.type);
        return true;
    });

    // Fill secondary slots (max 2) — prefer fight/rank-related, then career
    const secondaryEligible = remaining.filter((s) => s.zoneOptions.includes("secondary"));
    const secondary = secondaryEligible.slice(0, 2);

    // Fill filler slots (max 3) — whatever's left that allows filler
    const usedIds = new Set([lead, ...secondary].map((s) => s?.type));
    const fillerEligible = remaining.filter((s) => !usedIds.has(s.type) && s.zoneOptions.includes("filler"));
    const filler = fillerEligible.slice(0, 3);

    // ── Render each ──────────────────────────────────────────────────────────
    const stories = [];
    function render(story, zone) {
        if (!story) return;
        const group = TEMPLATES[story.templateGroup] || [];
        const template = rng.pick(group);
        if (!template) return;
        const { headline, body } = substituteTemplate(template, story.vars);
        stories.push({
            zone,
            type: story.type,
            headline,
            body: zone === "filler" ? null : body, // filler stories have headline only
            navigateTo: story.navigateTo || null,
            meta: story.meta || null, // structured data for special layouts (event card)
        });
    }
    render(lead, "lead");
    secondary.forEach((s) => render(s, "secondary"));
    filler.forEach((s) => render(s, "filler"));

    return {
        date,
        masthead: "The Octagon Gazette",
        stories,
        alreadyShownToday: lastShownDate === date,
    };
}

/**
 * Mark the gazette as dismissed — updates baselines so tomorrow's deltas are accurate.
 */
async function dismissGazette(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");
    if (!fighter.gazette) {
        fighter.gazette = { lastShownDate: null, lastNotorietyLogged: 0, rankBeforeLastFight: null, tierBeforeLastFight: null, fameTierBeforeLastLogin: null };
    }
    fighter.gazette.lastShownDate = todayUtc();
    fighter.gazette.lastNotorietyLogged = fighter.notoriety?.score || 0;
    fighter.gazette.fameTierBeforeLastLogin = fighter.notoriety?.peakTier || "Unknown";
    fighter.markModified("gazette");
    await fighter.save();

    // PvP v1 — dismissing the Gazette acknowledges the player has seen their results,
    // so mark any pending PvP defeats/defences as seen. Best-effort: never block dismiss.
    try {
        const pvpService = require("./pvpService");
        await pvpService.markPendingSeen(fighter._id);
    } catch (err) {
        console.error("[gazette] markPendingSeen failed:", err.message);
    }

    return { dismissed: true, date: todayUtc() };
}

module.exports = { composeGazette, dismissGazette, todayUtc };
