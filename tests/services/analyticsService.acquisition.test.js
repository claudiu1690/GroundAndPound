/**
 * QA: analyticsService.acquisitionMeta (signup link-tag sanitiser) and the
 * computeAcquisition report block (reached through computeRetention).
 * No real DB: AnalyticsEvent.aggregate is stubbed and restored, so this checks the
 * JS post-processing (grouping shape, firstFight counting, sort) but NOT the Mongo
 * pipeline itself, which needs a real server to verify.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const AnalyticsEvent = require("../../models/analyticsEventModel");
const analyticsService = require("../../services/analyticsService");

const { acquisitionMeta } = analyticsService;

// acquisitionMeta

test("acquisitionMeta: valid src only", () => {
    assert.deepEqual(acquisitionMeta({ src: "reddit" }), { src: "reddit" });
});

test("acquisitionMeta: valid src + campaign", () => {
    assert.deepEqual(acquisitionMeta({ src: "reddit", campaign: "launch_1-a" }), { src: "reddit", campaign: "launch_1-a" });
});

test("acquisitionMeta: uppercase is lowercased", () => {
    assert.deepEqual(acquisitionMeta({ src: "Reddit", campaign: "SPRING-Push" }), { src: "reddit", campaign: "spring-push" });
});

test("acquisitionMeta: surrounding whitespace is trimmed, inner whitespace rejects", () => {
    assert.deepEqual(acquisitionMeta({ src: "  ig-bio \n", campaign: "\tx " }), { src: "ig-bio", campaign: "x" });
    assert.deepEqual(acquisitionMeta({ src: "ig bio" }), {});
    assert.deepEqual(acquisitionMeta({ src: "reddit", campaign: "a b" }), { src: "reddit" });
});

test("acquisitionMeta: length boundary 40 ok, 41 rejected, empty rejected", () => {
    const ok = "a".repeat(40);
    assert.deepEqual(acquisitionMeta({ src: ok }), { src: ok });
    assert.deepEqual(acquisitionMeta({ src: "a".repeat(41) }), {});
    assert.deepEqual(acquisitionMeta({ src: "" }), {});
    assert.deepEqual(acquisitionMeta({ src: "   " }), {});
});

test("acquisitionMeta: bad characters rejected", () => {
    for (const bad of ["red.dit", "re/ddit", "red$dit", "r\u00e9dit", "r\u0000", "a\nb", "a;b", "a=b", "\ud83d\ude00"]) {
        assert.deepEqual(acquisitionMeta({ src: bad }), {}, JSON.stringify(bad));
    }
});

test("acquisitionMeta: trailing newline is trimmed, not a regex end-anchor bypass", () => {
    assert.deepEqual(acquisitionMeta({ src: "abc\n" }), { src: "abc" });
    assert.deepEqual(acquisitionMeta({ src: "ab\nc" }), {});
});

test("acquisitionMeta: injection-ish values never pass through", () => {
    assert.deepEqual(acquisitionMeta({ src: { $gt: "" } }), {});
    assert.deepEqual(acquisitionMeta({ src: "<script>" }), {});
    assert.deepEqual(acquisitionMeta({ src: "<script>alert(1)</script>", campaign: "ok" }), {});
    assert.deepEqual(acquisitionMeta({ src: "reddit", campaign: { $ne: null } }), { src: "reddit" });
    assert.deepEqual(acquisitionMeta({ $gt: "" }), {});
    assert.deepEqual(acquisitionMeta({ src: ["reddit"] }), {});
    assert.deepEqual(acquisitionMeta({ src: 123 }), {});
    assert.deepEqual(acquisitionMeta({ src: true }), {});
});

test("acquisitionMeta: only src/campaign keys can appear in the output", () => {
    const out = acquisitionMeta({ src: "reddit", campaign: "x", extra: "y", $set: { a: 1 } });
    assert.deepEqual(out, { src: "reddit", campaign: "x" });
    assert.deepEqual(Object.keys(out), ["src", "campaign"]);
    // JSON.parse yields an own __proto__ key, which must not leak either.
    const parsed = JSON.parse(`{"src":"reddit","__proto__":{"admin":true}}`);
    assert.deepEqual(acquisitionMeta(parsed), { src: "reddit" });
    assert.equal({}.admin, undefined);
});

test("acquisitionMeta: arrays, null, undefined and primitives give {}", () => {
    for (const v of [[], [{ src: "reddit" }], null, undefined, "reddit", 5, true, false, 0, ""]) {
        assert.deepEqual(acquisitionMeta(v), {}, String(v));
    }
});

test("acquisitionMeta: missing src with a valid campaign gives {}", () => {
    assert.deepEqual(acquisitionMeta({ campaign: "launch" }), {});
    assert.deepEqual(acquisitionMeta({ src: "bad!", campaign: "launch" }), {});
    assert.deepEqual(acquisitionMeta({ src: null, campaign: "launch" }), {});
});

test("acquisitionMeta: invalid campaign alone is dropped, valid src kept", () => {
    assert.deepEqual(acquisitionMeta({ src: "reddit", campaign: "<b>" }), { src: "reddit" });
    assert.deepEqual(acquisitionMeta({ src: "reddit", campaign: "" }), { src: "reddit" });
    assert.deepEqual(acquisitionMeta({ src: "reddit", campaign: null }), { src: "reddit" });
});

test("acquisitionMeta: null-prototype object and huge input are handled", () => {
    const nullProto = Object.create(null);
    nullProto.src = "reddit";
    assert.deepEqual(acquisitionMeta(nullProto), { src: "reddit" });
    assert.deepEqual(acquisitionMeta({ src: "a".repeat(1e6) }), {});
});

// computeAcquisition (via computeRetention)

async function withAggregate(fn, body) {
    const real = AnalyticsEvent.aggregate;
    const calls = [];
    AnalyticsEvent.aggregate = async (pipeline) => { calls.push(pipeline); return fn(pipeline); };
    try { return await body(calls); } finally { AnalyticsEvent.aggregate = real; }
}

function isAcqGroup(p) {
    const m = p[0] && p[0].$match;
    return Boolean(m && m.type && Array.isArray(m.type.$in) && m.type.$in.includes("guest_signup"));
}
function isFoughtLookup(p) {
    const m = p[0] && p[0].$match;
    return Boolean(m && m.type === "fight_resolved" && m.userId && m.userId.$in);
}

const FROM = new Date("2026-10-01");
const TO = new Date("2026-10-30");

test("computeRetention: acquisition is a top-level array, [] when no signups", async () => {
    await withAggregate(() => [], async () => {
        const r = await analyticsService.computeRetention(FROM, TO);
        assert.deepEqual(r.acquisition, []);
    });
});

test("computeAcquisition: shape, firstFight distinct users, sort by signups desc", async () => {
    const groups = [
        { _id: { src: "direct", campaign: null }, signups: 1, guests: 0, userIds: ["u9"] },
        { _id: { src: "reddit", campaign: "launch" }, signups: 3, guests: 2, userIds: ["u1", "u2", "u3"] },
        { _id: { src: "reddit", campaign: null }, signups: 2, guests: 0, userIds: ["u4", "u5"] },
    ];
    // Ids may be ObjectId-like: they are compared as strings.
    const fought = [{ _id: { toString: () => "u1" } }, { _id: "u2" }, { _id: "u4" }, { _id: "uNotInRange" }];
    await withAggregate((p) => {
        if (isAcqGroup(p)) return groups;
        if (isFoughtLookup(p)) return fought;
        return [];
    }, async (calls) => {
        const r = await analyticsService.computeRetention(FROM, TO);
        assert.deepEqual(r.acquisition, [
            { src: "reddit", campaign: "launch", signups: 3, guests: 2, firstFight: 2 },
            { src: "reddit", campaign: null, signups: 2, guests: 0, firstFight: 1 },
            { src: "direct", campaign: null, signups: 1, guests: 0, firstFight: 0 },
        ]);
        const lookup = calls.find(isFoughtLookup);
        assert.deepEqual([...lookup[0].$match.userId.$in].sort(), ["u1", "u2", "u3", "u4", "u5", "u9"]);
        const acq = calls.find(isAcqGroup);
        assert.deepEqual([...acq[0].$match.type.$in].sort(), ["guest_signup", "signup"]);
        assert.ok(acq[0].$match.createdAt.$gte instanceof Date && acq[0].$match.createdAt.$lte instanceof Date);
    });
});

test("computeAcquisition: ties sort by src ascending; fight query skipped when no signups", async () => {
    const groups = [
        { _id: { src: "zeta", campaign: null }, signups: 1, guests: 0, userIds: ["a"] },
        { _id: { src: "alpha", campaign: null }, signups: 1, guests: 1, userIds: ["b"] },
    ];
    await withAggregate((p) => (isAcqGroup(p) ? groups : []), async () => {
        const r = await analyticsService.computeRetention(FROM, TO);
        assert.deepEqual(r.acquisition.map((g) => g.src), ["alpha", "zeta"]);
    });
    let fightQueries = 0;
    await withAggregate((p) => { if (isFoughtLookup(p)) fightQueries++; return []; }, async () => {
        await analyticsService.computeRetention(FROM, TO);
        assert.equal(fightQueries, 0);
    });
});

test("acquisitionMeta: a tag literally named \"direct\" counts as untagged", () => {
    assert.deepEqual(acquisitionMeta({ src: "direct", campaign: "x" }), {});
    assert.deepEqual(acquisitionMeta({ src: "Direct" }), {});
});
