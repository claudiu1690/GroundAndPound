/**
 * Shop redesign: the client analytics beacon whitelist (analyticsService.sanitizeClientEvent /
 * trackClientEvent). Hostile input: unknown types, server-only types, wrong meta shapes and
 * out-of-range numbers are rejected; extra keys are dropped. No DB: track is stubbed.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const analyticsService = require("../../services/analyticsService");
const AnalyticsEvent = require("../../models/analyticsEventModel");

const { CLIENT_EVENT_TYPES, sanitizeClientEvent } = analyticsService;

async function withStub(obj, key, impl, body) {
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const original = obj[key];
    obj[key] = impl;
    try {
        return await body();
    } finally {
        if (had) obj[key] = original;
        else delete obj[key];
    }
}

test("the whitelist is exactly the three client events, and all are in the model enum", () => {
    assert.deepEqual([...CLIENT_EVENT_TYPES].sort(), ["energy_offer_choice", "energy_offer_shown", "premium_panel_expanded"]);
    const allowed = new Set(AnalyticsEvent.schema.path("type").enumValues);
    for (const t of CLIENT_EVENT_TYPES) assert.ok(allowed.has(t), t);
    assert.ok(allowed.has("premium_panel_shown"), "server-side event is in the enum too");
});

test("premium_panel_shown and other server types are not accepted from the client", () => {
    for (const type of ["premium_panel_shown", "signup", "purchase_fulfilled", "fight_resolved"]) {
        assert.equal(sanitizeClientEvent(type, { reason: "first_visit" }), null, type);
    }
});

test("unknown, non-string and prototype type names are rejected", () => {
    for (const type of [undefined, null, 42, {}, [], "", "toString", "__proto__", "constructor", "hasOwnProperty", "PREMIUM_PANEL_EXPANDED"]) {
        assert.equal(sanitizeClientEvent(type, { from: "bar" }), null, String(type));
    }
});

test("meta must be a plain object", () => {
    for (const meta of [undefined, null, "bar", 5, true, ["bar"]]) {
        assert.equal(sanitizeClientEvent("premium_panel_expanded", meta), null, JSON.stringify(meta));
    }
});

test("premium_panel_expanded: from is one of four; extras dropped", () => {
    for (const from of ["bar", "chip", "offer", "purchase_return"]) {
        assert.deepEqual(sanitizeClientEvent("premium_panel_expanded", { from, evil: "<script>", $where: 1 }),
            { type: "premium_panel_expanded", meta: { from } });
    }
    for (const from of [undefined, "", "BAR", "menu", 1, { $ne: null }]) {
        assert.equal(sanitizeClientEvent("premium_panel_expanded", { from }), null, String(from));
    }
});

test("energy_offer_shown: source enum, need 1..100, have 0..100, integers only", () => {
    assert.deepEqual(sanitizeClientEvent("energy_offer_shown", { source: "pvp", need: 15, have: 4, x: 1 }),
        { type: "energy_offer_shown", meta: { source: "pvp", need: 15, have: 4 } });
    for (const source of ["pvp", "fight", "camp", "fightcamp"]) {
        assert.ok(sanitizeClientEvent("energy_offer_shown", { source, need: 1, have: 0 }), source);
        assert.ok(sanitizeClientEvent("energy_offer_shown", { source, need: 100, have: 100 }), source);
    }
    const bad = [
        { source: "gym", need: 15, have: 4 },
        { source: "pvp", need: 0, have: 4 },
        { source: "pvp", need: 101, have: 4 },
        { source: "pvp", need: 15, have: -1 },
        { source: "pvp", need: 15, have: 101 },
        { source: "pvp", need: 15.5, have: 4 },
        { source: "pvp", need: "15", have: 4 },
        { source: "pvp", need: 15 },
        { source: "pvp", need: NaN, have: 4 },
        { need: 15, have: 4 },
    ];
    for (const meta of bad) assert.equal(sanitizeClientEvent("energy_offer_shown", meta), null, JSON.stringify(meta));
});

test("energy_offer_choice: source and choice enums", () => {
    for (const choice of ["wait", "use_shot", "buy_use_shot", "use_drink", "see_bundles", "dismiss"]) {
        assert.deepEqual(sanitizeClientEvent("energy_offer_choice", { source: "fight", choice, need: 3 }),
            { type: "energy_offer_choice", meta: { source: "fight", choice } });
    }
    assert.equal(sanitizeClientEvent("energy_offer_choice", { source: "fight", choice: "buy_drink" }), null);
    assert.equal(sanitizeClientEvent("energy_offer_choice", { source: "shop", choice: "wait" }), null);
    assert.equal(sanitizeClientEvent("energy_offer_choice", { choice: "wait" }), null);
});

test("inherited values do not satisfy a required key", () => {
    const meta = Object.create({ from: "bar" });
    assert.equal(sanitizeClientEvent("premium_panel_expanded", meta), null);
    const polluted = JSON.parse('{"__proto__": {"from": "bar"}}');
    assert.equal(sanitizeClientEvent("premium_panel_expanded", polluted), null);
});

test("trackClientEvent writes the CLEAN event through track with the fighterId", async () => {
    const calls = [];
    await withStub(analyticsService, "track", async (...a) => { calls.push(a); }, async () => {
        await analyticsService.trackClientEvent("u1", "f1", "energy_offer_shown", { source: "camp", need: 6, have: 2, junk: "x" });
    });
    assert.deepEqual(calls, [["u1", "energy_offer_shown", { source: "camp", need: 6, have: 2 }, { fighterId: "f1" }]]);
});

test("trackClientEvent throws invalid_event and writes nothing on a bad event", async () => {
    const calls = [];
    await withStub(analyticsService, "track", async (...a) => { calls.push(a); }, async () => {
        assert.throws(() => analyticsService.trackClientEvent("u1", "f1", "premium_panel_shown", { reason: "first_visit" }),
            (e) => e.code === "invalid_event");
        assert.throws(() => analyticsService.trackClientEvent("u1", "f1", "energy_offer_choice", { source: "pvp" }),
            (e) => e.code === "invalid_event");
    });
    assert.deepEqual(calls, []);
});
