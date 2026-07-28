/**
 * Corner Confidence, end to end through createCamp — the assertion that actually proves the
 * perk pays out, because the slot count is written once at camp creation and never recomputed.
 *
 * LOCAL ONLY. Connects to a dedicated throwaway database on localhost and refuses to run
 * against anything remote. Never touches the app's configured connection.
 */
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const DB_URI = "mongodb://localhost:27017/gnp_test_cornerConfidence";
assert.ok(!DB_URI.includes("mongodb+srv"), "refusing to run against a remote cluster");

const campService = require("../../services/campService");
const Fighter = require("../../models/fighterModel");
const Fight = require("../../models/fightModel");
const FightCamp = require("../../models/fightCampModel");
const Opponent = require("../../models/opponentModel");
const { COACH_ARCHETYPES } = require("../../consts/homeCampConfig");
const { CAMP_SLOT_CONFIG } = require("../../consts/campConfig");

const CORNER_CONFIDENCE = COACH_ARCHETYPES.STRIKING.perkKey;
const TIER = "Regional Pro";
const BASE_SLOTS = CAMP_SLOT_CONFIG[TIER].normalSlots;

let connected = false;

async function connect() {
    if (connected) return true;
    try {
        await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 2500 });
        connected = true;
        return true;
    } catch (_) {
        return false;   // no local mongod — the suite skips rather than fails
    }
}

async function makeFighter(over = {}) {
    return Fighter.create({
        firstName: "Test", lastName: "Fighter", style: "Boxer",
        weightClass: "Middleweight",
        promotionTier: TIER, userId: new mongoose.Types.ObjectId(),
        ...over,
    });
}

/**
 * A fight the player has accepted against `opponentStyle`.
 * NOTE: `Fight.opponentId` refs the OPPONENT model, not Fighter — the perk reads the style
 * off that document, so the fixture has to build a real one.
 */
async function makeFight(fighter, opponentStyle) {
    const opponent = await Opponent.create({
        name: "Opp", weightClass: "Middleweight", style: opponentStyle,
        promotionTier: TIER, overallRating: 50,
    });
    const fight = await Fight.create({
        fighterId: fighter._id,
        opponentId: opponent._id,
        status: "accepted",
        promotionTier: TIER,
    });
    return fight;
}

async function slotsFor({ perks, opponentStyle }) {
    const fighter = await makeFighter({ gymPerks: perks });
    const fight = await makeFight(fighter, opponentStyle);
    await campService.createCamp(fight._id, fighter._id, TIER, false, null);
    const camp = await FightCamp.findOne({ fightId: fight._id }).lean();
    return camp;
}

test("Corner Confidence: +1 camp slot vs a striker, nothing vs a grappler", async (t) => {
    if (!await connect()) return t.skip("no local mongod on 27017");
    await Promise.all([Fighter.deleteMany({}), Fight.deleteMany({}), FightCamp.deleteMany({}), Opponent.deleteMany({})]);

    // 1. No perk, striker opponent → base slots. The control.
    const noPerk = await slotsFor({ perks: [], opponentStyle: "Boxer" });
    assert.equal(noPerk.maxSlots, BASE_SLOTS, "without the perk nothing changes");
    assert.deepEqual(noPerk.perks, [], "snapshot records an empty perk set");

    // 2. Perk + striker opponent → +1. THE fix.
    const perked = await slotsFor({ perks: [CORNER_CONFIDENCE], opponentStyle: "Boxer" });
    assert.equal(perked.maxSlots, BASE_SLOTS + 1, "the perk must grant a real extra slot");
    assert.deepEqual(perked.perks, [CORNER_CONFIDENCE], "the perk is frozen onto the camp");

    // 3. Perk + grappler opponent → no bonus. The condition has to mean something.
    const wrongMatchup = await slotsFor({ perks: [CORNER_CONFIDENCE], opponentStyle: "Wrestler" });
    assert.equal(wrongMatchup.maxSlots, BASE_SLOTS, "a Wrestler is not a striker — no extra slot");

    // 4. Every striker style qualifies, not just Boxer.
    for (const style of ["Kickboxer", "Muay Thai", "Capoeira"]) {
        const c = await slotsFor({ perks: [CORNER_CONFIDENCE], opponentStyle: style });
        assert.equal(c.maxSlots, BASE_SLOTS + 1, `${style} must count as a striker`);
    }

    // 5. An unrelated perk must not grant slots.
    const unrelated = await slotsFor({ perks: ["strength_reserve"], opponentStyle: "Boxer" });
    assert.equal(unrelated.maxSlots, BASE_SLOTS, "only Corner Confidence grants the slot");
});

test("the frozen snapshot is what later scoring reads, not the fighter's live perks", async (t) => {
    if (!await connect()) return t.skip("no local mongod on 27017");
    await Promise.all([Fighter.deleteMany({}), Fight.deleteMany({}), FightCamp.deleteMany({}), Opponent.deleteMany({})]);

    const fighter = await makeFighter({ gymPerks: [] });
    const fight = await makeFight(fighter, "Boxer");
    await campService.createCamp(fight._id, fighter._id, TIER, false, null);

    // The player claims the perk AFTER the camp already exists.
    await Fighter.updateOne({ _id: fighter._id }, { $set: { gymPerks: [CORNER_CONFIDENCE] } });

    const camp = await FightCamp.findOne({ fightId: fight._id }).lean();
    assert.equal(camp.maxSlots, BASE_SLOTS, "a mid-camp claim must not retroactively add a slot");
    assert.deepEqual(camp.perks, [], "the snapshot stays as it was at acceptance");
});

test.after(async () => {
    if (!connected) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});
