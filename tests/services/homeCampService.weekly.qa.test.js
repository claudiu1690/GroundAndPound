/**
 * Your Camp PHASE 1 — the weekly wage/morale tick. THIS IS THE CODE PATH THAT MOVES MONEY.
 *
 * `applyWeeklyTick` is exercised against a hand-built camp double and a stubbed
 * Fighter.updateOne, so the wage arithmetic, the morale rules and the quit rules are all
 * asserted without a database. (The claim-then-charge mutex in `runWeeklyCampBatch` is
 * verified live against Mongo — a compare-and-set has nothing to prove in a stub.)
 *
 * Run with: node --test tests/services/homeCampService.weekly.qa.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const Fighter = require("../../models/fighterModel");
const homeCampService = require("../../services/homeCampService");
const {
    homeCampWeekStart,
    CONDITION_UNPAID_MAX_MULT,
} = require("../../consts/homeCampConfig");

const WEEK = 2951;
const weekStart = homeCampWeekStart(WEEK).getTime();
const LONG_AGO = new Date(weekStart - 30 * 86_400_000);

/** A stand-in wallet: replaces Fighter.updateOne for the duration of one tick. */
function withWallet(startingIron, fn) {
    const realUpdate = Fighter.updateOne;
    const wallet = { iron: startingIron, charges: [] };
    Fighter.updateOne = async (filter, update) => {
        const need = filter.iron && filter.iron.$gte;
        const delta = -update.$inc.iron;
        if (wallet.iron < need) return { modifiedCount: 0 };
        wallet.iron -= delta;
        wallet.charges.push(delta);
        return { modifiedCount: 1 };
    };
    return Promise.resolve(fn(wallet)).finally(() => { Fighter.updateOne = realUpdate; });
}

function coach(over = {}) {
    return {
        _id: over._id || `c${Math.random()}`,
        name: "Coach", archetype: "WRESTLING", traitKey: null, rank: 1,
        wage: 300, morale: 100, hiredAt: LONG_AGO, lastSessionAt: null, ...over,
    };
}

function fakeCamp(coaches, over = {}) {
    const arr = coaches;
    arr.pull = (id) => {
        const i = arr.findIndex((c) => String(c._id) === String(id));
        if (i >= 0) arr.splice(i, 1);
    };
    return {
        _id: "camp1", fighterId: "fighter1", coaches: arr,
        condition: { value: 100 },
        consecutiveUnpaidWeeks: 0, lastWageDebit: null, nextWageDebitAt: null,
        disciplineFamiliarity: {},
        markModified() { this._marked = true; },
        saved: 0,
        async save() { this.saved += 1; },
        ...over,
    };
}

// ── First sight ──────────────────────────────────────────────────────────────

test("FIRST SIGHT (lastWeeklyTickIndex < 0): no back pay, no retro-morale, just a schedule", async () => {
    await withWallet(10_000, async (wallet) => {
        const camp = fakeCamp([coach({ morale: 100 }), coach({ morale: 100 })]);
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, -1);
        assert.deepEqual(r, { weeks: 0, paid: 0, unpaid: 0, quit: [] });
        assert.equal(wallet.iron, 10_000, "a migrated camp must never be charged for history");
        assert.equal(camp.coaches[0].morale, 100);
        assert.equal(camp.nextWageDebitAt.toISOString(), homeCampWeekStart(WEEK + 1).toISOString());
        assert.equal(camp.saved, 1);
    });
});

// ── Wages ────────────────────────────────────────────────────────────────────

test("one owed week charges the summed wage bill exactly once", async () => {
    await withWallet(10_000, async (wallet) => {
        const camp = fakeCamp([coach({ wage: 300 }), coach({ wage: 750 })]);
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.deepEqual(wallet.charges, [1050]);
        assert.equal(wallet.iron, 8950);
        assert.equal(r.paid, 1);
        assert.equal(camp.lastWageDebit.amount, 1050);
        assert.equal(camp.lastWageDebit.paid, true);
        assert.equal(camp.consecutiveUnpaidWeeks, 0);
    });
});

test("a wage-free roster (starter only) is 'paid' without touching the wallet", async () => {
    await withWallet(0, async (wallet) => {
        const camp = fakeCamp([coach({ wage: 0, lastSessionAt: new Date(weekStart + 1000) })]);
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.deepEqual(wallet.charges, []);
        assert.equal(r.unpaid, 0);
        assert.equal(camp.coaches[0].morale, 100, "no bill, no session gap → no morale loss");
    });
});

test("wages are ALL-OR-NOTHING: a short wallet is never partially drained or driven negative", async () => {
    await withWallet(500, async (wallet) => {
        const camp = fakeCamp([coach({ wage: 300 }), coach({ wage: 750 })]);
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(wallet.iron, 500, "nothing may be taken when the full bill can't be met");
        assert.equal(r.unpaid, 1);
        assert.equal(camp.lastWageDebit.paid, false);
        assert.equal(camp.consecutiveUnpaidWeeks, 1);
    });
});

test("a catch-up is bounded at 8 weeks — a returning player's bill can't be unlimited", async () => {
    await withWallet(1_000_000, async (wallet) => {
        const camp = fakeCamp([coach({ wage: 100, lastSessionAt: new Date() })]);
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 40);
        assert.equal(r.weeks, 8);
        assert.equal(wallet.charges.length, 8);
        assert.equal(wallet.iron, 1_000_000 - 800);
    });
});

// ── Condition ────────────────────────────────────────────────────────────────

test("unpaid weeks compound the condition penalty and cap at −20/week, never below 0", async () => {
    await withWallet(0, async () => {
        const camp = fakeCamp([coach({ wage: 300 })], { condition: { value: 100 } });
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(camp.condition.value, 95);      // −5 × 1

        camp.condition.value = 100;
        await homeCampService.applyWeeklyTick(camp, WEEK + 1, WEEK);
        assert.equal(camp.condition.value, 90);      // −5 × 2
        assert.equal(camp.consecutiveUnpaidWeeks, 2);

        // Far into the spiral the multiplier stops at 4.
        camp.consecutiveUnpaidWeeks = 20;
        camp.condition.value = 100;
        await homeCampService.applyWeeklyTick(camp, WEEK + 2, WEEK + 1);
        assert.equal(camp.condition.value, 100 - 5 * CONDITION_UNPAID_MAX_MULT);

        camp.condition.value = 3;
        await homeCampService.applyWeeklyTick(camp, WEEK + 3, WEEK + 2);
        assert.equal(camp.condition.value, 0, "condition floors at 0");
    });
});

test("a PAID week costs no condition", async () => {
    await withWallet(10_000, async () => {
        const camp = fakeCamp([coach({ wage: 300, lastSessionAt: new Date() })], { condition: { value: 60 } });
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(camp.condition.value, 60);
    });
});

// ── Morale ───────────────────────────────────────────────────────────────────

test("an ACTIVE, PAID-UP player loses no morale at all — the whole design promise", async () => {
    await withWallet(10_000, async () => {
        const used = new Date(weekStart + 3 * 86_400_000);   // trained mid-week
        const camp = fakeCamp([coach({ lastSessionAt: used }), coach({ lastSessionAt: used })]);
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.deepEqual(camp.coaches.map((c) => c.morale), [100, 100]);
    });
});

test("unpaid (−5) and unused (−3) stack, and a squalid camp (<20 condition) doubles them", async () => {
    await withWallet(0, async () => {
        const healthy = fakeCamp([coach({ wage: 300 })], { condition: { value: 50 } });
        await homeCampService.applyWeeklyTick(healthy, WEEK, WEEK - 1);
        assert.equal(healthy.coaches[0].morale, 92);         // 100 − 8

        const squalid = fakeCamp([coach({ wage: 300 })], { condition: { value: 19 } });
        await homeCampService.applyWeeklyTick(squalid, WEEK, WEEK - 1);
        assert.equal(squalid.coaches[0].morale, 84);         // 100 − 16
    });
});

test("a coach hired DURING the week isn't blamed for not being used in it", async () => {
    await withWallet(10_000, async () => {
        const camp = fakeCamp([coach({ hiredAt: new Date(weekStart + 86_400_000), lastSessionAt: null })]);
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(camp.coaches[0].morale, 100);
    });
});

test("Taskmaster loses his own point every week, paid or not", async () => {
    await withWallet(10_000, async () => {
        const camp = fakeCamp([
            coach({ _id: "t", traitKey: "TASKMASTER", lastSessionAt: new Date() }),
            coach({ _id: "n", lastSessionAt: new Date() }),
        ]);
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(camp.coaches[0].morale, 99);
        assert.equal(camp.coaches[1].morale, 100);
    });
});

test("Locker-Room Leader gives +2 to the OTHERS (not himself), and the bonus is never doubled", async () => {
    await withWallet(0, async () => {
        const camp = fakeCamp([
            coach({ _id: "lrl", traitKey: "LOCKER_ROOM_LEADER", wage: 300 }),
            coach({ _id: "other", wage: 0 }),
        ], { condition: { value: 10 } });   // <20 → negatives doubled
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        // Both: (−5 unpaid − 3 unused) × 2 = −16. The other also gets +2, undoubled.
        assert.equal(camp.coaches[0].morale, 84);
        assert.equal(camp.coaches[1].morale, 86);
    });
});

test("Loyal never falls below his floor of 40", async () => {
    await withWallet(0, async () => {
        const camp = fakeCamp([coach({ traitKey: "LOYAL", morale: 45, wage: 300 }), coach({ wage: 0 })]);
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(camp.coaches[0].morale, 40);
    });
});

// ── Quits ────────────────────────────────────────────────────────────────────

test("a coach at 0 morale walks — with NO firing penalties attached", async () => {
    await withWallet(0, async () => {
        const camp = fakeCamp([
            coach({ _id: "quitter", name: "Walker", morale: 5, wage: 300, rank: 2 }),
            coach({ _id: "stays", morale: 100, wage: 0, lastSessionAt: new Date() }),
        ], { condition: { value: 50 }, market: { slotCooldownUntil: null } });

        const conditionBefore = camp.condition.value;
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);

        assert.equal(r.quit.length, 1);
        assert.equal(camp.coaches.length, 1);
        assert.equal(camp.coaches[0]._id, "stays");
        assert.equal(camp.condition.value, conditionBefore - 5, "only the unpaid-week hit, no −15 fire penalty");
        // He shares the unpaid-week hit (−5) and nothing else: no −10 "someone left" penalty.
        assert.equal(camp.coaches[0].morale, 95, "the others take no firing morale hit for a quit");
        assert.deepEqual(camp.disciplineFamiliarity, {}, "rank 2 banks nothing");
    });
});

test("a rank-3+ quitter banks his discipline for the replacement", async () => {
    await withWallet(0, async () => {
        const camp = fakeCamp([
            coach({ _id: "q", morale: 1, wage: 300, rank: 3, archetype: "BJJ" }),
            coach({ _id: "s", morale: 100, wage: 0, lastSessionAt: new Date() }),
        ]);
        await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.deepEqual(camp.disciplineFamiliarity.BJJ, { bankedSessions: 12, bankedWins: 2 });
        assert.ok(camp._marked, "the Mixed field must be flagged or the bank never persists");
    });
});

test("THE LAST COACH NEVER QUITS — morale floors at 1 instead of leaving the camp empty", async () => {
    await withWallet(0, async () => {
        const camp = fakeCamp([coach({ morale: 2, wage: 300 })], { condition: { value: 5 } });
        const r = await homeCampService.applyWeeklyTick(camp, WEEK, WEEK - 1);
        assert.equal(r.quit.length, 0);
        assert.equal(camp.coaches.length, 1);
        assert.equal(camp.coaches[0].morale, 1);

        // ...and it stays survivable no matter how many more weeks of neglect follow.
        await homeCampService.applyWeeklyTick(camp, WEEK + 5, WEEK);
        assert.equal(camp.coaches.length, 1);
        assert.equal(camp.coaches[0].morale, 1);
    });
});
