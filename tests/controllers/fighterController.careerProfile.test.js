/**
 * GET /fighters/:id/profile (fighterController.getCareerProfile) is a public read. The owner
 * gets the full fighter payload (toPublicFighter); every other player gets only the public
 * projection (toPublicProjection, keys === PUBLIC_FIGHTER_KEYS). belts / badges / pvp are the
 * same for both. No DB: Fighter.findById and the badge helpers are stubbed and restored.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Fighter = require("../../models/fighterModel");
const badgeService = require("../../services/badgeService");
const fighterService = require("../../services/fighterService");
const fighterController = require("../../controllers/fighterController");

const FIGHTER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_ID = new mongoose.Types.ObjectId().toString();

const PRIVATE_KEYS = [
    "iron", "inventory", "pvpDefense", "acceptedFightId", "activeCallout", "offerBoard",
    "energy", "pvpDefenseGameplan", "specialMovesEquipped", "userId",
];

let saves;
let findImpl;
let findCalls;
let real;

function makeDoc() {
    const doc = new Fighter({
        _id: FIGHTER_ID,
        userId: new mongoose.Types.ObjectId(),
        firstName: "Ana",
        lastName: "Silva",
        nickname: "The Hammer",
        weightClass: "Lightweight",
        style: "Boxer",
        promotionTier: "Regional Pro",
        iron: 4321,
        inventory: { energyDrinks: 2 },
        acceptedFightId: new mongoose.Types.ObjectId(),
        specialMovesEquipped: ["m1"],
        ranking: { rank: 5 },
        badgesEarned: [{ badgeId: "champ_amateur", earnedAt: new Date() }],
    });
    doc.save = async () => { saves += 1; return doc; };
    return doc;
}

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

beforeEach(() => {
    saves = 0;
    findCalls = [];
    findImpl = () => makeDoc();
    real = {
        findById: Fighter.findById,
        evaluateBadges: badgeService.evaluateBadges,
        buildBadgeProfile: badgeService.buildBadgeProfile,
        toPublicFighter: fighterService.toPublicFighter,
    };
    Fighter.findById = (id) => {
        findCalls.push(id);
        return {
            populate: async (path, select) => {
                findCalls.push([path, select]);
                return findImpl();
            },
        };
    };
    badgeService.evaluateBadges = () => ({ newlyEarned: [] });
    badgeService.buildBadgeProfile = () => ({ earned: [], stub: true });
});

afterEach(() => {
    Fighter.findById = real.findById;
    badgeService.evaluateBadges = real.evaluateBadges;
    badgeService.buildBadgeProfile = real.buildBadgeProfile;
    fighterService.toPublicFighter = real.toPublicFighter;
});

async function get(user) {
    const res = mockRes();
    await fighterController.getCareerProfile({ params: { id: FIGHTER_ID }, user }, res);
    return res;
}

test("owner gets the full fighter payload", async () => {
    const res = await get({ id: "u1", fighterId: FIGHTER_ID });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.fighter.iron, 4321);
    assert.ok(Object.prototype.hasOwnProperty.call(res.body.fighter, "inventory"));
    assert.deepEqual(findCalls, [FIGHTER_ID, ["gymId", "name"]]);
    assert.equal(saves, 0);
});

test("non-owner gets only the public projection and never the owner serializer", async () => {
    fighterService.toPublicFighter = () => { throw new Error("toPublicFighter must not run for a non-owner"); };
    const res = await get({ id: "u2", fighterId: OTHER_ID });
    assert.equal(res.statusCode, 200);
    const { fighter } = res.body;
    assert.deepEqual(Object.keys(fighter).sort(), [...fighterService.PUBLIC_FIGHTER_KEYS].sort());
    for (const key of PRIVATE_KEYS) {
        assert.equal(Object.prototype.hasOwnProperty.call(fighter, key), false, `${key} leaked`);
    }
    assert.equal(fighter.firstName, "Ana");
    assert.equal(fighter.ranking.rank, 4);
    // The rest of the response is unchanged for non-owners.
    assert.deepEqual(Object.keys(res.body).sort(), ["badges", "belts", "fighter", "pvp"]);
    assert.equal(res.body.belts.length, 5);
    assert.equal(res.body.belts.find((b) => b.tier === "Amateur").state, "won");
    assert.deepEqual(res.body.badges, { earned: [], stub: true });
    assert.equal(res.body.pvp, null);
    assert.equal(saves, 0);
});

test("a logged-out or fighterless request is treated as a non-owner", async () => {
    fighterService.toPublicFighter = () => { throw new Error("toPublicFighter must not run for a non-owner"); };
    for (const user of [undefined, null, {}, { id: "u3", fighterId: null }]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await get(user);
        assert.equal(res.statusCode, 200, JSON.stringify(user));
        assert.deepEqual(Object.keys(res.body.fighter).sort(), [...fighterService.PUBLIC_FIGHTER_KEYS].sort());
    }
});

test("an unknown fighter is 404", async () => {
    findImpl = () => null;
    const res = await get({ id: "u1", fighterId: FIGHTER_ID });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });
});

test("a thrown error is a generic 500", async () => {
    findImpl = () => { throw new Error("E11000 secret mongo detail"); };
    const orig = console.error;
    console.error = () => {};
    let res;
    try {
        res = await get({ id: "u1", fighterId: FIGHTER_ID });
    } finally {
        console.error = orig;
    }
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});
