/**
 * fighterService.createFighter runs the shared nickname rules (utils/nickname.js), so
 * creation can never store a nickname that PUT /fighters/:id would reject. An invalid
 * nickname throws the { statusCode: 400, validation: true } error before a Fighter is
 * built. No DB: Fighter.prototype.save is stubbed and stops the run with a sentinel.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const fighterService = require("../../services/fighterService");

const BASE = { firstName: "Test", lastName: "Fighter", weightClass: "Lightweight", style: "Boxer" };
const STOP = "__stop_after_save__";

/** Run createFighter with save stubbed. Returns { err, saved } where saved is the doc save() saw. */
async function create(data) {
    const realSave = Fighter.prototype.save;
    const saved = [];
    Fighter.prototype.save = async function save() {
        saved.push(this);
        throw new Error(STOP);
    };
    try {
        await fighterService.createFighter(data);
        return { err: null, saved };
    } catch (err) {
        return { err, saved };
    } finally {
        Fighter.prototype.save = realSave;
    }
}

test("an invalid nickname throws a 400-tagged error with the rule's message and saves nothing", async () => {
    const cases = [
        ["x", "Nickname must be 2 to 20 characters."],
        ["a".repeat(21), "Nickname must be 2 to 20 characters."],
        ["The O'Neil-Jr.", "Nickname can only use letters, numbers, spaces, hyphens and apostrophes."],
        ["José", "Nickname can only use letters, numbers, spaces, hyphens and apostrophes."],
        ["Bones \u{1F525}", "Nickname can only use letters, numbers, spaces, hyphens and apostrophes."],
        ["Big  Bad", "Nickname can't contain double spaces."],
        ["Shit Kicker", "Nickname contains language that isn't allowed. Please choose another."],
        [42, "Nickname must be text."],
        [{ $gt: "" }, "Nickname must be text."],
    ];
    for (const [nickname, message] of cases) {
        // eslint-disable-next-line no-await-in-loop
        const { err, saved } = await create({ ...BASE, nickname });
        assert.ok(err, JSON.stringify(nickname));
        assert.equal(err.message, message);
        assert.equal(err.statusCode, 400);
        assert.equal(err.validation, true);
        assert.equal(saved.length, 0, "no Fighter was saved");
    }
});

test("a valid nickname is stored trimmed", async () => {
    const { err, saved } = await create({ ...BASE, nickname: "  The O'Neil-Jr  " });
    assert.equal(err.message, STOP);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].nickname, "The O'Neil-Jr");
});

test("a missing, null or blank nickname stores null", async () => {
    for (const extra of [{}, { nickname: null }, { nickname: undefined }, { nickname: "" }, { nickname: "   " }]) {
        // eslint-disable-next-line no-await-in-loop
        const { err, saved } = await create({ ...BASE, ...extra });
        assert.equal(err.message, STOP, JSON.stringify(extra));
        assert.equal(saved.length, 1);
        assert.equal(saved[0].nickname, null);
    }
});
