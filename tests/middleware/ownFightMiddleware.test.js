/**
 * ownFightParam(paramName): fight-scoped ownership guard for /fights/camp/:fightId/...
 * No DB: Fight.findById is stubbed with a select().lean() chain. Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fight = require("../../models/fightModel");
const { ownFightParam } = require("../../middleware/ownFightMiddleware");

const FIGHT_ID = "64b7f0c2a1b2c3d4e5f60718";
const OWN = "64b7f0c2a1b2c3d4e5f60001";
const OTHER = "64b7f0c2a1b2c3d4e5f60002";

function mockRes() {
    const res = { statusCode: null, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

/** Stub Fight.findById; `result` is a value or a function returning a value or throwing. */
async function withFindById(result, body) {
    const original = Fight.findById;
    const calls = [];
    Fight.findById = (id) => {
        const call = { id, select: null, lean: false };
        calls.push(call);
        const chain = {
            select(sel) { call.select = sel; return chain; },
            async lean() {
                call.lean = true;
                return typeof result === "function" ? result() : result;
            },
        };
        return chain;
    };
    try {
        return await body(calls);
    } finally {
        Fight.findById = original;
    }
}

async function run(req) {
    const guard = ownFightParam("fightId");
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
}

test("ownFightParam returns a function named ownFightParamGuard", () => {
    assert.equal(ownFightParam("fightId").name, "ownFightParamGuard");
});

test("malformed fightId values are 404 and never reach Fight.findById", async () => {
    const bad = ["abc", "abcdefghijkl", { $ne: null }, [FIGHT_ID], "", undefined, `${FIGHT_ID}0`, "zzzzzzzzzzzzzzzzzzzzzzzz"];
    for (const id of bad) {
        // eslint-disable-next-line no-await-in-loop
        await withFindById({ fighterId: OWN }, async (calls) => {
            const { res, nextCalled } = await run({ user: { fighterId: OWN }, params: { fightId: id } });
            assert.equal(nextCalled, false, `next for ${JSON.stringify(id)}`);
            assert.equal(res.statusCode, 404, `status for ${JSON.stringify(id)}`);
            assert.deepEqual(res.body, { message: "Fight not found" });
            assert.equal(calls.length, 0, `findById called for ${JSON.stringify(id)}`);
        });
    }
});

test("no fighter on req.user is 403 with no DB call", async () => {
    for (const user of [undefined, {}, { fighterId: null }, { fighterId: "" }]) {
        // eslint-disable-next-line no-await-in-loop
        await withFindById({ fighterId: OWN }, async (calls) => {
            const { res, nextCalled } = await run({ user, params: { fightId: FIGHT_ID } });
            assert.equal(nextCalled, false);
            assert.equal(res.statusCode, 403);
            assert.deepEqual(res.body, { message: "Forbidden: no fighter linked to this account" });
            assert.equal(calls.length, 0);
        });
    }
});

test("a fight that does not exist is 404", async () => {
    await withFindById(null, async (calls) => {
        const { res, nextCalled } = await run({ user: { fighterId: OWN }, params: { fightId: FIGHT_ID } });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { message: "Fight not found" });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].id, FIGHT_ID);
    });
});

test("another fighter's fight is 403 with the exact message", async () => {
    await withFindById({ _id: FIGHT_ID, fighterId: OTHER }, async () => {
        const { res, nextCalled } = await run({ user: { fighterId: OWN }, params: { fightId: FIGHT_ID } });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.deepEqual(res.body, { message: "Forbidden: you can only act on your own fighter" });
    });
});

test("a fight with no fighterId is 403", async () => {
    await withFindById({ _id: FIGHT_ID, fighterId: null }, async () => {
        const { res, nextCalled } = await run({ user: { fighterId: OWN }, params: { fightId: FIGHT_ID } });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
    });
});

test("the owner passes through with next() and nothing attached to req", async () => {
    // An ObjectId-like value on the fight compares by string.
    const fighterIdObj = { toString: () => OWN };
    await withFindById({ _id: FIGHT_ID, fighterId: fighterIdObj }, async (calls) => {
        const req = { user: { fighterId: OWN }, params: { fightId: FIGHT_ID } };
        const before = Object.keys(req).sort();
        const { res, nextCalled } = await run(req);
        assert.equal(nextCalled, true);
        assert.equal(res.statusCode, null);
        assert.deepEqual(Object.keys(req).sort(), before);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].id, FIGHT_ID);
        assert.equal(calls[0].select, "fighterId");
        assert.equal(calls[0].lean, true);
    });
});

test("the guard reads the configured param name", async () => {
    await withFindById({ fighterId: OWN }, async (calls) => {
        const guard = ownFightParam("id");
        let ok = false;
        await guard({ user: { fighterId: OWN }, params: { id: FIGHT_ID, fightId: "nope" } }, mockRes(), () => { ok = true; });
        assert.equal(ok, true);
        assert.equal(calls[0].id, FIGHT_ID);
    });
});

test("a DB error is 500 with a generic message and is logged", async () => {
    const orig = console.error;
    const logged = [];
    console.error = (...a) => { logged.push(a); };
    try {
        await withFindById(() => { throw new Error("E11000 secret mongo detail"); }, async () => {
            const { res, nextCalled } = await run({ user: { fighterId: OWN }, params: { fightId: FIGHT_ID } });
            assert.equal(nextCalled, false);
            assert.equal(res.statusCode, 500);
            assert.deepEqual(res.body, { message: "Internal server error" });
        });
    } finally {
        console.error = orig;
    }
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "[ownFightParam]");
});
