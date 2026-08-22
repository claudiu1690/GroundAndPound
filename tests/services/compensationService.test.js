/**
 * Gym-retirement compensation invariants.
 *
 * This is a public promise paid in a currency that is also sold for real money, so the two
 * properties that matter are: nobody is paid twice, and nobody silently loses drinks to the
 * inventory cap without it being recorded.
 *
 * Mongo-free, in the style of paymentService.test.js: the unique-index claim and the clamping
 * pipeline update are modelled by fakes that reproduce the one behaviour each is relied on for.
 */
process.env.LOCAL_MODE = "true";

const test = require("node:test");
const assert = require("node:assert");

const { SOFT_CAP } = require("../../consts/shopConfig");
const {
    GYM_RETIREMENT_CAMPAIGN,
    GYM_RETIREMENT_DRINKS,
} = require("../../services/compensationService");

test("C1 the campaign constants are stable and sane", () => {
    // The campaign key is written into every ledger row. Changing it after the run would make
    // every already-paid fighter look unpaid, and a re-run would pay them all a second time.
    assert.equal(GYM_RETIREMENT_CAMPAIGN, "gym-retirement-1.6");
    assert.ok(Number.isInteger(GYM_RETIREMENT_DRINKS), "drinks must be an integer");
    assert.ok(GYM_RETIREMENT_DRINKS > 0, "a compensation of zero is not compensation");
    assert.ok(GYM_RETIREMENT_DRINKS <= SOFT_CAP, "cannot promise more than the inventory holds");
});

// ── the claim ───────────────────────────────────────────────────────────────
// Models the unique {fighterId, campaign} index: the first insert wins, the rest throw E11000.
function fakeLedger() {
    const rows = new Map();
    return {
        rows,
        async create({ fighterId, campaign, drinks }) {
            const key = `${fighterId}:${campaign}`;
            if (rows.has(key)) {
                const e = new Error("E11000 duplicate key");
                e.code = 11000;
                throw e;
            }
            const row = { fighterId, campaign, drinks, granted: null, grantedAt: null };
            rows.set(key, row);
            return row;
        },
        async findOne({ fighterId, campaign }) {
            return rows.get(`${fighterId}:${campaign}`) || null;
        },
    };
}

/** Reproduces the $min/$add pipeline update and returns the pre-update value. */
function fakeInventory(startingDrinks) {
    const doc = { energyDrinks: startingDrinks };
    return {
        doc,
        async bump(amount) {
            const had = doc.energyDrinks;
            doc.energyDrinks = Math.min(had + amount, SOFT_CAP);
            return had;
        },
    };
}

/** The service's grantCampaign, reduced to its ordering and arithmetic. */
async function grant(ledger, inv, fighterId, drinks) {
    let row;
    try {
        row = await ledger.create({ fighterId, campaign: GYM_RETIREMENT_CAMPAIGN, drinks });
    } catch (err) {
        if (err.code !== 11000) throw err;
        row = await ledger.findOne({ fighterId, campaign: GYM_RETIREMENT_CAMPAIGN });
        if (!row || row.grantedAt) return { granted: 0, status: "already_granted" };
    }
    const had = await inv.bump(drinks);
    const granted = Math.max(0, Math.min(drinks, SOFT_CAP - had));
    row.granted = granted;
    row.grantedAt = new Date();
    return { granted, status: granted < drinks ? "capped" : "granted" };
}

test("C2 a fighter is paid exactly once, however many times the script runs", async () => {
    const ledger = fakeLedger();
    const inv = fakeInventory(0);

    const first = await grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS);
    const second = await grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS);
    const third = await grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS);

    assert.equal(first.status, "granted");
    assert.equal(second.status, "already_granted");
    assert.equal(third.status, "already_granted");
    assert.equal(inv.doc.energyDrinks, GYM_RETIREMENT_DRINKS, "inventory reflects one payment only");
});

test("C3 concurrent runs cannot both pay the same fighter", async () => {
    const ledger = fakeLedger();
    const inv = fakeInventory(0);

    const results = await Promise.all([
        grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS),
        grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS),
        grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS),
        grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS),
    ]);

    const paid = results.filter((r) => r.status !== "already_granted");
    assert.equal(paid.length, 1, "exactly one attempt may pay");
    assert.equal(inv.doc.energyDrinks, GYM_RETIREMENT_DRINKS);
});

test("C4 a run interrupted between claiming and paying is completed by the next run", async () => {
    const ledger = fakeLedger();
    const inv = fakeInventory(0);

    // Simulate the crash: the claim landed, the drinks never did.
    await ledger.create({ fighterId: "f1", campaign: GYM_RETIREMENT_CAMPAIGN, drinks: GYM_RETIREMENT_DRINKS });
    assert.equal(inv.doc.energyDrinks, 0, "precondition: nothing was paid");

    const retry = await grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS);

    assert.equal(retry.status, "granted", "the unstamped claim must be honoured, not skipped");
    assert.equal(inv.doc.energyDrinks, GYM_RETIREMENT_DRINKS);

    // ...and still only once.
    const after = await grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS);
    assert.equal(after.status, "already_granted");
    assert.equal(inv.doc.energyDrinks, GYM_RETIREMENT_DRINKS);
});

test("C5 the inventory cap clamps the payment and never overflows or goes backwards", async () => {
    const cases = [
        { had: 0,            expect: GYM_RETIREMENT_DRINKS },
        { had: SOFT_CAP - 5, expect: GYM_RETIREMENT_DRINKS },
        { had: SOFT_CAP - 2, expect: 2 },
        { had: SOFT_CAP - 1, expect: 1 },
        { had: SOFT_CAP,     expect: 0 },
    ];
    for (const c of cases) {
        const ledger = fakeLedger();
        const inv = fakeInventory(c.had);
        const r = await grant(ledger, inv, `f-${c.had}`, GYM_RETIREMENT_DRINKS);
        assert.equal(r.granted, c.expect, `had ${c.had} → granted`);
        assert.equal(inv.doc.energyDrinks, Math.min(c.had + GYM_RETIREMENT_DRINKS, SOFT_CAP), `had ${c.had} → total`);
        assert.ok(inv.doc.energyDrinks <= SOFT_CAP, "must never exceed the cap");
        assert.ok(inv.doc.energyDrinks >= c.had, "must never reduce a player's drinks");
    }
});

test("C6 a clamped payment records what actually landed, not what was promised", async () => {
    const ledger = fakeLedger();
    const inv = fakeInventory(SOFT_CAP - 1);
    const r = await grant(ledger, inv, "f1", GYM_RETIREMENT_DRINKS);

    const row = await ledger.findOne({ fighterId: "f1", campaign: GYM_RETIREMENT_CAMPAIGN });
    assert.equal(r.status, "capped");
    assert.equal(row.drinks, GYM_RETIREMENT_DRINKS, "intent is preserved");
    assert.equal(row.granted, 1, "reality is recorded separately");
    assert.notEqual(row.drinks, row.granted, "the two must be distinguishable for support");
});

test("C7 the feed event type is registered — an unknown type is dropped silently", () => {
    // activityLogModel's enum is strict and a missing value makes the write vanish, which would
    // leave players with unexplained drinks and no note saying where they came from.
    const ActivityLog = require("../../models/activityLogModel");
    const allowed = ActivityLog.schema.path("type").enumValues;
    assert.ok(allowed.includes("GYM_COMPENSATION"), "GYM_COMPENSATION must be an allowed log type");
});
