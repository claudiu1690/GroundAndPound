const FIGHT_RESOLUTION_CONFIG = {
    defaults: {
        stat: 10,
        health: 100,
        stamina: 100,
        maxRounds: 5,
    },
    statKeys: ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"],
    eventToCommentaryKey: {
        "Striking exchange.": "strikingExchange",
        "Takedown; ground and pound.": "takedownPlayer",
        "Opponent took you down.": "takedownOpponent",
    },
    outcomeToCommentaryKey: {
        "KO/TKO": "koFinish",
        Submission: "submissionWin",
        "Loss (KO/TKO)": "koLoss",
        "Loss (submission)": "submissionLoss",
        "Loss (decision)": "decision",
        Draw: "decision",
        "Decision (unanimous)": "decision",
        "Decision (split)": "decision",
    },
    profile: {
        divisor: 450,
        minMod: -0.04,
        maxMod: 0.07,
    },
    strikeDamage: {
        // Balanced attack/defense weights — softened from the original to reduce OVR cliff.
        attackWeight: 0.45,
        speedWeight: 0.18,
        chinWeight: 0.35,
        varianceMin: 0.85,
        varianceRange: 0.3,
    },
    takedown: {
        // Higher base gives grapplers a fair shot; WRE gap scales with a tighter divisor.
        baseSuccessChance: 0.5,
        wreDiffDivisor: 150,
        // Shooter (propensity) base is now style-driven; these values bound the result.
        shooterBaseChance: 0.5,
        shooterDiffDivisor: 100,
        shooterChanceMin: 0.15,
        shooterChanceMax: 0.85,
    },
    submission: {
        baseChance: 0.18,
        subDiffDivisor: 120,
        wreDiffDivisor: 220,
        gndDiffDivisor: 260,
        chanceMin: 0.05,
        chanceMax: 0.68,
        attemptMin: 0.08,
        attemptMax: 0.5,
    },
    submissionDefense: {
        base: 1,
        anchorStat: 10,
        divisor: 80,
        minMod: 0.65,
        maxMod: 1.05,
    },
    koCheck: {
        healthWindow: {
            lowStaminaThreshold: 10,
            midStaminaThreshold: 20,
            highStaminaThreshold: 40,
            lowStaminaWindow: 55,
            midStaminaWindow: 45,
            highStaminaWindow: 32,
            normalWindow: 25,
        },
        base: 0.15,
        healthDiffDivisor: 100,
        chinDivisor: 500,
        damageDivisor: 200,
        lowStaminaDivisor: 100,
        lowStaminaThreshold: 40,
        ironWillMod: -0.05,
        minProb: 0.02,
        maxProb: 0.7,
    },
    exhaustionTko: {
        maxStamina: 10,
        veryLowStamina: 5,
        veryLowBase: 0.1,
        lowBase: 0.05,
        damageFloor: 4,
        damageDivisor: 80,
        healthThreshold: 70,
        healthDivisor: 180,
        chinDivisor: 900,
        ironWillMod: -0.03,
        minProb: 0.01,
        maxProb: 0.35,
    },
    strategy: {
        takedownAttempt: {
            default: 0.4,
            takedownHeavy: 0.58,
            submissionHunter: 0.5,
        },
        strikeDamageMod: {
            default: 1,
            pressureAttacker: 1.1,
            counterDefender: 0.9,
            survivalDefender: 0.92,
        },
        subAttempt: {
            default: 0.25,
            submissionHunter: 0.38,
        },
    },
    round: {
        staminaDrainBase: 8,
        staminaDrainRandom: 6,
        // Takedowns can be attempted every round — grapplers no longer lose all offense after round 2.
        takedownRoundsLimit: 5,
        healthZero: 0,
    },
    flashKo: {
        minDamage: 10,
        baseChance: 0.004,
        extraDamageDivisor: 180,
        minProb: 0,
        maxProb: 0.1,
        ironWillMultiplier: 0.9,
    },
    judging: {
        biases: ["striker", "grappler", "balanced"],
        controlWeights: {
            // Grappler-biased judges reward takedowns + control heavily.
            grappler: 4,
            // Striker-biased judges still acknowledge control but weight it less than damage.
            striker: 1.5,
        },
        dominantRoundThreshold: 8,
        dominantRound10_8Threshold: 18,
    },
};

module.exports = { FIGHT_RESOLUTION_CONFIG };
