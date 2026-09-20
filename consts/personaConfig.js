/**
 * Persona system — configuration tables ONLY. ZERO math lives here.
 *
 * The Persona is a fighter's public identity, modeled as a point on two axes:
 *   x = Hated (−) ↔ Loved (+)
 *   y = Quiet (−) ↔ Loud  (+)
 *
 * Sign(x),Sign(y) determine an archetype QUADRANT; |x|+|y| drives HEAT (intensity).
 * All derivation (heat, archetype, scaling, breaking-character, decay) is done in
 * services/personaService.js — this file is pure data so the numbers can be audited
 * and balanced in one place.
 *
 * PvE ONLY. Nothing here is ever consumed by the PvP path.
 */

// ── Axis labels (display) ──────────────────────────────────────────────────────
const AXES = {
    x: { negative: "Hated", positive: "Loved", label: "Reputation" },
    y: { negative: "Quiet", positive: "Loud", label: "Volume" },
};

// ── Archetype keys ─────────────────────────────────────────────────────────────
const ARCHETYPE = {
    UNWRITTEN: "UNWRITTEN",
    VILLAIN: "VILLAIN",           // Hated + Loud   (x<0, y>0)
    PEOPLES_CHAMP: "PEOPLES_CHAMP", // Loved + Loud (x>0, y>0)
    BOOGEYMAN: "BOOGEYMAN",       // Hated + Quiet  (x<0, y<0)
    ROLE_MODEL: "ROLE_MODEL",     // Loved + Quiet  (x>0, y<0)
};

/**
 * Archetype metadata. `signatureName` is the name of the ≥70-heat signature effect.
 * `epithet` is a flavor tag surfaced on the profile.
 */
const ARCHETYPES = {
    [ARCHETYPE.UNWRITTEN]: {
        key: ARCHETYPE.UNWRITTEN,
        label: "Unwritten",
        epithet: "Story yet to be told",
        signatureName: null,
    },
    [ARCHETYPE.VILLAIN]: {
        key: ARCHETYPE.VILLAIN,
        label: "The Villain",
        epithet: "Hated and loud",
        signatureName: "BAD BLOOD",
    },
    [ARCHETYPE.PEOPLES_CHAMP]: {
        key: ARCHETYPE.PEOPLES_CHAMP,
        label: "The People's Champ",
        epithet: "Loved and loud",
        signatureName: "HOMETOWN HERO",
    },
    [ARCHETYPE.BOOGEYMAN]: {
        key: ARCHETYPE.BOOGEYMAN,
        label: "The Boogeyman",
        epithet: "Feared and silent",
        signatureName: "AMBUSH",
    },
    [ARCHETYPE.ROLE_MODEL]: {
        key: ARCHETYPE.ROLE_MODEL,
        label: "The Role Model",
        epithet: "Loved and humble",
        signatureName: "LEGACY",
    },
};

/**
 * Quadrant that sign(x),sign(y) maps to. Keyed "sx|sy" where sx,sy ∈ {-1,0,1}.
 * Any entry touching a 0 axis is UNWRITTEN (no quadrant).
 */
const QUADRANT_BY_SIGN = {
    "1|1": ARCHETYPE.PEOPLES_CHAMP,
    "1|-1": ARCHETYPE.ROLE_MODEL,
    "-1|1": ARCHETYPE.VILLAIN,
    "-1|-1": ARCHETYPE.BOOGEYMAN,
};

/** Diagonal-opposite quadrant — the identity you break INTO to trigger Breaking Character. */
const DIAGONAL_OPPOSITE = {
    [ARCHETYPE.VILLAIN]: ARCHETYPE.ROLE_MODEL,
    [ARCHETYPE.ROLE_MODEL]: ARCHETYPE.VILLAIN,
    [ARCHETYPE.PEOPLES_CHAMP]: ARCHETYPE.BOOGEYMAN,
    [ARCHETYPE.BOOGEYMAN]: ARCHETYPE.PEOPLES_CHAMP,
};

// ── Fame categories ────────────────────────────────────────────────────────────
const FAME_CATEGORY = {
    BEEF: "BEEF",
    RESPECT: "RESPECT",
    CRYPTIC: "CRYPTIC",
    LOUD: "LOUD",
    DOCUMENTARY: "DOCUMENTARY",
    MILESTONE: "MILESTONE",
    BEEF_LAPSE: "BEEF_LAPSE",
    WEIGHT_MISS: "WEIGHT_MISS",
};

// ── Thresholds & constants ──────────────────────────────────────────────────────
const HEAT_SIGNATURE_THRESHOLD = 70; // heat at/above → signature active (also Type-C unlock)
const HEAT_MIN_ARCHETYPE = 25;       // below this → UNWRITTEN + heatFrac pre-gated to 0
const HEAT_BREAK_MIN = 40;           // minimum heat for a Breaking-Character event
const HEAT_CAP_PRE_REGIONAL = 50;    // effective-heat cap until Regional Pro (non-destructive)
const DECAY = 0.95;                  // per-fight x/y decay toward center
const BREAK_SHATTER = 0.6;           // axis multiplier applied after a Breaking-Character swing
const BREAK_NUDGE_MULT = 1.5;        // nudge multiplier on the defining Breaking-Character action
const ROLE_MODEL_SLOWBUILD = 0.75;   // nudge multiplier on Loved+Quiet (Role-Model-building) nudges

/** Promotion tier below which the pre-Regional heat cap applies (and the tier it lifts at). */
const HEAT_UNCAP_TIER = "Regional Pro";

// ── NUDGE table ─────────────────────────────────────────────────────────────────
// dx: +Loved / −Hated.  dy: +Loud / −Quiet.
// `quadrant` = the archetype this action DEFINES (drives Breaking-Character detection).
// `category` = the single canonical fame category (BEEF>CRYPTIC>RESPECT>LOUD precedence),
//              or null when the action carries no persona fame signal.
const NUDGES = {
    // Interview (post-fight)
    INTERVIEW_HUMBLE:    { dx: 6,  dy: -6, quadrant: ARCHETYPE.ROLE_MODEL,    category: FAME_CATEGORY.RESPECT },
    INTERVIEW_CONFIDENT: { dx: 6,  dy: 6,  quadrant: ARCHETYPE.PEOPLES_CHAMP, category: FAME_CATEGORY.LOUD },
    INTERVIEW_CALLOUT:   { dx: -8, dy: 8,  quadrant: ARCHETYPE.VILLAIN,       category: FAME_CATEGORY.BEEF },
    INTERVIEW_SKIPPED:   { dx: 0,  dy: 0,  quadrant: null,                    category: null },

    // Podcast segments
    PODCAST_RECAP:          { dx: 3,  dy: 3,  quadrant: null,                 category: null },
    PODCAST_BREAKDOWN:      { dx: 3,  dy: -5, quadrant: ARCHETYPE.BOOGEYMAN,  category: null },
    PODCAST_TRASH:          { dx: -9, dy: 7,  quadrant: ARCHETYPE.VILLAIN,    category: FAME_CATEGORY.BEEF },
    PODCAST_RESPECT:        { dx: 7,  dy: -5, quadrant: ARCHETYPE.ROLE_MODEL, category: FAME_CATEGORY.RESPECT },
    PODCAST_CRYPTIC:        { dx: -3, dy: -8, quadrant: ARCHETYPE.BOOGEYMAN,  category: FAME_CATEGORY.CRYPTIC },
    PODCAST_GUEST_BEEF:     { dx: -6, dy: 6,  quadrant: ARCHETYPE.VILLAIN,    category: FAME_CATEGORY.BEEF },
    PODCAST_GUEST_RESPECT:  { dx: 6,  dy: -4, quadrant: ARCHETYPE.ROLE_MODEL, category: FAME_CATEGORY.RESPECT },

    // Appearances
    APPEARANCE_MAGAZINE_COVER:       { dx: 4,  dy: 4,  quadrant: ARCHETYPE.PEOPLES_CHAMP, category: FAME_CATEGORY.LOUD },
    APPEARANCE_PODCAST_GUEST_BEEF:   { dx: -6, dy: 5,  quadrant: ARCHETYPE.VILLAIN,       category: FAME_CATEGORY.BEEF },
    APPEARANCE_PODCAST_GUEST_RESPECT:{ dx: 6,  dy: -5, quadrant: ARCHETYPE.ROLE_MODEL,    category: FAME_CATEGORY.RESPECT },
    APPEARANCE_UNDERCARD_FEATURE:    { dx: 0,  dy: 2,  quadrant: null,                    category: null },
    APPEARANCE_BRAND_DEAL_CLIP:      { dx: 2,  dy: 0,  quadrant: null,                    category: null },
    APPEARANCE_CHARITY_EXHIBITION:   { dx: 7,  dy: -6, quadrant: ARCHETYPE.ROLE_MODEL,    category: FAME_CATEGORY.RESPECT },
};

/**
 * Documentary nudge tables — the consumer SUMS the chosen focus + tone into one
 * {dx,dy} nudge with quadrant:null (documentary never triggers Breaking Character).
 */
const DOC_FOCUS_NUDGE = {
    FIGHTER:    { dx: 0,  dy: 5 },
    UNDERDOG:   { dx: 10, dy: -6 },
    TECHNICIAN: { dx: 4,  dy: -10 },
};
const DOC_TONE_NUDGE = {
    INSPIRATIONAL: { dx: 12, dy: 6 },
    RAW:           { dx: -6, dy: 10 },
    CONTROVERSIAL: { dx: -14, dy: 14 },
};

/**
 * Full-strength modifier tables per archetype.
 *
 * `kind`:
 *   A — additive fraction, scaled: applied = fullFrac × heatFrac
 *   B — multiplier,        scaled: applied = 1 + (fullMult − 1) × heatFrac
 *   C — binary unlock, NO fractional scale: full value only at heat ≥ 70
 *   SIG — signature effect, unlocks only when signatureActive (heat ≥ 70, not blackout)
 *
 * `lane` groups modifiers by where personaService surfaces them:
 *   fight     → getFightModifiers
 *   nonfight  → getModifiers
 *   fame      → applyFameMultiplier (keyed by fame category)
 *   signature → folded into getFightModifiers / applyFameMultiplier when active
 *
 * `cosmetic:true` modifiers are display-only (listeners) — never alter real rewards.
 */
const MODIFIERS = {
    [ARCHETYPE.VILLAIN]: {
        purseFrac:        { kind: "A", value: 0.15, lane: "fight", key: "purse", label: "Fight purse", good: true, desc: "The promotion pays for heat, so you earn a bigger purse on every fight." },
        calloutCostMult:  { kind: "B", value: 0.5,  lane: "nonfight", key: "calloutCost", label: "Callout cost", good: true, desc: "Beef is your business, so calling out rivals costs you less." },
        sponsorPayoutFrac:{ kind: "A", value: -0.35, lane: "nonfight", key: "sponsorPayout", label: "Sponsor payout", good: false, desc: "Brands keep their distance from the bad guy, so your sponsor payouts shrink." },
        listenersPct:     { kind: "A", value: 0.35, lane: "nonfight", key: "listeners", label: "Listeners", cosmetic: true, desc: "Everyone tunes in hoping you lose. Pure flavor, no gameplay effect." },
        fame: {
            [FAME_CATEGORY.BEEF]:       { kind: "B", value: 2.0 },
            [FAME_CATEGORY.RESPECT]:    { kind: "B", value: 0.5 },
            [FAME_CATEGORY.BEEF_LAPSE]: { kind: "B", value: 2.0 },
        },
        // BAD BLOOD: nemesis + active-beef fights → ×1.5 fame & +15% purse.
        signature: { fameMult: 1.5, purseFrac: 0.15 },
    },
    [ARCHETYPE.PEOPLES_CHAMP]: {
        purseFrac:          { kind: "A", value: 0.05, lane: "fight", key: "purse", label: "Fight purse", good: true, desc: "Fan favorites sell tickets, so you earn a bigger purse on every fight." },
        comebackBonusMult:  { kind: "A", value: 0.05, lane: "fight", key: "comebackBonus", label: "Comeback bonuses", good: true, desc: "Your comeback camp and special-move bonuses hit harder when you're down." },
        sponsorSlotBonus:   { kind: "C", value: 1,    lane: "nonfight", key: "sponsorSlot", label: "Sponsor slot", good: true, desc: "An extra sponsor contract slot. Unlocks at 70+ heat." },
        appearancePoolBonus:{ kind: "C", value: 1,    lane: "nonfight", key: "appearancePool", label: "Appearance offers", good: true, desc: "One extra appearance offer in every weekly rotation. Unlocks at 70+ heat." },
        listenersPct:       { kind: "A", value: 0.20, lane: "nonfight", key: "listeners", label: "Listeners", cosmetic: true, desc: "The people love their champ. Pure flavor, no gameplay effect." },
        // Upset-loss penalty: flat, applied in full when the persona is active.
        upsetLossFlatFame:  { value: -150 },
        fame: {
            [FAME_CATEGORY.BEEF]: { kind: "B", value: 0.5 },
        },
        // HOMETOWN HERO: comeback-mode WIN → +30% purse and +250 flat fame (folded into the
        // same additive purseFrac / flatFameDelta lanes as the other flats; no end-stage mult).
        signature: { comebackWinPurseFrac: 0.30, comebackWinFlatFame: 250 },
    },
    [ARCHETYPE.BOOGEYMAN]: {
        damageReductionFrac:{ kind: "A", value: 0.02, lane: "fight", key: "damageReduction", label: "Damage taken", good: true, invertDisplay: true, desc: "Opponents hesitate to engage, so you take less damage in the cage." },
        purseFrac:          { kind: "A", value: 0.08, lane: "fight", key: "purse", label: "Fight purse", good: true, desc: "Fear sells, so you earn a bigger purse on every fight." },
        sponsorPayoutFrac:  { kind: "A", value: -0.20, lane: "nonfight", key: "sponsorPayout", label: "Sponsor payout", good: false, desc: "Brands can't market the silence, so your sponsor payouts shrink." },
        listenersPct:       { kind: "A", value: -0.10, lane: "nonfight", key: "listeners", label: "Listeners", cosmetic: true, desc: "You don't talk, so fewer tune in. Pure flavor, no gameplay effect." },
        fame: {
            [FAME_CATEGORY.CRYPTIC]: { kind: "B", value: 1.5 },
            [FAME_CATEGORY.LOUD]:    { kind: "B", value: 0.5 },
        },
        // AMBUSH: equipped PROC moves → ×1.10 value at resolve site (scoped to a subset of
        // proc bonusTypes; see specialMovesService.scaleProcs).
        signature: { ambushProcMult: 1.10 },
    },
    [ARCHETYPE.ROLE_MODEL]: {
        sponsorPayoutFrac:{ kind: "A", value: 0.10,  lane: "nonfight", key: "sponsorPayout", label: "Sponsor payout", good: true, desc: "Brands love a clean image, so your sponsor payouts pay more." },
        // FIELD NAME IS HISTORICAL. It was written for gym rank-ups, but the only consumers now
        // are the camp: coach promotions (homeCampCoachService.promotionQuote) and camp
        // renovation (homeCampService). The gym consumers in gymRankService go dead with the
        // gyms. Renaming the field would touch five files for no behaviour change, so only the
        // player-facing `key`, `label` and `desc` were updated to say what it actually does.
        gymRankCostFrac:  { kind: "A", value: -0.10, lane: "nonfight", key: "campUpgradeCost", label: "Camp upgrade costs", good: true, desc: "Coaches want your name on their record, so promoting one costs you less. Renovating the camp does too." },
        hospitalBillFrac: { kind: "A", value: -0.15, lane: "nonfight", key: "hospitalBill", label: "Hospital bills", good: true, desc: "The right people take care of you, so hospital bills cost less." },
        fame: {
            [FAME_CATEGORY.BEEF_LAPSE]:  { kind: "B", value: 0.5 },
            [FAME_CATEGORY.WEIGHT_MISS]: { kind: "B", value: 0.5 },
        },
        // LEGACY: documentary fame ×1.5 & win-milestone fame ×1.5.
        signature: { documentaryFameMult: 1.5, milestoneFameMult: 1.5 },
    },
};

// Player-facing meta for fame-category modifier rows (label + what it does).
// `penalty: true` marks categories that are fame LOSSES — for those a multiplier
// BELOW 1 is the buff (it softens the hit) and above 1 is the debuff.
const FAME_MODIFIER_META = {
    [FAME_CATEGORY.BEEF]:        { label: "Beef fame",           desc: "Fame earned from trash talk, callouts, and beef actions." },
    [FAME_CATEGORY.RESPECT]:     { label: "Respect fame",        desc: "Fame earned from respectful, sportsmanlike actions." },
    [FAME_CATEGORY.CRYPTIC]:     { label: "Cryptic fame",        desc: "Fame earned from cryptic, menacing media appearances." },
    [FAME_CATEGORY.LOUD]:        { label: "Loud fame",           desc: "Fame earned from loud, showboating media appearances." },
    [FAME_CATEGORY.DOCUMENTARY]: { label: "Documentary fame",    desc: "Fame earned from documentaries." },
    [FAME_CATEGORY.MILESTONE]:   { label: "Milestone fame",      desc: "Fame earned from career win milestones." },
    [FAME_CATEGORY.BEEF_LAPSE]:  { label: "Beef-lapse penalty",  desc: "Fame lost when you let a beef fizzle out unanswered.", penalty: true },
    [FAME_CATEGORY.WEIGHT_MISS]: { label: "Weight-miss penalty", desc: "Fame lost when you miss weight.", penalty: true },
};

// Player-facing one-liner for each ≥70-heat signature effect.
const SIGNATURE_DESC = {
    [ARCHETYPE.VILLAIN]:       "BAD BLOOD — nemesis and beef fights pay ×1.5 fame and +15% purse.",
    [ARCHETYPE.PEOPLES_CHAMP]: "HOMETOWN HERO — comeback wins pay +30% purse and +250 fame.",
    [ARCHETYPE.BOOGEYMAN]:     "AMBUSH — your equipped proc moves trigger 10% stronger.",
    [ARCHETYPE.ROLE_MODEL]:    "LEGACY — documentary fame and win-milestone fame ×1.5.",
};

module.exports = {
    AXES,
    ARCHETYPE,
    ARCHETYPES,
    QUADRANT_BY_SIGN,
    DIAGONAL_OPPOSITE,
    FAME_CATEGORY,
    HEAT_SIGNATURE_THRESHOLD,
    HEAT_MIN_ARCHETYPE,
    HEAT_BREAK_MIN,
    HEAT_CAP_PRE_REGIONAL,
    HEAT_UNCAP_TIER,
    DECAY,
    BREAK_SHATTER,
    BREAK_NUDGE_MULT,
    ROLE_MODEL_SLOWBUILD,
    NUDGES,
    DOC_FOCUS_NUDGE,
    DOC_TONE_NUDGE,
    MODIFIERS,
    FAME_MODIFIER_META,
    SIGNATURE_DESC,
};
