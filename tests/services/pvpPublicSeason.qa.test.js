// QA Unit Tests — GET /pvp/season/public
const { test } = require("node:test");
const assert = require("node:assert/strict");

const pvpController = require("../../controllers/pvpController");
const pvpSeasonService = require("../../services/pvpSeasonService");

function makeRes() {
  const r = { _status: 200, _headers: {}, _body: undefined };
  r.set = function(k, v) { r._headers[k] = v; return r; };
  r.status = function(c) { r._status = c; return r; };
  r.json = function(b) { r._body = b; return r; };
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

const fakeUpcoming = {
  ...fakeActive,
  seasonNumber: 4, name: "Open Circuit", status: "upcoming", weightClass: "Open",
  startDate: new Date("2026-09-01T00:00:00.000Z"),
  endDate: new Date("2026-11-10T00:00:00.000Z"),
  config: { crossWeightClass: true }, beltHolderId: null,
};

const fakeLegacyNoConfig = { ...fakeActive, config: undefined };

// A genuinely DIFFERENT season doc. fakeUpcoming spreads fakeActive and so shares
// its _id, which the controller correctly reads as "same season, nothing to tease".
const fakeNext = {
  ...fakeUpcoming,
  _id: { toString: () => "id2" },
  seasonNumber: 4, name: "Blood Sport", twist: "blood_sport",
};

// The controller now also reads getNextSeason. Default it to "nothing queued" so
// every pre-existing test keeps asserting the current season in isolation; the
// tease-specific tests below override it.
pvpSeasonService.getNextSeason = async () => null;

// The strict allow-list produced by shapePublicSeason (`next` is attached at the call
// site, so it is only expected on the OUTER object).
const PUBLIC_SEASON_FIELDS = [
  "crossWeightClass","endDate","name","seasonNumber","startDate","status",
  "twistEffect","weightClass","weightClassLabel",
].sort();

test("exactly 9 season fields plus `next`, no more", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  pvpSeasonService.getNextSeason = async () => null;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._status, 200);
  const keys = Object.keys(res._body).sort();
  assert.deepEqual(keys, [...PUBLIC_SEASON_FIELDS, "next"].sort());
});

test("next: null when no season is queued", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  pvpSeasonService.getNextSeason = async () => null;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.next, null);
});

test("next: teases the upcoming season while the current one is live", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  pvpSeasonService.getNextSeason = async () => fakeNext;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.status, "active");
  assert.equal(res._body.seasonNumber, 3);
  assert.equal(res._body.next.seasonNumber, 4);
  assert.equal(res._body.next.name, "Blood Sport");
  assert.equal(res._body.next.status, "upcoming");
  assert.equal(res._body.next.startDate, "2026-09-01T00:00:00.000Z");
});

test("next: shaped by the same shaper, so it leaks nothing either", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  pvpSeasonService.getNextSeason = async () => fakeNext;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  const leaky = ["_id","__v","twist","config","beltHolderId","redistributedAt","createdAt","updatedAt","next"];
  for (const f of leaky) assert.equal(f in res._body.next, false, f + " must not be present on next");
  const keys = Object.keys(res._body.next).sort();
  assert.deepEqual(keys, PUBLIC_SEASON_FIELDS);
});

test("twistEffect + weightClassLabel come from the service, on both season and next", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;      // iron_circuit, Featherweight
  pvpSeasonService.getNextSeason = async () => fakeNext;          // blood_sport, Open
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.twistEffect, null, "iron_circuit has no effect line");
  assert.equal(res._body.weightClassLabel, "Featherweight");
  assert.equal(res._body.next.twistEffect, "+25% Division Points on KO/Submission wins");
  assert.equal(res._body.next.weightClassLabel, "Open · All Weight Classes");
});

test("twistEffect uses display labels, never raw lowercase method keys", async () => {
  pvpSeasonService.getPublicSeason = async () => ({ ...fakeActive, twist: "ground_war" });
  pvpSeasonService.getNextSeason = async () => null;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.twistEffect, "+30% Division Points on Submission wins");
  assert.ok(!/\bko\b|\bsubmission\b|\bdecision\b/.test(res._body.twistEffect), "no raw keys in marketing copy");
});

test("next: null when the current season IS the upcoming one (no self-tease)", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeUpcoming;
  pvpSeasonService.getNextSeason = async () => fakeUpcoming;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.status, "upcoming");
  assert.equal(res._body.next, null);
});

test("dates are ISO strings ending in Z", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.ok(res._body.startDate.endsWith("Z"));
  assert.ok(res._body.endDate.endsWith("Z"));
  assert.ok(!isNaN(Date.parse(res._body.startDate)));
  assert.ok(!isNaN(Date.parse(res._body.endDate)));
});

test("no internal fields leaked", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  const leaky = ["_id","__v","twist","config","beltHolderId","redistributedAt","createdAt","updatedAt"];
  for (const f of leaky) assert.equal(f in res._body, false, f + " must not be present");
});

test("crossWeightClass=true for Open season", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeUpcoming;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.crossWeightClass, true);
  assert.equal(res._body.status, "upcoming");
  assert.equal(res._body.weightClass, "Open");
});

test("crossWeightClass=false when config is undefined (legacy doc - no throw)", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeLegacyNoConfig;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.crossWeightClass, false);
});

test("no season -> literal null body, 200", async () => {
  pvpSeasonService.getPublicSeason = async () => null;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._status, 200);
  assert.equal(res._body, null);
});

test("Cache-Control is public,max-age=10 for a season", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._headers["Cache-Control"], "public, max-age=10");
});

test("Cache-Control is public,max-age=10 even on null season", async () => {
  pvpSeasonService.getPublicSeason = async () => null;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._headers["Cache-Control"], "public, max-age=10");
});

test("service throws -> 500 {message:Internal server error}", async () => {
  pvpSeasonService.getPublicSeason = async () => { throw new Error("DB down"); };
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._status, 500);
  assert.deepEqual(res._body, { message: "Internal server error" });
});

test("values pass through: seasonNumber, name, status, weightClass", async () => {
  pvpSeasonService.getPublicSeason = async () => fakeActive;
  const res = makeRes();
  await pvpController.getPublicSeason({}, res);
  assert.equal(res._body.seasonNumber, 3);
  assert.equal(res._body.name, "Iron Circuit");
  assert.equal(res._body.status, "active");
  assert.equal(res._body.weightClass, "Featherweight");
});