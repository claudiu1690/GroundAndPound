/**
 * An invalid nickname at /auth/register, /auth/guest and POST /fighters is a 400 with the
 * nickname rule's message (never a 500) and leaves nothing behind: no Fighter is saved and
 * the User created for register/guest is deleted again. No DB: User and Fighter model
 * methods are stubbed and every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const User = require("../../models/userModel");
const Fighter = require("../../models/fighterModel");
const authController = require("../../controllers/authController");
const fighterController = require("../../controllers/fighterController");

const BAD = "Big  Bad";
const BAD_MESSAGE = "Nickname can't contain double spaces.";
const FIGHTER = { firstName: "Test", lastName: "Fighter", weightClass: "Lightweight", style: "Boxer" };

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

/** Stub the model surface the three paths touch; returns counters. */
async function withModels(body) {
    const real = {
        findOne: User.findOne,
        create: User.create,
        deleteOne: User.deleteOne,
        fighterSave: Fighter.prototype.save,
    };
    const calls = { userCreated: [], userDeleted: [], fighterSaved: 0, userSaved: 0 };
    User.findOne = async () => null;
    User.create = async (doc) => {
        const user = { ...doc, _id: `u${calls.userCreated.length + 1}`, save: async () => { calls.userSaved += 1; } };
        calls.userCreated.push(user);
        return user;
    };
    User.deleteOne = (filter) => {
        calls.userDeleted.push(filter);
        return Promise.resolve({ deletedCount: 1 });
    };
    Fighter.prototype.save = async () => { calls.fighterSaved += 1; };
    const origError = console.error;
    console.error = () => {};
    try {
        await body();
    } finally {
        console.error = origError;
        User.findOne = real.findOne;
        User.create = real.create;
        User.deleteOne = real.deleteOne;
        Fighter.prototype.save = real.fighterSave;
    }
    return calls;
}

test("register: invalid nickname is 400 with the message and nothing persists", async () => {
    const res = mockRes();
    const calls = await withModels(() => authController.register({
        body: { email: "nick@test.com", password: "secret123", fighter: { ...FIGHTER, nickname: BAD } },
    }, res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: BAD_MESSAGE });
    assert.equal(calls.fighterSaved, 0);
    assert.equal(calls.userSaved, 0);
    assert.equal(calls.userCreated.length, calls.userDeleted.length, "every created User is deleted");
    for (const u of calls.userCreated) {
        assert.ok(calls.userDeleted.some((f) => f && f._id === u._id));
    }
});

test("register: a profane first name is also a 400 now, not a 500", async () => {
    const res = mockRes();
    const calls = await withModels(() => authController.register({
        body: { email: "nick@test.com", password: "secret123", fighter: { ...FIGHTER, firstName: "Shit" } },
    }, res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "First name contains language that isn't allowed. Please choose another." });
    assert.equal(calls.fighterSaved, 0);
    assert.equal(calls.userCreated.length, calls.userDeleted.length);
});

test("guest: invalid nickname is 400 with the message and nothing persists", async () => {
    const res = mockRes();
    const calls = await withModels(() => authController.createGuest({
        body: { fighter: { ...FIGHTER, nickname: "x" } },
    }, res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Nickname must be 2 to 20 characters." });
    assert.equal(calls.fighterSaved, 0);
    assert.equal(calls.userSaved, 0);
    assert.equal(calls.userCreated.length, calls.userDeleted.length, "every created User is deleted");
    for (const u of calls.userCreated) {
        assert.ok(calls.userDeleted.some((f) => f && f._id === u._id));
    }
});

test("guest: non-string nickname is 400 'Nickname must be text.'", async () => {
    const res = mockRes();
    const calls = await withModels(() => authController.createGuest({
        body: { fighter: { ...FIGHTER, nickname: { $ne: null } } },
    }, res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Nickname must be text." });
    assert.equal(calls.fighterSaved, 0);
});

test("POST /fighters: invalid nickname is 400 with the message and nothing persists", async () => {
    const res = mockRes();
    const calls = await withModels(() => fighterController.create({ body: { ...FIGHTER, nickname: "José" } }, res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Nickname can only use letters, numbers, spaces, hyphens and apostrophes." });
    assert.equal(calls.fighterSaved, 0);
    assert.equal(calls.userCreated.length, 0);
});
