/**
 * controllers/rankingController:
 *   - getRankings: the player row carries titleWins (career GCS belt wins) and the
 *     select includes gcsTitleWins (docs/gcs-title-contract.md B22).
 *   - getFighterRank: isTopFive is computed on the INTERNAL rank read straight from a
 *     lean doc (never display-shifted), so internal 5 is in and internal 6 is out. It
 *     agrees with rankingService.isTopFive at every rank.
 *
 * No Express, no DB: model statics are stubbed with chainable doubles and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const Opponent = require("../../models/opponentModel");
const rankingService = require("../../services/rankingService");
const { getRankings, getFighterRank } = require("../../controllers/rankingController");

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

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

/** Chainable query double: .select(), .sort() record their arg; .lean() resolves. */
function query(result, seen = {}) {
    const q = {
        select: (s) => { seen.select = s; return q; },
        sort: () => q,
        lean: async () => result,
    };
    return q;
}

const NPCS = [
    { _id: "c", name: "Champ", fixedRank: 1, isChampion: true, overallRating: 90, record: { wins: 20, losses: 0 } },
    { _id: "n2", name: "Two", fixedRank: 2, overallRating: 85, record: { wins: 10, losses: 2 } },
];

function player(over = {}) {
    return {
        _id: "f1", firstName: "Pat", lastName: "Doe", nickname: null, promotionTier: "GCS",
        weightClass: "Lightweight", style: "Boxing", overallRating: 82,
        record: { wins: 30, losses: 3, draws: 0 }, ranking: { rank: 3 }, ...over,
    };
}

async function rankingsFor(fighterDoc) {
    const seen = {};
    const res = mockRes();
    await withStub(Opponent, "find", () => query(NPCS), () =>
        withStub(Fighter, "findById", () => query(fighterDoc, seen), () =>
            getRankings({ params: { tier: "GCS" }, query: { weightClass: "Lightweight", fighterId: "f1" } }, res)));
    return { res, seen };
}

test("getRankings: player row carries titleWins from gcsTitleWins, and the select asks for it", async () => {
    const { res, seen } = await rankingsFor(player({ gcsTitleWins: 2 }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.player.titleWins, 2);
    assert.equal(res.body.player.isPlayer, true);
    assert.equal(res.body.player.isChampion, false, "the NPC keeps the champion flag");
    assert.ok(seen.select.split(/\s+/).includes("gcsTitleWins"));
    assert.equal(res.body.roster[0].isChampion, true);
});

test("getRankings: titleWins defaults to 0 when the field is absent", async () => {
    const { res } = await rankingsFor(player());
    assert.equal(res.body.player.titleWins, 0);
});

async function rankFor(rank) {
    const res = mockRes();
    await withStub(Fighter, "findById", () => query({
        promotionTier: "Regional Pro", weightClass: "Lightweight", overallRating: 40,
        winsInCurrentTier: 2, ranking: { rank, fightsInTier: 6 },
    }), () => getFighterRank({ params: { id: "f1" } }, res));
    return res.body;
}

test("getFighterRank: isTopFive uses the internal rank (internal 5 in, internal 6 out)", async () => {
    assert.equal(rankingService.TOP_FIVE_INTERNAL_RANK, 5);
    assert.equal((await rankFor(5)).isTopFive, true);
    assert.equal((await rankFor(6)).isTopFive, false);
    assert.equal((await rankFor(null)).isTopFive, false);
});

test("getFighterRank: isTopFive agrees with rankingService.isTopFive at every rank", async () => {
    for (const rank of [null, 2, 3, 4, 5, 6, 7, 10, 15]) {
        // eslint-disable-next-line no-await-in-loop
        const body = await rankFor(rank);
        assert.equal(body.isTopFive, rankingService.isTopFive({ ranking: { rank } }), String(rank));
    }
});
