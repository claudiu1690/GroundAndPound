/**
 * Persona system — service layer (ALL persona math lives here; no HTTP concerns).
 *
 * PvE ONLY. Never call this from pvpFightService.js or any PvP path.
 *
 * State (persisted on fighter.persona): x, y, blackoutFightsRemaining, lastBreakingCharacterAt.
 * heat / archetype / epithet / signatureActive / signatureName are DERIVED here, never stored.
 *
 *   heat = clamp(round((|x|+|y|)/2), 0, 100)
 *   archetype = quadrant(sign(x),sign(y)); UNWRITTEN if either axis == 0 OR heat < 25.
 *   signatureActive = heat >= 70 && blackout == 0 && archetype != UNWRITTEN.
 *
 * The pre-Regional heat cap (≤50 until Regional Pro) is NON-DESTRUCTIVE: x/y are never
 * touched, only the EFFECTIVE heat used for scaling/gating is capped.
 *
 * INVARIANT: applyNudge / decayAfterFight mutate the persona subdoc but NEVER save —
 * the caller persists inside its own transaction.
 */

const {
    ARCHETYPE,
    ARCHETYPES,
    QUADRANT_BY_SIGN,
    DIAGONAL_OPPOSITE,
    FAME_CATEGORY,
    HEAT_SIGNATURE_THRESHOLD,
    HEAT_MIN_ARCHETYPE,
    HEAT_BREAK_MIN,
    HEAT_CAP_PRE_REGIONAL,
    HEAT_UNCAP_TIER,
    DECAY,
    BREAK_SHATTER,
    BREAK_NUDGE_MULT,
    ROLE_MODEL_SLOWBUILD,
    NUDGES,
    DOC_FOCUS_NUDGE,
    DOC_TONE_NUDGE,
    MODIFIERS,
    FAME_MODIFIER_META,
    SIGNATURE_DESC,
} = require("../consts/personaConfig");
const { PROMOTION_TIERS } = require("../consts/gameConstants");

const TIER_ORDER = Object.keys(PROMOTION_TIERS);
const UNCAP_TIER_RANK = TIER_ORDER.indexOf(HEAT_UNCAP_TIER);

// ── Pure primitives ──────────────────────────────────────────────────────────

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

function sign(n) {
    return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Ensure the persona subdoc exists in-memory with defaults (legacy fighters hydrate here). */
function ensurePersonaShape(fighter) {
    if (!fighter.persona || typeof fighter.persona !== "object") {
        fighter.persona = { x: 0, y: 0, blackoutFightsRemaining: 0, lastBreakingCharacterAt: null, crownedArchetypes: [] };
        return fighter.persona;
    }
    const p = fighter.persona;
    if (typeof p.x !== "number" || Number.isNaN(p.x)) p.x = 0;
    if (typeof p.y !== "number" || Number.isNaN(p.y)) p.y = 0;
    if (typeof p.blackoutFightsRemaining !== "number" || Number.isNaN(p.blackoutFightsRemaining)) {
        p.blackoutFightsRemaining = 0;
    }
    if (!Array.isArray(p.crownedArchetypes)) p.crownedArchetypes = [];
    return p;
}

/** Raw heat from axes (uncapped). */
function rawHeat(x, y) {
    return clamp(Math.round((Math.abs(x) + Math.abs(y)) / 2), 0, 100);
}

/** True when the fighter is below Regional Pro and therefore heat-capped at 50. */
function isPreRegional(fighter) {
    const rank = TIER_ORDER.indexOf(fighter?.promotionTier || "Amateur");
    return rank >= 0 && UNCAP_TIER_RANK >= 0 && rank < UNCAP_TIER_RANK;
}

/** Effective heat used for ALL scaling/gating (applies the non-destructive pre-Regional cap). */
function effectiveHeat(fighter, x, y) {
    const h = rawHeat(x, y);
    if (isPreRegional(fighter)) return Math.min(h, HEAT_CAP_PRE_REGIONAL);
    return h;
}

/** Archetype from axes + effective heat. UNWRITTEN when either axis is 0 OR heat < 25. */
function archetypeFor(x, y, heat) {
    if (heat < HEAT_MIN_ARCHETYPE) return ARCHETYPE.UNWRITTEN;
    const key = `${sign(x)}|${sign(y)}`;
    return QUADRANT_BY_SIGN[key] || ARCHETYPE.UNWRITTEN;
}

/**
 * heatFrac in [0,1]; pre-gated to 0 below the archetype floor (25).
 * Claiming an archetype must be FELT immediately: strength starts at 50% the
 * moment the floor is crossed and scales linearly to 100% at 100 heat —
 * a raw heat/100 curve made low-heat modifiers read as ~1% rounding errors.
 */
function heatFrac(heat) {
    if (heat < HEAT_MIN_ARCHETYPE) return 0;
    return 0.5 + 0.5 * ((heat - HEAT_MIN_ARCHETYPE) / (100 - HEAT_MIN_ARCHETYPE));
}

function signatureActiveFor(archetype, heat, blackout) {
    return heat >= HEAT_SIGNATURE_THRESHOLD && (blackout || 0) === 0 && archetype !== ARCHETYPE.UNWRITTEN;
}

// ── Scaling helpers (Type A / B / C) ──────────────────────────────────────────

/** Type A: additive fraction scaled by heat. */
function scaleA(fullFrac, hf) {
    return fullFrac * hf;
}
/** Type B: multiplier scaled by heat (1 → fullMult across heatFrac). */
function scaleB(fullMult, hf) {
    return 1 + (fullMult - 1) * hf;
}
/** Type C: binary unlock — full value only at heat ≥ 70, else 0. */
function scaleC(fullValue, heat) {
    return heat >= HEAT_SIGNATURE_THRESHOLD ? fullValue : 0;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/** Internal: a fully-derived read-only snapshot of the persona for a fighter's current axes. */
function snapshot(fighter) {
    const p = ensurePersonaShape(fighter);
    const x = p.x;
    const y = p.y;
    const heat = effectiveHeat(fighter, x, y);
    const capped = isPreRegional(fighter) && rawHeat(x, y) > HEAT_CAP_PRE_REGIONAL;
    const archetype = archetypeFor(x, y, heat);
    const blackout = p.blackoutFightsRemaining || 0;
    const signatureActive = signatureActiveFor(archetype, heat, blackout);
    return { x, y, heat, capped, archetype, blackout, signatureActive, hf: heatFrac(heat) };
}

// ── Public: getState ────────────────────────────────────────────────────────────

function getState(fighter) {
    const s = snapshot(fighter);
    const meta = ARCHETYPES[s.archetype] || ARCHETYPES[ARCHETYPE.UNWRITTEN];
    return {
        x: s.x,
        y: s.y,
        heat: s.heat,
        archetype: s.archetype,
        archetypeLabel: meta.label,
        epithet: meta.epithet,
        signatureActive: s.signatureActive,
        signatureName: meta.signatureName,
        blackoutFightsRemaining: s.blackout,
        heatCapped: s.capped,
    };
}

/**
 * Full persona API block for GET /media/:id. Shapes state + blackout + heatCap +
 * active-modifier display in one place so consumers never re-derive persona fields.
 */
function buildPersonaBlock(fighter) {
    const st = getState(fighter);
    return {
        x: st.x,
        y: st.y,
        heat: st.heat,
        archetype: st.archetype,
        archetypeLabel: st.archetypeLabel,
        epithet: st.epithet,
        signatureActive: st.signatureActive,
        signatureName: st.signatureName,
        blackout: {
            active: st.blackoutFightsRemaining > 0,
            fightsRemaining: st.blackoutFightsRemaining,
        },
        heatCap: {
            capped: st.heatCapped,
            capValue: HEAT_CAP_PRE_REGIONAL,
            uncappedAtTier: HEAT_UNCAP_TIER,
        },
        modifiers: getDisplayModifiers(fighter),
    };
}

// ── Public: getModifiers (non-fight reads) ──────────────────────────────────────

/**
 * Context-free, heat-scaled, blackout-gated modifier set for NON-FIGHT reads.
 * Blackout (or UNWRITTEN / heat<25) zeroes everything → neutral defaults.
 */
function getModifiers(fighter) {
    const s = snapshot(fighter);
    const neutral = {
        calloutCostMult: 1,
        sponsorPayoutFrac: 0,
        gymRankCostFrac: 0,
        hospitalBillFrac: 0,
        sponsorSlotBonus: 0,
        appearancePoolBonus: 0,
        listenersPct: 0,
        display: [],
    };
    if (s.archetype === ARCHETYPE.UNWRITTEN || s.blackout > 0 || s.hf === 0) {
        return neutral;
    }
    const table = MODIFIERS[s.archetype] || {};
    const out = { ...neutral };
    const display = [];

    const pushDisplay = (def, value, formatted) => {
        display.push({
            key: def.key,
            label: def.label,
            kind: def.kind,
            value,
            display: formatted,
            active: value !== 0 && value !== 1,
            ...(def.good !== undefined ? { good: def.good } : {}),
            ...(def.desc ? { desc: def.desc } : {}),
            ...(def.cosmetic ? { cosmetic: true } : {}),
        });
    };

    if (table.calloutCostMult && table.calloutCostMult.lane === "nonfight") {
        const v = scaleB(table.calloutCostMult.value, s.hf);
        out.calloutCostMult = v;
        pushDisplay(table.calloutCostMult, v, `×${v.toFixed(2)}`);
    }
    if (table.sponsorPayoutFrac && table.sponsorPayoutFrac.lane === "nonfight") {
        const v = scaleA(table.sponsorPayoutFrac.value, s.hf);
        out.sponsorPayoutFrac = v;
        pushDisplay(table.sponsorPayoutFrac, v, `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
    }
    if (table.gymRankCostFrac) {
        const v = scaleA(table.gymRankCostFrac.value, s.hf);
        out.gymRankCostFrac = v;
        pushDisplay(table.gymRankCostFrac, v, `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
    }
    if (table.hospitalBillFrac) {
        const v = scaleA(table.hospitalBillFrac.value, s.hf);
        out.hospitalBillFrac = v;
        pushDisplay(table.hospitalBillFrac, v, `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
    }
    if (table.sponsorSlotBonus) {
        const v = scaleC(table.sponsorSlotBonus.value, s.heat);
        out.sponsorSlotBonus = v;
        pushDisplay(table.sponsorSlotBonus, v, v > 0 ? `+${v}` : "—");
    }
    if (table.appearancePoolBonus) {
        const v = scaleC(table.appearancePoolBonus.value, s.heat);
        out.appearancePoolBonus = v;
        pushDisplay(table.appearancePoolBonus, v, v > 0 ? `+${v}` : "—");
    }
    if (table.listenersPct) {
        const v = scaleA(table.listenersPct.value, s.hf);
        out.listenersPct = v;
        pushDisplay(table.listenersPct, v, `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
    }

    out.display = display;
    return out;
}

/**
 * Full active-modifier display list for the API persona block. Walks the archetype's
 * modifier table generically (fight + non-fight + fame + signature), scaled + gated.
 * Returns [] when the persona is inert (UNWRITTEN / blackout / heat<25).
 */
function getDisplayModifiers(fighter) {
    const s = snapshot(fighter);
    if (s.archetype === ARCHETYPE.UNWRITTEN || s.blackout > 0 || s.hf === 0) return [];
    const table = MODIFIERS[s.archetype] || {};
    const rows = [];
    const pct = (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;

    const SCALARS = [
        "purseFrac", "damageReductionFrac", "comebackBonusMult", "calloutCostMult",
        "sponsorPayoutFrac", "gymRankCostFrac", "hospitalBillFrac",
        "sponsorSlotBonus", "appearancePoolBonus", "listenersPct",
    ];
    for (const k of SCALARS) {
        const def = table[k];
        if (!def) continue;
        let value;
        let display;
        // invertDisplay: value is stored as a positive "reduction" fraction but the
        // player-facing number should read as the drop (damageReduction .02 → "−2%").
        if (def.kind === "A") { value = scaleA(def.value, s.hf); display = pct(def.invertDisplay ? -value : value); }
        else if (def.kind === "B") { value = scaleB(def.value, s.hf); display = `×${Number(value.toFixed(2))}`; }
        else if (def.kind === "C") { value = scaleC(def.value, s.heat); display = value > 0 ? `+${value}` : "—"; }
        else continue;
        rows.push({
            key: def.key,
            label: def.label,
            kind: def.kind,
            value,
            display,
            active: value !== 0 && value !== 1,
            ...(def.good !== undefined ? { good: def.good } : {}),
            ...(def.desc ? { desc: def.desc } : {}),
            ...(def.cosmetic ? { cosmetic: true } : {}),
        });
    }
    if (table.fame) {
        for (const [cat, rule] of Object.entries(table.fame)) {
            const v = scaleB(rule.value, s.hf);
            const meta = FAME_MODIFIER_META[cat] || {};
            rows.push({
                key: `fame_${cat}`,
                label: meta.label || `${cat} fame`,
                kind: "B",
                value: v,
                display: `×${Number(v.toFixed(2))}`,
                active: v !== 1,
                // Penalty categories invert polarity: softening a fame LOSS is the buff.
                good: meta.penalty ? rule.value < 1 : rule.value > 1,
                ...(meta.desc ? { desc: meta.desc } : {}),
            });
        }
    }
    if (s.signatureActive) {
        const meta = ARCHETYPES[s.archetype];
        rows.push({
            key: "signature",
            label: meta.signatureName,
            kind: "SIG",
            value: 1,
            display: "Active",
            active: true,
            good: true,
            ...(SIGNATURE_DESC[s.archetype] ? { desc: SIGNATURE_DESC[s.archetype] } : {}),
        });
    }
    return rows;
}

// ── Public: getFightModifiers (fight reads) ─────────────────────────────────────

/**
 * Heat-scaled, blackout-gated fight modifier set. `fightCtx` supplies fight facts:
 *   {isWin,isLoss,comebackMode,isNemesis,isBeef,fighterOvr,oppOvr}
 * Folds BAD BLOOD, HOMETOWN HERO, AMBUSH, and the People's-Champ upset-loss penalty.
 */
function getFightModifiers(fighter, fightCtx = {}) {
    const s = snapshot(fighter);
    const neutral = {
        purseFrac: 0,
        damageReductionFrac: 0,
        ambushProcMult: 1,
        comebackBonusMult: 1,
        fightWinFameMult: 1,   // BAD BLOOD only (HOMETOWN HERO no longer uses a fame mult)
        flatFameDelta: 0,
        milestoneFameMult: 1,
        sponsorPayoutFrac: 0,
    };
    if (s.archetype === ARCHETYPE.UNWRITTEN || s.blackout > 0 || s.hf === 0) {
        return neutral;
    }
    const table = MODIFIERS[s.archetype] || {};
    const out = { ...neutral };
    const {
        isWin = false,
        isLoss = false,
        comebackMode = false,
        isNemesis = false,
        isBeef = false,
        fighterOvr = 0,
        oppOvr = 0,
    } = fightCtx;

    if (table.purseFrac && table.purseFrac.lane === "fight") {
        out.purseFrac += scaleA(table.purseFrac.value, s.hf);
    }
    if (table.damageReductionFrac) {
        out.damageReductionFrac += scaleA(table.damageReductionFrac.value, s.hf);
    }
    if (table.sponsorPayoutFrac && table.sponsorPayoutFrac.lane === "nonfight") {
        // Sponsor payout resolves post-fight; surface the same scaled value here too.
        out.sponsorPayoutFrac += scaleA(table.sponsorPayoutFrac.value, s.hf);
    }
    if (table.comebackBonusMult && comebackMode) {
        out.comebackBonusMult = 1 + scaleA(table.comebackBonusMult.value, s.hf);
    }
    // People's Champ upset-loss flat penalty (applied in full while persona active).
    if (table.upsetLossFlatFame && isLoss && fighterOvr >= oppOvr + 10) {
        out.flatFameDelta += table.upsetLossFlatFame.value;
    }

    // ── Signature effects (only when active) ──
    if (s.signatureActive && table.signature) {
        const sig = table.signature;
        // BAD BLOOD (Villain)
        if (s.archetype === ARCHETYPE.VILLAIN && (isNemesis || isBeef)) {
            if (sig.fameMult) out.fightWinFameMult *= sig.fameMult;
            if (sig.purseFrac) out.purseFrac += sig.purseFrac;
        }
        // HOMETOWN HERO (People's Champ): comeback WIN → +30% purse & +250 flat fame
        // (folded into the additive purseFrac / flatFameDelta lanes — no end-stage multiplier).
        if (s.archetype === ARCHETYPE.PEOPLES_CHAMP && comebackMode && isWin) {
            if (sig.comebackWinPurseFrac) out.purseFrac += sig.comebackWinPurseFrac;
            if (sig.comebackWinFlatFame) out.flatFameDelta += sig.comebackWinFlatFame;
        }
        // AMBUSH (Boogeyman)
        if (s.archetype === ARCHETYPE.BOOGEYMAN && sig.ambushProcMult) {
            out.ambushProcMult = sig.ambushProcMult;
        }
        // LEGACY (Role Model) — milestone fame mult (documentary handled in applyFameMultiplier).
        if (s.archetype === ARCHETYPE.ROLE_MODEL && sig.milestoneFameMult) {
            out.milestoneFameMult = sig.milestoneFameMult;
        }
    }

    return out;
}

// ── Public: applyFameMultiplier ─────────────────────────────────────────────────

/**
 * Heat-scaled, blackout-gated fame multiplier for a single canonical category.
 * Returns the SCALED fame magnitude (sign preserved from baseFame). Neutral (returns
 * baseFame unchanged) when persona is UNWRITTEN / blackout / heat<25 or the archetype
 * has no rule for the category.
 */
function applyFameMultiplier(fighter, baseFame, category) {
    const s = snapshot(fighter);
    if (!category || s.archetype === ARCHETYPE.UNWRITTEN || s.blackout > 0 || s.hf === 0) {
        return baseFame;
    }
    const table = MODIFIERS[s.archetype] || {};

    // DOCUMENTARY is a LEGACY signature effect (full unlock, not heat-scaled).
    if (category === FAME_CATEGORY.DOCUMENTARY) {
        if (s.signatureActive && table.signature && table.signature.documentaryFameMult) {
            return Math.round(baseFame * table.signature.documentaryFameMult);
        }
        return baseFame;
    }
    // MILESTONE handled via getFightModifiers.milestoneFameMult, not here.
    if (category === FAME_CATEGORY.MILESTONE) return baseFame;

    const rule = table.fame && table.fame[category];
    if (!rule) return baseFame;
    const mult = scaleB(rule.value, s.hf); // all fame rules are Type B
    return Math.round(baseFame * mult);
}

// ── Nudge resolution ────────────────────────────────────────────────────────────

/** Resolve a nudge spec into {dx,dy,quadrant}. Accepts {actionKey} or {dx,dy,quadrant}. */
function resolveNudgeSpec(spec) {
    if (spec && typeof spec.actionKey === "string") {
        const n = NUDGES[spec.actionKey];
        if (!n) return null;
        return { dx: n.dx, dy: n.dy, quadrant: n.quadrant || null };
    }
    if (spec && (typeof spec.dx === "number" || typeof spec.dy === "number")) {
        const dx = Number(spec.dx) || 0;
        const dy = Number(spec.dy) || 0;
        const quadrant = spec.quadrant || null;
        return { dx, dy, quadrant };
    }
    return null;
}

/**
 * Core nudge computation — PURE (does not mutate). Returns everything applyNudge/
 * previewNudge need. `p` is the current persona subdoc; `fighter` supplies tier + blackout.
 */
function computeNudge(fighter, p, spec) {
    const resolved = resolveNudgeSpec(spec);
    if (!resolved) return null;

    const beforeX = p.x;
    const beforeY = p.y;
    const beforeHeat = effectiveHeat(fighter, beforeX, beforeY);
    const beforeArch = archetypeFor(beforeX, beforeY, beforeHeat);
    const blackout = p.blackoutFightsRemaining || 0;
    const beforeSig = signatureActiveFor(beforeArch, beforeHeat, blackout);

    let dx = resolved.dx;
    let dy = resolved.dy;

    // Role-Model slow-build: any Loved+Quiet directional nudge builds heat 25% slower.
    if (dx > 0 && dy < 0) {
        dx = Math.round(dx * ROLE_MODEL_SLOWBUILD);
        dy = Math.round(dy * ROLE_MODEL_SLOWBUILD);
    }

    // Breaking Character: current heat ≥ 40, current archetype real, and the defining
    // action's quadrant is the diagonal opposite of that archetype.
    const breakingCharacter =
        beforeHeat >= HEAT_BREAK_MIN &&
        beforeArch !== ARCHETYPE.UNWRITTEN &&
        !!resolved.quadrant &&
        DIAGONAL_OPPOSITE[beforeArch] === resolved.quadrant;

    let afterX;
    let afterY;
    let shattered = false;
    if (breakingCharacter) {
        // ×1.5 nudge, then shatter both axes toward center (×0.6).
        const nx = clamp(beforeX + Math.round(dx * BREAK_NUDGE_MULT), -100, 100);
        const ny = clamp(beforeY + Math.round(dy * BREAK_NUDGE_MULT), -100, 100);
        afterX = clamp(Math.round(nx * BREAK_SHATTER), -100, 100);
        afterY = clamp(Math.round(ny * BREAK_SHATTER), -100, 100);
        shattered = true;
    } else {
        afterX = clamp(beforeX + dx, -100, 100);
        afterY = clamp(beforeY + dy, -100, 100);
    }

    const afterBlackout = breakingCharacter ? 1 : blackout;
    const afterHeat = effectiveHeat(fighter, afterX, afterY);
    const afterArch = archetypeFor(afterX, afterY, afterHeat);
    const afterSig = signatureActiveFor(afterArch, afterHeat, afterBlackout);

    return {
        dx, dy,
        before: { x: beforeX, y: beforeY, heat: beforeHeat, archetype: beforeArch },
        after: { x: afterX, y: afterY, heat: afterHeat, archetype: afterArch },
        breakingCharacter,
        shattered,
        wouldSetBlackout: breakingCharacter,
        beforeSig,
        afterSig,
    };
}

/**
 * Apply a nudge, MUTATING the persona subdoc (no save). Returns the transition report.
 * spec = {actionKey} | {dx,dy,quadrant}.
 */
function applyNudge(fighter, spec) {
    const p = ensurePersonaShape(fighter);
    const c = computeNudge(fighter, p, spec);
    if (!c) {
        // Unknown/empty spec — no-op, report a neutral transition.
        const heat = effectiveHeat(fighter, p.x, p.y);
        const arch = archetypeFor(p.x, p.y, heat);
        const state = { x: p.x, y: p.y, heat, archetype: arch };
        return {
            before: state,
            after: state,
            breakingCharacter: false,
            shattered: false,
            blackoutSet: false,
            signatureActivated: false,
            signatureDeactivated: false,
            crowned: null,
        };
    }

    p.x = c.after.x;
    p.y = c.after.y;
    if (c.breakingCharacter) {
        p.blackoutFightsRemaining = 1;
        p.lastBreakingCharacterAt = new Date();
    }

    // "The press crowns you" — first time EVER this archetype is claimed (entering
    // it from Unwritten or from another quadrant). Re-entry after decay stays quiet:
    // crownedArchetypes persists which celebrations have already fired.
    let crowned = null;
    if (
        c.after.archetype !== ARCHETYPE.UNWRITTEN &&
        c.after.archetype !== c.before.archetype &&
        !p.crownedArchetypes.includes(c.after.archetype)
    ) {
        p.crownedArchetypes.push(c.after.archetype);
        crowned = c.after.archetype;
    }
    if (fighter.markModified) fighter.markModified("persona");

    const signatureActivated = !c.beforeSig && c.afterSig;
    const report = {
        before: c.before,
        after: c.after,
        breakingCharacter: c.breakingCharacter,
        shattered: c.shattered,
        blackoutSet: c.breakingCharacter,
        signatureActivated,
        signatureDeactivated: c.beforeSig && !c.afterSig,
        crowned,
    };
    // Milestone payloads for the Persona Moment modal — attached only when the
    // milestone fires so the four media consumers stay payload-thin otherwise.
    if (crowned) {
        const st = getState(fighter);
        report.crownedInfo = {
            archetype: crowned,
            label: st.archetypeLabel,
            epithet: st.epithet,
            modifiers: getDisplayModifiers(fighter),
        };
    }
    if (signatureActivated) {
        const st = getState(fighter);
        report.signatureInfo = {
            archetype: st.archetype,
            archetypeLabel: st.archetypeLabel,
            name: st.signatureName,
            desc: SIGNATURE_DESC[st.archetype] || null,
            heat: st.heat,
        };
    }
    return report;
}

/** Pure preview — no mutation. */
function previewNudge(fighter, spec) {
    const p = ensurePersonaShape(fighter);
    const c = computeNudge(fighter, p, spec);
    if (!c) return null;
    return {
        dx: c.dx,
        dy: c.dy,
        before: c.before,
        after: c.after,
        breakingCharacter: c.breakingCharacter,
        shattered: c.shattered,
        wouldSetBlackout: c.wouldSetBlackout,
    };
}

// ── Beef-loss heat drain (post-fight cost) ──────────────────────────────────────

/**
 * Beef-loss cost: losing a fight against an active-Beef opponent drains 15 off each axis
 * TOWARD center (x -= 15*sign(x), y -= 15*sign(y)), clamped so an axis can never cross past 0
 * (e.g. +10 drained by 15 lands on 0, not −5). Mutates, no save. PvE only.
 *
 * General cost (archetype-agnostic) but it bites Villains hardest since their identity is the
 * loud beef they just failed to back up.
 */
function applyBeefLossDrain(fighter) {
    const p = ensurePersonaShape(fighter);
    const drainToward = (v) => {
        if (v > 0) return Math.max(0, Math.round(v - 15));
        if (v < 0) return Math.min(0, Math.round(v + 15));
        return 0;
    };
    p.x = drainToward(p.x);
    p.y = drainToward(p.y);
    if (fighter.markModified) fighter.markModified("persona");
    return getState(fighter);
}

// ── Decay (post-fight) ──────────────────────────────────────────────────────────

/** Blackout decrement THEN x/y decay toward center. Mutates, no save. PvE only. */
function decayAfterFight(fighter) {
    const p = ensurePersonaShape(fighter);
    p.blackoutFightsRemaining = Math.max(0, (p.blackoutFightsRemaining || 0) - 1);
    p.x = Math.round(p.x * DECAY);
    p.y = Math.round(p.y * DECAY);
    if (fighter.markModified) fighter.markModified("persona");
    return getState(fighter);
}

/**
 * Attribution tag for a persona-adjusted price/payout (Type-A fraction lanes:
 * sponsorPayoutFrac / gymRankCostFrac / hospitalBillFrac). Price UIs render it as
 * "The Role Model −10%" next to the adjusted number. Returns null when the
 * persona is inert or the lane is 0 — callers then show the base price untagged.
 */
function priceAdjust(fighter, fracKey) {
    const frac = getModifiers(fighter)[fracKey] || 0;
    const pct = Math.round(frac * 100);
    if (!pct) return null;
    const s = snapshot(fighter);
    const meta = ARCHETYPES[s.archetype];
    if (!meta || s.archetype === ARCHETYPE.UNWRITTEN) return null;
    return { pct, label: meta.label };
}

// ── Config-driven lookups (data, no math) exposed for consumers ─────────────────

/** Canonical fame category for a media actionKey (null when the action has none). */
function fameCategoryForAction(actionKey) {
    const n = NUDGES[actionKey];
    return n ? (n.category || null) : null;
}

/** Nudge {dx,dy,quadrant} for a media actionKey (for API catalog display). */
function nudgeForAction(actionKey) {
    const n = NUDGES[actionKey];
    if (!n) return null;
    return { dx: n.dx, dy: n.dy, quadrant: n.quadrant || null };
}

/** Per-focus documentary nudge (quadrant null), or null for an unknown focus. */
function documentaryFocusNudge(focus) {
    const f = DOC_FOCUS_NUDGE[focus];
    return f ? { dx: f.dx, dy: f.dy, quadrant: null } : null;
}
/** Per-tone documentary nudge (quadrant null), or null for an unknown tone. */
function documentaryToneNudge(tone) {
    const t = DOC_TONE_NUDGE[tone];
    return t ? { dx: t.dx, dy: t.dy, quadrant: null } : null;
}

/** Sum documentary focus + tone into one nudge {dx,dy,quadrant:null}. */
function documentaryNudge(focus, tone) {
    const f = DOC_FOCUS_NUDGE[focus] || { dx: 0, dy: 0 };
    const t = DOC_TONE_NUDGE[tone] || { dx: 0, dy: 0 };
    return { dx: f.dx + t.dx, dy: f.dy + t.dy, quadrant: null };
}

/**
 * Build the career-feed events an applyNudge transition should emit. Consumers call
 * activityLogService.log for each (fire-and-forget, after their own save). Returns []
 * for a no-op transition. This is presentation glue, not persona math — kept here so the
 * feed copy stays consistent across the four media consumers.
 */
function personaFeedEvents(fighter, nudgeReport) {
    const events = [];
    if (!nudgeReport) return events;
    const st = getState(fighter);
    if (nudgeReport.crowned) {
        events.push({
            type: "PERSONA_CROWNED",
            detail: `The press crowns ${st.archetypeLabel} — ${st.epithet}`,
            meta: { archetype: nudgeReport.crowned, heat: st.heat },
        });
    }
    if (nudgeReport.signatureActivated) {
        events.push({
            type: "PERSONA_SIGNATURE",
            detail: `${st.signatureName} unlocked — ${st.archetypeLabel} hits full heat`,
            meta: { archetype: st.archetype, signatureName: st.signatureName, heat: st.heat },
        });
    }
    if (nudgeReport.breakingCharacter) {
        const fromArch = nudgeReport.before ? nudgeReport.before.archetype : null;
        events.push({
            type: "PERSONA_BREAK_CHARACTER",
            detail: "Broke character — the mask slips and the crowd notices",
            meta: { fromArchetype: fromArch, toArchetype: st.archetype, heat: st.heat },
        });
    }
    return events;
}

module.exports = {
    getState,
    buildPersonaBlock,
    getModifiers,
    getDisplayModifiers,
    getFightModifiers,
    applyNudge,
    previewNudge,
    applyFameMultiplier,
    applyBeefLossDrain,
    decayAfterFight,
    priceAdjust,
    // config-driven lookups
    fameCategoryForAction,
    nudgeForAction,
    documentaryNudge,
    documentaryFocusNudge,
    documentaryToneNudge,
    personaFeedEvents,
    // exposed for tests
    ensurePersonaShape,
    rawHeat,
    effectiveHeat,
    archetypeFor,
    FAME_CATEGORY,
};
