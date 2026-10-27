/**
 * An unexpected failure in /auth/register or /auth/guest is a 500 with the generic
 * body only: no Mongo text, host, path or stack reaches the client (CLAUDE.md: never
 * expose internal error details). The error is still logged server-side. No DB: User
 * statics are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const User = require("../../models/userModel");
const authController = require("../../controllers/authController");

const INTERNAL = "E11000 duplicate key error collection: mmaGame.users index: email_1 at C:/srv/app/x.js";
const FIGHTER = { firstName: "Test", lastName: "Fighter", weightClass: "Lightweight", style: "Boxer" };

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

async function withFailingUser(body) {
    const real = { findOne: User.findOne, create: User.create };
    const logged = [];
    User.findOne = async () => null;
    User.create = async () => { throw new Error(INTERNAL); };
    const origError = console.error;
    console.error = (...args) => { logged.push(args); };
    try {
        await body();
    } finally {
        console.error = origError;
        User.findOne = real.findOne;
        User.create = real.create;
    }
    return logged;
}

test("register: an internal failure is 500 { message: 'Internal server error' } and is logged", async () => {
    const res = mockRes();
    const logged = await withFailingUser(() => authController.register({
        body: { email: "boom@test.com", password: "secret123", fighter: FIGHTER },
    }, res));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
    assert.ok(logged.some((args) => args.some((a) => a instanceof Error && a.message === INTERNAL)), "logged server-side");
});

test("guest: an internal failure is 500 { message: 'Internal server error' } and is logged", async () => {
    const res = mockRes();
    const logged = await withFailingUser(() => authController.createGuest({ body: { fighter: FIGHTER } }, res));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
    assert.ok(logged.some((args) => args.some((a) => a instanceof Error && a.message === INTERNAL)), "logged server-side");
});
