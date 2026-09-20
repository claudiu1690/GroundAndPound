/**
 * Your Camp PHASE 2 — Q5: THE GYM RETIREMENT FLAG. Risk #4.
 *
 * Two properties, and the FIRST one matters more than the second:
 *
 *   1. `GYMS_RETIRED` unset/false ⇒ the middleware is a PURE NO-OP. This is what makes the
 *      cutover a flag flip rather than a deploy, and it is what makes `GYMS_RETIRED=false` +
 *      restart a total, instant, lossless rollback. If the "off" state is not byte-identical to
 *      the pre-Phase-2 build, there is no rollback.
 *   2. `GYMS_RETIRED=true` ⇒ all SEVEN endpoints return the same 410 body, and — the part that
 *      actually costs a player something if it is wrong — `POST /fighters/:id/train` NEVER
 *      reaches `deductBatchEnergy`. A mid-session player who clicks Train during the cutover
 *      must lose zero energy.
 *
 * Exercised through a real Express router stack (not by calling the middleware directly) so the
 * ORDER of the wiring is what is under test, not just the function.
 *
 * Run with: node --test tests/services/gymsRetiredMiddleware.qa.test.js
 */
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const http = require("node:http");
const express = require("express");

const config = require("../../config");
const blockWhenGymsRetired = require("../../middleware/gymsRetiredMiddleware");

/** The seven endpoints the contract retires, as (method, path) pairs. */
const RETIRED = [
    ["GET", "/gyms"],
    ["GET", "/gyms/abc123"],
    ["GET", "/gyms/for-fighter/f1"],
    ["GET", "/gyms/abc123/progress/f1"],
    ["POST", "/fighters/f1/train"],
    ["POST", "/fighters/f1/switch-gym"],
    ["POST", "/fighters/f1/rank-up-gym"],
];

/**
 * A stand-in app wired EXACTLY like app.js / fighterRoutes.js, with spy controllers so we can
 * assert whether the handler was reached at all.
 */
const reached = [];
let server, baseUrl;

before(async () => {
    const app = express();
    app.use(express.json());

    const hit = (name) => (req, res) => { reached.push(name); res.json({ ok: true, name }); };

    // — mirrors app.js: app.use("/gyms", authMiddleware, blockWhenGymsRetired, gymRoutes)
    const gymRouter = express.Router();
    gymRouter.get("/", hit("gyms.list"));
    gymRouter.get("/for-fighter/:fighterId", hit("gyms.listWithProgress"));
    gymRouter.get("/:id", hit("gyms.getById"));
    gymRouter.get("/:id/progress/:fighterId", hit("gyms.getProgress"));
    app.use("/gyms", blockWhenGymsRetired, gymRouter);

    // — mirrors fighterRoutes.js. `ownFighter` is a pass-through stub here; what matters is that
    //   blockWhenGymsRetired sits in FRONT of the controller. The train spy stands in for the
    //   controller, which is where deductBatchEnergy would be called.
    const ownFighter = (req, res, next) => { reached.push("ownFighter"); next(); };
    const fighterRouter = express.Router();
    fighterRouter.post("/:id/train", ownFighter, blockWhenGymsRetired, hit("fighters.train"));
    fighterRouter.post("/:id/switch-gym", blockWhenGymsRetired, hit("fighters.switchGym"));
    fighterRouter.post("/:id/rank-up-gym", blockWhenGymsRetired, hit("fighters.rankUpGym"));
    app.use("/fighters", fighterRouter);

    // A route the retirement must NOT touch — the camp has to keep working through the cutover.
    app.get("/home-camp/:fighterId", hit("homeCamp.get"));
    // Gym Side Quests are deliberately left alone (D-1 / P2-D5): they degrade to empty rather
    // than erroring, and a 410 here would turn a quiet ending into a red error screen.
    app.get("/quests/:fighterId/:gymId", hit("quests.get"));

    await new Promise((resolve) => { server = http.createServer(app).listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
});

async function call(method, path) {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
    });
    let body = null;
    try { body = await res.json(); } catch (_) { /* no body */ }
    return { status: res.status, body };
}

/** Run `fn` with the flag forced to `value`, always restoring it. */
async function withFlag(value, fn) {
    const real = config.features.gymsRetired;
    config.features.gymsRetired = value;
    reached.length = 0;
    try { return await fn(); } finally { config.features.gymsRetired = real; }
}

// ── flag OFF — byte-identical to today ──────────────────────────────────────

test("Q5 the flag defaults to FALSE (unset env ⇒ today's behaviour)", () => {
    // GYMS_RETIRED is not set in this process, so the shipped default must be false. If this
    // ever flips, a deploy silently becomes a cutover.
    assert.equal(process.env.GYMS_RETIRED, undefined);
    assert.equal(require("../../config").features.gymsRetired, false);
});

test("Q5 flag OFF: all seven endpoints behave exactly as today — the middleware is a no-op", async () => {
    await withFlag(false, async () => {
        for (const [method, path] of RETIRED) {
            const res = await call(method, path);
            assert.equal(res.status, 200, `${method} ${path} should be untouched while the flag is off`);
            assert.equal(res.body.ok, true);
        }
        // Every controller was reached, and `ownFighter` still ran first on /train.
        assert.ok(reached.includes("fighters.train"));
        assert.equal(reached.indexOf("ownFighter") < reached.indexOf("fighters.train"), true,
            "ownFighter must still run before the train controller");
        assert.equal(reached.filter((r) => r.startsWith("gyms.")).length, 4);
    });
});

test("Q5 flag OFF: the middleware calls next() and writes NOTHING to the response", async () => {
    await withFlag(false, async () => {
        let nexted = 0;
        const res = {
            status() { throw new Error("the middleware must not touch the response while the flag is off"); },
            json() { throw new Error("the middleware must not touch the response while the flag is off"); },
        };
        blockWhenGymsRetired({}, res, () => { nexted += 1; });
        assert.equal(nexted, 1);
    });
});

// ── flag ON — the cutover ───────────────────────────────────────────────────

test("Q5 flag ON: all seven endpoints return the EXACT 410 body", async () => {
    await withFlag(true, async () => {
        for (const [method, path] of RETIRED) {
            const res = await call(method, path);
            assert.equal(res.status, 410, `${method} ${path}`);
            assert.deepEqual(res.body, {
                message: "The 10 gyms have closed. Training now happens in your own camp.",
                code: "gyms_retired",
            }, `${method} ${path} body`);
        }
    });
});

test("Q5 flag ON: the train CONTROLLER is never reached — zero energy can be spent", async () => {
    await withFlag(true, async () => {
        await call("POST", "/fighters/f1/train");
        assert.equal(reached.includes("fighters.train"), false,
            "the controller (and therefore deductBatchEnergy) must never run");
        // ownFighter still ran — the guard is not removed, only short-circuited after it.
        assert.deepEqual(reached, ["ownFighter"]);
    });
});

test("Q5 flag ON: no gym controller is reached at all", async () => {
    await withFlag(true, async () => {
        for (const [method, path] of RETIRED) await call(method, path);
        assert.equal(reached.some((r) => r.startsWith("gyms.")), false);
        assert.equal(reached.some((r) => r.startsWith("fighters.")), false);
    });
});

test("Q5 flag ON: the camp is unaffected and gym quests are deliberately left alone", async () => {
    await withFlag(true, async () => {
        const camp = await call("GET", "/home-camp/f1");
        assert.equal(camp.status, 200, "the camp must keep working through the cutover");
        const quests = await call("GET", "/quests/f1/g1");
        assert.equal(quests.status, 200, "gym quests degrade to empty rather than erroring (D-1)");
    });
});

test("Q5 the 410 body object cannot be mutated by a previous response", async () => {
    await withFlag(true, async () => {
        const a = await call("GET", "/gyms");
        a.body.code = "tampered";
        const b = await call("GET", "/gyms");
        assert.equal(b.body.code, "gyms_retired", "each response must get a fresh copy of the body");
    });
});

test("Q5 flipping the flag back restores the old behaviour with no restart-only state", async () => {
    // The middleware reads config at REQUEST time, not require time — this is what makes the
    // rollback a restart of the same build rather than a redeploy.
    await withFlag(true, async () => {
        assert.equal((await call("GET", "/gyms")).status, 410);
    });
    await withFlag(false, async () => {
        assert.equal((await call("GET", "/gyms")).status, 200);
    });
});
