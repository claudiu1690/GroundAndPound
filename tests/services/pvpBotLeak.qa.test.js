/**
 * QA regression tests for the PVP bot ladder feature — gaps not covered by
 * tests/services/pvpBot.test.js.
 *
 * Scope: pure/unit only (no DB, no Redis), matching this repo's existing test
 * convention (tests/services/*.test.js never spin up Mongo/Redis).
 *
 * These specifically probe:
 *   1. toPublicFighter never leaks isPvpBot to a client DTO (hard requirement #5).
 *   2. The inline bot-DP clamp in services/pvpFightService.js has not silently
 *      drifted from the mirrored expression asserted by pvpBot.test.js — a
 *      source-text guard, because the real clamp is intentionally inline
 *      (reads DB-loaded attacker.isPvpBot) and pvpBot.test.js tests a
 *      hand-copied mirror of it, not the real code path (see NOTE below).
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fighterService = require("../../services/fighterService");

// ── 1. isPvpBot leak guard (toPublicFighter) ────────────────────────────────

test("toPublicFighter strips isPvpBot from a plain (non-Mongoose) fighter-like object", () => {
    const fakeBotFighter = {
        _id: "000000000000000000000001",
        firstName: "Jesse",
        lastName: "Hooker",
        nickname: "The Kid",
        isPvpBot: true,
        weightClass: "Featherweight",
        style: "Boxer",
        overallRating: 12,
        injuries: [],
        badgesEarned: [],
        media: {},
    };
    const out = fighterService.toPublicFighter(fakeBotFighter);
    assert.equal(out.isPvpBot, undefined, "isPvpBot must never survive toPublicFighter");
    assert.ok(!Object.prototype.hasOwnProperty.call(out, "isPvpBot"), "isPvpBot key must be deleted, not just falsy");
});

test("toPublicFighter strips isPvpBot from a Mongoose-doc-shaped object (toObject path)", () => {
    // Mirrors the real call site: fighter.toObject ? fighter.toObject() : {...fighter}.
    const fakeMongooseDoc = {
        isPvpBot: true,
        firstName: "Rashad",
        lastName: "Vance",
        injuries: [],
        badgesEarned: [],
        media: {},
        toObject() {
            const { toObject, ...rest } = this;
            return { ...rest };
        },
    };
    const out = fighterService.toPublicFighter(fakeMongooseDoc);
    assert.equal(out.isPvpBot, undefined);
});

// ── 2. Source-text drift guard for the inline bot-DP clamp ─────────────────
//
// NOTE FOR MAINTAINERS: tests/services/pvpBot.test.js asserts DP-clamp behavior
// against `clampAttackerDpChange`, a hand-copied mirror of the inline clamp in
// services/pvpFightService.js (~line 734-740). That is a REAL coverage gap: if
// the inline clamp is edited and the mirror is not updated to match, the DP
// ceiling for bots (hard requirement #1) could silently break with all existing
// tests still green. This test is a cheap tripwire — it does not replace an
// integration test exercising the real runResolution() code path (which would
// require DB/Redis, out of scope for this pure-unit suite) — it only fails
// loudly if the clamp's shape in the source changes, prompting a human to check
// the mirror is still accurate. FLAG FOR ARCHITECT: consider extracting the
// clamp into an exported pure helper in pvpDpService (parameterized on
// isPvpBot/dpChange/recordDp) so it can be both used at the real call site AND
// unit-tested directly, instead of being copy-pasted into the test file.
test("pvpFightService inline bot-DP clamp source matches the shape pvpBot.test.js mirrors (drift tripwire)", () => {
    const src = fs.readFileSync(
        path.join(__dirname, "../../services/pvpFightService.js"),
        "utf8"
    );
    assert.match(
        src,
        /if \(attacker\.isPvpBot && effectiveAttackerDpChange > 0\) \{/,
        "the bot-DP clamp guard condition has changed shape — verify tests/services/pvpBot.test.js's " +
        "clampAttackerDpChange() mirror (and this QA report's requirement-1 verdict) still match the real code."
    );
    assert.match(
        src,
        /Math\.max\(\s*0,\s*Math\.min\(effectiveAttackerDpChange, BOT_MAX_DP - attackerRecord\.dp\)\s*\)/,
        "the bot-DP clamp math has changed — re-verify against tests/services/pvpBot.test.js's mirror."
    );
});

// ── 3. Bot never enters the promote branch — same invariant, asserted against
//    the REAL applyDpAndDivision with a clamp computed the same way the mirror
//    computes it, so at least the division/promote/peakDp SIDE is exercised
//    against production code (only the clamp itself remains mirrored). ───────
test("BOT_MAX_DP clamp + real applyDpAndDivision: repeated max wins never cross into elite", () => {
    const { applyDpAndDivision } = require("../../services/pvpDpService");
    const { BOT_MAX_DP } = require("../../consts/pvpBotConfig");
    const { divisionFloor } = require("../../consts/pvpConfig");

    const record = { dp: 2000, peakDp: 2000, division: "challenger" };
    // Simulate 30 consecutive bot wins of +120 base DP, clamped exactly as the
    // real inline code clamps (mirrored expression — see tripwire test above).
    for (let i = 0; i < 30; i++) {
        let change = 120;
        if (change > 0) {
            change = Math.max(0, Math.min(change, BOT_MAX_DP - record.dp));
        }
        applyDpAndDivision(record, change, { isWin: true });
        assert.ok(record.dp <= BOT_MAX_DP, `iteration ${i}: dp ${record.dp} exceeded BOT_MAX_DP`);
        assert.equal(record.division, "challenger", `iteration ${i}: division promoted past challenger`);
    }
    assert.equal(record.dp, BOT_MAX_DP);
    assert.ok(record.dp < divisionFloor("elite"));
});

// ── 4. Banner tier-plausibility (notorietyTier ordering), NOT covered by
//    pvpBot.test.js — that suite only checks badge/belt-gating and catalog
//    membership, never that a Prospect bot's pieces stay <= PROSPECT gating
//    (a bot could legally equip a RISING_STAR/CONTENDER-gated piece today and
//    no existing test would catch it, even though the roster file's own header
//    comment documents this as a rule). ──────────────────────────────────────
test("every bot's banner pieces are gated at or below its division's plausible notorietyTier", () => {
    const { ROSTER } = require("../../consts/pvpBotRoster");
    const { BANNER_PIECES } = require("../../consts/bannerCatalog");
    const { tierRank, NOTORIETY_TIERS } = require("../../consts/notorietyConfig");
    const { divisionForDp } = require("../../consts/pvpConfig");

    const byId = new Map(BANNER_PIECES.map((p) => [p.id, p]));
    // Documented in consts/pvpBotRoster.js's header comment.
    const MAX_TIER_FOR_DIVISION = {
        prospect: "PROSPECT",
        contender: "RISING_STAR",
        challenger: "CONTENDER",
    };

    for (const b of ROSTER) {
        const div = divisionForDp(b.dp);
        const maxTier = MAX_TIER_FOR_DIVISION[div];
        assert.ok(maxTier, `${b.first} ${b.last}: division ${div} has no documented max banner tier`);
        const maxRank = tierRank(maxTier);

        for (const pieceId of [b.banner.backgroundId, b.banner.frameId, b.banner.accentColor]) {
            const piece = byId.get(pieceId);
            if (!piece || !piece.unlockAt || !piece.unlockAt.notorietyTier) continue; // always/other gates handled elsewhere
            const pieceRank = tierRank(piece.unlockAt.notorietyTier);
            assert.ok(
                pieceRank <= maxRank,
                `${b.first} ${b.last} (${div}, plausible ceiling ${maxTier}) wears ${pieceId} ` +
                `gated at ${piece.unlockAt.notorietyTier} (rank ${pieceRank} > ${maxRank}) — implausible flex for a bot at this tier.`
            );
        }
    }
    // Sanity: the tier table itself must exist as expected, so this test fails loudly
    // (not silently no-ops) if notorietyConfig's tier keys are ever renamed.
    assert.ok(NOTORIETY_TIERS.PROSPECT && NOTORIETY_TIERS.RISING_STAR && NOTORIETY_TIERS.CONTENDER);
});
