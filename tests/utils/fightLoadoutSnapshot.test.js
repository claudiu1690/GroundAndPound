const assert = require("node:assert");
const { test } = require("node:test");

const { buildLoadoutSnapshot } = require("../../utils/fightLoadoutSnapshot");
const specialMovesService = require("../../services/specialMovesService");
const { SPECIAL_MOVES_BY_ID } = require("../../consts/specialMovesCatalog");

function quiet(fn) {
    const warn = console.warn;
    const error = console.error;
    console.warn = () => {};
    console.error = () => {};
    try { return fn(); } finally { console.warn = warn; console.error = error; }
}

test("moves: catalog name/art/type, entry rarity, triggered + firedCount, equipped order", () => {
    const snap = buildLoadoutSnapshot({
        moveBonuses: [
            { moveId: "SPRAWL_INSTINCT", moveIds: ["SPRAWL_INSTINCT"], bonusType: "SPRAWL_SUCCESS", effectType: "PROC", triggerCondition: "OPPONENT_SHOOTS_TAKEDOWN", rarity: "RARE", triggered: true, triggerCount: 2 },
            { moveId: "THE_FINISHER", bonusType: "SIG_FINISHER_STRIKE", effectType: "SIGNATURE", triggerCondition: "OPPONENT_HEALTH_BELOW_75", rarity: "LEGENDARY", triggered: false, triggerCount: 0 },
        ],
        sessionBonuses: [],
        equippedOrder: ["THE_FINISHER", "SPRAWL_INSTINCT"],
        ownedRarities: {},
    });
    assert.deepStrictEqual(snap.moves.map((m) => m.moveId), ["THE_FINISHER", "SPRAWL_INSTINCT"]);
    const fin = snap.moves[0];
    assert.equal(fin.name, SPECIAL_MOVES_BY_ID.THE_FINISHER.name);
    assert.equal(fin.art, SPECIAL_MOVES_BY_ID.THE_FINISHER.art);
    assert.equal(fin.effectType, "SIGNATURE");
    assert.equal(fin.rarity, "LEGENDARY");
    assert.equal(fin.triggered, false);
    assert.equal(fin.firedCount, 0);
    const spr = snap.moves[1];
    assert.equal(spr.triggered, true);
    assert.equal(spr.firedCount, 2);
    assert.equal(spr.bonusType, "SPRAWL_SUCCESS");
    assert.equal(spr.triggerCondition, "OPPONENT_SHOOTS_TAKEDOWN");
});

test("merged entry expands to one row per moveId, both carrying the entry's count", () => {
    const mb = specialMovesService.buildMoveBonuses({
        specialMovesOwned: [
            { moveId: "MOUNT_REAPER", rarity: "RARE" },
            { moveId: "TOP_CONTROL", rarity: "COMMON" },
        ],
        specialMovesEquipped: ["MOUNT_REAPER", "TOP_CONTROL"],
    });
    assert.equal(mb.length, 1, "fixture: Full Mount + Top Control merge");
    assert.equal(mb[0].rarity, "RARE", "buildMoveBonuses: merged entry keeps the first move's rarity");
    mb[0].triggered = true;
    mb[0].triggerCount = 3;
    const snap = buildLoadoutSnapshot({
        moveBonuses: mb,
        equippedOrder: ["TOP_CONTROL", "MOUNT_REAPER"],
        ownedRarities: { MOUNT_REAPER: "RARE", TOP_CONTROL: "COMMON" },
    });
    assert.deepStrictEqual(snap.moves.map((m) => [m.moveId, m.firedCount, m.triggered]), [
        ["TOP_CONTROL", 3, true],
        ["MOUNT_REAPER", 3, true],
    ]);
});

test("buildMoveBonuses carries rarity on signatures and singles", () => {
    const mb = specialMovesService.buildMoveBonuses({
        specialMovesOwned: [
            { moveId: "THE_FINISHER", rarity: "RARE" },
            { moveId: "HEAVY_HANDS", rarity: "UNCOMMON" },
        ],
        specialMovesEquipped: ["THE_FINISHER", "HEAVY_HANDS"],
    });
    const byId = Object.fromEntries(mb.map((b) => [b.moveId, b]));
    assert.equal(byId.THE_FINISHER.rarity, "RARE");
    assert.equal(byId.HEAVY_HANDS.rarity, "UNCOMMON");
});

test("legacy frozen entry (no effectType, no rarity) falls back to catalog type and owned rarity", () => {
    const snap = buildLoadoutSnapshot({
        moveBonuses: [{ moveId: "NEVER_TAP", bonusType: "ESCAPE_PROBABILITY", effectiveValue: 0.1, triggered: true, triggerCount: 1 }],
        equippedOrder: ["NEVER_TAP"],
        ownedRarities: { NEVER_TAP: "UNCOMMON" },
    });
    assert.equal(snap.moves.length, 1);
    assert.equal(snap.moves[0].effectType, SPECIAL_MOVES_BY_ID.NEVER_TAP.effectType);
    assert.equal(snap.moves[0].rarity, "UNCOMMON");
    assert.equal(snap.moves[0].firedCount, 1);
});

test("persona lanes and unknown ids are skipped; duplicates dedupe; unknown-order ids go last in input order", () => {
    const snap = quiet(() => buildLoadoutSnapshot({
        moveBonuses: [
            { moveId: "persona:BOOGEYMAN", bonusType: "OPPONENT_DAMAGE_REDUCTION", triggered: true, triggerCount: 4 },
            { moveId: "NOT_A_MOVE", bonusType: "STRIKE_DAMAGE", triggered: true, triggerCount: 1 },
            { moveId: "SECOND_WIND", effectType: "PROC", triggered: true, triggerCount: 1 },
            { moveId: "CLINCH_KILLER", effectType: "PROC", triggered: false, triggerCount: 0 },
            { moveId: "SECOND_WIND", effectType: "PROC", triggered: true, triggerCount: 9 },
        ],
        equippedOrder: ["CLINCH_KILLER"],
    }));
    assert.deepStrictEqual(snap.moves.map((m) => m.moveId), ["CLINCH_KILLER", "SECOND_WIND"]);
    assert.equal(snap.moves[1].firedCount, 1, "first occurrence wins on duplicates");
});

test("camp: one row per session bonus, label falls back to the session config label", () => {
    const snap = buildLoadoutSnapshot({
        moveBonuses: [],
        sessionBonuses: [
            { sessionType: "TAKEDOWN_DEFENCE", label: "Takedown Defence Drilling", matchStatus: "MATCHED", bonusType: "SPRAWL_SUCCESS", triggered: true, triggerCount: 1 },
            { sessionType: "CARDIO_PUSH", matchStatus: "PARTIAL", bonusType: "STAMINA_DRAIN", triggered: false, triggerCount: 0 },
        ],
    });
    assert.deepStrictEqual(snap.camp[0], {
        sessionType: "TAKEDOWN_DEFENCE", label: "Takedown Defence Drilling", matchStatus: "MATCHED", triggered: true, firedCount: 1,
    });
    assert.equal(snap.camp[1].triggered, false);
    assert.equal(snap.camp[1].firedCount, 0);
    assert.ok(typeof snap.camp[1].label === "string" && snap.camp[1].label.length > 0);
});

test("never throws: bad input gives empty arrays", () => {
    for (const bad of [undefined, null, {}, { moveBonuses: "x", sessionBonuses: 5 }, { moveBonuses: [null, 3, "a"], sessionBonuses: [null, []] }]) {
        const snap = quiet(() => buildLoadoutSnapshot(bad));
        assert.deepStrictEqual(snap, { moves: [], camp: [] });
    }
    assert.deepStrictEqual(buildLoadoutSnapshot(), { moves: [], camp: [] });
});
