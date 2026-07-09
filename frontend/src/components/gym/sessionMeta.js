/**
 * Gym session metadata + shared display constants.
 *
 * Split out of GymTraining.jsx so the Ring / Floor / Standing panels can all
 * import the same session catalog + stat-color mapping without pulling in
 * the whole orchestrator component.
 */

// Full session metadata matching backend TRAINING_SESSIONS + rank 2 sessions
export const SESSION_META = {
    bag_work:       { label: "Bag Work",       category: "striking",  cost: 4, stats: ["STR"],  xpBase: 10, desc: "Heavy bag rounds — power and accuracy" },
    footwork:       { label: "Footwork",       category: "striking",  cost: 4, stats: ["SPD"],  xpBase: 10, desc: "Lateral movement, evasion and reaction speed" },
    kick_drills:    { label: "Kick Drills",    category: "striking",  cost: 4, stats: ["LEG"],  xpBase: 10, desc: "Repetitive kick technique on pads and bags" },
    pad_work:       { label: "Pad Work",       category: "striking",  cost: 5, stats: ["STR", "SPD"], xpBase: 10, desc: "Combo work with a coach — power meets reaction" },
    wrestling:      { label: "Wrestling",      category: "grappling", cost: 5, stats: ["WRE"],  xpBase: 10, desc: "Takedowns, cage control, scrambles" },
    clinch:         { label: "Clinch Work",    category: "grappling", cost: 5, stats: ["WRE", "STR"], xpBase: 10, desc: "Cage clinches, dirty boxing, body locks" },
    bjj:            { label: "BJJ",            category: "grappling", cost: 6, stats: ["GND", "SUB"], xpBase: 10, desc: "Ground game, sweeps, transitions, guard work" },
    submission:     { label: "Submissions",    category: "grappling", cost: 6, stats: ["SUB"],  xpBase: 10, desc: "Choke and joint-lock mechanics — attack chains and escapes" },
    sparring:       { label: "Sparring",       category: "sparring",  cost: 8, stats: ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"], xpBase: 12, desc: "Full-contact rounds — highest XP, builds chin and IQ", warn: "3% injury risk" },
    film_study:     { label: "Film Study",     category: "mental",    cost: 3, stats: ["FIQ"],  xpBase: 10, desc: "Opponent breakdown — raises Fight IQ" },
    strength_conditioning: { label: "Conditioning", category: "physical", cost: 4, stats: [], xpBase: 0, desc: "+1 Max Stamina (cap 120)", special: "Max Stamina" },
    // Rank 2 unique sessions
    combination_drilling: { label: "Combination Drilling", category: "striking",  cost: 5, stats: ["STR", "SPD"], xpBase: 10, desc: "Advanced boxing combos (+15% XP)", rank2: true },
    switch_kick_mastery:  { label: "Switch Kick Mastery",  category: "striking",  cost: 5, stats: ["LEG", "SPD"], xpBase: 10, desc: "Dynamic kick switching (+15% XP)", rank2: true },
    chain_wrestling:      { label: "Chain Wrestling",      category: "grappling", cost: 6, stats: ["WRE", "GND"], xpBase: 10, desc: "Continuous wrestling chains (+15% XP)", rank2: true },
    advanced_guard_work:  { label: "Advanced Guard Work",  category: "grappling", cost: 6, stats: ["GND", "SUB"], xpBase: 10, desc: "Elite guard techniques (+15% XP)", rank2: true },
    clinch_knees:         { label: "Clinch Knees",         category: "striking",  cost: 5, stats: ["LEG", "CHN"], xpBase: 10, desc: "Knees from clinch range (+15% XP)", rank2: true },
    transition_mastery:   { label: "Transition Mastery",   category: "grappling", cost: 6, stats: ["SUB", "FIQ"], xpBase: 10, desc: "Sub transitions + IQ (+15% XP)", rank2: true },
    counter_timing:       { label: "Counter Timing",       category: "striking",  cost: 5, stats: ["SPD", "FIQ"], xpBase: 10, desc: "Counter-strike timing (+15% XP)", rank2: true },
    power_wrestling:      { label: "Power Wrestling",      category: "grappling", cost: 6, stats: ["STR", "WRE"], xpBase: 10, desc: "Strength-based wrestling (+15% XP)", rank2: true },
    strategic_sparring:   { label: "Strategic Sparring",   category: "sparring",  cost: 7, stats: ["FIQ", "GND"], xpBase: 10, desc: "Tactical sparring (+15% XP)", rank2: true, warn: "3% injury risk" },
    championship_rounds:  { label: "Championship Rounds",  category: "sparring",  cost: 8, stats: ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"], xpBase: 12, desc: "Elite full-contact (+10% XP)", rank2: true, warn: "3% injury risk" },
};

// Kept exported to avoid breaking any importer (TrainingResultPopup uses .stat-chip classes).
export const STAT_CHIP_CLASS = {
    STR: "stat-chip-str", SPD: "stat-chip-spd", LEG: "stat-chip-leg",
    WRE: "stat-chip-wre", GND: "stat-chip-gnd", SUB: "stat-chip-sub",
    CHN: "stat-chip-chn", FIQ: "stat-chip-fiq",
};

// Accent-bar colors per stat (mockup reference).
export const STAT_COLOR = {
    STR: "#C8102E", SPD: "#3B82F6", LEG: "#22C55E", WRE: "#F97316",
    GND: "#EAB308", SUB: "#14B8A6", CHN: "#A855F7", FIQ: "#6366F1",
};

export const GOLD = "#D4A820";

// The three sparring-family sessions — featured together in the Sparring Ring.
export const SPARRING_KEYS = new Set(["sparring", "strategic_sparring", "championship_rounds"]);
// Fixed display order for the Ring.
export const SPARRING_ORDER = ["sparring", "strategic_sparring", "championship_rounds"];

export const PRESETS = [1, 5, 10];
export const MAX_BATCH = 25;
