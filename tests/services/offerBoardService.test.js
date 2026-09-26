/**
 * Unit tests for services/offerBoardService.js: the persisted fight offer board.
 *
 * No DB: Fighter.findById / Fighter.updateOne run against a one-document in-memory
 * store that honours the compare-and-set filters the service sends, Opponent reads come
 * from a fixed roster, and fightService.pickOfferSlots is stubbed so every test controls
 * (and counts) generation. hydrateOffers runs for real so the callout overlay, title lock
 * and context are exercised end to end. Every stub is restored in a finally block.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const Opponent = require("../../models/opponentModel");
const fightService = require("../../services/fightService");
const analyticsService = require("../../services/analyticsService");
const offerBoardService = require("../../services/offerBoardService");
const { PROMOTION_TIERS } = require("../../consts/gameConstants");

const {
    boardFingerprint, isBoardLive, getBoard, rerollBoard, resolveBoardOffer,
    rerollCostFor, emptyBoardMeta,
} = offerBoardService;

const TIER = "Regional Pro";
const HOUR = 60 * 60 * 1000;

// ── Fixtures ────────────────────────────────────────────────────────────────

function oppDoc(id, ovr, over = {}) {
    return {
        _id: id, name: `Opp ${id}`, nickname: null, overallRating: ovr, style: "Boxing",
        promotionTier: TIER, weightClass: "Lightweight", fixedRank: 8, fightHistory: [], ...over,
    };
}

const ROSTER = {
    e1: oppDoc("e1", 30), v1: oppDoc("v1", 34), h1: oppDoc("h1", 38),
    e2: oppDoc("e2", 31), v2: oppDoc("v2", 35), h2: oppDoc("h2", 39),
    c1: oppDoc("c1", 40, { fixedRank: 3, fightHistory: [{ result: "win" }, { result: "win" }] }),
    champ: oppDoc("champ", 50, { isChampion: true, fixedRank: 1 }),
};

const SET_A = [
    { offerType: "Easy", opponentId: "e1" },
    { offerType: "Even", opponentId: "v1" },
    { offerType: "Hard", opponentId: "h1" },
];
const SET_B = [
    { offerType: "Easy", opponentId: "e2" },
    { offerType: "Even", opponentId: "v2" },
    { offerType: "Hard", opponentId: "h2" },
];

function baseFighter(over = {}) {
    return {
        _id: "f1",
        promotionTier: TIER,
        weightClass: "Lightweight",
        overallRating: 34,
        iron: 1000,
        injuries: [],
        acceptedFightId: null,
        nemesis: { opponentId: null, opponentName: null, lossCount: 0, setAt: null },
        pendingPromotion: null,
        lastFightDate: new Date("2026-09-20T12:00:00Z"),
        activeCallout: { opponentId: null },
        titleShotCooldown: 0,
        topFiveWinsInTier: 0,
        ranking: { rank: 9 },
        offerBoard: null,
        ...over,
    };
}

function liveBoard(fighter, slots = SET_A, over = {}) {
    const now = Date.now();
    return {
        slots: slots.map((s) => ({ ...s })),
        generatedAt: new Date(now - HOUR),
        expiresAt: new Date(now + 23 * HOUR),
        rerollUsed: false,
        promotionTier: fighter.promotionTier,
        weightClass: fighter.weightClass,
        fingerprint: boardFingerprint(fighter),
        ...over,
    };
}

// ── Harness ─────────────────────────────────────────────────────────────────

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

function getPath(doc, path) {
    return path.split(".").reduce((o, p) => (o == null ? undefined : o[p]), doc);
}

function matches(doc, filter) {
    for (const [k, v] of Object.entries(filter)) {
        if (k === "_id") continue;
        const actual = getPath(doc, k);
        if (v && typeof v === "object" && !(v instanceof Date) && "$gte" in v) {
            if (!(actual >= v.$gte)) return false;
        } else if (v === null) {
            if (actual != null) return false;
        } else if (v instanceof Date) {
            if (!(actual instanceof Date) || actual.getTime() !== v.getTime()) return false;
        } else if (actual !== v) {
            return false;
        }
    }
    return true;
}

/**
 * One-fighter in-memory DB. Reads return deep clones (a fresh doc per read, like Mongo).
 * `beforeUpdate` lets a test simulate a concurrent writer.
 */
function makeDb(fighter, { picks = [SET_A], beforeUpdate = null } = {}) {
    const db = {
        fighter,
        pickCalls: [],
        updates: [],
        tracked: [],
        roster: { ...ROSTER },
    };
    const clone = () => (db.fighter ? structuredClone(db.fighter) : null);
    db.findById = () => {
        const doc = clone();
        return { lean: async () => doc, then: (res, rej) => Promise.resolve(doc).then(res, rej) };
    };
    db.updateOne = async (filter, update, opts) => {
        db.updates.push({ filter, update, opts });
        if (beforeUpdate) beforeUpdate(db, filter, update);
        if (!db.fighter || !matches(db.fighter, filter)) return { matchedCount: 0, modifiedCount: 0 };
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) db.fighter[k] = (db.fighter[k] || 0) + v;
        if (update.$set) for (const [k, v] of Object.entries(update.$set)) db.fighter[k] = v === null ? null : structuredClone(v);
        return { matchedCount: 1, modifiedCount: 1 };
    };
    let pickIdx = 0;
    db.pick = async (f, opts) => {
        db.pickCalls.push({ fighter: f, opts });
        const set = picks[Math.min(pickIdx, picks.length - 1)];
        pickIdx += 1;
        return set.map((s) => ({ ...s }));
    };
    db.oppFind = (q) => {
        const ids = (q && q._id && q._id.$in) || [];
        const docs = ids.map((id) => db.roster[String(id)]).filter(Boolean).map((d) => structuredClone(d));
        return { lean: async () => docs };
    };
    db.oppFindById = (id) => {
        const d = db.roster[String(id)];
        return { lean: async () => (d ? structuredClone(d) : null) };
    };
    return db;
}

async function withDb(db, body) {
    return withStub(Fighter, "findById", db.findById, () =>
        withStub(Fighter, "updateOne", db.updateOne, () =>
            withStub(fightService, "pickOfferSlots", db.pick, () =>
                withStub(Opponent, "find", db.oppFind, () =>
                    withStub(Opponent, "findById", db.oppFindById, () =>
                        withStub(analyticsService, "track", async (...args) => { db.tracked.push(args); }, body))))));
}

async function rejectsWith(promise, code) {
    await assert.rejects(promise, (err) => {
        assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
        return true;
    });
}

const INJURY = { type: "concussion", label: "Concussion", cannotFight: true, doctorVisited: false, recoveryHoursLeft: 12 };

// ── Fingerprint and liveness ────────────────────────────────────────────────

test("boardFingerprint changes on tier, weightClass, nemesis id, pendingPromotion, lastFightDate", () => {
    const f = baseFighter();
    const base = boardFingerprint(f);
    const variants = [
        { promotionTier: "National" },
        { weightClass: "Welterweight" },
        { nemesis: { opponentId: "nem-1", lossCount: 1 } },
        { pendingPromotion: "National" },
        { lastFightDate: new Date("2026-09-21T12:00:00Z") },
        { lastFightDate: null },
    ];
    for (const v of variants) {
        assert.notEqual(boardFingerprint({ ...f, ...v }), base, JSON.stringify(v));
    }
});

test("boardFingerprint does NOT change on activeCallout, titleShotCooldown, topFiveWinsInTier", () => {
    const f = baseFighter();
    const base = boardFingerprint(f);
    assert.equal(boardFingerprint({ ...f, activeCallout: { opponentId: "c1", cost: 50 } }), base);
    assert.equal(boardFingerprint({ ...f, titleShotCooldown: 2 }), base);
    assert.equal(boardFingerprint({ ...f, topFiveWinsInTier: 3 }), base);
});

test("boardFingerprint is a plain joined string", () => {
    const f = baseFighter({ nemesis: { opponentId: "nem" }, pendingPromotion: "National" });
    assert.equal(boardFingerprint(f), `${TIER}|Lightweight|nem|National|${f.lastFightDate.getTime()}`);
    assert.equal(boardFingerprint(baseFighter({ lastFightDate: null })), `${TIER}|Lightweight|-|-|0`);
});

test("isBoardLive: false on null, expired, fingerprint mismatch, empty slots; true otherwise", () => {
    const f = baseFighter();
    const board = liveBoard(f);
    assert.equal(isBoardLive(board, f), true);
    assert.equal(isBoardLive(null, f), false);
    assert.equal(isBoardLive({ ...board, expiresAt: new Date(Date.now() - 1000) }, f), false);
    assert.equal(isBoardLive({ ...board, fingerprint: "nope" }, f), false);
    assert.equal(isBoardLive({ ...board, slots: [] }, f), false);
    assert.equal(isBoardLive(board, { ...f, promotionTier: "National" }), false);
});

test("rerollCostFor: 20% of the signing fee for all 5 tiers; null for unknown", () => {
    assert.equal(rerollCostFor("Amateur"), 100);
    assert.equal(rerollCostFor("Regional Pro"), 150);
    assert.equal(rerollCostFor("National"), 440);
    assert.equal(rerollCostFor("GCS Contender"), 1200);
    assert.equal(rerollCostFor("GCS"), 2400);
    for (const t of Object.keys(PROMOTION_TIERS)) {
        assert.equal(rerollCostFor(t), Math.round(PROMOTION_TIERS[t].signingFee * 0.2));
    }
    assert.equal(rerollCostFor("Nope"), null);
    assert.equal(rerollCostFor("constructor"), null);
    assert.equal(rerollCostFor(undefined), null);
});

test("emptyBoardMeta has the documented shape", () => {
    assert.deepEqual(emptyBoardMeta("Amateur"), {
        generatedAt: null, expiresAt: null, rerollUsed: false, rerollCost: 100, canReroll: false,
        rerollBlockedBy: "no_board", frozen: false, blockedReason: null, blockedCode: null,
    });
});

// ── getBoard ────────────────────────────────────────────────────────────────

test("getBoard generates once, persists with a compare-and-set, and reuses (pick count 1)", async () => {
    const db = makeDb(baseFighter());
    await withDb(db, async () => {
        const first = await getBoard("f1");
        assert.deepEqual(first.offers.map((o) => [o.type, o.opponent._id]), [["Easy", "e1"], ["Even", "v1"], ["Hard", "h1"]]);
        assert.ok(first.offers.every((o) => o.acceptable === true));
        assert.equal(first.meta.canReroll, true);
        assert.equal(first.meta.rerollBlockedBy, null);
        assert.equal(first.meta.rerollCost, 150);
        assert.equal(first.meta.frozen, false);

        const write = db.updates[0];
        assert.equal(write.filter.acceptedFightId, null);
        assert.equal(write.filter["offerBoard.generatedAt"], null);
        assert.deepEqual(write.opts, { runValidators: true });
        const stored = db.fighter.offerBoard;
        assert.equal(stored.rerollUsed, false);
        assert.equal(stored.expiresAt.getTime() - stored.generatedAt.getTime(), 24 * HOUR);
        assert.equal(stored.fingerprint, boardFingerprint(db.fighter));
        assert.equal(first.meta.generatedAt, stored.generatedAt.toISOString());

        const second = await getBoard("f1");
        assert.equal(db.pickCalls.length, 1, "a live board is never regenerated");
        assert.equal(db.updates.length, 1, "a hit writes nothing");
        assert.deepEqual(second.offers.map((o) => o.opponent._id), ["e1", "v1", "h1"]);
        assert.equal(second.meta.generatedAt, first.meta.generatedAt);
    });
});

test("getBoard: an expired board regenerates against its own generatedAt", async () => {
    const f = baseFighter();
    const stale = liveBoard(f, SET_A, { expiresAt: new Date(Date.now() - 1000) });
    const db = makeDb(baseFighter({ offerBoard: stale }), { picks: [SET_B] });
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.equal(db.pickCalls.length, 1);
        assert.deepEqual(res.offers.map((o) => o.opponent._id), ["e2", "v2", "h2"]);
        assert.equal(db.updates[0].filter["offerBoard.generatedAt"].getTime(), stale.generatedAt.getTime());
    });
});

test("getBoard: each fingerprint field change regenerates", async () => {
    const changes = [
        { promotionTier: "National" },
        { weightClass: "Welterweight" },
        { nemesis: { opponentId: "h1", opponentName: "Opp h1", lossCount: 1, setAt: null } },
        { pendingPromotion: "National" },
        { lastFightDate: new Date() },
    ];
    for (const change of changes) {
        const db = makeDb(baseFighter(), { picks: [SET_A, SET_B] });
        // eslint-disable-next-line no-await-in-loop
        await withDb(db, async () => {
            await getBoard("f1");
            Object.assign(db.fighter, change);
            const res = await getBoard("f1");
            assert.equal(db.pickCalls.length, 2, JSON.stringify(change));
            assert.deepEqual(res.offers.map((o) => o.opponent._id), ["e2", "v2", "h2"]);
        });
    }
});

test("getBoard: setting a callout swaps the Hard slot WITHOUT regenerating; cancelling restores it", async () => {
    const db = makeDb(baseFighter());
    await withDb(db, async () => {
        await getBoard("f1");
        db.fighter.activeCallout = { opponentId: "c1", opponentName: "Opp c1", cost: 40, isStretch: false, calledAt: null };

        const called = await getBoard("f1");
        assert.equal(db.pickCalls.length, 1, "a callout is not a free reroll");
        const hard = called.offers.find((o) => o.type === "Hard");
        assert.equal(hard.opponent._id, "c1");
        assert.equal(hard.isCallout, true);
        assert.deepEqual(hard.context.record, { wins: 2, losses: 0, draws: 0 }, "callout gets its own context");
        assert.equal(hard.acceptable, true);

        db.fighter.activeCallout = { opponentId: null };
        const cancelled = await getBoard("f1");
        assert.equal(db.pickCalls.length, 1);
        assert.equal(cancelled.offers.find((o) => o.type === "Hard").opponent._id, "h1");
    });
});

test("getBoard: frozen (fight booked) never generates; stored slots come back acceptable:false", async () => {
    const f = baseFighter();
    const board = liveBoard(f, SET_A, { expiresAt: new Date(Date.now() - 1000) }); // even expired
    const db = makeDb(baseFighter({ acceptedFightId: "fight-1", offerBoard: board }));
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.equal(db.pickCalls.length, 0);
        assert.equal(db.updates.length, 0);
        assert.equal(res.offers.length, 3);
        assert.ok(res.offers.every((o) => o.acceptable === false));
        assert.equal(res.meta.frozen, true);
        assert.equal(res.meta.rerollBlockedBy, "frozen");
        assert.equal(res.meta.canReroll, false);
    });
});

test("getBoard: frozen with no board returns []", async () => {
    const db = makeDb(baseFighter({ acceptedFightId: "fight-1" }));
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.deepEqual(res.offers, []);
        assert.equal(res.meta.frozen, true);
        assert.equal(db.pickCalls.length, 0);
    });
});

test("getBoard: blocking injury returns [], INJURY, does not persist, clears the stored board by CAS", async () => {
    const f = baseFighter();
    const board = liveBoard(f);
    const db = makeDb(baseFighter({ injuries: [INJURY], offerBoard: board }));
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.deepEqual(res.offers, []);
        assert.equal(res.meta.blockedCode, "INJURY");
        assert.equal(res.meta.blockedReason, fightService.fightBlockedMessage(INJURY));
        assert.equal(res.meta.rerollBlockedBy, "blocked");
        assert.equal(db.pickCalls.length, 0);

        assert.equal(db.updates.length, 1);
        const { filter, update, opts } = db.updates[0];
        assert.equal(filter["offerBoard.generatedAt"].getTime(), board.generatedAt.getTime());
        assert.deepEqual(update, { $set: { offerBoard: null } });
        assert.deepEqual(opts, { runValidators: true });
        assert.equal(db.fighter.offerBoard, null);
    });
});

test("getBoard: blocking injury with no board issues no write", async () => {
    const db = makeDb(baseFighter({ injuries: [INJURY] }));
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.equal(res.meta.blockedCode, "INJURY");
        assert.equal(db.updates.length, 0);
    });
});

test("getBoard: empty pool does not persist and reports POOL_EMPTY", async () => {
    const db = makeDb(baseFighter(), { picks: [[]] });
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.deepEqual(res.offers, []);
        assert.equal(res.meta.blockedCode, "POOL_EMPTY");
        assert.equal(res.meta.blockedReason, "No opponents are available in your division right now. Check back soon.");
        assert.equal(db.updates.length, 0);
    });
});

test("getBoard: a lost compare-and-set returns the board the other writer stored", async () => {
    let raced = false;
    const db = makeDb(baseFighter(), {
        picks: [SET_A],
        beforeUpdate: (d) => {
            if (raced) return;
            raced = true;
            // Another request stored SET_B first.
            d.fighter.offerBoard = liveBoard(d.fighter, SET_B, { generatedAt: new Date(Date.now() - 1000) });
        },
    });
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.deepEqual(res.offers.map((o) => o.opponent._id), ["e2", "v2", "h2"]);
        assert.equal(res.meta.canReroll, true);
        assert.deepEqual(db.fighter.offerBoard.slots.map((s) => s.opponentId), ["e2", "v2", "h2"], "the winner's board is untouched");
    });
});

test("getBoard: a stored slot whose opponent vanished regenerates", async () => {
    const f = baseFighter();
    const board = liveBoard(f, [
        { offerType: "Easy", opponentId: "e1" },
        { offerType: "Even", opponentId: "gone" },
        { offerType: "Hard", opponentId: "h1" },
    ]);
    const db = makeDb(baseFighter({ offerBoard: board }), { picks: [SET_B] });
    await withDb(db, async () => {
        const res = await getBoard("f1");
        assert.equal(db.pickCalls.length, 1);
        assert.deepEqual(res.offers.map((o) => o.opponent._id), ["e2", "v2", "h2"]);
    });
});

test("getBoard: Fighter not found", async () => {
    const db = makeDb(null);
    await withDb(db, async () => {
        await assert.rejects(getBoard("nope"), /Fighter not found/);
    });
});

// ── resolveBoardOffer ───────────────────────────────────────────────────────

test("resolveBoardOffer: an opponent not on the board is OFFER_NOT_ON_BOARD", async () => {
    const f = baseFighter();
    const db = makeDb(f);
    await withDb(db, async () => {
        await rejectsWith(resolveBoardOffer({ ...f, offerBoard: liveBoard(f) }, "e2"), "OFFER_NOT_ON_BOARD");
    });
});

test("resolveBoardOffer: an expired board is OFFER_NOT_ON_BOARD and never generates", async () => {
    const f = baseFighter();
    const db = makeDb(f);
    await withDb(db, async () => {
        const expired = liveBoard(f, SET_A, { expiresAt: new Date(Date.now() - 1000) });
        await rejectsWith(resolveBoardOffer({ ...f, offerBoard: expired }, "e1"), "OFFER_NOT_ON_BOARD");
        await rejectsWith(resolveBoardOffer({ ...f, offerBoard: null }, "e1"), "OFFER_NOT_ON_BOARD");
        assert.equal(db.pickCalls.length, 0);
        assert.equal(db.updates.length, 0);
    });
});

test("resolveBoardOffer: a locked title shot is TITLE_SHOT_LOCKED; an unlocked one resolves", async () => {
    const f = baseFighter({ pendingPromotion: "National", ranking: { rank: 9 } });
    const slots = [...SET_A, { offerType: "TitleShot", opponentId: "champ" }];
    const db = makeDb(f);
    await withDb(db, async () => {
        await rejectsWith(resolveBoardOffer({ ...f, offerBoard: liveBoard(f, slots) }, "champ"), "TITLE_SHOT_LOCKED");

        const ready = { ...f, ranking: { rank: 3 }, topFiveWinsInTier: 3 };
        const offer = await resolveBoardOffer({ ...ready, offerBoard: liveBoard(ready, slots) }, "champ");
        assert.equal(offer.type, "TitleShot");
        assert.equal(offer.locked, false);
        assert.equal(offer.opponent.overallRating, Math.round(50 * 1.05));
    });
});

test("resolveBoardOffer: the callout overlay opponent is allowed as the Hard slot", async () => {
    const f = baseFighter({ activeCallout: { opponentId: "c1", cost: 40, isStretch: false, calledAt: null } });
    const db = makeDb(f);
    await withDb(db, async () => {
        const offer = await resolveBoardOffer({ ...f, offerBoard: liveBoard(f) }, "c1");
        assert.equal(offer.type, "Hard");
        assert.equal(offer.isCallout, true);
        await rejectsWith(resolveBoardOffer({ ...f, offerBoard: liveBoard(f) }, "h1"), "OFFER_NOT_ON_BOARD");
    });
});

test("resolveBoardOffer: frozen is FIGHT_ALREADY_BOOKED, injured is FIGHT_BLOCKED_INJURY", async () => {
    const f = baseFighter();
    const db = makeDb(f);
    await withDb(db, async () => {
        await rejectsWith(resolveBoardOffer({ ...f, acceptedFightId: "x", offerBoard: liveBoard(f) }, "e1"), "FIGHT_ALREADY_BOOKED");
        await assert.rejects(resolveBoardOffer({ ...f, injuries: [INJURY], offerBoard: liveBoard(f) }, "e1"), (err) => {
            assert.equal(err.code, "FIGHT_BLOCKED_INJURY");
            assert.equal(err.status, 400);
            assert.equal(err.message, fightService.fightBlockedMessage(INJURY));
            return true;
        });
    });
});

// ── rerollBoard ─────────────────────────────────────────────────────────────

test("rerollBoard: one conditional write charges the cost and swaps in a rerolled board", async () => {
    const f = baseFighter();
    const prev = liveBoard(f);
    const db = makeDb(baseFighter({ offerBoard: prev }), { picks: [SET_B] });
    await withDb(db, async () => {
        const res = await rerollBoard("f1", "user-1");
        assert.equal(db.updates.length, 1);
        const { filter, update, opts } = db.updates[0];
        assert.equal(filter._id, "f1");
        assert.equal(filter.acceptedFightId, null);
        assert.deepEqual(filter.iron, { $gte: 150 });
        assert.equal(filter["offerBoard.generatedAt"].getTime(), prev.generatedAt.getTime());
        assert.equal(filter["offerBoard.rerollUsed"], false);
        assert.deepEqual(update.$inc, { iron: -150 });
        assert.equal(update.$set.offerBoard.rerollUsed, true);
        assert.ok(update.$set.offerBoard.generatedAt.getTime() > prev.generatedAt.getTime());
        assert.equal(update.$set.offerBoard.expiresAt.getTime() - update.$set.offerBoard.generatedAt.getTime(), 24 * HOUR);
        assert.deepEqual(opts, { runValidators: true });

        assert.equal(db.fighter.iron, 850);
        assert.equal(res.cashAfter, 850);
        assert.deepEqual(res.offers.map((o) => o.opponent._id), ["e2", "v2", "h2"]);
        assert.equal(res.meta.rerollUsed, true);
        assert.equal(res.meta.rerollBlockedBy, "used");
        assert.equal(res.meta.canReroll, false);
        assert.equal(db.tracked.length, 1);
        assert.equal(db.tracked[0][1], "offers_rerolled");
        assert.deepEqual(db.tracked[0][2], { tier: TIER, cost: 150 });
    });
});

test("rerollBoard: the second reroll on the same board is REROLL_USED", async () => {
    const f = baseFighter();
    const db = makeDb(baseFighter({ offerBoard: liveBoard(f) }), { picks: [SET_B, SET_A] });
    await withDb(db, async () => {
        await rerollBoard("f1", "u");
        await rejectsWith(rerollBoard("f1", "u"), "REROLL_USED");
        assert.equal(db.pickCalls.length, 1);
        assert.equal(db.fighter.iron, 850, "charged once");
    });
});

test("rerollBoard: NOT_ENOUGH_CASH makes no pick call and names the cost", async () => {
    const f = baseFighter({ iron: 149 });
    const db = makeDb({ ...f, offerBoard: liveBoard(f) });
    await withDb(db, async () => {
        await assert.rejects(rerollBoard("f1", "u"), (err) => {
            assert.equal(err.code, "NOT_ENOUGH_CASH");
            assert.equal(err.status, 400);
            assert.equal(err.message, "Not enough cash (a reroll costs $150)");
            return true;
        });
        assert.equal(db.pickCalls.length, 0);
        assert.equal(db.updates.length, 0);
    });
});

test("rerollBoard: frozen, injured and stale each return their code with no charge", async () => {
    const f = baseFighter();
    const cases = [
        [{ acceptedFightId: "fight-1", offerBoard: liveBoard(f) }, "OFFER_BOARD_FROZEN"],
        [{ injuries: [INJURY], offerBoard: liveBoard(f) }, "FIGHT_BLOCKED_INJURY"],
        [{ offerBoard: liveBoard(f, SET_A, { expiresAt: new Date(Date.now() - 1000) }) }, "OFFER_BOARD_STALE"],
        [{ offerBoard: liveBoard(f, SET_A, { fingerprint: "old" }) }, "OFFER_BOARD_STALE"],
        [{ offerBoard: null }, "OFFER_BOARD_STALE"],
    ];
    for (const [over, code] of cases) {
        const db = makeDb(baseFighter(over));
        // eslint-disable-next-line no-await-in-loop
        await withDb(db, async () => {
            await rejectsWith(rerollBoard("f1", "u"), code);
            assert.equal(db.pickCalls.length, 0, code);
            assert.equal(db.updates.length, 0, code);
            assert.equal(db.fighter.iron, 1000, code);
        });
    }
});

test("rerollBoard: empty pool is OFFER_POOL_EMPTY with no charge", async () => {
    const f = baseFighter();
    const db = makeDb(baseFighter({ offerBoard: liveBoard(f) }), { picks: [[]] });
    await withDb(db, async () => {
        await rejectsWith(rerollBoard("f1", "u"), "OFFER_POOL_EMPTY");
        assert.equal(db.updates.length, 0);
        assert.equal(db.fighter.iron, 1000);
    });
});

test("rerollBoard: avoidOpponentIds is the previous difficulty picks minus the nemesis", async () => {
    const f = baseFighter({
        pendingPromotion: "National",
        nemesis: { opponentId: "v1", opponentName: "Opp v1", lossCount: 2, setAt: null },
    });
    const slots = [...SET_A, { offerType: "TitleShot", opponentId: "champ" }];
    const db = makeDb({ ...f, offerBoard: liveBoard(f, slots) }, { picks: [SET_B] });
    await withDb(db, async () => {
        await rerollBoard("f1", "u");
        assert.deepEqual(db.pickCalls[0].opts.avoidOpponentIds.map(String), ["e1", "h1"]);
    });
});

test("rerollBoard: a lost conditional write maps to the fresh state (REROLL_USED / cash / frozen / stale)", async () => {
    const f = baseFighter();
    const scenarios = [
        [(d) => { d.fighter.offerBoard.rerollUsed = true; }, "REROLL_USED"],
        [(d) => { d.fighter.iron = 10; }, "NOT_ENOUGH_CASH"],
        [(d) => { d.fighter.acceptedFightId = "fight-9"; }, "OFFER_BOARD_FROZEN"],
        [(d) => { d.fighter.offerBoard.generatedAt = new Date(); }, "OFFER_BOARD_STALE"],
    ];
    for (const [mutate, code] of scenarios) {
        const db = makeDb(baseFighter({ offerBoard: liveBoard(f) }), { picks: [SET_B], beforeUpdate: (d) => mutate(d) });
        // eslint-disable-next-line no-await-in-loop
        await withDb(db, async () => {
            await rejectsWith(rerollBoard("f1", "u"), code);
            assert.equal(db.tracked.length, 0, code);
        });
    }
});
