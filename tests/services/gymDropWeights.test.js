const assert = require("node:assert");
const { test } = require("node:test");

const specialMovesService = require("../../services/specialMovesService");
const { DROP_RARITY_WEIGHTS } = require("../../consts/specialMovesCatalog");

const { dropRarityWeightsForGym } = specialMovesService;

test("dropRarityWeightsForGym: free gym maps to the Community table, LEGENDARY 0", () => {
    const gym = { isFreeGym: true, availableFrom: "Amateur" };
    const weights = dropRarityWeightsForGym(gym);
    assert.deepEqual(weights, DROP_RARITY_WEIGHTS.Community);
    assert.equal(weights.LEGENDARY, 0);
});

test("dropRarityWeightsForGym: free gym ignores availableFrom entirely (always Community)", () => {
    const gym = { isFreeGym: true, availableFrom: "GCS Contender" };
    const weights = dropRarityWeightsForGym(gym);
    assert.deepEqual(weights, DROP_RARITY_WEIGHTS.Community);
});

for (const tier of ["Amateur", "Regional Pro", "National", "GCS Contender"]) {
    test(`dropRarityWeightsForGym: paid gym with availableFrom "${tier}" maps to the ${tier} weight table`, () => {
        const gym = { isFreeGym: false, availableFrom: tier };
        const weights = dropRarityWeightsForGym(gym);
        assert.deepEqual(weights, DROP_RARITY_WEIGHTS[tier]);
    });
}

test("dropRarityWeightsForGym: unmodeled/unknown tier (e.g. GCS, Title Fight, garbage) -> null", () => {
    assert.equal(dropRarityWeightsForGym({ isFreeGym: false, availableFrom: "GCS" }), null);
    assert.equal(dropRarityWeightsForGym({ isFreeGym: false, availableFrom: "Title Fight" }), null);
    assert.equal(dropRarityWeightsForGym({ isFreeGym: false, availableFrom: "NotARealTier" }), null);
    assert.equal(dropRarityWeightsForGym({ isFreeGym: false, availableFrom: undefined }), null);
});

test("dropRarityWeightsForGym: null/undefined gym -> null, never throws", () => {
    assert.equal(dropRarityWeightsForGym(null), null);
    assert.equal(dropRarityWeightsForGym(undefined), null);
});

test("dropRarityWeightsForGym: returned object is a fresh copy -- mutating it does NOT corrupt the shared catalog table", () => {
    const gym = { isFreeGym: false, availableFrom: "National" };
    const weights = dropRarityWeightsForGym(gym);
    const originalCommon = DROP_RARITY_WEIGHTS.National.COMMON;

    weights.COMMON = 999999;
    weights.NEW_BOGUS_KEY = "corrupted";

    assert.equal(DROP_RARITY_WEIGHTS.National.COMMON, originalCommon, "mutating the returned copy must not affect the catalog constant");
    assert.equal(DROP_RARITY_WEIGHTS.National.NEW_BOGUS_KEY, undefined);

    // Second independent call proves each call returns its own copy, not a shared reference.
    const weights2 = dropRarityWeightsForGym(gym);
    assert.equal(weights2.COMMON, originalCommon);
    assert.notEqual(weights2, weights, "each call must return a distinct object reference");
});

test("dropRarityWeightsForGym: weights sum to 100 for every modeled tier (Community + all availableFrom keys)", () => {
    for (const [tier, weights] of Object.entries(DROP_RARITY_WEIGHTS)) {
        const gym = tier === "Community"
            ? { isFreeGym: true, availableFrom: "Amateur" }
            : { isFreeGym: false, availableFrom: tier };
        const result = dropRarityWeightsForGym(gym);
        const sum = Object.values(result).reduce((a, b) => a + b, 0);
        assert.equal(sum, 100, `tier "${tier}" weights must sum to 100, got ${sum}`);
    }
});
