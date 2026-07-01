// QA unit tests for createBugReport -- no live DB (require.cache injection)
// Run: node tests/services/bugReport.qa.test.js
"use strict";
const { test } = require("node:test");
const assert  = require("node:assert/strict");
const path    = require("node:path");
const ROOT       = path.resolve(__dirname, "../../");
const SVC_PATH   = path.resolve(ROOT, "services/bugReportService.js");
const MODEL_PATH = path.resolve(ROOT, "models/bugReportModel.js");
const EMAIL_PATH = path.resolve(ROOT, "lib/email.js");

function loadService(opts) {
    opts = opts || {};
    var saveErr  = opts.saveErr  || null;
    var emailErr = opts.emailErr || null;
    delete require.cache[SVC_PATH];
    var _lastDoc = null;
    function MockBugReport(data) {
        Object.assign(this, data);
        this._id = { toString: function() { return "5f43a1b2c3d4e5f6a7b8c9d0"; } };
        this.createdAt = new Date("2026-07-01T12:00:00.000Z");
        _lastDoc = this;
    }
    MockBugReport.prototype.save = async function() { if (saveErr) throw saveErr; };
    require.cache[MODEL_PATH] = { id: MODEL_PATH, filename: MODEL_PATH, loaded: true, exports: MockBugReport };
    var _emailCalled = false;
    require.cache[EMAIL_PATH] = {
        id: EMAIL_PATH, filename: EMAIL_PATH, loaded: true,
        exports: {
            sendEmail: async function() { _emailCalled = true; if (emailErr) throw emailErr; return { id: "mock" }; },
            bugReportNotificationTemplate: function(d) { return { subject: "[Bug] " + d.category, html: "" }; },
        },
    };
    var svc = require(SVC_PATH);
    return { createBugReport: svc.createBugReport, lastDoc: function() { return _lastDoc; }, emailCalled: function() { return _emailCalled; } };
}

var ANON_OK = { category: "gameplay", description: "Game crashes after clicking fight button.", email: "tester@example.com", pageUrl: "https://app.io/fight", userAgent: "Mozilla", identity: null };
var AUTH_OK = { category: "ui_display", description: "Scoreboard does not update after fight.", email: "ignored@attacker.com", pageUrl: null, userAgent: null, identity: { accountId: "acc1", fighterId: "fid1", email: "real@user.com" } };

test("rejects missing category - bad_category", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {category: undefined})); }, function(err) { assert.equal(err.code, "bad_category"); assert.equal(err.statusCode, 400); return true; });
});
test("rejects unknown category string - bad_category", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {category: "hacked"})); }, function(err) { assert.equal(err.code, "bad_category"); return true; });
});
test("accepts all four valid categories", async function() {
    var cats = ["gameplay", "ui_display", "account_payments", "other"];
    for (var i = 0; i < cats.length; i++) {
        var x2 = loadService();
        var res = await x2.createBugReport(Object.assign({}, ANON_OK, {category: cats[i]}));
        assert.ok(res.reportId, "cat: " + cats[i]);
    }
});
test("rejects non-string description - bad_description", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {description: 12345})); }, function(err) { assert.equal(err.code, "bad_description"); return true; });
});
test("rejects null description - bad_description", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {description: null})); }, function(err) { assert.equal(err.code, "bad_description"); return true; });
});
test("rejects description under 10 chars - bad_description", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {description: "short"})); }, function(err) { assert.equal(err.code, "bad_description"); return true; });
});
test("rejects whitespace-padded short description - bad_description", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {description: "   short   "})); }, function(err) { assert.equal(err.code, "bad_description"); return true; });
});
test("rejects description over 2000 chars - bad_description", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {description: new Array(2002).join("x")})); }, function(err) { assert.equal(err.code, "bad_description"); return true; });
});
test("accepts description of exactly 10 chars", async function() {
    var x = loadService();
    var res = await x.createBugReport(Object.assign({}, ANON_OK, {description: new Array(11).join("a")}));
    assert.ok(res.reportId);
});
test("accepts description of exactly 2000 chars", async function() {
    var x = loadService();
    var res = await x.createBugReport(Object.assign({}, ANON_OK, {description: new Array(2001).join("x")}));
    assert.ok(res.reportId);
});
test("anonymous: missing email - bad_email", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {email: undefined})); }, function(err) { assert.equal(err.code, "bad_email"); assert.equal(err.statusCode, 400); return true; });
});
test("anonymous: non-string email value - bad_email", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {email: 42})); }, function(err) { assert.equal(err.code, "bad_email"); return true; });
});
test("anonymous: invalid email format - bad_email", async function() {
    var x = loadService();
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {email: "not-an-email"})); }, function(err) { assert.equal(err.code, "bad_email"); return true; });
});
test("anonymous: email over 254 chars - bad_email", async function() {
    var x = loadService();
    var longEmail = new Array(252).join("a") + "@b.c";
    await assert.rejects(function() { return x.createBugReport(Object.assign({}, ANON_OK, {email: longEmail})); }, function(err) { assert.equal(err.code, "bad_email"); return true; });
});
test("logged-in: body email ignored; reporterEmail from identity", async function() {
    var x = loadService();
    await x.createBugReport(AUTH_OK);
    assert.equal(x.lastDoc().reporterEmail, "real@user.com");
    assert.notEqual(x.lastDoc().reporterEmail, "ignored@attacker.com");
});
test("logged-in: no email in body still succeeds", async function() {
    var x = loadService();
    var res = await x.createBugReport(Object.assign({}, AUTH_OK, {email: undefined}));
    assert.ok(res.reportId);
});
test("logged-in: fighterId and accountId stored from identity", async function() {
    var x = loadService();
    await x.createBugReport(AUTH_OK);
    assert.equal(x.lastDoc().fighterId, "fid1");
    assert.equal(x.lastDoc().accountId, "acc1");
});
test("email failure does not fail the request - reportId returned", async function() {
    var x = loadService({emailErr: new Error("Resend 503")});
    var res = await x.createBugReport(ANON_OK);
    assert.ok(res.reportId, "reportId must survive email throw");
    assert.equal(x.emailCalled(), true, "email was attempted");
});
test("save failure propagates and email is not called", async function() {
    var x = loadService({saveErr: new Error("Mongo down")});
    await assert.rejects(function() { return x.createBugReport(ANON_OK); });
    assert.equal(x.emailCalled(), false, "email must not fire if save threw");
});
test("pageUrl over 500 chars truncated to 500", async function() {
    var x = loadService();
    var longUrl = "https://example.com/" + new Array(491).join("a");
    await x.createBugReport(Object.assign({}, ANON_OK, {pageUrl: longUrl}));
    assert.equal(x.lastDoc().pageUrl.length, 500);
});
test("null pageUrl stored as null", async function() {
    var x = loadService();
    await x.createBugReport(Object.assign({}, ANON_OK, {pageUrl: null}));
    assert.equal(x.lastDoc().pageUrl, null);
});
test("undefined userAgent stored as null", async function() {
    var x = loadService();
    await x.createBugReport(Object.assign({}, ANON_OK, {userAgent: undefined}));
    assert.equal(x.lastDoc().userAgent, null);
});
test("success returns reportId as a string", async function() {
    var x = loadService();
    var res = await x.createBugReport(ANON_OK);
    assert.equal(typeof res.reportId, "string");
    assert.ok(res.reportId.length > 0);
});
