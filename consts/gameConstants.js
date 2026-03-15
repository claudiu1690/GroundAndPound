/**
 * Ground & Pound — GDD-aligned constants (no levels, Overall Rating only).
 */

// ----- Weight classes -----
exports.WEIGHT_CLASSES = ['Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight'];
exports.WEIGHT_LIMITS = { Bantamweight: 135, Featherweight: 145, Lightweight: 155, Welterweight: 170 };

// ----- Fighting styles (primary stat weights for Overall: 1.2; secondary 1.0; off-style 0.85) -----
exports.STYLES = {
    Boxer:       { primary: ['STR', 'SPD', 'CHN'], secondary: ['LEG', 'WRE', 'GND', 'SUB'], start: { STR: 20, SPD: 18, CHN: 18, LEG: 8, WRE: 8, GND: 8, SUB: 8, FIQ: 12 } },
    Kickboxer:   { primary: ['STR', 'SPD', 'LEG'], secondary: ['WRE', 'GND', 'SUB', 'CHN'], start: { STR: 18, SPD: 17, LEG: 16, WRE: 8, GND: 8, SUB: 15, CHN: 10, FIQ: 10 } },
    Wrestler:    { primary: ['WRE', 'GND', 'STR'], secondary: ['SPD', 'LEG', 'SUB', 'CHN'], start: { STR: 15, SPD: 10, LEG: 8, WRE: 22, GND: 18, SUB: 10, CHN: 10, FIQ: 7 } },
    'Brazilian Jiu-Jitsu': { primary: ['GND', 'SUB', 'WRE'], secondary: ['STR', 'SPD', 'LEG', 'CHN'], start: { STR: 10, SPD: 8, LEG: 8, WRE: 12, GND: 18, SUB: 22, CHN: 10, FIQ: 14 } },
    'Muay Thai': { primary: ['STR', 'LEG', 'SPD'], secondary: ['WRE', 'GND', 'SUB', 'CHN'], start: { STR: 17, SPD: 16, LEG: 17, WRE: 12, GND: 8, SUB: 14, CHN: 8, FIQ: 8 } },
    Judo:        { primary: ['WRE', 'GND', 'STR'], secondary: ['SPD', 'LEG', 'SUB', 'CHN'], start: { STR: 13, SPD: 8, LEG: 12, WRE: 22, GND: 16, SUB: 12, CHN: 10, FIQ: 7 } },
    Sambo:       { primary: ['WRE', 'SUB', 'GND'], secondary: ['STR', 'SPD', 'LEG', 'CHN'], start: { STR: 12, SPD: 10, LEG: 8, WRE: 18, GND: 14, SUB: 20, CHN: 10, FIQ: 8 } },
    Capoeira:    { primary: ['SPD', 'LEG', 'FIQ'], secondary: ['STR', 'WRE', 'GND', 'SUB', 'CHN'], start: { STR: 12, SPD: 20, LEG: 18, WRE: 8, GND: 8, SUB: 12, CHN: 8, FIQ: 14 } },
};

exports.BACKSTORIES = {
    'Street Fighter':    { CHN: 5, koProbabilityMod: -0.03 },
    'College Wrestler':  { WRE: 8 },
    'Kickboxing Champion': { STR: 6, LEG: 4 },
    'Army Veteran':      { maxStaminaBonus: 10 },
    'MMA Prodigy':      { allStats: 2 },
    'Late Bloomer':     { trainingXpMod: 0.25 },
};

// ----- Stat names (1–100 scale) and schema key mapping -----
exports.STAT_NAMES = ['STR', 'SPD', 'LEG', 'WRE', 'GND', 'SUB', 'CHN', 'FIQ'];
exports.STAT_TO_KEY = { STR: 'str', SPD: 'spd', LEG: 'leg', WRE: 'wre', GND: 'gnd', SUB: 'sub', CHN: 'chn', FIQ: 'fiq' };
exports.KEY_TO_STAT = { str: 'STR', spd: 'SPD', leg: 'LEG', wre: 'WRE', gnd: 'GND', sub: 'SUB', chn: 'CHN', fiq: 'FIQ' };

// ----- XP per stat point by range (GDD Section 5.1) -----
exports.XP_PER_POINT = [
    { min: 1,  max: 20,  xp: 50 },
    { min: 21, max: 40,  xp: 150 },
    { min: 41, max: 60,  xp: 400 },
    { min: 61, max: 75,  xp: 1000 },
    { min: 76, max: 85,  xp: 2500 },
    { min: 86, max: 95,  xp: 6000 },
    { min: 96, max: 100, xp: null }, // Fight XP only
];

// ----- Gym tiers (Overall to unlock, stat cap, XP multiplier) -----
exports.GYM_TIERS = {
    T1: { name: 'Local Gym', overallRequired: 0,  statCap: 35,  xpMultiplier: 1.0,   monthlyIron: 0 },
    T2: { name: 'Regional Gym', overallRequired: 33, statCap: 52,  xpMultiplier: 1.15, monthlyIron: 2500 },
    T3: { name: 'National Gym', overallRequired: 48, statCap: 68,  xpMultiplier: 1.3,  monthlyIron: 2000 },
    T4: { name: 'Elite Gym', overallRequired: 63, statCap: 82,  xpMultiplier: 1.5,  monthlyIron: 8000 },
    T5: { name: 'Apex Gym', overallRequired: 78, statCap: 95,  xpMultiplier: 1.75, monthlyIron: 25000 },
};

// ----- Promotion tiers (daily fight cap, pay range, signing fee, training camp) -----
// GDD 8.2: Recommended TCAs and penalty for under-camped (0 TCA = worst).
exports.PROMOTION_TIERS = {
    Amateur:        { dailyFightCap: 8,  fightEnergyCost: 10, signingFee: 0,    minOverall: 0,  maxOverall: 30, recommendedTca: 2, penaltyStatPct: 0.10, penaltyStaminaPct: 0,    injuryRiskMult: 2 },
    'Regional Pro': { dailyFightCap: 4,  fightEnergyCost: 15, signingFee: 2000,  minOverall: 30, maxOverall: 48, recommendedTca: 3, penaltyStatPct: 0.15, penaltyStaminaPct: 0,    injuryRiskMult: 2 },
    National:       { dailyFightCap: 2,  fightEnergyCost: 18, signingFee: 10000, minOverall: 45, maxOverall: 65, recommendedTca: 5, penaltyStatPct: 0.15, penaltyStaminaPct: 0.25, injuryRiskMult: 2 },
    'GCS Contender': { dailyFightCap: 1,  fightEnergyCost: 20, signingFee: 0,     minOverall: 60, maxOverall: 75, recommendedTca: 8, penaltyStatPct: 0.20, penaltyStaminaPct: 0.25, injuryRiskMult: 3 },
    GCS:            { dailyFightCap: 1,  fightEnergyCost: 20, signingFee: 0,     minOverall: 62, maxOverall: 95, recommendedTca: 10, penaltyStatPct: 0.20, penaltyStaminaPct: 0.30, injuryRiskMult: 3 },
};

// ----- Fight strategies (GDD 8.3) -----
exports.FIGHT_STRATEGIES = {
    'Pressure Fighter':   { desc: 'Relentless forward movement; high volume', bestVs: ['Counter Striker', 'low cardio'] },
    'Counter Striker':    { desc: 'Wait for openings; precise efficient strikes', bestVs: ['Pressure Fighter', 'predictable attackers'] },
    'Takedown Heavy':     { desc: 'Shoot early; control from top', bestVs: ['Pure strikers', 'low WRE'] },
    'Submission Hunter':  { desc: 'Seek ground; chain submission attempts', bestVs: ['Poor SUB defence', 'tired opponents'] },
    'Ground & Pound':     { desc: 'Take down; smother; punish from top', bestVs: ['Guard players', 'submission-light'] },
    'Leg Kick Attrition': { desc: 'Systematic leg damage; target the base', bestVs: ['High-chin', 'long fights'] },
    'Clinch Bully':       { desc: 'Force cage clinches; dirty boxing', bestVs: ['Pure boxers', 'distance fighters'] },
    'Survival Mode':      { desc: 'Defensive; look for mistakes', bestVs: ['When significantly outmatched'] },
};

// ----- Energy -----
exports.ENERGY = { max: 100, regenPerMinute: 1 };

// ----- Training session types (Energy cost, primary stat(s), base XP) -----
exports.TRAINING_SESSIONS = {
    bag_work:       { energy: 4, stats: ['STR'], xpBase: 10 },
    footwork:       { energy: 4, stats: ['SPD'], xpBase: 10 },
    kick_drills:   { energy: 4, stats: ['LEG'], xpBase: 10 },
    pad_work:       { energy: 5, stats: ['STR', 'SPD'], xpBase: 10 },
    wrestling:      { energy: 5, stats: ['WRE'], xpBase: 10 },
    clinch:         { energy: 5, stats: ['WRE', 'STR'], xpBase: 10 },
    bjj:            { energy: 6, stats: ['GND', 'SUB'], xpBase: 10 },
    submission:     { energy: 6, stats: ['SUB'], xpBase: 10 },
    sparring:       { energy: 8, stats: ['STR', 'SPD', 'LEG', 'WRE', 'GND', 'SUB', 'CHN', 'FIQ'], xpBase: 12, injuryRisk: 0.03 },
    film_study:     { energy: 3, stats: ['FIQ'], xpBase: 10, minGymTier: 'T3' },
    strength_conditioning: { energy: 4, stats: [], xpBase: 0, raisesMaxStamina: true },
    recovery:       { energy: 3, stats: [], xpBase: 0, reducesInjuryTimer: true },
};

// ----- Fight offer types -----
exports.FIGHT_OFFER_TYPES = ['Easy', 'Even', 'Hard', 'Short notice', 'Title shot'];

// ----- Fight outcomes -----
exports.FIGHT_OUTCOMES = ['KO/TKO', 'Submission', 'Decision (unanimous)', 'Decision (split)', 'Draw', 'Loss (decision)', 'Loss (KO/TKO)', 'Loss (submission)'];
