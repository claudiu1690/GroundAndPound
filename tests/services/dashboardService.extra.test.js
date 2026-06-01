/**
 * Supplemental QA coverage for dashboardService — branches the original
 * suite does not exercise. Pure-function only (no DB). Added by QA audit.
 *
 *   - acceptedFightId set but camp === null  → must fall through, not crash
 *   - camp present but acceptedFightId null   → camp branches must NOT fire
 *   - injuries with cannotFight:false only    → must NOT route to hospital
 *   - energyCurrent === fightEnergyCost (boundary) → NOT low
 *   - summariseOffers tier-null purse (mirrors the LIVE buildOffers call,
 *     which passes null and therefore always emits purse:null)
 */
const assert = require("node:assert");
const { test } = require("node:test");
const { computeHeroAction, summariseOffers } = require("../../services/dashboardService");

const base = {
    mentalResetRequired: false,
    injuries: [],
    acceptedFightId: null,
    camp: null,
    offers: [],
    energyCurrent: 100,
    fightEnergyCost: 10,
};

test("acceptedFightId set but camp null → falls through (no crash, lands on train)", () => {
    const r = computeHeroAction({ ...base, acceptedFightId: "f1", camp: null });
    assert.equal(r.key, "train");
});

test("acceptedFightId set, camp null, but offers waiting → offers branch wins", () => {
    const r = computeHeroAction({
        ...base,
        acceptedFightId: "f1",
        camp: null,
        offers: [{ type: "Even", locked: false }],
    });
    assert.equal(r.key, "fight_offer");
});

test("camp present but acceptedFightId null → camp branches do NOT fire", () => {
    const r = computeHeroAction({
        ...base,
        acceptedFightId: null,
        camp: { slotsRemaining: 2, finalised: false, isTitleFight: false },
    });
    // No acceptedFightId guard fails branches 3 & 4 → default train.
    assert.equal(r.key, "train");
});

test("injuries all cannotFight:false → NOT routed to hospital", () => {
    const r = computeHeroAction({
        ...base,
        injuries: [{ cannotFight: false }, { cannotFight: false }],
    });
    assert.notEqual(r.linkTarget, "hospital");
    assert.equal(r.key, "train");
});

test("energyCurrent === fightEnergyCost is NOT low (boundary)", () => {
    const r = computeHeroAction({ ...base, energyCurrent: 10, fightEnergyCost: 10 });
    assert.equal(r.key, "train");
});

test("energyCurrent one below cost IS low", () => {
    const r = computeHeroAction({ ...base, energyCurrent: 9, fightEnergyCost: 10 });
    assert.equal(r.key, "recover_energy");
});

test("CONTRACT: live buildOffers passes tier=null → purse always null", () => {
    // buildOffers() calls summariseOffers(offers, null) — so even a valid tier
    // fighter gets purse:null in the response. This test documents that gap.
    const offers = [{ type: "Even", opponent: { name: "X", overallRating: 30 } }];
    const s = summariseOffers(offers, null);
    assert.equal(s.best.purse, null);
    // …whereas passing the real tier WOULD populate it:
    const s2 = summariseOffers(offers, "Amateur");
    assert.equal(s2.best.purse, 400);
});
