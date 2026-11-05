/**
 * services/tutorialService + controllers/tutorialController (first-session contract B.1):
 *   - every write is an atomic Fighter.updateOne on tutorial.* paths (never save())
 *   - advance validates the debut sequence, normalises legacy steps, rejects "complete"
 *   - complete credits nothing (ironRewarded 0) and is idempotent
 *   - tips/seen only accepts TIP_KEYS ($addToSet), hostile keys are a 400 INVALID_TIP_KEY
 * No DB: Fighter.findById / updateOne are stubbed against an in-memory doc.
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const tutorialService = require("../../services/tutorialService");
const tutorialController = require("../../controllers/tutorialController");

let doc;      // the "persisted" fighter (lean shape) or null
let updates;  // [filter, update]
const originals = { findById: Fighter.findById, updateOne: Fighter.updateOne };

function get(obj, dotted) {
    return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function set(obj, dotted, value) {
    const keys = dotted.split(".");
    let o = obj;
    for (const k of keys.slice(0, -1)) { o[k] = o[k] || {}; o = o[k]; }
    o[keys[keys.length - 1]] = value;
}
function matches(filter) {
    if (!doc) return false;
    for (const [k, cond] of Object.entries(filter)) {
        if (k === "_id") continue;
        const v = get(doc, k);
        if (cond && typeof cond === "object" && "$ne" in cond) { if (v === cond.$ne) return false; }
        else if (v !== cond) return false;
    }
    return true;
}

beforeEach(() => {
    doc = { _id: "f1", iron: 250, tutorial: { completed: false, current_step: "debut_home", tipsSeen: [] } };
    updates = [];
    Fighter.findById = () => ({
        select() { return { lean: async () => (doc ? JSON.parse(JSON.stringify(doc)) : null) }; },
        then() { throw new Error("tutorialService must not hydrate a full doc for save()"); },
    });
    Fighter.updateOne = async (filter, update) => {
        updates.push([filter, update]);
        if (!matches(filter)) return { matchedCount: 0, modifiedCount: 0 };
        for (const [k, v] of Object.entries(update.$set || {})) set(doc, k, v);
        for (const [k, v] of Object.entries(update.$addToSet || {})) {
            const arr = get(doc, k) || [];
            if (!arr.includes(v)) arr.push(v);
            set(doc, k, arr);
        }
        return { matchedCount: 1, modifiedCount: 1 };
    };
});
afterEach(() => {
    Fighter.findById = originals.findById;
    Fighter.updateOne = originals.updateOne;
});

function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

test("getState: TutorialState shape; legacy step ids read as debut_home", async () => {
    doc.tutorial.current_step = "hospital_intro";
    assert.deepEqual(await tutorialService.getState("f1"),
        { completed: false, current_step: "debut_home", version: 2, tipsSeen: [] });
    doc.tutorial = { completed: true, current_step: "rankings_intro", tipsSeen: ["camp"] };
    assert.deepEqual(await tutorialService.getState("f1"),
        { completed: true, current_step: "complete", version: 2, tipsSeen: ["camp"] });
});

test("advance: next step only, written with one atomic updateOne on tutorial.* paths", async () => {
    const state = await tutorialService.advance("f1", "debut_offer");
    assert.equal(state.current_step, "debut_offer");
    assert.equal(updates.length, 1);
    const [filter, update] = updates[0];
    assert.deepEqual(filter, { _id: "f1", "tutorial.completed": { $ne: true } });
    assert.deepEqual(Object.keys(update.$set).sort(), ["tutorial.current_step", "tutorial.started_at"]);
    assert.equal(doc.iron, 250, "iron untouched");
});

test("advance: legacy current step advances to debut_offer", async () => {
    doc.tutorial.current_step = "training_session";
    assert.equal((await tutorialService.advance("f1", "debut_offer")).current_step, "debut_offer");
});

test("advance: skipping, going back and 'complete' are TUTORIAL_INVALID_STEP 400", async () => {
    doc.tutorial.current_step = "debut_camp";
    for (const step of ["complete", "debut_home", "debut_offer", "gym_intro", 42, { $ne: null }]) {
        const res = mockRes();
        await tutorialController.advanceTutorial({ params: { fighterId: "f1" }, body: { step } }, res);
        assert.equal(res.statusCode, 400, JSON.stringify(step));
        assert.equal(res.body.code, "TUTORIAL_INVALID_STEP");
    }
    assert.equal(updates.length, 0);
});

test("advance: missing step 400, completed tutorial 400, unknown fighter 404", async () => {
    let res = mockRes();
    await tutorialController.advanceTutorial({ params: { fighterId: "f1" }, body: {} }, res);
    assert.deepEqual([res.statusCode, res.body], [400, { message: "Missing step" }]);

    doc.tutorial.completed = true;
    res = mockRes();
    await tutorialController.advanceTutorial({ params: { fighterId: "f1" }, body: { step: "debut_offer" } }, res);
    assert.deepEqual([res.statusCode, res.body], [400, { message: "Tutorial already completed" }]);

    doc = null;
    res = mockRes();
    await tutorialController.advanceTutorial({ params: { fighterId: "f1" }, body: { step: "debut_offer" } }, res);
    assert.equal(res.statusCode, 404);
});

test("advance: a resolve that completed the tutorial mid-request wins (no write lands)", async () => {
    const realUpdate = Fighter.updateOne;
    Fighter.updateOne = async (filter, update) => {
        doc.tutorial.completed = true; // the debut resolve committed first
        return realUpdate(filter, update);
    };
    await assert.rejects(tutorialService.advance("f1", "debut_offer"), /Tutorial already completed/);
    assert.equal(doc.tutorial.current_step, "debut_home");
});

test("complete: marks done, credits NOTHING, idempotent", async () => {
    const first = await tutorialService.complete("f1");
    assert.deepEqual(first, { completed: true, current_step: "complete", ironRewarded: 0, iron: 250 });
    assert.equal(doc.tutorial.completed, true);
    assert.ok(doc.tutorial.completed_at instanceof Date);
    assert.equal(doc.iron, 250);
    const stamp = doc.tutorial.completed_at;
    const second = await tutorialService.complete("f1");
    assert.deepEqual(second, first);
    assert.equal(doc.tutorial.completed_at, stamp, "completed_at not restamped");
    for (const [, u] of updates) assert.equal(u.$inc, undefined, "never an iron write");
});

test("complete: unknown fighter is 404 through the controller", async () => {
    doc = null;
    const res = mockRes();
    await tutorialController.completeTutorial({ params: { fighterId: "f1" } }, res);
    assert.equal(res.statusCode, 404);
});

test("tips/seen: $addToSet a valid key, returns tipsSeen; duplicates collapse", async () => {
    let res = mockRes();
    await tutorialController.markTipSeen({ params: { fighterId: "f1" }, body: { key: "hospital" } }, res);
    assert.deepEqual([res.statusCode, res.body], [200, { tipsSeen: ["hospital"] }]);
    res = mockRes();
    await tutorialController.markTipSeen({ params: { fighterId: "f1" }, body: { key: "hospital" } }, res);
    assert.deepEqual(res.body, { tipsSeen: ["hospital"] });
    res = mockRes();
    await tutorialController.markTipSeen({ params: { fighterId: "f1" }, body: { key: "moment_first_loss" } }, res);
    assert.deepEqual(res.body, { tipsSeen: ["hospital", "moment_first_loss"] });
    assert.deepEqual(updates[0][1], { $addToSet: { "tutorial.tipsSeen": "hospital" } });
});

test("tips/seen: hostile keys are 400 INVALID_TIP_KEY and never reach Mongo", async () => {
    for (const key of [undefined, null, "", "shop", "HOSPITAL", "__proto__", 7, ["camp"], { $each: ["camp"] }]) {
        const res = mockRes();
        await tutorialController.markTipSeen({ params: { fighterId: "f1" }, body: { key } }, res);
        assert.equal(res.statusCode, 400, JSON.stringify(key));
        assert.deepEqual(res.body, { message: "Invalid tip key", code: "INVALID_TIP_KEY" });
    }
    const res = mockRes();
    await tutorialController.markTipSeen({ params: { fighterId: "f1" } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(updates.length, 0);
});

test("tips/seen: unknown fighter 404", async () => {
    doc = null;
    const res = mockRes();
    await tutorialController.markTipSeen({ params: { fighterId: "f1" }, body: { key: "camp" } }, res);
    assert.equal(res.statusCode, 404);
});
