// QA unit tests — next-season tease resolution + player-facing twist copy.
//
// Covers services/pvpSeasonService.{twistCopyFor,publicWeightClassLabel,getNextSeason}
// and the config-driven NEXT_SEASON_TEASE block. No DB: the Season model's query
// methods are stubbed with a chainable fake, matching this repo's convention that
// tests/services/*.test.js never spin up Mongo/Redis.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Season = require("../../models/seasonModel");
const pvpSeasonService = require("../../services/pvpSeasonService");
const pvpController = require("../../controllers/pvpController");
const {
    TWIST_KEYS,
    NEXT_SEASON_TEASE,
    WEIGHT_CLASSES_PVP,
    OPEN_WEIGHT_CLASS,
    SEASON_LENGTH_DAYS,
} = require("../../consts/pvpConfig");

// ── Fake Season model ───────────────────────────────────────────────────────
// One slot per query the service makes, so a test declares exactly what exists.
const db = { openActive: null, wcActive: null, openUpcoming: null, wcUpcoming: null, cycle: [] };

function resetDb() {
    db.openActive = null;
    db.wcActive = null;
    db.openUpcoming = null;
    db.wcUpcoming = null;
    db.cycle = [];
}

function slotFor(filter) {
    const open = filter.weightClass === OPEN_WEIGHT_CLASS;
    const upcoming = filter.status === "upcoming";
    if (open) return upcoming ? "openUpcoming" : "openActive";
    return upcoming ? "wcUpcoming" : "wcActive";
}

Season.findOne = (filter = {}) => ({
    sort: () => ({ lean: async () => db[slotFor(filter)] }),
});
Season.find = (filter = {}) => ({
    lean: async () => db.cycle.filter((d) => d.seasonNumber === filter.seasonNumber),
});

function wcSeason(weightClass, over = {}) {
    return {
        _id: `id-${weightClass}`,
        seasonNumber: 4,
        name: "Blood Sport",
        twist: "blood_sport",
        weightClass,
        status: "upcoming",
        startDate: new Date("2026-11-01T00:00:00.000Z"), // IDENTICAL across the cycle
        endDate: new Date("2027-01-10T00:00:00.000Z"),
        config: { crossWeightClass: false },
        beltHolderId: null,
        ...over,
    };
}

// NEXT_SEASON_TEASE is a frozen-by-convention config object; mutate + restore per test.
const teaseDefaults = { ...NEXT_SEASON_TEASE };
function setTease(patch) {
    Object.assign(NEXT_SEASON_TEASE, teaseDefaults, patch);
}
function restoreTease() {
    Object.assign(NEXT_SEASON_TEASE, teaseDefaults);
}

// ── twistCopyFor — all six twists ───────────────────────────────────────────

test("twistCopyFor: every configured twist produces copy (no key left behind)", () => {
    for (const key of TWIST_KEYS) {
        const copy = pvpSeasonService.twistCopyFor(key);
        assert.equal(typeof copy.twistName, "string", `${key} must have a display name`);
        assert.ok(copy.twistEffect === null || typeof copy.twistEffect === "string", key);
    }
    assert.equal(TWIST_KEYS.length, 6, "six twists — update this suite if the roster changes");
});

test("twistCopyFor: iron_circuit has NO effect line", () => {
    assert.deepEqual(pvpSeasonService.twistCopyFor("iron_circuit"), {
        twistName: "Iron Circuit",
        twistEffect: null,
    });
});

test("twistCopyFor: blood_sport labels both methods", () => {
    assert.deepEqual(pvpSeasonService.twistCopyFor("blood_sport"), {
        twistName: "Blood Sport",
        twistEffect: "+25% Division Points on KO/Submission wins",
    });
});

test("twistCopyFor: the_contenders is a streak line", () => {
    assert.deepEqual(pvpSeasonService.twistCopyFor("the_contenders"), {
        twistName: "The Contenders",
        twistEffect: "Streak bonus from 3 straight wins",
    });
});

test("twistCopyFor: ground_war / iron_fist / the_marathon single-method lines", () => {
    assert.equal(pvpSeasonService.twistCopyFor("ground_war").twistEffect, "+30% Division Points on Submission wins");
    assert.equal(pvpSeasonService.twistCopyFor("iron_fist").twistEffect, "+30% Division Points on KO wins");
    assert.equal(pvpSeasonService.twistCopyFor("the_marathon").twistEffect, "+20% Division Points on Decision wins");
});

test("twistCopyFor: never emits a raw lowercase method key", () => {
    for (const key of TWIST_KEYS) {
        const { twistEffect } = pvpSeasonService.twistCopyFor(key);
        if (!twistEffect) continue;
        assert.ok(!/\b(ko|submission|decision)\b/.test(twistEffect), `${key} leaked a raw key: ${twistEffect}`);
    }
});

test("twistCopyFor: unknown / missing twist degrades, never throws", () => {
    assert.deepEqual(pvpSeasonService.twistCopyFor("not_a_twist"), { twistName: "not_a_twist", twistEffect: null });
    assert.deepEqual(pvpSeasonService.twistCopyFor(undefined), { twistName: null, twistEffect: null });
});

// ── publicWeightClassLabel ──────────────────────────────────────────────────

test("publicWeightClassLabel: Open season spells out all weight classes", () => {
    const label = pvpSeasonService.publicWeightClassLabel({ weightClass: "Open", config: { crossWeightClass: true } });
    assert.equal(label, "Open · All Weight Classes");
});

test("publicWeightClassLabel: per-WC season is its own class; null season is null", () => {
    assert.equal(pvpSeasonService.publicWeightClassLabel(wcSeason("Middleweight")), "Middleweight");
    assert.equal(pvpSeasonService.publicWeightClassLabel({ weightClass: "Lightweight" }), "Lightweight", "legacy doc, no config");
    assert.equal(pvpSeasonService.publicWeightClassLabel(null), null);
});

// ── getNextSeason resolution order ──────────────────────────────────────────

test("getNextSeason (a): a real upcoming Open doc beats the config tease", async () => {
    resetDb();
    setTease({ enabled: true });
    db.openUpcoming = { _id: "real", seasonNumber: 9, weightClass: OPEN_WEIGHT_CLASS, status: "upcoming", twist: "iron_fist", config: { crossWeightClass: true } };
    const next = await pvpSeasonService.getNextSeason();
    assert.equal(next._id, "real");
    assert.equal(next.seasonNumber, 9);
    restoreTease();
});

test("getNextSeason (b): falls back to the config tease when nothing is queued", async () => {
    resetDb();
    setTease({ enabled: true, seasonNumber: 2, twist: "blood_sport", startDate: "2026-10-01T00:00:00.000Z", crossWeightClass: true });
    const next = await pvpSeasonService.getNextSeason();

    assert.ok(next, "the tease must fire when no upcoming doc exists");
    assert.equal(next.seasonNumber, 2);
    assert.equal(next.status, "upcoming");
    assert.equal(next.twist, "blood_sport");
    assert.equal(next.name, "Blood Sport", "name is derived from the twist, same as a seeded season");
    assert.equal(next.weightClass, OPEN_WEIGHT_CLASS);
    assert.equal(next.config.crossWeightClass, true);
    assert.equal(new Date(next.startDate).toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(
        new Date(next.endDate).getTime() - new Date(next.startDate).getTime(),
        SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000,
        "endDate follows SEASON_LENGTH_DAYS — one home for the number"
    );
    assert.equal(String(next._id).startsWith("tease:"), true, "sentinel id can never collide with an ObjectId");
    restoreTease();
});

test("getNextSeason (c): null when nothing is queued and the tease is disarmed", async () => {
    resetDb();
    setTease({ enabled: false });
    assert.equal(await pvpSeasonService.getNextSeason(), null);
    restoreTease();
});

test("NEXT_SEASON_TEASE ships DISABLED (arming it is a deliberate marketing switch)", () => {
    assert.equal(teaseDefaults.enabled, false);
    assert.equal(teaseDefaults.seasonNumber, 2);
    assert.equal(teaseDefaults.twist, "blood_sport");
    assert.equal(teaseDefaults.crossWeightClass, true, "Season 2 is a single Open season with one belt");
    assert.ok(TWIST_KEYS.includes(teaseDefaults.twist));
});

// ── per-WC cycle collapse (tie-break determinism) ───────────────────────────

test("getNextSeason: a full per-WC cycle collapses to ONE logical cross-weight-class season", async () => {
    resetDb();
    db.cycle = WEIGHT_CLASSES_PVP.map((wc) => wcSeason(wc));
    db.wcUpcoming = db.cycle[2]; // Mongo's undefined tie-break happened to pick Middleweight

    const next = await pvpSeasonService.getNextSeason();
    assert.equal(next.weightClass, OPEN_WEIGHT_CLASS, "never expose one arbitrary class of a 4-class cycle");
    assert.equal(next.config.crossWeightClass, true);
    assert.equal(next.seasonNumber, 4);
    assert.equal(pvpSeasonService.publicWeightClassLabel(next), "Open · All Weight Classes");
});

test("getNextSeason: the collapsed season is STABLE across polls that pick different classes", async () => {
    resetDb();
    db.cycle = WEIGHT_CLASSES_PVP.map((wc) => wcSeason(wc));

    const results = [];
    for (const wc of WEIGHT_CLASSES_PVP) {
        db.wcUpcoming = db.cycle.find((d) => d.weightClass === wc);
        // eslint-disable-next-line no-await-in-loop
        results.push(await pvpSeasonService.getNextSeason());
    }
    const ids = new Set(results.map((r) => String(r._id)));
    const classes = new Set(results.map((r) => r.weightClass));
    assert.equal(ids.size, 1, "the teased id must not change between 30-second polls");
    assert.equal(classes.size, 1);
    assert.equal([...classes][0], OPEN_WEIGHT_CLASS);
});

test("getNextSeason: a PARTIAL per-WC cycle is left untouched (genuinely single-class)", async () => {
    resetDb();
    db.cycle = [wcSeason("Featherweight"), wcSeason("Lightweight")];
    db.wcUpcoming = db.cycle[0];

    const next = await pvpSeasonService.getNextSeason();
    assert.equal(next.weightClass, "Featherweight");
    assert.equal(next.config.crossWeightClass, false);
});

test("collapse does not mutate the underlying season docs", async () => {
    resetDb();
    db.cycle = WEIGHT_CLASSES_PVP.map((wc) => wcSeason(wc));
    db.wcUpcoming = db.cycle[0];

    await pvpSeasonService.getNextSeason();
    for (const doc of db.cycle) {
        assert.notEqual(doc.weightClass, OPEN_WEIGHT_CLASS, "real docs keep their real class");
        assert.equal(doc.config.crossWeightClass, false);
    }
});

// ── End-to-end through the public endpoint (real service, faked model) ──────

function makeRes() {
    const r = { _status: 200, _headers: {}, _body: undefined };
    r.set = function (k, v) { r._headers[k] = v; return r; };
    r.status = function (c) { r._status = c; return r; };
    r.json = function (b) { r._body = b; return r; };
    return r;
}

test("GET /pvp/season/public: an armed tease reaches the client, fully shaped", async () => {
    resetDb();
    setTease({ enabled: true, seasonNumber: 2, twist: "blood_sport", startDate: "2026-10-01T00:00:00.000Z", crossWeightClass: true });
    db.wcActive = wcSeason("Lightweight", {
        _id: "live", seasonNumber: 1, status: "active", name: "Iron Circuit", twist: "iron_circuit",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
    });

    const res = makeRes();
    await pvpController.getPublicSeason({}, res);

    assert.equal(res._status, 200);
    assert.equal(res._body.seasonNumber, 1);
    assert.equal(res._body.twistEffect, null);
    assert.equal(res._body.weightClassLabel, "Lightweight");
    assert.ok(res._body.next, "the tease must survive to the client");
    assert.equal(res._body.next.seasonNumber, 2);
    assert.equal(res._body.next.name, "Blood Sport");
    assert.equal(res._body.next.crossWeightClass, true);
    assert.equal(res._body.next.weightClassLabel, "Open · All Weight Classes");
    assert.equal(res._body.next.twistEffect, "+25% Division Points on KO/Submission wins");
    assert.equal(res._body.next.startDate, "2026-10-01T00:00:00.000Z");
    assert.equal("_id" in res._body.next, false, "the sentinel id must never be exposed");
    restoreTease();
});

test("GET /pvp/season/public: the tease never duplicates the live season number", async () => {
    resetDb();
    setTease({ enabled: true, seasonNumber: 2, crossWeightClass: true });
    db.wcActive = wcSeason("Lightweight", { _id: "live", seasonNumber: 2, status: "active" });

    const res = makeRes();
    await pvpController.getPublicSeason({}, res);

    assert.equal(res._body.seasonNumber, 2);
    assert.equal(res._body.next, null, "no self-tease when the tease points at the live season");
    restoreTease();
});
