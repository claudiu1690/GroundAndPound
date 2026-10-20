/**
 * QA: PUT /fighters/:id over a REAL Express stack (express.json + the real fighterRoutes
 * router + ownFighter), with only the auth layer faked and fighterService.updateFighter
 * stubbed. Proves what the mock-res unit tests cannot: real JSON.parse behaviour for
 * prototype keys, malformed JSON, ownership 403 before validation, and that no internal
 * error text reaches the client. No DB, no Redis.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const fighterService = require("../../services/fighterService");
const router = require("../../routes/fighterRoutes");

let server;
let base;
let updateCalls = [];
let updateImpl;
const realUpdate = fighterService.updateFighter;

before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: "u1", fighterId: "mine" }; next(); });
    app.use("/fighters", router);
    app.use((err, _req, res, _next) => {
        const bad = err.type === "entity.parse.failed";
        res.status(bad ? 400 : 500).json({ message: bad ? "Invalid JSON in request body." : "Internal server error" });
    });
    fighterService.updateFighter = async (...a) => {
        updateCalls.push(a);
        return updateImpl ? updateImpl(...a) : { _id: a[0], nickname: a[1].nickname };
    };
    await new Promise((r) => { server = http.createServer(app).listen(0, "127.0.0.1", r); });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    fighterService.updateFighter = realUpdate;
    await new Promise((r) => server.close(r));
});

async function put(id, rawBody) {
    updateCalls = [];
    updateImpl = undefined;
    const res = await fetch(`${base}/fighters/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: rawBody,
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* empty */ }
    return { status: res.status, json };
}

test("another player id is 403 before any validation or service call", async () => {
    const r = await put("theirs", JSON.stringify({ nickname: "Bones" }));
    assert.equal(r.status, 403);
    assert.equal(updateCalls.length, 0);
    const r2 = await put("theirs", JSON.stringify({ iron: 9999 }));
    assert.equal(r2.status, 403, "ownership wins over unknown_fields");
});

test("a malformed id is 403, not a 500 or a CastError", async () => {
    const r = await put("not-an-object-id%00", JSON.stringify({ nickname: "Bones" }));
    assert.equal(r.status, 403);
    assert.equal(updateCalls.length, 0);
});

test("a real JSON __proto__ key is an own property, rejected as unknown_fields", async () => {
    const r = await put("mine", `{"__proto__":{"isAdmin":true},"nickname":"Bones"}`);
    assert.equal(r.status, 400);
    assert.equal(r.json.code, "unknown_fields");
    assert.deepEqual(r.json.fields, ["__proto__"]);
    assert.equal(updateCalls.length, 0);
    assert.equal({}.isAdmin, undefined, "Object.prototype was not polluted");
});

test("constructor and prototype keys are rejected as unknown_fields", async () => {
    for (const body of [`{"constructor":{"prototype":{"x":1}}}`, `{"prototype":1,"nickname":"Bones"}`]) {
        const r = await put("mine", body);
        assert.equal(r.status, 400, body);
        assert.equal(r.json.code, "unknown_fields");
        assert.equal(updateCalls.length, 0);
    }
});

test("operator and dotted keys cannot ride along", async () => {
    const dollar = String.fromCharCode(36);
    const bodies = [
        JSON.stringify({ [dollar + "set"]: { iron: 99 } }),
        JSON.stringify({ nickname: "Bones", "stats.iron": 99 }),
        JSON.stringify({ nickname: { [dollar + "gt"]: "" } }),
    ];
    for (const body of bodies) {
        const r = await put("mine", body);
        assert.equal(r.status, 400, body);
        assert.equal(updateCalls.length, 0);
    }
});

test("array, bare null (rejected by express.json strict mode) and empty bodies are 400", async () => {
    const cases = [["[]", "invalid_body"], [`["nickname"]`, "invalid_body"], ["null", null], ["{}", "no_fields"]];
    for (const [body, code] of cases) {
        const r = await put("mine", body);
        assert.equal(r.status, 400, body);
        if (code) assert.equal(r.json.code, code, body);
        assert.equal(updateCalls.length, 0);
    }
});

test("malformed JSON is a clean 400 with no parser internals", async () => {
    const r = await put("mine", `{"nickname": `);
    assert.equal(r.status, 400);
    assert.doesNotMatch(JSON.stringify(r.json), /Unexpected|position|SyntaxError|at /);
});

test("unicode lookalikes, zero-width and control characters are rejected", async () => {
    const bad = [
        "Bоnes", // Cyrillic o
        "Bonés", // e acute
        "Bo​nes", // zero width space inside
        "​​", // only zero-width
        "Bo\tnes", // tab inside
        "Bo\nnes", // newline inside
        "Bo nes", // NBSP inside
        "ＡＢ", // fullwidth letters
        "Bones‮", // RTL override trailing (not stripped by trim)
        "🥊 Bones", // emoji
    ];
    for (const nickname of bad) {
        const r = await put("mine", JSON.stringify({ nickname }));
        assert.equal(r.status, 400, JSON.stringify(nickname));
        assert.equal(r.json.code, "invalid_nickname", JSON.stringify(nickname));
        assert.equal(updateCalls.length, 0);
    }
});

test("leading and trailing whitespace (incl. NBSP, ideographic space, newline) is trimmed, not stored", async () => {
    for (const raw of ["  Bones", "Bones  ", " Bones ", "　Bones　", "\nBones\n"]) {
        const r = await put("mine", JSON.stringify({ nickname: raw }));
        assert.equal(r.status, 200, JSON.stringify(raw));
        assert.deepEqual(updateCalls, [["mine", { nickname: "Bones" }]]);
    }
});

test("only-whitespace nickname clears to null (documented), 20 ok, 21 rejected, trimmed length counts", async () => {
    let r = await put("mine", JSON.stringify({ nickname: "   " }));
    assert.equal(r.status, 200);
    assert.deepEqual(updateCalls, [["mine", { nickname: null }]]);
    r = await put("mine", JSON.stringify({ nickname: "a".repeat(20) }));
    assert.equal(r.status, 200);
    r = await put("mine", JSON.stringify({ nickname: "a".repeat(21) }));
    assert.equal(r.status, 400);
    r = await put("mine", JSON.stringify({ nickname: "  " + "a".repeat(20) + "  " }));
    assert.equal(r.status, 200, "20 chars plus padding is fine after trim");
    r = await put("mine", JSON.stringify({ nickname: "a" }));
    assert.equal(r.status, 400, "1 char is too short");
});

test("nickname null, number, boolean, array, object are all invalid_nickname", async () => {
    for (const nickname of [null, 7, true, ["Bones"], { a: 1 }]) {
        const r = await put("mine", JSON.stringify({ nickname }));
        assert.equal(r.status, 400, JSON.stringify(nickname));
        assert.equal(r.json.code, "invalid_nickname");
        assert.equal(updateCalls.length, 0);
    }
});

test("profanity evasion that the character set still permits is caught", async () => {
    for (const nickname of ["Sh1t Head", "f-u-c-k", "N1gger", "a s s"]) {
        const r = await put("mine", JSON.stringify({ nickname }));
        assert.equal(r.status, 400, nickname);
        assert.equal(r.json.code, "invalid_nickname");
    }
});

test("a service failure is a generic 500: no stack, no Mongo text, no path", async () => {
    const origErr = console.error;
    console.error = () => {};
    try {
        updateCalls = [];
        updateImpl = async () => { throw new Error("E11000 duplicate key collection fighters index nickname_1 at C:/srv/app/services/x.js"); };
        const res = await fetch(`${base}/fighters/mine`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ nickname: "Bones" }),
        });
        const json = await res.json();
        assert.equal(res.status, 500);
        assert.deepEqual(json, { message: "Internal server error" });
    } finally {
        console.error = origErr;
    }
});

test("Fighter not found from the service is a 404 with only the fixed message", async () => {
    updateCalls = [];
    updateImpl = async () => { throw new Error("Fighter not found"); };
    const res = await fetch(`${base}/fighters/mine`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: "Bones" }),
    });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { message: "Fighter not found" });
});

test("the removed energy routes now 404 (no handler), not 200 or 403", async () => {
    for (const [method, path] of [["PATCH", "/fighters/mine/energy"], ["POST", "/fighters/mine/debug/recharge-energy"]]) {
        const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: "{}" });
        assert.equal(res.status, 404, `${method} ${path}`);
    }
});
