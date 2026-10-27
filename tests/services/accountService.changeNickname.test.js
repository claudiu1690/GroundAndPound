/**
 * PATCH /account/:id/nickname (accountService.changeNickname + accountController.patchNickname)
 * runs the shared nickname rules in utils/nickname.js: 2 to 20 characters, letters, numbers,
 * spaces, hyphens and apostrophes, no double spaces, profanity gate. Unlike PUT /fighters/:id
 * this path cannot clear a nickname, so blank is rejected. Validation failures are 400 with
 * the rule's message and touch no model. No DB: User/Fighter statics are stubbed and restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const User = require("../../models/userModel");
const Fighter = require("../../models/fighterModel");
const accountService = require("../../services/accountService");
const accountController = require("../../controllers/accountController");

const CHARSET = "Nickname can only use letters, numbers, spaces, hyphens and apostrophes.";
const LENGTH = "Nickname must be 2 to 20 characters.";

function mockRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

/**
 * Stub User.findById / Fighter.findById. `user` and `fighter` may be null, or
 * `findUser` may throw to simulate an infrastructure failure.
 */
async function withModels({ user = { fighterId: "f1", deleted: false }, fighter, findUser } = {}, body) {
    const real = { userFind: User.findById, fighterFind: Fighter.findById };
    const calls = { userFinds: 0, fighterFinds: 0, saves: [] };
    const fighterDoc = fighter === undefined
        ? { nickname: "Old", save: async function save() { calls.saves.push(this.nickname); } }
        : fighter;
    User.findById = async () => {
        calls.userFinds += 1;
        if (findUser) return findUser();
        return user;
    };
    Fighter.findById = async () => { calls.fighterFinds += 1; return fighterDoc; };
    const origError = console.error;
    console.error = () => {};
    try {
        await body(calls);
    } finally {
        console.error = origError;
        User.findById = real.userFind;
        Fighter.findById = real.fighterFind;
    }
    return calls;
}

async function rejectsWith(nickname, message) {
    const calls = await withModels({}, async () => {
        await assert.rejects(accountService.changeNickname("a1", nickname), (err) => {
            assert.equal(err.message, message, JSON.stringify(nickname));
            assert.equal(err.statusCode, 400);
            assert.equal(err.validation, true);
            return true;
        });
    });
    assert.equal(calls.userFinds, 0, "validation runs before any model call");
    assert.deepEqual(calls.saves, []);
}

test("20 characters are saved, trimmed", async () => {
    const twenty = "a".repeat(20);
    const calls = await withModels({}, async () => {
        const out = await accountService.changeNickname("a1", `  ${twenty}  `);
        assert.deepEqual(out, { nickname: twenty });
    });
    assert.deepEqual(calls.saves, [twenty]);
});

test("21 characters and 1 character are rejected with the shared length message", async () => {
    await rejectsWith("a".repeat(21), LENGTH);
    await rejectsWith("x", LENGTH);
});

test("blank and empty are rejected: the Account tab cannot clear a nickname", async () => {
    for (const raw of ["", "   ", "\t"]) {
        // eslint-disable-next-line no-await-in-loop
        await rejectsWith(raw, "Enter a nickname.");
    }
});

test("non-strings are rejected", async () => {
    for (const raw of [undefined, null, 5, { $ne: null }, ["Bones"]]) {
        // eslint-disable-next-line no-await-in-loop
        await rejectsWith(raw, "Nickname must be text.");
    }
});

test("periods and other symbols are rejected with the shared charset message", async () => {
    for (const raw of ["Mr. T", "José", "Bones!", "<b>x</b>"]) {
        // eslint-disable-next-line no-await-in-loop
        await rejectsWith(raw, CHARSET);
    }
});

test("double spaces and profanity are rejected", async () => {
    await rejectsWith("Big  Bad", "Nickname can't contain double spaces.");
    await rejectsWith("Shit Kicker", "Nickname contains language that isn't allowed. Please choose another.");
});

test("hyphens and apostrophes pass", async () => {
    const calls = await withModels({}, async () => {
        assert.deepEqual(await accountService.changeNickname("a1", "The O'Neil-Jr 2"), { nickname: "The O'Neil-Jr 2" });
    });
    assert.deepEqual(calls.saves, ["The O'Neil-Jr 2"]);
});

test("no message contains an en or em dash", async () => {
    for (const raw of ["x", "a".repeat(21), "Mr. T", "", 5, "Big  Bad"]) {
        // eslint-disable-next-line no-await-in-loop
        await withModels({}, async () => {
            await assert.rejects(accountService.changeNickname("a1", raw), (err) => {
                assert.ok(!err.message.includes(String.fromCharCode(0x2013)), err.message);
                assert.ok(!err.message.includes(String.fromCharCode(0x2014)), err.message);
                return true;
            });
        });
    }
});

// ── Controller mapping ──────────────────────────────────────────────

function req(nickname, id = "a1") {
    return { params: { id }, user: { id }, body: { nickname } };
}

test("controller: validation failure is 400 with only the message", async () => {
    for (const [nickname, message] of [["a".repeat(21), LENGTH], ["", "Enter a nickname."], ["Mr. T", CHARSET]]) {
        const res = mockRes();
        // eslint-disable-next-line no-await-in-loop
        await withModels({}, () => accountController.patchNickname(req(nickname), res));
        assert.equal(res.statusCode, 400, JSON.stringify(nickname));
        assert.deepEqual(res.body, { message });
    }
});

test("controller: success is 200 { success, nickname }", async () => {
    const res = mockRes();
    await withModels({}, () => accountController.patchNickname(req("Bones"), res));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, nickname: "Bones" });
});

test("controller: account not found stays 404, no fighter stays 400", async () => {
    let res = mockRes();
    await withModels({ user: null }, () => accountController.patchNickname(req("Bones"), res));
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Account not found" });

    res = mockRes();
    await withModels({ user: { fighterId: null } }, () => accountController.patchNickname(req("Bones"), res));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "No fighter linked to this account");

    res = mockRes();
    await withModels({ fighter: null }, () => accountController.patchNickname(req("Bones"), res));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Fighter not found");
});

test("controller: an unexpected failure is a generic 500 with no internals", async () => {
    const res = mockRes();
    await withModels(
        { findUser: () => { throw new Error("connect ECONNREFUSED 10.0.0.5:27017 at C:/srv/app/x.js"); } },
        () => accountController.patchNickname(req("Bones"), res),
    );
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
});

test("controller: acting on another account is 403 before validation", async () => {
    const res = mockRes();
    const calls = await withModels({}, () => accountController.patchNickname(
        { params: { id: "a1" }, user: { id: "a2" }, body: { nickname: "Bones" } }, res,
    ));
    assert.equal(res.statusCode, 403);
    assert.equal(calls.userFinds, 0);
});
