/**
 * Home Camp — the weekly TRAINER MARKET: rolling candidates, hiring, firing, and the
 * discipline-familiarity bank that carries a fired coach's experience to his replacement.
 *
 * NAMING: `camp*` on the backend is the FIGHT camp (GDD §9). This is the HOME camp.
 *
 * OWNS (single home — nothing below may be reimplemented elsewhere):
 *   rollCandidates · generateCandidate · getMarketState · hireCandidate · fireCoach
 *   bankDisciplineFamiliarity · consumeDisciplineFamiliarity · previewDisciplineFamiliarity
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO INVARIANTS THIS FILE EXISTS TO PROTECT
 *
 * 1. THE PERSISTED CANDIDATE ARRAY IS AUTHORITATIVE. The roll is deterministic
 *    (hashSeed(campId:weekIndex) → mulberry32), but determinism is a property of the SEED,
 *    not a licence to re-derive. A hire mutates the stored array; re-deriving it to answer a
 *    read would resurrect a coach the player already bought. The ONLY condition that may
 *    overwrite `market.candidates` is `market.weekIndex !== currentWeek`.
 *
 * 2. HIRE AND FIRE ARE MUTEXES FIRST, PAYMENTS SECOND. Both mutate the roster through ONE
 *    conditional updateOne whose filter carries every precondition (the candidate still
 *    exists / a free slot / more than one coach). The loser of a race modifies 0 documents,
 *    is told the truth, and is NEVER charged.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No HTTP concerns. Errors carry `.code` + `.status`; the controller maps them.
 */
const Fighter = require("../models/fighterModel");
const HomeCamp = require("../models/homeCampModel");
const homeCampService = require("./homeCampService");
const coachService = require("./homeCampCoachService");
const saveWithVersionRetry = require("../utils/saveWithVersionRetry");
const { hashSeed, mulberry32 } = require("../utils/rotation");
const { SPECIAL_MOVES_BY_ID } = require("../consts/specialMovesCatalog");
const notorietyConfig = require("../consts/notorietyConfig");
const {
    CAMP_TIERS,
    COACH_ARCHETYPES,
    ARCHETYPE_KEYS,
    COACH_RANKS,
    COACH_RARITIES,
    CONDITION_MAX,
    CONDITION_FIRE_HIT,
    DOMAIN_TEACH_POOLS,
    TEACH_BREADTH_BY_RARITY,
    LEGENDARY_EXCLUSIVE_SESSIONS,
    MARKET_MIN_TIER,
    marketCandidatesForTier,
    pickPortraitKey,
    portraitFields,
    MARKET_MAX_PER_DOMAIN,
    MARKET_NAME_REDRAW_TRIES,
    MARKET_RARITY_ODDS,
    MORALE_START,
    MORALE_FIRE_HIT_OTHERS,
    RARITY_GATES,
    TRAIT_KEYS,
    effectiveTier,
    homeCampWeekIndex,
    homeCampWeekStart,
    homeCampWeekEnd,
    rarityEconomics,
    traitDef,
    traitView,
} = require("../consts/homeCampConfig");

const { campError } = coachService;

const DAY_MS = 86_400_000;

/** Coach names live in data/coachNames.json, loaded once (same pattern as opponentNames). */
let NAME_POOL = { firstNames: [], lastNames: [] };
try {
    const raw = require("../data/coachNames.json");
    NAME_POOL = {
        firstNames: Array.isArray(raw.firstNames) ? raw.firstNames : [],
        lastNames: Array.isArray(raw.lastNames) ? raw.lastNames : [],
    };
} catch (e) {
    console.error("[homeCampMarket] could not load data/coachNames.json:", e.message);
}

// ── Discipline familiarity (Mixed field — markModified or it silently no-ops) ─

/**
 * What the bank for `domain` is worth on a hire, WITHOUT spending it. Pure.
 *
 * Capped at RANK 2's requirements: the reward for years at another gym is ONE free rank on the
 * new coach, never an instant Rank 4. A migrated veteran gets a head start, not a shortcut past
 * the whole ladder.
 *
 * @returns {{sessions:number, wins:number}|null} null when there is nothing banked.
 */
function previewDisciplineFamiliarity(camp, domain) {
    const bank = camp && camp.disciplineFamiliarity;
    if (!bank || typeof bank !== "object") return null;
    if (!Object.prototype.hasOwnProperty.call(bank, domain)) return null;
    const fam = bank[domain];
    if (!fam) return null;
    const cap = COACH_RANKS[2];
    const sessions = Math.min(Math.max(0, Number(fam.bankedSessions) || 0), cap.sessions);
    const wins = Math.min(Math.max(0, Number(fam.bankedWins) || 0), cap.wins);
    if (sessions <= 0 && wins <= 0) return null;
    return { sessions, wins };
}

/**
 * Spend the bank for `domain`. MUTATES the camp doc; the CALLER saves.
 *
 * ⚠️ `disciplineFamiliarity` is a Mixed field: without markModified, mongoose does not notice
 * the change and the save is a silent no-op — the player would get the credit forever, once
 * per hire.
 *
 * @returns {{sessions:number, wins:number}|null} the credit applied.
 */
function consumeDisciplineFamiliarity(camp, domain) {
    const applied = previewDisciplineFamiliarity(camp, domain);
    const bank = camp && camp.disciplineFamiliarity;
    if (!bank || !Object.prototype.hasOwnProperty.call(bank, domain)) return applied;
    delete bank[domain];
    camp.markModified("disciplineFamiliarity");
    return applied;
}

/**
 * Bank a departing coach's experience so his replacement in the same discipline starts warm.
 * Used on a FIRE and on a QUIT, for a coach at rank >= 3 only.
 *
 * NEVER LOWERS: the stored value is max(existing, rank-2 requirements), so banking twice or
 * banking after a bigger deposit cannot cost the player anything.
 *
 * MUTATES + markModified; the CALLER saves.
 */
function bankDisciplineFamiliarity(camp, domain) {
    if (!camp.disciplineFamiliarity || typeof camp.disciplineFamiliarity !== "object") {
        camp.disciplineFamiliarity = {};
    }
    const cur = (Object.prototype.hasOwnProperty.call(camp.disciplineFamiliarity, domain)
        && camp.disciplineFamiliarity[domain]) || { bankedSessions: 0, bankedWins: 0 };
    const cap = COACH_RANKS[2];
    const banked = {
        bankedSessions: Math.max(Number(cur.bankedSessions) || 0, cap.sessions),
        bankedWins: Math.max(Number(cur.bankedWins) || 0, cap.wins),
    };
    camp.disciplineFamiliarity[domain] = banked;
    camp.markModified("disciplineFamiliarity");
    return { domain, sessions: banked.bankedSessions, wins: banked.bankedWins };
}

// ── Candidate generation ─────────────────────────────────────────────────────

/** The fame tier the player has EVER reached. peakTier never demotes — see the gate below. */
function peakFameTier(fighter) {
    return (fighter && fighter.notoriety && fighter.notoriety.peakTier) || "UNKNOWN";
}

/**
 * Which rarities may appear for this camp+fighter.
 *
 * LEGENDARY is DUAL-gated (camp tier 4 AND Rising Star fame) and gates on `peakTier`, not the
 * live tier: a fighter who once was a Rising Star shouldn't watch Legendary coaches vanish
 * because fame decayed while they were away. Same field sponsorships gate on.
 */
function eligibleRarities(tier, fighter) {
    const fameRank = notorietyConfig.tierRank(peakFameTier(fighter));
    return COACH_RARITIES.filter((r) => {
        const g = RARITY_GATES[r];
        if (!g) return false;
        if (tier < g.minTier) return false;
        if (g.minFameTier && fameRank < notorietyConfig.tierRank(g.minFameTier)) return false;
        return true;
    });
}

/**
 * Weighted pick over the ELIGIBLE rarities, renormalised.
 *
 * The 3% Legendary slice is never folded into Common for a player who can't roll one — the
 * weights are renormalised over what remains, so an Amateur's odds are 55/30 → 64.7/35.3.
 * Folding it down would quietly make low-tier players' markets worse than the table says.
 */
function pickRarity(rng, rarities) {
    const total = rarities.reduce((s, r) => s + (MARKET_RARITY_ODDS[r] || 0), 0);
    if (total <= 0) return rarities[0] || "COMMON";
    let roll = rng() * total;
    for (const r of rarities) {
        roll -= MARKET_RARITY_ODDS[r] || 0;
        if (roll < 0) return r;
    }
    return rarities[rarities.length - 1];
}

/** Seeded name draw, avoiding names already in the camp or already drawn this week. */
function drawName(rng, taken) {
    const { firstNames, lastNames } = NAME_POOL;
    if (firstNames.length === 0 || lastNames.length === 0) return "Nameless Coach";
    let name = null;
    for (let i = 0; i < MARKET_NAME_REDRAW_TRIES; i++) {
        const candidate = `${firstNames[Math.floor(rng() * firstNames.length)]} ${lastNames[Math.floor(rng() * lastNames.length)]}`;
        name = candidate;
        if (!taken.has(candidate)) break;
    }
    return name;
}

/**
 * Build ONE market candidate as a plain object shaped exactly like a roster coach.
 *
 * The same coachSchema is used for candidates and coaches, so a hire MOVES this subdoc across
 * unchanged (keeping its _id, hence candidateId === coachId). Wage and hire fee are frozen
 * HERE, at generation, from (rarity × trait) alone — no jitter, ever. That is what makes the
 * price on the card the price in the debit.
 *
 * @param {() => number} rng   the week's single seeded stream (draw order is fixed)
 * @param {{domain:string, rarity:string, taken:Set<string>, takenPortraits?:Set<string>,
 *          portraitRng?:() => number}} opts
 */
function generateCandidate(rng, { domain, rarity, taken, takenPortraits, portraitRng }) {
    const econ = rarityEconomics(rarity);
    const name = drawName(rng, taken);

    // Trait: uniform over all 12. A "bad" trait is a price signal, not a punishment — the
    // player sees it on the card before paying.
    const traitKey = TRAIT_KEYS[Math.floor(rng() * TRAIT_KEYS.length)] || null;
    const trait = traitDef(traitKey);

    const wage = Math.round(econ.wage * (trait && trait.wageMult ? trait.wageMult : 1));
    const hireFee = Math.round(econ.hireFee * (trait && trait.hireMult ? trait.hireMult : 1));

    return {
        archetype: domain,
        name,
        initials: coachService.initialsFor(name),
        rarity,
        traitKey,
        wage,
        hireFee,
        isStarter: false,
        hiredAt: new Date(),      // overwritten at hire; meaningless while on the market
        rank: 1,
        joinedAtRank: 1,          // every market hire starts at 1 — all later ranks are paid for
        // Drawn from the SAME seeded rng as the rest of the candidate, so a market re-read
        // rebuilds the identical face rather than reshuffling it under the player.
        portraitKey: pickPortraitKey(domain, portraitRng || rng, takenPortraits),

        sessionsCompleted: 0,
        relevantWins: 0,
        morale: MORALE_START,
        lastSessionAt: null,
        // Stored, NOT advertised on the hire card — Phase 2 builds the actual session.
        exclusiveSessionKey: rarity === "LEGENDARY" ? (LEGENDARY_EXCLUSIVE_SESSIONS[domain] || null) : null,
        teachPoolMoveIds: (DOMAIN_TEACH_POOLS[domain] || []).slice(0, TEACH_BREADTH_BY_RARITY[rarity] ?? 1),
        taughtMoveIds: [],
    };
}

/**
 * Roll a week's candidates. DETERMINISTIC for a given (campId, weekIndex): one seeded stream,
 * one FIXED draw order (domain → rarity → name → trait, per candidate). Changing that order
 * reshuffles every player's market retroactively, so don't.
 *
 * COMPOSITION RULES:
 *   · count            = 3, +1 while a Well-Connected coach is on the roster
 *   · the FIRST slot   prefers a discipline the player does NOT yet employ, so the market
 *                       always offers a way to broaden rather than three of what you have
 *   · at most 2 per discipline overall
 *   · only disciplines whose minCampTier the camp has reached (Conditioning needs Tier 2)
 *
 * @returns {object[]} plain candidate objects, ready to assign to market.candidates
 */
function rollCandidates(camp, fighter, weekIndex, tier, excludePortraits) {
    const rng = mulberry32(hashSeed(`${camp._id}:${weekIndex}`));
    // SEPARATE STREAM FOR PORTRAITS, deliberately. Picking a face redraws a variable number of
    // times to dodge a collision, and every one of those draws would otherwise advance the
    // shared stream — so adding one coach to the roster would shift the NAMES and TRAITS of
    // every candidate after it. The fixed draw order that keeps a week's market stable is
    // documented above; a variable-length consumer has to sit outside it.
    const portraitRng = mulberry32(hashSeed(`${camp._id}:${weekIndex}:portrait`));

    const roster = camp.coaches || [];
    const hasWellConnected = roster.some((c) => {
        const t = traitDef(c.traitKey);
        return !!(t && t.marketCandidateBonus);
    });
    const n = marketCandidatesForTier(tier) + (hasWellConnected ? 1 : 0);

    const eligibleDomains = ARCHETYPE_KEYS.filter(
        (a) => ((COACH_ARCHETYPES[a] || {}).minCampTier ?? 1) <= tier
    );
    const rosterDomains = new Set(roster.map((c) => c.archetype));
    const unfilled = eligibleDomains.filter((d) => !rosterDomains.has(d));

    const rarities = eligibleRarities(tier, fighter);
    const taken = new Set(roster.map((c) => c.name));
    // Faces already on screen. Seeded with the ROSTER, not just the board, because the market
    // modal opens over the camp — the player sees the 4 roster tiles and the 6 hire cards at
    // the same time, so a candidate wearing a current coach's face reads as a bug.
    //
    // `excludePortraits` carries the faces of cards ALREADY on the board when this is called to
    // top a slate up mid-week. Without it the top-up filters on name alone and can deal a
    // second card wearing a face that is sitting two cards to its left.
    const takenPortraits = new Set([
        ...roster.map((c) => c.portraitKey),
        ...(excludePortraits || []),
    ].filter(Boolean));
    const perDomain = {};
    const out = [];

    for (let i = 0; i < n; i++) {
        const pool = (i === 0 && unfilled.length > 0)
            ? unfilled
            : eligibleDomains.filter((d) => (perDomain[d] || 0) < MARKET_MAX_PER_DOMAIN);
        if (pool.length === 0) break;   // every discipline capped — can't happen at 4×2 vs n<=4

        const domain = pool[Math.floor(rng() * pool.length)];
        perDomain[domain] = (perDomain[domain] || 0) + 1;

        const rarity = pickRarity(rng, rarities);
        const candidate = generateCandidate(rng, { domain, rarity, taken, takenPortraits, portraitRng });
        taken.add(candidate.name);
        if (candidate.portraitKey) takenPortraits.add(candidate.portraitKey);
        out.push(candidate);
    }

    return out;
}

// ── Views ────────────────────────────────────────────────────────────────────

const titleCase = (s) => String(s || "").charAt(0) + String(s || "").slice(1).toLowerCase();

/** "Teaches 3 moves, all at Rare" — one honest line about what this coach is FOR. */
function teachBreadthLabel(teaches) {
    if (!teaches || teaches.length === 0) return "Teaches no moves";
    const rarities = [...new Set(teaches.map((t) => titleCase(t.rarity)))];
    if (teaches.length === 1) return `Teaches 1 move (${rarities[0]})`;
    if (rarities.length === 1) return `Teaches ${teaches.length} moves, all at ${rarities[0]}`;
    return `Teaches ${teaches.length} moves (${rarities.join(" / ")})`;
}

/**
 * The candidate's full visible teach pool — the SAME derivation a hired coach gets.
 *
 * ⚠️ DO NOT flatten every entry to state:"locked". It reads as a reasonable simplification
 * ("he teaches you nothing yet"), but it destroys the only signal that distinguishes the move
 * he is actually working toward from the ones behind it, and the UI ends up telling a rank-1
 * coach to "reach Rank 1 first". A rank-1 candidate's first pool move is `next` at rankReq 2 —
 * i.e. "unlocks at Rank 2" — and everything after it is genuinely locked.
 *
 * Using the same builder also guarantees the hire card and the coach panel can never disagree:
 * what you were shown before paying is what you own afterwards.
 */
function candidateTeachList(candidate) {
    return coachService.buildTeachList(candidate);
}

/**
 * ADVISORY blocked reason for a hire card. The hire endpoint is the authority — this exists so
 * the button can explain itself before the player clicks, in the SAME precedence order the
 * endpoint validates in, so the card and the error can never disagree.
 */
function candidateBlock(candidate, { unlocked, filled, rosterDomains, cash }) {
    if (filled >= unlocked) {
        return { reason: "no_slot", label: `All ${unlocked} coach slot${unlocked === 1 ? "" : "s"} are full` };
    }
    if (rosterDomains.has(candidate.archetype)) {
        const label = (COACH_ARCHETYPES[candidate.archetype] || {}).label || candidate.archetype;
        return { reason: "archetype_taken", label: `You already employ a ${label}` };
    }
    if (cash < (candidate.hireFee || 0)) {
        return { reason: "insufficient_cash", label: `You have $${cash.toLocaleString("en-US")} of $${(candidate.hireFee || 0).toLocaleString("en-US")}` };
    }
    return { reason: null, label: null };
}

/** One candidate card. Every number here is the number the hire endpoint will use. */
function buildCandidateView(candidate, fighter, camp, ctx) {
    const archetype = COACH_ARCHETYPES[candidate.archetype] || COACH_ARCHETYPES.STRIKING;
    const econ = rarityEconomics(candidate.rarity);
    const teaches = candidateTeachList(candidate);
    const block = candidateBlock(candidate, ctx);

    return {
        candidateId: String(candidate._id),
        name: candidate.name,
        initials: candidate.initials,
        // Same face the coach will wear once hired — `portraitKey` is stamped at generation and
        // the subdoc moves across on hire, so the hire card and the roster tile always match.
        ...portraitFields(candidate),
        rarity: candidate.rarity,
        archetype: candidate.archetype,
        archetypeLabel: archetype.label,
        trait: traitView(candidate.traitKey),
        // *Base = the pre-trait price, so the UI can strike through a Journeyman's discount.
        hireFee: candidate.hireFee || 0,
        hireFeeBase: econ.hireFee,
        wage: candidate.wage || 0,
        wageBase: econ.wage,
        teaches,
        teachBreadthLabel: teachBreadthLabel(teaches),
        // Rank-1 kit; ranks 2/3 render locked. TRAIT-ADJUSTED by the same single home the
        // roster cards and the resolver use — a Night Owl's flagship advertises its real cost.
        drills: coachService.buildDrillViews(candidate, ctx.blocks),
        familiarityPreview: previewDisciplineFamiliarity(camp, candidate.archetype),
        canHire: block.reason === null,
        blockedReason: block.reason,
        blockedLabel: block.label,
    };
}

// ── GET /market ──────────────────────────────────────────────────────────────

/**
 * The market screen. Rolls the week LAZILY on read — there is no market job.
 *
 * This is the ONE read in the whole feature allowed to write the camp, and it may only ever
 * write when the stored week is stale. See invariant 1 at the top of this file.
 *
 * @returns {Promise<{market:object}>}
 */
async function getMarketState(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await homeCampService.ensureCamp(fighter);
    const tier = effectiveTier(camp, fighter);
    if (tier < MARKET_MIN_TIER) {
        throw campError("market_locked", "Renovate your camp to open the Trainer Market", 403, {
            requiredTier: MARKET_MIN_TIER,
            currentTier: tier,
        });
    }

    const wk = homeCampWeekIndex();
    if (camp.market.weekIndex !== wk) {
        // Carry LAST week's faces into the new roll so no coach's face comes back the very
        // next Monday — the freshest memory a player has, and the only recurrence they have a
        // real chance of catching.
        //
        // ⚠️ THIS READ MUST HAPPEN BEFORE THE ASSIGNMENT ON THE NEXT LINE, which overwrites
        // the very array being read. That ordering is the whole trick: it means a one-week
        // exclusion needs NO new field, NO migration and NO extra mutable state — the previous
        // board is already sitting on the doc at exactly this moment. A longer window would
        // have to persist its own history, which is why it stops being free.
        //
        // Empty on a camp's first ever roll, which degrades to the old behaviour by itself.
        const lastWeekFaces = (camp.market.candidates || []).map((c) => c.portraitKey);
        camp.market.candidates = rollCandidates(camp, fighter, wk, tier, lastWeekFaces);
        camp.market.weekIndex = wk;
        await camp.save();
    } else {
        // ── TOP-UP ──────────────────────────────────────────────────────────────────────
        // The slate only re-rolls on a week boundary, so a camp that already rolled THIS
        // week keeps whatever it got — which means a change to the market size (or a
        // renovation raising the tier mid-week) would be invisible to every existing camp
        // until the next Monday. Top the slate up in place instead.
        //
        // ADDITIVE, NEVER A RE-ROLL: the cards already on the board are untouched, so a
        // player mid-decision never loses the candidate they were saving for. Only the
        // shortfall is generated, and only names not already on the board are kept.
        const want = marketCandidatesForTier(tier)
            + ((camp.coaches || []).some((c) => { const t = traitDef(c.traitKey); return !!(t && t.marketCandidateBonus); }) ? 1 : 0);
        const have = (camp.market.candidates || []).length;
        if (have < want) {
            const existing = new Set((camp.market.candidates || []).map((c) => c.name));
            // Exclude the faces already dealt, not just the names. A top-up runs with a
            // different `n` (and possibly a wider domain pool) than the roll that produced the
            // stored board, so the two sequences diverge — filtering on name alone would let a
            // topped-up card wear a face already sitting on the same board.
            const onBoard = (camp.market.candidates || []).map((c) => c.portraitKey);
            const extra = rollCandidates(camp, fighter, wk, tier, onBoard)
                .filter((c) => !existing.has(c.name))
                .slice(0, want - have);
            if (extra.length > 0) {
                camp.market.candidates.push(...extra);
                await camp.save();
            }
        }
    }

    const tierCfg = CAMP_TIERS[tier] || CAMP_TIERS[1];
    const now = Date.now();
    const resetsAt = homeCampWeekEnd(wk);

    const ctx = {
        unlocked: tierCfg.slots,
        filled: (camp.coaches || []).length,
        rosterDomains: new Set((camp.coaches || []).map((c) => c.archetype)),
        cash: fighter.iron ?? 0,
        blocks: homeCampService.resolveInjuryBlocks(fighter),
    };

    const candidates = (camp.market.candidates || []).map((c) => buildCandidateView(c, fighter, camp, ctx));

    return {
        market: {
            open: true,
            weekIndex: wk,
            resetsAt: resetsAt.toISOString(),
            resetsInDays: Math.max(0, Math.ceil((resetsAt.getTime() - now) / DAY_MS)),
            candidateCount: candidates.length,
            slots: { unlocked: ctx.unlocked, filled: ctx.filled, free: Math.max(0, ctx.unlocked - ctx.filled) },
            cash: fighter.iron ?? 0,
            candidates,
        },
    };
}

// ── POST /market/:candidateId/hire ───────────────────────────────────────────

/**
 * Hire a candidate.
 *
 * ORDER OF OPERATIONS IS THE WHOLE DESIGN (mirrors coachService.attemptPromotion):
 *   1. validate everything, in the contract's error order
 *   2. MUTEX — one conditional updateOne moves the subdoc from `market.candidates` to
 *      `coaches`, conditioned on the week still matching, the candidate still being there and
 *      a slot still being free. Lose the race → 404 candidate_not_found, and NOTHING is charged.
 *   3. CHARGE — only after the mutex is won, re-checking cash inside the mutation. If the
 *      payment fails, step 2 is REVERSED, so a failed payment can never leave a free coach.
 *
 * @returns {Promise<{hire:object, fighter:object, camp:object}>} caller builds CampState
 */
async function hireCandidate(fighterId, candidateId) {
    if (typeof candidateId !== "string" || candidateId.trim().length === 0) {
        throw campError("candidate_not_found", "That candidate is no longer available", 404);
    }

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    const tier = effectiveTier(camp, fighter);
    if (tier < MARKET_MIN_TIER) {
        throw campError("market_locked", "Renovate your camp to open the Trainer Market", 403, {
            requiredTier: MARKET_MIN_TIER,
            currentTier: tier,
        });
    }

    // The week rolled over between the player opening the market and clicking hire.
    const wk = homeCampWeekIndex();
    if (camp.market.weekIndex !== wk) {
        throw campError("candidate_expired", "This week's candidates have moved on", 400);
    }

    let candidate = null;
    try {
        candidate = camp.market.candidates.id(candidateId);
    } catch (_) {
        candidate = null;   // malformed ObjectId is a 404, never a 500
    }
    if (!candidate) throw campError("candidate_not_found", "That candidate is no longer available", 404);

    const now = new Date();
    const tierCfg = CAMP_TIERS[tier] || CAMP_TIERS[1];
    const unlocked = tierCfg.slots;
    const filled = (camp.coaches || []).length;
    if (filled >= unlocked) {
        throw campError("no_slot", "Every coach slot is full", 400, { unlocked, filled });
    }

    if ((camp.coaches || []).some((c) => c.archetype === candidate.archetype)) {
        throw campError("archetype_taken", "You already employ a coach in that discipline", 400, {
            archetype: candidate.archetype,
        });
    }

    const minCampTier = (COACH_ARCHETYPES[candidate.archetype] || {}).minCampTier ?? 1;
    if (minCampTier > tier) {
        throw campError("archetype_locked", "Your camp isn't ready for that discipline yet", 400, {
            archetype: candidate.archetype,
            minCampTier,
        });
    }

    const cost = Number(candidate.hireFee) || 0;
    const have = fighter.iron ?? 0;
    if (have < cost) {
        throw campError("insufficient_cash", "Not enough cash to sign this coach", 400, { cost, have });
    }

    // Credit computed BEFORE the mutex so it can ride the pushed subdoc in one write. The bank
    // is only cleared after the hire commits (below) — if the process dies in between the
    // player keeps the bank, which errs in the player's favour.
    const familiarityApplied = previewDisciplineFamiliarity(camp, candidate.archetype);

    // Kept verbatim so a failed payment can restore the candidate EXACTLY as it was listed,
    // rather than putting a coach back on the market carrying hire-time overrides.
    const candidateSnapshot = typeof candidate.toObject === "function" ? candidate.toObject() : { ...candidate };

    const hiredDoc = {
        ...candidateSnapshot,
        isStarter: false,
        hiredAt: now,
        morale: MORALE_START,
        rank: 1,
        joinedAtRank: 1,          // see above — the hire baseline is always 1

        lastSessionAt: null,
        sessionsCompleted: familiarityApplied ? familiarityApplied.sessions : 0,
        relevantWins: familiarityApplied ? familiarityApplied.wins : 0,
    };

    // ── MUTEX: move the subdoc across in ONE conditional write. ──
    // $expr re-checks the slot count server-side, so two simultaneous hires into one free slot
    // produce exactly one 200 and exactly one charge.
    const res = await HomeCamp.updateOne(
        {
            _id: camp._id,
            "market.weekIndex": wk,
            "market.candidates._id": candidate._id,
            $expr: { $lt: [{ $size: "$coaches" }, unlocked] },
        },
        {
            $pull: { "market.candidates": { _id: candidate._id } },
            $push: { coaches: hiredDoc },
        }
    );

    if (res.modifiedCount !== 1) {
        // Lost the race (or the week/slot state changed under us). Re-read and report the
        // truth using contract codes only. NEVER charge.
        //
        // IDENTITY BEFORE CAPACITY (contract §3.3 error order, and the same shape fireCoach
        // uses): when the winner of a double-click took the LAST free slot, both conditions
        // are true at once — the candidate is gone AND the roster is full. Answering "no_slot"
        // there is a lie about a specific coach the player is still looking at, and it sends
        // the UI down a "renovate for more space" path when the real answer is "somebody
        // already signed him". Only fall back to capacity when the candidate is genuinely
        // still on the board.
        const fresh = await HomeCamp.findOne({ _id: camp._id });
        const stillListed = !!fresh
            && fresh.market
            && fresh.market.weekIndex === wk
            && !!fresh.market.candidates.id(candidate._id);
        if (!stillListed) {
            throw campError("candidate_not_found", "That candidate is no longer available", 404);
        }
        if ((fresh.coaches || []).length >= unlocked) {
            throw campError("no_slot", "Every coach slot is full", 400, {
                unlocked, filled: (fresh.coaches || []).length,
            });
        }
        throw campError("candidate_not_found", "That candidate is no longer available", 404);
    }

    // ── CHARGE (the mutex is won; the coach is already on the roster). ──
    let cashAfter = have - cost;
    try {
        const saved = await saveWithVersionRetry(
            () => Fighter.findById(fighterId),
            (doc) => {
                // Re-checked on the freshly loaded doc — this, not the check above, is the
                // actual guard against spending cash the player no longer has.
                if ((doc.iron ?? 0) < cost) {
                    throw campError("insufficient_cash", "Not enough cash to sign this coach", 400, {
                        cost, have: doc.iron ?? 0,
                    });
                }
                doc.iron = (doc.iron ?? 0) - cost;
            }
        );
        cashAfter = saved ? (saved.iron ?? 0) : cashAfter;
    } catch (err) {
        // REVERSE the mutex — a failed payment must never leave a free coach behind.
        await HomeCamp.updateOne(
            { _id: camp._id, "coaches._id": candidate._id },
            {
                $pull: { coaches: { _id: candidate._id } },
                $push: { "market.candidates": candidateSnapshot },
            }
        ).catch((e) => console.error("[homeCampMarket] hire rollback FAILED:", e.message));
        throw err;
    }

    // Spend the familiarity bank now that the hire has committed. Non-fatal: the coach is
    // hired and already carries the credit; losing the delete only means the next hire in this
    // discipline gets the same head start, which is not worth failing a committed action over.
    if (familiarityApplied) {
        try {
            const fresh = await HomeCamp.findOne({ _id: camp._id });
            if (fresh) {
                consumeDisciplineFamiliarity(fresh, candidate.archetype);
                await fresh.save();
            }
        } catch (e) {
            console.error("[homeCampMarket] familiarity consume failed (credit already granted):", e.message);
        }
    }

    const freshFighter = await Fighter.findById(fighterId);
    const freshCamp = await HomeCamp.findOne({ _id: camp._id });
    const hired = freshCamp.coaches.id(candidate._id);

    let message = `${hiredDoc.name} joined your camp for $${cost.toLocaleString("en-US")}.`;
    if (hiredDoc.wage > 0) message += ` Wages are $${hiredDoc.wage.toLocaleString("en-US")}/week.`;
    if (familiarityApplied) {
        message += ` His discipline credit carried over: ${familiarityApplied.sessions} sessions, ${familiarityApplied.wins} wins.`;
    }

    return {
        hire: {
            // candidateId === coachId by design — the subdoc keeps its _id across the move,
            // so the UI's selection survives the hire.
            coachId: String(hired ? hired._id : candidate._id),
            name: hiredDoc.name,
            archetype: hiredDoc.archetype,
            rarity: hiredDoc.rarity,
            feePaid: cost,
            wage: hiredDoc.wage || 0,
            cashAfter,
            familiarityApplied,
            message,
        },
        fighter: freshFighter,
        camp: freshCamp,
    };
}

// ── DELETE /coaches/:coachId ─────────────────────────────────────────────────

/**
 * Fire a coach. Free in cash, expensive in everything else.
 *
 * TWO STEPS, and the split is deliberate:
 *   STEP 1 (ATOMIC, must succeed) carries the MUTEX and every EXPLOIT-RELEVANT cost —
 *          removal and −15 condition — in one conditional updateOne
 *          guarded by `$expr size > 1`, which is what makes "the camp can never be coachless"
 *          true even under a double-click.
 *   STEP 2 (NON-FATAL) applies the social costs: −10 morale to the coaches who stayed, and
 *          the discipline bank for a rank-3+ departure. If this fails we log and continue —
 *          the firing already happened, and refusing to report it would be a lie.
 *
 * Condition is written with $set of a PRE-CLAMPED value rather than $inc, accepting a
 * worst-case lost update under simultaneous fires: $inc cannot clamp at 0 and would happily
 * drive condition negative.
 *
 * @returns {Promise<{fired:object, fighter:object, camp:object}>} caller builds CampState
 */
async function fireCoach(fighterId, coachId) {
    if (typeof coachId !== "string" || coachId.trim().length === 0) {
        throw campError("coach_not_found", "Coach not found", 404);
    }

    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw campError("fighter_not_found", "Fighter not found", 404);

    const camp = await HomeCamp.findOne({ fighterId: fighter._id });
    if (!camp) throw campError("camp_not_found", "Camp not found", 404);

    let coach = null;
    try {
        coach = camp.coaches.id(coachId);
    } catch (_) {
        coach = null;
    }
    if (!coach) throw campError("coach_not_found", "Coach not found", 404);

    if ((camp.coaches || []).length <= 1) {
        throw campError("last_coach", "Your camp can never be without a coach.", 400);
    }

    const now = new Date();
    const conditionBefore = Number(camp.condition?.value ?? CONDITION_MAX);
    const conditionAfter = Math.max(0, Math.min(CONDITION_MAX, conditionBefore + CONDITION_FIRE_HIT));
    const firedSnapshot = {
        coachId: String(coach._id),
        name: coach.name,
        rank: Number(coach.rank) || 1,
        archetype: coach.archetype,
        rarity: coach.rarity,
    };

    // ── STEP 1: mutex + the costs that must not be dodgeable. ──
    const res = await HomeCamp.updateOne(
        {
            _id: camp._id,
            "coaches._id": coach._id,
            $expr: { $gt: [{ $size: "$coaches" }, 1] },
        },
        {
            $pull: { coaches: { _id: coach._id } },
            $set: {
                "condition.value": conditionAfter,
            },
        }
    );

    if (res.modifiedCount !== 1) {
        const fresh = await HomeCamp.findOne({ _id: camp._id });
        const stillThere = fresh && fresh.coaches.id(coachId);
        if (stillThere && (fresh.coaches || []).length <= 1) {
            throw campError("last_coach", "Your camp can never be without a coach.", 400);
        }
        throw campError("coach_not_found", "Coach not found", 404);
    }

    // ── STEP 2: social costs. NON-FATAL by design (see the docblock). ──
    let moraleHitTo = [];
    let familiarityBanked = null;
    try {
        const fresh = await HomeCamp.findOne({ _id: camp._id });
        if (fresh) {
            // A Locker-Room Leader in the room absorbs the fallout for EVERYONE — that is
            // exactly what his chip promises ("they don't take the hit when you fire someone").
            const hasLockerRoomLeader = (fresh.coaches || []).some((c) => {
                const t = traitDef(c.traitKey);
                return !!(t && t.immuneToFiringMorale);
            });

            if (!hasLockerRoomLeader) {
                for (const c of fresh.coaches || []) {
                    const t = traitDef(c.traitKey);
                    const floor = t && t.moraleFloor ? t.moraleFloor : 0;
                    const before = Number(c.morale ?? MORALE_START);
                    const after = Math.max(floor, before + MORALE_FIRE_HIT_OTHERS);
                    if (after !== before) {
                        c.morale = after;
                        moraleHitTo.push(String(c._id));
                    }
                }
            }

            // A Head Coach (rank 3+) leaves knowledge behind — his replacement in the same
            // discipline starts warm rather than from zero.
            if (firedSnapshot.rank >= 3) {
                familiarityBanked = bankDisciplineFamiliarity(fresh, firedSnapshot.archetype);
            }

            await fresh.save();
        }
    } catch (e) {
        moraleHitTo = [];
        console.error("[homeCampMarket] fire step 2 (morale/familiarity) failed:", e.message);
    }

    const freshCamp = await HomeCamp.findOne({ _id: camp._id });

    let message = `${firedSnapshot.name} has been let go.`;
    if (conditionAfter !== conditionBefore) message += ` Camp condition ${conditionBefore} → ${conditionAfter}.`;
    if (moraleHitTo.length > 0) message += ` The room took it badly (${MORALE_FIRE_HIT_OTHERS} morale).`;
    if (familiarityBanked) message += ` His discipline experience stays banked for his replacement.`;

    return {
        fired: {
            ...firedSnapshot,
            moraleHitTo,
            moraleHit: MORALE_FIRE_HIT_OTHERS,
            conditionBefore,
            conditionAfter,
            familiarityBanked: familiarityBanked
                ? { domain: familiarityBanked.domain, sessions: familiarityBanked.sessions, wins: familiarityBanked.wins }
                : null,
            message,
        },
        fighter,
        camp: freshCamp,
    };
}

module.exports = {
    // week index — the market service is its public home (the pure math lives in the config
    // next to the constants that define it, so the weekly tick can read it without a cycle).
    homeCampWeekIndex,
    homeCampWeekStart,
    homeCampWeekEnd,
    getMarketState,
    hireCandidate,
    fireCoach,
    rollCandidates,
    generateCandidate,
    eligibleRarities,
    bankDisciplineFamiliarity,
    consumeDisciplineFamiliarity,
    previewDisciplineFamiliarity,
    // exported for tests
    teachBreadthLabel,
    pickRarity,
};
