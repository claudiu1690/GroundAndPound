/**
 * Special Moves v2: coach teach pools and the teach ladder (consts/homeCampConfig.js), plus the
 * live-pool teach matrix through homeCampCoachService.resolveTeachGrants.
 *
 * Pure: requiring the coach service loads Mongoose models but never connects; no DB is touched.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    DOMAIN_TEACH_POOLS,
    TEACH_RANK_BY_SLOT,
    TEACH_BREADTH_BY_RARITY,
    validateHomeCampConfig,
} = require("../../consts/homeCampConfig");
const { SPECIAL_MOVES, SPECIAL_MOVES_BY_ID } = require("../../consts/specialMovesCatalog");
const coachService = require("../../services/homeCampCoachService");
const config = require("../../config");

const V2_POOLS = {
    STRIKING: ["HEAVY_HANDS", "BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER", "HIGH_GUARD", "SECOND_GEAR", "SUPERMAN_PUNCH"],
    WRESTLING: ["SPRAWL_INSTINCT", "MOUNT_REAPER", "KILLER_INSTINCT", "DOUBLE_LEG_PRECISION", "TOP_CONTROL", "BLAST_DOUBLE"],
    BJJ: ["NEVER_TAP", "VETERAN_IQ", "IRON_RECOVERY", "FRAME_AND_BASE", "GUILLOTINE_CHOKE", "ARM_TRIANGLE"],
    CONDITIONING: ["GRANITE_JAW", "SECOND_WIND", "PACE_PUSHER", "DEEP_WATERS", "FIGHTING_SPIRIT"],
};

// What existing coaches already carry in teachPoolMoveIds (v1 pools).
const V1_POOLS = {
    STRIKING: ["HEAVY_HANDS", "BODY_SNATCHER", "CLINCH_KILLER", "THE_FINISHER"],
    WRESTLING: ["SPRAWL_INSTINCT", "MOUNT_REAPER", "KILLER_INSTINCT"],
    BJJ: ["NEVER_TAP", "VETERAN_IQ", "IRON_RECOVERY"],
    CONDITIONING: ["GRANITE_JAW", "SECOND_WIND"],
};

test("pools are exactly the v2 arrays, frozen", () => {
    assert.deepEqual(Object.keys(DOMAIN_TEACH_POOLS).sort(), Object.keys(V2_POOLS).sort());
    for (const [domain, pool] of Object.entries(V2_POOLS)) {
        assert.deepEqual([...DOMAIN_TEACH_POOLS[domain]], pool, domain);
        assert.ok(Object.isFrozen(DOMAIN_TEACH_POOLS[domain]), `${domain} pool must stay frozen`);
    }
});

test("v1 pools are prefixes of the v2 pools (existing coaches' stored slots never move)", () => {
    for (const [domain, v1] of Object.entries(V1_POOLS)) {
        assert.deepEqual([...DOMAIN_TEACH_POOLS[domain]].slice(0, v1.length), v1, domain);
    }
});

test("the union of all pools is exactly the 24 catalog ids, each once", () => {
    const all = Object.values(DOMAIN_TEACH_POOLS).flat();
    assert.equal(all.length, 24);
    assert.equal(new Set(all).size, 24);
    assert.deepEqual([...all].sort(), SPECIAL_MOVES.map((m) => m.id).sort());
});

test("TEACH_RANK_BY_SLOT covers the 7-long pool", () => {
    assert.deepEqual({ ...TEACH_RANK_BY_SLOT }, { 0: 2, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 });
});

test("validateHomeCampConfig() passes with the v2 pools", () => {
    assert.equal(validateHomeCampConfig(), true);
});

function liveCoach(domain, rarity) {
    const breadth = TEACH_BREADTH_BY_RARITY[rarity];
    return {
        archetype: domain, rarity, rank: 1,
        // Same slice homeCampMarketService.generateCandidate stores at generation.
        teachPoolMoveIds: [...DOMAIN_TEACH_POOLS[domain]].slice(0, breadth),
        taughtMoveIds: [],
    };
}

test("live-pool matrix: rank 2 teaches 1, rank 4 teaches min(breadth, len) - 1", (t) => {
    if (!config.features.campTeachChannel) {
        t.skip("CAMP_TEACH_CHANNEL=false in this environment; resolveTeachGrants is switched off");
        return;
    }
    for (const domain of Object.keys(V2_POOLS)) {
        const len = V2_POOLS[domain].length;
        for (const rarity of Object.keys(TEACH_BREADTH_BY_RARITY)) {
            const c = liveCoach(domain, rarity);
            const n = Math.min(TEACH_BREADTH_BY_RARITY[rarity], len);
            const r2 = coachService.resolveTeachGrants(c, 2);
            assert.equal(r2.length, 1, `${domain}/${rarity} @ rank 2`);
            assert.equal(r2[0].moveId, V2_POOLS[domain][0]);
            const r4 = coachService.resolveTeachGrants(c, 4);
            assert.equal(r4.length, n - 1, `${domain}/${rarity} @ rank 4`);
            assert.deepEqual(r4.map((g) => g.moveId), V2_POOLS[domain].slice(1, n));
        }
    }
    // The headline: a Legendary Striking coach teaches all 6 remaining moves at rank 4.
    assert.equal(coachService.resolveTeachGrants(liveCoach("STRIKING", "LEGENDARY"), 4).length, 6);
});

test("COMMON and UNCOMMON coaches never reach a Signature", () => {
    for (const domain of Object.keys(V2_POOLS)) {
        for (const rarity of ["COMMON", "UNCOMMON"]) {
            for (const id of liveCoach(domain, rarity).teachPoolMoveIds) {
                assert.notEqual(SPECIAL_MOVES_BY_ID[id].effectType, "SIGNATURE", `${domain}/${rarity} reaches ${id}`);
            }
        }
    }
});
