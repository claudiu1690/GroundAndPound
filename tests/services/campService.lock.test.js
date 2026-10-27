/**
 * services/campService.js: camp writes are refused once the fight is "resolving" or
 * "completed" (assertCampWritable), before any mutation or energy refund.
 *
 * No DB: FightCamp.findOne, Fight.findById, energyService and specialMovesService are
 * stubbed. Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fight = require("../../models/fightModel");
const FightCamp = require("../../models/fightCampModel");
const energyService = require("../../services/energyService");
const specialMovesService = require("../../services/specialMovesService");
const campService = require("../../services/campService");
const { CAMP_SESSIONS } = require("../../consts/campConfig");

const LOCK = "Fight is resolving or already resolved";
const FIGHT_ID = "64b7f0c2a1b2c3d4e5f60718";

function fakeCamp(over = {}) {
    const camp = {
        fightId: FIGHT_ID,
        fighterId: "f1",
        maxSlots: 4,
        sessions: [{ sessionType: Object.keys(CAMP_SESSIONS)[0], slotIndex: 0, energySpent: 2, matchStatus: "UNMATCHED", pointsEarned: 0, diminishingFactor: 1 }],
        isInjured: true,
        injuryType: null,
        injuryChoice: null,
        finalisedAt: null,
        perks: [],
        saves: 0,
        async save() { camp.saves += 1; return camp; },
        toObject() { return { fighterId: camp.fighterId, sessions: camp.sessions.map((s) => ({ ...s })) }; },
        ...over,
    };
    return camp;
}

/**
 * Install stubs for one scenario and run `body`. `fight` is what Fight.findById resolves
 * to (both the select().lean() and the populate() chains).
 */
async function scenario({ camp, fight }, body) {
    const calls = { findById: [], addEnergy: 0, deductEnergy: 0, snapshot: 0, fighterFind: 0 };
    const originals = {
        findOne: FightCamp.findOne,
        findById: Fight.findById,
        addEnergy: energyService.addEnergy,
        deductEnergy: energyService.deductEnergy,
        snapshot: specialMovesService.buildMoveBonusesSnapshot,
    };
    FightCamp.findOne = async () => camp;
    Fight.findById = (id) => {
        calls.findById.push(id);
        const chain = {
            select() { return chain; },
            populate() { return Promise.resolve(fight); },
            lean() { return Promise.resolve(fight); },
        };
        return chain;
    };
    energyService.addEnergy = async () => { calls.addEnergy += 1; };
    energyService.deductEnergy = async () => { calls.deductEnergy += 1; };
    specialMovesService.buildMoveBonusesSnapshot = async () => { calls.snapshot += 1; return []; };
    try {
        return await body(calls);
    } finally {
        FightCamp.findOne = originals.findOne;
        Fight.findById = originals.findById;
        energyService.addEnergy = originals.addEnergy;
        energyService.deductEnergy = originals.deductEnergy;
        specialMovesService.buildMoveBonusesSnapshot = originals.snapshot;
    }
}

test("assertCampWritable: status table", () => {
    assert.throws(() => campService.assertCampWritable(null), { message: "Fight not found" });
    assert.throws(() => campService.assertCampWritable(undefined), { message: "Fight not found" });
    assert.doesNotThrow(() => campService.assertCampWritable({ status: "accepted" }));
    assert.throws(() => campService.assertCampWritable({ status: "resolving" }), { message: LOCK });
    assert.throws(() => campService.assertCampWritable({ status: "completed" }), { message: LOCK });
    assert.throws(() => campService.assertCampWritable({ status: "offered" }), { message: "Fight not found or not accepted" });
    assert.throws(() => campService.assertCampWritable({ status: "cancelled" }), { message: "Fight not found or not accepted" });
    assert.throws(() => campService.assertCampWritable({}), { message: "Fight not found or not accepted" });
});

for (const status of ["resolving", "completed"]) {
    test(`finaliseCamp on a ${status} fight is refused before any write or snapshot`, async () => {
        for (const skip of [true, false]) {
            const camp = fakeCamp({ isInjured: false });
            // eslint-disable-next-line no-await-in-loop
            await scenario({ camp, fight: { _id: FIGHT_ID, status } }, async (calls) => {
                await assert.rejects(campService.finaliseCamp(FIGHT_ID, "f1", skip), { message: LOCK });
                assert.equal(camp.saves, 0);
                assert.equal(calls.snapshot, 0);
                assert.equal(camp.finalisedAt, null);
                assert.equal(camp.wasSkipped, undefined);
            });
        }
    });

    test(`removeSession on a ${status} fight is refused with no refund and no save`, async () => {
        const camp = fakeCamp({ isInjured: false });
        await scenario({ camp, fight: { _id: FIGHT_ID, status } }, async (calls) => {
            await assert.rejects(campService.removeSession(FIGHT_ID, "f1", 0), { message: LOCK });
            assert.equal(camp.saves, 0);
            assert.equal(calls.addEnergy, 0);
            assert.equal(camp.sessions.length, 1);
        });
    });

    test(`resolveInjury on a ${status} fight is refused with no save`, async () => {
        const camp = fakeCamp({ isInjured: true, injuryType: "ANY" });
        await scenario({ camp, fight: { _id: FIGHT_ID, status } }, async (calls) => {
            await assert.rejects(campService.resolveInjury(FIGHT_ID, "f1", "STOP"), { message: LOCK });
            assert.equal(camp.saves, 0);
            assert.equal(calls.snapshot, 0);
            assert.equal(camp.injuryChoice, null);
        });
    });

    test(`selectBuff on a ${status} fight is refused with no save`, async () => {
        const camp = fakeCamp();
        await scenario({ camp, fight: { _id: FIGHT_ID, status } }, async () => {
            await assert.rejects(campService.selectBuff(FIGHT_ID, "f1", null), { message: LOCK });
            assert.equal(camp.saves, 0);
        });
    });

    test(`addCampSession on a ${status} fight is refused with no energy spent`, async () => {
        const camp = fakeCamp({ isInjured: false, sessions: [] });
        await scenario({ camp, fight: { _id: FIGHT_ID, status, opponentId: { style: "Boxing" } } }, async (calls) => {
            await assert.rejects(campService.addCampSession(FIGHT_ID, "f1", Object.keys(CAMP_SESSIONS)[0]), { message: LOCK });
            assert.equal(camp.saves, 0);
            assert.equal(calls.deductEnergy, 0);
        });
    });
}

test("ownership is checked before the fight lock: another fighter's camp is Forbidden with no fight read", async () => {
    const camp = fakeCamp({ fighterId: "someone-else", isInjured: false });
    await scenario({ camp, fight: { _id: FIGHT_ID, status: "accepted" } }, async (calls) => {
        await assert.rejects(campService.removeSession(FIGHT_ID, "f1", 0), { message: "Forbidden" });
        await assert.rejects(campService.finaliseCamp(FIGHT_ID, "f1", true), { message: "Forbidden" });
        assert.equal(calls.findById.length, 0);
        assert.equal(calls.addEnergy, 0);
        assert.equal(camp.saves, 0);
    });
});

test("a missing fight is \"Fight not found\" on the write paths", async () => {
    const camp = fakeCamp({ isInjured: false });
    await scenario({ camp, fight: null }, async (calls) => {
        await assert.rejects(campService.removeSession(FIGHT_ID, "f1", 0), { message: "Fight not found" });
        await assert.rejects(campService.selectBuff(FIGHT_ID, "f1", null), { message: "Fight not found" });
        assert.equal(calls.addEnergy, 0);
        assert.equal(camp.saves, 0);
    });
});

test("an accepted fight still lets removeSession refund and save", async () => {
    const camp = fakeCamp({ isInjured: false });
    await scenario({ camp, fight: { _id: FIGHT_ID, status: "accepted" } }, async (calls) => {
        const result = await campService.removeSession(FIGHT_ID, "f1", 0);
        assert.equal(calls.addEnergy, 1);
        assert.equal(camp.saves, 1);
        assert.equal(result.slotsUsed, 0);
        assert.deepEqual(calls.findById, [FIGHT_ID]);
    });
});

test("removeSession rejects a non-integer slotIndex instead of coercing it to 0", async () => {
    for (const slotIndex of ["0", { $gt: -1 }, [0], 0.5, null, Number.NaN]) {
        const camp = fakeCamp({ isInjured: false });
        // eslint-disable-next-line no-await-in-loop
        await scenario({ camp, fight: { _id: FIGHT_ID, status: "accepted" } }, async (calls) => {
            await assert.rejects(campService.removeSession(FIGHT_ID, "f1", slotIndex), { message: "Invalid slot index" });
            assert.equal(calls.addEnergy, 0);
            assert.equal(camp.saves, 0);
            assert.equal(camp.sessions.length, 1);
        });
    }
});

test("prototype keys are not valid session types or supplements", async () => {
    for (const key of ["constructor", "__proto__", "toString"]) {
        const camp = fakeCamp({ isInjured: false, sessions: [] });
        // eslint-disable-next-line no-await-in-loop
        await scenario({ camp, fight: { _id: FIGHT_ID, status: "accepted", opponentId: { style: "Boxing" } } }, async (calls) => {
            await assert.rejects(campService.addCampSession(FIGHT_ID, "f1", key), /^Error: Invalid session type/);
            assert.equal(calls.deductEnergy, 0);
            await assert.rejects(campService.selectBuff(FIGHT_ID, "f1", key), { message: "Unknown supplement" });
            assert.equal(camp.saves, 0);
        });
    }
});
