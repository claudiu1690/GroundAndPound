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
    // Marks a non-account NPC seeded for PVP ladder population (delete by this flag).
    isPvpBot: { type: Boolean, default: false },
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
    // Stamina is fight-time only — reset to maxStamina before every fight, not persisted.
    maxStamina: { type: Number, default: 100 },
    health: { type: Number, default: 100 },
    // Passive health regen: +1 per 5 minutes since last regen timestamp.
    healthLastRegenAt: { type: Date, default: Date.now },
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
    // Timestamp of the player's last fight — used as the notoriety "last event" time.
    // (Daily fight caps were removed; fights are limited only by energy.)
    lastFightDate: { type: Date, default: null },
    /** Training sessions completed today (calendar day); reset via trainingDayKey */
    trainingSessionsToday: { type: Number, default: 0 },
    /** Lifetime training sessions completed (never resets) — drives session badges. */
    careerTrainingSessions: { type: Number, default: 0 },
    /** Calendar day key (toDateString) for trainingSessionsToday reset */
    trainingDayKey: { type: String, default: null },
    // Comeback mode after loss
    comebackMode: { type: Boolean, default: false },
    consecutiveLosses: { type: Number, default: 0 },
    // Gym rank progression: persistent per gym, keyed by gym slug
    gymRanks: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Active gym membership
    activeGymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", default: null },
    activeGymPaidUntil: { type: Date, default: null },
    // Gym perks earned at Rank 4 (perkId strings, e.g. "corner_confidence")
    gymPerks: [{ type: String }],
    // GDD 8.6: Badges earned (e.g. "Resilience" for winning a comeback fight)
    badges: [{ type: String }],
    // Career Page badge system — structured earned-badge ledger (catalog ids).
    // `badges` (above) is the legacy string list and is NOT touched by this system.
    badgesEarned: [{
        badgeId:  { type: String, required: true },
        earnedAt: { type: Date, default: Date.now },
        context:  { type: String, default: null },
        // false = a fresh gameplay unlock the player hasn't acknowledged yet (drives the
        // "NEW" highlight + unlock modal). Silent self-heals/backfills set true. Legacy
        // entries leave this undefined → treated as already seen.
        seen:     { type: Boolean },
        _id: false,
    }],
    // Up to 3 earned badgeIds the player has pinned for display.
    pinnedBadges: { type: [String], default: [] },
    // GDD 8.5: Mental Reset required after 3 consecutive losses (blocks next fight)
    mentalResetRequired: { type: Boolean, default: false },
    // Champion system: title shot progression
    pendingPromotion:  { type: String, default: null },   // next tier name when OVR gate met
    winsInCurrentTier: { type: Number, default: 0 },      // reset on promotion
    titleShotCooldown: { type: Number, default: 0 },      // set to 2 on title loss, decremented on wins
    // Ranking System v1.0 — player's position inside the current tier's roster.
    // rank=null → Unranked (first 2 fights in tier). After fight 3, player enters the rankings.
    // Reset to defaults on tier promotion via rankingService.resetRankingForNewTier().
    ranking: {
        rank:                { type: Number, default: null },     // null = Unranked, otherwise 2..rosterSize
        fightsInTier:        { type: Number, default: 0 },        // counts every fight in current tier
        entryRecordAtFight3: { type: String, default: null },     // e.g. "3-0" — snapshot on entry
    },
    // Octagon Gazette v1.0 — daily newspaper state.
    // lastShownDate: YYYY-MM-DD (UTC) — gazette won't re-fire same day.
    // lastNotorietyLogged: baseline notoriety from last dismiss, used to compute delta.
    // rankBeforeLastFight: snapshot of ranking.rank BEFORE the most recent fight resolved,
    //   used by the Rank Jump story. Set in fightService just before updatePlayerRank fires.
    // promoBeforeLastLogin / fameTierBeforeLastLogin: snapshots used to detect promotion
    //   and fame-tier-change since last gazette.
    gazette: {
        lastShownDate:           { type: String, default: null },
        lastNotorietyLogged:     { type: Number, default: 0 },
        rankBeforeLastFight:     { type: Number, default: null },
        tierBeforeLastFight:     { type: String, default: null },
        fameTierBeforeLastLogin: { type: String, default: null },
    },
    // Nemesis: the most recent NPC to beat the player (cleared on revenge win)
    nemesis: {
        opponentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", default: null },
        opponentName: { type: String, default: null },
        lossCount:    { type: Number, default: 0 },
        setAt:        { type: Date,   default: null },
    },
    /**
     * Phase 6 — Media Hub state.
     *
     * Legacy fields (lastPodcastAt, podcastCount, interviewCount) are retained for
     * back-compat; episodeCount/lastRecordedDate are the canonical podcast counters.
     */
    media: {
        // Podcast
        podcastName:      { type: String, default: null },
        episodeCount:     { type: Number, default: 0 },
        lastRecordedDate: { type: Date,   default: null },
        // Legacy / back-compat
        lastPodcastAt:    { type: Date,   default: null },
        podcastCount:     { type: Number, default: 0 },
        interviewCount:   { type: Number, default: 0 },
        // Lifetime beefs-started counter — incremented at every beef-flag creation
        // site. Drives the `controversy` badge (>= 10). Distinct from active beefFlags.
        beefsStarted:     { type: Number, default: 0 },
        // Documentary
        documentaryStatus:     { type: String, enum: ["locked", "available", "recorded"], default: "locked" },
        documentaryChoices:    { type: mongoose.Schema.Types.Mixed, default: null },
        documentaryRecordedAt: { type: Date, default: null },
        documentaryReward:     { type: mongoose.Schema.Types.Mixed, default: null },
        documentaryPending: {
            type: new mongoose.Schema({
                focus:       { type: String, required: true },
                tone:        { type: String, required: true },
                timing:      { type: String, required: true },
                committedAt: { type: Date, default: Date.now },
                fightsSince: { type: Number, default: 0 },
            }, { _id: false }),
            default: null,
        },
        // Appearances pool
        appearancesRotation: { type: Number, default: -1 },
        appearances: {
            type: [new mongoose.Schema({
                instanceId:         { type: String, required: true },
                type:               { type: String, required: true },
                expiresAt:          { type: Date, required: true },
                requiresFightByDate:{ type: Date, default: null },
                status:             { type: String, enum: ["available", "taken", "expired"], default: "available" },
                takenAt:            { type: Date, default: null },
                // Snapshot of the cash basis for sponsor-linked appearances (BRAND_DEAL_CLIP).
                cashSnapshot:       { type: Number, default: 0 },
            }, { _id: false })],
            default: [],
        },
    },
    /**
     * Phase 4 — Active callout. Cleared when the called-out opponent is fought
     * (win or loss) or when the player manually cancels (refunded).
     */
    activeCallout: {
        opponentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", default: null },
        opponentName: { type: String, default: null },
        cost:         { type: Number, default: 0 },
        isStretch:    { type: Boolean, default: false },
        calledAt:     { type: Date, default: null },
    },
    /**
     * Phase 2 — Banner customizer.
     * Unlocks are computed at read time from fighter state (tier, milestones, badges)
     * rather than stored as an inventory, so future catalog additions just work.
     */
    banner: {
        backgroundId: { type: String, default: "BG_SLATE" },
        frameId:      { type: String, default: "FRAME_NONE" },
        accentColor:  { type: String, default: "ACC_RED" },
        /** Up to 3 badge slots; nullable array entries are allowed so order is stable. */
        badgeSlots:   { type: [String], default: [] },
    },
    /**
     * Beef / Respect flags — created by interviews and podcasts.
     * Beef: if you meet this opponent within the window, fight counts as Grudge (+30% fame on win).
     *       If the window expires without a fight, the flag lapses with a small fame penalty.
     * Respect: if you meet this opponent within the window, you earn an iron bonus on the win.
     * `expiresAfterFights` counts down on every completed fight.
     */
    beefFlags: [{
        opponentId:         { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", required: true },
        opponentName:       { type: String, default: "" },
        source:             { type: String, enum: ["INTERVIEW", "PODCAST", "APPEARANCE"], default: "INTERVIEW" },
        expiresAfterFights: { type: Number, default: 4 },
        createdAt:          { type: Date, default: Date.now },
        _id: false,
    }],
    respectFlags: [{
        opponentId:         { type: mongoose.Schema.Types.ObjectId, ref: "Opponent", required: true },
        opponentName:       { type: String, default: "" },
        source:             { type: String, enum: ["INTERVIEW", "PODCAST", "APPEARANCE"], default: "INTERVIEW" },
        expiresAfterFights: { type: Number, default: 4 },
        createdAt:          { type: Date, default: Date.now },
        _id: false,
    }],
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
        // Auto-heal counter — ticks down once per real hour via the scheduler job
        // and lazily on every fighter load. When it hits 0, the injury auto-clears
        // and stat penalties are reversed.
        recoveryHoursLeft:  { type: Number, default: 0 },
        // Legacy 24h-unit counter from the pre-hourly migration. Kept on the schema
        // so old documents read without error; the tick function converts ×24 into
        // recoveryHoursLeft on first sight, then clears this field.
        recoveryDaysLeft:   { type: Number, default: 0 },
        // Last tick anchor; set whenever the scheduler / lazy tick decrements the counter.
        recoveryLastTickAt: { type: Date, default: null },
        docVisitEnergy:     { type: Number, default: 0 },
        docVisitIron:       { type: Number, default: 0 },
        // Iron cost to skip the auto-heal wait via the Hospital. Only used by auto-heal injuries.
        recoverySkipIron:   { type: Number, default: 0 },
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
    // Onboarding & Tutorial Spec v1.0 — linear new-player walkthrough.
    // `completed` is false until the completion modal is dismissed. While false,
    // the client mounts the tutorial overlay and resumes from `current_step`.
    // Existing fighters are backfilled to completed=true on server boot.
    // Shop, Inventory & Pre-Fight Supplements v1.0
    // prefightBuffs / usedBuffs are Mixed maps keyed by buff itemId → count.
    // ANY mutation of these maps MUST be followed by fighter.markModified("inventory")
    // or Mongoose silently drops the write.
    inventory: {
        energyShots:   { type: Number, default: 0, min: 0 },
        energyDrinks:  { type: Number, default: 0, min: 0 },
        prefightBuffs: { type: mongoose.Schema.Types.Mixed, default: {} },
        usedBuffs:     { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    // Active training booster — consumed one charge per completed XP session.
    // null when no booster is active.
    activeBooster: {
        type: new mongoose.Schema({
            id:            { type: String, required: true },
            sessionsLeft:  { type: Number, required: true, min: 0 },
            totalSessions: { type: Number, required: true },
        }, { _id: false }),
        default: null,
    },
    tutorial: {
        completed:    { type: Boolean, default: false },
        current_step: { type: String,  default: "profile_intro" },
        started_at:   { type: Date,    default: Date.now },
        completed_at: { type: Date,    default: null },
    },
    // PVP New Player Experience — onboarding state for "The Proving Ground".
    // Mirrors the `tutorial` subdoc shape. Additive; legacy fighters default to all
    // falsy/zero/null. `unlocked` flips on the 3rd CAREER win; placement is the first
    // 3 PVP fights (skipped in the Open Season 1). NO shieldFightsRemaining — the
    // New Competitor Shield is time-OR-first-attack (shieldExpiresAt only).
    pvpOnboarding: {
        unlocked:           { type: Boolean, default: false },
        placementComplete:  { type: Boolean, default: false },
        placementWins:      { type: Number,  default: 0 },
        placementFights:    { type: Number,  default: 0 },
        shieldExpiresAt:    { type: Date,    default: null },
        firstSeasonComplete:{ type: Boolean, default: false },
    },
}, { timestamps: true });

fighterSchema.index({ promotionTier: 1, weightClass: 1, overallRating: -1 });
fighterSchema.index({ gymId: 1 });
fighterSchema.index({ "notoriety.score": -1 });

const Fighter = mongoose.model("Fighter", fighterSchema);
module.exports = Fighter;
