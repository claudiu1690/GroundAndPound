/**
 * QA (first-session build): the frontend's vitest-style unit tests (revealModel.test.js,
 * renderEvent.test.js) use vitest globals, but vitest is not a dependency, so neither file ever
 * ran in `npm test` or in the pre-push hook. This runs them through node:test with a tiny shim
 * (tests/frontend/helpers/vitestShim.mjs) in a child process, so the reveal script builder and the
 * event renderer are covered by the normal suite.
 *
 * KNOWN STALE: renderEvent.test.js "renderResult draw returns draw template" expects draw copy
 * matching /draw|standstill|split/ but the template now reads "close fight, no clear winner...".
 * It is not a first-session regression (the file simply never ran). It is tolerated here, and ONLY
 * it, so this suite stays green; fix the test's regex and drop KNOWN_STALE.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const shim = pathToFileURL(path.resolve(__dirname, "helpers/vitestShim.mjs")).href;
const repo = path.resolve(__dirname, "../..");

const FILES = [
    { rel: "frontend/src/components/fights/reveal/revealModel.test.js", knownStale: [] },
    { rel: "frontend/src/components/fights/breakdown/renderEvent.test.js", knownStale: [] },
    // Fight replay highlights: the reveal's short highlight lines.
    { rel: "frontend/src/components/fights/reveal/highlightLines.test.js", knownStale: [] },
    // Special move ready glow: which rounds a move's gate was open, and why it did not fire.
    { rel: "frontend/src/components/fights/moveReadiness.test.js", knownStale: [] },
];

for (const { rel, knownStale } of FILES) {
    test(`vitest-style file runs under node:test: ${rel}`, () => {
        const res = spawnSync(process.execPath, ["--import", shim, "--test", path.join(repo, rel)], {
            cwd: path.join(repo, "frontend"),
            encoding: "utf8",
            // Drop the parent runner marker or the child reports in the parent's binary protocol.
            env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT")),
        });
        const out = res.stdout || "";
        const total = Number((/# tests (\d+)/.exec(out) || [])[1] || 0);
        assert.ok(total > 0, `no tests were registered (shim not applied?)\n${out.slice(-800)}\n${res.stderr || ""}`);
        const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
        const unexpected = failed.filter((n) => !knownStale.includes(n));
        assert.deepEqual(unexpected, [], `${rel} failures: ${unexpected.join("; ")}\n${out.slice(-1500)}`);
    });
}
