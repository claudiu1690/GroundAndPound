/**
 * PATCH /fighters/:id/settings (first-session contract B.2): fighterController.patchSettings,
 * fighterService.validateSettingsPatch / updateSettings. Hostile bodies are 400 "Invalid
 * settings" and never reach Mongo; the write is one atomic $set on settings.* paths.
 * No DB: Fighter.updateOne / findById are stubbed.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const fighterService = require("../../services/fighterService");
const fighterController = require("../../controllers/fighterController");

let stored;
let updates;
const originals = { updateOne: Fighter.updateOne, findById: Fighter.findById };

beforeEach(() => {
    stored = { _id: "f1", settings: { playFightsOut: true, sectionTips: true } };
    updates = [];
    Fighter.updateOne = async (filter, update) => {
        updates.push([filter, update]);
        if (!stored) return { matchedCount: 0, modifiedCount: 0 };
        for (const [k, v] of Object.entries(update.$set)) stored.settings[k.split(".")[1]] = v;
        return { matchedCount: 1, modifiedCount: 1 };
    };
    Fighter.findById = () => ({ select: () => ({ lean: async () => (stored ? JSON.parse(JSON.stringify(stored)) : null) }) });
});
afterEach(() => {
    Fighter.updateOne = originals.updateOne;
    Fighter.findById = originals.findById;
});

function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

test("validateSettingsPatch: booleans for known keys only, at least one key", () => {
    const v = fighterService.validateSettingsPatch;
    assert.deepEqual(v({ playFightsOut: false }), { playFightsOut: false });
    assert.deepEqual(v({ sectionTips: true, playFightsOut: true }), { sectionTips: true, playFightsOut: true });
    const bad = [
        undefined, null, [], "x", 1, {},
        { playFightsOut: "false" }, { playFightsOut: 0 }, { sectionTips: null },
        { playFightsOut: true, admin: true }, { "settings.playFightsOut": true },
        { $set: { iron: 1 } }, { playFightsOut: { $ne: null } },
    ];
    for (const body of bad) assert.equal(v(body), null, JSON.stringify(body));
});

test("patchSettings: 200 { settings } after one atomic $set on settings.* paths", async () => {
    const res = mockRes();
    await fighterController.patchSettings({ params: { id: "f1" }, body: { playFightsOut: false } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { settings: { playFightsOut: false, sectionTips: true } });
    assert.deepEqual(updates, [[{ _id: "f1" }, { $set: { "settings.playFightsOut": false } }]]);
});

test("patchSettings: hostile bodies are 400 'Invalid settings' and never write", async () => {
    for (const body of [{}, { sectionTips: "yes" }, { sectionTips: true, iron: 99999 }, [], null]) {
        const res = mockRes();
        await fighterController.patchSettings({ params: { id: "f1" }, body }, res);
        assert.equal(res.statusCode, 400, JSON.stringify(body));
        assert.deepEqual(res.body, { message: "Invalid settings" });
    }
    assert.equal(updates.length, 0);
});

test("patchSettings: unknown fighter 404", async () => {
    stored = null;
    const res = mockRes();
    await fighterController.patchSettings({ params: { id: "f1" }, body: { sectionTips: false } }, res);
    assert.equal(res.statusCode, 404);
});

test("a legacy doc without settings reads back the defaults (true / true) for unset keys", async () => {
    stored = { _id: "f1", settings: {} };
    const out = await fighterService.updateSettings("f1", { sectionTips: false });
    assert.deepEqual(out, { settings: { playFightsOut: true, sectionTips: false } });
});

test("settings stay out of the public projection", () => {
    assert.equal(fighterService.PUBLIC_FIGHTER_KEYS.includes("settings"), false);
    assert.equal(fighterService.PUBLIC_FIGHTER_KEYS.includes("tutorial"), false);
});
