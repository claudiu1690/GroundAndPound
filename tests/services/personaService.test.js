const assert = require("node:assert/strict");
const { test } = require("node:test");

const personaService = require("../../services/personaService");
const specialMovesService = require("../../services/specialMovesService");
const { ARCHETYPE, FAME_CATEGORY } = require("../../consts/personaConfig");

function fighter(overrides = {}) {
    const { persona, ...rest } = overrides;
    return {
        promotionTier: "National", // uncapped by default so heat can exceed 50
        persona: { x: 0, y: 0, blackoutFightsRemaining: 0, lastBreakingCharacterAt: null, ...(persona || {}) },
        markModified() {},
        ...rest,
    };
}

// ── Heat + archetype resolution ────────────────────────────────────────────────

test("heat = round((|x|+|y|)/2), clamped 0..100", () => {
    assert.equal(personaService.rawHeat(0, 0), 0);
    assert.equal(personaService.rawHeat(50, 50), 50);
    assert.equal(personaService.rawHeat(-80, 60), 70);
    assert.equal(personaService.rawHeat(100, 100), 100);
    assert.equal(personaService.rawHeat(-3, -8), 6); // round(5.5)=6
});

test("archetype from sign(x),sign(y); UNWRITTEN when an axis is 0 or heat<25", () => {
    // heat 60 with real quadrants
    assert.equal(personaService.getState(fighter({ persona: { x: 60, y: 60 } })).archetype, ARCHETYPE.PEOPLES_CHAMP);
    assert.equal(personaService.getState(fighter({ persona: { x: 60, y: -60 } })).archetype, ARCHETYPE.ROLE_MODEL);
    assert.equal(personaService.getState(fighter({ persona: { x: -60, y: 60 } })).archetype, ARCHETYPE.VILLAIN);
    assert.equal(personaService.getState(fighter({ persona: { x: -60, y: -60 } })).archetype, ARCHETYPE.BOOGEYMAN);
    // axis exactly 0 → UNWRITTEN even at high heat
    assert.equal(personaService.getState(fighter({ persona: { x: 0, y: 100 } })).archetype, ARCHETYPE.UNWRITTEN);
    // heat below 25 → UNWRITTEN
    assert.equal(personaService.getState(fighter({ persona: { x: 20, y: 20 } })).archetype, ARCHETYPE.UNWRITTEN);
});

test("signatureActive requires heat>=70, blackout 0, real archetype", () => {
    assert.equal(personaService.getState(fighter({ persona: { x: 70, y: 70 } })).signatureActive, true);
    assert.equal(personaService.getState(fighter({ persona: { x: 65, y: 65 } })).signatureActive, false); // heat 65
    assert.equal(personaService.getState(fighter({ persona: { x: 70, y: 70, blackoutFightsRemaining: 1 } })).signatureActive, false);
});

// ── heatFrac scaling: Type A / B / C ────────────────────────────────────────────

// heatFrac curve: 50% strength at the 25-heat archetype floor, linear to 100%
// at 100 heat — hf(heat) = 0.5 + 0.5*(heat-25)/75. (A raw heat/100 curve made
// low-heat modifiers read as ~1% rounding errors players couldn't care about.)

test("Type A scales additively with heatFrac (Boogeyman purse +8%)", () => {
    // heat 50 → hf 0.5+0.5*(25/75) = 2/3 → 0.08*(2/3) ≈ 0.05333
    const f = fighter({ persona: { x: -50, y: -50 } });
    const m = personaService.getFightModifiers(f, {});
    assert.ok(Math.abs(m.purseFrac - 0.08 * (2 / 3)) < 1e-9);
});

test("Type B scales multiplier with heatFrac (Villain BEEF fame ×2)", () => {
    // heat 50 → hf 2/3 → mult = 1 + (2-1)*(2/3) ≈ 1.667 → 100 fame → 167
    const f = fighter({ persona: { x: -50, y: 50 } });
    assert.equal(personaService.applyFameMultiplier(f, 100, FAME_CATEGORY.BEEF), 167);
    // heat 100 → full ×2
    const f2 = fighter({ persona: { x: -100, y: 100 } });
    assert.equal(personaService.applyFameMultiplier(f2, 100, FAME_CATEGORY.BEEF), 200);
    // heat 25 (the archetype floor) → hf 0.5 → ×1.5: claiming a persona is FELT.
    const f3 = fighter({ persona: { x: -25, y: 25 } });
    assert.equal(personaService.applyFameMultiplier(f3, 100, FAME_CATEGORY.BEEF), 150);
});

test("Type C unlocks in full only at heat>=70 (People's Champ +1 sponsor slot)", () => {
    assert.equal(personaService.getModifiers(fighter({ persona: { x: 65, y: 65 } })).sponsorSlotBonus, 0);
    assert.equal(personaService.getModifiers(fighter({ persona: { x: 70, y: 70 } })).sponsorSlotBonus, 1);
    assert.equal(personaService.getModifiers(fighter({ persona: { x: 90, y: 90 } })).appearancePoolBonus, 1);
});

// ── Persona Moments: crowning + signature milestone payloads ────────────────────

test("crowning fires once ever per archetype (crownedArchetypes gates repeats)", () => {
    // Unwritten (heat 20) → nudge into Villain territory → crowned
    const f = fighter({ persona: { x: -20, y: 20 } });
    const r1 = personaService.applyNudge(f, { dx: -10, dy: 10 });
    assert.equal(r1.crowned, ARCHETYPE.VILLAIN);
    assert.equal(r1.crownedInfo.label, "The Villain");
    assert.ok(typeof r1.crownedInfo.epithet === "string" && r1.crownedInfo.epithet.length > 0);
    assert.ok(Array.isArray(r1.crownedInfo.modifiers) && r1.crownedInfo.modifiers.length > 0);
    assert.deepEqual(f.persona.crownedArchetypes, [ARCHETYPE.VILLAIN]);

    // Deeper into the same archetype → no re-crowning
    const r2 = personaService.applyNudge(f, { dx: -10, dy: 10 });
    assert.equal(r2.crowned, null);

    // Decay out below the floor, then re-enter → still no re-crowning
    const f2 = fighter({ persona: { x: -20, y: 20, crownedArchetypes: [ARCHETYPE.VILLAIN] } });
    const r3 = personaService.applyNudge(f2, { dx: -10, dy: 10 });
    assert.equal(r3.crowned, null);

    // Full switch to a NEW archetype → crowned for that one
    const f3 = fighter({ persona: { x: -40, y: 40, crownedArchetypes: [ARCHETYPE.VILLAIN] } });
    const r4 = personaService.applyNudge(f3, { dx: 90, dy: 0 }); // x flips to +50 → People's Champ
    assert.equal(r4.crowned, ARCHETYPE.PEOPLES_CHAMP);
    assert.deepEqual(f3.persona.crownedArchetypes, [ARCHETYPE.VILLAIN, ARCHETYPE.PEOPLES_CHAMP]);
});

test("signature activation attaches signatureInfo (name/desc/heat)", () => {
    const f = fighter({ persona: { x: -65, y: 65, crownedArchetypes: [ARCHETYPE.VILLAIN] } });
    const r = personaService.applyNudge(f, { dx: -10, dy: 10 }); // heat 65 → 75
    assert.equal(r.signatureActivated, true);
    assert.equal(r.signatureInfo.name, "BAD BLOOD");
    assert.ok(r.signatureInfo.desc.includes("BAD BLOOD"));
    assert.ok(r.signatureInfo.heat >= 70);
    // No crowning here (already crowned), and no signatureInfo without activation
    assert.equal(r.crowned, null);
    const r2 = personaService.applyNudge(f, { dx: -5, dy: 5 }); // still ≥70, already active
    assert.equal(r2.signatureActivated, false);
    assert.equal(r2.signatureInfo, undefined);
});

test("priceAdjust: attribution tag for adjusted prices; null when inert", () => {
    // Role Model at heat 50 → hf 2/3 → gym cost −10%*(2/3) ≈ −7%
    const rm = fighter({ persona: { x: 50, y: -50 } });
    const tag = personaService.priceAdjust(rm, "gymRankCostFrac");
    assert.equal(tag.pct, -7);
    assert.equal(tag.label, "The Role Model");
    // Villain sponsor payout at full heat → −35%
    const v = fighter({ persona: { x: -100, y: 100 } });
    assert.deepEqual(personaService.priceAdjust(v, "sponsorPayoutFrac"), { pct: -35, label: "The Villain" });
    // Unwritten and blackout → null (no tag, base price shown untouched)
    assert.equal(personaService.priceAdjust(fighter({ persona: { x: 0, y: 0 } }), "gymRankCostFrac"), null);
    assert.equal(personaService.priceAdjust(fighter({ persona: { x: 50, y: -50, blackoutFightsRemaining: 1 } }), "gymRankCostFrac"), null);
    // A lane the archetype doesn't have → null (Villain has no gym discount)
    assert.equal(personaService.priceAdjust(v, "gymRankCostFrac"), null);
});

// ── Blackout gates ALL modifiers ────────────────────────────────────────────────

test("blackout zeroes every modifier + fame multiplier", () => {
    const f = fighter({ persona: { x: -100, y: 100, blackoutFightsRemaining: 1 } });
    const fm = personaService.getFightModifiers(f, { isBeef: true, isNemesis: true });
    assert.equal(fm.purseFrac, 0);
    assert.equal(fm.fightWinFameMult, 1);
    const nm = personaService.getModifiers(f);
    assert.equal(nm.calloutCostMult, 1);
    assert.equal(personaService.applyFameMultiplier(f, 100, FAME_CATEGORY.BEEF), 100);
});

// ── Breaking Character ──────────────────────────────────────────────────────────

test("Breaking Character: diagonal-opposite action at heat>=40 → ×1.5 nudge, shatter, blackout", () => {
    // Villain at heat ~60 (x=-60,y=60). Defining Role-Model action (diagonal opposite).
    const f = fighter({ persona: { x: -60, y: 60 } });
    const r = personaService.applyNudge(f, { actionKey: "INTERVIEW_HUMBLE" });
    assert.equal(r.breakingCharacter, true);
    assert.equal(r.shattered, true);
    assert.equal(r.blackoutSet, true);
    assert.equal(f.persona.blackoutFightsRemaining, 1);
    assert.ok(f.persona.lastBreakingCharacterAt instanceof Date);
    // Shatter pulls both axes toward center (magnitude drops).
    assert.ok(Math.abs(f.persona.x) < 60);
    assert.ok(Math.abs(f.persona.y) < 60);
});

test("previewNudge flags breakingCharacter (drives the ×2 fame) without mutating", () => {
    const f = fighter({ persona: { x: -60, y: 60 } }); // Villain heat 60
    const p = personaService.previewNudge(f, { actionKey: "INTERVIEW_HUMBLE" });
    assert.equal(p.breakingCharacter, true);
    assert.equal(p.wouldSetBlackout, true);
    assert.equal(f.persona.x, -60); // pure — unchanged
    assert.equal(f.persona.y, 60);
});

test("below heat 40 a diagonal-opposite action is a plain nudge (no break)", () => {
    // Villain-ish but low heat: x=-30,y=30 → heat 30 (>=25 so archetype VILLAIN, <40 no break)
    const f = fighter({ persona: { x: -30, y: 30 } });
    const r = personaService.applyNudge(f, { actionKey: "INTERVIEW_HUMBLE" });
    assert.equal(r.breakingCharacter, false);
    assert.equal(f.persona.blackoutFightsRemaining, 0);
    // Humble is Loved+Quiet → slow-build applied: dx=round(6*.75)=5, dy=round(-6*.75)=-4
    assert.equal(f.persona.x, -25);
    assert.equal(f.persona.y, 26);
});

// ── Role-Model slow-build ───────────────────────────────────────────────────────

test("Role-Model slow-build ×0.75 on Loved+Quiet nudges only", () => {
    // Humble +6/-6 → round(6*.75)=5 / round(-6*.75)=-4 (JS rounds -4.5 to -4)
    const preview = personaService.previewNudge(fighter(), { actionKey: "INTERVIEW_HUMBLE" });
    assert.equal(preview.dx, 5);
    assert.equal(preview.dy, -4);
    // A Villain nudge (Hated+Loud) is NOT slowed.
    const villain = personaService.previewNudge(fighter(), { actionKey: "INTERVIEW_CALLOUT" });
    assert.equal(villain.dx, -8);
    assert.equal(villain.dy, 8);
});

// ── Decay ───────────────────────────────────────────────────────────────────────

test("decayAfterFight: blackout--, then x/y *= 0.95 rounded", () => {
    const f = fighter({ persona: { x: 100, y: -40, blackoutFightsRemaining: 1 } });
    personaService.decayAfterFight(f);
    assert.equal(f.persona.blackoutFightsRemaining, 0);
    assert.equal(f.persona.x, 95); // round(100*.95)
    assert.equal(f.persona.y, -38); // round(-40*.95)=round(-38)= -38
});

// ── Pre-Regional heat cap ────────────────────────────────────────────────────────

test("pre-Regional cap holds effective heat at 50 (x/y untouched), lifts at Regional Pro", () => {
    const amateur = fighter({ promotionTier: "Amateur", persona: { x: 90, y: 90 } });
    const st = personaService.getState(amateur);
    assert.equal(st.heat, 50);
    assert.equal(st.heatCapped, true);
    assert.equal(st.x, 90); // axes untouched
    assert.equal(st.signatureActive, false); // capped below 70

    const regional = fighter({ promotionTier: "Regional Pro", persona: { x: 90, y: 90 } });
    const st2 = personaService.getState(regional);
    assert.equal(st2.heat, 90);
    assert.equal(st2.heatCapped, false);
    assert.equal(st2.signatureActive, true);
});

// ── moveBonuses COLLAPSE invariant (merge, not append) ──────────────────────────

test("mergePersonaBonus SUMS into existing OPPONENT_DAMAGE_REDUCTION entry (no append)", () => {
    const moveBonuses = [
        { moveId: "iron_guard", bonusType: "OPPONENT_DAMAGE_REDUCTION", effectiveValue: 0.05, effectType: "PASSIVE" },
    ];
    specialMovesService.mergePersonaBonus(moveBonuses, "OPPONENT_DAMAGE_REDUCTION", 0.02);
    const entries = moveBonuses.filter((b) => b.bonusType === "OPPONENT_DAMAGE_REDUCTION");
    assert.equal(entries.length, 1); // COLLAPSE: still exactly one entry
    assert.ok(Math.abs(entries[0].effectiveValue - 0.07) < 1e-9);
});

test("mergePersonaBonus pushes one entry when none exists; no-op on 0", () => {
    const mb = [];
    specialMovesService.mergePersonaBonus(mb, "OPPONENT_DAMAGE_REDUCTION", 0.02);
    assert.equal(mb.length, 1);
    assert.equal(mb[0].effectiveValue, 0.02);
    specialMovesService.mergePersonaBonus(mb, "OPPONENT_DAMAGE_REDUCTION", 0);
    assert.equal(mb.length, 1); // unchanged
    assert.equal(mb[0].effectiveValue, 0.02);
});

test("scaleProcs scales only whitelisted PROCs, excludes SPRAWL, caps at +0.02, skips passive/sig", () => {
    const mb = [
        { bonusType: "GNP_DAMAGE",     effectiveValue: 0.10, effectType: "PROC" },      // whitelisted → ×1.10 = 0.11 (cap not binding)
        { bonusType: "SPRAWL_SUCCESS", effectiveValue: 0.10, effectType: "PROC" },      // EXCLUDED → untouched
        { bonusType: "ALL_STATS",      effectiveValue: 0.05, effectType: "PASSIVE" },   // passive → untouched
        { bonusType: "SIG_FINISHER_STRIKE", effectiveValue: 0.20, effectType: "SIGNATURE" }, // sig → untouched
        { bonusType: "STAMINA_DRAIN",  effectiveValue: 0.50, effectType: "PROC" },      // ×1.10 = 0.55 → cap min(0.55, 0.52) = 0.52
    ];
    specialMovesService.scaleProcs(mb, 1.10);
    assert.ok(Math.abs(mb[0].effectiveValue - 0.11) < 1e-9);
    assert.equal(mb[1].effectiveValue, 0.10);
    assert.equal(mb[2].effectiveValue, 0.05);
    assert.equal(mb[3].effectiveValue, 0.20);
    assert.ok(Math.abs(mb[4].effectiveValue - 0.52) < 1e-9);
});

test("AMBUSH signature exposes ambushProcMult 1.10 at heat>=70", () => {
    const f = fighter({ persona: { x: -100, y: -100 } }); // Boogeyman heat 100
    assert.equal(personaService.getFightModifiers(f, {}).ambushProcMult, 1.10);
});

// ── Signature folds in getFightModifiers ────────────────────────────────────────

test("BAD BLOOD: nemesis/beef fights get ×1.5 fame and +15% purse at heat>=70", () => {
    const f = fighter({ persona: { x: -100, y: 100 } }); // Villain heat 100
    const m = personaService.getFightModifiers(f, { isNemesis: true });
    assert.equal(m.fightWinFameMult, 1.5);
    // purse = 0.15 (full at heat 100) + 0.15 sig = 0.30
    assert.ok(Math.abs(m.purseFrac - 0.30) < 1e-9);
    // non-nemesis, non-beef → no sig
    const m2 = personaService.getFightModifiers(f, {});
    assert.equal(m2.fightWinFameMult, 1);
    assert.ok(Math.abs(m2.purseFrac - 0.15) < 1e-9);
});

test("Villain sponsor payout cost is −0.35 at full heat (independent of Boogeyman −0.20)", () => {
    const villain = fighter({ persona: { x: -100, y: 100 } });
    assert.ok(Math.abs(personaService.getModifiers(villain).sponsorPayoutFrac - (-0.35)) < 1e-9);
    const boogey = fighter({ persona: { x: -100, y: -100 } });
    assert.ok(Math.abs(personaService.getModifiers(boogey).sponsorPayoutFrac - (-0.20)) < 1e-9);
});

test("HOMETOWN HERO: comeback WIN gets +30% purse & +250 flat fame (no fame/cash mult)", () => {
    const f = fighter({ persona: { x: 100, y: 100 } }); // People's Champ heat 100
    const m = personaService.getFightModifiers(f, { comebackMode: true, isWin: true });
    assert.ok(Math.abs(m.purseFrac - 0.35) < 1e-9); // 0.05 base + 0.30 sig
    assert.equal(m.flatFameDelta, 250);
    assert.equal(m.fightWinFameMult, 1);
    assert.equal(m.fightWinCashMult, undefined); // field removed
});

test("applyBeefLossDrain: 15 off each axis toward center, never crossing 0", () => {
    const f = fighter({ persona: { x: 10, y: -40 } });
    personaService.applyBeefLossDrain(f);
    assert.equal(f.persona.x, 0);   // +10 drained by 15 → clamps at 0 (not −5)
    assert.equal(f.persona.y, -25); // −40 + 15 → −25
    const f2 = fighter({ persona: { x: -8, y: 30 } });
    personaService.applyBeefLossDrain(f2);
    assert.equal(f2.persona.x, 0);  // −8 + 15 → clamps at 0
    assert.equal(f2.persona.y, 15); // 30 − 15
});

test("blackout gate: sponsor payout modifier reads neutral (0) while blackout active", () => {
    // Root cause the fightService decay-ordering fix protects: during a blackout fight the
    // sponsor-payout lane MUST see 0, not the archetype's frac.
    const villain = fighter({ persona: { x: -100, y: 100, blackoutFightsRemaining: 1 } });
    assert.equal(personaService.getModifiers(villain).sponsorPayoutFrac, 0);
});

test("Role Model LEGACY: documentary fame ×1.5 + milestone mult 1.5", () => {
    const f = fighter({ persona: { x: 100, y: -100 } }); // Role Model heat 100
    assert.equal(personaService.applyFameMultiplier(f, 1000, FAME_CATEGORY.DOCUMENTARY), 1500);
    assert.equal(personaService.getFightModifiers(f, {}).milestoneFameMult, 1.5);
});
