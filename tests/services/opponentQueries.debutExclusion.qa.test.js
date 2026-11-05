/**
 * QA (first-session build): regression guard for "debut opponents leak". Debut opponents
 * (Opponent.isDebut) are a shared pool for zero-fight fighters only. Any new Opponent.find /
 * findOne / aggregate / countDocuments in services/ or controllers/ must either exclude them
 * (isDebut in the filter) or be scoped so they can never match: champions (isChampion: true),
 * the ranked roster (fixedRank: { $ne: null }, debut docs are unranked), GCS cards
 * (promotionTier "GCS", debut docs are Amateur), or an explicit id list from a stored board.
 * Source scan, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["services", "controllers"];

const SAFE = [
    /isDebut/,
    /isChampion:\s*true/,
    /fixedRank:\s*\{\s*\$ne:\s*null\s*\}/,
    /promotionTier:\s*"GCS"/,
    /_id:\s*\{\s*\$in:\s*ids\s*\}/,
];

function calls() {
    const out = [];
    for (const d of DIRS) {
        for (const f of fs.readdirSync(path.join(ROOT, d)).filter((n) => n.endsWith(".js"))) {
            const lines = fs.readFileSync(path.join(ROOT, d, f), "utf8").split("\n");
            lines.forEach((line, i) => {
                if (/^\s*(\/\/|\*)/.test(line)) return;
                if (/\bOpponent\.(find|findOne|aggregate|countDocuments)\(/.test(line)) {
                    // A call's filter may be defined a little above (baseQuery) or spread below.
                    const window = lines.slice(Math.max(0, i - 40), i + 12).join("\n");
                    out.push({ where: `${d}/${f}:${i + 1}`, line: line.trim(), window });
                }
            });
        }
    }
    return out;
}

test("every Opponent list/aggregate query excludes debut opponents or cannot match them", () => {
    const found = calls();
    assert.ok(found.length >= 10, `expected to find the Opponent queries, found ${found.length}`);
    const unsafe = found.filter((c) => !SAFE.some((re) => re.test(c.window)));
    assert.deepEqual(unsafe.map((c) => `${c.where}  ${c.line}`), []);
});

test("the offer-board and callout pools name isDebut explicitly", () => {
    const fight = fs.readFileSync(path.join(ROOT, "services/fightService.js"), "utf8");
    assert.match(fight, /isChampion:\s*\{\s*\$ne:\s*true\s*\},\s*isDebut:\s*\{\s*\$ne:\s*true\s*\}/);
    for (const f of ["services/calloutService.js", "services/interviewService.js", "services/championService.js"]) {
        assert.match(fs.readFileSync(path.join(ROOT, f), "utf8"), /isDebut:\s*\{\s*\$ne:\s*true\s*\}/, f);
    }
    for (const f of ["services/calloutService.js", "services/interviewService.js", "services/mediaHubService.js"]) {
        assert.match(fs.readFileSync(path.join(ROOT, f), "utf8"), /opp(onent)?\.isDebut|targetOpponent\.isDebut/i, f + " guards a client-supplied id");
    }
});
