/**
 * GDD 8.9 – Injury system definitions.
 * severity: "minor" | "major"
 * cause:    "fight" | "sparring" | "ko_loss"
 * statEffects: signed values applied to fighter stats when injury is sustained (negative = penalty).
 *
 * Healing model:
 *   - Doctor-required injuries: cleared via doctor visit (energy + iron). No auto-heal.
 *   - Auto-heal injuries: tick down recoveryDaysLeft once per 24h until 0, then auto-clear.
 *     Players can pay iron at the Hospital to skip the wait (recoverySkipIron).
 */
const INJURY_TYPES = {
    cut: {
        label: "Cut",
        severity: "minor",
        cause: "fight",
        effect: "Possible TKO if fight doctor stops bout. Requires medical clearance before next fight.",
        requiresDoctorVisit: true,
        cannotFight: true,
        docVisitEnergy: 10,
        docVisitIron: 200,
        statEffects: {},
    },
    bruised_rib: {
        label: "Bruised Rib",
        severity: "minor",
        cause: "fight",
        effect: "−10 Max Stamina. Heals in 2 days.",
        requiresDoctorVisit: false,
        recoveryDaysNeeded: 2,
        recoverySkipIron: 600,
        statEffects: { maxStamina: -10 },
    },
    sprained_ankle: {
        label: "Sprained Ankle",
        severity: "minor",
        cause: "sparring",
        effect: "−15 LEG until healed. Heals in 5 days.",
        requiresDoctorVisit: false,
        recoveryDaysNeeded: 5,
        recoverySkipIron: 800,
        statEffects: { leg: -15 },
    },
    broken_nose: {
        label: "Broken Nose",
        severity: "minor",
        cause: "fight",
        effect: "−3 CHN until treated by doctor.",
        requiresDoctorVisit: true,
        cannotFight: false,
        docVisitEnergy: 10,
        docVisitIron: 400,
        statEffects: { chn: -3 },
    },
    concussion: {
        label: "Concussion",
        severity: "major",
        cause: "ko_loss",
        effect: "−2 CHN; cannot spar; mandatory medical rest. Doctor visit required.",
        requiresDoctorVisit: true,
        cannotFight: true,
        cannotSpar: true,
        docVisitEnergy: 20,
        docVisitIron: 1500,
        statEffects: { chn: -2 },
    },
    torn_ligament: {
        label: "Torn Ligament",
        severity: "major",
        cause: "sparring",
        effect: "Cannot fight; −10 STR, −10 LEG. Doctor visit required.",
        requiresDoctorVisit: true,
        cannotFight: true,
        docVisitEnergy: 20,
        docVisitIron: 2000,
        statEffects: { str: -10, leg: -10 },
    },
    broken_hand: {
        label: "Broken Hand",
        severity: "major",
        cause: "fight",
        effect: "−20 STR; no bag/pad work. Heals in 6 days.",
        requiresDoctorVisit: false,
        cannotBagWork: true,
        recoveryDaysNeeded: 6,
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
    HEALTH_PACKAGES,
};
