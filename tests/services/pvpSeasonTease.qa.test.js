// QA unit tests — next-season tease resolution + player-facing twist copy.
//
// Covers services/pvpSeasonService.{twistCopyFor,publicWeightClassLabel,teaseSeason,
// getNextSeason}. The tease is DERIVED from the live season (the anchor), not
// configured: NEXT_SEASON_TEASE is only an on/off switch. So these tests assert the
// derivation against the very helpers finalizeSeason uses (anchor.endDate → startDate,
// pickTwistForSeason(N+1)) and never against hand-written literals — a literal here
// would just re-create the drift trap the derivation removes.
//
// No DB: the Season model's query methods are stubbed with a chainable fake, matching
// this repo's convention that tests/services/*.test.js never spin up Mongo/Redis.
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

// The live season the tease derives from. A deliberately non-round endDate: the tease
// must reproduce it to the millisecond, not merely to the day.
const ANCHOR_END_ISO = "2026-09-09T13:47:11.123Z";

function activeOpenAnchor(over = {}) {
    return {
        _id: "live-open",
        seasonNumber: 1,
        name: "Iron Circuit",
        twist: "iron_circuit",
        status: "active",
        weightClass: OPEN_WEIGHT_CLASS,
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date(ANCHOR_END_ISO),
        config: { crossWeightClass: true },
        beltHolderId: null,
        ...over,
    };
}

// NEXT_SEASON_TEASE is a plain config object shared by the whole process. Every test
// that touches it goes through withTease(), which restores in a `finally` so a failing
// assertion cannot leak a mutated switch into the next test.
const teaseDefaults = { ...NEXT_SEASON_TEASE };

function restoreTease() {
    for (const key of Object.keys(NEXT_SEASON_TEASE)) {
        if (!(key in teaseDefaults)) delete NEXT_SEASON_TEASE[key];
    }
    Object.assign(NEXT_SEASON_TEASE, teaseDefaults);
}

async function withTease(patch, fn) {
    Object.assign(NEXT_SEASON_TEASE, teaseDefaults, patch);
    try {
        return await fn();
    } finally {
        restoreTease();
    }
}

// Silence + capture the expected server-side error log.
async function captureErrors(fn) {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    try {
        const value = await fn();
        return { value, logged };
    } finally {
        console.error = original;
    }
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

// ── teaseSeason — the derivation itself ─────────────────────────────────────

test("teaseSeason: startDate IS the anchor's endDate, to the millisecond", async () => {
    await withTease({ enabled: true }, () => {
        const anchor = activeOpenAnchor();
        const tease = pvpSeasonService.teaseSeason(anchor);

        assert.ok(tease, "an armed tease with a live anchor must produce a season");
        assert.equal(
            new Date(tease.startDate).getTime(),
            new Date(anchor.endDate).getTime(),
            "finalizeSeason seeds N+1 with startDate = endingSeason.endDate — the countdown must match it exactly"
        );
        assert.equal(new Date(tease.startDate).toISOString(), ANCHOR_END_ISO);
    });
});

test("teaseSeason: seasonNumber is anchor+1 and twist is pickTwistForSeason(anchor+1)", async () => {
    await withTease({ enabled: true }, () => {
        for (const seasonNumber of [1, 2, 5, 12]) {
            const anchor = activeOpenAnchor({ seasonNumber });
            const tease = pvpSeasonService.teaseSeason(anchor);
            const expectedTwist = pvpSeasonService.pickTwistForSeason(seasonNumber + 1);

            assert.equal(tease.seasonNumber, seasonNumber + 1);
            assert.equal(tease.twist, expectedTwist, "the SAME pick finalizeSeason makes — never a literal");
            assert.equal(tease.name, pvpSeasonService.seasonNameFor(expectedTwist));
            assert.equal(tease._id, `tease:season-${seasonNumber + 1}`);
            assert.equal(tease.status, "upcoming");
            assert.equal(tease.beltHolderId, null);
        }
    });
});

test("teaseSeason: endDate follows SEASON_LENGTH_DAYS — one home for the number", async () => {
    await withTease({ enabled: true }, () => {
        const tease = pvpSeasonService.teaseSeason(activeOpenAnchor());
        assert.equal(
            new Date(tease.endDate).getTime() - new Date(tease.startDate).getTime(),
            SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000
        );
    });
});

test("teaseSeason: carries the anchor's format forward — an Open anchor teases Open", async () => {
    await withTease({ enabled: true }, () => {
        const tease = pvpSeasonService.teaseSeason(activeOpenAnchor());
        assert.equal(tease.config.crossWeightClass, true);
        assert.equal(tease.weightClass, OPEN_WEIGHT_CLASS);
        assert.equal(pvpSeasonService.publicWeightClassLabel(tease), "Open · All Weight Classes");
    });
});

test("teaseSeason: a per-WC anchor teases crossWeightClass false", async () => {
    await withTease({ enabled: true }, () => {
        const perWc = pvpSeasonService.teaseSeason(
            activeOpenAnchor({ weightClass: "Lightweight", config: { crossWeightClass: false } })
        );
        assert.equal(perWc.config.crossWeightClass, false);
        assert.equal(perWc.weightClass, null);

        const legacy = pvpSeasonService.teaseSeason(
            activeOpenAnchor({ weightClass: "Lightweight", config: undefined })
        );
        assert.equal(legacy.config.crossWeightClass, false, "a config-less legacy doc must not throw or tease Open");
    });
});

test("teaseSeason: disarmed switch yields null even with a perfectly good anchor", async () => {
    await withTease({ enabled: false }, () => {
        assert.equal(pvpSeasonService.teaseSeason(activeOpenAnchor()), null);
    });
});

test("teaseSeason: no anchor yields null (nothing to derive from)", async () => {
    await withTease({ enabled: true }, () => {
        assert.equal(pvpSeasonService.teaseSeason(null), null);
        assert.equal(pvpSeasonService.teaseSeason(undefined), null);
    });
});

test("teaseSeason: an unparseable anchor endDate is suppressed and logged, never rendered", async () => {
    await withTease({ enabled: true }, async () => {
        const { value, logged } = await captureErrors(async () =>
            pvpSeasonService.teaseSeason(activeOpenAnchor({ endDate: "not-a-date" }))
        );
        assert.equal(value, null, "better no countdown than an Invalid Date on the landing hero");
        assert.equal(logged.length > 0, true, "the failure is logged server-side, never silent");
    });
});

test("teaseSeason: does NOT mutate the anchor (public endpoint, polled by everyone)", async () => {
    await withTease({ enabled: true }, () => {
        const anchor = activeOpenAnchor();
        const beforeEnd = anchor.endDate.getTime();
        const beforeNumber = anchor.seasonNumber;
        const beforeConfig = { ...anchor.config };
        const beforeClass = anchor.weightClass;

        const tease = pvpSeasonService.teaseSeason(anchor);
        tease.config.crossWeightClass = false;
        tease.seasonNumber = 999;
        tease.endDate = new Date(0);

        assert.equal(anchor.endDate.getTime(), beforeEnd, "the anchor's endDate must be untouched");
        assert.equal(anchor.seasonNumber, beforeNumber);
        assert.deepEqual(anchor.config, beforeConfig, "config must be a fresh object, not a shared reference");
        assert.equal(anchor.weightClass, beforeClass);
        assert.notEqual(tease.config, anchor.config);
    });
});

test("teaseSeason: every call returns a FRESH object — one poll cannot poison the next", async () => {
    await withTease({ enabled: true }, () => {
        const anchor = activeOpenAnchor();
        const first = pvpSeasonService.teaseSeason(anchor);
        first.name = "MUTATED";
        first.config.crossWeightClass = false;

        const second = pvpSeasonService.teaseSeason(anchor);
        assert.notEqual(second, first);
        assert.notEqual(second.config, first.config);
        assert.notEqual(second.name, "MUTATED");
        assert.equal(second.config.crossWeightClass, true);
        assert.equal(new Date(second.startDate).getTime(), new Date(anchor.endDate).getTime());
    });
});

// ── getNextSeason resolution order ──────────────────────────────────────────

test("getNextSeason (a): a real upcoming Open doc beats the derived tease", async () => {
    resetDb();
    await withTease({ enabled: true }, async () => {
        db.openUpcoming = { _id: "real", seasonNumber: 9, weightClass: OPEN_WEIGHT_CLASS, status: "upcoming", twist: "iron_fist", config: { crossWeightClass: true } };
        const next = await pvpSeasonService.getNextSeason(activeOpenAnchor());
        assert.equal(next._id, "real", "a seeded doc is reality; the tease is only a stand-in");
        assert.equal(next.seasonNumber, 9);
    });
});

test("getNextSeason (b): falls back to the anchor-derived tease when nothing is queued", async () => {
    resetDb();
    await withTease({ enabled: true }, async () => {
        const anchor = activeOpenAnchor();
        const next = await pvpSeasonService.getNextSeason(anchor);
        const expectedTwist = pvpSeasonService.pickTwistForSeason(anchor.seasonNumber + 1);

        assert.ok(next, "the tease must fire when no upcoming doc exists");
        assert.equal(next.seasonNumber, anchor.seasonNumber + 1);
        assert.equal(next.status, "upcoming");
        assert.equal(next.twist, expectedTwist);
        assert.equal(next.name, pvpSeasonService.seasonNameFor(expectedTwist));
        assert.equal(next.weightClass, OPEN_WEIGHT_CLASS);
        assert.equal(next.config.crossWeightClass, true);
        assert.equal(new Date(next.startDate).getTime(), anchor.endDate.getTime());
        assert.equal(String(next._id).startsWith("tease:"), true, "sentinel id can never collide with an ObjectId");
    });
});

test("getNextSeason (c): null when nothing is queued and the tease is disarmed", async () => {
    resetDb();
    await withTease({ enabled: false }, async () => {
        assert.equal(await pvpSeasonService.getNextSeason(activeOpenAnchor()), null);
    });
});

test("getNextSeason (c): null when armed but there is no anchor season at all", async () => {
    resetDb();
    await withTease({ enabled: true }, async () => {
        assert.equal(await pvpSeasonService.getNextSeason(null), null);
    });
});

test("NEXT_SEASON_TEASE is the marketing switch and NOTHING else", () => {
    assert.deepEqual(Object.keys(teaseDefaults), ["enabled"], "any other key is a hand-maintained drift trap");
    assert.equal(teaseDefaults.enabled, true, "the landing countdown is the point of this release");
});

// ── per-WC cycle collapse (tie-break determinism) ───────────────────────────

test("getNextSeason: a full per-WC cycle collapses to ONE logical cross-weight-class season", async () => {
    resetDb();
    db.cycle = WEIGHT_CLASSES_PVP.map((wc) => wcSeason(wc));
    db.wcUpcoming = db.cycle[2]; // Mongo's undefined tie-break happened to pick Middleweight

    const next = await pvpSeasonService.getNextSeason(activeOpenAnchor());
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
        results.push(await pvpSeasonService.getNextSeason(activeOpenAnchor()));
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

    const next = await pvpSeasonService.getNextSeason(activeOpenAnchor());
    assert.equal(next.weightClass, "Featherweight");
    assert.equal(next.config.crossWeightClass, false);
});

test("collapse does not mutate the underlying season docs", async () => {
    resetDb();
    db.cycle = WEIGHT_CLASSES_PVP.map((wc) => wcSeason(wc));
    db.wcUpcoming = db.cycle[0];

    await pvpSeasonService.getNextSeason(activeOpenAnchor());
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

test("GET /pvp/season/public: the derived tease reaches the client, fully shaped", async () => {
    resetDb();
    await withTease({ enabled: true }, async () => {
        const live = activeOpenAnchor();
        db.openActive = live;

        const res = makeRes();
        await pvpController.getPublicSeason({}, res);

        const expectedTwist = pvpSeasonService.pickTwistForSeason(live.seasonNumber + 1);

        assert.equal(res._status, 200);
        assert.equal(res._body.seasonNumber, live.seasonNumber);
        assert.equal(res._body.twistEffect, null, "the live season is iron_circuit");
        assert.equal(res._body.weightClassLabel, "Open · All Weight Classes");

        assert.ok(res._body.next, "the tease must survive to the client");
        assert.equal(res._body.next.seasonNumber, live.seasonNumber + 1);
        assert.equal(res._body.next.name, pvpSeasonService.seasonNameFor(expectedTwist));
        assert.equal(res._body.next.crossWeightClass, true);
        assert.equal(res._body.next.weightClassLabel, "Open · All Weight Classes");
        assert.equal(res._body.next.twistEffect, pvpSeasonService.twistCopyFor(expectedTwist).twistEffect);
        assert.equal(
            res._body.next.startDate,
            res._body.endDate,
            "the advertised start IS the live season's end — the countdown cannot disagree with the rollover"
        );
        assert.equal(res._body.next.startDate, ANCHOR_END_ISO);
        assert.equal("_id" in res._body.next, false, "the sentinel id must never be exposed");
    });
});

test("GET /pvp/season/public: no self-tease when the queued doc IS the live season number", async () => {
    resetDb();
    await withTease({ enabled: true }, async () => {
        db.wcActive = wcSeason("Lightweight", { _id: "live", seasonNumber: 4, status: "active" });
        db.openUpcoming = wcSeason("Lightweight", { _id: "queued", seasonNumber: 4, weightClass: OPEN_WEIGHT_CLASS });

        const res = makeRes();
        await pvpController.getPublicSeason({}, res);

        assert.equal(res._body.seasonNumber, 4);
        assert.equal(res._body.next, null, "never count down to the season already on screen");
    });
});
