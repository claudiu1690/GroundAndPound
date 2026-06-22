/**
 * GDD 8.9 – Injury system definitions.
 * severity: "minor" | "major"
 * cause:    "fight" | "sparring" | "ko_loss"
 * statEffects: signed values applied to fighter stats when injury is sustained (negative = penalty).
 *
 * Healing model:
 *   - Every injury heals on its own by ticking down recoveryHoursLeft once per hour
 *     until 0, then auto-clears. No injury is ever a permanent dead end.
 *   - Auto-heal injuries: pay iron at the Hospital to skip the wait (recoverySkipIron).
 *   - Doctor-required injuries: also heal over time, but a doctor visit (energy + iron)
 *     clears them instantly — the paid fast path. They still block fighting/sparring
 *     while active, so waiting them out has a real cost.
 *
 * Durations are tuned so the worst injury heals within 24 real hours, keeping the
 * game playable in a single session even after a rough loss.
 */
const INJURY_TYPES = {
    cut: {
        label: "Cut",
        severity: "minor",
        cause: "fight",
        effect: "Can't fight until it clears. Heals in 6 hours.",
        requiresDoctorVisit: true,
        cannotFight: true,
        recoveryHoursNeeded: 6,
        docVisitEnergy: 10,
        docVisitIron: 200,
        statEffects: {},
    },
    bruised_rib: {
        label: "Bruised Rib",
        severity: "minor",
        cause: "fight",
        effect: "−10 Max Stamina. Heals in 6 hours.",
        requiresDoctorVisit: false,
        recoveryHoursNeeded: 6,
        recoverySkipIron: 600,
        statEffects: { maxStamina: -10 },
    },
    sprained_ankle: {
        label: "Sprained Ankle",
        severity: "minor",
        cause: "sparring",
        effect: "−15 LEG until healed. Heals in 18 hours.",
        requiresDoctorVisit: false,
        recoveryHoursNeeded: 18,
        recoverySkipIron: 800,
        statEffects: { leg: -15 },
    },
    broken_nose: {
        label: "Broken Nose",
        severity: "minor",
        cause: "fight",
        effect: "−3 CHN until it heals. Clears in 9 hours.",
        requiresDoctorVisit: true,
        cannotFight: false,
        recoveryHoursNeeded: 9,
        docVisitEnergy: 10,
        docVisitIron: 400,
        statEffects: { chn: -3 },
    },
    concussion: {
        label: "Concussion",
        severity: "major",
        cause: "ko_loss",
        effect: "−2 CHN; can't spar or fight. Heals in 12 hours.",
        requiresDoctorVisit: true,
        cannotFight: true,
        cannotSpar: true,
        recoveryHoursNeeded: 12,
        docVisitEnergy: 20,
        docVisitIron: 1500,
        statEffects: { chn: -2 },
    },
    torn_ligament: {
        label: "Torn Ligament",
        severity: "major",
        cause: "sparring",
        effect: "Can't fight; −10 STR, −10 LEG. Heals in 24 hours.",
        requiresDoctorVisit: true,
        cannotFight: true,
        recoveryHoursNeeded: 24,
        docVisitEnergy: 20,
        docVisitIron: 2000,
        statEffects: { str: -10, leg: -10 },
    },
    broken_hand: {
        label: "Broken Hand",
        severity: "major",
        cause: "fight",
        effect: "−20 STR; no bag/pad work. Heals in 24 hours.",
        requiresDoctorVisit: false,
        cannotBagWork: true,
        recoveryHoursNeeded: 24,
        recoverySkipIron: 1200,
        statEffects: { str: -20 },
    },
};

// Possible injury pools by context
const MINOR_FIGHT_INJURIES = ["cut", "bruised_rib", "broken_nose"];
const MAJOR_FIGHT_INJURIES = ["broken_hand"];
const MINOR_SPARRING_INJURIES = ["sprained_ankle"];
const MAJOR_SPARRING_INJURIES = ["torn_ligament"];

// Hospital config: Full Recovery Package applies a 15% bulk discount over individual services.
const FULL_RECOVERY_DISCOUNT = 0.15;

// New-fighter injury grace: a fighter's first N fights never inflict a fight-blocking
// injury (Concussion / Cut / Torn Ligament), so a rough debut can't lock a new player
// out of the game before they've had a chance to build up resources.
const INJURY_GRACE_FIGHTS = 3;

// Tier-scaled doctor-visit cost overrides (iron). A KO/sub loss past the grace window
// guarantees a Concussion; at Amateur the flat 1,500 cost prices a brand-new player out
// of the fast-heal exactly when they're most fragile. It's reduced here so the paid
// shortcut is actually reachable. NOTE: every injury still self-heals for FREE over its
// recovery hours regardless of tier — the doctor visit is only a paid shortcut, never a
// gate. Any (type, tier) not listed falls back to the injury's base docVisitIron.
const DOC_VISIT_IRON_BY_TIER = {
    concussion: { Amateur: 600 },
};

/** Resolve the doctor-visit iron cost for an injury type at a given promotion tier. */
function docVisitIronFor(typeKey, tier) {
    const def = INJURY_TYPES[typeKey];
    const base = (def && def.docVisitIron) || 0;
    const override = DOC_VISIT_IRON_BY_TIER[typeKey];
    return override && tier && override[tier] != null ? override[tier] : base;
}

// Health restoration packages — available to all tiers, no level gating.
// Each package restores up to `hp` health (capped at 100); iron cost is pro-rated on
// actual HP delivered. Volume discount across tiers — bigger packages have a better
// per-HP rate, so Full Restoration is the best deal for players willing to spend more.
//   Quick Patch:      10 iron/HP — small spend, premium rate
//   Recovery Bay:      8 iron/HP — mid spend, mid rate
//   Full Restoration:  7 iron/HP — biggest spend, best rate
const HEALTH_PACKAGES = {
    quick_patch:      { label: "Quick Patch",      hp: 25,  iron: 250 },
    recovery_bay:     { label: "Recovery Bay",     hp: 50,  iron: 400 },
    full_restoration: { label: "Full Restoration", hp: 100, iron: 700 },
};

module.exports = {
    INJURY_TYPES,
    MINOR_FIGHT_INJURIES,
    MAJOR_FIGHT_INJURIES,
    MINOR_SPARRING_INJURIES,
    MAJOR_SPARRING_INJURIES,
    FULL_RECOVERY_DISCOUNT,
    INJURY_GRACE_FIGHTS,
    HEALTH_PACKAGES,
    DOC_VISIT_IRON_BY_TIER,
    docVisitIronFor,
};
