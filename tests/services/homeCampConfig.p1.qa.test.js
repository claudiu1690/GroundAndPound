/**
 * Your Camp PHASE 1 — config invariants and the fight-resolved hook's non-fatality.
 *
 * validateHomeCampConfig() already fails the BOOT when these break; re-asserting them here
 * documents WHY each rule exists and gives a failing test name instead of a stack trace at
 * startup. Several of these guard rules that are tempting to "clean up" (see the
 * grueling_fitness_test family note).
 *
 * Run with: node --test tests/services/homeCampConfig.p1.qa.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const HomeCamp = require("../../models/homeCampModel");
const coachService = require("../../services/homeCampCoachService");
const cfg = require("../../consts/homeCampConfig");

test("the boot validator passes for the shipped config", () => {
    assert.equal(cfg.validateHomeCampConfig(), true);
});

test("every archetype ships a complete 4-drill kit with one flagship at index 2", () => {
    for (const a of cfg.ARCHETYPE_KEYS) {
        const kit = cfg.COACH_DRILLS[a];
        assert.equal(kit.length, 4, `${a} kit`);
        assert.deepEqual(kit.map((d) => d.unlockRank), [1, 1, 2, 3], `${a} unlock sequence`);
        assert.deepEqual(kit.map((d) => !!d.isFlagship), [false, false, true, false], `${a} flagship position`);
    }
});

test("an injurious drill is ALWAYS blockable — family 'none' can never carry injury risk", () => {
    const all = [...Object.values(cfg.COACH_DRILLS).flat(), cfg.FALLBACK_DRILL];
    for (const d of all) {
        if (d.injuryPct > 0) {
            assert.notEqual(d.family, "none", `${d.key} risks injury but nothing can block it`);
        }
    }
    // Specifically: the Conditioning flagship's "bag" family is deliberate, not a typo.
    const flagship = cfg.COACH_DRILLS.CONDITIONING[2];
    assert.equal(flagship.key, "grueling_fitness_test");
    assert.equal(flagship.injuryPct, 4);
    assert.equal(flagship.family, "bag");
});

test("a statless drill earns no XP and always does something else instead", () => {
    for (const d of Object.values(cfg.COACH_DRILLS).flat()) {
        if (d.stats.length === 0) {
            assert.equal(d.xpBase, 0, `${d.key} would throw XP away`);
            assert.ok(d.raisesMaxStamina || d.condDelta !== 0, `${d.key} does nothing at all`);
        }
    }
});

test("hire fees and wages are exactly base × multiplier — the price shown is derivable", () => {
    for (const r of cfg.COACH_RARITIES) {
        const e = cfg.RARITY_ECONOMICS[r];
        assert.equal(e.hireFee, Math.round(cfg.COACH_BASE_HIRE_FEE * e.hireMult));
        assert.equal(e.wage, Math.round(cfg.COACH_BASE_WAGE * e.wageMult));
    }
    // The owner-approved top of the ladder.
    assert.equal(cfg.RARITY_ECONOMICS.LEGENDARY.hireFee, 5000);
    assert.equal(cfg.RARITY_ECONOMICS.LEGENDARY.wage, 2250);
});

test("market rarity odds are a real distribution over real rarities", () => {
    const sum = Object.values(cfg.MARKET_RARITY_ODDS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
    for (const k of Object.keys(cfg.MARKET_RARITY_ODDS)) assert.ok(cfg.COACH_RARITIES.includes(k));
});

test("all 12 traits are described, and no trait declares an unimplemented effect", () => {
    assert.equal(cfg.TRAIT_KEYS.length, 12);
    for (const k of cfg.TRAIT_KEYS) {
        const t = cfg.COACH_TRAITS[k];
        assert.ok(t.name && t.desc);
        assert.equal(typeof t.caution, "boolean");
        for (const key of Object.keys(t)) {
            if (["name", "desc", "caution"].includes(key)) continue;
            assert.ok(cfg.TRAIT_EFFECT_KEYS.includes(key), `${k} declares unknown effect "${key}"`);
        }
    }
});

test("morale thresholds are ordered so the warning always precedes the penalty", () => {
    assert.ok(cfg.MORALE_XP_HALVED_BELOW < cfg.MORALE_NEED_THRESHOLD);
    assert.ok(cfg.MORALE_NEED_THRESHOLD <= cfg.MORALE_MAX);
    assert.ok(cfg.MORALE_QUIT_AT < cfg.MORALE_XP_HALVED_BELOW);
});

test("the flagship pool bias ships LIVE at 1.0", () => {
    assert.equal(cfg.FLAGSHIP_POOL_BIAS, 1.0);
});

test("accessors hand back FRESH copies — shared config can never leak between requests", () => {
    const a = cfg.traitView("LOYAL");
    a.name = "MUTATED";
    assert.equal(cfg.traitView("LOYAL").name, "Loyal");

    const e = cfg.rarityEconomics("RARE");
    e.hireFee = 1;
    assert.equal(cfg.rarityEconomics("RARE").hireFee, 3000);

    const r = cfg.renovationFor(2);
    r.cost = 1;
    assert.equal(cfg.renovationFor(2).cost, 2000);
    assert.equal(cfg.renovationFor(3), null);
});

// ── onFightResolved: it may never break a fight ──────────────────────────────

test("onFightResolved no-ops (never throws) on junk input", async () => {
    assert.deepEqual(await coachService.onFightResolved(null, "KO/TKO", { isWin: true }),
        { credited: 0, conditionGained: 0, moraleGained: 0 });
    assert.deepEqual(await coachService.onFightResolved({}, undefined, {}),
        { credited: 0, conditionGained: 0, moraleGained: 0 });
});

test("a database failure inside onFightResolved is swallowed, not thrown into the fight path", async () => {
    const real = HomeCamp.findOne;
    HomeCamp.findOne = async () => { throw new Error("mongo is on fire"); };
    try {
        const r = await coachService.onFightResolved({ _id: "f1" }, "KO/TKO", { isWin: true });
        assert.deepEqual(r, { credited: 0, conditionGained: 0, moraleGained: 0 });
    } finally {
        HomeCamp.findOne = real;
    }
});
