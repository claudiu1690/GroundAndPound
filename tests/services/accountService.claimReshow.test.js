/**
 * Shop redesign: claimAccount owes the guest one more full premium panel.
 *
 * The fighter flag (premiumPanelReshowPending) is ONE atomic updateOne, issued only AFTER the
 * user save committed. An email_taken race (E11000) never sets it, and a failing flag write
 * never fails the claim. No DB, no email: model statics are stubbed, lib/email is replaced in
 * the require cache before accountService loads (it destructures its imports).
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const EMAIL_PATH = path.resolve(ROOT, "lib/email.js");
require.cache[EMAIL_PATH] = {
    id: EMAIL_PATH, filename: EMAIL_PATH, loaded: true,
    exports: {
        sendEmail: async () => ({ id: "mock" }),
        sendAccountEmail: async () => ({ id: "mock" }),
        passwordResetTemplate: () => ({ subject: "x", html: "" }),
        verifyEmailTemplate: () => ({ subject: "x", html: "" }),
        emailChangeTemplate: () => ({ subject: "x", html: "" }),
        accountDeletedTemplate: () => ({ subject: "x", html: "" }),
        APP_URL: "http://localhost:5173",
        BACKEND_URL: "http://localhost:4001",
    },
};

const User = require("../../models/userModel");
const Fighter = require("../../models/fighterModel");
const accountService = require("../../services/accountService");

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

function chain(value) {
    const p = Promise.resolve(value);
    p.select = () => p;
    p.lean = () => Promise.resolve(value);
    return p;
}

const FIGHTER_ID = "507f1f77bcf86cd799439011";

function harness({ saveError = null, updateError = null, fighterId = FIGHTER_ID } = {}) {
    const log = [];
    const updates = [];
    const user = {
        _id: "acc1",
        isGuest: true,
        deleted: false,
        email: null,
        fighterId,
        sessionEpoch: 1,
        emailConfirmed: false,
        save: async () => {
            log.push("user.save");
            if (saveError && log.filter((l) => l === "user.save").length === 1) throw saveError;
        },
    };
    const stubs = [
        [User, "findById", () => chain(user)],
        [User, "findOne", () => chain(null)],
        [Fighter, "findById", () => chain({ firstName: "Test" })],
        [Fighter, "updateOne", async (...a) => {
            log.push("fighter.updateOne");
            updates.push(a);
            if (updateError) throw updateError;
            return { acknowledged: true, modifiedCount: 1 };
        }],
        [Fighter, "findOneAndUpdate", async () => { throw new Error("only updateOne is expected"); }],
    ];
    return { user, log, updates, stubs };
}

/** Let the fire-and-forget verify email settle before stubs are restored. */
const settle = () => new Promise((r) => setImmediate(r));

test("success: the reshow flag is set by one atomic updateOne AFTER the user save", async () => {
    const h = harness();
    await withStubs(h.stubs, async () => {
        const { user } = await accountService.claimAccount("acc1", "new@x.com", "password1");
        assert.equal(user.isGuest, false);
        await settle();
    });
    assert.deepEqual(h.updates, [[{ _id: FIGHTER_ID }, { $set: { premiumPanelReshowPending: true } }]]);
    assert.equal(h.log[0], "user.save");
    assert.equal(h.log[1], "fighter.updateOne", "flag write comes right after the committed claim");
});

test("E11000 race: email_taken and NO flag write", async () => {
    const dup = Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
    const h = harness({ saveError: dup });
    await withStubs(h.stubs, () => assert.rejects(
        () => accountService.claimAccount("acc1", "race@x.com", "password1"),
        (e) => e.code === "email_taken"
    ));
    assert.deepEqual(h.updates, []);
});

test("validation failures never touch the fighter", async () => {
    const h = harness();
    await withStubs(h.stubs, async () => {
        await assert.rejects(() => accountService.claimAccount("acc1", "bad-email", "password1"), (e) => e.code === "invalid_email");
        await assert.rejects(() => accountService.claimAccount("acc1", "a@x.com", "short"), (e) => e.code === "weak_password");
    });
    assert.deepEqual(h.updates, []);
    assert.deepEqual(h.log, []);
});

test("a failing flag write is logged and the claim still succeeds", async () => {
    const h = harness({ updateError: new Error("mongo down") });
    const logged = [];
    const orig = console.error;
    console.error = (...a) => { logged.push(a.join(" ")); };
    try {
        await withStubs(h.stubs, async () => {
            const { user } = await accountService.claimAccount("acc1", "new@x.com", "password1");
            assert.equal(user.isGuest, false);
            assert.equal(user.email, "new@x.com");
            await settle();
        });
    } finally {
        console.error = orig;
    }
    assert.equal(h.updates.length, 1);
    assert.ok(logged.some((l) => l.includes("[claimAccount] reshow flag failed")), "the failure is logged server-side");
});

test("a guest with no fighter yet: no flag write, claim succeeds", async () => {
    const h = harness({ fighterId: null });
    await withStubs(h.stubs, async () => {
        await accountService.claimAccount("acc1", "new@x.com", "password1");
        await settle();
    });
    assert.deepEqual(h.updates, []);
});
