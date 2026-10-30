/**
 * QA: register and createGuest forward the SANITISED acquisition tag to
 * analyticsService.track as the event meta (and never fail signup on junk input).
 * No real DB/Redis: models, energyService, accountService and track are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const User = require("../../models/userModel");
const Fighter = require("../../models/fighterModel");
const energyService = require("../../services/energyService");
const accountService = require("../../services/accountService");
const fighterService = require("../../services/fighterService");
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
        createGuestAccount: accountService.createGuestAccount, track: analyticsService.track,
        createFighter: fighterService.createFighter,
    };
    const calls = { saved: [], track: [] };
    User.findOne = async () => null;
    User.create = async (doc) => ({ ...doc, _id: "u1", save: async () => {} });
    User.deleteOne = () => Promise.resolve({ deletedCount: 1 });
    Fighter.prototype.save = async function save() { calls.saved.push(this); return this; };
    Fighter.findById = () => {
        const doc = calls.saved[calls.saved.length - 1];
        const p = Promise.resolve(doc);
        p.populate = () => Promise.resolve(doc);
        return p;
    };
    energyService.getEnergy = async () => ({ current: 100, max: 100, lastSyncedAt: new Date() });
    accountService.sendVerifyEmail = async () => {};
    accountService.createGuestAccount = async () => ({
        user: { _id: "g1", role: "user" }, fighter: { _id: "f1" }, recoveryCode: "CODE-1234",
    });
    analyticsService.track = (...args) => { calls.track.push(args); };
    fighterService.createFighter = async () => ({ _id: "f1" });
    const origError = console.error;
    console.error = () => {};
    try { await body(calls); } finally {
        console.error = origError;
        User.findOne = real.findOne; User.create = real.create; User.deleteOne = real.deleteOne;
        Fighter.prototype.save = real.fighterSave; Fighter.findById = real.fighterFindById;
        energyService.getEnergy = real.getEnergy; accountService.sendVerifyEmail = real.sendVerifyEmail;
        accountService.createGuestAccount = real.createGuestAccount;
        analyticsService.track = real.track;
        fighterService.createFighter = real.createFighter;
    }
}

const CASES = [
    ["valid src+campaign", { src: "Reddit", campaign: "Launch" }, { src: "reddit", campaign: "launch" }],
    ["valid src only", { src: "ig-bio" }, { src: "ig-bio" }],
    ["absent", undefined, {}],
    ["null", null, {}],
    ["array", [{ src: "reddit" }], {}],
    ["string", "reddit", {}],
    ["injection", { src: { $gt: "" }, campaign: "<script>" }, {}],
    ["bad campaign only", { src: "reddit", campaign: "<b>" }, { src: "reddit" }],
];

for (const [label, acquisition, expected] of CASES) {
    test(`register forwards meta (${label})`, async () => {
        const res = mockRes();
        await withStubs(async (calls) => {
            const body = { email: "ok@test.com", password: "secret123", fighter: { ...FIGHTER } };
            if (acquisition !== undefined) body.acquisition = acquisition;
            await authController.register({ body }, res);
            assert.equal(res.statusCode, 201, JSON.stringify(res.body));
            const t = calls.track.find((a) => a[1] === "signup");
            assert.ok(t, "signup tracked");
            assert.deepEqual(t[2], expected);
            assert.equal(String(t[0]), "u1");
        });
    });

    test(`createGuest forwards meta (${label})`, async () => {
        const res = mockRes();
        await withStubs(async (calls) => {
            const body = { fighter: { ...FIGHTER } };
            if (acquisition !== undefined) body.acquisition = acquisition;
            await authController.createGuest({ body }, res);
            assert.equal(res.statusCode, 201, JSON.stringify(res.body));
            const t = calls.track.find((a) => a[1] === "guest_signup");
            assert.ok(t, "guest_signup tracked");
            assert.deepEqual(t[2], expected);
            assert.equal(String(t[0]), "g1");
        });
    });
}

test("failed validation tracks nothing (no acquisition event for a rejected signup)", async () => {
    const res = mockRes();
    await withStubs(async (calls) => {
        await authController.createGuest({ body: { fighter: { firstName: "x" }, acquisition: { src: "reddit" } } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(calls.track.length, 0);
    });
});
