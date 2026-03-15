/**
 * GDD 8.9 – Injury system definitions.
 * severity: "minor" | "major"
 * cause:    "fight" | "sparring" | "ko_loss"
 * statEffects: signed values applied to fighter stats when injury is sustained (negative = penalty).
 */
const INJURY_TYPES = {
    cut: {
        label: "Cut",
        severity: "minor",
        cause: "fight",
        effect: "Possible TKO if fight doctor stops bout. Requires medical clearance before next fight.",
        requiresDoctorVisit: true,
        cannotFight: true,
        docVisitEnergy: 2,
        docVisitIron: 300,
        statEffects: {},
    },
    bruised_rib: {
        label: "Bruised Rib",
        severity: "minor",
        cause: "fight",
        effect: "−10 Max Stamina for next camp. Heals with 2 recovery sessions.",
        requiresDoctorVisit: false,
        recoverySessionsNeeded: 2,
        statEffects: { maxStamina: -10 },
    },
    sprained_ankle: {
        label: "Sprained Ankle",
        severity: "minor",
        cause: "sparring",
        effect: "−15 LEG until healed. Heals with 5 recovery sessions.",
        requiresDoctorVisit: false,
        recoverySessionsNeeded: 5,
        statEffects: { leg: -15 },
    },
    broken_nose: {
        label: "Broken Nose",
        severity: "minor",
        cause: "fight",
        effect: "−3 CHN until treated by doctor.",
        requiresDoctorVisit: true,
        cannotFight: false,
        docVisitEnergy: 2,
        docVisitIron: 200,
        statEffects: { chn: -3 },
    },
    concussion: {
        label: "Concussion",
        severity: "major",
        cause: "ko_loss",
        effect: "−2 CHN; cannot spar; mandatory medical rest (1 fight). Doctor visit required.",
        requiresDoctorVisit: true,
        cannotFight: true,
        cannotSpar: true,
        docVisitEnergy: 5,
        docVisitIron: 1000,
        statEffects: { chn: -2 },
    },
    torn_ligament: {
        label: "Torn Ligament",
        severity: "major",
        cause: "sparring",
        effect: "Cannot fight; −10 STR, −10 LEG. Doctor visit required, long recovery.",
        requiresDoctorVisit: true,
        cannotFight: true,
        docVisitEnergy: 10,
        docVisitIron: 2000,
        statEffects: { str: -10, leg: -10 },
    },
    broken_hand: {
        label: "Broken Hand",
        severity: "major",
        cause: "fight",
        effect: "−20 STR; no bag/pad work. Heals with 6 recovery sessions.",
        requiresDoctorVisit: false,
        cannotBagWork: true,
        recoverySessionsNeeded: 6,
        statEffects: { str: -20 },
    },
};

// Possible injury pools by context
const MINOR_FIGHT_INJURIES = ["cut", "bruised_rib", "broken_nose"];
const MAJOR_FIGHT_INJURIES = ["broken_hand"];
const MINOR_SPARRING_INJURIES = ["sprained_ankle"];
const MAJOR_SPARRING_INJURIES = ["torn_ligament"];

module.exports = {
    INJURY_TYPES,
    MINOR_FIGHT_INJURIES,
    MAJOR_FIGHT_INJURIES,
    MINOR_SPARRING_INJURIES,
    MAJOR_SPARRING_INJURIES,
};
