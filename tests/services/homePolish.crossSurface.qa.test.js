/**
 * QA sweep for the Home polish change set: one NPC rank number across every surface, and
 * the nudge text for every step the server can emit.
 *
 * Surfaces compared per NPC: hydrateOffers (Fight Hub OfferCard), summariseOffers list row
 * (Home bookings), buildHeroBout offer branch (Next fight), buildHeroBout accepted branch
 * (signedOpponentRank), calloutService.listRoster and rankingController.getRankings
 * (Rankings tab). No DB: model statics are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Opponent = require("../../models/opponentModel");
const Fighter = require("../../models/fighterModel");
const Fight = require("../../models/fightModel");
const fightService = require("../../services/fightService");
const rankingService = require("../../services/rankingService");
const calloutService = require("../../services/calloutService");
const dashboardService = require("../../services/dashboardService");
const { getRankings } = require("../../controllers/rankingController");

async function withStub(obj, key, impl, body) {
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const original = obj[key];
    obj[key] = impl;
    try { return await body(); } finally { if (had) obj[key] = original; else delete obj[key]; }
}

const TIER = "Regional Pro";
const WC = "Lightweight";

function npc(id, fixedRank, over = {}) {
    return {
        _id: id, name: `N${id}`, overallRating: 40, promotionTier: TIER, weightClass: WC,
        fixedRank, isChampion: fixedRank === 1, fightHistory: [], record: { wins: 1, losses: 1, draws: 0 }, ...over,
    };
}

function raw(rank, over = {}) {
    return {
        _id: "f1", promotionTier: TIER, weightClass: WC, overallRating: 40,
        nemesis: { opponentId: null, lossCount: 0 }, pendingPromotion: null, activeCallout: { opponentId: null },
        titleShotCooldown: 0, topFiveWinsInTier: 0, ranking: { rank }, beefFlags: [], respectFlags: [],
        ...over,
    };
}

function res() {
    const r = { body: undefined };
    r.status = () => r;
    r.json = (b) => { r.body = b; return r; };
    return r;
}

/** Roster: champion, ranks 2..14 same tier, one stretch NPC at the next tier. */
function roster() {
    const list = [npc("c", 1)];
    for (let r = 2; r <= 14; r += 1) list.push(npc(`n${r}`, r));
    list.push(npc("s", 9, { promotionTier: "National" }));
    return list;
}

for (const playerRank of [null, 2, 3, 6, 9, 14]) {
    test(`rank sweep: every surface prints the Rankings tab number (player raw rank ${playerRank})`, async () => {
        const list = roster();
        const sameTier = list.filter((n) => n.promotionTier === TIER);

        // Rankings tab (controller), same tier.
        const tabById = {};
        await withStub(Opponent, "find", () => ({ select: () => ({ sort: () => ({ lean: async () => sameTier }) }) }), async () =>
            withStub(Fighter, "findById", () => ({ select: () => ({ lean: async () => ({
                _id: "f1", firstName: "A", lastName: "B", promotionTier: TIER, weightClass: WC, ranking: { rank: playerRank },
                record: { wins: 0, losses: 0 },
            }) }) }), async () => {
                const r = res();
                await getRankings({ params: { tier: TIER }, query: { weightClass: WC, fighterId: "f1" } }, r);
                for (const row of r.body.roster) tabById[row.id] = row.rank;
            }));

        const check = async (n) => {
            const slot = n.isChampion ? "TitleShot" : "Easy";
            await withStub(Opponent, "find", () => ({ lean: async () => [n] }), async () => {
                const { offers } = await fightService.hydrateOffers(raw(playerRank), [{ offerType: slot, opponentId: n._id }]);
                const shown = offers[0].opponent.displayRank;
                if (n.promotionTier === TIER) {
                    assert.equal(shown, tabById[n._id] ?? null, `${n._id}: offer card vs Rankings tab`);
                } else {
                    assert.equal(shown, rankingService.toDisplayRank(n.fixedRank), "stretch NPC: own fixedRank, one display shift");
                }
                if (n.isChampion) assert.equal(shown, null, "champion: no number");

                const acceptable = offers.map((o) => ({ ...o, locked: false, acceptable: true }));
                const summary = dashboardService.summariseOffers(acceptable, TIER, null);
                assert.equal(summary.list[0].opponentRank, shown, "bookings row");
                const hero = await dashboardService.buildHeroBout(
                    { promotionTier: TIER, acceptedFightId: null }, { offers: acceptable }, { ranking: { rank: playerRank } });
                assert.equal(hero.opponentRank, shown, "Next fight offer branch");

                await withStub(Fight, "findById", () => ({ populate: () => ({ lean: async () => ({ opponentId: n, offerType: "Easy" }) }) }), async () => {
                    const acc = await dashboardService.buildHeroBout(
                        { promotionTier: TIER, acceptedFightId: "x" }, { offers: [] }, { ranking: { rank: playerRank } });
                    assert.equal(acc.source, "accepted");
                    assert.equal(acc.opponentRank, shown, `${n._id}: accepted branch`);
                });
            });
        };
        for (const n of list) await check(n);

        if (playerRank != null && playerRank <= rankingService.CALLOUT_RANK_THRESHOLD) {
            await withStub(Fighter, "findById", () => ({ lean: async () => ({ ...raw(playerRank), notoriety: { score: 0 } }) }), async () =>
                withStub(Opponent, "find", (q) => {
                    const rows = q.promotionTier === "National"
                        ? list.filter((n) => n.promotionTier === "National")
                        : list.filter((n) => n.promotionTier === TIER && n.fixedRank > 1 && n.fixedRank < playerRank);
                    return { sort: () => ({ limit: () => ({ lean: async () => rows }) }) };
                }, async () => {
                    const out = await calloutService.listRoster("f1");
                    for (const row of out.sameTier) assert.equal(row.rank, tabById[row.id] ?? null, "callout same tier vs Rankings tab");
                    for (const row of out.stretchTier) assert.equal(row.rank, rankingService.toDisplayRank(9), "callout stretch: own fixedRank");
                }));
        }
    });
}

test("nudge: every step key yields clean text and a known link target", () => {
    const keys = [
        { key: "hidden" }, { key: "autoPromote", n: 62 }, { key: "autoPromoteNextFight" },
        { key: "rematch", n: 1 }, { key: "rematch", n: 2 }, { key: "getRanked", n: 1 }, { key: "getRanked", n: 3 },
        { key: "reachTop5", n: 4, rank: 8 }, { key: "winTop5", n: 1 }, { key: "winTop5", n: 2, gcs: true },
        { key: "winTop5", n: 1, gcs: true, champion: true }, { key: "reachOvr", n: 50 }, { key: "lockInOvr" },
        { key: "ready" }, { key: "ready", gcs: true }, { key: "bogus" },
    ];
    for (const tier of ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"]) {
        for (const step of keys) {
            const out = dashboardService.buildNudge({ promotionTier: tier }, { titleShot: { step } });
            assert.ok(!/undefined|NaN|null/.test(out.text), `${tier}/${step.key}: ${out.text}`);
            assert.ok(!out.text.includes(String.fromCharCode(0x2014)));
            assert.ok(["fights", "gym", "rankings"].includes(out.linkTarget));
        }
    }
});
