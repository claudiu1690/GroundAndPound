/**
 * fighterService.toPublicProjection: the non-owner fighter view served by
 * GET /fighters/:id/profile. It is a whitelist, so the output key set must equal
 * PUBLIC_FIGHTER_KEYS exactly and no private field may leak. Pure: no DB, no Redis,
 * never saves (Fighter.findById, energyService.getEnergy and save() all throw here).
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Fighter = require("../../models/fighterModel");
const energyService = require("../../services/energyService");
const rankingService = require("../../services/rankingService");
const fighterService = require("../../services/fighterService");

const { PUBLIC_FIGHTER_KEYS, toPublicProjection } = fighterService;

const PRIVATE_KEYS = [
    "iron", "energy", "inventory", "activeBooster", "acceptedFightId", "activeCallout", "offerBoard",
    "gazette", "nemesis", "beefFlags", "respectFlags", "tutorial", "pvpOnboarding", "pvpDefense",
    "pvpDefenseGameplan", "specialMovesOwned", "specialMovesEquipped", "persona", "personaEffects",
    "perksOwned", "gymRanks", "gymPerks", "injuries", "userId", "email", "isPvpBot",
    "strXp", "spdXp", "chnXp", "fiqXp", "statProgress", "__v",
];

let realFindById;
let realGetEnergy;

before(() => {
    realFindById = Fighter.findById;
    realGetEnergy = energyService.getEnergy;
    Fighter.findById = () => { throw new Error("toPublicProjection must not hit the DB"); };
    energyService.getEnergy = async () => { throw new Error("toPublicProjection must not touch Redis"); };
});

after(() => {
    Fighter.findById = realFindById;
    energyService.getEnergy = realGetEnergy;
});

function loadedFighter(overrides = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        firstName: "Ana",
        lastName: "Silva",
        nickname: "The Hammer",
        weightClass: "Lightweight",
        style: "Boxer",
        promotionTier: "Regional Pro",
        overallRating: 47,
        str: 50, spd: 44, leg: 30, wre: 25, gnd: 20, sub: 15, chn: 60, fiq: 40,
        winStreak: 3,
        consecutiveLosses: 0,
        record: { wins: 9, losses: 2, draws: 1, koWins: 5, subWins: 1, decisionWins: 3, extraSecret: 1 },
        ranking: { rank: 4, fightsInTier: 7, entryRecordAtFight3: "3-0" },
        gymId: { _id: new mongoose.Types.ObjectId(), name: "Iron Temple", tier: "T3", coachSecret: "x" },
        notoriety: {
            score: 120, peakTier: "LOCAL", isFrozen: false, lastEventAt: new Date(),
            documentaryUsed: false, milestones: { a: 1 }, firstFinishPromoTiers: [],
        },
        media: {
            podcastName: "Hammer Time", episodeCount: 4, documentaryStatus: "available",
            documentaryRecordedAt: null, lastRecordedDate: new Date(), interviewsDone: 7,
        },
        banner: { backgroundId: "BG_SLATE", frameId: "FRAME_NONE", accentColor: "ACC_RED", badgeSlots: ["b1"], hidden: 1 },
        pinnedBadges: ["champ_amateur"],
        // private
        iron: 99999,
        energy: { current: 80, max: 100, lastSyncedAt: new Date() },
        inventory: [{ itemId: "energy_drink", qty: 3 }],
        activeBooster: { key: "x" },
        acceptedFightId: new mongoose.Types.ObjectId(),
        activeCallout: { opponentId: "o1" },
        offerBoard: { slots: [1, 2, 3], fingerprint: "abc" },
        gazette: { issueNumber: 3 },
        nemesis: { opponentId: "o2" },
        beefFlags: ["o3"],
        respectFlags: ["o4"],
        tutorial: { step: 2 },
        pvpOnboarding: { done: true },
        pvpDefense: { unreadCount: 2 },
        pvpDefenseGameplan: { plan: "wrestle" },
        specialMovesOwned: ["m1"],
        specialMovesEquipped: ["m1"],
        persona: { x: 1, y: 2 },
        personaEffects: [{ key: "p" }],
        perksOwned: [{ key: "k" }],
        gymRanks: { g1: 3 },
        gymPerks: ["perk_a"],
        injuries: [{ type: "cut" }],
        userId: new mongoose.Types.ObjectId(),
        email: "secret@test.com",
        isPvpBot: true,
        strXp: 10, spdXp: 11, chnXp: 12, fiqXp: 13,
        statProgress: { str: {} },
        __v: 17,
        save: async () => { throw new Error("toPublicProjection must never save"); },
        ...overrides,
    };
}

function sortedKeys(o) {
    return Object.keys(o).sort();
}

test("PUBLIC_FIGHTER_KEYS is frozen and the output key set equals it exactly", () => {
    assert.ok(Object.isFrozen(PUBLIC_FIGHTER_KEYS));
    const out = toPublicProjection(loadedFighter());
    assert.deepEqual(sortedKeys(out), [...PUBLIC_FIGHTER_KEYS].sort());
});

test("no private key is present", () => {
    const out = toPublicProjection(loadedFighter());
    for (const key of PRIVATE_KEYS) {
        assert.equal(Object.prototype.hasOwnProperty.call(out, key), false, `${key} leaked`);
    }
    assert.ok(!JSON.stringify(out).includes("secret@test.com"));
});

test("nested objects are whitelisted too", () => {
    const out = toPublicProjection(loadedFighter());
    assert.deepEqual(sortedKeys(out.media), ["documentaryRecordedAt", "documentaryStatus", "episodeCount", "podcastName"]);
    assert.deepEqual(out.media, {
        podcastName: "Hammer Time", episodeCount: 4, documentaryStatus: "available", documentaryRecordedAt: null,
    });
    assert.deepEqual(sortedKeys(out.record), ["decisionWins", "draws", "koWins", "losses", "subWins", "wins"]);
    assert.deepEqual(sortedKeys(out.ranking), ["rank"]);
    assert.deepEqual(sortedKeys(out.banner), ["accentColor", "backgroundId", "badgeSlots", "frameId"]);
    assert.deepEqual(out.pinnedBadges, ["champ_amateur"]);
});

test("ranking.rank is the display-shifted rank", () => {
    const out = toPublicProjection(loadedFighter());
    assert.equal(out.ranking.rank, rankingService.toDisplayRank(4));
    assert.equal(out.ranking.rank, 3);
    assert.equal(toPublicProjection(loadedFighter({ ranking: { rank: null } })).ranking.rank, null);
    assert.equal(toPublicProjection(loadedFighter({ ranking: undefined })).ranking.rank, null);
});

test("gymId is { _id, name } when populated and null for a bare id", () => {
    const f = loadedFighter();
    const out = toPublicProjection(f);
    assert.deepEqual(out.gymId, { _id: f.gymId._id, name: "Iron Temple" });
    assert.equal(toPublicProjection(loadedFighter({ gymId: new mongoose.Types.ObjectId() })).gymId, null);
    assert.equal(toPublicProjection(loadedFighter({ gymId: null })).gymId, null);
});

test("notoriety is the public notoriety state, not the raw subdocument", () => {
    const out = toPublicProjection(loadedFighter());
    assert.equal(out.notoriety.score, 120);
    assert.equal(typeof out.notoriety.tierLabel, "string");
    assert.equal(Object.prototype.hasOwnProperty.call(out.notoriety, "milestones"), false);
});

test("a legacy doc without notoriety (or with a numeric one) does not throw", () => {
    const missing = loadedFighter();
    delete missing.notoriety;
    const a = toPublicProjection(missing);
    assert.equal(a.notoriety.score, 0);
    assert.deepEqual(sortedKeys(a), [...PUBLIC_FIGHTER_KEYS].sort());

    const numeric = toPublicProjection(loadedFighter({ notoriety: 55 }));
    assert.equal(numeric.notoriety.score, 55);
});

test("a sparse legacy doc still yields the full key set with safe defaults", () => {
    const out = toPublicProjection({ _id: "x", firstName: "A", lastName: "B" });
    assert.deepEqual(sortedKeys(out), [...PUBLIC_FIGHTER_KEYS].sort());
    assert.deepEqual(out.record, { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decisionWins: 0 });
    assert.equal(out.gymId, null);
    assert.deepEqual(out.pinnedBadges, []);
});

test("the toObject() path (Mongoose doc) gives the same key set and no private keys", () => {
    const doc = new Fighter({
        firstName: "Ana",
        lastName: "Silva",
        weightClass: "Lightweight",
        style: "Boxer",
        iron: 5000,
        isPvpBot: true,
        ranking: { rank: 3 },
    });
    let saves = 0;
    doc.save = async () => { saves += 1; throw new Error("must never save"); };
    const out = toPublicProjection(doc);
    assert.deepEqual(sortedKeys(out), [...PUBLIC_FIGHTER_KEYS].sort());
    for (const key of PRIVATE_KEYS) {
        assert.equal(Object.prototype.hasOwnProperty.call(out, key), false, `${key} leaked`);
    }
    assert.equal(out.ranking.rank, 2);
    assert.equal(saves, 0);
});

test("is synchronous (returns a plain object, not a promise)", () => {
    const out = toPublicProjection(loadedFighter());
    assert.equal(typeof out.then, "undefined");
});
