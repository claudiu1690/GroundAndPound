/**
 * PUT /fighters/:id (fighterController.update) accepts a nickname and nothing else.
 * Every rejected body must 400 with its code and never reach the service.
 *
 * No Express, no DB: fighterService.updateFighter is stubbed and a minimal res double
 * records status and body. Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fighterController = require("../../controllers/fighterController");
const fighterService = require("../../services/fighterService");

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

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

function req(body) {
    return { params: { id: "f1" }, body, user: { id: "u1", fighterId: "f1" } };
}

/** Run update with a recording service stub. Returns { res, calls }. */
async function run(body, impl) {
    const calls = [];
    const res = mockRes();
    await withStub(fighterService, "updateFighter", async (...a) => {
        calls.push(a);
        return impl ? impl(...a) : { _id: "f1", nickname: a[1].nickname };
    }, () => fighterController.update(req(body), res));
    return { res, calls };
}

async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

test("a non-object body is 400 invalid_body", async () => {
    for (const body of [null, undefined, "nickname", 42, true, ["nickname"]]) {
        // eslint-disable-next-line no-await-in-loop
        const { res, calls } = await run(body);
        assert.equal(res.statusCode, 400, JSON.stringify(body));
        assert.equal(res.body.code, "invalid_body");
        assert.equal(typeof res.body.message, "string");
        assert.equal(calls.length, 0);
    }
});

test("any field other than nickname is 400 unknown_fields and the service is not called", async () => {
    const cases = [
        [{ iron: 9999 }, ["iron"]],
        [{ stats: {} }, ["stats"]],
        [{ promotionTier: "GCS" }, ["promotionTier"]],
        [{ offerBoard: {} }, ["offerBoard"]],
        [{ gymId: null }, ["gymId"]],
        [{ nickname: "Bones", iron: 1, energy: 100 }, ["iron", "energy"]],
    ];
    for (const [body, fields] of cases) {
        // eslint-disable-next-line no-await-in-loop
        const { res, calls } = await run(body);
        assert.equal(res.statusCode, 400, JSON.stringify(body));
        assert.deepEqual(res.body, {
            message: `Unknown field(s): ${fields.join(", ")}`,
            code: "unknown_fields",
            fields,
        });
        assert.equal(calls.length, 0);
    }
});

test("an empty object is 400 no_fields", async () => {
    const { res, calls } = await run({});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "no_fields");
    assert.equal(calls.length, 0);
});

test("invalid nicknames are 400 invalid_nickname", async () => {
    for (const nickname of [5, null, {}, "x", "a".repeat(21), "<script>", "Big  Bad", "Bones!", "Mr. T"]) {
        // eslint-disable-next-line no-await-in-loop
        const { res, calls } = await run({ nickname });
        assert.equal(res.statusCode, 400, JSON.stringify(nickname));
        assert.equal(res.body.code, "invalid_nickname");
        assert.equal(typeof res.body.message, "string");
        assert.equal(calls.length, 0);
    }
});

test("a profane nickname is 400 invalid_nickname with the profanity filter's message", async () => {
    const { res, calls } = await run({ nickname: "Shit Kicker" });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
        message: "Nickname contains language that isn't allowed. Please choose another.",
        code: "invalid_nickname",
    });
    assert.equal(calls.length, 0);
});

test("a valid nickname is trimmed and is the only thing passed to the service", async () => {
    const { res, calls } = await run({ nickname: "  Bones  " });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [["f1", { nickname: "Bones" }]]);
    assert.deepEqual(res.body, { _id: "f1", nickname: "Bones" });
});

test("the allowed punctuation passes at both length bounds", async () => {
    for (const nickname of ["Jo", "The O'Neil-Jr 2", "a".repeat(20)]) {
        // eslint-disable-next-line no-await-in-loop
        const { res, calls } = await run({ nickname });
        assert.equal(res.statusCode, 200, nickname);
        assert.deepEqual(calls, [["f1", { nickname }]]);
    }
});

test("an empty or blank nickname clears it (null)", async () => {
    for (const nickname of ["", "   "]) {
        // eslint-disable-next-line no-await-in-loop
        const { res, calls } = await run({ nickname });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(calls, [["f1", { nickname: null }]]);
    }
});

test("Fighter not found from the service is 404", async () => {
    const { res } = await run({ nickname: "Bones" }, () => { throw new Error("Fighter not found"); });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });
});

test("any other service error is a generic 500", async () => {
    const { res } = await quiet(() => run({ nickname: "Bones" }, () => { throw new Error("E11000 secret mongo detail"); }));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});
