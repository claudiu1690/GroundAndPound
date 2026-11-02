// QA tests for the 5-day off-season (SEASON_GAP_DAYS). No DB: Season / PVPRecord are
// stubbed in memory. Covers what pvpSeasonGap.test.js does not: the full sweep
// (finalize + same-run activation phase), crash-recovery re-runs, the softReset
// fallback seed, per-WC continuation, and the public DTO during the gap.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Season = require("../../models/seasonModel");
const PVPRecord = require("../../models/pvpRecordModel");
const HallOfFame = require("../../models/hallOfFameModel");
const pvpConfig = require("../../consts/pvpConfig");
const pvpSeasonService = require("../../services/pvpSeasonService");
const pvpRewardService = require("../../services/pvpRewardService");
const pvpController = require("../../controllers/pvpController");

const DAY = 24 * 60 * 60 * 1000;
const GAP = pvpConfig.SEASON_GAP_DAYS * DAY;
const S2_END = new Date("2026-11-29T18:30:00.000Z");

const db = { seasons: [], seq: 0 };
function reset() { db.seasons = []; db.seq = 0; }
function dupKey() { const e = new Error("E11000"); e.code = 11000; return e; }
function matches(s, f) {
    return Object.entries(f).every(([k, v]) => {
        if (v && typeof v === "object" && !(v instanceof Date)) {
            if ("$lte" in v) return s[k] <= v.$lte;
            if ("$in" in v) return v.$in.includes(s[k]);
            return true;
        }
        if (v === null) return s[k] == null;
        return String(s[k]) === String(v);
    });
}
function mkSeason(over) {
    const s = { _id: `s-${++db.seq}`, redistributedAt: null, beltHolderId: null, config: { crossWeightClass: true }, ...over };
    s.save = async () => {};
    db.seasons.push(s);
    return s;
}
Season.create = async (doc) => {
    if (db.seasons.some((s) => s.weightClass === doc.weightClass && s.seasonNumber === doc.seasonNumber)) throw dupKey();
    return mkSeason(doc);
};
Season.findOne = (f = {}) => {
    const row = db.seasons.find((s) => matches(s, f)) || null;
    const p = Promise.resolve(row);
    p.sort = () => ({ lean: async () => row, then: (a, b) => Promise.resolve(row).then(a, b) });
    return p;
};
Season.find = async (f = {}) => db.seasons.filter((s) => matches(s, f));
PVPRecord.find = () => { const p = Promise.resolve([]); p.sort = () => Promise.resolve([]); return p; };
HallOfFame.create = async () => ({});

function ending(over = {}) {
    return mkSeason({
        seasonNumber: 2, name: "Iron Circuit", twist: "iron_circuit", weightClass: "Open",
        startDate: new Date(S2_END.getTime() - 70 * DAY), endDate: S2_END, status: "active", ...over,
    });
}

test("full sweep: S2 ends -> S3 seeded upcoming at +5d and NOT activated in the same sweep", async () => {
    reset();
    const s2 = ending();
    const r = await pvpSeasonService.runSeasonTransitionSweep(new Date(S2_END.getTime() + 60 * 1000));
    assert.equal(r.ended, 1);
    assert.equal(r.started, 0, "gap: nothing opens in the same sweep");
    const s3 = db.seasons.find((s) => s.seasonNumber === 3);
    assert.ok(s3);
    assert.equal(s3.status, "upcoming");
    assert.equal(s3.startDate.getTime(), S2_END.getTime() + GAP);
    assert.equal(s2.status, "ended");
    assert.ok(s2.redistributedAt);
    // sweeps during the gap do nothing, even repeated
    for (const d of [1, 2, 4.9]) {
        const x = await pvpSeasonService.runSeasonTransitionSweep(new Date(S2_END.getTime() + d * DAY));
        assert.deepEqual([x.ended, x.started, x.failed, x.recovered], [0, 0, 0, 0]);
        assert.equal(s3.status, "upcoming");
    }
    const open = await pvpSeasonService.runSeasonTransitionSweep(new Date(S2_END.getTime() + GAP + 1000));
    assert.equal(open.started, 1);
    assert.equal(s3.status, "active");
});

test("stranded-finalize recovery re-run keeps the same startDate and creates no second S3", async () => {
    reset();
    const s2 = ending({ status: "ended", redistributedAt: null }); // crash after status=ended
    // crash window variant: S3 was already seeded by the first attempt
    await pvpSeasonService.seedOpenSeason(3, pvpSeasonService.pickTwistForSeason(3), pvpSeasonService.nextSeasonStart(s2), "upcoming");
    const r = await pvpSeasonService.runSeasonTransitionSweep(new Date(S2_END.getTime() + 2 * DAY));
    assert.equal(r.recovered, 1);
    const s3s = db.seasons.filter((s) => s.seasonNumber === 3);
    assert.equal(s3s.length, 1);
    assert.equal(s3s[0].startDate.getTime(), S2_END.getTime() + GAP);
    assert.equal(s3s[0].status, "upcoming");
});

test("stranded recovery after the gap elapsed: S3 is seeded at endDate+5d (already past) and activated by the same sweep", async () => {
    reset();
    ending({ status: "ended", redistributedAt: null });
    const r = await pvpSeasonService.runSeasonTransitionSweep(new Date(S2_END.getTime() + 9 * DAY));
    assert.equal(r.recovered, 1);
    assert.equal(r.started, 1);
    assert.equal(db.seasons.find((s) => s.seasonNumber === 3).startDate.getTime(), S2_END.getTime() + GAP);
});

test("softReset fallback seed (N+1 missing) uses nextSeasonStart and carries the Open format", async () => {
    reset();
    const s2 = ending({ status: "ended" });
    await pvpRewardService.softReset(s2, []);
    const s3 = db.seasons.find((s) => s.seasonNumber === 3);
    assert.ok(s3);
    assert.equal(s3.startDate.getTime(), S2_END.getTime() + GAP);
    assert.equal(s3.config.crossWeightClass, true);
});

test("per-WC continuation seeds N+1 at endDate+5d", async () => {
    reset();
    const s = ending({ weightClass: "Lightweight", config: { crossWeightClass: false } });
    await pvpRewardService.finalizeSeason(s);
    const n = db.seasons.find((x) => x.seasonNumber === 3);
    assert.equal(n.weightClass, "Lightweight");
    assert.equal(n.startDate.getTime(), S2_END.getTime() + GAP);
});

function fakeRes() {
    return { headers: {}, body: undefined, code: 200,
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.code = c; return this; },
        json(b) { this.body = b; return this; } };
}

test("GET /pvp/season/public mid-season: next.startDate = endDate + 5d", async () => {
    reset();
    ending();
    const res = fakeRes();
    await pvpController.getPublicSeason({}, res);
    assert.equal(res.body.status, "active");
    assert.ok(res.body.next);
    assert.equal(Date.parse(res.body.next.startDate), S2_END.getTime() + GAP);
    assert.equal(res.body.next.seasonNumber, 3);
});

test("GET /pvp/season/public during the gap: head is upcoming S3, next is null, nothing 500s", async () => {
    reset();
    ending({ status: "ended", redistributedAt: new Date() });
    await pvpSeasonService.seedOpenSeason(3, pvpSeasonService.pickTwistForSeason(3), pvpSeasonService.nextSeasonStart({ endDate: S2_END }), "upcoming");
    const res = fakeRes();
    await pvpController.getPublicSeason({}, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.status, "upcoming");
    assert.equal(res.body.seasonNumber, 3);
    assert.equal(Date.parse(res.body.startDate), S2_END.getTime() + GAP);
    assert.equal(res.body.next, null);
});

test("no active season for a fighter during the gap resolves to the upcoming season, never null", async () => {
    reset();
    ending({ status: "ended", redistributedAt: new Date() });
    await pvpSeasonService.seedOpenSeason(3, "iron_circuit", pvpSeasonService.nextSeasonStart({ endDate: S2_END }), "upcoming");
    const cur = await pvpSeasonService.getCurrentSeasonForFighter("Lightweight");
    assert.equal(cur.status, "upcoming");
    assert.equal(cur.seasonNumber, 3);
});
