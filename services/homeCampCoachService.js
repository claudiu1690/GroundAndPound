/**
 * Home Camp — coach lifecycle, rank ladder, promotions, teach lists.
 *
 * NAMING: `camp*` on the backend is the FIGHT camp (GDD §9). This is the HOME camp.
 *
 * Owns: createStarterCoach, buildTeachList, rankProgress, promotionQuote,
 * attemptPromotion, claimCoachPerk, incrementSessions, onFightResolved, buildRankLabels,
 * buildCoachView, buildPerkView.
 *
 * PHASE 1 — also the SINGLE HOME of three rules that must never be re-implemented anywhere
 * else, because a second copy would let the camp screen advertise numbers the resolver doesn't
 * honour: `applyTraitToDrill` (trait → drill numbers), `coachXpMultiplier` (trait/rank/morale →
 * XP), and the PRODIGY discount inside `rankProgress`.
 *
 * No HTTP concerns. Errors carry `.code` (contract §3) + `.status`; the controller maps them.
 */
const Fighter = require("../models/fighterModel");
const HomeCamp = require("../models/homeCampModel");
const personaService = require("./personaService");
const specialMovesService = require("./specialMovesService");
const badgeService = require("./badgeService");
const config = require("../config");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");
// The Max Stamina ceiling, from the one module that applies it — a `raisesMaxStamina` drill
// is pure waste at the cap, and the card must say so before the energy is spent.
const { MAX_STAMINA_CAP } = require("../utils/trainingSession");
const { SPECIAL_MOVES_BY_ID, rarityRank } = require("../consts/specialMovesCatalog");
const {
    CAMP_TIERS,
    COACH_ARCHETYPES,
    COACH_RANKS,
    COACH_MAX_RANK,
    COACH_RARITIES,
    COACH_RANK3_XP_BONUS,
    CONDITIONING_INJURY_REDUCTION_BY_RANK,
    COACH_RANK_LABELS,
    CONDITION_MAX,
    DOMAIN_TEACH_POOLS,
    TEACH_BREADTH_BY_RARITY,
    TEACH_RANK_BY_SLOT,
    STARTER_COACH_NAMES,
    MORALE_MAX,
    MORALE_NEED_THRESHOLD,
    MORALE_XP_HALVED_BELOW,
    drillsForCoach,
    teachSlotsForRank,
    perkForArchetype,
    traitDef,
    traitView,
} = require("../consts/homeCampConfig");

/** Build a tagged service error the controller can map to a status + code. */
function campError(code, message, status = 400, extra = null) {
    const err = new Error(message);
    err.code = code;
    err.status = status;
    if (extra) Object.assign(err, extra);
    return err;
}

/** "Tommy Vasquez" → "TV". Falls back to the first two letters for single-word names. */
function initialsFor(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Build the Phase-0 starter coach for a domain. FIXED name per domain — no RNG, which is the
 * anti-reroll guarantee (a player can't drop and re-read their camp to fish for a better coach).
 *
 * Returns a PLAIN OBJECT (not a subdoc) so it can be handed straight to HomeCamp.create().
 *
 * @param {string} domain STRIKING|WRESTLING|BJJ
 * @param {{rank?:number, sessionsCompleted?:number, relevantWins?:number}} [seed] migration carry-over
 */
function createStarterCoach(domain, seed = {}) {
    const archetype = COACH_ARCHETYPES[domain] ? domain : "STRIKING";
    const name = STARTER_COACH_NAMES[archetype] || "Coach";
    const rank = Math.max(1, Math.min(COACH_MAX_RANK, Math.floor(Number(seed.rank)) || 1));
    return {
        archetype,
        name,
        initials: initialsFor(name),
        rarity: "COMMON",
        traitKey: null,
        wage: 0,
        isStarter: true,
        hiredAt: new Date(),
        rank,
        // He ARRIVED at this rank — the player paid for none of it. Recording it here is what
        // stops a converted gym veteran later claiming the teach slots he never promoted through.
        joinedAtRank: rank,
        sessionsCompleted: Math.max(0, Math.floor(Number(seed.sessionsCompleted)) || 0),
        relevantWins: Math.max(0, Math.floor(Number(seed.relevantWins)) || 0),
        morale: 100,
        // A COMMON coach can only ever teach one move, so the pool is sliced to its breadth.
        teachPoolMoveIds: (DOMAIN_TEACH_POOLS[archetype] || []).slice(0, TEACH_BREADTH_BY_RARITY.COMMON),
        taughtMoveIds: [],   // never retro-grant a move on migration
    };
}

// ── Traits — the single implementation homes (contract §4.4) ─────────────────

/** This coach's trait chip `{key,name,desc,caution}`, or null. Fresh copy every call. */
function traitFor(coach) {
    return traitView(coach && coach.traitKey);
}

const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/**
 * ⚠️ THE ONE AND ONLY PLACE a trait touches a drill's numbers. PURE.
 *
 * Called by BOTH `buildDrillViews` (what the player SEES on the card) and
 * `homeCampTrainingService.runDrill` (what the player is actually CHARGED and rolled for).
 * That shared call is the entire guarantee behind "the player never sees a number they aren't
 * charged" — a second `+1` added inside the resolver would silently break the feature while
 * every card kept displaying the old value. If you need a new trait effect on a drill, it
 * goes HERE and nowhere else.
 *
 * Returns a NEW object with a COPIED stats array: the config kits are frozen and shared
 * process-wide, so decorating a drill in place would leak into the next request (this bit the
 * fight engine before — see buildMoveBonuses' "FRESH objects every call").
 *
 * @param {object} drill    a drill from drillFor/drillsForArchetype (already a fresh copy)
 * @param {?string} traitKey
 * @returns {object} adjusted copy
 */
function applyTraitToDrill(drill, traitKey) {
    const d = { ...drill, stats: [...(drill.stats || [])] };
    const t = traitDef(traitKey);
    if (!t) return d;

    // Night Owl only discounts his FLAGSHIP, and no drill can ever be free.
    if (t.energyDelta && (!t.energyFlagshipOnly || d.isFlagship)) {
        d.energy = Math.max(1, d.energy + t.energyDelta);
    }
    // A 0% drill NEVER becomes risky: Perfectionist raises real risk, he doesn't invent it on
    // film study. Same idea for drops — Perfectionist can't open a drop channel on a drill
    // that has none, and Safety-First can't be blamed for closing one that never existed.
    if (t.injuryDelta && d.injuryPct > 0) d.injuryPct = clamp(0, 100, d.injuryPct + t.injuryDelta);
    if (t.dropDelta && d.dropPct > 0) d.dropPct = clamp(0, 100, d.dropPct + t.dropDelta);
    if (t.condDeltaBonus) d.condDelta += t.condDeltaBonus;
    return d;
}

/**
 * THE single home for a coach's training XP multiplier — used by the payload (`xpMultiplier`)
 * and by the resolver (`runDrill`), so the advertised multiplier is the charged one.
 *
 * Chain: tier × rank-3 bonus × trait bonus, then a LOW-MORALE penalty that halves the BONUS
 * and never the base. That distinction matters: at morale 10 a Tier-2 coach drops 1.30 → 1.15,
 * he does not drop to 0.65. A miserable coach is worth less than a happy one, never worse
 * than no coach at all.
 *
 * EXCLUDES camp condition, backstory and boosters — those are session-level multipliers the
 * caller stacks on top (and deliberately outside the morale halving).
 *
 * @param {object} coach
 * @param {object} tierCfg CAMP_TIERS[effectiveTier]
 * @returns {number}
 */
function coachXpMultiplier(coach, tierCfg) {
    const cfg = tierCfg || CAMP_TIERS[1];
    const rank = Number(coach && coach.rank) || 1;
    const t = traitDef(coach && coach.traitKey);
    const base = cfg.coachXpMult
        * (1 + (rank >= 3 ? COACH_RANK3_XP_BONUS : 0))
        * (1 + (t && t.xpBonus ? t.xpBonus : 0));

    let bonus = base - 1;
    const morale = Number.isFinite(coach && coach.morale) ? coach.morale : MORALE_MAX;
    if (morale < MORALE_XP_HALVED_BELOW) bonus *= 0.5;
    return 1 + bonus;
}

/** Human explanation of everything above the tier baseline. "" when there is nothing to say. */
function xpMultiplierNote(coach) {
    const parts = [];
    if ((Number(coach && coach.rank) || 1) >= 3) parts.push(`Rank 3 +${Math.round(COACH_RANK3_XP_BONUS * 100)}%`);
    const t = traitDef(coach && coach.traitKey);
    if (t && t.xpBonus) parts.push(`${t.name} +${Math.round(t.xpBonus * 100)}%`);
    const morale = Number.isFinite(coach && coach.morale) ? coach.morale : MORALE_MAX;
    // Say it out loud — an unexplained drop in training XP reads as a bug, not as a coach
    // who is one bad week from walking out.
    if (morale < MORALE_XP_HALVED_BELOW) parts.push("Low morale −50% bonus");
    return parts.join(" · ");
}

/**
 * THE single source of truth for "what does rank N give this coach?".
 *
 * Both the Development Track node captions (`rankLabels`) and the next-rank card
 * (`nextRank.grants`) render from this one fact object, so the track and the card can never
 * disagree about WHAT a rank grants — only about how verbosely they say it.
 *
 * HONESTY RULE — never advertise what you don't grant. In PHASE 0/1 that meant this function
 * was FORBIDDEN from mentioning teachable moves, because nothing granted them. ⚠️ PHASE 2
 * INVERTS THAT: promotions now deliver moves, so staying silent became the dishonest option.
 * The rule itself is unchanged; only the facts moved.
 *
 * TEACH CLAUSE SCOPE — the clause is emitted ONLY for a rank the coach can still REACH
 * (`rank > coach.rank`). Two cases make that the only honest choice:
 *   · a PAST rank whose move is already taught would otherwise keep advertising a grant that
 *     already happened (the `teaches[]` array carries that history, with state "taught");
 *   · a MIGRATED Rank-4 coach still has untaught pool slots but can NEVER be promoted again
 *     (§3.2 — claim-perk does not teach), so his Rank-4 node must not promise moves that are
 *     permanently unreachable through him.
 *
 * @returns {{isJoin:boolean, drill:object|null, xpBonusPct:number, perk:{key,name,effect}|null,
 *            teaches:Array<{moveId:string,grantRarity:string}>}}
 */
function rankGrant(coach, rank) {
    if (rank <= 1) return { isJoin: true, drill: null, xpBonusPct: 0, perk: null, teaches: [] };
    // drillsForCoach (not drillsForArchetype): a LEGENDARY's Rank-4 node must announce his
    // masterclass, which is the single biggest reason to pay for that promotion.
    const drill = drillsForCoach(coach).find((d) => d.unlockRank === rank) || null;
    const xpBonusPct = rank === 3 ? Math.round(COACH_RANK3_XP_BONUS * 100) : 0;
    const perk = rank === COACH_MAX_RANK ? perkForArchetype(coach.archetype) : null;
    const teaches = rank > (Number(coach.rank) || 1) ? resolveTeachGrants(coach, rank) : [];

    // What a rank ALREADY PASSED was supposed to teach, and whether it actually did.
    // `teaches` above is empty for a passed rank (nothing left to grant), which is why the
    // Development Track silently dropped the fragment — so a Rank-2 node read "Unlocks
    // Grind-It-Out Rounds" while the teach list separately said the Rank-2 move was missed.
    // Two panels, one rank, contradictory stories. This lets the node show the move it owed.
    const pool = Array.isArray(coach.teachPoolMoveIds) ? coach.teachPoolMoveIds : [];
    const alreadyTaught = new Set(coach.taughtMoveIds || []);
    const past = [];
    if (rank <= (Number(coach.rank) || 1)) {
        for (const i of teachSlotsForRank(coach, rank)) {
            const moveId = pool[i];
            if (!moveId || !SPECIAL_MOVES_BY_ID[moveId]) continue;
            past.push({ moveId, grantRarity: teachRarityFor(coach.rarity, SPECIAL_MOVES_BY_ID[moveId].minRarity), delivered: alreadyTaught.has(moveId) });
        }
    }
    return { isJoin: false, drill, xpBonusPct, perk, teaches, past };
}

/**
 * Perk state for a coach (contract addendum — `Coach.perk`).
 *
 * The camp NEVER defines its own perk text: key/name/effect come from perkForArchetype,
 * which reads GYM_PERK_CATALOG (built from data/gyms.json), so the camp screen and the gym
 * screen can never disagree about what a perk is called or what it does.
 *
 *   held      — the key is already in fighter.gymPerks. Quite likely for a migrated veteran:
 *               reaching Rank 4 at the source gym already granted that gym's perk.
 *   claimable — the coach is at max rank and the perk is NOT held, i.e. the player has
 *               earned it but nothing has written it to their fighter yet. This is the case
 *               a gym→camp migration produces (deriveInitialCampState writes nothing to the
 *               fighter by design), and it is what POST .../claim-perk settles.
 *
 * Returns null when the archetype has no perk at all — the third truthful answer the UI needs
 * for a maxed coach, so it never has to infer "nothing left" from an empty nextRank.
 *
 * @returns {{key:string,name:string,effect:string,held:boolean,claimable:boolean}|null}
 */
function buildPerkView(coach, fighter) {
    const perk = perkForArchetype(coach && coach.archetype);
    if (!perk) return null;
    const owned = Array.isArray(fighter && fighter.gymPerks) ? fighter.gymPerks : [];
    const held = owned.includes(perk.key);
    const rank = Number(coach && coach.rank) || 1;
    return { key: perk.key, name: perk.name, effect: perk.effect, held, claimable: rank >= COACH_MAX_RANK && !held };
}

/**
 * Rank-4 node caption fragment. A COMPLETED rank-4 node must not claim the player holds a
 * perk they have never been granted — a migrated veteran's coach arrives at rank 4 with the
 * perk still unclaimed, and "Mat Returns perk" alone would read as "you have this".
 */
function perkCaption(perk, perkView) {
    if (perkView && perkView.claimable) return `${perk.name} perk — unclaimed`;
    return `${perk.name} perk`;
}

/**
 * SHORT rendering of rankGrant — one line per node on the Development Track (mock F).
 * Phrasing follows the mock ("Corner Confidence perk"). Kept terse because it renders inside
 * a small node; the long form lives on the next-rank card.
 *
 * @param {object} [perkView] optional buildPerkView output, so the rank-4 caption can be
 *                            truthful about whether the perk is actually held.
 */
function rankLabelFor(coach, rank, perkView = null) {
    const g = rankGrant(coach, rank);
    if (g.isJoin) return "Joined your camp";
    const parts = [];
    if (g.xpBonusPct > 0) parts.push(`+${g.xpBonusPct}% training XP`);
    if (g.drill) parts.push(`Unlocks ${g.drill.name}`);
    // Names only — this renders inside a small track node. The rarity lives on the next-rank
    // card (grantsForRank) where there is room for it.
    if (g.teaches.length) parts.push(`Teaches ${g.teaches.map((t) => teachGrantLabel(t, false)).join(", ")}`);
    // A rank already passed. Delivered moves read normally; ones that never arrived are
    // wrapped in ~~…~~ so the node shows what it OWED, struck through, instead of quietly
    // omitting it and contradicting the teach list. The `string[]` contract is unchanged —
    // the client strips the markers and applies line-through (see DevelopmentTrack).
    for (const p of (g.past || [])) {
        const label = `Teaches ${teachGrantLabel(p, false)}`;
        parts.push(p.delivered ? label : `~~${label}~~`);
    }
    if (g.perk) parts.push(perkCaption(g.perk, perkView));
    // Honest, not filler: a rank that genuinely adds nothing says so.
    return parts.join(" · ") || "No new unlocks";
}

/**
 * The 4 Development Track captions — one per rank, describing what THAT rank grants
 * (index 0 = rank 1). Always a fresh array; never the shared frozen constant.
 *
 * These are per-COACH, not global rank titles: a Striking coach's rank-4 node reads
 * "Corner Confidence perk" while a BJJ professor's reads "Submission Awareness perk".
 * COACH_RANK_LABELS (Cornerman/Coach/Head Coach/Master) remain the internal rank NAMES and
 * are still used in promotion messages.
 *
 * @param {object} [perkView] optional buildPerkView output (see rankLabelFor).
 */
function buildRankLabels(coach, perkView = null) {
    if (!coach) return [...COACH_RANK_LABELS];   // defensive: callers always pass a coach
    return [1, 2, 3, COACH_MAX_RANK].map((r) => rankLabelFor(coach, r, perkView));
}

/**
 * Requirement progress toward the coach's NEXT rank.
 *
 * ⚠️ THE ONLY PLACE the PRODIGY trait (−15% rank-up requirements) is applied. Everything
 * downstream — the payload's `nextRank.reqs[].tgt`, `reqsMet`, the promote-ready need, the
 * server-side check inside `attemptPromotion` — reads this one function, so the discount is
 * one edit rather than five, and the target a player is shown is the target the server tests.
 * Requirements round UP (ceil): the discount never rounds a requirement away entirely.
 *
 * @returns {{next:number|null, reqs:Array<{key,label,cur,tgt}>, reqsMet:boolean}}
 */
function rankProgress(coach) {
    const rank = Number(coach.rank) || 1;
    if (rank >= COACH_MAX_RANK) return { next: null, reqs: [], reqsMet: false };
    const next = rank + 1;
    const def = COACH_RANKS[next];
    if (!def) return { next: null, reqs: [], reqsMet: false };

    const t = traitDef(coach.traitKey);
    const reqMult = t && t.rankReqMult ? t.rankReqMult : 1;
    const tgtSessions = Math.ceil(def.sessions * reqMult);
    const tgtWins = Math.ceil(def.wins * reqMult);

    const archetype = COACH_ARCHETYPES[coach.archetype] || COACH_ARCHETYPES.STRIKING;
    const sessions = Number(coach.sessionsCompleted) || 0;
    const wins = Number(coach.relevantWins) || 0;
    // `cur` is CLAMPED TO `tgt` for display. `sessionsCompleted` / `relevantWins` are the
    // coach's lifetime totals while each rank's requirement is an absolute threshold, so a
    // coach sitting on a met requirement kept counting past it and the card read "34/12" —
    // which looks like a bug rather than "done". `reqsMet` below still tests the RAW totals,
    // so clamping changes only what the player sees, never who can promote.
    const reqs = [
        { key: "sessions", label: "Sessions", cur: Math.min(sessions, tgtSessions), tgt: tgtSessions },
        { key: "wins", label: archetype.relevantWinLabel, cur: Math.min(wins, tgtWins), tgt: tgtWins },
    ];
    return { next, reqs, reqsMet: sessions >= tgtSessions && wins >= tgtWins };
}

/**
 * Price of the coach's next promotion, adjusted by the persona (Role Model) discount —
 * EXACTLY as gymRankService.attemptManualRankUp does it, so the displayed price and the
 * charged price can never drift.
 * @returns {{rank:number, cost:number, costBase:number, canAfford:boolean}|null}
 */
function promotionQuote(fighter, coach) {
    const { next } = rankProgress(coach);
    if (!next) return null;
    const costBase = COACH_RANKS[next].cost;
    const frac = personaService.getModifiers(fighter).gymRankCostFrac || 0;
    const cost = costBase > 0 ? Math.round(costBase * (1 + frac)) : costBase;
    return { rank: next, cost, costBase, canAfford: (fighter.iron ?? 0) >= cost };
}

/**
 * LONG rendering of rankGrant — the sentence on the next-rank card, read immediately before
 * the player spends cash. Same fact object as rankLabelFor (above), spelled out in full.
 */
function grantsForRank(coach, rank, perkView = null) {
    const g = rankGrant(coach, rank);
    if (g.isJoin) return "Joined your camp";
    const parts = [];
    if (g.drill) parts.push(`Unlocks ${g.drill.name}`);
    if (g.xpBonusPct > 0) parts.push(`+${g.xpBonusPct}% training XP with this coach`);
    // WITH the rarity — this is the sentence read immediately before spending cash, and the
    // rarity is most of what the player is buying (a Rare coach teaches Rare copies).
    if (g.teaches.length) parts.push(`Teaches ${g.teaches.map((t) => teachGrantLabel(t, true)).join(", ")}`);
    if (g.perk) {
        // Don't sell a player something they already own: a veteran who hit Rank 4 at the
        // source gym already holds this perk, and promoting will not grant it a second time.
        parts.push(perkView && perkView.held
            ? `Perk "${g.perk.name}" — you already hold it`
            : `Unlocks perk "${g.perk.name}" — ${g.perk.effect}`);
    }
    return parts.join(" · ") || "No new unlocks at this rank";
}

/**
 * The rarity a coach teaches a given move AT.
 *
 * ⚠️ THIS IS THE COACH'S RARITY, NOT THE MOVE'S. A move's catalog `minRarity` is only the
 * FLOOR at which that move can exist (specialMovesService.grantOrUpgrade grants a move at a
 * rolled rarity, so the same move exists at several tiers). What a coach is worth is what he
 * teaches AT: an Uncommon coach teaches Uncommon copies, a Rare coach teaches Rare ones — that
 * is the entire reason his hire fee scales. Reporting `minRarity` made every coach in the
 * market look like a Common one and quietly erased the difference the player is paying for.
 *
 * The move's floor is still respected: if a pool ever lists a move whose minRarity is ABOVE
 * the coach's rarity, we report the floor rather than advertise a copy that cannot exist.
 */
function teachRarityFor(coachRarity, moveMinRarity) {
    const ci = COACH_RARITIES.indexOf(coachRarity);
    const mi = COACH_RARITIES.indexOf(moveMinRarity);
    if (ci < 0) return moveMinRarity;   // unknown coach rarity → trust the catalog
    if (mi < 0) return coachRarity;
    return ci >= mi ? coachRarity : moveMinRarity;
}

/**
 * PHASE 2 — ⚠️ THE SINGLE HOME OF "what does this rank-up teach?".
 *
 * PURE: reads the coach subdoc and the catalog, mutates nothing, hits no database. Consumed by
 * `attemptPromotion` (to GRANT) and by `rankGrant` → `rankLabelFor`/`grantsForRank` (to
 * DESCRIBE). That shared call is the same guarantee `applyTraitToDrill` gives on drill numbers:
 * THE SENTENCE THE PLAYER READS BEFORE PAYING IS GENERATED BY THE FUNCTION THAT DECIDES WHAT
 * THEY GET. Two implementations would let the next-rank card promise a move the promotion
 * doesn't hand over.
 *
 * The four filters, in order, and why each one exists:
 *   1. `teachSlotsForRank`   — the rank ladder, bounded by the coach's own rarity-sliced pool.
 *   2. unknown move id       — a pool entry no longer in the catalog is SKIPPED, never thrown
 *                              on. A retired move must not make a paid promotion 500.
 *   3. ⚠️ `taughtMoveIds`    — THE IDEMPOTENCY FILTER, and the whole reason the teach channel
 *                              is safe. `taughtMoveIds` is written by the SAME conditional
 *                              updateOne as the rank bump, so a coach can never be positioned
 *                              on a move he has already taught — not on a double-click, not on
 *                              a re-promotion after an admin restore, not ever.
 *   4. rarity floor          — defence in depth behind config rule 12 (the TEACH CEILING). Rule
 *                              12 already makes "a Common coach reaches a Signature" a boot
 *                              failure; this makes it a no-op even if the pool were hand-edited
 *                              in the database.
 *
 * Returns `[]` when `CAMP_TEACH_CHANNEL` is off — and it is checked HERE rather than at the
 * call site precisely so the flag also silences the DESCRIPTIONS. A kill switch that stopped
 * granting but kept advertising would be worse than no kill switch.
 *
 * @param {object} coach  HomeCamp coach subdoc
 * @param {number} toRank the rank being reached
 * @returns {Array<{moveId:string, grantRarity:string}>} ordered by pool index
 */
function resolveTeachGrants(coach, toRank) {
    if (!coach) return [];
    if (!config.features.campTeachChannel) return [];

    const pool = Array.isArray(coach.teachPoolMoveIds) ? coach.teachPoolMoveIds : [];
    const taught = new Set(Array.isArray(coach.taughtMoveIds) ? coach.taughtMoveIds : []);
    const coachRank = rarityRank[coach.rarity] ?? -1;

    const out = [];
    const seen = new Set();
    for (const i of teachSlotsForRank(coach, toRank)) {
        const moveId = pool[i];
        if (!moveId || seen.has(moveId)) continue;   // a pool with a repeated id can't double-grant
        const def = SPECIAL_MOVES_BY_ID[moveId];
        if (!def) continue;                          // stale id — skip, don't crash
        if (taught.has(moveId)) continue;            // ← THE idempotency filter
        if ((rarityRank[def.minRarity] ?? Infinity) > coachRank) continue;  // defence in depth
        seen.add(moveId);
        out.push({ moveId, grantRarity: teachRarityFor(coach.rarity, def.minRarity) });
    }
    return out;
}

/** Display name + rarity for a teach grant, for the rank captions. */
function teachGrantLabel(grant, withRarity) {
    const def = SPECIAL_MOVES_BY_ID[grant.moveId];
    const name = def ? def.name : grant.moveId;
    if (!withRarity) return name;
    const r = String(grant.grantRarity || "");
    return `${name} (${r.charAt(0) + r.slice(1).toLowerCase()})`;
}

/**
 * The coach's (or market candidate's) teach list. State is derived from the coach's ACTUAL
 * rank against each slot's `TEACH_RANK_BY_SLOT` requirement — never from pool position:
 *   taught       — already granted (PHASE 2 writes taughtMoveIds; Phase 0/1 never do)
 *   next         — the immediate next promotion grants it (rankReq === rank + 1)
 *   locked       — a later promotion grants it, with its own real rankReq
 *   unavailable  — rank >= rankReq but it was never taught, so NO promotion can ever grant it
 *
 * `unavailable` is the whole point of deriving from rank. Slot order alone said "the first
 * untaught move is next", which on a migrated Rank-4 coach (conversion writes nothing to the
 * fighter, so taughtMoveIds is empty at max rank) advertised "Unlocks at Rank 2" on a coach
 * with no promotions left — dangling four moves the player can never obtain. Same story with
 * CAMP_TEACH_CHANNEL off during a promotion. The UI needs to say "missed", not "coming".
 *
 * Several moves legitimately share one state: rank 4 grants EVERY remaining slot at once
 * (teachSlotsForRank: R2 → [0], R3 → [], R4 → [1..n-1]), so a Rank-3 coach shows all of his
 * remaining moves as `next` — they really do all arrive on the same promotion.
 *
 * ONE home for roster coaches AND market candidates: a candidate is the same subdoc shape, so
 * a hire must not change what the teach list says.
 */
/**
 * The rank a coach JOINED at. Everything above it, the player paid for.
 *
 * Stored since 2026-07-28; derived conservatively for older documents, where guessing wrong
 * in the generous direction would retro-grant a whole teach pool for free:
 *   · a hired coach ALWAYS joins at rank 1 (homeCampMarketService hardcodes it), so every
 *     rank he holds above 1 was bought — safe to assume 1.
 *   · a starter in a NEW camp likewise begins at rank 1.
 *   · a starter in a GYM_MIGRATION camp arrived at an unrecorded converted rank, so we assume
 *     he arrived at his CURRENT rank and grant nothing. That under-grants a migrated veteran
 *     who was then promoted further in-camp — deliberately the wrong answer in the safe
 *     direction, and only for documents predating the field.
 */
function resolveJoinedAtRank(coach, campOrigin = null) {
    const stored = Number(coach && coach.joinedAtRank);
    if (Number.isFinite(stored) && stored >= 1) return stored;
    if (!coach || !coach.isStarter) return 1;
    if (campOrigin && campOrigin.source === "GYM_MIGRATION") return Number(coach.rank) || 1;
    return 1;
}

function buildTeachList(coach, campOrigin = null) {
    const pool = coach.teachPoolMoveIds || [];
    const taught = new Set(coach.taughtMoveIds || []);
    const rank = Number(coach.rank) || 1;
    const joinedAt = resolveJoinedAtRank(coach, campOrigin);
    const out = [];
    for (let i = 0; i < pool.length; i++) {
        const moveId = pool[i];
        const def = SPECIAL_MOVES_BY_ID[moveId];
        if (!def) continue; // stale id no longer in catalog — omit rather than render "undefined"
        const rankReq = TEACH_RANK_BY_SLOT[i] ?? COACH_MAX_RANK;
        let state;
        if (taught.has(moveId)) {
            state = "taught";
        } else if (rank >= rankReq) {
            // Past the slot with nothing recorded. Two very different reasons:
            //   · the player PAID for that promotion (rankReq > joinedAt) and the teach channel
            //     simply didn't exist yet — every coach promoted during v1.6 is in this state.
            //     They earned it, so it's `claimable`, settled by POST …/claim-teach.
            //   · he ARRIVED already past it (rankReq <= joinedAt) — never promoted, never
            //     earned. Stays `unavailable`.
            state = rankReq > joinedAt ? "claimable" : "unavailable";
        } else if (rankReq === rank + 1) {
            state = "next";
        } else {
            state = "locked";
        }
        out.push({
            moveId,
            name: def.name,
            rarity: teachRarityFor(coach.rarity, def.minRarity),
            state,
            rankReq,
        });
    }
    return out;
}

/**
 * The coach's camp-wide passive `{key,label,effect}`, or null.
 *
 * CONDITIONING only, for now. His two statless drills pay out in CAPPED resources (Max
 * Stamina 120, Condition 100), so once both were topped out he was the only coach in the
 * game with half a dead kit and no reason to keep. This is that reason, and it applies to
 * every drill in the camp — including ones run with another coach.
 */
function buildPassiveView(coach) {
    if (!coach || coach.archetype !== "CONDITIONING") return null;
    const rank = Math.max(1, Math.min(COACH_MAX_RANK, Number(coach.rank) || 1));
    const cut = CONDITIONING_INJURY_REDUCTION_BY_RANK[rank] || 0;
    if (!cut) return null;
    const pct = Math.round(cut * 100);
    return {
        key: "CONDITIONING_INJURY",
        label: "Camp-wide",
        // `short` exists so the camp bar never has to scrape a number back out of `effect`.
        short: `-${pct}% injury`,
        effect: `-${pct}% injury risk on every camp session, including sessions with your other coaches`,
    };
}

/**
 * Every camp-wide passive currently active, with the coach providing it.
 *
 * Camp-level, NOT per-coach, because the effect is camp-level: it applies while you train
 * with somebody else entirely. Hiding it behind "select the Conditioning coach" meant the
 * one bonus that pays you for NOT using him was only visible when you were looking at him.
 */
function buildCampPassives(coaches) {
    const out = [];
    for (const c of (Array.isArray(coaches) ? coaches : [])) {
        const p = buildPassiveView(c);
        if (p) out.push({ ...p, coachId: String(c._id), coachName: c.name });
    }
    return out;
}

/** Tenure blurb for the coach card. */
function tenureLabel(coach) {
    if (coach.isStarter) return "With you from day one";
    const hired = coach.hiredAt ? new Date(coach.hiredAt) : null;
    if (!hired || Number.isNaN(hired.getTime())) return "Recently hired";
    const days = Math.floor((Date.now() - hired.getTime()) / 86_400_000);
    if (days <= 0) return "Joined today";
    if (days === 1) return "1 day in camp";
    return `${days} days in camp`;
}

/**
 * PHASE 1: morale is live — it decays weekly and a coach at 0 walks out.
 *
 * The bands line up with the mechanics rather than with round numbers: the "Thriving" cut-off
 * IS `MORALE_NEED_THRESHOLD`, so a coach stops reading as happy on the exact tick the camp
 * screen starts nagging about him — 70 points of warning before anyone quits.
 * A LOYAL coach can never fall below his floor (40), so he never renders as "Ready to walk".
 */
function moraleView(coach) {
    const value = Number.isFinite(coach && coach.morale) ? coach.morale : MORALE_MAX;
    const t = traitDef(coach && coach.traitKey);
    if (value >= MORALE_NEED_THRESHOLD) return { value, label: "Thriving", tone: "good", note: "Happy in the room." };
    if (value >= 40) {
        return {
            value,
            label: "Restless",
            tone: "warn",
            note: t && t.moraleFloor ? "Unhappy, but he'll never walk." : "Losing patience.",
        };
    }
    return { value, label: "Ready to walk", tone: "bad", note: "One bad week from quitting." };
}

/**
 * One coach's drill cards. A locked drill deliberately omits energy/stats — the UI renders
 * "???" for it, so shipping the numbers would spoil the reveal AND leak unearned config.
 * `blocks` = { spar: injuryOrNull, bag: injuryOrNull } resolved once per request by the caller.
 */
function buildDrillViews(coach, blocks, fighter = null) {
    // A `raisesMaxStamina` drill has stats:[], xpBase:0, dropPct:0 — Max Stamina is its ONLY
    // output. At the cap it therefore delivers nothing at all, so offering it as trainable
    // sells the player a session that cannot do anything. Blocked here (and re-checked in
    // runDrill) rather than reported after the energy is already gone.
    const atStaminaCap = !!fighter && (Number(fighter.maxStamina) || 100) >= MAX_STAMINA_CAP;
    // PHASE 2: `drillsForCoach`, not `drillsForArchetype` — a LEGENDARY carrying an
    // `exclusiveSessionKey` gets a FIFTH card (his masterclass). Everyone else still gets 4.
    // Resolution is by HIS stored key, so the extra card can only appear on a coach who can
    // actually train it.
    return drillsForCoach(coach).map((raw) => {
        if (raw.unlockRank > (Number(coach.rank) || 1)) {
            // `isExclusive` is on BOTH shapes so the client styles the masterclass without
            // string-matching the key. A pre-Rank-4 Legendary shows it as a visible "???" goal.
            return {
                key: raw.key,
                name: raw.name,
                locked: true,
                unlockRank: raw.unlockRank,
                isExclusive: !!raw.isExclusive,
            };
        }
        // ⚠️ TRAIT-ADJUSTED, via the SAME function runDrill calls before it deducts energy.
        // Every number below is the number the player will actually be charged / rolled at:
        // a Night Owl's flagship shows 8 energy AND costs 8; a Perfectionist's card shows the
        // +1s AND the resolver applies them. Do not read `raw` past this line.
        const d = applyTraitToDrill(raw, coach.traitKey);
        const blocked = blocks[d.family] || null;
        const cappedOut = !!d.raisesMaxStamina && atStaminaCap;
        return {
            key: d.key,
            name: d.name,
            locked: false,
            unlockRank: d.unlockRank,
            energy: d.energy,
            stats: d.stats,
            injuryPct: d.injuryPct,
            dropPct: d.dropPct,
            condDelta: d.condDelta,
            isFlagship: d.isFlagship,
            // The Legendary masterclass. Deliberately NOT a flagship (so NIGHT_OWL's
            // flagship-only energy discount never applies to it — the card would advertise a
            // price the resolver doesn't charge), hence a separate flag rather than a reuse.
            isExclusive: !!d.isExclusive,
            // A statless drill that raises Max Stamina instead — without this flag the card has
            // no stats, no XP and nothing truthful to render.
            raisesMaxStamina: !!d.raisesMaxStamina,
            family: d.family, // "spar" | "bag" | "none" — drives the card's stripe color client-side
            // Injury wins the message when both apply — it's the more urgent thing to tell them.
            canTrain: !blocked && !cappedOut,
            blockedReason: blocked
                ? `${blocked.label} (${blocked.effect})`
                : (cappedOut ? `Max Stamina is already at its cap of ${MAX_STAMINA_CAP}` : null),
        };
    });
}

/**
 * Full coach DTO (contract §3.1 `Coach`). Pure — no DB, no mutation.
 * @param {object} coach   HomeCamp coach subdoc
 * @param {object} fighter Fighter doc (for the persona-adjusted promotion price + cash check)
 * @param {{spar:object|null, bag:object|null, none:null}} blocks resolved injury blocks
 * @param {{tierCfg?:object, coachCount?:number}} [ctx] camp context. `tierCfg` is the effective
 *        tier's config (drives xpMultiplier); `coachCount` is the roster size (drives canFire —
 *        the camp may never be left without a coach). Defaults keep the Phase-0 call shape valid.
 */
function buildCoachView(coach, fighter, blocks, ctx = {}) {
    const archetype = COACH_ARCHETYPES[coach.archetype] || COACH_ARCHETYPES.STRIKING;
    const { next, reqs, reqsMet } = rankProgress(coach);
    const quote = promotionQuote(fighter, coach);
    // Resolved ONCE and reused by the track captions, the next-rank sentence and the DTO, so
    // every place the perk is mentioned agrees about whether the player actually holds it.
    const perk = buildPerkView(coach, fighter);

    let nextRank = null;
    if (next && quote) {
        nextRank = {
            rank: next,
            ready: reqsMet && quote.canAfford,
            reqsMet,
            reqs,
            cost: quote.cost,
            costBase: quote.costBase,
            canAfford: quote.canAfford,
            grants: grantsForRank(coach, next, perk),
        };
    }

    const tierCfg = ctx.tierCfg || CAMP_TIERS[1];
    // The camp can never be left without a coach — at ANY tier, including Tier 4. That single
    // guard is also what makes the starter coach safely fireable from Tier 2 on (no special case).
    const coachCount = Number(ctx.coachCount) || 1;
    const canFire = coachCount > 1;

    return {
        coachId: String(coach._id),
        name: coach.name,
        initials: coach.initials,
        rarity: coach.rarity,
        archetype: coach.archetype,
        archetypeLabel: archetype.label,
        isStarter: !!coach.isStarter,
        wage: coach.wage || 0,
        hireFee: coach.hireFee || 0,     // 0 for the starter — he was never bought
        tenureLabel: tenureLabel(coach),
        trait: traitFor(coach),          // {key,name,desc,caution} | null
        rank: Number(coach.rank) || 1,
        maxRank: COACH_MAX_RANK,
        morale: moraleView(coach),
        // Same helper the resolver uses. Condition/backstory/booster are session-level and
        // deliberately excluded — this is the COACH's contribution, not the whole session.
        xpMultiplier: Math.round(coachXpMultiplier(coach, tierCfg) * 1000) / 1000,
        xpMultiplierNote: xpMultiplierNote(coach),
        canFire,
        fireBlockedReason: canFire ? null : "last_coach",
        rankLabels: buildRankLabels(coach, perk),
        nextRank,
        // null when this archetype has no perk. At max rank this is the ONLY truthful signal
        // the UI has — nextRank is null there and says nothing about the perk.
        perk,
        // Camp-wide passive, or null. Only CONDITIONING has one today. Rendered on his card
        // because it is the answer to "why hold a slot for him once my meters are full" —
        // it pays while you train with someone else, and it never caps.
        passive: buildPassiveView(coach),
        teaches: buildTeachList(coach, ctx.campOrigin || null),
        drills: buildDrillViews(coach, blocks, fighter),
    };
}

/** True when the coach meets its next rank's requirements (cash aside). Drives the needs feed. */
function isPromoteReady(coach) {
    const { next, reqsMet } = rankProgress(coach);
    return !!next && reqsMet;
}

/**
 * Credit completed sessions to a coach. Mutates the subdoc; the CALLER saves the camp.
 * Single home for the counter so the train path and any future path can't drift.
 *
 * ALSO stamps `lastSessionAt`, which is what the weekly tick reads to decide whether this
 * coach sat idle all week (−3 morale). Setting the counter without the timestamp would make
 * a heavily-used coach slowly resent you.
 */
function incrementSessions(coach, count = 1) {
    const n = Math.max(0, Math.floor(Number(count)) || 0);
    if (!coach || n === 0) return;
    coach.sessionsCompleted = (Number(coach.sessionsCompleted) || 0) + n;
    coach.lastSessionAt = new Date();
}

/**
 * PROMOTION (contract §3.4). Always manual — every rank costs cash, so there is no
 * auto-rank-up path anywhere in this feature.
 *
 * DOUBLE-CLICK SAFETY: the rank bump is a single conditional updateOne matched on the
 * CURRENT rank, which acts as the mutex — the loser of a race modifies 0 documents and
 * gets a 400 instead of a second charge. Cash is only deducted after that write wins, via
 * saveWithVersionRetry; if the deduct fails the rank is rolled back so a failed payment
 * can never leave a free promotion behind.
 *
 * @returns {Promise<{promotion:object, fighter:object, camp:object}>} caller builds CampState
 */
async function attemptPromotion(fighterId, coachId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    let coach;
    try {
        coach = camp.coaches.id(coachId);
    } catch (_) {
        coach = null; // malformed ObjectId — a 404, never a 500
    }
    if (!coach) throw campError("coach_not_found", "Coach not found", 404);

    const fromRank = Number(coach.rank) || 1;
    if (fromRank >= COACH_MAX_RANK) throw campError("max_rank", "This coach is already at the top rank", 400);

    const { next: toRank, reqs, reqsMet } = rankProgress(coach);
    if (!reqsMet) {
        throw campError("requirements_not_met", "This coach isn't ready for a promotion yet", 400, { reqs });
    }

    const quote = promotionQuote(fighter, coach);
    if (!quote) throw campError("max_rank", "This coach is already at the top rank", 400);
    const cost = quote.cost;
    const have = fighter.iron ?? 0;
    if (have < cost) {
        throw campError("insufficient_cash", "Not enough cash for this promotion", 400, { cost, have });
    }

    // ── PHASE 2: what does this rank-up teach? Computed BEFORE any write, and PURE. ──
    // Filtering against `coach.taughtMoveIds` HERE, before the mutex, is what makes the whole
    // channel idempotent: a coach already carrying the id is simply not in this list.
    const teachGrants = resolveTeachGrants(coach, toRank);
    const teachIds = teachGrants.map((g) => g.moveId);

    // ── The mutex: bump the rank only if it is still exactly fromRank. ──
    //
    // ⚠️ THE TEACH RECORD RIDES THE SAME CONDITIONAL WRITE AS THE RANK BUMP. This is the single
    // most important line in the phase. `taughtMoveIds` is the idempotency key of the teach
    // channel, and it is only trustworthy if it is impossible for the rank to move without it
    // moving too. Splitting these into two updates — even two adjacent ones — opens a window
    // where a crash leaves a coach at Rank 4 with an empty `taughtMoveIds`, and the next
    // promotion (or a restore) grants the same moves again.
    //
    // `$addToSet` rather than `$push`: the filter already guarantees the ids are absent, so
    // this is belt-and-braces against a concurrent writer, and it can never create duplicates.
    const rankUpdate = { $set: { "coaches.$.rank": toRank } };
    if (teachIds.length > 0) rankUpdate.$addToSet = { "coaches.$.taughtMoveIds": { $each: teachIds } };
    const res = await HomeCamp.updateOne(
        { _id: camp._id, coaches: { $elemMatch: { _id: coach._id, rank: fromRank } } },
        rankUpdate
    );
    if (res.modifiedCount !== 1) {
        // Lost the race — someone already promoted this coach. Re-read and report truthfully
        // using only contract error codes; NEVER charge again.
        const fresh = await HomeCamp.findOne({ fighterId: fighter._id });
        const freshCoach = fresh && fresh.coaches.id(coachId);
        if (freshCoach && (Number(freshCoach.rank) || 1) >= COACH_MAX_RANK) {
            throw campError("max_rank", "This coach is already at the top rank", 400);
        }
        throw campError("requirements_not_met", "This coach isn't ready for a promotion yet", 400, {
            reqs: freshCoach ? rankProgress(freshCoach).reqs : reqs,
        });
    }

    // ── Charge (+ the rank-4 perk + the taught moves) in ONE fighter write. ──
    // Everything the promotion costs and everything it delivers ride the same save, so a
    // rollback can never leave a paid-for perk (or a free move) behind, and vice versa.
    // saveWithVersionRetry may RE-RUN this mutation on a freshly loaded doc, so every branch
    // below is written to be re-runnable and every report variable is RESET at the top.
    const rankPerk = toRank === COACH_MAX_RANK ? perkForArchetype(coach.archetype) : null;
    let cashAfter = have;
    let perkAlreadyOwned = false;
    /** @type {Array<object>} one entry per move this rank-up actually delivered. */
    let taughtMoves = [];
    let saved = null;
    try {
        saved = await saveWithVersionRetry(
            () => Fighter.findById(fighterId),
            (doc) => {
                // ⚠️ RESET AT THE TOP OF EVERY INVOCATION. This mutator re-runs on a
                // VersionError against a fresh document; appending to a report array that
                // survived the previous attempt would tell the player they were taught the
                // same move twice (and the FE would fire two reveal modals) for a single
                // grant. Same reasoning for the two booleans.
                taughtMoves = [];
                perkAlreadyOwned = false;

                if ((doc.iron ?? 0) < cost) {
                    throw campError("insufficient_cash", "Not enough cash for this promotion", 400, {
                        cost, have: doc.iron ?? 0,
                    });
                }
                // ⚠️ CHARGE FIRST, ALWAYS. Ordering is load-bearing: a taught move that turns
                // out to be a DUPLICATE pays cash INTO `doc.iron`, so teaching before
                // deducting would let a duplicate cash-out fund the very promotion that
                // triggered it.
                doc.iron = (doc.iron ?? 0) - cost;

                // ADDITIVE ONLY. gymPerks is a live, shared array — perks earned at a gym must
                // survive untouched, and re-promoting must never double-grant. We only ever
                // push a missing key; we never remove, reorder or overwrite.
                if (rankPerk) {
                    if (!Array.isArray(doc.gymPerks)) doc.gymPerks = [];
                    if (doc.gymPerks.includes(rankPerk.key)) {
                        perkAlreadyOwned = true;
                    } else {
                        doc.gymPerks.push(rankPerk.key);
                    }
                }

                // PHASE 2 — the denormalised badge input. Same additive rule as gymPerks: only
                // ever pushed when absent, never removed. Written here (inside the paid write)
                // so a fighter can only be credited with a Rank-4 archetype they actually paid
                // to reach. Badge EVALUATION deliberately does NOT happen here — see below.
                if (rankPerk) {
                    if (!Array.isArray(doc.campRank4Archetypes)) doc.campRank4Archetypes = [];
                    if (!doc.campRank4Archetypes.includes(coach.archetype)) {
                        doc.campRank4Archetypes.push(coach.archetype);
                    }
                }

                // PHASE 2 — the teach channel. `grantOrUpgrade` stays the SOLE writer of
                // `specialMovesOwned`; we just call it with an id the rank ladder chose instead
                // of one a drop rolled. It returns NEW / UPGRADE / DUPLICATE verbatim, and we
                // hand that object straight through to the client so the existing drop-reveal
                // components need no new branch.
                for (const g of teachGrants) {
                    const r = specialMovesService.grantOrUpgrade(doc, g.moveId, g.grantRarity);
                    if (r) taughtMoves.push({ moveId: g.moveId, ...r });
                }
            }
        );
        // Read AFTER the duplicate cash-outs above — this is the true balance, not have-cost.
        cashAfter = saved ? (saved.iron ?? 0) : have - cost;
    } catch (err) {
        // Roll back BOTH halves of the mutex write. The `$pull` can never over-remove: every
        // id in `teachIds` was PROVABLY ABSENT from `taughtMoveIds` before the `$addToSet`
        // (resolveTeachGrants filtered on exactly that), so pulling them can only undo what
        // this request added.
        const rollback = { $set: { "coaches.$.rank": fromRank } };
        if (teachIds.length > 0) rollback.$pull = { "coaches.$.taughtMoveIds": { $in: teachIds } };
        await HomeCamp.updateOne(
            { _id: camp._id, coaches: { $elemMatch: { _id: coach._id, rank: toRank } } },
            rollback
        ).catch((e) => console.error("[homeCamp] promotion rollback failed:", e.message));
        throw err;
    }

    // ── Badges — AFTER the save, NEVER inside the mutator. ──
    // `evaluateBadges` writes an ActivityLog entry per award. Inside the mutator a VersionError
    // retry would emit a duplicate feed entry for an award that never persisted — the player
    // would see "Badge Earned" twice in their feed for one badge. This matches the shape
    // homeCampTrainingService already uses (evaluate, then save), NOT gymRankService's.
    let newlyEarnedBadges = [];
    try {
        if (saved) {
            newlyEarnedBadges = badgeService.evaluateBadges(saved, { campRankUp: true }).newlyEarned;
            if (newlyEarnedBadges.length > 0) await saved.save();
        }
    } catch (e) {
        console.error("[homeCamp] badge eval on promotion failed:", e.message);
        newlyEarnedBadges = [];
    }

    // Re-read both documents so the returned CampState reflects the committed writes.
    const freshFighter = await Fighter.findById(fighterId);
    const freshCamp = await HomeCamp.findOne({ fighterId: fighter._id });
    const freshCoach = freshCamp.coaches.id(coachId);

    const unlocked = drillsForCoach(freshCoach).find((d) => d.unlockRank === toRank) || null;
    const rankLabel = COACH_RANK_LABELS[toRank - 1] || `Rank ${toRank}`;
    const xpBonusPct = toRank >= 3 ? Math.round(COACH_RANK3_XP_BONUS * 100) : 0;
    const badgeGranted = newlyEarnedBadges.length > 0
        ? {
            badgeId: newlyEarnedBadges[0].badgeId,
            name: (badgeService.getBadge(newlyEarnedBadges[0].badgeId) || {}).name || newlyEarnedBadges[0].badgeId,
            context: newlyEarnedBadges[0].context ?? null,
        }
        : null;

    let message = `${freshCoach.name} promoted to ${rankLabel}.`;
    if (unlocked) message += ` Unlocked ${unlocked.name}.`;
    if (toRank === 3) message += ` +${xpBonusPct}% training XP with this coach.`;
    if (taughtMoves.length > 0) {
        message += ` Taught ${taughtMoves.map((m) => `${m.name} (${m.rarity.charAt(0)}${m.rarity.slice(1).toLowerCase()})`).join(", ")}.`;
    }
    if (rankPerk) {
        message += perkAlreadyOwned
            ? ` You already hold the ${rankPerk.name} perk.`
            : ` Earned perk: ${rankPerk.name} — ${rankPerk.effect}`;
    }
    if (badgeGranted) message += ` Badge earned: ${badgeGranted.name}.`;

    return {
        promotion: {
            coachId: String(freshCoach._id),
            fromRank,
            toRank,
            costPaid: cost,
            cashAfter,
            unlockedDrill: unlocked ? { key: unlocked.key, name: unlocked.name } : null,
            // Compact summary of the FIRST taught move, for the message line / headline.
            // The full list is `taughtMoves` below — never read this one to drive reveals.
            unlockedTeach: taughtMoves.length > 0
                ? {
                    moveId: taughtMoves[0].moveId,
                    name: taughtMoves[0].name,
                    rarity: taughtMoves[0].rarity,
                    outcome: taughtMoves[0].outcome,
                }
                : null,
            /**
             * PHASE 2 — one entry per move this rank-up delivered. ALWAYS AN ARRAY, NEVER NULL:
             * `[]` when the rank teaches nothing (rank 3 always; rank 4 for a COMMON coach) or
             * when CAMP_TEACH_CHANNEL is off.
             *
             * Each element is `specialMovesService.grantOrUpgrade`'s return object VERBATIM plus
             * `moveId` — deliberately, so the frontend can hand each one straight to the EXISTING
             * DropRevealModal / moveDupe toast with zero new components:
             *   NEW       → { outcome, moveId, name, effectType, art, rarity, description, flavor, isUpgrade:false }
             *   UPGRADE   → … + { isUpgrade:true, fromRarity, toRarity }
             *   DUPLICATE → … + { cashAwarded, newBalance }
             */
            taughtMoves,
            xpBonusPct,
            // Rank 4 grants the archetype's perk into fighter.gymPerks (the SAME store the gym
            // rank-4 perks use). `alreadyOwned` is true when the player had already earned it
            // at a gym — nothing was written, but the perk is still active for them.
            perkGranted: rankPerk ? { ...rankPerk, alreadyOwned: perkAlreadyOwned } : null,
            // First newly-earned badge (for the message line), or null.
            badgeGranted,
            // The exact shape evaluateBadges().newlyEarned returns, under the SAME key the
            // train endpoint already uses — CampTab reuses its badge-toast loop verbatim.
            newlyEarnedBadges,
            message,
        },
        fighter: freshFighter,
        camp: freshCamp,
    };
}

/**
 * CLAIM the rank-4 archetype perk for a coach that is ALREADY at max rank.
 *
 * WHY THIS EXISTS: a player whose gym history converted their coach in at rank 4
 * (deriveInitialCampState) never went through attemptPromotion, and the conversion writes
 * NOTHING to the fighter document — that is the lossless-rollback guarantee (contract §6.3),
 * and a GET may never write. So the perk they earned is delivered here instead: an explicit,
 * user-initiated POST. It is FREE — the rank was already paid for and earned; this hands over
 * something owed, it is not a new purchase.
 *
 * GRANT RULES — identical to the promotion grant, deliberately:
 *   · ADDITIVE ONLY. gymPerks is a live, shared array read by fightService (strength_reserve)
 *     and trainingService (iron_conditioning). We only ever push a MISSING key; we never
 *     remove, reorder or overwrite, so perks earned at a gym survive untouched.
 *   · IDEMPOTENT. A perk already held is a 400 `perk_already_held`, never a second push.
 *   · DOUBLE-CLICK SAFE. The write is ONE atomic conditional `updateOne` filtered on the perk
 *     being absent — the same mutex shape as attemptPromotion's rank bump. Exactly one caller
 *     can match; the loser modifies nothing and gets `perk_already_held`.
 *     ⚠️ This used to lean on saveWithVersionRetry, on the assumption that a `$push` bumping
 *     `__v` would make the loser hit a VersionError. It does not: no schema in this repo sets
 *     `optimisticConcurrency`, so both concurrent `save()`s commit and both mutators re-check
 *     against the same pre-race document. Two simultaneous claims produced
 *     gymPerks ["mat_returns","mat_returns"]. A read-modify-save is not a mutex here.
 *
 * ⚠️ PHASE 2 — CLAIM-PERK DOES NOT TEACH. A migrated coach reached Rank 4 without ever being
 * promoted through Rank 2, so retro-teaching here would hand a veteran up to 3 free moves for
 * $0 — the exact rule `deriveInitialCampState` was built around (`taughtMoveIds: []`, "never
 * retro-grant a move"). Since a Rank-4 coach can never be promoted again, A MIGRATED COACH'S
 * TEACH POOL IS PERMANENTLY UNREACHABLE THROUGH HIM. That is deliberate and is stated plainly
 * in the in-game Library. The player reaches those moves by hiring a fresh coach in that
 * domain (banked Discipline Familiarity makes that fast) or through pool-biased drops.
 *
 * It DOES do the other two Phase-2 additions: `campRank4Archetypes` (this is where a migrated
 * veteran's archetype gets recorded — he never went through attemptPromotion) and the badge
 * evaluation that follows from it.
 *
 * @returns {Promise<{perkGranted:object, newlyEarnedBadges:Array, badgeGranted:object|null,
 *                    fighter:object, camp:object}>} caller builds CampState
 */
async function claimCoachPerk(fighterId, coachId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    let coach;
    try {
        coach = camp.coaches.id(coachId);
    } catch (_) {
        coach = null; // malformed ObjectId — a 404, never a 500
    }
    if (!coach) throw campError("coach_not_found", "Coach not found", 404);

    const perk = perkForArchetype(coach.archetype);
    if (!perk) {
        throw campError("perk_not_claimable", "This coach's discipline has no perk to claim", 400);
    }
    if ((Number(coach.rank) || 1) < COACH_MAX_RANK) {
        throw campError(
            "perk_not_claimable",
            `${coach.name} must reach rank ${COACH_MAX_RANK} before this perk can be claimed`,
            400
        );
    }
    // Fast path: report the truth without touching the document at all.
    if (Array.isArray(fighter.gymPerks) && fighter.gymPerks.includes(perk.key)) {
        throw campError("perk_already_held", `You already hold the ${perk.name} perk`, 400);
    }

    // ── THE MUTEX ────────────────────────────────────────────────────────────────────────
    // One atomic conditional update, exactly as attemptPromotion's rank bump does it. A
    // read-modify-save cannot serve as the mutex here: Fighter has no `optimisticConcurrency`
    // (no schema in this repo sets it), so two concurrent `save()`s of an array push BOTH
    // commit and the re-check inside each mutator reads the same pre-race document. Observed
    // from two simultaneous claims: gymPerks ["mat_returns","mat_returns"].
    //
    // `gymPerks: { $ne: perk.key }` in the filter is what makes exactly one caller win; the
    // loser modifies nothing and is told the truth. `$addToSet` on both arrays is
    // belt-and-braces — the filter already guarantees absence, and it can never duplicate.
    //
    // PHASE 2 — `campRank4Archetypes` rides the SAME write. A migrated Rank-4 coach earns the
    // archetype badge here; he never passes through attemptPromotion.
    // NO TEACH HERE. See the header — that is deliberate, not an omission.
    const claim = await Fighter.updateOne(
        { _id: fighter._id, gymPerks: { $ne: perk.key } },
        { $addToSet: { gymPerks: perk.key, campRank4Archetypes: coach.archetype } }
    );
    if (claim.matchedCount === 0) {
        // Either the fighter vanished mid-request or someone else already claimed it.
        const exists = await Fighter.exists({ _id: fighter._id });
        if (!exists) throw campError("fighter_not_found", "Fighter not found", 404);
        throw campError("perk_already_held", `You already hold the ${perk.name} perk`, 400);
    }

    const saved = await Fighter.findById(fighterId);
    if (!saved) throw campError("fighter_not_found", "Fighter not found", 404);

    // ── Badges — AFTER the save, never inside the mutator (same reasoning as attemptPromotion:
    // evaluateBadges writes an ActivityLog per award, and a VersionError retry inside the
    // mutator would emit a duplicate feed entry for an award that never persisted). ──
    let newlyEarnedBadges = [];
    try {
        newlyEarnedBadges = badgeService.evaluateBadges(saved, { campRankUp: true }).newlyEarned;
        if (newlyEarnedBadges.length > 0) await saved.save();
    } catch (e) {
        console.error("[homeCamp] badge eval on perk claim failed:", e.message);
        newlyEarnedBadges = [];
    }
    const badgeGranted = newlyEarnedBadges.length > 0
        ? {
            badgeId: newlyEarnedBadges[0].badgeId,
            name: (badgeService.getBadge(newlyEarnedBadges[0].badgeId) || {}).name || newlyEarnedBadges[0].badgeId,
            context: newlyEarnedBadges[0].context ?? null,
        }
        : null;

    // Re-read the camp so the returned CampState is built from committed state (the camp
    // itself is untouched by a claim — nothing about the coach changes).
    const freshCamp = await HomeCamp.findOne({ fighterId: fighter._id }) || camp;

    return {
        perkGranted: {
            key: perk.key,
            name: perk.name,
            effect: perk.effect,
            coachId: String(coach._id),
            message: badgeGranted
                ? `Earned perk: ${perk.name} — ${perk.effect} Badge earned: ${badgeGranted.name}.`
                : `Earned perk: ${perk.name} — ${perk.effect}`,
        },
        badgeGranted,
        newlyEarnedBadges,
        fighter: saved,
        camp: freshCamp,
    };
}

/**
 * Hand over teach-pool moves a coach ranked past WITHOUT being taught them.
 *
 * WHY THIS EXISTS: the camp shipped (v1.6) with the rank ladder but no teach channel — that
 * arrived in v1.7. Every coach a player promoted in between banked the rank and the drill
 * unlock while the move silently never happened, and the teach list then reported it as
 * "missed". Those players paid full price for a promotion and got less than someone
 * promoting the same coach today. This settles that debt, in one explicit free click.
 *
 * ⚠️ IT IS NOT A GENERAL RETRO-GRANT. Only slots the player actually PAID to promote through
 * are eligible — `rankReq > joinedAtRank`. A coach converted in from a gym at Rank 4 never
 * promoted through anything, so his pool stays permanently out of reach, which is the rule
 * `deriveInitialCampState` was built around ("never retro-grant a move on migration"). Take
 * that condition out and a gym veteran collects a full Legendary pool for $0.
 *
 * FREE, like claimCoachPerk: the promotions were already bought.
 *
 * @returns {Promise<{taughtMoves:Array, coachId:string, message:string, fighter:object, camp:object}>}
 */
async function claimMissedTeach(fighterId, coachId) {
    if (!config.features.campTeachChannel) {
        throw campError("teach_channel_disabled", "Coaches aren't teaching moves right now", 400);
    }

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    let coach;
    try {
        coach = camp.coaches.id(coachId);
    } catch (_) {
        coach = null;
    }
    if (!coach) throw campError("coach_not_found", "Coach not found", 404);

    // Eligible = already ranked past it, never taught, and the rank was PAID for.
    const joinedAt = resolveJoinedAtRank(coach, camp.origin);
    const rank = Number(coach.rank) || 1;
    const taught = new Set(coach.taughtMoveIds || []);
    const pool = Array.isArray(coach.teachPoolMoveIds) ? coach.teachPoolMoveIds : [];
    const coachRarityRank = rarityRank[coach.rarity] ?? -1;

    const eligible = [];
    const seen = new Set();
    for (let i = 0; i < pool.length; i++) {
        const moveId = pool[i];
        if (!moveId || seen.has(moveId)) continue;
        const rankReq = TEACH_RANK_BY_SLOT[i] ?? COACH_MAX_RANK;
        if (rank < rankReq) continue;          // not reached — that's `next`/`locked`, not owed
        if (rankReq <= joinedAt) continue;     // arrived past it — never earned
        if (taught.has(moveId)) continue;      // already settled
        const def = SPECIAL_MOVES_BY_ID[moveId];
        if (!def) continue;
        if ((rarityRank[def.minRarity] ?? Infinity) > coachRarityRank) continue;  // defence in depth
        seen.add(moveId);
        eligible.push({ moveId, grantRarity: teachRarityFor(coach.rarity, def.minRarity) });
    }

    if (eligible.length === 0) {
        throw campError("nothing_to_claim", `${coach.name} has nothing owed to you`, 400);
    }

    // ── THE MUTEX ────────────────────────────────────────────────────────────────────────
    // Same shape as attemptPromotion's rank bump and claimCoachPerk: ONE atomic conditional
    // update, filtered on every id still being absent, so two concurrent claims can only
    // grant once. A read-modify-save is not a mutex here (no `optimisticConcurrency`).
    const ids = eligible.map((g) => g.moveId);
    const res = await HomeCamp.updateOne(
        {
            _id: camp._id,
            coaches: { $elemMatch: { _id: coach._id, taughtMoveIds: { $nin: ids } } },
        },
        { $addToSet: { "coaches.$.taughtMoveIds": { $each: ids } } }
    );
    if (res.modifiedCount !== 1) {
        throw campError("nothing_to_claim", `${coach.name} has nothing owed to you`, 400);
    }

    const taughtMoves = [];
    let saved;
    try {
        saved = await saveWithVersionRetry(
            () => Fighter.findById(fighterId),
            (doc) => {
                taughtMoves.length = 0;   // a retry re-runs this on a fresh doc
                for (const g of eligible) {
                    const r = specialMovesService.grantOrUpgrade(doc, g.moveId, g.grantRarity);
                    if (r) taughtMoves.push({ moveId: g.moveId, ...r });
                }
            }
        );
    } catch (err) {
        // Undo the teach record so the debt is still claimable. Safe: the filter above proved
        // every id was absent, so this can only remove what this request added.
        await HomeCamp.updateOne(
            { _id: camp._id, coaches: { $elemMatch: { _id: coach._id } } },
            { $pull: { "coaches.$.taughtMoveIds": { $in: ids } } }
        ).catch((e) => console.error("[homeCamp] claim-teach rollback failed:", e.message));
        throw err;
    }

    const label = taughtMoves
        .map((m) => `${m.name} (${m.rarity.charAt(0)}${m.rarity.slice(1).toLowerCase()})`)
        .join(", ");
    const freshCamp = await HomeCamp.findOne({ fighterId: fighter._id }) || camp;

    return {
        coachId: String(coach._id),
        taughtMoves,
        message: `${coach.name} finally showed you ${label}.`,
        fighter: saved,
        camp: freshCamp,
    };
}

/**
 * PvE fight-resolved hook (replaces Phase 0's `onFightWin`).
 *
 * Two jobs, deliberately in ONE hook so the fight path has ONE camp call site:
 *   1. WIN CREDIT — unchanged: `relevantWins` for every coach whose archetype counts this
 *      outcome, and ONLY on a win.
 *   2. CORNERMAN — +2 camp condition and +2 own morale after EVERY fight, win or lose.
 *      That is why the call site moved out of the `if (isWin)` block: a cornerman earns his
 *      keep on the nights you lose too.
 *
 * Additive and NON-FATAL by construction — a camp that doesn't exist is a no-op, every failure
 * is swallowed + logged, and it NEVER writes the fighter document. This runs inside fight
 * resolution and must never break a fight.
 *
 * PvP never calls this — coach ranks and camp condition are PvE-only.
 *
 * @param {object} fighter
 * @param {string} outcome  FIGHT_OUTCOMES value
 * @param {{isWin?:boolean}} [opts]
 * @returns {Promise<{credited:number, conditionGained:number, moraleGained:number}>}
 */
async function onFightResolved(fighter, outcome, { isWin = false } = {}) {
    const noop = { credited: 0, conditionGained: 0, moraleGained: 0 };
    try {
        if (!fighter || !fighter._id) return noop;
        const camp = await HomeCamp.findOne({ fighterId: fighter._id });
        if (!camp || !camp.coaches || camp.coaches.length === 0) return noop;

        let credited = 0;
        let conditionGained = 0;
        let moraleGained = 0;

        for (const coach of camp.coaches) {
            const archetype = COACH_ARCHETYPES[coach.archetype];
            if (archetype && isWin && outcome && archetype.relevantWinTypes.includes(outcome)) {
                coach.relevantWins = (Number(coach.relevantWins) || 0) + 1;
                credited += 1;
            }

            const t = traitDef(coach.traitKey);
            if (t && t.postFightCondition) {
                const before = Number(camp.condition?.value ?? CONDITION_MAX);
                const after = Math.max(0, Math.min(CONDITION_MAX, before + t.postFightCondition));
                camp.condition.value = after;
                conditionGained += after - before;
                // NOT a session: `condition.lastSessionDayKey` is deliberately untouched, or a
                // fight would silently cancel a day of neglect decay.
            }
            if (t && t.postFightSelfMorale) {
                const before = Number(coach.morale ?? MORALE_MAX);
                const after = Math.min(MORALE_MAX, before + t.postFightSelfMorale);
                coach.morale = after;
                moraleGained += after - before;
            }
        }

        if (credited > 0 || conditionGained !== 0 || moraleGained !== 0) await camp.save();
        return { credited, conditionGained, moraleGained };
    } catch (e) {
        console.error("[homeCamp] onFightResolved failed:", e.message);
        return noop;
    }
}

module.exports = {
    createStarterCoach,
    buildTeachList,
    // PHASE 2 — the single home of "what does this rank-up teach"
    resolveTeachGrants,
    buildRankLabels,
    rankGrant,
    rankLabelFor,
    grantsForRank,
    buildCoachView,
    buildDrillViews,
    buildPerkView,
    rankProgress,
    promotionQuote,
    attemptPromotion,
    claimCoachPerk,
    buildCampPassives,
    claimMissedTeach,
    resolveJoinedAtRank,
    incrementSessions,
    isPromoteReady,
    onFightResolved,
    campError,
    initialsFor,
    // PHASE 1 — trait single homes (consumed by the view builder AND the resolver)
    traitFor,
    applyTraitToDrill,
    coachXpMultiplier,
    xpMultiplierNote,
    moraleView,
};
