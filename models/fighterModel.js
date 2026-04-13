const mongoose = require("mongoose");
const { WEIGHT_CLASSES, STYLES, BACKSTORIES, PROMOTION_TIERS } = require("../consts/gameConstants");

const statSchema = {
    type: Number,
    min: 1,
    max: 100,
    default: 10
};

const promotionTierValues = Object.keys(PROMOTION_TIERS);

const fighterSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    nickname: { type: String, default: null },
    weightClass: {
        type: String,
        enum: WEIGHT_CLASSES,
        required: true
    },
    style: {
        type: String,
        enum: Object.keys(STYLES),
        required: true
    },
    backstory: {
        type: String,
        enum: [...Object.keys(BACKSTORIES), null],
        default: null
    },
    // Eight combat stats (1–100)
    str: statSchema,
    spd: statSchema,
    leg: statSchema,
    wre: statSchema,
    gnd: statSchema,
    sub: statSchema,
    chn: statSchema,
    fiq: statSchema,
    // Accumulated XP per stat (for GDD XP curve; stats 96–100 are fight XP only)
    strXp: { type: Number, default: 0 },
    spdXp: { type: Number, default: 0 },
    legXp: { type: Number, default: 0 },
    wreXp: { type: Number, default: 0 },
    gndXp: { type: Number, default: 0 },
    subXp: { type: Number, default: 0 },
    chnXp: { type: Number, default: 0 },
    fiqXp: { type: Number, default: 0 },
    // Single progression number (computed from stats + style weight)
    overallRating: { type: Number, default: 14 },
    // Resource pools
    stamina: { type: Number, default: 100 },
    maxStamina: { type: Number, default: 100 },
    health: { type: Number, default: 100 },
    energy: {
        current: { type: Number, default: 100, min: 0 },
        max: { type: Number, default: 100, min: 1 },
        lastSyncedAt: { type: Date, default: Date.now },
    },
    iron: { type: Number, default: 0 },
    /** Consecutive wins (resets on loss/draw) — notoriety streak bonuses */
    winStreak: { type: Number, default: 0 },
    /**
     * Fame score + tier (never demotes below peak tier floor; score can decay).
     */
    notoriety: {
        score: { type: Number, default: 0, min: 0 },
        peakTier: {
            type: String,
            enum: ["UNKNOWN", "PROSPECT", "RISING_STAR", "CONTENDER", "STAR", "LEGEND"],
            default: "UNKNOWN",
        },
        isFrozen: { type: Boolean, default: false },
        lastEventAt: { type: Date, default: null },
        /** Once per account — documentary media (future) */
        documentaryUsed: { type: Boolean, default: false },
        milestones: {
            wins10: { type: Boolean, default: false },
            wins25: { type: Boolean, default: false },
            wins50: { type: Boolean, default: false },
            ko10: { type: Boolean, default: false },
        },
        /** Promotion tiers where first KO/TKO or Sub finish bonus was claimed */
        firstFinishPromoTiers: { type: [String], default: [] },
    },
    // Career
    promotionTier: { type: String, enum: promotionTierValues, default: "Amateur" },
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
    record: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        koWins: { type: Number, default: 0 },
        subWins: { type: Number, default: 0 },
        decisionWins: { type: Number, default: 0 }
    },
    age: { type: Number, default: 22 },
    rankingScore: { type: Number, default: 0 },
    // Training camp state for accepted fight
    acceptedFightId: { type: mongoose.Schema.Types.ObjectId, ref: "Fight", default: null },
    trainingCampActions: { type: Number, default: 0 },
    // Daily fight count — legacy total (kept for migration / display); cap uses fightsTodayByTier
    fightsToday: { type: Number, default: 0 },
    lastFightDate: { type: Date, default: null },
    /** Calendar day key (toDateString) for fightsTodayByTier reset */
    fightDayKey: { type: String, default: null },
    /** Fights completed today per promotion tier (e.g. Amateur vs Regional Pro caps are separate) */
    fightsTodayByTier: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Comeback mode after loss
    comebackMode: { type: Boolean, default: false },
    consecutiveLosses: { type: Number, default: 0 },
    // GDD 7.4: Gym quest perks (applied permanently when quest is completed)
    activePerks: {
        ironWill:          { type: Boolean, default: false },  // −5% KO probability
        specialistStat:    { type: String, default: null },    // this stat trains 10% faster
        theGrindGymId:     { type: mongoose.Schema.Types.ObjectId, default: null }, // +500 iron/fight when enrolled here
        apexRegimen:       { type: Boolean, default: false },  // +20% XP all sessions
    },
    completedQuests: [{ type: String }],   // list of completed questIds
    // GDD 8.6: Badges earned (e.g. "Resilience" for winning a comeback fight)
    badges: [{ type: String }],
    // GDD 8.5: Mental Reset required after 3 consecutive losses (blocks next fight)
    mentalResetRequired: { type: Boolean, default: false },
    // Champion system: title shot progression
    pendingPromotion:  { type: String, default: null },   // next tier name when OVR gate met
    winsInCurrentTier: { type: Number, default: 0 },      // reset on promotion
    titleShotCooldown: { type: Number, default: 0 },      // set to 2 on title loss, decremented on wins
    // Nemesis: the most recent NPC to beat the player (cleared on revenge win)
    nemesis: {
        opponentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", default: null },
        opponentName: { type: String, default: null },
        lossCount:    { type: Number, default: 0 },
        setAt:        { type: Date,   default: null },
    },
    // GDD 8.9: Active injuries
    injuries: [{
        type:               { type: String },
        label:              { type: String },
        severity:           { type: String },   // "minor" | "major"
        effect:             { type: String },
        requiresDoctorVisit: { type: Boolean, default: false },
        doctorVisited:      { type: Boolean, default: false },
        cannotFight:        { type: Boolean, default: false },
        cannotSpar:         { type: Boolean, default: false },
        cannotBagWork:      { type: Boolean, default: false },
        recoverySessionsLeft: { type: Number, default: 0 },
        docVisitEnergy:     { type: Number, default: 0 },
        docVisitIron:       { type: Number, default: 0 },
        appliedStatEffects: {
            str: { type: Number, default: 0 },
            spd: { type: Number, default: 0 },
            leg: { type: Number, default: 0 },
            wre: { type: Number, default: 0 },
            gnd: { type: Number, default: 0 },
            sub: { type: Number, default: 0 },
            chn: { type: Number, default: 0 },
            fiq: { type: Number, default: 0 },
            maxStamina: { type: Number, default: 0 },
        },
        sustainedAt: { type: Date, default: Date.now },
    }],
    // GDD 8.8: Weight cut strategy for the current accepted fight
    weightCut: { type: String, enum: ["easy", "moderate", "aggressive"], default: "easy" },
    // Gym membership tracking: paidUntil per gym
    gymMemberships: [{
        gymId:     { type: mongoose.Schema.Types.ObjectId, ref: "Gym" },
        paidUntil: { type: Date },
    }],
}, { timestamps: true });

fighterSchema.index({ promotionTier: 1, weightClass: 1, overallRating: -1 });
fighterSchema.index({ gymId: 1 });
fighterSchema.index({ "notoriety.score": -1 });

const Fighter = mongoose.model("Fighter", fighterSchema);
module.exports = Fighter;
