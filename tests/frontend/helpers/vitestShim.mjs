/**
 * Minimal vitest-global shim (test, describe, it, expect) on top of node:test and node:assert.
 * The frontend has no vitest dependency, so frontend/src/**\/*.test.js files written in vitest style
 * (revealModel.test.js, renderEvent.test.js) never ran. Preloaded with `node --import` by
 * firstSession.vitestFiles.qa.test.js. Supports only the matchers those files use.
 */
import assert from "node:assert/strict";
import nodetest from "node:test";

function matchers(actual, negate) {
    const check = (cond, msg) => assert.ok(negate ? !cond : cond, (negate ? "NOT " : "") + msg);
    return {
        toBe: (b) => check(Object.is(actual, b), `expected ${JSON.stringify(actual)} toBe ${JSON.stringify(b)}`),
        toEqual: (b) => {
            if (negate) assert.notDeepEqual(actual, b);
            else assert.deepEqual(actual, b);
        },
        toContain: (b) => check(actual.includes(b), `${JSON.stringify(actual)} toContain ${JSON.stringify(b)}`),
        toHaveLength: (n) => check(actual.length === n, `length ${actual.length} toHaveLength ${n}`),
        toBeTruthy: () => check(!!actual, `${JSON.stringify(actual)} toBeTruthy`),
        toBeGreaterThan: (n) => check(actual > n, `${actual} > ${n}`),
        toBeGreaterThanOrEqual: (n) => check(actual >= n, `${actual} >= ${n}`),
        toBeLessThanOrEqual: (n) => check(actual <= n, `${actual} <= ${n}`),
        toMatch: (re) => check(re.test(actual), `${JSON.stringify(actual)} toMatch ${re}`),
    };
}

globalThis.test = nodetest;
globalThis.it = nodetest;
globalThis.describe = nodetest.describe;
globalThis.expect = (actual) => ({ ...matchers(actual, false), not: matchers(actual, true) });
