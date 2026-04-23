/**
 * Sponsorship catalog (Phase 3).
 *
 * Offers are gated by notoriety tier. Each offer carries a clause definition and the
 * payout schedule:
 *   - rewardPerFight:      iron paid after every completed fight while the contract is active.
 *   - rewardBonus:         iron paid once the clause completes.
 *   - fameBonusOnComplete: fame applied once the clause completes.
 *   - famePenaltyOnBreak:  fame loss if the clause breaks.
 *   - durationFights:      how many fights the contract can span before auto-expiring.
 *
 * Tier gates line up with NOTORIETY_TIERS.peakTier:
 *   UNKNOWN → no offers (player must hit Prospect first)
 *   PROSPECT → low-risk entry deals
 *   RISING_STAR → medium stakes, bigger rewards
 *   CONTENDER → title-contender framing, finish-based clauses
 *   STAR / LEGEND → marquee brands, steep penalties, headline payouts
 */

const SPONSOR_OFFERS = [
    // ── PROSPECT ─────────────────────────────────────────────
    {
        id: "REDLINE_ENERGY",
        brand: "Redline Energy",
        tagline: "Fight fuelled. Always.",
        unlockTier: "PROSPECT",
        durationFights: 2,
        clause: { type: "WIN_NEXT_N", n: 2 },
        rewardPerFight: 150,
        rewardBonus: 500,
        fameBonusOnComplete: 100,
        famePenaltyOnBreak: 150,
    },
    {
        id: "CORE_HYDRATE",
        brand: "CoreHydrate",
        tagline: "On-weight, every time.",
        unlockTier: "PROSPECT",
        durationFights: 3,
        clause: { type: "NO_WEIGHT_MISS", n: 3 },
        rewardPerFight: 120,
        rewardBonus: 400,
        fameBonusOnComplete: 80,
        famePenaltyOnBreak: 200,
    },
    {
        id: "APEX_MOUTHGUARDS",
        brand: "Apex Mouthguards",
        tagline: "Keep the teeth. Keep the smile.",
        unlockTier: "PROSPECT",
        durationFights: 3,
        clause: { type: "NO_FINISH_LOSS", n: 3 },
        rewardPerFight: 100,
        rewardBonus: 350,
        fameBonusOnComplete: 60,
        famePenaltyOnBreak: 100,
    },

    // ── RISING STAR ──────────────────────────────────────────
    {
        id: "TITAN_GLOVES",
        brand: "Titan Gloves",
        tagline: "Built to finish.",
        unlockTier: "RISING_STAR",
        durationFights: 2,
        clause: { type: "FINISH_NEXT_N", n: 2 },
        rewardPerFight: 220,
        rewardBonus: 900,
        fameBonusOnComplete: 200,
        famePenaltyOnBreak: 250,
    },
    {
        id: "PREDATOR_NUTRITION",
        brand: "Predator Nutrition",
        tagline: "Strength. Conditioned.",
        unlockTier: "RISING_STAR",
        durationFights: 3,
        clause: { type: "WIN_ANY_N", n: 2 },
        rewardPerFight: 200,
        rewardBonus: 600,
        fameBonusOnComplete: 150,
        famePenaltyOnBreak: 150,
    },
    {
        id: "KONTENDER_KICKS",
        brand: "Kontender Kicks",
        tagline: "Footwear for finishers.",
        unlockTier: "RISING_STAR",
        durationFights: 3,
        clause: { type: "LAND_ONE_KO", n: 3 },
        rewardPerFight: 175,
        rewardBonus: 800,
        fameBonusOnComplete: 175,
        famePenaltyOnBreak: 200,
    },

    // ── CONTENDER ────────────────────────────────────────────
    {
        id: "VANGUARD_APPAREL",
        brand: "Vanguard Apparel",
        tagline: "Dressed for the main event.",
        unlockTier: "CONTENDER",
        durationFights: 3,
        clause: { type: "WIN_NEXT_N", n: 3 },
        rewardPerFight: 320,
        rewardBonus: 1600,
        fameBonusOnComplete: 300,
        famePenaltyOnBreak: 400,
    },
    {
        id: "IRONSIDE_WATCHES",
        brand: "Ironside Watches",
        tagline: "Time matters. Outlast them.",
        unlockTier: "CONTENDER",
        durationFights: 4,
        clause: { type: "NO_FINISH_LOSS", n: 4 },
        rewardPerFight: 280,
        rewardBonus: 1100,
        fameBonusOnComplete: 200,
        famePenaltyOnBreak: 250,
    },

    // ── STAR ─────────────────────────────────────────────────
    {
        id: "BLACKCARD_SPIRITS",
        brand: "Blackcard Spirits",
        tagline: "Toast the finish.",
        unlockTier: "STAR",
        durationFights: 2,
        clause: { type: "FINISH_NEXT_N", n: 2 },
        rewardPerFight: 500,
        rewardBonus: 3000,
        fameBonusOnComplete: 500,
        famePenaltyOnBreak: 600,
    },
    {
        id: "NEBULA_MOTORS",
        brand: "Nebula Motors",
        tagline: "Engineered to dominate.",
        unlockTier: "STAR",
        durationFights: 3,
        clause: { type: "WIN_NEXT_N", n: 3 },
        rewardPerFight: 450,
        rewardBonus: 2500,
        fameBonusOnComplete: 400,
        famePenaltyOnBreak: 500,
    },

    // ── LEGEND ───────────────────────────────────────────────
    {
        id: "SIGNATURE_LINE",
        brand: "Signature Line",
        tagline: "Your name, on every shelf.",
        unlockTier: "LEGEND",
        durationFights: 4,
        clause: { type: "WIN_ANY_N", n: 3 },
        rewardPerFight: 700,
        rewardBonus: 5000,
        fameBonusOnComplete: 1000,
        famePenaltyOnBreak: 800,
    },
];

/** Per-tier slot cap (max active contracts at once). */
const SPONSOR_SLOTS_BY_TIER = {
    UNKNOWN:     0,
    PROSPECT:    1,
    RISING_STAR: 2,
    CONTENDER:   2,
    STAR:        3,
    LEGEND:      4,
};

/** How many offers the available pool surfaces each rotation. */
const AVAILABLE_OFFERS_PER_WEEK = 4;

/** Rotation length in ms — fresh offers every 7 days. */
const OFFER_ROTATION_MS = 7 * 24 * 60 * 60 * 1000;

const SPONSOR_OFFERS_BY_ID = Object.fromEntries(SPONSOR_OFFERS.map((s) => [s.id, s]));

module.exports = {
    SPONSOR_OFFERS,
    SPONSOR_OFFERS_BY_ID,
    SPONSOR_SLOTS_BY_TIER,
    AVAILABLE_OFFERS_PER_WEEK,
    OFFER_ROTATION_MS,
};
