/**
 * Contract conformance for the offer-board endpoints in controllers/fightController.js:
 * status + body for every coded error, the GET / reroll response shapes, input validation.
 *
 * No Express, no DB: the service functions are stubbed and a minimal res double records
 * status and body. Every stub is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fightController = require("../../controllers/fightController");
const fightService = require("../../services/fightService");
const offerBoardService = require("../../services/offerBoardService");

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

function req(over = {}) {
    return { params: { fighterId: "f1", fightId: "507f1f77bcf86cd799439011" }, body: {}, user: { id: "u1", fighterId: "f1" }, ...over };
}

/** Silence the expected server-side error logs for the 500 cases. */
async function quiet(body) {
    const orig = console.error;
    console.error = () => {};
    try { return await body(); } finally { console.error = orig; }
}

const CODE_TABLE = {
    OFFER_NOT_ON_BOARD: [409, "That bout is no longer on your board."],
    FIGHT_ALREADY_BOOKED: [409, "You already have a fight booked."],
    TITLE_SHOT_LOCKED: [400, "Your title shot is still locked."],
    OFFER_BOARD_FROZEN: [409, "You can't reroll while a fight is booked."],
    REROLL_USED: [409, "You've already rerolled this set."],
    OFFER_BOARD_STALE: [409, "Your offers changed. Load the new set first."],
    OFFER_POOL_EMPTY: [409, "No other opponents are available right now."],
};

const VALID_OPP = "507f1f77bcf86cd799439012";

test("every board error code maps to its status and {message, code} on every offer endpoint", async () => {
    const errors = [
        ...Object.keys(CODE_TABLE).map((code) => offerBoardService.boardError(code)),
        offerBoardService.boardError("FIGHT_BLOCKED_INJURY", "Still recovering from a Concussion.", 400),
        offerBoardService.boardError("NOT_ENOUGH_CASH", "Not enough cash (a reroll costs $150)", 400),
    ];
    for (const err of errors) {
        const expectedStatus = CODE_TABLE[err.code] ? CODE_TABLE[err.code][0] : 400;
        const expectedMessage = CODE_TABLE[err.code] ? CODE_TABLE[err.code][1] : err.message;
        const boom = async () => { throw err; };

        const calls = [
            ["getOffers", offerBoardService, "getBoard", req()],
            ["rerollOffers", offerBoardService, "rerollBoard", req()],
            ["createOffer", fightService, "createOffer", req({ body: { opponentId: VALID_OPP } })],
            ["acceptOffer", fightService, "acceptOffer", req()],
        ];
        for (const [handler, svc, fn, r] of calls) {
            const res = mockRes();
            // eslint-disable-next-line no-await-in-loop
            await withStub(svc, fn, boom, () => fightController[handler](r, res));
            assert.equal(res.statusCode, expectedStatus, `${handler} ${err.code}`);
            assert.deepEqual(res.body, { message: expectedMessage, code: err.code }, `${handler} ${err.code}`);
        }
    }
});

test("GET offers: 200 {offers, board}", async () => {
    const meta = offerBoardService.emptyBoardMeta("Amateur");
    const offers = [{ type: "Even", opponent: { _id: "o" }, acceptable: true }];
    const res = mockRes();
    let seen = null;
    await withStub(offerBoardService, "getBoard", async (id) => { seen = id; return { offers, meta }; }, () =>
        fightController.getOffers(req(), res));
    assert.equal(seen, "f1");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { offers, board: meta });
});

test("GET offers: 404 Fighter not found; 500 hides internals", async () => {
    let res = mockRes();
    await withStub(offerBoardService, "getBoard", async () => { throw new Error("Fighter not found"); }, () =>
        fightController.getOffers(req(), res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });

    res = mockRes();
    await quiet(() => withStub(offerBoardService, "getBoard", async () => { throw new Error("connection string leaked"); }, () =>
        fightController.getOffers(req(), res)));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });

    // A coded error with an unknown code or a 5xx status is never echoed.
    res = mockRes();
    const weird = Object.assign(new Error("secret"), { code: 11000, status: 500 });
    await quiet(() => withStub(offerBoardService, "getBoard", async () => { throw weird; }, () =>
        fightController.getOffers(req(), res)));
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});

test("POST reroll: 200 {offers, board, cashAfter}", async () => {
    const meta = { ...offerBoardService.emptyBoardMeta("Amateur"), rerollUsed: true, rerollBlockedBy: "used" };
    const res = mockRes();
    let args = null;
    await withStub(offerBoardService, "rerollBoard", async (...a) => { args = a; return { offers: [], meta, cashAfter: 900 }; }, () =>
        fightController.rerollOffers(req(), res));
    assert.deepEqual(args, ["f1", "u1"]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { offers: [], board: meta, cashAfter: 900 });
});

test("POST reroll: 404 Fighter not found", async () => {
    const res = mockRes();
    await withStub(offerBoardService, "rerollBoard", async () => { throw new Error("Fighter not found"); }, () =>
        fightController.rerollOffers(req(), res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fighter not found" });
});

test("POST offers: OFFER_INVALID_INPUT for a missing / non-string / malformed opponentId", async () => {
    const bad = [undefined, null, 42, {}, [], "", "abc", "aaaaaaaaaaaa", `${VALID_OPP}x`, { $ne: null }];
    for (const opponentId of bad) {
        let called = false;
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(fightService, "createOffer", async () => { called = true; }, () =>
            fightController.createOffer(req({ body: { opponentId } }), res));
        assert.equal(called, false, JSON.stringify(opponentId));
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.body, { message: "opponentId is required", code: "OFFER_INVALID_INPUT" });
    }
    const res = mockRes();
    await withStub(fightService, "createOffer", async () => { throw new Error("should not run"); }, () =>
        fightController.createOffer(req({ body: undefined }), res));
    assert.equal(res.statusCode, 400);
});

test("POST offers: 201 with the Fight; offerType is not forwarded", async () => {
    const res = mockRes();
    let args = null;
    const fight = { _id: "fight-1", offerType: "Hard" };
    await withStub(fightService, "createOffer", async (...a) => { args = a; return fight; }, () =>
        fightController.createOffer(req({ body: { opponentId: VALID_OPP, offerType: "TitleShot" } }), res));
    assert.deepEqual(args, ["f1", VALID_OPP]);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body, fight);
});

test("POST offers: 404 Fighter not found", async () => {
    const res = mockRes();
    await withStub(fightService, "createOffer", async () => { throw new Error("Fighter not found"); }, () =>
        fightController.createOffer(req({ body: { opponentId: VALID_OPP } }), res));
    assert.equal(res.statusCode, 404);
});

test("POST accept: an invalid fightId is 404 without touching the service", async () => {
    let called = false;
    const res = mockRes();
    await withStub(fightService, "acceptOffer", async () => { called = true; }, () =>
        fightController.acceptOffer(req({ params: { fighterId: "f1", fightId: "not-an-id" } }), res));
    assert.equal(called, false);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Fight not found or not available" });
});

test("POST accept: energy, not-found and success mappings", async () => {
    let res = mockRes();
    await withStub(fightService, "acceptOffer", async () => { throw new Error("Not enough energy"); }, () =>
        fightController.acceptOffer(req(), res));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Not enough energy", code: "FIGHT_NOT_ENOUGH_ENERGY" });

    for (const msg of ["Fight not found or not available", "Fighter not found"]) {
        res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withStub(fightService, "acceptOffer", async () => { throw new Error(msg); }, () =>
            fightController.acceptOffer(req(), res));
        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { message: msg });
    }

    res = mockRes();
    const fight = { _id: "fight-1", status: "accepted" };
    let args = null;
    await withStub(fightService, "acceptOffer", async (...a) => { args = a; return fight; }, () =>
        fightController.acceptOffer(req(), res));
    assert.deepEqual(args, ["f1", "507f1f77bcf86cd799439011", "u1"]);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, fight);
});
