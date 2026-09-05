/**
 * QA unit tests — the FIGHT NIGHT HOME payload blocks added to dashboardService:
 * offers.list, heroBout, pvp ladder/twist, and homeCamp.
 *
 * These exist because GET /fighters/:id/dashboard is the hottest endpoint in the game
 * and the frontend builds blind against the JSDoc contract at the top of
 * services/dashboardService.js. So they assert (a) the exact SHAPE the contract promises,
 * (b) that accepted-fight precedence beats the offer branch, and (c) that every new
 * builder degrades to null rather than taking the whole dashboard down — that degrade
 * rule is the file's stated design rule, not a nicety.
 *
 * No DB: model statics are monkey-patched with in-memory fakes, matching the convention
 * of tests/services/pvpSeasonRollover.test.js (tests/services/*.test.js never spin up
 * Mongo/Redis). Every patch is restored in the test that installs it, so nothing leaks
 * between tests — request isolation is the thing we are actually protecting here.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fight = require("../../models/fightModel");
const HomeCamp = require("../../models/homeCampModel");
const PVPRecord = require("../../models/pvpRecordModel");
const pvpRecordService = require("../../services/pvpRecordService");
const homeCampService = require("../../services/homeCampService");
const dashboardService = require("../../services/dashboardService");
const { PROMOTION_TIERS } = require("../../consts/gameConstants");
const { TWISTS } = require("../../consts/pvpConfig");

const {
    summariseOffers,
    pickBestOffer,
    buildHeroBout,
    buildHomeCamp,
    buildLadderStanding,
} = dashboardService;

const TIER = "Regional Pro";
const TIER_PURSE = PROMOTION_TIERS[TIER].signingFee;

// ── Fixtures ────────────────────────────────────────────────────────────────

function opp(over = {}) {
    return {
        _id: over._id || "opp-1",
        name: "Rico Vasquez",
        nickname: "The Hammer",
        overallRating: 40,
        style: "Boxing",
        promotionTier: TIER,
        weightClass: "Lightweight",
        fightHistory: [],
        ...over,
    };
}

function offer(type, over = {}) {
    return {
        type,
        opponent: opp(over.opponent),
        context: { record: { wins: 3, losses: 1, draws: 0 }, streak: { result: "win", count: 3 }, lastThree: [] },
        ...over,
    };
}

/** Swap a static, run the body, always put it back — even when the body throws. */
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

/** Minimal chainable Query fake: .populate().lean() and .lean(). */
function queryOf(doc) {
    const q = {
        populate: () => q,
        lean: async () => doc,
        then: undefined,
    };
    return q;
}

// ── offers.list ─────────────────────────────────────────────────────────────

test("summariseOffers.list carries the full contract shape for every card", () => {
    const { list } = summariseOffers([offer("Even")], TIER);

    assert.equal(list.length, 1);
    assert.deepEqual(Object.keys(list[0]).sort(), [
        "isNemesis", "isTitleShot", "locked", "opponentId", "opponentName",
        "opponentNickname", "opponentOvr", "opponentStyle", "opponentTier",
        "opponentWeightClass", "purse", "record", "streak", "type",
    ]);
    assert.deepEqual(list[0], {
        opponentId: "opp-1",
        opponentName: "Rico Vasquez",
        opponentNickname: "The Hammer",
        opponentOvr: 40,
        opponentStyle: "Boxing",
        opponentTier: TIER,
        opponentWeightClass: "Lightweight",
        record: { wins: 3, losses: 1, draws: 0 },
        streak: { result: "win", count: 3 },
        type: "Even",
        isTitleShot: false,
        isNemesis: false,
        locked: false,
        purse: TIER_PURSE,
    });
});

test("summariseOffers.list preserves generation order and caps at 4", () => {
    const many = ["Easy", "Even", "Hard", "TitleShot", "Even"].map((t, i) =>
        offer(t, { opponent: { _id: `opp-${i}` } }));
    const { list } = summariseOffers(many, TIER);

    assert.equal(list.length, 4);
    assert.deepEqual(list.map((c) => c.type), ["Easy", "Even", "Hard", "TitleShot"]);
    assert.deepEqual(list.map((c) => c.opponentId), ["opp-0", "opp-1", "opp-2", "opp-3"]);
});

test("summariseOffers.list keeps a LOCKED title shot as a card but not in count", () => {
    const offers = [offer("Even"), offer("TitleShot", { locked: true, opponent: { _id: "champ" } })];
    const { list, count, best } = summariseOffers(offers, TIER);

    assert.equal(count, 1, "a locked title shot is not a real offer");
    assert.equal(list.length, 2, "but the card still renders, disabled");
    assert.equal(list[1].locked, true);
    assert.equal(list[1].isTitleShot, true);
    assert.equal(best.isTitleShot, false, "a locked title shot can never be best");
});

test("summariseOffers.list marks the nemesis card and tolerates a null nemesisMeta", () => {
    const offers = [
        offer("Easy", { nemesisMeta: { lossCount: 2, setAt: new Date() } }),
        offer("Even", { nemesisMeta: null, opponent: { _id: "opp-2" } }),
    ];
    const { list } = summariseOffers(offers, TIER);

    assert.equal(list[0].isNemesis, true);
    assert.equal(list[1].isNemesis, false);
});

test("summariseOffers.list is [] for no offers and never throws on junk", () => {
    assert.deepEqual(summariseOffers([], TIER).list, []);
    assert.deepEqual(summariseOffers(null, TIER).list, []);
    assert.deepEqual(summariseOffers([null, undefined], TIER).list, []);

    // A malformed offer must still produce a renderable card, not a crash.
    const { list } = summariseOffers([{ type: "Even" }], TIER);
    assert.equal(list.length, 1);
    assert.equal(list[0].opponentId, null);
    assert.deepEqual(list[0].record, { wins: 0, losses: 0, draws: 0 });
    assert.equal(list[0].streak, null);
});

test("purse is null when the tier is unknown (mirrors the live buildOffers call)", () => {
    const { list } = summariseOffers([offer("Even")], null);
    assert.equal(list[0].purse, null);
});

test("offers.best and heroBout resolve to the SAME offer (one precedence rule)", async () => {
    const offers = [
        offer("Easy", { opponent: { _id: "a", overallRating: 20, name: "A" } }),
        offer("Hard", { opponent: { _id: "b", overallRating: 55, name: "B" } }),
    ];
    const { best } = summariseOffers(offers, TIER);
    const hero = await buildHeroBout({ promotionTier: TIER }, { offers });

    assert.equal(pickBestOffer(offers).opponent._id, "b");
    assert.equal(best.opponentName, "B");
    assert.equal(hero.opponentName, "B");
});

// ── heroBout ────────────────────────────────────────────────────────────────

test("heroBout: a signed fight BEATS the best offer", async () => {
    const fightDoc = {
        _id: "fight-1",
        offerType: "Hard",
        promotionTier: TIER,
        opponentId: opp({ _id: "signed-opp", name: "Signed Sam", overallRating: 12 }),
    };

    await withStub(Fight, "findById", () => queryOf(fightDoc), async () => {
        const offers = [offer("Even", { opponent: { _id: "offer-opp", name: "Offer Otto", overallRating: 99 } })];
        const hero = await buildHeroBout(
            { promotionTier: TIER, acceptedFightId: "fight-1" },
            { offers },
        );

        assert.equal(hero.source, "accepted");
        assert.equal(hero.opponentId, "signed-opp");
        assert.equal(hero.opponentName, "Signed Sam");
        assert.equal(hero.purse, TIER_PURSE);
        assert.equal(typeof hero.rounds, "number");
        assert.equal(hero.isRematch, false, "documented as always false");
    });
});

test("heroBout: no signed fight falls back to the best offer", async () => {
    const offers = [offer("Even", { opponent: { _id: "offer-opp", name: "Offer Otto" } })];
    const hero = await buildHeroBout({ promotionTier: TIER, acceptedFightId: null }, { offers });

    assert.equal(hero.source, "offer");
    assert.equal(hero.opponentId, "offer-opp");
    assert.deepEqual(hero.record, { wins: 3, losses: 1, draws: 0 });
});

test("heroBout: accepted branch issues exactly ONE Fight.findById", async () => {
    let calls = 0;
    await withStub(Fight, "findById", () => { calls += 1; return queryOf(null); }, async () => {
        await buildHeroBout({ promotionTier: TIER, acceptedFightId: "fight-1" }, { offers: [] });
    });
    assert.equal(calls, 1);
});

test("heroBout: the OFFER branch issues no Fight query at all", async () => {
    let calls = 0;
    await withStub(Fight, "findById", () => { calls += 1; return queryOf(null); }, async () => {
        const hero = await buildHeroBout({ promotionTier: TIER }, { offers: [offer("Even")] });
        assert.equal(hero.source, "offer");
    });
    assert.equal(calls, 0, "no acceptedFightId means no Fight read");
});

test("heroBout: null when there is no signed fight AND no offer (injury case)", async () => {
    // generateOffers throws on a blocking injury, so buildOffers degrades to offers:[]
    // and heroAction.key === "injury". The hero must render with no rival plate.
    assert.equal(await buildHeroBout({ promotionTier: TIER }, { offers: [] }), null);
    assert.equal(await buildHeroBout({ promotionTier: TIER }, { offers: null }), null);
    assert.equal(await buildHeroBout({ promotionTier: TIER }, null), null);
    assert.equal(await buildHeroBout(null, null), null);
});

test("heroBout: null when the ONLY offer is a locked title shot", async () => {
    const offers = [offer("TitleShot", { locked: true })];
    assert.equal(await buildHeroBout({ promotionTier: TIER }, { offers }), null);
});

test("heroBout: a dangling acceptedFightId degrades to the offer branch, not a crash", async () => {
    await withStub(Fight, "findById", () => queryOf(null), async () => {
        const offers = [offer("Even", { opponent: { _id: "offer-opp" } })];
        const hero = await buildHeroBout({ promotionTier: TIER, acceptedFightId: "gone" }, { offers });
        assert.equal(hero.source, "offer");
    });
});

test("heroBout: a THROWING Fight read degrades to the offer branch", async () => {
    await withStub(Fight, "findById", () => { throw new Error("mongo down"); }, async () => {
        const offers = [offer("Even", { opponent: { _id: "offer-opp" } })];
        const hero = await buildHeroBout({ promotionTier: TIER, acceptedFightId: "f" }, { offers });
        assert.equal(hero.source, "offer");
    });
});

test("heroBout: a THROWING Fight read with no offers degrades to null", async () => {
    await withStub(Fight, "findById", () => { throw new Error("mongo down"); }, async () => {
        assert.equal(await buildHeroBout({ promotionTier: TIER, acceptedFightId: "f" }, { offers: [] }), null);
    });
});

test("heroBout: accepted opponent record is derived from fightHistory, not the seeded record", async () => {
    const fightDoc = {
        offerType: "TitleShot",
        promotionTier: TIER,
        opponentId: opp({
            record: { wins: 99, losses: 0, draws: 0 },   // seeded flavour — must be ignored
            fightHistory: [{ result: "win" }, { result: "loss" }, { result: "win" }, { result: "draw" }],
        }),
    };
    await withStub(Fight, "findById", () => queryOf(fightDoc), async () => {
        const hero = await buildHeroBout({ promotionTier: TIER, acceptedFightId: "f" }, { offers: [] });
        assert.deepEqual(hero.record, { wins: 2, losses: 1, draws: 1 });
        assert.equal(hero.isTitleShot, true);
    });
});

test("heroBout: isNemesis is true only when the signed opponent IS the nemesis", async () => {
    const fightDoc = { offerType: "Even", promotionTier: TIER, opponentId: opp({ _id: "opp-1" }) };
    await withStub(Fight, "findById", () => queryOf(fightDoc), async () => {
        const fighter = { promotionTier: TIER, acceptedFightId: "f", nemesis: { opponentId: "opp-1" } };
        assert.equal((await buildHeroBout(fighter, { offers: [] })).isNemesis, true);

        const other = { promotionTier: TIER, acceptedFightId: "f", nemesis: { opponentId: "someone-else" } };
        assert.equal((await buildHeroBout(other, { offers: [] })).isNemesis, false);

        const none = { promotionTier: TIER, acceptedFightId: "f" };
        assert.equal((await buildHeroBout(none, { offers: [] })).isNemesis, false);
    });
});

test("heroBout: an unpopulated opponentId is not mistaken for an opponent", async () => {
    // .populate() silently leaves the raw ObjectId behind when the ref is missing.
    const fightDoc = { offerType: "Even", promotionTier: TIER, opponentId: "raw-object-id" };
    await withStub(Fight, "findById", () => queryOf(fightDoc), async () => {
        const hero = await buildHeroBout({ promotionTier: TIER, acceptedFightId: "f" }, { offers: [] });
        assert.equal(hero, null, "no name/OVR available, so no hero bout");
    });
});

// ── pvp ladder standing ─────────────────────────────────────────────────────

test("buildLadderStanding: no record means no query and both fields null", async () => {
    let counts = 0;
    let ranks = 0;
    await withStub(PVPRecord, "countDocuments", async () => { counts += 1; return 5; }, async () => {
        await withStub(pvpRecordService, "computeRank", async () => { ranks += 1; return 1; }, async () => {
            assert.deepEqual(await buildLadderStanding(null), { ladderRank: null, ladderSize: null });
        });
    });
    assert.equal(counts, 0, "a fighter who never entered the Proving Ground costs nothing");
    assert.equal(ranks, 0);
});

test("buildLadderStanding: rank + size come from the record's own ladder", async () => {
    const record = { seasonId: "s1", weightClass: "Lightweight", dp: 120 };
    let sizeQuery = null;
    await withStub(PVPRecord, "countDocuments", async (q) => { sizeQuery = q; return 312; }, async () => {
        await withStub(pvpRecordService, "computeRank", async (r) => (r === record ? 14 : -1), async () => {
            assert.deepEqual(await buildLadderStanding(record), { ladderRank: 14, ladderSize: 312 });
        });
    });
    assert.deepEqual(sizeQuery, { seasonId: "s1", weightClass: "Lightweight" });
});

test("buildLadderStanding: degrades to nulls when a count throws", async () => {
    const record = { seasonId: "s1", weightClass: "Lightweight", dp: 120 };
    await withStub(PVPRecord, "countDocuments", async () => { throw new Error("index gone"); }, async () => {
        await withStub(pvpRecordService, "computeRank", async () => 14, async () => {
            assert.deepEqual(await buildLadderStanding(record), { ladderRank: null, ladderSize: null });
        });
    });
});

test("buildLadderStanding: a non-numeric rank degrades to null, not NaN", async () => {
    const record = { seasonId: "s1", weightClass: "Lightweight", dp: 0 };
    await withStub(PVPRecord, "countDocuments", async () => 10, async () => {
        await withStub(pvpRecordService, "computeRank", async () => null, async () => {
            assert.deepEqual(await buildLadderStanding(record), { ladderRank: null, ladderSize: 10 });
        });
    });
});

// ── pvp twist ───────────────────────────────────────────────────────────────

test("buildPvp: twistKey/twistName come from the season, ladder from the record", async () => {
    const pvpSeasonService = require("../../services/pvpSeasonService");
    const season = {
        _id: "s1", seasonNumber: 2, name: "Blood Sport", status: "active",
        twist: "blood_sport", startDate: new Date(), endDate: new Date(Date.now() + 7 * 86400000),
        config: { crossWeightClass: false },
    };
    const record = { seasonId: "s1", weightClass: "Lightweight", dp: 90, wins: 4, losses: 1 };

    await withStub(pvpSeasonService, "getCurrentSeasonForFighter", async () => season, async () => {
        await withStub(pvpRecordService, "getRecord", async () => record, async () => {
            await withStub(pvpRecordService, "computeRank", async () => 7, async () => {
                await withStub(PVPRecord, "countDocuments", async () => 25, async () => {
                    const pvp = await dashboardService.buildPvp({ _id: "f1", weightClass: "Lightweight" });
                    assert.equal(pvp.twistKey, "blood_sport");
                    assert.equal(pvp.twistName, TWISTS.blood_sport.name);
                    assert.equal(pvp.ladderRank, 7);
                    assert.equal(pvp.ladderSize, 25);
                    assert.equal(pvp.hasPlayed, true);
                });
            });
        });
    });
});

test("buildPvp: an unknown/absent twist degrades to null, never a prototype key", async () => {
    const pvpSeasonService = require("../../services/pvpSeasonService");
    for (const twist of [undefined, null, "not_a_twist", "constructor", "__proto__", "toString"]) {
        const season = {
            _id: "s1", seasonNumber: 1, name: "Open", status: "active", twist,
            startDate: new Date(), endDate: new Date(Date.now() + 86400000), config: {},
        };
        // eslint-disable-next-line no-await-in-loop
        await withStub(pvpSeasonService, "getCurrentSeasonForFighter", async () => season, async () => {
            await withStub(pvpRecordService, "getRecord", async () => null, async () => {
                const pvp = await dashboardService.buildPvp({ _id: "f1", weightClass: "Lightweight" });
                assert.equal(pvp.twistKey, null, `twist ${String(twist)}`);
                assert.equal(pvp.twistName, null, `twist ${String(twist)}`);
            });
        });
    }
});

test("buildPvp: no season degrades the whole block to null", async () => {
    const pvpSeasonService = require("../../services/pvpSeasonService");
    await withStub(pvpSeasonService, "getCurrentSeasonForFighter", async () => null, async () => {
        assert.equal(await dashboardService.buildPvp({ _id: "f1", weightClass: "Lightweight" }), null);
    });
});

test("buildPvp: a throwing season read degrades to null", async () => {
    const pvpSeasonService = require("../../services/pvpSeasonService");
    await withStub(pvpSeasonService, "getCurrentSeasonForFighter", async () => { throw new Error("boom"); }, async () => {
        assert.equal(await dashboardService.buildPvp({ _id: "f1", weightClass: "Lightweight" }), null);
    });
});

test("buildPvp: hasPlayed false leaves the ladder pair null and issues no count", async () => {
    const pvpSeasonService = require("../../services/pvpSeasonService");
    const season = {
        _id: "s1", seasonNumber: 2, name: "Blood Sport", status: "upcoming", twist: "iron_fist",
        startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 30 * 86400000), config: {},
    };
    let counts = 0;
    await withStub(pvpSeasonService, "getCurrentSeasonForFighter", async () => season, async () => {
        await withStub(pvpRecordService, "getRecord", async () => null, async () => {
            await withStub(PVPRecord, "countDocuments", async () => { counts += 1; return 0; }, async () => {
                const pvp = await dashboardService.buildPvp({ _id: "f1", weightClass: "Lightweight" });
                assert.equal(pvp.hasPlayed, false);
                assert.equal(pvp.ladderRank, null);
                assert.equal(pvp.ladderSize, null);
                assert.equal(pvp.twistKey, "iron_fist", "the twist still teases pre-season");
            });
        });
    });
    assert.equal(counts, 0);
});

// ── homeCamp ────────────────────────────────────────────────────────────────

const FIGHTER = { _id: "f1", promotionTier: "Amateur" };

function campDoc(over = {}) {
    return {
        _id: "camp-1",
        name: "Vasquez Camp",
        focusDomain: "STRIKING",
        tier: 1,
        condition: { value: 74 },
        coaches: [{ _id: "c1", name: "Coach One", archetype: "STRIKING", rank: 2, morale: 80, wage: 150 }],
        consecutiveUnpaidWeeks: 0,
        nextWageDebitAt: null,
        ...over,
    };
}

test("buildHomeCamp: null when the player has no camp doc", async () => {
    await withStub(HomeCamp, "findOne", () => queryOf(null), async () => {
        assert.equal(await buildHomeCamp("f1", FIGHTER), null);
    });
});

test("buildHomeCamp: degrades to null when the read throws", async () => {
    await withStub(HomeCamp, "findOne", () => { throw new Error("mongo down"); }, async () => {
        assert.equal(await buildHomeCamp("f1", FIGHTER), null);
    });
});

test("buildHomeCamp: issues exactly ONE findOne, on the fighterId index", async () => {
    let calls = 0;
    let query = null;
    await withStub(HomeCamp, "findOne", (q) => { calls += 1; query = q; return queryOf(campDoc()); }, async () => {
        await buildHomeCamp("f1", FIGHTER);
    });
    assert.equal(calls, 1);
    assert.deepEqual(query, { fighterId: "f1" });
});

test("buildHomeCamp: NEVER calls getCampState (that path creates and saves a camp)", async () => {
    let ticked = false;
    await withStub(homeCampService, "getCampState", async () => { ticked = true; return {}; }, async () => {
        await withStub(homeCampService, "ensureCamp", async () => { ticked = true; return {}; }, async () => {
            await withStub(HomeCamp, "findOne", () => queryOf(campDoc()), async () => {
                await buildHomeCamp("f1", FIGHTER);
            });
        });
    });
    assert.equal(ticked, false, "the dashboard is a GET and must not write");
});

test("buildHomeCamp: returns the full contract shape", async () => {
    await withStub(HomeCamp, "findOne", () => queryOf(campDoc()), async () => {
        const hc = await buildHomeCamp("f1", FIGHTER);
        assert.deepEqual(Object.keys(hc).sort(), [
            "campName", "conditionBand", "conditionValue", "headCoach",
            "market", "tier", "tierLabel", "wages",
        ]);
        assert.deepEqual(Object.keys(hc.headCoach).sort(), ["archetypeLabel", "morale", "name", "rank"]);
        assert.deepEqual(Object.keys(hc.wages).sort(),
            ["nextDebitAt", "nextDebitInDays", "unpaidWeeks", "weeklyTotal"]);
        assert.deepEqual(Object.keys(hc.market).sort(), ["open", "resetsAt", "resetsInDays"]);

        assert.equal(hc.campName, "Vasquez Camp");
        assert.equal(hc.conditionValue, 74);
        assert.equal(typeof hc.conditionBand, "string");
        assert.equal(hc.wages.weeklyTotal, 150);
        assert.equal(hc.wages.unpaidWeeks, 0);
        assert.equal(hc.wages.nextDebitAt, null);
        assert.equal(hc.wages.nextDebitInDays, null);
    });
});

// ── homeCampService pure selectors ──────────────────────────────────────────

test("pickHeadCoach: highest rank wins, ties broken by sessions run", () => {
    const camp = campDoc({
        coaches: [
            { name: "Low", rank: 1, sessionsCompleted: 99 },
            { name: "Tied A", rank: 3, sessionsCompleted: 4 },
            { name: "Tied B", rank: 3, sessionsCompleted: 40 },
        ],
    });
    assert.equal(homeCampService.pickHeadCoach(camp).name, "Tied B");
});

test("pickHeadCoach: stable for a total tie, and null for an empty/absent roster", () => {
    const tie = { coaches: [{ name: "First", rank: 2 }, { name: "Second", rank: 2 }] };
    assert.equal(homeCampService.pickHeadCoach(tie).name, "First");
    assert.equal(homeCampService.pickHeadCoach(tie).name, "First", "same answer on a second read");

    assert.equal(homeCampService.pickHeadCoach({ coaches: [] }), null);
    assert.equal(homeCampService.pickHeadCoach({}), null);
    assert.equal(homeCampService.pickHeadCoach(null), null);
    assert.equal(homeCampService.pickHeadCoach({ coaches: [null, null] }), null);
});

test("pickHeadCoach: does not reorder the stored roster", () => {
    const coaches = [{ name: "A", rank: 1 }, { name: "B", rank: 4 }];
    homeCampService.pickHeadCoach({ coaches });
    assert.deepEqual(coaches.map((c) => c.name), ["A", "B"]);
});

test("buildDashboardCampSummary: headCoach null for a camp with no coaches", () => {
    const s = homeCampService.buildDashboardCampSummary(campDoc({ coaches: [] }), FIGHTER);
    assert.equal(s.headCoach, null);
    assert.equal(s.wages.weeklyTotal, 0);
});

test("buildDashboardCampSummary: wage debit is reported as ISO + whole days", () => {
    const due = new Date(Date.now() + 3 * 86_400_000);
    const s = homeCampService.buildDashboardCampSummary(
        campDoc({ nextWageDebitAt: due, consecutiveUnpaidWeeks: 2 }), FIGHTER);

    assert.equal(s.wages.nextDebitAt, due.toISOString());
    assert.equal(s.wages.nextDebitInDays, 3);
    assert.equal(s.wages.unpaidWeeks, 2);
});

test("buildDashboardCampSummary: a past-due debit clamps to 0 days, never negative", () => {
    const s = homeCampService.buildDashboardCampSummary(
        campDoc({ nextWageDebitAt: new Date(Date.now() - 5 * 86_400_000) }), FIGHTER);
    assert.equal(s.wages.nextDebitInDays, 0);
});

test("buildDashboardCampSummary: an unparseable debit date degrades to nulls", () => {
    const s = homeCampService.buildDashboardCampSummary(
        campDoc({ nextWageDebitAt: "not-a-date" }), FIGHTER);
    assert.equal(s.wages.nextDebitAt, null);
    assert.equal(s.wages.nextDebitInDays, null);
});

test("buildDashboardCampSummary: a closed market reports no reset date", () => {
    const s = homeCampService.buildDashboardCampSummary(campDoc({ tier: 1 }), FIGHTER);
    if (s.market.open === false) {
        assert.equal(s.market.resetsAt, null);
        assert.equal(s.market.resetsInDays, null);
    } else {
        assert.equal(typeof s.market.resetsAt, "string");
        assert.ok(s.market.resetsInDays >= 0 && s.market.resetsInDays <= 7);
    }
});

test("buildDashboardCampSummary: an open market reports an ISO reset within a week", () => {
    const s = homeCampService.buildDashboardCampSummary(campDoc({ tier: 4 }), FIGHTER);
    assert.equal(s.market.open, true);
    assert.equal(typeof s.market.resetsAt, "string");
    assert.ok(s.market.resetsInDays >= 0 && s.market.resetsInDays <= 7);
});

test("buildDashboardCampSummary: tier is FLOORED by promotion tier, not just the stored tier", () => {
    const stored = campDoc({ tier: 1 });
    const amateur = homeCampService.buildDashboardCampSummary(stored, { promotionTier: "Amateur" });
    const gcs = homeCampService.buildDashboardCampSummary(stored, { promotionTier: "GCS" });

    assert.ok(gcs.tier >= amateur.tier, "a GCS fighter is never floored below an amateur");
    assert.equal(typeof gcs.tierLabel, "string");
});

test("buildDashboardCampSummary: is PURE — it does not mutate the camp doc", () => {
    const camp = campDoc({ nextWageDebitAt: new Date() });
    const before = JSON.stringify(camp);
    homeCampService.buildDashboardCampSummary(camp, FIGHTER);
    assert.equal(JSON.stringify(camp), before);
});

test("buildDashboardCampSummary: survives a legacy doc with no condition/coaches/wage fields", () => {
    const s = homeCampService.buildDashboardCampSummary({ _id: "c", name: "", focusDomain: "BJJ" }, FIGHTER);
    assert.equal(s.campName, null);
    assert.equal(s.headCoach, null);
    assert.equal(s.wages.weeklyTotal, 0);
    assert.equal(s.wages.unpaidWeeks, 0);
    assert.equal(typeof s.conditionValue, "number");
    assert.equal(typeof s.conditionBand, "string");
});

// ── Whole-payload conformance ───────────────────────────────────────────────

test("buildDashboard: every new key is PRESENT even when every module degrades", async () => {
    // The frontend's documented empty states are heroBout:null, homeCamp:null,
    // offers.list:[] and pvp:null. If a key vanishes instead of going null, the client
    // cannot tell "degraded" from "not deployed yet".
    const Fighter = require("../../models/fighterModel");
    const ActivityLog = require("../../models/activityLogModel");
    const fighterService = require("../../services/fighterService");
    const fightService = require("../../services/fightService");
    const campService = require("../../services/campService");
    const sponsorshipService = require("../../services/sponsorshipService");
    const pvpSeasonService = require("../../services/pvpSeasonService");

    const fighter = {
        _id: "f1", firstName: "Rico", lastName: "Vasquez", nickname: null,
        weightClass: "Lightweight", promotionTier: "Amateur", overallRating: 20,
        record: { wins: 1, losses: 0, draws: 0 }, energy: { current: 50, max: 100 },
        health: 100, injuries: [], acceptedFightId: null, iron: 0, notoriety: { score: 0 },
    };

    const boom = () => { throw new Error("everything is down"); };

    await withStub(fighterService, "getFighterById", async () => fighter, async () => {
        await withStub(Fighter, "findById", boom, async () => {
            await withStub(ActivityLog, "find", boom, async () => {
                await withStub(fightService, "generateOffers", boom, async () => {
                    await withStub(campService, "getCampState", boom, async () => {
                        await withStub(sponsorshipService, "listActive", boom, async () => {
                            await withStub(pvpSeasonService, "getCurrentSeasonForFighter", boom, async () => {
                                await withStub(HomeCamp, "findOne", boom, async () => {
                                    const d = await dashboardService.buildDashboard("f1");

                                    assert.ok(Object.prototype.hasOwnProperty.call(d, "heroBout"));
                                    assert.ok(Object.prototype.hasOwnProperty.call(d, "homeCamp"));
                                    assert.equal(d.heroBout, null);
                                    assert.equal(d.homeCamp, null);
                                    assert.equal(d.pvp, null);
                                    assert.equal(d.camp, null);
                                    assert.equal(d.sponsorship, null);
                                    assert.deepEqual(d.offers, { count: 0, best: null, list: [] });
                                    assert.deepEqual(d.feed, []);

                                    // The synchronous spine still renders.
                                    assert.equal(d.identity.firstName, "Rico");
                                    assert.equal(d.vitals.energy.current, 50);
                                    assert.equal(typeof d.heroAction.key, "string");
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
