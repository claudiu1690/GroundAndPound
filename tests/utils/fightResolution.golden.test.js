/**
 * GOLDEN FIXTURE for utils/fightResolution.js resolveFight.
 *
 * Recorded from the engine BEFORE Special Moves v2 touched it. Every scenario runs under a
 * deterministic, seeded Math.random, so the fixture pins:
 *   - the per-round summary (event, control, damage, health, camp commentary keys),
 *   - the outcome / winner / finishCause and post-fight health + stamina,
 *   - every moveBonuses[] entry's triggered / triggerCount,
 *   - the TOTAL number of Math.random draws the fight consumed (catches any RNG-order drift).
 *
 * If this fails after an engine edit, the edit changed RNG order or v1 math: fix the engine,
 * never the fixture. Regenerate ONLY when a behaviour change is intended and reviewed:
 *
 *   REGEN=1 node --test tests/utils/fightResolution.golden.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { resolveFight } = require("../../utils/fightResolution");
const specialMovesService = require("../../services/specialMovesService");

const FIXTURE = path.join(__dirname, "..", "fixtures", "fightResolution.golden.json");

// mulberry32: tiny seeded PRNG, uniform in [0, 1).
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function withSeed(seed, fn) {
    const orig = Math.random;
    const rng = mulberry32(seed);
    let draws = 0;
    Math.random = () => { draws++; return rng(); };
    try {
        const result = fn();
        return { result, draws };
    } finally {
        Math.random = orig;
    }
}

function fighter(overrides = {}) {
    return {
        health: 100, stamina: 100, maxStamina: 100,
        str: 40, spd: 40, leg: 30, wre: 25, gnd: 25, sub: 20, chn: 45, fiq: 30,
        ...overrides,
    };
}

const STRIKER = { str: 60, spd: 55, leg: 50, wre: 25, gnd: 20, sub: 15, chn: 50, fiq: 40 };
const GRAPPLER = { str: 40, spd: 35, leg: 25, wre: 65, gnd: 60, sub: 60, chn: 45, fiq: 40 };
const BRAWLER = { str: 70, spd: 45, leg: 45, wre: 40, gnd: 35, sub: 25, chn: 35, fiq: 30 };

// ~11 deterministic scenarios covering striking, takedowns both ways, ground continuation,
// submissions from top and guard, 3- and 5-round fights, and a camp sessionBonuses path.
const SCENARIOS = [
    { name: "striker-mirror-3r", seed: 11, p: STRIKER, o: STRIKER, opts: { maxRounds: 3, playerStrategy: "Pressure Fighter", opponentStrategy: "Counter Striker" } },
    { name: "grappler-vs-striker-5r", seed: 23, p: GRAPPLER, o: STRIKER, opts: { maxRounds: 5, playerStrategy: "Takedown Heavy", opponentStrategy: "Pressure Fighter" } },
    { name: "striker-vs-grappler-5r", seed: 37, p: STRIKER, o: GRAPPLER, opts: { maxRounds: 5, playerStrategy: "Counter Striker", opponentStrategy: "Submission Hunter" } },
    { name: "grappler-mirror-sub-hunt-5r", seed: 41, p: GRAPPLER, o: GRAPPLER, opts: { maxRounds: 5, playerStrategy: "Submission Hunter", opponentStrategy: "Ground & Pound" } },
    { name: "brawler-vs-striker-3r", seed: 53, p: BRAWLER, o: STRIKER, opts: { maxRounds: 3, playerStrategy: "Clinch Bully", opponentStrategy: null } },
    { name: "default-mirror-5r", seed: 67, p: {}, o: {}, opts: { maxRounds: 5 } },
    { name: "grappler-vs-brawler-ironwill-5r", seed: 79, p: GRAPPLER, o: BRAWLER, opts: { maxRounds: 5, playerStrategy: "Ground & Pound", opponentStrategy: "Takedown Heavy", ironWillPerk: true } },
    {
        name: "striker-vs-grappler-with-camp-3r", seed: 97, p: STRIKER, o: GRAPPLER,
        opts: { maxRounds: 3, playerStrategy: "Survival Mode", opponentStrategy: "Takedown Heavy" },
        camp: true,
    },
    // Dominant matchups so the player-takedown path and the opponent-below-25% signatures fire.
    { name: "dominant-wrestler-5r", seed: 101, p: { ...GRAPPLER, wre: 90, gnd: 80, sub: 75 }, o: { ...STRIKER, wre: 10, gnd: 10, sub: 10, chn: 25 }, opts: { maxRounds: 5, playerStrategy: "Ground & Pound", opponentStrategy: "Pressure Fighter" } },
    { name: "dominant-striker-5r", seed: 131, p: { str: 90, spd: 80, leg: 70, wre: 30, gnd: 25, sub: 20, chn: 90, fiq: 50 }, o: { str: 15, spd: 15, leg: 15, wre: 20, gnd: 20, sub: 15, chn: 10, fiq: 20 }, opts: { maxRounds: 5, playerStrategy: "Pressure Fighter" } },
    { name: "dominant-sub-hunter-3r", seed: 151, p: { ...GRAPPLER, wre: 80, sub: 90 }, o: { ...BRAWLER, wre: 15, sub: 10 }, opts: { maxRounds: 3, playerStrategy: "Submission Hunter", opponentStrategy: "Clinch Bully" } },
];

// v1 loadouts, built through the real buildMoveBonuses so the collapse rule is exercised.
// Together they cover all 12 v1 moves.
const LOADOUTS = {
    none: null,
    offense_L: { ids: ["HEAVY_HANDS", "THE_FINISHER", "KILLER_INSTINCT"], rarity: "LEGENDARY" },
    defense_R: { ids: ["GRANITE_JAW", "VETERAN_IQ", "NEVER_TAP"], rarity: "RARE" },
    grapple_L: { ids: ["SPRAWL_INSTINCT", "MOUNT_REAPER", "IRON_RECOVERY"], rarity: "LEGENDARY" },
    tempo_U: { ids: ["BODY_SNATCHER", "CLINCH_KILLER", "SECOND_WIND"], rarity: "UNCOMMON" },
};

function buildLoadout(spec) {
    if (!spec) return [];
    return specialMovesService.buildMoveBonuses({
        specialMovesOwned: spec.ids.map((id) => ({ moveId: id, rarity: spec.rarity, acquiredAt: new Date(0) })),
        specialMovesEquipped: [...spec.ids],
    });
}

function campBonuses() {
    return [
        { sessionType: "STRIKING_ACCURACY", bonusType: "STRIKE_DAMAGE", effectiveValue: 0.05, triggered: false, triggerCount: 0 },
        { sessionType: "TAKEDOWN_DEFENCE", bonusType: "SPRAWL_SUCCESS", effectiveValue: 0.08, triggered: false, triggerCount: 0 },
        { sessionType: "CARDIO_PUSH", bonusType: "STAMINA_DRAIN", effectiveValue: 0.1, triggered: false, triggerCount: 0 },
    ];
}

function summarise(result, draws) {
    return {
        outcome: result.outcome,
        winner: result.winner,
        finishCause: result.finishCause,
        playerHealthAfter: result.playerHealthAfter,
        opponentHealthAfter: result.opponentHealthAfter,
        playerStaminaAfter: result.playerStaminaAfter,
        rngDraws: draws,
        rounds: result.rounds.map((r) => ({
            round: r.round,
            event: r.event,
            grapplingControl: r.grapplingControl,
            playerDamage: r.playerDamage,
            opponentDamage: r.opponentDamage,
            playerHealth: r.playerHealth,
            opponentHealth: r.opponentHealth,
            campCommentary: r.campCommentary,
        })),
        moveBonuses: result.moveBonuses.map((b) => ({
            moveId: b.moveId, bonusType: b.bonusType, triggered: b.triggered, triggerCount: b.triggerCount,
        })),
        sessionBonuses: result.sessionBonuses.map((b) => ({
            bonusType: b.bonusType, triggered: b.triggered, triggerCount: b.triggerCount,
        })),
    };
}

function runAll() {
    const out = {};
    for (const sc of SCENARIOS) {
        for (const [loadoutName, spec] of Object.entries(LOADOUTS)) {
            const key = `${sc.name}::${loadoutName}`;
            const moveBonuses = buildLoadout(spec);
            const { result, draws } = withSeed(sc.seed, () =>
                resolveFight(fighter(sc.p), fighter(sc.o), {
                    ...sc.opts,
                    sessionBonuses: sc.camp ? campBonuses() : [],
                    moveBonuses,
                    wildcard: null,
                })
            );
            out[key] = summarise(result, draws);
        }
    }
    return out;
}

if (process.env.REGEN === "1") {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify(runAll(), null, 2) + "\n");
    // eslint-disable-next-line no-console
    console.log(`[golden] wrote ${FIXTURE}`);
}

test("resolveFight golden fixture: v1 behaviour and RNG order are byte-identical", () => {
    assert.ok(fs.existsSync(FIXTURE), `missing fixture ${FIXTURE}; run with REGEN=1 against the pre-change engine`);
    const expected = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    const actual = runAll();
    assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
        assert.deepStrictEqual(actual[key], expected[key], `golden mismatch in scenario ${key}`);
    }
});

test("golden scenarios actually exercise the engine surface (guards against a fixture that tests nothing)", () => {
    const actual = runAll();
    const events = new Set();
    const outcomes = new Set();
    let anyMoveTriggered = false;
    for (const s of Object.values(actual)) {
        for (const r of s.rounds) events.add(r.event);
        outcomes.add(s.outcome);
        if (s.moveBonuses.some((b) => b.triggerCount > 0)) anyMoveTriggered = true;
    }
    assert.ok(events.has("Striking exchange."), "a striking exchange");
    assert.ok(events.has("Takedown; ground and pound.") || events.has("Holding top control; ground and pound."), "player top position");
    assert.ok(events.has("Opponent took you down.") || events.has("Stuck on bottom; opponent grinds."), "player bottom position");
    assert.ok(anyMoveTriggered, "at least one move fired");
    assert.ok(outcomes.size >= 2, "more than one outcome kind");
});
