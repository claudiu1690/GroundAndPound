/**
 * QA unit tests for the guest account lane in accountService.js.
 * No live DB -- models are mocked via require.cache injection (same pattern as
 * tests/services/bugReport.qa.test.js). Covers:
 *   - generateRecoveryCode format/normalization
 *   - claimAccount validation + email_taken (pre-check AND E11000 catch)
 *   - resumeByRecoveryCode (hit / miss / wrong isGuest / deleted)
 *   - runGuestPurgeSweep query boundaries + per-candidate isolation
 *
 * Run: node --test tests/services/guestAccount.qa.test.js
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../../");
const SVC_PATH = path.resolve(ROOT, "services/accountService.js");
const USER_MODEL_PATH = path.resolve(ROOT, "models/userModel.js");
const FIGHTER_MODEL_PATH = path.resolve(ROOT, "models/fighterModel.js");
const EMAIL_PATH = path.resolve(ROOT, "lib/email.js");

function sha256(s) {
    return crypto.createHash("sha256").update(s).digest("hex");
}

function makeUserModel(seedDocs, opts) {
    opts = opts || {};
    const docs = seedDocs.slice();
    let idCounter = 1000;

    function makeId() {
        idCounter += 1;
        const hex = idCounter.toString(16).padStart(24, "0");
        return { toString: () => hex, equals: (o) => String(o) === hex };
    }

    function Doc(data) {
        Object.assign(this, data);
        if (!this._id) this._id = makeId();
    }
    Doc.prototype.save = async function () {
        if (opts.saveErrorOnce && !this.__savedOnceFlag) {
            this.__savedOnceFlag = true;
            const err = new Error("E11000 duplicate key error");
            err.code = 11000;
            throw err;
        }
        const idx = docs.findIndex((d) => d._id.toString() === this._id.toString());
        const plain = Object.assign({}, this);
        delete plain.__savedOnceFlag;
        if (idx >= 0) docs[idx] = plain;
        else docs.push(plain);
        return this;
    };

    function toDocInstance(plain) {
        if (!plain) return null;
        const inst = new Doc(plain);
        return inst;
    }

    function matches(doc, filter) {
        return Object.keys(filter).every((key) => {
            const want = filter[key];
            const got = doc[key];
            if (want && typeof want === "object" && "$ne" in want) {
                return String(got) !== String(want.$ne);
            }
            if (want && typeof want === "object" && "$lte" in want) {
                const gotTime = got ? new Date(got).getTime() : 0;
                return gotTime <= new Date(want.$lte).getTime();
            }
            if (want === null) return got === null || got === undefined;
            return String(got) === String(want);
        });
    }

    // NOTE: findById/findOne must NOT be `async` -- accountService chains
    // `.select(...).lean()` directly off the return value (Mongoose query
    // builder semantics). Marking these async would wrap the thenable in an
    // extra Promise, losing the chained methods before they can be called.
    const Model = {
        async create(data) {
            const doc = new Doc(data);
            docs.push(Object.assign({}, doc));
            return doc;
        },
        findById(id) {
            const plain = docs.find((d) => d._id.toString() === String(id));
            const inst = toDocInstance(plain);
            return withLean(inst);
        },
        findOne(filter) {
            const plain = docs.find((d) => matches(d, filter));
            const inst = toDocInstance(plain);
            return withLean(inst);
        },
        find(filter) {
            const results = docs.filter((d) => matches(d, filter)).map((d) => toDocInstance(d));
            return withSelectArray(results);
        },
        async deleteOne(filter) {
            const idx = docs.findIndex((d) => matches(d, filter));
            if (idx >= 0) docs.splice(idx, 1);
            return { deletedCount: idx >= 0 ? 1 : 0 };
        },
        __docs: docs,
    };

    function withLean(inst) {
        const wrapped = inst
            ? Object.assign(Object.create(Object.getPrototypeOf(inst)), inst)
            : null;
        const thenable = Promise.resolve(wrapped);
        thenable.select = () => thenable;
        thenable.lean = () => Promise.resolve(wrapped ? Object.assign({}, wrapped) : null);
        return thenable;
    }
    function withSelectArray(arr) {
        const thenable = Promise.resolve(arr);
        thenable.select = () => thenable;
        return thenable;
    }

    return Model;
}

function makeFighterModel(seedDocs) {
    const docs = seedDocs.slice();
    return {
        async deleteOne(filter) {
            const idx = docs.findIndex((d) => String(d._id) === String(filter._id));
            if (idx >= 0) docs.splice(idx, 1);
            return { deletedCount: idx >= 0 ? 1 : 0 };
        },
        __docs: docs,
    };
}

function loadService(config) {
    config = config || {};
    const userDocs = config.userDocs || [];
    const fighterDocs = config.fighterDocs || [];
    const saveErrorOnce = config.saveErrorOnce;

    delete require.cache[SVC_PATH];
    delete require.cache[USER_MODEL_PATH];
    delete require.cache[FIGHTER_MODEL_PATH];

    const UserModel = makeUserModel(userDocs, { saveErrorOnce: saveErrorOnce });
    const FighterModel = makeFighterModel(fighterDocs);

    require.cache[USER_MODEL_PATH] = { id: USER_MODEL_PATH, filename: USER_MODEL_PATH, loaded: true, exports: UserModel };
    require.cache[FIGHTER_MODEL_PATH] = { id: FIGHTER_MODEL_PATH, filename: FIGHTER_MODEL_PATH, loaded: true, exports: FighterModel };
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

    const svc = require(SVC_PATH);
    return { svc: svc, UserModel: UserModel, FighterModel: FighterModel };
}
test("generateRecoveryCode: format XXXX-XXXX-XXXX-XXXX, Crockford base32 only", () => {
    const s = loadService();
    for (let i = 0; i < 200; i++) {
        const code = s.svc.generateRecoveryCode();
        assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/, code);
        assert.doesNotMatch(code, /[ILOU]/);
    }
});

test("generateRecoveryCode: statistically unique across many calls", () => {
    const s = loadService();
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(s.svc.generateRecoveryCode());
    assert.equal(seen.size, 500);
});

test("normalizeRecoveryCode: uppercases and strips dashes and whitespace", () => {
    const s = loadService();
    assert.equal(s.svc.normalizeRecoveryCode("abcd-1234-efgh-5678"), "ABCD1234EFGH5678");
    assert.equal(s.svc.normalizeRecoveryCode("  abcd 1234 efgh 5678  "), "ABCD1234EFGH5678");
    assert.equal(s.svc.normalizeRecoveryCode(""), "");
    assert.equal(s.svc.normalizeRecoveryCode(null), "");
    assert.equal(s.svc.normalizeRecoveryCode(undefined), "");
});

test("normalizeRecoveryCode: strips punctuation and symbols too, not just dashes", () => {
    const s = loadService();
    assert.equal(s.svc.normalizeRecoveryCode("ab!@#cd"), "ABCD");
});
test("claimAccount: not_guest when isGuest is false", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: false, email: "already@x.com", deleted: false }],
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "new@x.com", "password1"); },
        function (err) { assert.equal(err.code, "not_guest"); return true; }
    );
});

test("claimAccount: invalid_email on malformed email", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false }],
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "not-an-email", "password1"); },
        function (err) { assert.equal(err.code, "invalid_email"); return true; }
    );
});

test("claimAccount: weak_password when under 8 chars", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false }],
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "new@x.com", "abc123"); },
        function (err) { assert.equal(err.code, "weak_password"); return true; }
    );
});

test("claimAccount: weak_password when no digit present", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false }],
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "new@x.com", "passwordnodigits"); },
        function (err) { assert.equal(err.code, "weak_password"); return true; }
    );
});

test("claimAccount: email_taken via pre-check (existing non-deleted account)", async () => {
    const s = loadService({
        userDocs: [
            { _id: "acc1", isGuest: true, email: null, deleted: false },
            { _id: "acc2", isGuest: false, email: "taken@x.com", deleted: false },
        ],
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "taken@x.com", "password1"); },
        function (err) { assert.equal(err.code, "email_taken"); return true; }
    );
});

test("claimAccount: email_taken via duplicate-key race (save throws E11000)", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false }],
        saveErrorOnce: true,
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "race@x.com", "password1"); },
        function (err) { assert.equal(err.code, "email_taken"); return true; }
    );
});

test("claimAccount: success clears recovery fields, bumps sessionEpoch, sets emailConfirmed false", async () => {
    const s = loadService({
        userDocs: [{
            _id: "acc1", isGuest: true, email: null, deleted: false,
            recoveryCodeHash: "deadbeef", recoveryCodeCreatedAt: new Date(),
            sessionEpoch: 1,
        }],
    });
    const result = await s.svc.claimAccount("acc1", "New@X.com", "password1");
    const user = result.user;
    assert.equal(user.email, "new@x.com");
    assert.equal(user.isGuest, false);
    assert.equal(user.recoveryCodeHash, null);
    assert.equal(user.recoveryCodeCreatedAt, null);
    assert.equal(user.emailConfirmed, false);
    assert.equal(user.sessionEpoch, 2);
    assert.ok(user.passwordHash && user.passwordHash !== "password1", "password must be hashed, not stored plaintext");
});

test("claimAccount: Account not found for missing id", async () => {
    const s = loadService({ userDocs: [] });
    await assert.rejects(
        function () { return s.svc.claimAccount("missing", "a@x.com", "password1"); },
        /Account not found/
    );
});

test("claimAccount: Account not found for soft-deleted account", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: true }],
    });
    await assert.rejects(
        function () { return s.svc.claimAccount("acc1", "a@x.com", "password1"); },
        /Account not found/
    );
});
test("resumeByRecoveryCode: returns user on exact hash match and stamps lastActiveAt", async () => {
    const raw = "ABCD-1234-EFGH-5678";
    const hash = sha256("ABCD1234EFGH5678");
    const oldStamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [{
            _id: "acc1", isGuest: true, deleted: false,
            recoveryCodeHash: hash, lastActiveAt: oldStamp,
        }],
    });
    const user = await s.svc.resumeByRecoveryCode(raw);
    assert.ok(user, "should resolve a user");
    assert.equal(String(user._id), "acc1");
    assert.ok(new Date(user.lastActiveAt).getTime() > oldStamp.getTime(), "lastActiveAt must be refreshed");
});

test("resumeByRecoveryCode: normalizes input before hashing (case and dashes ignored)", async () => {
    const hash = sha256("ABCD1234EFGH5678");
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, deleted: false, recoveryCodeHash: hash, lastActiveAt: new Date() }],
    });
    const user = await s.svc.resumeByRecoveryCode("abcd 1234 efgh 5678");
    assert.ok(user);
});

test("resumeByRecoveryCode: returns null on hash miss", async () => {
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, deleted: false, recoveryCodeHash: sha256("SOMEOTHERCODE") }],
    });
    const user = await s.svc.resumeByRecoveryCode("WRONG-CODE-1234-5678");
    assert.equal(user, null);
});

test("resumeByRecoveryCode: returns null for empty or missing code", async () => {
    const s = loadService({ userDocs: [] });
    assert.equal(await s.svc.resumeByRecoveryCode(""), null);
    assert.equal(await s.svc.resumeByRecoveryCode(null), null);
    assert.equal(await s.svc.resumeByRecoveryCode(undefined), null);
});

test("resumeByRecoveryCode: does not match a claimed isGuest false account with a stale hash", async () => {
    const hash = sha256("ABCD1234EFGH5678");
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: false, deleted: false, recoveryCodeHash: hash }],
    });
    const user = await s.svc.resumeByRecoveryCode("ABCD-1234-EFGH-5678");
    assert.equal(user, null, "claimed accounts must never be resumable via recovery code");
});

test("resumeByRecoveryCode: does not match a deleted guest account", async () => {
    const hash = sha256("ABCD1234EFGH5678");
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, deleted: true, recoveryCodeHash: hash }],
    });
    const user = await s.svc.resumeByRecoveryCode("ABCD-1234-EFGH-5678");
    assert.equal(user, null, "deleted accounts must never be resumable");
});
test("runGuestPurgeSweep: purges a guest inactive for 31 days (past cutoff)", async () => {
    const oldStamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false, lastActiveAt: oldStamp, fighterId: "fig1" }],
        fighterDocs: [{ _id: "fig1" }],
    });
    const result = await s.svc.runGuestPurgeSweep();
    assert.equal(result.purged, 1);
    assert.equal(s.UserModel.__docs.length, 0, "purged user must be removed");
});

test("runGuestPurgeSweep: does not purge a guest inactive for only 29 days", async () => {
    const recentStamp = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false, lastActiveAt: recentStamp }],
    });
    const result = await s.svc.runGuestPurgeSweep();
    assert.equal(result.purged, 0);
    assert.equal(s.UserModel.__docs.length, 1, "active-enough guest must survive");
});

test("runGuestPurgeSweep: does not purge a claimed account even with stale lastActiveAt", async () => {
    const oldStamp = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: false, email: "real@x.com", deleted: false, lastActiveAt: oldStamp }],
    });
    const result = await s.svc.runGuestPurgeSweep();
    assert.equal(result.purged, 0);
    assert.equal(s.UserModel.__docs.length, 1);
});

test("runGuestPurgeSweep: does not purge an already soft-deleted guest", async () => {
    const oldStamp = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: true, lastActiveAt: oldStamp }],
    });
    const result = await s.svc.runGuestPurgeSweep();
    assert.equal(result.purged, 0);
    assert.equal(s.UserModel.__docs.length, 1);
});

test("runGuestPurgeSweep: also deletes the linked Fighter document", async () => {
    const oldStamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [{ _id: "acc1", isGuest: true, email: null, deleted: false, lastActiveAt: oldStamp, fighterId: "fig1" }],
        fighterDocs: [{ _id: "fig1" }],
    });
    await s.svc.runGuestPurgeSweep();
    assert.equal(s.FighterModel.__docs.length, 0, "linked fighter must be purged alongside the user");
});

test("runGuestPurgeSweep: one bad candidate does not abort the whole batch", async () => {
    const oldStamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const s = loadService({
        userDocs: [
            { _id: "acc1", isGuest: true, email: null, deleted: false, lastActiveAt: oldStamp, fighterId: "fig1" },
            { _id: "acc2", isGuest: true, email: null, deleted: false, lastActiveAt: oldStamp, fighterId: "fig2" },
        ],
        fighterDocs: [{ _id: "fig1" }, { _id: "fig2" }],
    });
    s.UserModel.deleteOne = async function (filter) {
        if (String(filter._id) === "acc2") throw new Error("simulated Mongo error for acc2");
        const idx = s.UserModel.__docs.findIndex(function (d) { return String(d._id) === String(filter._id); });
        if (idx >= 0) s.UserModel.__docs.splice(idx, 1);
        return { deletedCount: 1 };
    };
    const result = await s.svc.runGuestPurgeSweep();
    assert.equal(result.purged, 1, "only the non-throwing candidate should count as purged");
    assert.equal(s.UserModel.__docs.length, 1, "acc2 the failing one must remain, not silently dropped");
    assert.equal(String(s.UserModel.__docs[0]._id), "acc2");
});

test("runGuestPurgeSweep: returns purged 0 when there are no candidates", async () => {
    const s = loadService({ userDocs: [] });
    const result = await s.svc.runGuestPurgeSweep();
    assert.equal(result.purged, 0);
});
