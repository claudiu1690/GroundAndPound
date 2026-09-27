/**
 * Special Moves Catalog view: specialMovesService.buildCatalog (the body of
 * GET /fighters/:id/moves/catalog). Pure view over consts + a fighter double, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../../config");
const specialMovesService = require("../../services/specialMovesService");
const { buildCatalog, describeMove, toRating, RATING_UNIT_BY_BONUS_TYPE, listMoves } = specialMovesService;
const {
    RARITY,
    RARITY_ORDER,
    rarityRank,
    SPECIAL_MOVES,
    SPECIAL_MOVES_BY_ID,
} = require("../../consts/specialMovesCatalog");
const { MOVE_TEACH_SLOT, COACH_ARCHETYPES } = require("../../consts/homeCampConfig");

function makeFighter(overrides = {}) {
    return {
        promotionTier: "Amateur",
        specialMovesOwned: [],
        specialMovesEquipped: [],
        iron: 0,
        acceptedFightId: null,
        save: async function () { return this; },
        ...overrides,
    };
}

const EXPECTED_ORDER = [
    // STRIKING
    "HEAVY_HANDS", "BODY_SNATCHER", "HIGH_GUARD", "CLINCH_KILLER", "SECOND_GEAR", "THE_FINISHER", "SUPERMAN_PUNCH",
    // WRESTLING
    "DOUBLE_LEG_PRECISION", "SPRAWL_INSTINCT", "MOUNT_REAPER", "TOP_CONTROL", "KILLER_INSTINCT", "BLAST_DOUBLE",
    // BJJ
    "VETERAN_IQ", "FRAME_AND_BASE", "NEVER_TAP", "GUILLOTINE_CHOKE", "IRON_RECOVERY", "ARM_TRIANGLE",
    // CONDITIONING
    "GRANITE_JAW", "PACE_PUSHER", "SECOND_WIND", "DEEP_WATERS", "FIGHTING_SPIRIT",
];

const MOVE_VIEW_KEYS = [
    "moveId", "name", "rarity", "effectType", "bonusType", "triggerCondition", "value",
    "description", "flavor", "art", "acquiredAt", "owned", "isEquipped", "slotIndex",
];

const TEACH_OFF_TEXT = "Not currently teachable. Train for it instead.";
const trainText = (coach) =>
    `Also drops from the flagship session of any ${coach} who knows it, and from Open Mat Sparring: a chance, more rounds, better odds. Your camp's tier decides how rare a drop can be, not how often one happens.`;

const byId = (catalog, id) => catalog.moves.find((m) => m.moveId === id);

/** Run `body` with CAMP_TEACH_CHANNEL forced to `value`, always restoring the real flag. */
function withTeachChannel(value, body) {
    const real = config.features.campTeachChannel;
    config.features.campTeachChannel = value;
    try {
        return body();
    } finally {
        config.features.campTeachChannel = real;
    }
}

test("legacy fighter (no moves): 24 entries in exact catalog order, all unowned", () => {
    const cat = buildCatalog(makeFighter());
    assert.deepEqual(cat.moves.map((m) => m.moveId), EXPECTED_ORDER);
    assert.equal(cat.moves.length, SPECIAL_MOVES.length);
    for (const m of cat.moves) {
        assert.equal(m.owned, false, m.moveId);
        assert.equal(m.isEquipped, false, m.moveId);
    }
    // A fighter doc missing both arrays entirely (pre-feature) is also fine.
    const bare = buildCatalog({ promotionTier: "Amateur" });
    assert.equal(bare.moves.length, 24);
});

test("every entry carries exactly the MoveView keys plus the catalog fields", () => {
    const cat = buildCatalog(makeFighter());
    const expected = [...MOVE_VIEW_KEYS, "minRarity", "domain", "domainLabel", "ladder", "howToGet"].sort();
    for (const m of cat.moves) {
        assert.deepEqual(Object.keys(m).sort(), expected, m.moveId);
        assert.deepEqual(Object.keys(m.howToGet).sort(), ["teach", "teachText", "trainText"], m.moveId);
        assert.equal(m.minRarity, SPECIAL_MOVES_BY_ID[m.moveId].minRarity);
    }
});

test("ladder: dense from minRarity, Signatures 2 rungs else 4, rating = round(value*1000)", () => {
    const cat = buildCatalog(makeFighter());
    for (const m of cat.moves) {
        const def = SPECIAL_MOVES_BY_ID[m.moveId];
        assert.deepEqual(m.ladder.map((r) => r.rarity), RARITY_ORDER.slice(rarityRank[def.minRarity]), m.moveId);
        assert.equal(m.ladder.length, def.effectType === "SIGNATURE" ? 2 : 4, m.moveId);
        for (const rung of m.ladder) {
            assert.equal(rung.value, def.values[rung.rarity]);
            assert.equal(rung.rating, Math.round(rung.value * 1000));
            assert.equal(rung.rating, toRating(rung.value));
            assert.deepEqual(Object.keys(rung).sort(), ["rarity", "rating", "unit", "value"]);
        }
    }
    const ratings = (id) => byId(cat, id).ladder.map((r) => r.rating);
    assert.deepEqual(ratings("HEAVY_HANDS"), [9, 16, 26, 35]);
    assert.deepEqual(ratings("THE_FINISHER"), [80, 150]);
    assert.deepEqual(ratings("PACE_PUSHER"), [40, 42, 46, 50]);
});

test("unit parity: every rung's `+rating unit` appears verbatim in describeMove's card text", () => {
    const cat = buildCatalog(makeFighter());
    for (const def of SPECIAL_MOVES) {
        assert.ok(
            Object.prototype.hasOwnProperty.call(RATING_UNIT_BY_BONUS_TYPE, def.bonusType),
            `RATING_UNIT_BY_BONUS_TYPE has no key for ${def.bonusType}`,
        );
        for (const rung of byId(cat, def.id).ladder) {
            const text = describeMove(def, rung.value);
            const needle = `+${rung.rating} ${rung.unit}`;
            assert.ok(text.includes(needle), `${def.id} ${rung.rarity}: "${text}" must include "${needle}"`);
        }
    }
});

test("owned + equipped: HEAVY_HANDS at RARE in slot 0 renders like listMoves' owned entry", () => {
    const acquiredAt = new Date("2026-09-01T12:00:00Z");
    const f = makeFighter({
        specialMovesOwned: [{ moveId: "HEAVY_HANDS", rarity: RARITY.RARE, acquiredAt }],
        specialMovesEquipped: ["HEAVY_HANDS"],
    });
    const m = byId(buildCatalog(f), "HEAVY_HANDS");
    assert.equal(m.rarity, "RARE");
    assert.equal(m.owned, true);
    assert.equal(m.isEquipped, true);
    assert.equal(m.slotIndex, 0);
    assert.equal(m.value, 0.026);
    assert.equal(m.acquiredAt, acquiredAt);
    assert.ok(m.description.includes("+26 Power Rating"), m.description);

    const listed = listMoves(f).owned.find((o) => o.moveId === "HEAVY_HANDS");
    const pick = (o) => Object.fromEntries(MOVE_VIEW_KEYS.map((k) => [k, o[k]]));
    assert.deepEqual(pick(m), listed);
});

test("unowned: rarity/value/acquiredAt null, never equipped, numberless description", () => {
    const cat = buildCatalog(makeFighter({
        specialMovesOwned: [{ moveId: "HEAVY_HANDS", rarity: RARITY.COMMON, acquiredAt: new Date() }],
    }));
    for (const m of cat.moves.filter((x) => x.moveId !== "HEAVY_HANDS")) {
        const def = SPECIAL_MOVES_BY_ID[m.moveId];
        assert.equal(m.rarity, null, m.moveId);
        assert.equal(m.value, null, m.moveId);
        assert.equal(m.acquiredAt, null, m.moveId);
        assert.equal(m.owned, false, m.moveId);
        assert.equal(m.isEquipped, false, m.moveId);
        assert.equal(m.slotIndex, null, m.moveId);
        assert.equal(m.description, describeMove(def, null), m.moveId);
        assert.doesNotMatch(m.description, /\+\d/, m.moveId);
    }
});

test("corrupt state: equipped-but-unowned never reads equipped; stale owned id ignored", () => {
    const f = makeFighter({
        specialMovesOwned: [
            { moveId: "NOT_A_REAL_MOVE", rarity: RARITY.RARE, acquiredAt: new Date() },
            { moveId: "GRANITE_JAW", rarity: RARITY.UNCOMMON, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["SUPERMAN_PUNCH", "GRANITE_JAW"],
    });
    const cat = buildCatalog(f);
    assert.equal(cat.moves.length, 24);
    assert.ok(!cat.moves.some((m) => m.moveId === "NOT_A_REAL_MOVE"));

    const sup = byId(cat, "SUPERMAN_PUNCH");
    assert.equal(sup.owned, false);
    assert.equal(sup.isEquipped, false);
    assert.equal(sup.slotIndex, null);

    const gj = byId(cat, "GRANITE_JAW");
    assert.equal(gj.owned, true);
    assert.equal(gj.isEquipped, true);
    assert.equal(gj.slotIndex, 1, "slot index is the real equipped position");
});

test("never mutates the fighter", () => {
    const f = makeFighter({
        specialMovesOwned: [{ moveId: "THE_FINISHER", rarity: RARITY.LEGENDARY, acquiredAt: new Date("2026-01-01T00:00:00Z") }],
        specialMovesEquipped: ["THE_FINISHER"],
        iron: 123,
    });
    const snapshot = JSON.stringify(f);
    buildCatalog(f);
    buildCatalog(f);
    assert.equal(JSON.stringify(f), snapshot);
});

test("teach channel on: teach block per the table and exact teach copy", () => {
    const cat = withTeachChannel(true, () => buildCatalog(makeFighter()));
    assert.equal(cat.teachChannel, true);
    for (const m of cat.moves) {
        const slot = MOVE_TEACH_SLOT[m.moveId];
        assert.deepEqual(m.howToGet.teach, {
            slotIndex: slot.teachSlotIndex,
            minCoachRarity: slot.minTeachCoachRarity,
            rank: slot.teachRank,
            coachLabel: COACH_ARCHETYPES[m.domain].label,
        }, m.moveId);
        assert.equal(m.howToGet.trainText, trainText(COACH_ARCHETYPES[m.domain].label), m.moveId);
    }
    const t = (id) => byId(cat, id).howToGet.teachText;
    assert.equal(t("HEAVY_HANDS"), "Taught by a Striking Coach: any rarity, at Rank 2.");
    assert.equal(t("BODY_SNATCHER"), "Taught by an Uncommon-or-better Striking Coach, at Rank 4.");
    assert.equal(t("CLINCH_KILLER"), "Taught by a Rare-or-better Striking Coach, at Rank 4.");
    assert.equal(t("THE_FINISHER"), "Legendary Striking Coach only, at Rank 4.");
    assert.equal(t("NEVER_TAP"), "Taught by a BJJ Professor: any rarity, at Rank 2.");

    const hh = byId(cat, "HEAVY_HANDS");
    assert.equal(hh.domain, "STRIKING");
    assert.equal(hh.domainLabel, "Striking");
    assert.equal(hh.howToGet.trainText, trainText("Striking Coach"));
    assert.equal(byId(cat, "GRANITE_JAW").domainLabel, "Conditioning");
    assert.equal(byId(cat, "ARM_TRIANGLE").domainLabel, "BJJ");
});

test("teach channel off: teachChannel false, every teach null, off text, trainText unchanged", () => {
    const on = withTeachChannel(true, () => buildCatalog(makeFighter()));
    const off = withTeachChannel(false, () => buildCatalog(makeFighter()));
    assert.equal(off.teachChannel, false);
    for (const m of off.moves) {
        assert.equal(m.howToGet.teach, null, m.moveId);
        assert.equal(m.howToGet.teachText, TEACH_OFF_TEXT, m.moveId);
        assert.equal(m.howToGet.trainText, byId(on, m.moveId).howToGet.trainText, m.moveId);
    }
    // The flag is read per call, not cached: flipping back restores the teach blocks.
    const again = withTeachChannel(true, () => buildCatalog(makeFighter()));
    assert.equal(again.teachChannel, true);
    assert.ok(again.moves.every((m) => m.howToGet.teach !== null));
});

test("no em dash in any teachText or trainText (both flag states)", () => {
    for (const flag of [true, false]) {
        const cat = withTeachChannel(flag, () => buildCatalog(makeFighter()));
        for (const m of cat.moves) {
            assert.ok(!m.howToGet.teachText.includes("—"), `${m.moveId} teachText`);
            assert.ok(!m.howToGet.trainText.includes("—"), `${m.moveId} trainText`);
        }
    }
});

test("request isolation: two calls return distinct objects; mutating one leaks nothing", () => {
    const f = makeFighter();
    const a = withTeachChannel(true, () => buildCatalog(f));
    const b = withTeachChannel(true, () => buildCatalog(f));
    assert.notEqual(a, b);
    assert.notEqual(a.moves, b.moves);
    assert.notEqual(a.moves[0], b.moves[0]);
    assert.notEqual(a.moves[0].ladder, b.moves[0].ladder);
    assert.notEqual(a.moves[0].ladder[0], b.moves[0].ladder[0]);
    assert.notEqual(a.moves[0].howToGet, b.moves[0].howToGet);
    assert.notEqual(a.moves[0].howToGet.teach, b.moves[0].howToGet.teach);

    a.moves[0].ladder[0].rating = 99999;
    a.moves[0].ladder.push({ rarity: "MYTHIC" });
    a.moves[0].howToGet.teach.rank = 1;
    a.moves.reverse();

    const c = withTeachChannel(true, () => buildCatalog(f));
    assert.deepEqual(c.moves.map((m) => m.moveId), EXPECTED_ORDER);
    assert.equal(c.moves[0].ladder.length, 4);
    assert.equal(c.moves[0].ladder[0].rating, 9);
    assert.equal(c.moves[0].howToGet.teach.rank, 2);
    assert.equal(MOVE_TEACH_SLOT.HEAVY_HANDS.teachRank, 2, "the shared const is untouched");
});
