/**
 * fightService.applyTitleShotWin (the in-memory title-win mutation resolve calls) and
 * fightService.describeTitleWin (the TITLE_WON log line and the newBadges belt entry).
 *
 * The GCS path must never dereference `promoted` (it is null there): before this change
 * resolve threw on `promoted.from` AFTER fighter.save(), so the request 500ed with the
 * state already saved. These tests drive that path end to end through both units.
 *
 * No DB: fighters are plain objects without _id, so applyNotorietyDelta never writes a
 * fame-ledger row. notorietyService.applyNotorietyDelta is wrapped (not replaced) to
 * record the options it was called with; the wrapper is restored.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fightService = require("../../services/fightService");
const notorietyService = require("../../services/notorietyService");

const { applyTitleShotWin, describeTitleWin } = fightService;

function gcsFighter(over = {}) {
    return {
        promotionTier: "GCS",
        weightClass: "Lightweight",
        pendingPromotion: null,
        winsInCurrentTier: 7,
        topFiveWinsInTier: 3,
        titleShotCooldown: 0,
        gcsTitleWins: 0,
        ranking: { rank: 3, fightsInTier: 9, entryRecordAtFight3: null },
        badges: [],
        notoriety: { score: 0 },
        ...over,
    };
}

async function recordingFame(body) {
    const calls = [];
    const original = notorietyService.applyNotorietyDelta;
    notorietyService.applyNotorietyDelta = (fighter, delta, opts) => {
        calls.push({ delta, opts });
        return original(fighter, delta, opts);
    };
    try {
        return await body(calls);
    } finally {
        notorietyService.applyNotorietyDelta = original;
    }
}

test("GCS first win: belt counted, no promotion, ranking and tier wins untouched", async () => {
    await recordingFame(async (calls) => {
        const f = gcsFighter();
        const r = applyTitleShotWin(f, { fightId: "fight1" });

        assert.equal(f.promotionTier, "GCS");
        assert.deepEqual(f.ranking, { rank: 3, fightsInTier: 9, entryRecordAtFight3: null });
        assert.equal(f.winsInCurrentTier, 7);
        assert.equal(f.pendingPromotion, null);
        assert.equal(f.topFiveWinsInTier, 0);
        assert.equal(f.titleShotCooldown, 0);
        assert.equal(f.gcsTitleWins, 1);
        assert.equal(f.notoriety.score, 200);
        assert.deepEqual(f.badges, ["Champion"]);

        assert.equal(r.promoted, null);
        assert.equal(r.beltTier, "GCS");
        assert.equal(r.titleDefense, false);
        assert.equal(r.fameAwarded, 200);
        assert.equal(r.badgeAwarded, "Champion");

        assert.equal(calls.length, 1);
        assert.equal(calls[0].delta, 200);
        assert.equal(calls[0].opts.code, "BELT_WON");
        assert.equal(calls[0].opts.skipFreezeBlock, true);
        assert.equal(calls[0].opts.reason, "Won the GCS belt");
        assert.deepEqual(calls[0].opts.meta, { fightId: "fight1", tier: "GCS", defense: false });
    });
});

test("GCS first win: badge pushed only once when the legacy Champion badge is already held", () => {
    const f = gcsFighter({ badges: ["Champion"] });
    const r = applyTitleShotWin(f, {});
    assert.deepEqual(f.badges, ["Champion"]);
    assert.equal(r.badgeAwarded, null);
    assert.equal(r.titleDefense, false);
});

test("GCS second win: a defense pays 100 fame, no new badge", async () => {
    await recordingFame(async (calls) => {
        const f = gcsFighter({ gcsTitleWins: 1, badges: ["Champion"], notoriety: { score: 200 }, titleShotCooldown: 0 });
        const r = applyTitleShotWin(f, { fightId: "fight2" });
        assert.equal(f.gcsTitleWins, 2);
        assert.equal(r.titleDefense, true);
        assert.equal(r.fameAwarded, 100);
        assert.equal(r.badgeAwarded, null);
        assert.equal(r.promoted, null);
        assert.equal(f.notoriety.score, 300);
        assert.deepEqual(f.badges, ["Champion"]);
        assert.equal(f.topFiveWinsInTier, 0);
        assert.equal(calls[0].opts.reason, "Defended the GCS belt");
        assert.deepEqual(calls[0].opts.meta, { fightId: "fight2", tier: "GCS", defense: true });
    });
});

test("GCS defense when the badge was somehow lost: still no badge", () => {
    const f = gcsFighter({ gcsTitleWins: 3, badges: [] });
    const r = applyTitleShotWin(f, {});
    assert.equal(r.titleDefense, true);
    assert.deepEqual(f.badges, []);
});

test("lower tier regression: promotes, resets ranking and counters, clears pending", () => {
    const f = {
        promotionTier: "Regional Pro",
        weightClass: "Lightweight",
        pendingPromotion: "National",
        winsInCurrentTier: 5,
        topFiveWinsInTier: 3,
        titleShotCooldown: 0,
        ranking: { rank: 2, fightsInTier: 8, entryRecordAtFight3: { wins: 2, losses: 1 } },
        badges: [],
        notoriety: { score: 0 },
    };
    const r = applyTitleShotWin(f, { fightId: "fight3" });
    assert.deepEqual(r.promoted, { from: "Regional Pro", to: "National", viaTitleShot: true });
    assert.equal(r.beltTier, "Regional Pro");
    assert.equal(r.titleDefense, false);
    assert.equal(r.fameAwarded, 200);
    assert.equal(f.promotionTier, "National");
    assert.equal(f.pendingPromotion, null);
    assert.equal(f.winsInCurrentTier, 0);
    assert.equal(f.topFiveWinsInTier, 0);
    assert.equal(f.titleShotCooldown, 0);
    assert.deepEqual(f.ranking, { rank: null, fightsInTier: 0, entryRecordAtFight3: null });
    assert.deepEqual(f.badges, ["Champion"]);
    assert.equal(f.gcsTitleWins, undefined, "lower tiers never touch gcsTitleWins");
});

test("lower tier regression: Amateur belt pays 75 and the Amateur Champion badge", () => {
    const f = { promotionTier: "Amateur", pendingPromotion: "Regional Pro", badges: [], notoriety: { score: 0 } };
    const r = applyTitleShotWin(f, {});
    assert.equal(r.fameAwarded, 75);
    assert.equal(r.badgeAwarded, "Amateur Champion");
    assert.equal(f.promotionTier, "Regional Pro");
});

// ── describeTitleWin: log + newBadges entry, never reads promoted at GCS ───────

test("GCS first win end to end: apply + describe never throws, log and badge are GCS-shaped", () => {
    const f = gcsFighter();
    assert.doesNotThrow(() => {
        const win = applyTitleShotWin(f, { fightId: "fx" });
        assert.equal(win.promoted, null);
        const d = describeTitleWin({ win, weightClass: f.weightClass, gcsTitleWins: f.gcsTitleWins, drinksGranted: 3, fightId: "fx" });
        assert.equal(d.log.type, "TITLE_WON");
        assert.equal(d.log.text, "Won the GCS Lightweight Title");
        assert.deepEqual(d.log.meta, {
            tier: "GCS", weightClass: "Lightweight", defense: false, gcsTitleWins: 1, drinksGranted: 3, fightId: "fx",
        });
        assert.equal(d.badge, "Champion");
    });
});

test("GCS defense end to end: text counts defenses, no badge, no throw", () => {
    const f = gcsFighter({ gcsTitleWins: 2, badges: ["Champion"] });
    assert.doesNotThrow(() => {
        const win = applyTitleShotWin(f, {});
        const d = describeTitleWin({ win, weightClass: f.weightClass, gcsTitleWins: f.gcsTitleWins, drinksGranted: 0, fightId: "fy" });
        assert.equal(d.log.text, "Defended the GCS Lightweight Title (x2)");
        assert.equal(d.log.meta.defense, true);
        assert.equal(d.log.meta.gcsTitleWins, 3);
        assert.equal(d.badge, null);
    });
});

test("describeTitleWin with promoted null at GCS (resolve's exact inputs) does not throw", () => {
    const win = { promoted: null, beltTier: "GCS", titleDefense: false };
    assert.doesNotThrow(() => describeTitleWin({ win, weightClass: "Heavyweight", gcsTitleWins: 1, drinksGranted: 3, fightId: "z" }));
});

test("lower tier log text and meta are unchanged", () => {
    const win = { promoted: { from: "National", to: "GCS Contender", viaTitleShot: true }, beltTier: "National", titleDefense: false };
    const d = describeTitleWin({ win, weightClass: "Lightweight", gcsTitleWins: 0, drinksGranted: 3, fightId: "w" });
    assert.equal(d.log.text, "Won National Lightweight Title \u2014 promoted to GCS Contender");
    assert.deepEqual(d.log.meta, { from: "National", to: "GCS Contender", weightClass: "Lightweight", tier: "National", drinksGranted: 3 });
    assert.equal(d.badge, "Champion");
});

test("resolve source: no promoted.* dereference survives inside the belt-won path", () => {
    // Static guard: the resolve block between the title-win call and the summary must not
    // read promoted.from / promoted.to except in the non-belt TIER_PROMOTION log.
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../services/fightService.js"), "utf8");
    const derefs = src.split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => /promoted\.(from|to)\b/.test(line) && !line.startsWith("*") && !line.startsWith("//"));
    const allowed = derefs.filter(({ line }) =>
        line.includes("Promoted to ${promoted.to}")
        || line.includes("{ from: promoted.from, to: promoted.to, tier: promoted.from, drinksGranted: promotionDrinksGranted }"));
    assert.deepEqual(derefs.filter((d) => !allowed.includes(d)), [], "only the TIER_PROMOTION log (guarded by !beltWon) may read promoted.*");
});

test("awardCtx keeps titleDefenceWin false (no flat TITLE_DEF on top of defense fame)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../services/fightService.js"), "utf8");
    assert.match(src, /titleFightWin: false,\s*\n\s*titleDefenceWin: false,/);
});
