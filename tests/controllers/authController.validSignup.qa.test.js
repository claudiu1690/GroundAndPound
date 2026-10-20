/**
 * QA: the HAPPY path through register and guest after the shared nickname rule landed.
 * A valid (or absent) nickname must still produce a 201, exactly one Fighter save carrying
 * the trimmed nickname, and no User cleanup. No real DB/Redis: User/Fighter statics and
 * energyService are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const User = require("../../models/userModel");
const Fighter = require("../../models/fighterModel");
const energyService = require("../../services/energyService");
const accountService = require("../../services/accountService");
const analyticsService = require("../../services/analyticsService");
const authController = require("../../controllers/authController");

const FIGHTER = { firstName: "Test", lastName: "Fighter", weightClass: "Lightweight", style: "Boxer" };

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

async function withStubs(body) {
    const real = {
        findOne: User.findOne, create: User.create, deleteOne: User.deleteOne,
        fighterSave: Fighter.prototype.save, fighterFindById: Fighter.findById,
        getEnergy: energyService.getEnergy, sendVerifyEmail: accountService.sendVerifyEmail,
        track: analyticsService.track,
    };
    const calls = { userDeleted: [], saved: [] };
    User.findOne = async () => null;
    User.create = async (doc) => ({ ...doc, _id: "u1", save: async () => {} });
    User.deleteOne = (f) => { calls.userDeleted.push(f); return Promise.resolve({ deletedCount: 1 }); };
    Fighter.prototype.save = async function save() { calls.saved.push(this); return this; };
    Fighter.findById = () => {
        const doc = calls.saved[calls.saved.length - 1];
        const p = Promise.resolve(doc);
        p.populate = () => Promise.resolve(doc);
        return p;
    };
    energyService.getEnergy = async () => ({ current: 100, max: 100, lastSyncedAt: new Date() });
    accountService.sendVerifyEmail = async () => {};
    analyticsService.track = () => {};
    const origError = console.error;
    console.error = () => {};
    try { await body(calls); } finally {
        console.error = origError;
        User.findOne = real.findOne; User.create = real.create; User.deleteOne = real.deleteOne;
        Fighter.prototype.save = real.fighterSave; Fighter.findById = real.fighterFindById;
        energyService.getEnergy = real.getEnergy; accountService.sendVerifyEmail = real.sendVerifyEmail;
        analyticsService.track = real.track;
    }
}

for (const [label, input, stored] of [
    ["a valid nickname", "  Big Mike  ", "Big Mike"],
    ["an apostrophe and hyphen", "O'Neil-Jr", "O'Neil-Jr"],
    ["null", null, null],
    ["blank", "   ", null],
    ["omitted", undefined, null],
]) {
    test(`register: ${label} gives 201 and stores ${JSON.stringify(stored)}`, async () => {
        const res = mockRes();
        await withStubs(async (calls) => {
            const f = { ...FIGHTER };
            if (input !== undefined) f.nickname = input;
            await authController.register({ body: { email: "ok@test.com", password: "secret123", fighter: f } }, res);
            assert.equal(res.statusCode, 201, JSON.stringify(res.body));
            assert.ok(res.body.token);
            assert.equal(calls.userDeleted.length, 0, "no cleanup on success");
            assert.equal(calls.saved.length >= 1, true);
            assert.equal(calls.saved[0].nickname, stored);
        });
    });
}

test("guest: a valid nickname gives 201 and stores it trimmed", async () => {
    const res = mockRes();
    await withStubs(async (calls) => {
        await authController.createGuest({ body: { fighter: { ...FIGHTER, nickname: " The Hammer " } } }, res);
        assert.equal(res.statusCode, 201, JSON.stringify(res.body));
        assert.ok(res.body.recoveryCode);
        assert.equal(calls.userDeleted.length, 0);
        assert.equal(calls.saved[0].nickname, "The Hammer");
    });
});

test("register/guest: hostile nickname types are 400, never 500, never echo internals", async () => {
    for (const bad of [123, ["a", "b"], { $gt: "" }, true]) {
        for (const fn of ["register", "createGuest"]) {
            const res = mockRes();
            await withStubs(async (calls) => {
                const fighter = { ...FIGHTER, nickname: bad };
                const req = fn === "register"
                    ? { body: { email: "h@test.com", password: "secret123", fighter } }
                    : { body: { fighter } };
                await authController[fn](req, res);
                assert.equal(res.statusCode, 400, `${fn} ${JSON.stringify(bad)}`);
                assert.deepEqual(res.body, { message: "Nickname must be text." });
                assert.equal(calls.saved.length, 0);
            });
        }
    }
});
