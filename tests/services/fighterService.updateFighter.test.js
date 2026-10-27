/**
 * fighterService.updateFighter writes ONLY { $set: { nickname } }, whatever else the caller
 * passes, and throws "Fighter not found" on a missing doc.
 *
 * No DB: Fighter.findByIdAndUpdate and energyService.getEnergy are stubbed as own properties
 * and restored in finally.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const energyService = require("../../services/energyService");
const fighterService = require("../../services/fighterService");

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

function fakeDoc(fields) {
    const doc = { _id: "f1", injuries: [], gymPerks: [], ...fields };
    doc.toObject = () => {
        const { toObject, ...rest } = doc;
        return JSON.parse(JSON.stringify(rest));
    };
    return doc;
}

/** Stub findByIdAndUpdate to record its args and resolve `doc` through .populate(). */
function recordingUpdate(calls, doc) {
    return (...args) => {
        calls.push(args);
        return {
            populate: async (path) => {
                calls.push(["populate", path]);
                return doc;
            },
        };
    };
}

test("updateFighter writes exactly { $set: { nickname } } and ignores every other input key", async () => {
    const calls = [];
    const doc = fakeDoc({ nickname: "X" });
    const out = await withStub(Fighter, "findByIdAndUpdate", recordingUpdate(calls, doc), () =>
        withStub(energyService, "getEnergy", async () => ({ current: 50, max: 100 }), () =>
            fighterService.updateFighter("f1", { nickname: "X", iron: 999, promotionTier: "GCS" })));

    const [id, update, opts] = calls[0];
    assert.equal(id, "f1");
    assert.deepEqual(update, { $set: { nickname: "X" } });
    assert.deepEqual(opts, { new: true, runValidators: true });
    assert.deepEqual(calls[1], ["populate", "gymId"]);

    // Public shape tail still runs: energy reconciled from Redis.
    assert.equal(out.nickname, "X");
    assert.equal(out.energy.current, 50);
    assert.equal(out.energy.max, 100);
});

test("updateFighter passes a null nickname through as a clear", async () => {
    const calls = [];
    await withStub(Fighter, "findByIdAndUpdate", recordingUpdate(calls, fakeDoc({ nickname: null })), () =>
        withStub(energyService, "getEnergy", async () => ({ current: 1, max: 100 }), () =>
            fighterService.updateFighter("f1", { nickname: null })));
    assert.deepEqual(calls[0][1], { $set: { nickname: null } });
});

test("updateFighter throws Fighter not found on a null doc", async () => {
    const calls = [];
    let energyRead = false;
    await withStub(Fighter, "findByIdAndUpdate", recordingUpdate(calls, null), () =>
        withStub(energyService, "getEnergy", async () => { energyRead = true; return { current: 1, max: 1 }; }, () =>
            assert.rejects(() => fighterService.updateFighter("nope", { nickname: "X" }), { message: "Fighter not found" })));
    assert.equal(energyRead, false);
});
