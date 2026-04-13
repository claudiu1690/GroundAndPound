const Opponent = require("../models/opponentModel");

const CHAMPION_TIERS = ["Regional Pro", "National", "GCS"];

/**
 * Seed a new champion for a given tier + weight class.
 * Picks the highest-OVR non-champion opponent in that bracket.
 */
async function seedNewChampion(tier, weightClass) {
    const newChamp = await Opponent.findOne({
        promotionTier: tier,
        weightClass,
        isChampion: false,
    }).sort({ overallRating: -1 });

    if (newChamp) {
        newChamp.isChampion = true;
        newChamp.championTier = tier;
        await newChamp.save();
        return newChamp;
    }
    console.warn(`[champion] No replacement found for ${tier} / ${weightClass}`);
    return null;
}

/**
 * Ensure every gated tier × weight class has exactly one champion.
 * Called on app startup after DB connection.
 */
async function ensureChampionsExist() {
    const { WEIGHT_CLASSES } = require("../consts/gameConstants");
    for (const tier of CHAMPION_TIERS) {
        for (const wc of WEIGHT_CLASSES) {
            const existing = await Opponent.findOne({
                isChampion: true,
                championTier: tier,
                weightClass: wc,
            });
            if (!existing) {
                const seeded = await seedNewChampion(tier, wc);
                if (seeded) {
                    console.log(`[champion] Seeded ${seeded.name} as ${tier} ${wc} champion`);
                }
            }
        }
    }
}

/**
 * Get the current champion for a tier + weight class.
 */
async function getChampion(tier, weightClass) {
    return Opponent.findOne({
        isChampion: true,
        championTier: tier,
        weightClass,
    }).lean();
}

module.exports = { seedNewChampion, ensureChampionsExist, getChampion, CHAMPION_TIERS };
