// QA regression test — GET /pvp/season/public error isolation.
//
// getPublicSeason() (controller) makes a SECOND call, pvpSeasonService.getNextSeason(),
// after the primary season lookup already succeeded, to build the `next` teaser field.
// That teaser is purely cosmetic, while the endpoint itself is public, unauthenticated
// and polled continuously by every landing-page visitor (useSeasonBand polls every
// 5-30s). It previously shared ONE try/catch with the primary lookup, so a transient
// Mongo hiccup on the optional `next` query 500'd the whole endpoint and threw away a
// perfectly good season fetch.
//
// FIXED: the teaser lookup now has its own try/catch (controllers/pvpController.js →
// resolveNextTease), logs server-side, and degrades to `next: null`. These tests lock
// that in — they are the exact inverse of the behaviour this file used to document.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const pvpController = require("../../controllers/pvpController");
const pvpSeasonService = require("../../services/pvpSeasonService");

function makeRes() {
  const r = { _status: 200, _headers: {}, _body: undefined };
  r.set = function (k, v) { r._headers[k] = v; return r; };
  r.status = function (c) { r._status = c; return r; };
  r.json = function (b) { r._body = b; return r; };
  return r;
}

const fakeActive = {
  _id: { toString: () => "id1" }, __v: 0,
  seasonNumber: 3, name: "Iron Circuit", twist: "iron_circuit",
  status: "active", weightClass: "Featherweight",
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-08-10T00:00:00.000Z"),
  config: { crossWeightClass: false },
  beltHolderId: { toString: () => "id99" },
  redistributedAt: null, createdAt: new Date(), updatedAt: new Date(),
};

// Silence the expected server-side error log so the test output stays readable, while
// still asserting that the failure IS logged (never silently swallowed).
function captureErrors(fn) {
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  return fn().then(
    (v) => { console.error = original; return { value: v, logged }; },
    (e) => { console.error = original; throw e; }
  );
}

test("getNextSeason() throwing no longer 500s — 200 with the primary season intact and next:null", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive; // primary lookup succeeds
  pvpSeasonService.getNextSeason = async () => { throw new Error("Mongo timeout on next-season lookup"); };

  const res = makeRes();
  const { logged } = await captureErrors(() => pvpController.getPublicSeason({}, res));

  assert.equal(res._status, 200, "a cosmetic teaser failure must not take down a public endpoint");
  assert.equal(res._body.status, "active", "primary season data survives");
  assert.equal(res._body.seasonNumber, 3);
  assert.equal(res._body.name, "Iron Circuit");
  assert.equal(res._body.startDate, "2026-06-01T00:00:00.000Z");
  assert.equal(res._body.next, null, "the teaser degrades to null, not undefined");
  assert.ok("next" in res._body, "`next` stays present in the contract shape");
  assert.equal(logged.length > 0, true, "the failure is logged server-side, never silent");
});

test("teaser failure leaks no internal error detail to the client", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  pvpSeasonService.getNextSeason = async () => { throw new Error("SECRET connection string blew up"); };

  const res = makeRes();
  await captureErrors(() => pvpController.getPublicSeason({}, res));

  assert.equal(JSON.stringify(res._body).includes("SECRET"), false);
  assert.equal("message" in res._body, false, "not an error body — a normal season payload");
});

test("Cache-Control is still set when the teaser lookup fails", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  pvpSeasonService.getNextSeason = async () => { throw new Error("boom"); };

  const res = makeRes();
  await captureErrors(() => pvpController.getPublicSeason({}, res));

  assert.equal(res._headers["Cache-Control"], "public, max-age=10");
});

test("a PRIMARY lookup failure still 500s (isolation is one-way)", async () => {
  pvpSeasonService.getPublicSeason = async () => { throw new Error("DB down"); };
  pvpSeasonService.getNextSeason = async () => null;

  const res = makeRes();
  await captureErrors(() => pvpController.getPublicSeason({}, res));

  assert.equal(res._status, 500);
  assert.deepEqual(res._body, { message: "Internal server error" });
});
