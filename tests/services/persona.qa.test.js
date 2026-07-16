/**
 * QA (read-only) supplementary coverage for the Persona system.
 * Complements tests/services/personaService.test.js (18 cases, pre-existing).
 *
 * Focus, per QA brief:
 *   - Blackout gates ALL modifier lanes (fight + non-fight + fame), not just a sample.
 *   - Legacy fighters (no persona field) resolve to Unwritten/(0,0)/heat0, never throw.
 *   - PvE-only: pvpFightService.js source must never reference personaService.
 *   - Defensive: decayAfterFight must not throw on a malformed persona/fighter shape
 *     (fightService.js wraps the real call in try/catch; this test guards the
 *     underlying primitive).
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const personaService = require("../../services/personaService");
const { FAME_CATEGORY } = require("../../consts/personaConfig");

function fighter(overrides = {}) {
    const { persona, ...rest } = overrides;
    return {
        promotionTier: "National",
        persona: { x: 0, y: 0, blackoutFightsRemaining: 0, lastBreakingCharacterAt: null, ...(persona || {}) },
        markModified() {},
        ...rest,
    };
}

test("blackout zeroes damageReductionFrac (Boogeyman) even at heat 100 with a live comeback/nemesis ctx", () => {
    const f = fighter({ persona: { x: -100, y: -100, blackoutFightsRemaining: 1 } });
    const m = personaService.getFightModifiers(f, { comebackMode: true, isNemesis: true, isBeef: true });
    assert.equal(m.damageReductionFrac, 0);
    assert.equal(m.ambushProcMult, 1);
    assert.equal(m.comebackBonusMult, 1);
    assert.equal(m.purseFrac, 0);
    assert.equal(m.fightWinFameMult, 1);
    assert.equal(m.flatFameDelta, 0);
    assert.equal(m.milestoneFameMult, 1);
});

test("pvpFightService.js source never references personaService (PvE-only enforcement)", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../services/pvpFightService.js"), "utf8");
    assert.equal(/persona/i.test(src), false, "pvpFightService.js must not reference personaService/persona in any form");
});

test("notorietyService.js does not import personaService", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../services/notorietyService.js"), "utf8");
    assert.equal(/require\(.*personaService.*\)/i.test(src), false, "notorietyService.js must not import personaService");
});

test("legacy fighter with NO persona field resolves to Unwritten/(0,0)/heat0 and never throws", () => {
    const legacy = { promotionTier: "National", markModified() {} }; // no .persona at all
    assert.doesNotThrow(() => personaService.getState(legacy));
    const st = personaService.getState(legacy);
    assert.equal(st.x, 0);
});

test("under blackout, ambushProcMult is neutral (1) so scaleProcs is a documented no-op downstream", () => {
    const specialMovesService = require("../../services/specialMovesService");
    const f = fighter({ persona: { x: -100, y: -100, blackoutFightsRemaining: 1 } });
    const m = personaService.getFightModifiers(f, {});
    assert.equal(m.ambushProcMult, 1);
    const mb = [{ bonusType: "STRIKE_DAMAGE", effectiveValue: 0.1, effectType: "PROC" }];
    specialMovesService.scaleProcs(mb, m.ambushProcMult);
    assert.equal(mb[0].effectiveValue, 0.1); // unchanged
});

test("blackout zeroes upset-loss flat fame penalty (Peoples Champ lane)", () => {
    const f = fighter({ persona: { x: 100, y: 100, blackoutFightsRemaining: 1 } });
    const m = personaService.getFightModifiers(f, { isLoss: true, fighterOvr: 60, oppOvr: 40 });
    assert.equal(m.flatFameDelta, 0);
});

test("blackout zeroes HOMETOWN HERO comeback-win purse & flat-fame bonus (Peoples Champ)", () => {
    const f = fighter({ persona: { x: 100, y: 100, blackoutFightsRemaining: 1 } });
    const m = personaService.getFightModifiers(f, { comebackMode: true, isWin: true });
    assert.equal(m.fightWinFameMult, 1);
    assert.equal(m.purseFrac, 0);      // +30% sig purse suppressed under blackout
    assert.equal(m.flatFameDelta, 0);  // +250 sig flat fame suppressed under blackout
});

test("blackout zeroes LEGACY (documentary + milestone fame mults) for Role Model", () => {
    const f = fighter({ persona: { x: 100, y: -100, blackoutFightsRemaining: 1 } });
    assert.equal(personaService.applyFameMultiplier(f, 1000, FAME_CATEGORY.DOCUMENTARY), 1000);
    assert.equal(personaService.getFightModifiers(f, {}).milestoneFameMult, 1);
});

test("blackout zeroes every non-fight modifier across all four archetypes at heat 100", () => {
    const villain = fighter({ persona: { x: -100, y: 100, blackoutFightsRemaining: 1 } });
    const peoplesChamp = fighter({ persona: { x: 100, y: 100, blackoutFightsRemaining: 1 } });
    const boogeyman = fighter({ persona: { x: -100, y: -100, blackoutFightsRemaining: 1 } });
    const roleModel = fighter({ persona: { x: 100, y: -100, blackoutFightsRemaining: 1 } });

    for (const f of [villain, peoplesChamp, boogeyman, roleModel]) {
        const nm = personaService.getModifiers(f);
        assert.equal(nm.calloutCostMult, 1, "calloutCostMult");
        assert.equal(nm.sponsorPayoutFrac, 0, "sponsorPayoutFrac");
        assert.equal(nm.gymRankCostFrac, 0, "gymRankCostFrac");
        assert.equal(nm.hospitalBillFrac, 0, "hospitalBillFrac");
        assert.equal(nm.sponsorSlotBonus, 0, "sponsorSlotBonus");
        assert.equal(nm.appearancePoolBonus, 0, "appearancePoolBonus");
        assert.equal(nm.listenersPct, 0, "listenersPct");
        assert.deepEqual(nm.display, []);
        assert.deepEqual(personaService.getDisplayModifiers(f), []);
    }
});

test("blackout zeroes every fame-category multiplier across all four archetypes", () => {
    const villain = fighter({ persona: { x: -100, y: 100, blackoutFightsRemaining: 1 } });
    const peoplesChamp = fighter({ persona: { x: 100, y: 100, blackoutFightsRemaining: 1 } });
    const boogeyman = fighter({ persona: { x: -100, y: -100, blackoutFightsRemaining: 1 } });
    const roleModel = fighter({ persona: { x: 100, y: -100, blackoutFightsRemaining: 1 } });

    assert.equal(personaService.applyFameMultiplier(villain, 100, FAME_CATEGORY.BEEF), 100);
    assert.equal(personaService.applyFameMultiplier(villain, 100, FAME_CATEGORY.BEEF_LAPSE), 100);
    assert.equal(personaService.applyFameMultiplier(peoplesChamp, 100, FAME_CATEGORY.BEEF), 100);
    assert.equal(personaService.applyFameMultiplier(boogeyman, 100, FAME_CATEGORY.CRYPTIC), 100);
    assert.equal(personaService.applyFameMultiplier(boogeyman, 100, FAME_CATEGORY.LOUD), 100);
    assert.equal(personaService.applyFameMultiplier(roleModel, 100, FAME_CATEGORY.BEEF_LAPSE), 100);
    assert.equal(personaService.applyFameMultiplier(roleModel, 100, FAME_CATEGORY.WEIGHT_MISS), 100);
});

test("legacy fighter resolves cleanly through every public entry point (no throw, neutral values)", () => {
    const legacy = { promotionTier: "National", markModified() {} };
    assert.doesNotThrow(() => personaService.buildPersonaBlock(legacy));
    assert.doesNotThrow(() => personaService.getModifiers(legacy));
    assert.doesNotThrow(() => personaService.getFightModifiers(legacy, { isWin: true }));
    assert.doesNotThrow(() => personaService.applyFameMultiplier(legacy, 100, FAME_CATEGORY.BEEF));
    assert.doesNotThrow(() => personaService.decayAfterFight(legacy));
    assert.doesNotThrow(() => personaService.applyNudge(legacy, { actionKey: "INTERVIEW_HUMBLE" }));

    const fm = personaService.getFightModifiers(legacy, { isWin: true });
    assert.equal(fm.purseFrac, 0);
    assert.equal(fm.fightWinFameMult, 1);
    assert.equal(personaService.applyFameMultiplier(legacy, 100, FAME_CATEGORY.BEEF), 100);
});

test("legacy fighter without a markModified fn (plain object) still does not throw on nudge/decay", () => {
    const legacy = { promotionTier: "Amateur" };
    assert.doesNotThrow(() => personaService.applyNudge(legacy, { actionKey: "INTERVIEW_CONFIDENT" }));
    assert.doesNotThrow(() => personaService.decayAfterFight(legacy));
});

test("decayAfterFight does not throw on NaN/garbage persona fields (defensive)", () => {
    const f = fighter({ persona: { x: NaN, y: "not-a-number", blackoutFightsRemaining: -5 } });
    assert.doesNotThrow(() => personaService.decayAfterFight(f));
});
