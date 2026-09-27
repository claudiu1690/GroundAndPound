/**
 * Special Moves v2 catalog (consts/specialMovesCatalog.js): roster shape, the 12 new entries,
 * the 7 renames, art on disk, engine allowlists, and the trigger-gate integrity rules in
 * validateCatalog. Pure; no DB.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
    SPECIAL_MOVES,
    SPECIAL_MOVES_BY_ID,
    ENGINE_BONUS_TYPES,
    SIGNATURE_BONUS_TYPES,
    MULTI_TRIGGER_BONUS_TYPES,
    validateCatalog,
} = require("../../consts/specialMovesCatalog");

const REPO_ROOT = path.join(__dirname, "..", "..");
const EM_DASH = "—";

// Four bare numbers = COMMON/UNCOMMON/RARE/LEGENDARY; two = RARE/LEGENDARY.
const v4 = (c, u, r, l) => ({ COMMON: c, UNCOMMON: u, RARE: r, LEGENDARY: l });
const v2 = (r, l) => ({ RARE: r, LEGENDARY: l });

const NEW_MOVES = [
    { id: "HIGH_GUARD", name: "High Guard", effectType: "PASSIVE", bonusType: "OPPONENT_DAMAGE_REDUCTION", triggerCondition: "ALWAYS", minRarity: "COMMON", values: v4(0.006, 0.011, 0.019, 0.026), flavor: "Hands high, chin down. Nothing clean gets through." },
    { id: "DOUBLE_LEG_PRECISION", name: "Double-Leg Precision", effectType: "PASSIVE", bonusType: "TAKEDOWN_SUCCESS", triggerCondition: "ALWAYS", minRarity: "COMMON", values: v4(0.02, 0.035, 0.06, 0.08), flavor: "The shot never misses because it was never sloppy to begin with." },
    { id: "FRAME_AND_BASE", name: "Frame & Base", effectType: "PASSIVE", bonusType: "GROUND_DAMAGE_REDUCTION", triggerCondition: "ALWAYS", minRarity: "COMMON", values: v4(0.015, 0.026, 0.044, 0.06), flavor: "Flat on the back and still structurally sound. Nothing gets through the frame." },
    { id: "PACE_PUSHER", name: "Pace Pusher", effectType: "PASSIVE", bonusType: "OPPONENT_STAMINA_DRAIN", triggerCondition: "ALWAYS", minRarity: "COMMON", values: v4(0.04, 0.042, 0.046, 0.05), flavor: "Every exchange costs the other guy a little more than it should." },
    { id: "SECOND_GEAR", name: "Second Gear", effectType: "PROC", bonusType: "STRIKE_DAMAGE", triggerCondition: "OPPONENT_STAMINA_BELOW_70", minRarity: "COMMON", values: v4(0.005, 0.009, 0.015, 0.020), flavor: "A tired man's guard drops an inch. This fighter never misses the inch." },
    { id: "TOP_CONTROL", name: "Top Control", effectType: "PROC", bonusType: "GNP_DAMAGE", triggerCondition: "PLAYER_TOP_POSITION", minRarity: "COMMON", values: v4(0.025, 0.045, 0.075, 0.10), flavor: "Top position isn't a reward, it's a job. This fighter clocks in." },
    { id: "GUILLOTINE_CHOKE", name: "Guillotine Choke", effectType: "PROC", bonusType: "SUBMISSION_SUCCESS", triggerCondition: "PLAYER_ATTEMPTS_SUBMISSION", minRarity: "COMMON", values: v4(0.03, 0.05, 0.08, 0.11), flavor: "Once the neck is wrapped, it's only a matter of time." },
    { id: "DEEP_WATERS", name: "Deep Waters", effectType: "PROC", bonusType: "STRIKE_DAMAGE", triggerCondition: "LATE_ROUNDS", minRarity: "COMMON", values: v4(0.008, 0.015, 0.025, 0.033), flavor: "Drag them out past the third round and watch them drown." },
    { id: "FIGHTING_SPIRIT", name: "Fighting Spirit", effectType: "PROC", bonusType: "FLASH_KO_RESISTANCE", triggerCondition: "PLAYER_HEALTH_BELOW_25", minRarity: "COMMON", values: v4(0.004, 0.008, 0.012, 0.018), flavor: "Hurt, not gone. The chin negotiates a longer fight." },
    { id: "SUPERMAN_PUNCH", name: "Superman Punch", effectType: "SIGNATURE", bonusType: "SIG_FAST_START", triggerCondition: "ROUND_ONE", minRarity: "RARE", values: v2(0.10, 0.18), flavor: "No feeling-out round. The bell rings and the storm is already here." },
    { id: "BLAST_DOUBLE", name: "Blast Double", effectType: "SIGNATURE", bonusType: "SIG_TAKEDOWN_BLITZ", triggerCondition: "PLAYER_FIRST_TAKEDOWN_LANDED", minRarity: "RARE", values: v2(0.10, 0.18), flavor: "The first takedown of the night is a statement, not a formality." },
    { id: "ARM_TRIANGLE", name: "Arm Triangle", effectType: "SIGNATURE", bonusType: "SIG_SUBMISSION_HUNT", triggerCondition: "PLAYER_ACHIEVES_TOP_POSITION", minRarity: "RARE", values: v2(0.12, 0.20), flavor: "Top position is an invitation. This fighter RSVPs immediately." },
];

const RENAMES = {
    SPRAWL_INSTINCT: "Sprawl",
    NEVER_TAP: "Hip Escape",
    CLINCH_KILLER: "Dirty Boxing",
    MOUNT_REAPER: "Full Mount",
    THE_FINISHER: "Overhand Right",
    IRON_RECOVERY: "Rubber Guard",
    KILLER_INSTINCT: "Crucifix",
};

// Same slug rule as the frontend's moveArtUrl.
const artSlug = (art) => String(art).toLowerCase().replace(/[^a-z0-9]+/g, "-");

test("roster: 24 unique ids, BY_ID has 24 keys", () => {
    assert.equal(SPECIAL_MOVES.length, 24);
    assert.equal(new Set(SPECIAL_MOVES.map((m) => m.id)).size, 24);
    assert.equal(Object.keys(SPECIAL_MOVES_BY_ID).length, 24);
});

test("roster split is 8 Passive / 10 Proc / 6 Signature", () => {
    const count = (t) => SPECIAL_MOVES.filter((m) => m.effectType === t).length;
    assert.equal(count("PASSIVE"), 8);
    assert.equal(count("PROC"), 10);
    assert.equal(count("SIGNATURE"), 6);
});

for (const spec of NEW_MOVES) {
    test(`new move ${spec.id} matches the v2 spec field-by-field`, () => {
        const def = SPECIAL_MOVES_BY_ID[spec.id];
        assert.ok(def, `${spec.id} missing from catalog`);
        for (const k of ["id", "name", "effectType", "bonusType", "triggerCondition", "minRarity", "flavor"]) {
            assert.equal(def[k], spec[k], `${spec.id}.${k}`);
        }
        assert.deepEqual(def.values, spec.values, `${spec.id}.values`);
        assert.equal(def.art, spec.id.toLowerCase(), `${spec.id}.art`);
    });
}

test("new moves sit at the end of their type section (passives, procs, signatures)", () => {
    const ids = SPECIAL_MOVES.map((m) => m.id);
    const idx = (id) => ids.indexOf(id);
    assert.deepEqual(ids.slice(idx("VETERAN_IQ") + 1, idx("VETERAN_IQ") + 5), ["HIGH_GUARD", "DOUBLE_LEG_PRECISION", "FRAME_AND_BASE", "PACE_PUSHER"]);
    assert.deepEqual(ids.slice(idx("MOUNT_REAPER") + 1, idx("MOUNT_REAPER") + 6), ["SECOND_GEAR", "TOP_CONTROL", "GUILLOTINE_CHOKE", "DEEP_WATERS", "FIGHTING_SPIRIT"]);
    assert.deepEqual(ids.slice(-3), ["SUPERMAN_PUNCH", "BLAST_DOUBLE", "ARM_TRIANGLE"]);
});

for (const [id, name] of Object.entries(RENAMES)) {
    test(`rename ${id} -> "${name}" keeps id and art`, () => {
        const def = SPECIAL_MOVES_BY_ID[id];
        assert.ok(def, `${id} must still exist under the same id`);
        assert.equal(def.name, name);
        assert.equal(def.id, id);
        assert.equal(def.art, id.toLowerCase(), "art slug must not change or the shipped card art breaks");
    });
}

test("every move's art file exists on disk (frontend/public/assets/moves/<slug>.webp)", () => {
    for (const m of SPECIAL_MOVES) {
        const file = path.join(REPO_ROOT, "frontend", "public", "assets", "moves", `${artSlug(m.art)}.webp`);
        assert.ok(fs.existsSync(file), `${m.id}: missing art ${file}`);
    }
});

test("PASSIVE/PROC bonusTypes are engine branches; SIGNATURE bonusTypes are signature branches", () => {
    for (const m of SPECIAL_MOVES) {
        if (m.effectType === "SIGNATURE") {
            assert.ok(SIGNATURE_BONUS_TYPES.has(m.bonusType), `${m.id} ${m.bonusType}`);
        } else {
            assert.ok(ENGINE_BONUS_TYPES.has(m.bonusType), `${m.id} ${m.bonusType}`);
        }
    }
});

test("MULTI_TRIGGER_BONUS_TYPES.STRIKE_DAMAGE is exactly the three gates the engine evaluates", () => {
    assert.deepEqual([...MULTI_TRIGGER_BONUS_TYPES.STRIKE_DAMAGE].sort(), ["ALWAYS", "LATE_ROUNDS", "OPPONENT_STAMINA_BELOW_70"]);
    assert.deepEqual(Object.keys(MULTI_TRIGGER_BONUS_TYPES), ["STRIKE_DAMAGE"]);
});

test("validateCatalog passes on the shipped catalog", () => {
    assert.doesNotThrow(() => validateCatalog());
});

function withTempMove(move, fn) {
    SPECIAL_MOVES.push(move);
    try { fn(); } finally { SPECIAL_MOVES.pop(); }
}

test("validateCatalog throws when a first-match bonusType (GNP_DAMAGE) gets a second triggerCondition", () => {
    withTempMove({
        id: "TMP_GNP_ALWAYS", name: "Tmp", effectType: "PASSIVE", bonusType: "GNP_DAMAGE",
        triggerCondition: "ALWAYS", minRarity: "COMMON", values: v4(0.01, 0.02, 0.03, 0.04), art: "tmp",
    }, () => {
        assert.throws(() => validateCatalog(), /GNP_DAMAGE is used with multiple triggerConditions but the engine reads it first-match/);
    });
    assert.doesNotThrow(() => validateCatalog(), "catalog restored");
});

test("validateCatalog throws when STRIKE_DAMAGE gets a gate the engine does not evaluate", () => {
    withTempMove({
        id: "TMP_STRIKE_UNKNOWN", name: "Tmp", effectType: "PROC", bonusType: "STRIKE_DAMAGE",
        triggerCondition: "FULL_MOON", minRarity: "COMMON", values: v4(0.01, 0.02, 0.03, 0.04), art: "tmp",
    }, () => {
        assert.throws(() => validateCatalog(), /STRIKE_DAMAGE triggerCondition FULL_MOON/);
    });
    assert.doesNotThrow(() => validateCatalog(), "catalog restored");
});

test("validateCatalog throws when a SIGNATURE uses an unknown signature bonusType", () => {
    withTempMove({
        id: "TMP_SIG", name: "Tmp", effectType: "SIGNATURE", bonusType: "SIG_NOPE",
        triggerCondition: "ALWAYS", minRarity: "RARE", values: v2(0.1, 0.2), art: "tmp",
    }, () => {
        assert.throws(() => validateCatalog(), /SIG_NOPE is not a known signature branch/);
    });
});

test("no em dash in the name or flavor of the 12 new and 7 renamed moves", () => {
    const ids = [...NEW_MOVES.map((m) => m.id), ...Object.keys(RENAMES)];
    for (const id of ids) {
        const def = SPECIAL_MOVES_BY_ID[id];
        assert.ok(!def.name.includes(EM_DASH), `${id} name has an em dash`);
        assert.ok(!def.flavor.includes(EM_DASH), `${id} flavor has an em dash`);
    }
});

test("renamed flavor edits landed (NEVER_TAP, IRON_RECOVERY)", () => {
    assert.equal(SPECIAL_MOVES_BY_ID.NEVER_TAP.flavor, "Caught in the choke and still calm. One hip escape and the grip is gone.");
    assert.equal(SPECIAL_MOVES_BY_ID.IRON_RECOVERY.flavor, "Hurt should slow a fighter down. This one just resets the clock.");
});
