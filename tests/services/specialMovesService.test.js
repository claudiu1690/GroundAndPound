const assert = require("node:assert");
const { test } = require("node:test");

const specialMovesService = require("../../services/specialMovesService");
const { RARITY, SPECIAL_MOVES_BY_ID } = require("../../consts/specialMovesCatalog");

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

test("grantOrUpgrade: unowned move -> NEW, pushed at rolled rarity", () => {
    const f = makeFighter();
    const res = specialMovesService.grantOrUpgrade(f, "GRANITE_JAW", RARITY.COMMON);
    assert.equal(res.outcome, "NEW");
    assert.equal(f.specialMovesOwned.length, 1);
    assert.equal(f.specialMovesOwned[0].moveId, "GRANITE_JAW");
    assert.equal(f.specialMovesOwned[0].rarity, RARITY.COMMON);
});

test("grantOrUpgrade: owned COMMON + rolled COMMON (equal rarity) -> DUPLICATE, cash awarded, no ownership change", () => {
    const f = makeFighter({ specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() }] });
    const before = f.iron;
    const res = specialMovesService.grantOrUpgrade(f, "GRANITE_JAW", RARITY.COMMON);
    assert.equal(res.outcome, "DUPLICATE");
    assert.equal(f.specialMovesOwned.length, 1);
    assert.equal(f.specialMovesOwned[0].rarity, RARITY.COMMON, "rarity must NOT change on a same-rarity duplicate");
    assert.ok(f.iron > before, "cash must be awarded on duplicate");
    assert.equal(res.cashAwarded, 100);
});

test("grantOrUpgrade: owned COMMON + rolled UNCOMMON (strictly higher) -> UPGRADE in place", () => {
    const f = makeFighter({ specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() }] });
    const res = specialMovesService.grantOrUpgrade(f, "GRANITE_JAW", RARITY.UNCOMMON);
    assert.equal(res.outcome, "UPGRADE");
    assert.equal(f.specialMovesOwned.length, 1, "upgrade must not create a second entry");
    assert.equal(f.specialMovesOwned[0].rarity, RARITY.UNCOMMON);
    assert.equal(res.fromRarity, RARITY.COMMON);
    assert.equal(res.toRarity, RARITY.UNCOMMON);
});

test("grantOrUpgrade: owned RARE + rolled COMMON (strictly lower) -> DUPLICATE, rarity untouched", () => {
    const f = makeFighter({ specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.RARE, acquiredAt: new Date() }] });
    const res = specialMovesService.grantOrUpgrade(f, "GRANITE_JAW", RARITY.COMMON);
    assert.equal(res.outcome, "DUPLICATE");
    assert.equal(f.specialMovesOwned[0].rarity, RARITY.RARE);
    assert.equal(res.cashAwarded, 100, "cash is keyed by ROLLED rarity, not owned rarity");
});

test("grantOrUpgrade: UPGRADE preserves original acquiredAt", () => {
    const acquiredAt = new Date("2020-01-01T00:00:00Z");
    const f = makeFighter({ specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt }] });
    specialMovesService.grantOrUpgrade(f, "GRANITE_JAW", RARITY.LEGENDARY);
    assert.equal(f.specialMovesOwned[0].acquiredAt.getTime(), acquiredAt.getTime());
});

test("grantOrUpgrade: owned-set invariant -- repeated grants never create a 2nd entry for the same moveId", () => {
    const f = makeFighter();
    const rarities = [RARITY.COMMON, RARITY.COMMON, RARITY.UNCOMMON, RARITY.COMMON, RARITY.RARE, RARITY.COMMON, RARITY.LEGENDARY];
    for (const r of rarities) specialMovesService.grantOrUpgrade(f, "GRANITE_JAW", r);
    const entries = f.specialMovesOwned.filter((o) => o.moveId === "GRANITE_JAW");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].rarity, RARITY.LEGENDARY, "should have ratcheted up to the best rolled rarity");
});

test("grantOrUpgrade: unknown moveId is guarded, returns null, does not throw or corrupt state", () => {
    const f = makeFighter();
    const res = specialMovesService.grantOrUpgrade(f, "NOT_A_REAL_MOVE", RARITY.COMMON);
    assert.equal(res, null);
    assert.equal(f.specialMovesOwned.length, 0);
});

test("buildMoveBonuses: two equipped moves sharing a bonusType (GRANITE_JAW + VETERAN_IQ, both OPPONENT_DAMAGE_REDUCTION) collapse into ONE summed entry", () => {
    const f = makeFighter({
        specialMovesOwned: [
            { moveId: "GRANITE_JAW", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "VETERAN_IQ", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["GRANITE_JAW", "VETERAN_IQ"],
    });
    const bonuses = specialMovesService.buildMoveBonuses(f);
    const reductionEntries = bonuses.filter((b) => b.bonusType === "OPPONENT_DAMAGE_REDUCTION");
    assert.equal(reductionEntries.length, 1, "must collapse to exactly one entry, not silently drop one");
    const expectedSum = SPECIAL_MOVES_BY_ID.GRANITE_JAW.values.LEGENDARY + SPECIAL_MOVES_BY_ID.VETERAN_IQ.values.LEGENDARY;
    assert.equal(reductionEntries[0].effectiveValue, expectedSum);
});

test("buildMoveBonuses: SIGNATURE entries are never merged, even when sharing a triggerCondition", () => {
    const f = makeFighter({
        specialMovesOwned: [
            { moveId: "THE_FINISHER", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "KILLER_INSTINCT", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["THE_FINISHER", "KILLER_INSTINCT"],
    });
    const bonuses = specialMovesService.buildMoveBonuses(f);
    const sigEntries = bonuses.filter((b) => b.effectType === "SIGNATURE");
    assert.equal(sigEntries.length, 2, "both signatures present independently (different bonusTypes+moveIds)");
    const ids = sigEntries.map((b) => b.moveId).sort();
    assert.deepStrictEqual(ids, ["KILLER_INSTINCT", "THE_FINISHER"]);
});

test("buildMoveBonuses: returns FRESH array/object references on every call (no shared mutable state)", () => {
    const f = makeFighter({
        specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() }],
        specialMovesEquipped: ["GRANITE_JAW"],
    });
    const a = specialMovesService.buildMoveBonuses(f);
    const b = specialMovesService.buildMoveBonuses(f);
    assert.notStrictEqual(a, b, "array identity must differ");
    assert.notStrictEqual(a[0], b[0], "entry object identity must differ");
    a[0].triggered = true;
    a[0].effectiveValue = 999;
    assert.equal(b[0].triggered, false);
    assert.notEqual(b[0].effectiveValue, 999);
});

test("buildMoveBonuses: never emits NaN when an equipped move is not actually owned (inconsistent state)", () => {
    const f = makeFighter({
        specialMovesOwned: [],
        specialMovesEquipped: ["GRANITE_JAW"],
    });
    const bonuses = specialMovesService.buildMoveBonuses(f);
    assert.deepStrictEqual(bonuses, []);
});

test("buildMoveBonuses: never emits NaN when the owned rarity has no matching value entry", () => {
    const f = makeFighter({
        specialMovesOwned: [{ moveId: "THE_FINISHER", rarity: "MYTHIC_TYPO", acquiredAt: new Date() }],
        specialMovesEquipped: ["THE_FINISHER"],
    });
    const bonuses = specialMovesService.buildMoveBonuses(f);
    assert.equal(bonuses.length, 0, "entry with unresolvable value must be skipped, not emit NaN");
});

test("buildMoveBonuses: legacy fighter with no specialMoves fields at all does not crash", () => {
    const f = { promotionTier: "Amateur" };
    const bonuses = specialMovesService.buildMoveBonuses(f);
    assert.deepStrictEqual(bonuses, []);
});

test("listMoves: legacy fighter (no specialMoves fields) does not crash and returns empty views", () => {
    const f = { promotionTier: "National" };
    const view = specialMovesService.listMoves(f);
    assert.deepStrictEqual(view.owned, []);
    assert.deepStrictEqual(view.equipped, []);
    assert.equal(view.slotsUnlocked, 3);
});

test("deriveSlots: Amateur=1, Regional Pro=2, National=3, GCS Contender=3 (no 4th slot)", () => {
    assert.equal(specialMovesService.deriveSlots({ promotionTier: "Amateur" }).slotsUnlocked, 1);
    assert.equal(specialMovesService.deriveSlots({ promotionTier: "Regional Pro" }).slotsUnlocked, 2);
    assert.equal(specialMovesService.deriveSlots({ promotionTier: "National" }).slotsUnlocked, 3);
    assert.equal(specialMovesService.deriveSlots({ promotionTier: "GCS Contender" }).slotsUnlocked, 3);
});

test("equipMove: rejects a move the fighter does not own", async () => {
    const f = makeFighter();
    await assert.rejects(() => specialMovesService.equipMove(f, "GRANITE_JAW", 0), (err) => /don.t own/.test(err.message));
});

test("equipMove: rejects when the camp is locked (acceptedFightId set)", async () => {
    const f = makeFighter({
        specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() }],
        acceptedFightId: "someFightId",
    });
    await assert.rejects(() => specialMovesService.equipMove(f, "GRANITE_JAW", 0), /active fight camp/);
});

test("equipMove: rejects slotIndex >= slotsUnlocked", async () => {
    const f = makeFighter({
        promotionTier: "Amateur",
        specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() }],
    });
    await assert.rejects(() => specialMovesService.equipMove(f, "GRANITE_JAW", 1), /Slot not unlocked/);
});

test("equipMove: appends into next compact slot, then replace-in-place on a used slotIndex", async () => {
    const f = makeFighter({
        promotionTier: "National",
        specialMovesOwned: [
            { moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() },
            { moveId: "HEAVY_HANDS", rarity: RARITY.COMMON, acquiredAt: new Date() },
        ],
    });
    await specialMovesService.equipMove(f, "GRANITE_JAW", 0);
    assert.deepStrictEqual(f.specialMovesEquipped, ["GRANITE_JAW"]);
    await specialMovesService.equipMove(f, "HEAVY_HANDS", 0);
    assert.deepStrictEqual(f.specialMovesEquipped, ["HEAVY_HANDS"], "slot 0 replaced, no gap introduced");
});

test("equipMove: rejects re-equipping the same move into a different slot (already equipped)", async () => {
    const f = makeFighter({
        promotionTier: "National",
        specialMovesOwned: [{ moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() }],
        specialMovesEquipped: ["GRANITE_JAW"],
    });
    await assert.rejects(() => specialMovesService.equipMove(f, "GRANITE_JAW", 1), /already equipped/);
});

test("unequipMove: compacts the array (no gaps left behind)", async () => {
    const f = makeFighter({
        promotionTier: "National",
        specialMovesOwned: [
            { moveId: "GRANITE_JAW", rarity: RARITY.COMMON, acquiredAt: new Date() },
            { moveId: "HEAVY_HANDS", rarity: RARITY.COMMON, acquiredAt: new Date() },
            { moveId: "SPRAWL_INSTINCT", rarity: RARITY.COMMON, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["GRANITE_JAW", "HEAVY_HANDS", "SPRAWL_INSTINCT"],
    });
    await specialMovesService.unequipMove(f, 0);
    assert.deepStrictEqual(f.specialMovesEquipped, ["HEAVY_HANDS", "SPRAWL_INSTINCT"], "must compact left, no null/gap");
});

test("unequipMove: rejects out-of-range slotIndex", async () => {
    const f = makeFighter({ specialMovesEquipped: [] });
    await assert.rejects(() => specialMovesService.unequipMove(f, 0), /No move in that slot/);
});

test("unequipMove: rejects when camp is locked", async () => {
    const f = makeFighter({ specialMovesEquipped: ["GRANITE_JAW"], acceptedFightId: "x" });
    await assert.rejects(() => specialMovesService.unequipMove(f, 0), /active fight camp/);
});

function withStubbedRandom(seq, fn) {
    const orig = Math.random;
    let i = 0;
    Math.random = () => seq[Math.min(i++, seq.length - 1)];
    try { return fn(); } finally { Math.random = orig; }
}

test("rollMoveDrop: gate roll below DROP_BASE_RATE -> a drop happens", () => {
    const f = makeFighter();
    const res = withStubbedRandom([0.0, 0.0, 0.0], () =>
        specialMovesService.rollMoveDrop(f, { isFreeGym: false, availableFrom: "Amateur" })
    );
    assert.ok(res, "a drop should have been granted");
    assert.equal(res.outcome, "NEW");
});

test("rollMoveDrop: gate roll at/above DROP_BASE_RATE -> no drop (null), never throws", () => {
    const f = makeFighter();
    const res = withStubbedRandom([0.99], () =>
        specialMovesService.rollMoveDrop(f, { isFreeGym: false, availableFrom: "Amateur" })
    );
    assert.equal(res, null);
});

test("rollMoveDrop: unknown gym tier -- warns and returns null rather than throwing", () => {
    const f = makeFighter();
    const origWarn = console.warn;
    console.warn = () => {};
    try {
        const res = withStubbedRandom([0.0], () =>
            specialMovesService.rollMoveDrop(f, { isFreeGym: false, availableFrom: "Not A Real Tier" })
        );
        assert.equal(res, null);
    } finally {
        console.warn = origWarn;
    }
});

test("rollMoveDrop: Community (free gym) can never roll LEGENDARY (weight 0)", () => {
    const f = makeFighter();
    for (let trial = 0; trial < 20; trial++) {
        const roll = trial / 20;
        const res = withStubbedRandom([0.0, roll, 0.0], () =>
            specialMovesService.rollMoveDrop(f, { isFreeGym: true })
        );
        if (res) assert.notEqual(res.rarity, RARITY.LEGENDARY, "roll " + roll + " produced a LEGENDARY at Community tier");
    }
});

// ── Passive cap (max 2 always-on passives equipped) — added post-QA balance pass ──
test("equipMove: rejects a 3rd PASSIVE when 2 passives already equipped (balance cap)", async () => {
    const f = makeFighter({
        promotionTier: "National", // 3 slots unlocked
        specialMovesOwned: [
            { moveId: "GRANITE_JAW", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "HEAVY_HANDS", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "BODY_SNATCHER", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["GRANITE_JAW", "HEAVY_HANDS"],
    });
    await assert.rejects(
        () => specialMovesService.equipMove(f, "BODY_SNATCHER", 2),
        /Only 2 always-on passives/
    );
});

test("equipMove: allows a Proc/Signature in slot 3 alongside 2 passives", async () => {
    const f = makeFighter({
        promotionTier: "National",
        specialMovesOwned: [
            { moveId: "GRANITE_JAW", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "HEAVY_HANDS", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "CLINCH_KILLER", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["GRANITE_JAW", "HEAVY_HANDS"],
    });
    const res = await specialMovesService.equipMove(f, "CLINCH_KILLER", 2);
    assert.equal(res.equipped.length, 3);
    assert.ok(res.equipped.some((e) => e.moveId === "CLINCH_KILLER"));
});

test("equipMove: swapping one passive for another (still 2 total) is allowed", async () => {
    const f = makeFighter({
        promotionTier: "National",
        specialMovesOwned: [
            { moveId: "GRANITE_JAW", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "HEAVY_HANDS", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
            { moveId: "BODY_SNATCHER", rarity: RARITY.LEGENDARY, acquiredAt: new Date() },
        ],
        specialMovesEquipped: ["GRANITE_JAW", "HEAVY_HANDS"],
    });
    // replace the passive in slot 1 with another passive — still 2 passives, must be allowed
    const res = await specialMovesService.equipMove(f, "BODY_SNATCHER", 1);
    assert.equal(res.equipped.length, 2);
    assert.ok(res.equipped.some((e) => e.moveId === "BODY_SNATCHER"));
    assert.ok(!res.equipped.some((e) => e.moveId === "HEAVY_HANDS"));
});
