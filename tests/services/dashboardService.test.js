/**
 * Unit tests for dashboardService.computeHeroAction — all 8 branches + ordering.
 * Pure function, no DB. Run with: node tests/services/dashboardService.test.js
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

test("1: mentalResetRequired wins over everything", () => {
    const r = computeHeroAction({
        ...base,
        mentalResetRequired: true,
        injuries: [{ cannotFight: true }],
        acceptedFightId: "f1",
        camp: { slotsRemaining: 2, finalised: false, isTitleFight: false },
        offers: [{ type: "TitleShot", locked: false }],
        energyCurrent: 0,
    });
    assert.equal(r.key, "mental_reset");
    assert.equal(r.linkTarget, "hospital");
});

test("2: blocking injury beats camp/offers/energy", () => {
    const r = computeHeroAction({
        ...base,
        injuries: [{ cannotFight: false }, { cannotFight: true, label: "Broken hand" }],
        acceptedFightId: "f1",
        camp: { slotsRemaining: 1, finalised: false, isTitleFight: false },
        offers: [{ type: "TitleShot", locked: false }],
    });
    assert.equal(r.key, "injury");
    assert.equal(r.linkTarget, "hospital");
});

test("3: continue camp with slots left (pluralisation)", () => {
    const many = computeHeroAction({
        ...base,
        acceptedFightId: "f1",
        camp: { slotsRemaining: 3, finalised: false, isTitleFight: false },
        offers: [{ type: "TitleShot", locked: false }],
    });
    assert.equal(many.key, "continue_camp");
    assert.match(many.sublabel, /3 training slots left/);

    const one = computeHeroAction({
        ...base,
        acceptedFightId: "f1",
        camp: { slotsRemaining: 1, finalised: false, isTitleFight: false },
    });
    assert.match(one.sublabel, /1 training slot left/);
    assert.ok(!/slots/.test(one.sublabel));
});

test("4: finalise camp when slots exhausted", () => {
    const r = computeHeroAction({
        ...base,
        acceptedFightId: "f1",
        camp: { slotsRemaining: 0, finalised: false, isTitleFight: false },
        offers: [{ type: "TitleShot", locked: false }],
    });
    assert.equal(r.key, "finalise_camp");
    assert.equal(r.linkTarget, "fights");
});

test("4b: finalised camp falls through to offers (not camp branches)", () => {
    const r = computeHeroAction({
        ...base,
        acceptedFightId: "f1",
        camp: { slotsRemaining: 2, finalised: true, isTitleFight: false },
        offers: [{ type: "TitleShot", locked: false }],
    });
    assert.equal(r.key, "title_shot");
});

test("5: unlocked title shot", () => {
    const r = computeHeroAction({
        ...base,
        offers: [{ type: "Even", locked: false }, { type: "TitleShot", locked: false }],
    });
    assert.equal(r.key, "title_shot");
    assert.equal(r.linkTarget, "fights");
});

test("5b: locked title shot does NOT trigger title_shot", () => {
    const r = computeHeroAction({
        ...base,
        offers: [{ type: "TitleShot", locked: true }],
    });
    // only a locked title shot present → fight_offer filters it out → falls to energy/train
    assert.notEqual(r.key, "title_shot");
});

test("6: regular fight offers (pluralisation + title excluded)", () => {
    const r = computeHeroAction({
        ...base,
        offers: [
            { type: "Easy", locked: false },
            { type: "Hard", locked: false },
            { type: "TitleShot", locked: true },
        ],
    });
    assert.equal(r.key, "fight_offer");
    assert.match(r.sublabel, /2 offers waiting/);

    const one = computeHeroAction({ ...base, offers: [{ type: "Even" }] });
    assert.match(one.sublabel, /1 offer waiting/);
    assert.ok(!/offers/.test(one.sublabel));
});

test("7: low energy", () => {
    const r = computeHeroAction({ ...base, offers: [], energyCurrent: 5, fightEnergyCost: 10 });
    assert.equal(r.key, "recover_energy");
    assert.equal(r.linkTarget, "gym");
});

test("8: default train", () => {
    const r = computeHeroAction({ ...base, offers: [], energyCurrent: 100, fightEnergyCost: 10 });
    assert.equal(r.key, "train");
    assert.equal(r.linkTarget, "gym");
});

test("8b: empty input is safe (default train)", () => {
    const r = computeHeroAction();
    assert.equal(r.key, "train");
});

// ── summariseOffers ─────────────────────────────────────────────────────────
test("summariseOffers: unlocked title shot is best; locked title excluded from count", () => {
    const offers = [
        { type: "Easy", opponent: { name: "A", overallRating: 20 } },
        { type: "TitleShot", locked: false, opponent: { name: "Champ", overallRating: 90 } },
    ];
    const s = summariseOffers(offers, "Amateur");
    assert.equal(s.count, 2);
    assert.equal(s.best.isTitleShot, true);
    assert.equal(s.best.offerType, "TitleShot");
    assert.equal(s.best.purse, 500); // Amateur signingFee
});

test("summariseOffers: locked title shot dropped from count, OVR tiebreak picks best", () => {
    const offers = [
        { type: "Easy", opponent: { name: "A", overallRating: 20 } },
        { type: "Hard", opponent: { name: "B", overallRating: 28 } },
        { type: "TitleShot", locked: true, opponent: { name: "C", overallRating: 90 } },
    ];
    const s = summariseOffers(offers, "Amateur");
    assert.equal(s.count, 2);
    assert.equal(s.best.opponentName, "B");
    assert.equal(s.best.opponentOvr, 28);
});

test("summariseOffers: empty -> count 0, best null", () => {
    const s = summariseOffers([], "Amateur");
    assert.deepEqual(s, { count: 0, best: null });
});

test("summariseOffers: unknown tier -> purse null", () => {
    const s = summariseOffers([{ type: "Even", opponent: { name: "X", overallRating: 30 } }], "Nope");
    assert.equal(s.best.purse, null);
});
