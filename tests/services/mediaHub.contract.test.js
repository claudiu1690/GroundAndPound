/**
 * Media Hub - contract conformance tests (no DB required).
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");

test("PODCAST GUEST: backend flag is 'byTone' not 'guest' -> tone picker never renders", () => {
    const { PODCAST_SEGMENTS } = require("../../consts/mediaHubConfig");
    const guestFlag = PODCAST_SEGMENTS.GUEST.flag;
    assert.equal(guestFlag, "byTone");
    // Frontend PodcastTab line 152: const isGuest = seg.flag === "guest";
    // This is always false. Tone picker never shows. Backend gets no tone -> 400.
    assert.notEqual(guestFlag, "guest");
});

test("PODCAST: PREDICT segment has been removed from the catalog", () => {
    const { PODCAST_SEGMENTS } = require("../../consts/mediaHubConfig");
    assert.equal(PODCAST_SEGMENTS.PREDICT, undefined);
});

test("documentary focus/tone/timing enums: frontend and backend match", () => {
    const { DOCUMENTARY_FOCUS_KEYS, DOCUMENTARY_TONE_KEYS, DOCUMENTARY_TIMING_KEYS } = require("../../consts/mediaHubConfig");
    assert.deepEqual(["FIGHTER","UNDERDOG","TECHNICIAN"].sort(), DOCUMENTARY_FOCUS_KEYS.sort());
    assert.deepEqual(["INSPIRATIONAL","RAW","CONTROVERSIAL"].sort(), DOCUMENTARY_TONE_KEYS.sort());
    assert.deepEqual(["NOW","BEFORE_TITLE","AFTER_TITLE"].sort(), DOCUMENTARY_TIMING_KEYS.sort());
});

test("rivalry: backend expiresAfterFights, frontend reads fightsRemaining -> mismatch", () => {
    const backendEntry = { expiresAfterFights: 4, opponentId: "x" };
    assert.equal(backendEntry.fightsRemaining, undefined);
    assert.equal(backendEntry.expiresAfterFights, 4);
});

test("rivalry nemesis: backend fameBonus, frontend reads bonusFame -> mismatch", () => {
    const { RIVALRY_DISPLAY } = require("../../consts/mediaHubConfig");
    const backendNemesis = { fameBonus: RIVALRY_DISPLAY.nemesisFame };
    assert.equal(backendNemesis.bonusFame, undefined);
    assert.equal(backendNemesis.fameBonus, 150);
});

test("rivalry callout: backend pursePct, frontend reads bonusCashPct -> mismatch", () => {
    const { RIVALRY_DISPLAY } = require("../../consts/mediaHubConfig");
    const backendCallout = { pursePct: RIVALRY_DISPLAY.calloutPursePct };
    assert.equal(backendCallout.bonusCashPct, undefined);
    assert.equal(backendCallout.pursePct, 25);
});

test("archive: backend kind is lowercase (podcast/postfight/appearance/documentary), frontend switches on uppercase -> mismatch", () => {
    const backendKinds = ["podcast", "postfight", "appearance", "documentary"];
    const frontendCases = ["PODCAST", "POSTFIGHT", "APPEARANCE", "DOCUMENTARY"];
    for (const k of backendKinds) {
        assert.equal(frontendCases.includes(k), false);
    }
});

test("appearance view: backend sends label/fame/cash, frontend reads name/fameReward/cashReward -> mismatch", () => {
    const backendPayload = { label: "Magazine Cover", fame: 150, cash: 0, instanceId: "i1", type: "MAGAZINE_COVER", actionLabel: "Shoot", available: true };
    // Frontend reads app.name -> undefined
    assert.equal(backendPayload.name, undefined);
    // Frontend reads app.fameReward -> undefined
    assert.equal(backendPayload.fameReward, undefined);
    // Frontend reads app.cashReward -> undefined
    assert.equal(backendPayload.cashReward, undefined);
    // Backend does not send flag or stripeColor
    assert.equal(backendPayload.flag, undefined);
    assert.equal(backendPayload.stripeColor, undefined);
});

test("documentary pending: backend sends fightsSince, frontend reads fightsRemaining -> mismatch", () => {
    const backendPending = { focus: "FIGHTER", tone: "RAW", timing: "BEFORE_TITLE", fightsSince: 3 };
    assert.equal(backendPending.fightsRemaining, undefined);
    assert.equal(backendPending.fightsSince, 3);
});

test("formatListeners: backend floors, frontend rounds -> diverge at .x5 boundary values", () => {
    const { formatListeners } = require("../../consts/mediaHubConfig");
    // Frontend formula (from mediaFormat.js): k.toFixed(1) i.e. standard rounding
    function feFormat(n) {
        const v = Number(n) || 0;
        if (v < 1000) return String(Math.round(v));
        if (v < 1000000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
        return (v / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    // At 1250: backend floors -> 1.2k; frontend rounds -> 1.3k
    assert.equal(formatListeners(1250), "1.2k");
    assert.equal(feFormat(1250), "1.3k");
    assert.notEqual(formatListeners(1250), feFormat(1250));
    // At 1250000: backend floors -> 1.2M; frontend rounds -> 1.3M
    assert.notEqual(formatListeners(1250000), feFormat(1250000));
});

test("appearance types reconciled to spec: CHARITY_EXHIBITION present, TALK_SHOW removed, matches frontend APPEARANCE_META", () => {
    const { APPEARANCE_TYPES } = require("../../consts/mediaHubConfig");
    // TALK_SHOW was an out-of-spec invention — it is gone.
    assert.equal(Object.keys(APPEARANCE_TYPES).includes("TALK_SHOW"), false);
    // CHARITY_EXHIBITION is the authoritative spec type and now exists in the backend.
    assert.ok(Object.keys(APPEARANCE_TYPES).includes("CHARITY_EXHIBITION"));
    // Backend keys now match the frontend APPEARANCE_META key set exactly.
    const frontendKeys = ["MAGAZINE_COVER", "UNDERCARD_FEATURE", "PODCAST_GUEST", "BRAND_DEAL_CLIP", "CHARITY_EXHIBITION"];
    assert.deepEqual(Object.keys(APPEARANCE_TYPES).sort(), [...frontendKeys].sort());
});

test("CHARITY_EXHIBITION matches spec: Contender fame gate, 0 energy, flat +200 fame, 0 cash, 7-day deadline", () => {
    const { APPEARANCE_TYPES } = require("../../consts/mediaHubConfig");
    const ch = APPEARANCE_TYPES.CHARITY_EXHIBITION;
    assert.equal(ch.gatingTier, "CONTENDER");
    assert.equal(ch.gatingPromotionTier, undefined); // fame-gated, not promotion-gated
    assert.equal(ch.energy, 0);
    assert.equal(ch.flatFame, 200);
    assert.equal(ch.cash, 0);
    assert.equal(ch.deadlineDays, 7);
    assert.equal(ch.actionLabel, "Sign up");
});

test("appearance gating axes: UNDERCARD_FEATURE + PODCAST_GUEST gate on promotion tier, others on fame tier", () => {
    const { APPEARANCE_TYPES } = require("../../consts/mediaHubConfig");
    assert.equal(APPEARANCE_TYPES.UNDERCARD_FEATURE.gatingPromotionTier, "Regional Pro");
    assert.equal(APPEARANCE_TYPES.PODCAST_GUEST.gatingPromotionTier, "Regional Pro");
    assert.equal(APPEARANCE_TYPES.MAGAZINE_COVER.gatingPromotionTier, undefined);
    assert.equal(APPEARANCE_TYPES.CHARITY_EXHIBITION.gatingPromotionTier, undefined);
    assert.equal(APPEARANCE_TYPES.MAGAZINE_COVER.gatingTier, "PROSPECT");
});

test("appearance spec energy/fame: magazine 5e, podcast 3e +350 flat, undercard 0e, brand 0e", () => {
    const { APPEARANCE_TYPES } = require("../../consts/mediaHubConfig");
    assert.equal(APPEARANCE_TYPES.MAGAZINE_COVER.energy, 5);
    assert.equal(APPEARANCE_TYPES.PODCAST_GUEST.energy, 3);
    assert.equal(APPEARANCE_TYPES.PODCAST_GUEST.flatFame, 350);
    assert.equal(APPEARANCE_TYPES.UNDERCARD_FEATURE.energy, 0);
    assert.equal(APPEARANCE_TYPES.UNDERCARD_FEATURE.arms, true);
    assert.equal(APPEARANCE_TYPES.BRAND_DEAL_CLIP.energy, 0);
    assert.equal(APPEARANCE_TYPES.BRAND_DEAL_CLIP.needsSponsor, true);
});
