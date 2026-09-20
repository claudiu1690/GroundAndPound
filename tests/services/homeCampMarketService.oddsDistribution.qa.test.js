/**
 * Your Camp PHASE 1 -- statistical check on the renormalised rarity odds (contract Section 2.3,
 * Section 9 sequence item Q3: "odds renormalised (statistical check ~10k rolls)").
 *
 * homeCampMarketService.roll.qa.test.js proves renormalisation with a HAND-SEQUENCED rng
 * (4 fixed draws). This file proves it at scale with a REAL PRNG (mulberry32, the actual stream
 * rollCandidates uses) over thousands of draws, checking the observed proportions land close to
 * the renormalised targets for several gate combinations, and that an ineligible rarity NEVER
 * appears even once in a large sample (a single leak would be a gating bug, not noise).
 *
 * Pure function only, no DB. Run with:
 *   node --test tests/services/homeCampMarketService.oddsDistribution.qa.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const { mulberry32, hashSeed } = require("../../utils/rotation");
const market = require("../../services/homeCampMarketService");
const { MARKET_RARITY_ODDS } = require("../../consts/homeCampConfig");

const SAMPLE_SIZE = 10000;
// A generous statistical tolerance -- this is a smoke check for a gross renormalisation bug
// (e.g. someone folding the ineligible slice into Common), not a strict chi-square test. At
// n=10000 the binomial standard error for a ~50% bucket is well under 1 percentage point, so a
// 3-point band is comfortably loose while still catching a real miscalculation.
const TOLERANCE_PCT = 3;

function sample(rarities, n) {
    const rng = mulberry32(hashSeed(`odds-check-v2:${rarities.join(",")}`));
    const counts = {};
    for (const r of rarities) counts[r] = 0;
    for (let i = 0; i < n; i++) {
        const picked = market.pickRarity(rng, rarities);
        counts[picked] = (counts[picked] || 0) + 1;
    }
    return counts;
}

test("Tier 1 (Common/Uncommon only): observed proportions track the renormalised 64.7% / 35.3% split within tolerance", () => {
    const rarities = ["COMMON", "UNCOMMON"];
    const total = MARKET_RARITY_ODDS.COMMON + MARKET_RARITY_ODDS.UNCOMMON; // 85
    const expectedCommonPct = (MARKET_RARITY_ODDS.COMMON / total) * 100;   // ~64.7
    const expectedUncommonPct = (MARKET_RARITY_ODDS.UNCOMMON / total) * 100; // ~35.3

    const counts = sample(rarities, SAMPLE_SIZE);
    const commonPct = (counts.COMMON / SAMPLE_SIZE) * 100;
    const uncommonPct = (counts.UNCOMMON / SAMPLE_SIZE) * 100;

    assert.ok(
        Math.abs(commonPct - expectedCommonPct) < TOLERANCE_PCT,
        `Common observed ${commonPct.toFixed(2)}% vs expected ~${expectedCommonPct.toFixed(2)}% (renormalised, NOT the raw 55%)`
    );
    assert.ok(
        Math.abs(uncommonPct - expectedUncommonPct) < TOLERANCE_PCT,
        `Uncommon observed ${uncommonPct.toFixed(2)}% vs expected ~${expectedUncommonPct.toFixed(2)}%`
    );
    assert.equal(counts.RARE, undefined, "Rare must never be drawn from a pool that excludes it");
    assert.equal(counts.LEGENDARY, undefined, "Legendary must never be drawn from a pool that excludes it");
});

test("Tier 2/3 (Common/Uncommon/Rare, no Legendary): Rare lands near its renormalised 12/97 share, Legendary never appears", () => {
    const rarities = ["COMMON", "UNCOMMON", "RARE"];
    const total = MARKET_RARITY_ODDS.COMMON + MARKET_RARITY_ODDS.UNCOMMON + MARKET_RARITY_ODDS.RARE; // 97
    const expectedRarePct = (MARKET_RARITY_ODDS.RARE / total) * 100; // ~12.4

    const counts = sample(rarities, SAMPLE_SIZE);
    const rarePct = (counts.RARE / SAMPLE_SIZE) * 100;
    assert.ok(
        Math.abs(rarePct - expectedRarePct) < TOLERANCE_PCT,
        `Rare observed ${rarePct.toFixed(2)}% vs expected ~${expectedRarePct.toFixed(2)}%`
    );
    assert.equal(counts.LEGENDARY, undefined, "Legendary must never leak into a Tier 2/3 (non-Rising-Star) pool");
});

test("full pool (all 4 rarities, Tier 4 + Rising Star): every rarity lands near its RAW published odds (no renormalisation needed when nothing is excluded)", () => {
    const rarities = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"];
    const counts = sample(rarities, SAMPLE_SIZE);
    for (const r of rarities) {
        const observedPct = (counts[r] / SAMPLE_SIZE) * 100;
        const expectedPct = MARKET_RARITY_ODDS[r];
        assert.ok(
            Math.abs(observedPct - expectedPct) < TOLERANCE_PCT,
            `${r} observed ${observedPct.toFixed(2)}% vs published ${expectedPct}%`
        );
    }
    // Legendary is the rarest slice (3%) -- at n=10000 we expect ~300 draws, comfortably enough
    // to prove it is reachable at all (not accidentally gated to zero) without being so common
    // that a market feels flooded with them.
    assert.ok(counts.LEGENDARY > 100, "Legendary must be reachable in the full pool, not accidentally starved");
    assert.ok(counts.LEGENDARY < 700, "Legendary must not be over-weighted relative to its published 3%");
});

test("rollCandidates end-to-end (real mulberry32 stream via campId:weekIndex): composition rules hold over 2000 rolled weeks, and Conditioning/Rare/Legendary respect their gates at every sampled tier", () => {
    const fighterAtTier = (tier, fameTier) => ({ notoriety: { peakTier: fameTier || "UNKNOWN" } });
    const campFor = (id) => ({
        _id: id,
        coaches: [],
        disciplineFamiliarity: {},
        markModified() {},
    });

    for (const tier of [1, 2, 3, 4]) {
        let sawIneligibleRarity = false;
        let sawIneligibleDomain = false;
        for (let wk = 3000; wk < 3000 + 500; wk++) {
            const camp = campFor(`odds-camp-tier${tier}`);
            const fighter = fighterAtTier(tier, "UNKNOWN"); // never Rising Star -> Legendary gate closed
            const out = market.rollCandidates(camp, fighter, wk, tier);
            for (const c of out) {
                if (c.rarity === "LEGENDARY") sawIneligibleRarity = true;
                if (c.rarity === "RARE" && tier < 2) sawIneligibleRarity = true;
                if (c.archetype === "CONDITIONING" && tier < 2) sawIneligibleDomain = true;
            }
        }
        assert.equal(sawIneligibleRarity, false, `tier ${tier} (no Rising Star) must never roll a gate-violating rarity across 500 sampled weeks`);
        assert.equal(sawIneligibleDomain, false, `tier ${tier} must never roll Conditioning below its minCampTier across 500 sampled weeks`);
    }
});
