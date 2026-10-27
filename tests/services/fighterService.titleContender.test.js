/**
 * fighterService.toPublicFighter (the OWNER payload of GET /fighters/:id) ships
 * titleContender (fightService.isTitleContender) and gcsTitleWins (via toObject).
 * toPublicProjection (the non-owner view) ships neither.
 * (docs/gcs-title-contract.md B21)
 *
 * Pure: plain objects, no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const fighterService = require("../../services/fighterService");

function doc(over = {}) {
    return {
        firstName: "Pat", lastName: "Doe", promotionTier: "Regional Pro", weightClass: "Lightweight",
        pendingPromotion: null, gcsTitleWins: 0, notoriety: { score: 0 }, ranking: { rank: 4 },
        ...over,
    };
}

test("owner payload: GCS fighter with no pending promotion is a title contender", () => {
    const out = fighterService.toPublicFighter(doc({ promotionTier: "GCS", gcsTitleWins: 2 }));
    assert.equal(out.titleContender, true);
    assert.equal(out.gcsTitleWins, 2);
});

test("owner payload: a pending promotion is a contender; none below GCS is not", () => {
    assert.equal(fighterService.toPublicFighter(doc({ pendingPromotion: "National" })).titleContender, true);
    assert.equal(fighterService.toPublicFighter(doc()).titleContender, false);
    assert.equal(fighterService.toPublicFighter(doc({ promotionTier: "GCS Contender" })).titleContender, false);
});

test("non-owner projection carries neither titleContender nor gcsTitleWins", () => {
    const out = fighterService.toPublicProjection(doc({ promotionTier: "GCS", gcsTitleWins: 3 }));
    assert.equal(Object.prototype.hasOwnProperty.call(out, "titleContender"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(out, "gcsTitleWins"), false);
});
