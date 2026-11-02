/**
 * The off-season between seasons (SEASON_GAP_DAYS, owner decision 2026-10-28).
 *
 * nextSeasonStart is the single source for when season N+1 opens: finalizeSeason seeds
 * with it and the public tease advertises it. These tests pin the real Season 2 to 3
 * dates and check the transition sweep keeps N+1 closed until its startDate.
 * No database: the Season model's find is stubbed in memory.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Season = require("../../models/seasonModel");
const pvpSeasonService = require("../../services/pvpSeasonService");
const { SEASON_GAP_DAYS, SEASON_LENGTH_DAYS } = require("../../consts/pvpConfig");

const DAY_MS = 24 * 60 * 60 * 1000;

test("SEASON_GAP_DAYS is 5 (Season 2 ends Nov 29, Season 3 opens Dec 4)", () => {
    assert.equal(SEASON_GAP_DAYS, 5);
});

test("nextSeasonStart: Season 2 ending 2026-11-29 opens Season 3 on 2026-12-04, same time of day", () => {
    const s2End = new Date("2026-11-29T18:30:00.000Z");
    const start = pvpSeasonService.nextSeasonStart({ endDate: s2End });
    assert.equal(start.toISOString(), "2026-12-04T18:30:00.000Z");
    // and Season 3 then runs its full length from there
    assert.equal(new Date(start.getTime() + SEASON_LENGTH_DAYS * DAY_MS).toISOString(), "2027-02-12T18:30:00.000Z");
});

test("nextSeasonStart accepts an ISO string and flags an unparseable date", () => {
    assert.equal(
        pvpSeasonService.nextSeasonStart({ endDate: "2026-11-29T00:00:00.000Z" }).toISOString(),
        "2026-12-04T00:00:00.000Z"
    );
    assert.ok(Number.isNaN(pvpSeasonService.nextSeasonStart({ endDate: "nope" }).getTime()));
});

test("the tease advertises the same date the rollover will use", () => {
    const anchor = {
        seasonNumber: 2,
        endDate: new Date("2026-11-29T18:30:00.000Z"),
        weightClass: "Open",
        config: { crossWeightClass: true },
    };
    const tease = pvpSeasonService.teaseSeason(anchor);
    assert.ok(tease, "the tease switch is on in config");
    assert.equal(new Date(tease.startDate).toISOString(), pvpSeasonService.nextSeasonStart(anchor).toISOString());
});

/** In-memory Season.find for the sweep: only the two status queries it makes. */
function withSeasons(docs, fn) {
    const realFind = Season.find;
    Season.find = async (filter = {}) => docs.filter((d) => {
        if (filter.status && d.status !== filter.status) return false;
        if (filter.redistributedAt === null && d.redistributedAt != null) return false;
        if (filter.endDate && filter.endDate.$lte && !(d.endDate <= filter.endDate.$lte)) return false;
        if (filter.startDate && filter.startDate.$lte && !(d.startDate <= filter.startDate.$lte)) return false;
        return true;
    });
    return Promise.resolve(fn()).finally(() => { Season.find = realFind; });
}

function upcomingSeason3() {
    const doc = {
        _id: "s3",
        seasonNumber: 3,
        status: "upcoming",
        startDate: new Date("2026-12-04T18:30:00.000Z"),
        endDate: new Date("2027-02-12T18:30:00.000Z"),
        redistributedAt: null,
        async save() { this.saved = (this.saved || 0) + 1; },
    };
    return doc;
}

test("sweep during the off-season leaves Season 3 upcoming", async () => {
    const s3 = upcomingSeason3();
    await withSeasons([s3], async () => {
        const res = await pvpSeasonService.runSeasonTransitionSweep(new Date("2026-12-01T12:00:00.000Z"));
        assert.equal(res.started, 0);
        assert.equal(s3.status, "upcoming");
    });
});

test("sweep after the opening time activates Season 3", async () => {
    const s3 = upcomingSeason3();
    await withSeasons([s3], async () => {
        const res = await pvpSeasonService.runSeasonTransitionSweep(new Date("2026-12-04T18:40:00.000Z"));
        assert.equal(res.started, 1);
        assert.equal(s3.status, "active");
    });
});
