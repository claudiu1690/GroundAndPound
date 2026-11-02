/**
 * My Camp drill batch: the out-of-energy offer only fires when ZERO sessions were funded.
 *  - funded 0 -> rejects not_enough_energy 400 with need (one session's cost after the trait)
 *    and have (the live value deductBatchEnergy saw), and writes nothing.
 *  - funded 1 (a partial batch) -> resolves as a 200 with stopReason "out_of_energy".
 *
 * No DB, no Redis: Fighter, the camp, energyService and the side services are stubbed and
 * every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const fighterService = require("../../services/fighterService");
const energyService = require("../../services/energyService");
const homeCampService = require("../../services/homeCampService");
const specialMovesService = require("../../services/specialMovesService");
const trainingService = require("../../services/homeCampTrainingService");
const { fallbackDrill } = require("../../consts/homeCampConfig");

async function withStubs(stubs, body) {
    const saved = stubs.map(([obj, key]) => [obj, key, Object.prototype.hasOwnProperty.call(obj, key), obj[key]]);
    for (const [obj, key, impl] of stubs) obj[key] = impl;
    try {
        return await body();
    } finally {
        for (const [obj, key, had, orig] of saved) {
            if (had) obj[key] = orig;
            else delete obj[key];
        }
    }
}

const FID = "507f1f77bcf86cd799439011";

function setup({ funded, current }) {
    const writes = { fighter: 0, camp: 0, refund: 0 };
    const fighter = {
        _id: FID,
        promotionTier: "Amateur",
        fiq: 10,
        injuries: [],
        energy: { current, max: 100 },
        activeBooster: null,
        trainingSessionsToday: 0,
        careerTrainingSessions: 0,
        save: async () => { writes.fighter += 1; },
        markModified: () => {},
    };
    const coaches = [];
    coaches.id = () => null;
    const camp = {
        tier: 1,
        coaches,
        condition: { value: 80, lastSessionDayKey: null },
        save: async () => { writes.camp += 1; },
    };
    const stubs = [
        [Fighter, "findById", async () => fighter],
        [fighterService, "reconcileEnergy", async () => {}],
        [fighterService, "getInjuryLockedStats", () => []],
        [fighterService, "toPublicFighter", (f) => ({ _id: f._id })],
        [homeCampService, "ensureCamp", async () => camp],
        [energyService, "deductBatchEnergy", async () => ({ funded, current, max: 100 })],
        [energyService, "getEnergy", async () => ({ current, max: 100 })],
        [energyService, "addEnergy", async () => { writes.refund += 1; return { current, max: 100 }; }],
        [specialMovesService, "rollCampMoveDrop", () => null],
        // No injury roll can fire (deterministic): every Math.random draw is the top of the range.
        [Math, "random", () => 0.999999],
    ];
    return { stubs, writes };
}

test("zero funded: not_enough_energy with need = drill cost and have = live energy; nothing written", async () => {
    const { stubs, writes } = setup({ funded: 0, current: 2 });
    let err = null;
    await withStubs(stubs, async () => {
        try {
            await trainingService.runDrill(FID, { coachId: null, drillKey: "open_mat", quantity: 3 });
        } catch (e) { err = e; }
    });
    assert.ok(err, "must reject");
    assert.equal(err.code, "not_enough_energy");
    assert.equal(err.status, 400);
    assert.equal(err.message, "Not enough energy");
    assert.equal(err.need, fallbackDrill().energy);
    assert.equal(err.have, 2);
    assert.deepEqual(writes, { fighter: 0, camp: 0, refund: 0 });
});

test("zero funded at 0 energy still reports have: 0", async () => {
    const { stubs } = setup({ funded: 0, current: 0 });
    await withStubs(stubs, () => assert.rejects(
        () => trainingService.runDrill(FID, { coachId: null, drillKey: "open_mat", quantity: 1 }),
        (e) => e.code === "not_enough_energy" && e.need === 6 && e.have === 0
    ));
});

test("one funded of three: a partial batch resolves (no offer)", async () => {
    const { stubs, writes } = setup({ funded: 1, current: 5 });
    const res = await withStubs(stubs, () =>
        trainingService.runDrill(FID, { coachId: null, drillKey: "open_mat", quantity: 3 }));
    assert.equal(res.completed, 1);
    assert.equal(res.requested, 3);
    assert.equal(res.stopReason, "out_of_energy");
    assert.match(res.message, /Stopped early \(out of energy\)\./);
    assert.equal(writes.fighter >= 1, true);
    assert.equal(res.need, undefined);
    assert.equal(res.have, undefined);
});
