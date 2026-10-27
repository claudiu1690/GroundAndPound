/**
 * Special Moves Catalog: the derived move -> discipline / teach-slot tables in
 * consts/homeCampConfig.js (MOVE_DOMAIN, MOVE_TEACH_SLOT, DISCIPLINE_LABELS,
 * buildMoveTeachTables) and boot-validation rule 14. Pure consts, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    MOVE_DOMAIN,
    MOVE_TEACH_SLOT,
    DISCIPLINE_LABELS,
    buildMoveTeachTables,
    DOMAIN_TEACH_POOLS,
    TEACH_BREADTH_BY_RARITY,
    TEACH_RANK_BY_SLOT,
    COACH_RARITIES,
    ARCHETYPE_KEYS,
    validateHomeCampConfig,
} = require("../../consts/homeCampConfig");
const { SPECIAL_MOVES } = require("../../consts/specialMovesCatalog");

// [domain, moveId, slot, minCoachRarity, rank] (docs/special-moves-catalog-spec.md §6)
const EXPECTED = [
    ["STRIKING", "HEAVY_HANDS", 0, "COMMON", 2],
    ["STRIKING", "BODY_SNATCHER", 1, "UNCOMMON", 4],
    ["STRIKING", "CLINCH_KILLER", 2, "RARE", 4],
    ["STRIKING", "THE_FINISHER", 3, "LEGENDARY", 4],
    ["STRIKING", "HIGH_GUARD", 4, "LEGENDARY", 4],
    ["STRIKING", "SECOND_GEAR", 5, "LEGENDARY", 4],
    ["STRIKING", "SUPERMAN_PUNCH", 6, "LEGENDARY", 4],
    ["WRESTLING", "SPRAWL_INSTINCT", 0, "COMMON", 2],
    ["WRESTLING", "MOUNT_REAPER", 1, "UNCOMMON", 4],
    ["WRESTLING", "KILLER_INSTINCT", 2, "RARE", 4],
    ["WRESTLING", "DOUBLE_LEG_PRECISION", 3, "LEGENDARY", 4],
    ["WRESTLING", "TOP_CONTROL", 4, "LEGENDARY", 4],
    ["WRESTLING", "BLAST_DOUBLE", 5, "LEGENDARY", 4],
    ["BJJ", "NEVER_TAP", 0, "COMMON", 2],
    ["BJJ", "VETERAN_IQ", 1, "UNCOMMON", 4],
    ["BJJ", "IRON_RECOVERY", 2, "RARE", 4],
    ["BJJ", "FRAME_AND_BASE", 3, "LEGENDARY", 4],
    ["BJJ", "GUILLOTINE_CHOKE", 4, "LEGENDARY", 4],
    ["BJJ", "ARM_TRIANGLE", 5, "LEGENDARY", 4],
    ["CONDITIONING", "GRANITE_JAW", 0, "COMMON", 2],
    ["CONDITIONING", "SECOND_WIND", 1, "UNCOMMON", 4],
    ["CONDITIONING", "PACE_PUSHER", 2, "RARE", 4],
    ["CONDITIONING", "DEEP_WATERS", 3, "LEGENDARY", 4],
    ["CONDITIONING", "FIGHTING_SPIRIT", 4, "LEGENDARY", 4],
];

test("MOVE_DOMAIN covers exactly the 24 catalog ids, each in exactly one teach pool", () => {
    const catalogIds = SPECIAL_MOVES.map((m) => m.id).sort();
    assert.equal(catalogIds.length, 24);
    assert.deepEqual(Object.keys(MOVE_DOMAIN).sort(), catalogIds);

    const flat = Object.values(DOMAIN_TEACH_POOLS).flat();
    for (const id of catalogIds) {
        assert.equal(flat.filter((x) => x === id).length, 1, `${id} must occur exactly once across the teach pools`);
    }
    for (const [domain, pool] of Object.entries(DOMAIN_TEACH_POOLS)) {
        for (const id of pool) assert.equal(MOVE_DOMAIN[id], domain, `${id} domain`);
    }
});

test("MOVE_TEACH_SLOT matches the spec's per-move acquisition table", () => {
    assert.equal(Object.keys(MOVE_TEACH_SLOT).length, EXPECTED.length);
    for (const [domain, id, slot, minCoachRarity, rank] of EXPECTED) {
        assert.equal(MOVE_DOMAIN[id], domain, `${id} domain`);
        assert.deepEqual(
            MOVE_TEACH_SLOT[id],
            { teachSlotIndex: slot, minTeachCoachRarity: minCoachRarity, teachRank: rank },
            id,
        );
    }
});

test("property: min coach rarity is the lowest R with breadth[R] > slot; rank is TEACH_RANK_BY_SLOT[slot]", () => {
    for (const [id, v] of Object.entries(MOVE_TEACH_SLOT)) {
        const i = v.teachSlotIndex;
        assert.equal(DOMAIN_TEACH_POOLS[MOVE_DOMAIN[id]][i], id, `${id} sits at its recorded slot`);
        const lowest = COACH_RARITIES.find((R) => TEACH_BREADTH_BY_RARITY[R] > i);
        assert.equal(v.minTeachCoachRarity, lowest, `${id} min rarity`);
        // Every lower rarity really cannot reach the slot.
        for (const R of COACH_RARITIES.slice(0, COACH_RARITIES.indexOf(lowest))) {
            assert.ok(!(TEACH_BREADTH_BY_RARITY[R] > i), `${R} must not reach ${id} at slot ${i}`);
        }
        assert.equal(v.teachRank, TEACH_RANK_BY_SLOT[i], `${id} rank`);
    }
});

test("both maps and their values are frozen", () => {
    assert.ok(Object.isFrozen(MOVE_DOMAIN));
    assert.ok(Object.isFrozen(MOVE_TEACH_SLOT));
    assert.ok(Object.isFrozen(MOVE_TEACH_SLOT.HEAVY_HANDS));
    assert.ok(Object.isFrozen(DISCIPLINE_LABELS));
    assert.throws(() => { "use strict"; MOVE_TEACH_SLOT.HEAVY_HANDS.teachRank = 1; }, TypeError);
    assert.equal(MOVE_TEACH_SLOT.HEAVY_HANDS.teachRank, 2);
});

test("DISCIPLINE_LABELS is exact and keyed by ARCHETYPE_KEYS", () => {
    assert.deepEqual({ ...DISCIPLINE_LABELS }, {
        STRIKING: "Striking",
        WRESTLING: "Wrestling",
        BJJ: "BJJ",
        CONDITIONING: "Conditioning",
    });
    assert.deepEqual(Object.keys(DISCIPLINE_LABELS).sort(), [...ARCHETYPE_KEYS].sort());
});

test("buildMoveTeachTables: a repeated id is reported and the first occurrence wins", () => {
    const out = buildMoveTeachTables({ A: ["X", "Y"], B: ["Y"] });
    assert.deepEqual(out.duplicateIds, ["Y"]);
    assert.equal(out.moveDomain.Y, "A");
    assert.equal(out.moveTeachSlot.Y.teachSlotIndex, 1);
    // The real pools have no duplicates.
    assert.deepEqual(buildMoveTeachTables().duplicateIds, []);
});

test("buildMoveTeachTables: a slot no rarity reaches gets a null min rarity; rank falls back to max", () => {
    const out = buildMoveTeachTables({ A: ["P", "Q"] }, { COMMON: 1, UNCOMMON: 1, RARE: 1, LEGENDARY: 1 }, { 0: 2 });
    assert.equal(out.moveTeachSlot.P.minTeachCoachRarity, "COMMON");
    assert.equal(out.moveTeachSlot.Q.minTeachCoachRarity, null);
    assert.equal(out.moveTeachSlot.Q.teachRank, 4);
});

test("validateHomeCampConfig (incl. rule 14) passes on the shipped config", () => {
    assert.equal(validateHomeCampConfig(), true);
});
