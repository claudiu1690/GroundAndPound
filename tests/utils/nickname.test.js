/**
 * utils/nickname.js: the one set of nickname rules shared by character creation,
 * PUT /fighters/:id and PATCH /account/:id/nickname. Pure function, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { validateNickname, NICKNAME_MIN, NICKNAME_MAX } = require("../../utils/nickname");

function rejects(raw) {
    const r = validateNickname(raw);
    assert.equal(r.ok, false, `expected ${JSON.stringify(raw)} to be rejected`);
    assert.equal(typeof r.message, "string");
    assert.ok(r.message.length > 0);
    assert.ok(!r.message.includes(String.fromCharCode(0x2014)), "no em dashes in player copy");
    assert.ok(!r.message.includes(String.fromCharCode(0x2013)), "no en dashes in player copy");
    assert.equal(Object.prototype.hasOwnProperty.call(r, "value"), false);
    return r;
}

test("bounds are exported as 2 and 20", () => {
    assert.equal(NICKNAME_MIN, 2);
    assert.equal(NICKNAME_MAX, 20);
});

test("20 characters pass, 21 fail, 1 fails, 2 pass", () => {
    assert.deepEqual(validateNickname("a".repeat(20)), { ok: true, value: "a".repeat(20) });
    assert.deepEqual(validateNickname("Jo"), { ok: true, value: "Jo" });
    assert.equal(rejects("a".repeat(21)).message, "Nickname must be 2 to 20 characters.");
    assert.equal(rejects("x").message, "Nickname must be 2 to 20 characters.");
});

test("input is trimmed and length is measured after the trim", () => {
    assert.deepEqual(validateNickname("  Bones  "), { ok: true, value: "Bones" });
    assert.deepEqual(validateNickname(`  ${"a".repeat(20)}  `), { ok: true, value: "a".repeat(20) });
    rejects("  x  ");
});

test("empty or blank becomes value null", () => {
    for (const raw of ["", " ", "     ", "\t\n"]) {
        assert.deepEqual(validateNickname(raw), { ok: true, value: null }, JSON.stringify(raw));
    }
});

test("non-strings are invalid", () => {
    for (const raw of [undefined, null, 5, true, {}, [], ["Bones"], { toString: () => "Bones" }]) {
        assert.equal(rejects(raw).message, "Nickname must be text.");
    }
});

test("allowed punctuation passes", () => {
    for (const raw of ["The O'Neil-Jr 2", "Mr T", "K-9", "D'Arce"]) {
        assert.deepEqual(validateNickname(raw), { ok: true, value: raw });
    }
});

test("periods, accents, emoji and other symbols are rejected", () => {
    const charset = "Nickname can only use letters, numbers, spaces, hyphens and apostrophes.";
    for (const raw of ["Mr. T", "Jr.", "f.u.c.k", "José", "Müller", "Éclair", "Bones \u{1F525}", "\u{1F4AA}\u{1F4AA}", "<script>", "Bones!", "a_b", "a\tb", "Big Bad"]) {
        assert.equal(rejects(raw).message, charset, JSON.stringify(raw));
    }
});

test("double spaces are rejected", () => {
    assert.equal(rejects("Big  Bad").message, "Nickname can't contain double spaces.");
});

test("profanity is rejected with the profanity filter's message", () => {
    for (const raw of ["Shit Kicker", "fuck", "f u c k"]) {
        assert.equal(rejects(raw).message, "Nickname contains language that isn't allowed. Please choose another.", raw);
    }
});

test("surname-safe words still pass the profanity gate", () => {
    assert.deepEqual(validateNickname("Dickson"), { ok: true, value: "Dickson" });
    assert.deepEqual(validateNickname("Hancock"), { ok: true, value: "Hancock" });
});
