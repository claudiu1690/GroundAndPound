/**
 * roadmapModel.js is a plain ESM module under frontend/src (no JSX), loaded
 * directly with Node's native loader. Covers the landing-page roadmap rules:
 * shipped dates come from the changelog, the future never invents a season.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.resolve(__dirname, "../../frontend/src/components/landing/roadmapModel.js");
const changelogPath = path.resolve(__dirname, "../../frontend/src/components/changelog/changelogContent.js");

let rm;
let changelog;

test("load roadmapModel.js", async () => {
    rm = await import(pathToFileURL(modulePath));
    changelog = await import(pathToFileURL(changelogPath));
    assert.equal(typeof rm.shippedMilestones, "function");
});

test("every shipped milestone names a real changelog version and takes its date", () => {
    const byVersion = new Map(changelog.CHANGELOG_ENTRIES.map((e) => [e.version, e.date]));
    const shipped = rm.shippedMilestones();
    assert.equal(shipped.length, rm.ROADMAP_SHIPPED.length, "a roadmap milestone has no changelog entry");
    for (const m of shipped) assert.equal(m.date, byVersion.get(m.version));
});

test("shipped milestones are newest first", () => {
    const dates = rm.shippedMilestones().map((m) => m.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
});

test("a milestone whose version is not in the changelog is dropped", () => {
    const shipped = rm.shippedMilestones([{ version: "1.0", date: "2026-07-04" }]);
    assert.deepEqual(shipped.map((m) => m.version), ["1.0"]);
});

const allPoints = () => [...rm.ROADMAP_SHIPPED, ...rm.ROADMAP_LATER];
const allArt = () => [...allPoints(), ...rm.ROADMAP_SEASONS.map((x) => ({ ...x, title: `Season ${x.number}` }))];

test("every roadmap point has a title, points and art", () => {
    for (const item of allPoints()) {
        assert.ok(item.title, "missing title");
        assert.ok(Array.isArray(item.points) && item.points.length > 0, `${item.title}: no points`);
        assert.ok(item.art && (item.art.img || item.art.css), `${item.title}: no art`);
    }
});

test("every image the roadmap uses exists under frontend/public", () => {
    const fs = require("node:fs");
    const pub = path.resolve(__dirname, "../../frontend/public");
    for (const item of allArt()) {
        for (const src of [item.art.img, ...(item.art.cards || [])].filter(Boolean)) {
            assert.ok(fs.existsSync(path.join(pub, src)), `${item.title}: ${src} is missing`);
        }
    }
});

test("roadmap copy has no em or en dashes", () => {
    const copy = JSON.stringify(allPoints().map((i) => [i.title, i.points]));
    assert.doesNotMatch(copy, /[–—]/);
});

test("formatMilestoneDate keeps the calendar day (no UTC shift)", () => {
    assert.equal(rm.formatMilestoneDate("2026-07-04"), "Jul 4, 2026");
    assert.equal(rm.formatMilestoneDate("bad"), null);
});

const PLAN = { seasonNumber: 3, theme: "Winter" };

test("seasonNodes: no data means nothing live and no date", () => {
    const { now, next } = rm.seasonNodes(null, PLAN);
    assert.equal(now, null);
    assert.deepEqual(next, { seasonNumber: 3, theme: "Winter", startDate: null });
});

test("seasonNodes: active season with the planned season queued shows its date", () => {
    const { now, next } = rm.seasonNodes({
        status: "active", seasonNumber: 2, name: "Blood Sport", endDate: "2026-11-29T00:00:00Z",
        next: { seasonNumber: 3, startDate: "2026-11-29T00:00:00Z" },
    }, PLAN);
    assert.deepEqual(now, {
        seasonNumber: 2, name: "Blood Sport", endDate: "2026-11-29T00:00:00Z", twistEffect: null, weightClassLabel: null,
    });
    assert.equal(next.startDate, "2026-11-29T00:00:00Z");
});

test("seasonNodes: tease off (next null) never invents a date", () => {
    const { next } = rm.seasonNodes({ status: "active", seasonNumber: 2, name: "Blood Sport", endDate: "x", next: null }, PLAN);
    assert.equal(next.startDate, null);
});

test("seasonNodes: a different next season never lends its date to a stale plan", () => {
    const { next } = rm.seasonNodes({
        status: "active", seasonNumber: 3, name: "Frostbite", endDate: "x",
        next: { seasonNumber: 4, startDate: "2027-02-07T00:00:00Z" },
    }, PLAN);
    assert.deepEqual(next, { seasonNumber: 3, theme: "Winter", startDate: null });
});

test("seasonNodes: upcoming season is next, nothing is live", () => {
    const { now, next } = rm.seasonNodes({ status: "upcoming", seasonNumber: 3, startDate: "2026-11-29T00:00:00Z" }, PLAN);
    assert.equal(now, null);
    assert.equal(next.startDate, "2026-11-29T00:00:00Z");
});

test("seasonNodes: unknown status is treated as nothing live", () => {
    const { now } = rm.seasonNodes({ status: "ended", seasonNumber: 2 }, PLAN);
    assert.equal(now, null);
});

test("seasonEras: newest season first, every release under exactly one season", () => {
    const eras = rm.seasonEras();
    assert.deepEqual(eras.map((e) => e.number), [2, 1]);
    const listed = eras.flatMap((e) => e.releases.map((r) => r.version));
    assert.equal(listed.length, rm.shippedMilestones().length);
    assert.ok(eras[0].releases.every((r) => Number(r.version.split(".")[0]) >= 2));
    assert.ok(eras[1].releases.every((r) => Number(r.version.split(".")[0]) < 2));
});

test("seasonEras: dates come from the changelog, Season 1 has no invented start", () => {
    const [s2, s1] = rm.seasonEras();
    const v20 = changelog.CHANGELOG_ENTRIES.find((e) => e.version === "2.0").date;
    assert.equal(s2.startDate, v20);
    assert.equal(s2.endDate, null);
    assert.equal(s1.startDate, null);
    assert.equal(s1.endDate, v20);
});

test("banner pile art names real customizer pieces", async () => {
    const cat = await import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/components/banner/bannerCatalog.js")));
    for (const item of allPoints()) {
        for (const b of item.art.banners || []) {
            assert.ok(cat.PIECES_BY_ID[b.id], `${item.title}: unknown banner ${b.id}`);
            assert.ok(b.last, `${item.title}: banner ${b.id} has no name`);
        }
    }
});

test("seasonEras: inside a season releases run newest first, the opener last (it sits on the banner)", () => {
    const [s2] = rm.seasonEras();
    assert.equal(s2.releases.at(-1).version, "2.0");
    const dates = s2.releases.map((r) => r.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
});

test("the next season carries no feature list, only its number and theme", () => {
    assert.deepEqual(Object.keys(rm.ROADMAP_NEXT).sort(), ["seasonNumber", "theme"]);
});
