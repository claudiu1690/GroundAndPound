/**
 * Unit tests for fightService.pickOfferSlots (matchmaking rules, bare slots) and
 * fightService.hydrateOffers (live decoration of stored slots).
 *
 * No DB: Opponent.aggregate / find / findById and championService.getChampion are
 * stubbed; the fighter is a plain object with a counting save(). Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Opponent = require("../../models/opponentModel");
const championService = require("../../services/championService");
const fightService = require("../../services/fightService");

const { pickOfferSlots, hydrateOffers } = fightService;

const TIER = "Regional Pro";

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

function opp(id, ovr, over = {}) {
    return {
        _id: id, name: `Opp ${id}`, overallRating: ovr, promotionTier: TIER,
        weightClass: "Lightweight", fixedRank: 8, fightHistory: [], ...over,
    };
}

function fighter(over = {}) {
    const f = {
        _id: "f1", promotionTier: TIER, weightClass: "Lightweight", overallRating: 35,
        nemesis: { opponentId: null, opponentName: null, lossCount: 0, setAt: null },
        pendingPromotion: null, activeCallout: { opponentId: null },
        titleShotCooldown: 0, topFiveWinsInTier: 0, ranking: { rank: 9 },
        beefFlags: [], respectFlags: [],
        saves: 0,
        ...over,
    };
    f.save = async () => { f.saves += 1; };
    return f;
}

/**
 * Fake aggregate: $sample pipelines are the three OVR windows in call order
 * (Easy, Even, Hard); any other pipeline is the backfill.
 */
function fakeAggregate({ windows, fillers = [] }) {
    const calls = { windows: [], backfill: [] };
    let i = 0;
    const impl = async (pipeline) => {
        const isSample = pipeline.some((st) => st.$sample);
        if (isSample) {
            calls.windows.push(pipeline[0].$match);
            const pick = windows[i];
            i += 1;
            return pick ? [pick] : [];
        }
        calls.backfill.push(pipeline[0].$match);
        return fillers;
    };
    return { impl, calls };
}

async function withPick({ windows, fillers, nemesis = null, champion = null }, body) {
    const agg = fakeAggregate({ windows, fillers });
    return withStub(Opponent, "aggregate", agg.impl, () =>
        withStub(Opponent, "findById", () => ({ lean: async () => nemesis }), () =>
            withStub(championService, "getChampion", async () => champion, () => body(agg.calls))));
}

// ── pickOfferSlots ──────────────────────────────────────────────────────────

test("pickOfferSlots: bare slots ordered Easy, Even, Hard by ascending OVR", async () => {
    const f = fighter();
    await withPick({ windows: [opp("e", 31), opp("v", 35), opp("h", 39)] }, async () => {
        const slots = await pickOfferSlots(f);
        assert.deepEqual(slots, [
            { offerType: "Easy", opponentId: "e" },
            { offerType: "Even", opponentId: "v" },
            { offerType: "Hard", opponentId: "h" },
        ]);
    });
});

test("pickOfferSlots: backfilled slots are re-ordered so labels follow OVR", async () => {
    const f = fighter();
    // Easy window empty; the filler (OVR 37) is higher than Even (35).
    await withPick({ windows: [null, opp("v", 35), opp("h", 39)], fillers: [opp("fill", 37)] }, async () => {
        const slots = await pickOfferSlots(f);
        assert.deepEqual(slots.map((s) => [s.offerType, s.opponentId]), [["Easy", "v"], ["Even", "fill"], ["Hard", "h"]]);
    });
});

test("pickOfferSlots: avoidOpponentIds go into the window $nin but NOT the backfill", async () => {
    const f = fighter();
    await withPick({ windows: [opp("e", 31), null, opp("h", 39)], fillers: [opp("fill", 35)] }, async (calls) => {
        await pickOfferSlots(f, { avoidOpponentIds: ["old-e", "old-v"] });
        assert.equal(calls.windows.length, 3);
        for (const m of calls.windows) {
            assert.ok(m._id.$nin.includes("old-e") && m._id.$nin.includes("old-v"), "window avoids old picks");
        }
        assert.equal(calls.backfill.length, 1);
        assert.ok(!calls.backfill[0]._id.$nin.includes("old-e"), "backfill ignores the soft avoid list");
        assert.ok(!calls.backfill[0]._id.$nin.includes("old-v"));
        assert.ok(calls.backfill[0]._id.$nin.includes("e"), "backfill keeps its running exclude list");
    });
});

test("pickOfferSlots: the nemesis is forced into its OVR slot and excluded from the windows", async () => {
    const nem = opp("nem", 39); // O+4 -> Hard
    const f = fighter({ nemesis: { opponentId: "nem", opponentName: "Opp nem", lossCount: 2, setAt: null } });
    await withPick({ windows: [opp("e", 31), opp("v", 35), opp("h", 38)], nemesis: nem }, async (calls) => {
        const slots = await pickOfferSlots(f);
        assert.deepEqual(slots.map((s) => [s.offerType, s.opponentId]), [["Easy", "e"], ["Even", "v"], ["Hard", "nem"]]);
        assert.ok(calls.windows.every((m) => m._id.$nin.includes("nem")));
        assert.equal(f.saves, 0);
    });
});

test("pickOfferSlots: a stale nemesis (other tier) is cleared with a save", async () => {
    const f = fighter({ nemesis: { opponentId: "nem", opponentName: "X", lossCount: 1, setAt: null } });
    await withPick({ windows: [opp("e", 31), opp("v", 35), opp("h", 39)], nemesis: opp("nem", 60, { promotionTier: "National" }) }, async () => {
        await pickOfferSlots(f);
        assert.equal(f.saves, 1);
        assert.equal(f.nemesis.opponentId, null);
    });
});

test("pickOfferSlots: a TitleShot slot is appended when pendingPromotion is set and a champion exists", async () => {
    const f = fighter({ overallRating: 46, pendingPromotion: "National" }); // National minOverall 45
    const champ = opp("champ", 52, { isChampion: true, fixedRank: 1 });
    await withPick({ windows: [opp("e", 42), opp("v", 46), opp("h", 50)], champion: champ }, async () => {
        const slots = await pickOfferSlots(f);
        assert.equal(slots.length, 4);
        assert.deepEqual(slots[3], { offerType: "TitleShot", opponentId: "champ" });
    });
    await withPick({ windows: [opp("e", 42), opp("v", 46), opp("h", 50)], champion: null }, async () => {
        const slots = await pickOfferSlots(fighter({ overallRating: 46, pendingPromotion: "National" }));
        assert.equal(slots.length, 3, "no champion, no title slot");
    });
});

test("pickOfferSlots: pendingPromotion is cleared (with a save) after an OVR drop, and no title slot", async () => {
    const f = fighter({ overallRating: 40, pendingPromotion: "National" });
    await withPick({ windows: [opp("e", 36), opp("v", 40), opp("h", 44)], champion: opp("champ", 52, { isChampion: true }) }, async () => {
        const slots = await pickOfferSlots(f);
        assert.equal(f.pendingPromotion, null);
        assert.equal(f.saves, 1);
        assert.equal(slots.length, 3);
    });
});

test("pickOfferSlots: never touches the callout or injuries", async () => {
    const f = fighter({
        activeCallout: { opponentId: "c1" },
        injuries: [{ cannotFight: true, doctorVisited: false, label: "Concussion" }],
    });
    await withPick({ windows: [opp("e", 31), opp("v", 35), opp("h", 39)] }, async () => {
        const slots = await pickOfferSlots(f);
        assert.deepEqual(slots.map((s) => s.opponentId), ["e", "v", "h"]);
    });
});

// ── hydrateOffers ───────────────────────────────────────────────────────────

function withRoster(roster, body) {
    let finds = 0;
    const find = (q) => {
        finds += 1;
        const ids = q._id.$in.map(String);
        return { lean: async () => ids.map((id) => roster[id]).filter(Boolean).map((d) => structuredClone(d)) };
    };
    const findById = (id) => ({ lean: async () => (roster[String(id)] ? structuredClone(roster[String(id)]) : null) });
    return withStub(Opponent, "find", find, () =>
        withStub(Opponent, "findById", findById, () => body(() => finds)));
}

const SLOTS = [
    { offerType: "Easy", opponentId: "e" },
    { offerType: "Even", opponentId: "v" },
    { offerType: "Hard", opponentId: "h" },
];

test("hydrateOffers: one $in read, slot order kept, context from the CURRENT fightHistory", async () => {
    const roster = {
        e: opp("e", 31, { fightHistory: [{ result: "win" }, { result: "win" }, { result: "loss" }] }),
        v: opp("v", 35, { fightHistory: [{ result: "loss" }, { result: "loss" }] }),
        h: opp("h", 39),
    };
    await withRoster(roster, async (finds) => {
        const { offers, missing } = await hydrateOffers(fighter(), SLOTS);
        assert.equal(missing, false);
        assert.equal(finds(), 1);
        assert.deepEqual(offers.map((o) => [o.type, o.opponent._id]), [["Easy", "e"], ["Even", "v"], ["Hard", "h"]]);
        assert.deepEqual(offers[0].context.record, { wins: 2, losses: 1, draws: 0 });
        assert.deepEqual(offers[1].context.streak, { result: "loss", count: 2 });
        assert.equal(offers[0].opponent.displayRank, 8);

        // A fight resolved since the board was stored: the next read sees it.
        roster.v.fightHistory.push({ result: "win" });
        const again = await hydrateOffers(fighter(), SLOTS);
        assert.deepEqual(again.offers[1].context.record, { wins: 1, losses: 2, draws: 0 });
    });
});

test("hydrateOffers: nemesis meta is live from fighter.nemesis", async () => {
    const roster = { e: opp("e", 31), v: opp("v", 35), h: opp("h", 39) };
    await withRoster(roster, async () => {
        const f = fighter({ nemesis: { opponentId: "v", opponentName: "Opp v", lossCount: 3, setAt: null } });
        const { offers } = await hydrateOffers(f, SLOTS);
        assert.deepEqual(offers[1].nemesisMeta, { lossCount: 3, setAt: null });
        assert.equal(offers[0].nemesisMeta, undefined);
    });
});

test("hydrateOffers: the callout overlay takes the Hard slot with its OWN context", async () => {
    const roster = {
        e: opp("e", 31), v: opp("v", 35),
        h: opp("h", 39, { fightHistory: [{ result: "loss" }] }),
        c1: opp("c1", 41, { fightHistory: [{ result: "win" }, { result: "win" }, { result: "draw" }] }),
    };
    await withRoster(roster, async () => {
        const f = fighter({ activeCallout: { opponentId: "c1", cost: 30, isStretch: false, calledAt: null } });
        const { offers } = await hydrateOffers(f, SLOTS);
        const hard = offers.find((o) => o.type === "Hard");
        assert.equal(hard.opponent._id, "c1");
        assert.equal(hard.isCallout, true);
        assert.deepEqual(hard.context.record, { wins: 2, losses: 0, draws: 1 }, "not the replaced slot's record");
    });
});

test("hydrateOffers: the callout overlay is applied BEFORE the title slot is appended", async () => {
    const roster = {
        e: opp("e", 31), v: opp("v", 35), h: opp("h", 39), c1: opp("c1", 41),
        champ: opp("champ", 60, { isChampion: true, fixedRank: 1 }),
    };
    await withRoster(roster, async () => {
        const f = fighter({
            pendingPromotion: "National",
            activeCallout: { opponentId: "c1", cost: 30, isStretch: false, calledAt: null },
        });
        const { offers } = await hydrateOffers(f, [...SLOTS, { offerType: "TitleShot", opponentId: "champ" }]);
        assert.deepEqual(offers.map((o) => o.type), ["Easy", "Even", "Hard", "TitleShot"]);
        assert.equal(offers[2].opponent._id, "c1");
        assert.equal(offers[3].opponent._id, "champ");
    });
});

test("hydrateOffers: title slot has OVR x1.05 and LIVE lock fields", async () => {
    const roster = { e: opp("e", 31), v: opp("v", 35), h: opp("h", 39), champ: opp("champ", 60, { isChampion: true, fixedRank: 1 }) };
    const slots = [...SLOTS, { offerType: "TitleShot", opponentId: "champ" }];
    await withRoster(roster, async () => {
        const locked = fighter({ pendingPromotion: "National", titleShotCooldown: 1, topFiveWinsInTier: 1, ranking: { rank: 9 } });
        const a = (await hydrateOffers(locked, slots)).offers[3];
        assert.equal(a.type, "TitleShot");
        assert.equal(a.opponent.overallRating, 63);
        assert.equal(a.locked, true);
        assert.equal(a.cooldownRemaining, 1);
        assert.equal(a.winsNeeded, fightService.getTitleShotConfig(TIER).titleWins - 1);
        assert.equal(a.rankNeeded, true);
        assert.equal(a.currentRank, 8);
        assert.deepEqual(a.titleShotMeta, { targetTier: "National" });

        // Same stored slots, fighter state moved on: lock state follows without a regenerate.
        const ready = fighter({ pendingPromotion: "National", titleShotCooldown: 0, topFiveWinsInTier: 3, ranking: { rank: 4 } });
        const b = (await hydrateOffers(ready, slots)).offers[3];
        assert.equal(b.locked, false);
        assert.equal(b.winsNeeded, 0);
        assert.equal(b.rankNeeded, false);
    });
});

test("hydrateOffers: a missing opponent sets missing:true", async () => {
    const roster = { e: opp("e", 31), h: opp("h", 39) };
    await withRoster(roster, async () => {
        const { offers, missing } = await hydrateOffers(fighter(), SLOTS);
        assert.equal(missing, true);
        assert.deepEqual(offers.map((o) => o.opponent._id), ["e", "h"]);
    });
});

test("hydrateOffers: a stored title opponent that is no longer champion counts as missing", async () => {
    const roster = { e: opp("e", 31), v: opp("v", 35), h: opp("h", 39), champ: opp("champ", 60, { isChampion: false }) };
    await withRoster(roster, async () => {
        const { missing } = await hydrateOffers(fighter({ pendingPromotion: "National" }),
            [...SLOTS, { offerType: "TitleShot", opponentId: "champ" }]);
        assert.equal(missing, true);
    });
});
