/**
 * catalogModel.js is a plain ESM module under frontend/src (no JSX, no
 * i18n), loaded directly with Node's native loader via pathToFileURL, no
 * Vite/bundler needed. Covers the pure helpers behind the Special Moves
 * Catalog view (docs/special-moves-catalog-spec.md).
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePath = path.resolve(__dirname, "../../frontend/src/components/moves/catalogModel.js");

let catalogModel;

test("load catalogModel.js", async () => {
    catalogModel = await import(pathToFileURL(modulePath));
    assert.equal(typeof catalogModel.filterCatalog, "function");
});

// ── Fixtures ─────────────────────────────────────────────────────────────

function move(overrides = {}) {
    return {
        moveId: "MOVE",
        name: "Move",
        rarity: null,
        effectType: "PASSIVE",
        domain: "STRIKING",
        domainLabel: "Striking",
        owned: false,
        isEquipped: false,
        slotIndex: null,
        ...overrides,
    };
}

const CATALOG = [
    move({ moveId: "HEAVY_HANDS", name: "Heavy Hands", effectType: "PASSIVE", domain: "STRIKING", domainLabel: "Striking", owned: true, rarity: "COMMON" }),
    move({ moveId: "DIRTY_BOXING", name: "Dirty Boxing", effectType: "PROC", domain: "STRIKING", domainLabel: "Striking", owned: false }),
    move({ moveId: "SUPERMAN_PUNCH", name: "Superman Punch", effectType: "SIGNATURE", domain: "STRIKING", domainLabel: "Striking", owned: false }),
    move({ moveId: "SPRAWL", name: "Sprawl", effectType: "PROC", domain: "WRESTLING", domainLabel: "Wrestling", owned: true, rarity: "RARE" }),
    move({ moveId: "HIP_ESCAPE", name: "Hip Escape", effectType: "PROC", domain: "BJJ", domainLabel: "BJJ", owned: false }),
    move({ moveId: "GRANITE_JAW", name: "Granite Jaw", effectType: "PASSIVE", domain: "CONDITIONING", domainLabel: "Conditioning", owned: true, rarity: "LEGENDARY" }),
];

// ── filterCatalog ────────────────────────────────────────────────────────

test("filterCatalog: no filters (defaults) returns everything, order preserved", async () => {
    const { filterCatalog } = catalogModel;
    const out = filterCatalog(CATALOG);
    assert.deepEqual(out.map((m) => m.moveId), CATALOG.map((m) => m.moveId));
});

test("filterCatalog: domain alone", async () => {
    const { filterCatalog } = catalogModel;
    const out = filterCatalog(CATALOG, { domain: "STRIKING" });
    assert.deepEqual(out.map((m) => m.moveId), ["HEAVY_HANDS", "DIRTY_BOXING", "SUPERMAN_PUNCH"]);
});

test("filterCatalog: effectType alone", async () => {
    const { filterCatalog } = catalogModel;
    const out = filterCatalog(CATALOG, { effectType: "PROC" });
    assert.deepEqual(out.map((m) => m.moveId), ["DIRTY_BOXING", "SPRAWL", "HIP_ESCAPE"]);
});

test("filterCatalog: ownership alone (OWNED and NOT_OWNED)", async () => {
    const { filterCatalog } = catalogModel;
    const owned = filterCatalog(CATALOG, { ownership: "OWNED" });
    assert.deepEqual(owned.map((m) => m.moveId), ["HEAVY_HANDS", "SPRAWL", "GRANITE_JAW"]);

    const notOwned = filterCatalog(CATALOG, { ownership: "NOT_OWNED" });
    assert.deepEqual(notOwned.map((m) => m.moveId), ["DIRTY_BOXING", "SUPERMAN_PUNCH", "HIP_ESCAPE"]);
});

test("filterCatalog: combined filters (domain + effectType + ownership), order preserved", async () => {
    const { filterCatalog } = catalogModel;
    const out = filterCatalog(CATALOG, { domain: "STRIKING", effectType: "PROC", ownership: "NOT_OWNED" });
    assert.deepEqual(out.map((m) => m.moveId), ["DIRTY_BOXING"]);
});

test("filterCatalog: never sorts, only filters (reversed input stays reversed)", async () => {
    const { filterCatalog } = catalogModel;
    const reversed = [...CATALOG].reverse();
    const out = filterCatalog(reversed, { effectType: "PROC" });
    assert.deepEqual(out.map((m) => m.moveId), ["HIP_ESCAPE", "SPRAWL", "DIRTY_BOXING"]);
});

test("filterCatalog: missing/undefined input treated as empty", async () => {
    const { filterCatalog } = catalogModel;
    assert.deepEqual(filterCatalog(undefined), []);
    assert.deepEqual(filterCatalog(null), []);
});

// ── disciplineOptions ────────────────────────────────────────────────────

test("disciplineOptions: unique, first-seen order", async () => {
    const { disciplineOptions } = catalogModel;
    const out = disciplineOptions(CATALOG);
    assert.deepEqual(out, [
        { value: "STRIKING", label: "Striking" },
        { value: "WRESTLING", label: "Wrestling" },
        { value: "BJJ", label: "BJJ" },
        { value: "CONDITIONING", label: "Conditioning" },
    ]);
});

test("disciplineOptions: empty/missing input", async () => {
    const { disciplineOptions } = catalogModel;
    assert.deepEqual(disciplineOptions([]), []);
    assert.deepEqual(disciplineOptions(undefined), []);
});

// ── groupByDomain ────────────────────────────────────────────────────────

test("groupByDomain: groups consecutive runs, preserves order", async () => {
    const { groupByDomain } = catalogModel;
    const out = groupByDomain(CATALOG);
    assert.deepEqual(out.map((g) => g.domain), ["STRIKING", "WRESTLING", "BJJ", "CONDITIONING"]);
    assert.deepEqual(out[0].moves.map((m) => m.moveId), ["HEAVY_HANDS", "DIRTY_BOXING", "SUPERMAN_PUNCH"]);
    assert.equal(out[0].label, "Striking");
});

test("groupByDomain: a non-consecutive repeat of a domain becomes a separate group (never re-sorts)", async () => {
    const { groupByDomain } = catalogModel;
    const list = [
        move({ moveId: "A", domain: "STRIKING", domainLabel: "Striking" }),
        move({ moveId: "B", domain: "WRESTLING", domainLabel: "Wrestling" }),
        move({ moveId: "C", domain: "STRIKING", domainLabel: "Striking" }),
    ];
    const out = groupByDomain(list);
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((g) => g.domain), ["STRIKING", "WRESTLING", "STRIKING"]);
});

test("groupByDomain: empty input", async () => {
    const { groupByDomain } = catalogModel;
    assert.deepEqual(groupByDomain([]), []);
    assert.deepEqual(groupByDomain(undefined), []);
});

// ── collectedCount ───────────────────────────────────────────────────────

test("collectedCount: owned/total across the full catalog", async () => {
    const { collectedCount } = catalogModel;
    assert.deepEqual(collectedCount(CATALOG), { owned: 3, total: 6 });
});

test("collectedCount: empty catalog", async () => {
    const { collectedCount } = catalogModel;
    assert.deepEqual(collectedCount([]), { owned: 0, total: 0 });
    assert.deepEqual(collectedCount(undefined), { owned: 0, total: 0 });
});

// ── ladderCells ──────────────────────────────────────────────────────────

test("ladderCells: always 4 cells in RARITY order, fully dense ladder (Passive/Proc)", async () => {
    const { ladderCells } = catalogModel;
    const ladder = [
        { rarity: "COMMON", value: 0.02, rating: 20, unit: "Power Rating" },
        { rarity: "UNCOMMON", value: 0.04, rating: 40, unit: "Power Rating" },
        { rarity: "RARE", value: 0.06, rating: 60, unit: "Power Rating" },
        { rarity: "LEGENDARY", value: 0.08, rating: 80, unit: "Power Rating" },
    ];
    const cells = ladderCells(ladder);
    assert.equal(cells.length, 4);
    assert.deepEqual(cells.map((c) => c.rarity), ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]);
    assert.ok(cells.every((c) => c.rung !== null));
    assert.equal(cells[0].rung.rating, 20);
});

test("ladderCells: Signature (Rare + Legendary only) has null Common/Uncommon rungs", async () => {
    const { ladderCells } = catalogModel;
    const ladder = [
        { rarity: "RARE", value: 0.1, rating: 100, unit: "Blitz Rating" },
        { rarity: "LEGENDARY", value: 0.18, rating: 180, unit: "Blitz Rating" },
    ];
    const cells = ladderCells(ladder);
    assert.equal(cells.length, 4);
    assert.equal(cells[0].rarity, "COMMON");
    assert.equal(cells[0].rung, null);
    assert.equal(cells[1].rarity, "UNCOMMON");
    assert.equal(cells[1].rung, null);
    assert.equal(cells[2].rarity, "RARE");
    assert.equal(cells[2].rung.rating, 100);
    assert.equal(cells[3].rarity, "LEGENDARY");
    assert.equal(cells[3].rung.rating, 180);
});

test("ladderCells: missing/empty ladder returns 4 fully-empty cells", async () => {
    const { ladderCells } = catalogModel;
    const cells = ladderCells(undefined);
    assert.equal(cells.length, 4);
    assert.ok(cells.every((c) => c.rung === null));
});

// ── patchCatalogEquipped ─────────────────────────────────────────────────

test("patchCatalogEquipped: null catalog passes through unchanged", async () => {
    const { patchCatalogEquipped } = catalogModel;
    assert.equal(patchCatalogEquipped(null, []), null);
    assert.equal(patchCatalogEquipped(undefined, []), undefined);
});

test("patchCatalogEquipped: sets isEquipped/slotIndex for a newly-equipped move", async () => {
    const { patchCatalogEquipped } = catalogModel;
    const catalog = {
        teachChannel: true,
        moves: [
            move({ moveId: "HEAVY_HANDS", owned: true, isEquipped: false, slotIndex: null }),
            move({ moveId: "SPRAWL", owned: true, isEquipped: false, slotIndex: null }),
        ],
    };
    const equipped = [{ moveId: "HEAVY_HANDS", slotIndex: 0 }];
    const out = patchCatalogEquipped(catalog, equipped);

    const patched = out.moves.find((m) => m.moveId === "HEAVY_HANDS");
    assert.equal(patched.isEquipped, true);
    assert.equal(patched.slotIndex, 0);
});

test("patchCatalogEquipped: clears isEquipped/slotIndex for a move no longer equipped", async () => {
    const { patchCatalogEquipped } = catalogModel;
    const catalog = {
        moves: [
            move({ moveId: "HEAVY_HANDS", owned: true, isEquipped: true, slotIndex: 0 }),
        ],
    };
    const out = patchCatalogEquipped(catalog, []);
    const patched = out.moves.find((m) => m.moveId === "HEAVY_HANDS");
    assert.equal(patched.isEquipped, false);
    assert.equal(patched.slotIndex, null);
});

test("patchCatalogEquipped: unchanged entries keep object identity, changed entries are new objects", async () => {
    const { patchCatalogEquipped } = catalogModel;
    const heavyHands = move({ moveId: "HEAVY_HANDS", owned: true, isEquipped: false, slotIndex: null });
    const sprawl = move({ moveId: "SPRAWL", owned: true, isEquipped: false, slotIndex: null });
    const catalog = { moves: [heavyHands, sprawl] };

    const out = patchCatalogEquipped(catalog, [{ moveId: "HEAVY_HANDS", slotIndex: 1 }]);

    const patchedHeavyHands = out.moves.find((m) => m.moveId === "HEAVY_HANDS");
    const untouchedSprawl = out.moves.find((m) => m.moveId === "SPRAWL");

    assert.notEqual(patchedHeavyHands, heavyHands); // changed -> new object
    assert.equal(untouchedSprawl, sprawl); // unchanged -> same identity
});

test("patchCatalogEquipped: does not mutate the input catalog or its moves", async () => {
    const { patchCatalogEquipped } = catalogModel;
    const heavyHands = move({ moveId: "HEAVY_HANDS", owned: true, isEquipped: false, slotIndex: null });
    const catalog = { moves: [heavyHands] };
    const snapshotMoves = catalog.moves;
    const snapshotMove = { ...heavyHands };

    patchCatalogEquipped(catalog, [{ moveId: "HEAVY_HANDS", slotIndex: 2 }]);

    assert.equal(catalog.moves, snapshotMoves); // array reference untouched
    assert.deepEqual(heavyHands, snapshotMove); // original move object untouched
});

test("patchCatalogEquipped: re-running with the same equipped state keeps every entry's identity (idempotent)", async () => {
    const { patchCatalogEquipped } = catalogModel;
    const heavyHands = move({ moveId: "HEAVY_HANDS", owned: true, isEquipped: true, slotIndex: 0 });
    const catalog = { moves: [heavyHands] };

    const out = patchCatalogEquipped(catalog, [{ moveId: "HEAVY_HANDS", slotIndex: 0 }]);
    assert.equal(out.moves[0], heavyHands);
});
