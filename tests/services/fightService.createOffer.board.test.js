/**
 * createOffer / acceptOffer against the persisted offer board.
 *
 * No DB: Fighter / Fight statics and Fight.prototype.save are stubbed, the board is a
 * live board on the fake fighter, and fightService.hydrateOffers is stubbed to the
 * offers that board resolves to (resolveBoardOffer calls it through the module object).
 * Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const Fight = require("../../models/fightModel");
const fightService = require("../../services/fightService");
const fighterService = require("../../services/fighterService");
const campService = require("../../services/campService");
const analyticsService = require("../../services/analyticsService");
const { boardFingerprint } = require("../../services/offerBoardService");

const TIER = "Regional Pro";
const HOUR = 60 * 60 * 1000;

async function withStub(obj, key, impl, body) {
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const original = obj[key];
    obj[key] = impl;
    try {
        return await body();
    } finally {
        if (had) obj[key] = original;
        else delete obj[key];
    }
}

function makeFighter(over = {}) {
    const f = {
        _id: "f1", promotionTier: TIER, weightClass: "Lightweight", injuries: [],
        acceptedFightId: null, nemesis: { opponentId: null }, pendingPromotion: null,
        lastFightDate: new Date("2026-09-20T00:00:00Z"), activeCallout: { opponentId: null },
        ...over,
    };
    f.offerBoard = over.offerBoard !== undefined ? over.offerBoard : {
        slots: [
            { offerType: "Easy", opponentId: "e" },
            { offerType: "Even", opponentId: "v" },
            { offerType: "Hard", opponentId: "h" },
            { offerType: "TitleShot", opponentId: "champ" },
        ],
        generatedAt: new Date(Date.now() - HOUR),
        expiresAt: new Date(Date.now() + HOUR),
        rerollUsed: false,
        promotionTier: TIER,
        weightClass: "Lightweight",
        fingerprint: boardFingerprint(f),
    };
    return f;
}

const HYDRATED = [
    { type: "Easy", opponent: { _id: "e" } },
    { type: "Even", opponent: { _id: "v" } },
    { type: "Hard", opponent: { _id: "h" } },
    { type: "TitleShot", opponent: { _id: "champ" }, locked: true },
];

function hydrateStub(offers = HYDRATED) {
    return async () => ({ offers: offers.map((o) => ({ ...o })), missing: false });
}

/** Stubs for createOffer: captures the saved Fight. */
async function withCreate(fighter, body, offers) {
    const saved = [];
    return withStub(Fighter, "findById", async () => fighter, () =>
        withStub(fightService, "hydrateOffers", hydrateStub(offers), () =>
            withStub(Fight.prototype, "save", async function save() { saved.push(this); return this; }, () =>
                body(saved))));
}

async function rejectsWith(promise, code) {
    await assert.rejects(promise, (err) => {
        assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
        return true;
    });
}

// ── createOffer ─────────────────────────────────────────────────────────────

test("createOffer: offerType comes from the board slot; client input is ignored", async () => {
    // Fight casts opponentId to an ObjectId, so this test uses real 24-hex ids.
    const E = "507f1f77bcf86cd799439011";
    const H = "507f1f77bcf86cd799439012";
    const offers = [
        { type: "Easy", opponent: { _id: E } },
        { type: "Hard", opponent: { _id: H } },
    ];
    await withCreate(makeFighter(), async (saved) => {
        // A forged third argument (the old offerType param) must have no effect.
        const fight = await fightService.createOffer("f1", H, "TitleShot");
        assert.equal(fight.offerType, "Hard");
        assert.equal(String(fight.opponentId), H);
        assert.equal(fight.status, "offered");
        assert.equal(fight.promotionTier, TIER);
        assert.equal(fight.isCallout, false);
        assert.equal(saved.length, 1);
    }, offers);
});

test("createOffer: an opponent that is not on the board is rejected (OFFER_NOT_ON_BOARD)", async () => {
    await withCreate(makeFighter(), async (saved) => {
        await rejectsWith(fightService.createOffer("f1", "someone-else"), "OFFER_NOT_ON_BOARD");
        assert.equal(saved.length, 0);
    });
});

test("createOffer: a locked title shot is TITLE_SHOT_LOCKED; a stale board is OFFER_NOT_ON_BOARD", async () => {
    await withCreate(makeFighter(), async (saved) => {
        await rejectsWith(fightService.createOffer("f1", "champ"), "TITLE_SHOT_LOCKED");
        assert.equal(saved.length, 0);
    });
    await withCreate(makeFighter({ offerBoard: null }), async (saved) => {
        await rejectsWith(fightService.createOffer("f1", "e"), "OFFER_NOT_ON_BOARD");
        assert.equal(saved.length, 0);
    });
});

test("createOffer: the active callout opponent is stamped isCallout", async () => {
    const C = "507f1f77bcf86cd799439013";
    const f = makeFighter({ activeCallout: { opponentId: C } });
    await withCreate(f, async () => {
        const fight = await fightService.createOffer("f1", C);
        assert.equal(fight.offerType, "Hard");
        assert.equal(fight.isCallout, true);
    }, [{ type: "Hard", opponent: { _id: C }, isCallout: true }]);
});

test("createOffer: Fighter not found", async () => {
    await withStub(Fighter, "findById", async () => null, async () => {
        await assert.rejects(fightService.createOffer("nope", "e"), /Fighter not found/);
    });
});

// ── acceptOffer ─────────────────────────────────────────────────────────────

function fakeFight(over = {}) {
    const fight = {
        _id: "fight-1", fighterId: "f1", opponentId: "h", offerType: "Hard",
        promotionTier: TIER, status: "offered", saves: 0, ...over,
    };
    fight.save = async () => { fight.saves += 1; return fight; };
    return fight;
}

/**
 * Stubs for acceptOffer. `claimResult` is what the atomic claim returns; `deduct` is the
 * energy deduction. Captures every Fighter.updateOne call.
 */
async function withAccept({ fighter, fight, claimResult = { modifiedCount: 1 }, deduct = async () => ({}) }, body) {
    const updates = [];
    const camps = [];
    const deducts = [];
    const updateOne = async (filter, update) => {
        updates.push({ filter, update });
        return updates.length === 1 ? claimResult : { modifiedCount: 1 };
    };
    return withStub(Fighter, "findById", async () => fighter, () =>
        withStub(Fight, "findOne", async () => fight, () =>
            withStub(fightService, "hydrateOffers", hydrateStub(), () =>
                withStub(Fighter, "updateOne", updateOne, () =>
                    withStub(fighterService, "deductEnergy", async (...a) => { deducts.push(a); return deduct(...a); }, () =>
                        withStub(campService, "createCamp", async (...a) => { camps.push(a); }, () =>
                            withStub(analyticsService, "track", async () => {}, () =>
                                body({ updates, camps, deducts }))))))));
}

test("acceptOffer: happy path claims atomically, deducts energy, opens camp", async () => {
    const fight = fakeFight();
    await withAccept({ fighter: makeFighter(), fight }, async ({ updates, camps, deducts }) => {
        const res = await fightService.acceptOffer("f1", "fight-1", "user-1");
        assert.equal(res.status, "accepted");
        assert.equal(fight.saves, 1);
        assert.deepEqual(updates[0].filter, { _id: "f1", acceptedFightId: null });
        assert.deepEqual(updates[0].update, { $set: { acceptedFightId: "fight-1", trainingCampActions: 0 } });
        assert.equal(deducts.length, 1);
        assert.equal(camps.length, 1);
    });
});

test("acceptOffer: re-validates that the slot is still on the board", async () => {
    const fight = fakeFight({ opponentId: "gone" });
    await withAccept({ fighter: makeFighter(), fight }, async ({ updates, deducts }) => {
        await rejectsWith(fightService.acceptOffer("f1", "fight-1", "u"), "OFFER_NOT_ON_BOARD");
        assert.equal(updates.length, 0);
        assert.equal(deducts.length, 0);
        assert.equal(fight.status, "offered");
    });
});

test("acceptOffer: a slot whose type differs from fight.offerType is OFFER_NOT_ON_BOARD", async () => {
    // A Fight forged (or left over) as a TitleShot against what is now a Hard slot.
    const fight = fakeFight({ opponentId: "h", offerType: "TitleShot" });
    await withAccept({ fighter: makeFighter(), fight }, async ({ updates }) => {
        await rejectsWith(fightService.acceptOffer("f1", "fight-1", "u"), "OFFER_NOT_ON_BOARD");
        assert.equal(updates.length, 0);
    });
});

test("acceptOffer: a fighter with a booked fight is FIGHT_ALREADY_BOOKED before any write", async () => {
    await withAccept({ fighter: makeFighter({ acceptedFightId: "other" }), fight: fakeFight() }, async ({ updates }) => {
        await rejectsWith(fightService.acceptOffer("f1", "fight-1", "u"), "FIGHT_ALREADY_BOOKED");
        assert.equal(updates.length, 0);
    });
});

test("acceptOffer: the atomic claim losing a race (modifiedCount 0) is FIGHT_ALREADY_BOOKED, no energy spent", async () => {
    const fight = fakeFight();
    await withAccept({ fighter: makeFighter(), fight, claimResult: { modifiedCount: 0 } }, async ({ deducts, camps }) => {
        await rejectsWith(fightService.acceptOffer("f1", "fight-1", "u"), "FIGHT_ALREADY_BOOKED");
        assert.equal(deducts.length, 0);
        assert.equal(camps.length, 0);
        assert.equal(fight.status, "offered");
    });
});

test("acceptOffer: a deductEnergy throw rolls the claim back and rethrows", async () => {
    const fight = fakeFight();
    const deduct = async () => { throw new Error("Not enough energy"); };
    await withAccept({ fighter: makeFighter(), fight, deduct }, async ({ updates, camps }) => {
        await assert.rejects(fightService.acceptOffer("f1", "fight-1", "u"), /Not enough energy/);
        assert.equal(updates.length, 2);
        assert.deepEqual(updates[1].filter, { _id: "f1", acceptedFightId: "fight-1" });
        assert.deepEqual(updates[1].update, { $set: { acceptedFightId: null } });
        assert.equal(camps.length, 0);
        assert.equal(fight.status, "offered");
        assert.equal(fight.saves, 0);
    });
});

test("acceptOffer: Fight not found or not available", async () => {
    await withAccept({ fighter: makeFighter(), fight: null }, async () => {
        await assert.rejects(fightService.acceptOffer("f1", "fight-x", "u"), /Fight not found or not available/);
    });
});
