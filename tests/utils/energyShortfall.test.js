/**
 * utils/energyShortfall: need/have ride on a not-enough-energy error only as non-negative
 * integers, and consumers echo them only as a pair.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { markShortfall, shortfallFields } = require("../../utils/energyShortfall");

test("markShortfall sets both and returns the same error", () => {
    const err = new Error("Not enough energy");
    const out = markShortfall(err, 15, 4);
    assert.equal(out, err);
    assert.equal(err.need, 15);
    assert.equal(err.have, 4);
    assert.equal(err.message, "Not enough energy");
    assert.deepEqual(shortfallFields(err), { need: 15, have: 4 });
});

test("zero is a valid have", () => {
    assert.deepEqual(shortfallFields(markShortfall(new Error("x"), 6, 0)), { need: 6, have: 0 });
});

test("non-integers, negatives and non-numbers set nothing", () => {
    const bad = [
        [15.5, 4], [15, 4.2], [-1, 4], [15, -1], ["15", 4], [15, "4"], [NaN, 4], [15, Infinity],
        [null, 4], [15, undefined], [{}, 4],
    ];
    for (const [need, have] of bad) {
        const err = markShortfall(new Error("x"), need, have);
        assert.equal(Object.prototype.hasOwnProperty.call(err, "need"), false, `${need}/${have}`);
        assert.equal(Object.prototype.hasOwnProperty.call(err, "have"), false, `${need}/${have}`);
        assert.deepEqual(shortfallFields(err), {});
    }
});

test("shortfallFields needs both, valid, on the error", () => {
    assert.deepEqual(shortfallFields(Object.assign(new Error("x"), { need: 15 })), {});
    assert.deepEqual(shortfallFields(Object.assign(new Error("x"), { have: 3 })), {});
    assert.deepEqual(shortfallFields(Object.assign(new Error("x"), { need: 15, have: "3" })), {});
    assert.deepEqual(shortfallFields(null), {});
    assert.deepEqual(shortfallFields(undefined), {});
    assert.deepEqual(shortfallFields("Not enough energy"), {});
});

test("markShortfall tolerates a non-error without throwing", () => {
    assert.equal(markShortfall(null, 1, 1), null);
    assert.equal(markShortfall(undefined, 1, 1), undefined);
});

test("shortfallFields never echoes other properties", () => {
    const err = Object.assign(new Error("x"), { need: 10, have: 2, stack2: "secret", code: "X" });
    assert.deepEqual(Object.keys(shortfallFields(err)).sort(), ["have", "need"]);
});
