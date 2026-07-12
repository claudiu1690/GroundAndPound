const { test } = require("node:test");
const assert = require("node:assert");

const { deriveFightDetails, rand } = require("../../utils/fightBreakdown");

// ── Fixtures ──────────────────────────────────────────────────────────────────
// A 3-round decision (no finish). Engine perspective: player = engine player.
function decisionResult() {
    return {
        outcome: "Decision (unanimous)",
        winner: "player",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            // STRIKE round — player edges it.
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 6, opponentDamage: 14, playerHealth: 94, opponentHealth: 86, campCommentary: [] },
            // Takedown round — player controls.
            { round: 2, event: "Takedown; ground and pound.", grapplingControl: 1, playerDamage: 3, opponentDamage: 18, playerHealth: 91, opponentHealth: 68, campCommentary: [] },
            // Opponent ground round — opponent controls.
            { round: 3, event: "Stuck on bottom; opponent grinds.", grapplingControl: -1, playerDamage: 16, opponentDamage: 4, playerHealth: 75, opponentHealth: 64, campCommentary: [] },
        ],
    };
}

const baseCtx = {
    playerStyle: "Boxer",
    opponentStyle: "Wrestler",
    isTitle: false,
    isGrudge: false,
    comeback: false,
    isCallout: false,
    playerOvr: 30,
    opponentOvr: 30,
    playerName: "Player",
    opponentName: "Opponent",
    maxRounds: 5,
};

function koResult() {
    return {
        outcome: "KO/TKO",
        winner: "player",
        finishCause: "ko",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 8, opponentDamage: 12, playerHealth: 88, opponentHealth: 70, campCommentary: [] },
            // Finish round — heavy strike, opp crosses below 35 and gets finished.
            { round: 2, event: "Striking exchange.", grapplingControl: 0, playerDamage: 5, opponentDamage: 40, playerHealth: 83, opponentHealth: 0, campCommentary: [] },
        ],
    };
}

function subLossResult() {
    return {
        outcome: "Loss (submission)",
        winner: "opponent",
        finishCause: "submission",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 10, opponentDamage: 8, playerHealth: 90, opponentHealth: 92, campCommentary: [] },
            // Opponent takes you down and submits you.
            { round: 2, event: "Opponent took you down.", grapplingControl: -1, playerDamage: 22, opponentDamage: 2, playerHealth: 68, opponentHealth: 90, campCommentary: [] },
        ],
    };
}

// Exhaustion TKO in a striking round (finishCause "tko" → tko_finish_strike).
function tkoStrikeResult() {
    return {
        outcome: "KO/TKO",
        winner: "player",
        finishCause: "tko",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 8, opponentDamage: 10, playerHealth: 88, opponentHealth: 72, campCommentary: [] },
            // Finish round — striking, modest damage, stoppage by accumulation.
            { round: 2, event: "Striking exchange.", grapplingControl: 0, playerDamage: 6, opponentDamage: 9, playerHealth: 82, opponentHealth: 30, campCommentary: [] },
        ],
    };
}

// Ground-and-pound stoppage (TD finishing round → tko_finish_ground).
function tkoGroundResult() {
    return {
        outcome: "KO/TKO",
        winner: "player",
        finishCause: "tko",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 8, opponentDamage: 10, playerHealth: 88, opponentHealth: 72, campCommentary: [] },
            // Finish round — player takes opponent down and finishes from top.
            { round: 2, event: "Takedown; ground and pound.", grapplingControl: 1, playerDamage: 3, opponentDamage: 30, playerHealth: 85, opponentHealth: 0, campCommentary: [] },
        ],
    };
}

// Carried-control continuation: round 2 is a takedown (control established), round 3 is
// a GROUND_PLAYER continuation (control carried, 0 new takedowns).
function carriedControlResult() {
    return {
        outcome: "Decision (unanimous)",
        winner: "player",
        finishCause: null,
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 6, opponentDamage: 8, playerHealth: 94, opponentHealth: 90, campCommentary: [] },
            { round: 2, event: "Takedown; ground and pound.", grapplingControl: 1, playerDamage: 3, opponentDamage: 16, playerHealth: 91, opponentHealth: 70, campCommentary: [] },
            { round: 3, event: "Holding top control; ground and pound.", grapplingControl: 1, playerDamage: 2, opponentDamage: 18, playerHealth: 89, opponentHealth: 52, campCommentary: [] },
        ],
    };
}

// ── Determinism ───────────────────────────────────────────────────────────────
test("deriveFightDetails is deterministic for the same input", () => {
    const a = deriveFightDetails(decisionResult(), baseCtx, "fight123");
    const b = deriveFightDetails(decisionResult(), baseCtx, "fight123");
    assert.deepStrictEqual(a, b);
});

test("different fightId yields different (but valid) narrative slotting", () => {
    const a = deriveFightDetails(decisionResult(), baseCtx, "fightAAA");
    const b = deriveFightDetails(decisionResult(), baseCtx, "fightBBB");
    // Stats are mostly engine-driven; timestamps differ by seed.
    const ta = a.eventLog.map((e) => e.timestamp).join(",");
    const tb = b.eventLog.map((e) => e.timestamp).join(",");
    assert.notStrictEqual(ta, tb);
});

// ── rand() never uses Math.random ──────────────────────────────────────────────
test("rand is a pure deterministic hash in [0,1)", () => {
    const v1 = rand("seed", 1, "x");
    const v2 = rand("seed", 1, "x");
    assert.strictEqual(v1, v2);
    assert.ok(v1 >= 0 && v1 < 1);
    assert.notStrictEqual(rand("seed", 1, "x"), rand("seed", 2, "x"));
});

test("derivation source uses no Math.random or Date", () => {
    const fs = require("fs");
    const src = fs.readFileSync(require.resolve("../../utils/fightBreakdown.js"), "utf8");
    assert.ok(!/Math\.random/.test(src), "must not call Math.random");
    assert.ok(!/new Date|Date\.now/.test(src), "must not read the clock");
});

// ── Cumulative damage monotonic + clamped ───────────────────────────────────────
test("cumulative damage is monotonic non-decreasing and clamped ≤100", () => {
    const { roundStats } = deriveFightDetails(decisionResult(), baseCtx, "fightDmg");
    let prevP = 0, prevO = 0;
    for (const rs of roundStats) {
        assert.ok(rs.damagePlayer >= prevP, "player cumulative damage must not decrease");
        assert.ok(rs.damageOpponent >= prevO, "opponent cumulative damage must not decrease");
        assert.ok(rs.damagePlayer <= 100 && rs.damageOpponent <= 100, "clamped to 100");
        prevP = rs.damagePlayer;
        prevO = rs.damageOpponent;
    }
});

// ── Damage direction (regression: damage is OFFENSIVE output, not intake) ────────
test("damage tracks what each side DEALT — the winner who out-damages shows the higher cumulative", () => {
    // Fixture deals: player 14+18+4 = 36, opponent 6+3+16 = 25 → player dealt MORE and won.
    // The inversion bug showed the player 25 vs 36 (their intake) → "won but did less damage".
    const { roundStats } = deriveFightDetails(decisionResult(), baseCtx, "fightDmgDir");
    const final = roundStats[roundStats.length - 1];
    assert.equal(final.damagePlayer, 36, "player cumulative damage = total the player DEALT");
    assert.equal(final.damageOpponent, 25, "opponent cumulative damage = total the opponent DEALT");
    assert.ok(final.damagePlayer > final.damageOpponent, "the side that deals more shows the higher damage");
});

// ── roundWinner bands ───────────────────────────────────────────────────────────
test("roundWinner mirrors the judges: any nonzero net is decisive, 10-8 past ±18, tie is even", () => {
    const res = {
        outcome: "Decision (unanimous)",
        winner: "player",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            // net = (oppDmg - playerDmg) + ctrl*3 = (5 - 4) + 0 = 1 → player (decisive 10-9, NOT even)
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 4, opponentDamage: 5, playerHealth: 96, opponentHealth: 95, campCommentary: [] },
            // net = (20 - 1) + 0 = 19 → player dominant (10-8)
            { round: 2, event: "Striking exchange.", grapplingControl: 0, playerDamage: 1, opponentDamage: 20, playerHealth: 95, opponentHealth: 75, campCommentary: [] },
            // net = (5 - 5) + 0 = 0 → true tie → even
            { round: 3, event: "Striking exchange.", grapplingControl: 0, playerDamage: 5, opponentDamage: 5, playerHealth: 90, opponentHealth: 70, campCommentary: [] },
        ],
    };
    const { roundStats } = deriveFightDetails(res, baseCtx, "fightBands");
    // Player wins R1+R2, R3 is a genuine tie — card gives the winner the majority,
    // so no reconciliation kicks in.
    assert.strictEqual(roundStats[0].roundWinner, "player");
    assert.strictEqual(roundStats[0].dominant, false);
    assert.strictEqual(roundStats[1].roundWinner, "player");
    assert.strictEqual(roundStats[1].dominant, true);
    assert.strictEqual(roundStats[2].roundWinner, "even");
    assert.strictEqual(roundStats[2].dominant, false);
});

// ── Decision reconciliation ───────────────────────────────────────────────────────
test("split decision: round card is nudged so it never contradicts the winner", () => {
    const res = {
        outcome: "Decision (split)",
        winner: "player",
        sessionBonuses: [],
        wildcard: null,
        rounds: [
            // Balanced-judge net favors the opponent on two of three rounds, but the
            // player took the split decision — the raw card would read opponent 2-1.
            { round: 1, event: "Striking exchange.", grapplingControl: 0, playerDamage: 5, opponentDamage: 4, playerHealth: 90, opponentHealth: 92, campCommentary: [] }, // net -1 → opponent
            { round: 2, event: "Striking exchange.", grapplingControl: 0, playerDamage: 5, opponentDamage: 4, playerHealth: 80, opponentHealth: 84, campCommentary: [] }, // net -1 → opponent
            { round: 3, event: "Striking exchange.", grapplingControl: 0, playerDamage: 4, opponentDamage: 5, playerHealth: 72, opponentHealth: 74, campCommentary: [] }, // net +1 → player
        ],
    };
    const { roundStats } = deriveFightDetails(res, baseCtx, "fightSplit");
    const winners = roundStats.map((r) => r.roundWinner);
    const pw = winners.filter((w) => w === "player").length;
    const ow = winners.filter((w) => w === "opponent").length;
    assert.ok(pw > ow, `winner should hold the round-card majority (got player ${pw}, opponent ${ow})`);
});

// ── Finish-round last event mapping ─────────────────────────────────────────────
test("KO finish (finishCause ko, STRIKE round): last event is ko_finish by the player", () => {
    const { eventLog, roundStats } = deriveFightDetails(koResult(), baseCtx, "fightKO");
    const last = eventLog[eventLog.length - 1];
    assert.strictEqual(last.type, "finish");
    assert.strictEqual(last.templateKey, "ko_finish");
    assert.strictEqual(last.actorIsPlayer, true);
    // Finish round is the player's, dominant.
    const fr = roundStats[roundStats.length - 1];
    assert.strictEqual(fr.roundWinner, "player");
    assert.strictEqual(fr.dominant, true);
});

test("submission loss: last event is submission_finish by the opponent", () => {
    const { eventLog, roundStats } = deriveFightDetails(subLossResult(), baseCtx, "fightSub");
    const last = eventLog[eventLog.length - 1];
    assert.strictEqual(last.type, "finish");
    assert.strictEqual(last.templateKey, "submission_finish");
    assert.strictEqual(last.actorIsPlayer, false);
    const fr = roundStats[roundStats.length - 1];
    assert.strictEqual(fr.roundWinner, "opponent");
});

// ── giantKiller precedence ──────────────────────────────────────────────────────
test("giantKiller sets resultContextKey when winning up ≥8 OVR with no higher-precedence flag", () => {
    const ctx = { ...baseCtx, playerOvr: 25, opponentOvr: 40 };
    const { resultContextKey } = deriveFightDetails(decisionResult(), ctx, "fightGK");
    assert.strictEqual(resultContextKey, "giantKiller");
});

test("title precedence beats giantKiller", () => {
    const ctx = { ...baseCtx, playerOvr: 25, opponentOvr: 40, isTitle: true };
    const out = deriveFightDetails(decisionResult(), ctx, "fightTitle");
    assert.strictEqual(out.resultContextKey, "title");
    assert.strictEqual(out.introTemplateKey, "title");
});

test("nemesis intro precedence (grudge over comeback/callout)", () => {
    const ctx = { ...baseCtx, isGrudge: true, comeback: true, isCallout: true };
    const out = deriveFightDetails(decisionResult(), ctx, "fightNem");
    assert.strictEqual(out.introTemplateKey, "nemesis");
    assert.strictEqual(out.resultContextKey, "nemesis");
});

// ── Camp event only when matched/partial ────────────────────────────────────────
test("camp event is dropped when its bonus is UNMATCHED", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campStrikingAccuracy"];
    res.sessionBonuses = [{ bonusType: "STRIKE_DAMAGE", matchStatus: "UNMATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightCampDrop");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_striking_accuracy_fired");
    assert.strictEqual(hasCamp, false);
});

test("camp event is kept when its bonus is MATCHED", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campStrikingAccuracy"];
    res.sessionBonuses = [{ bonusType: "STRIKE_DAMAGE", matchStatus: "MATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightCampKeep");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_striking_accuracy_fired");
    assert.strictEqual(hasCamp, true);
});

// ── P1-A regression: campCardio / campTakedownDefence bonusType mapping ─────────
// These two keys had wrong bonusType strings in CAMP_BONUS_TYPE, so a correctly
// matched session bonus failed the guard and the camp event was silently dropped.
test("campCardio emits its camp event when STAMINA_DRAIN bonus is MATCHED", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campCardio"];
    res.sessionBonuses = [{ bonusType: "STAMINA_DRAIN", matchStatus: "MATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightCardioKeep");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_cardio_fired");
    assert.strictEqual(hasCamp, true, "campCardio camp event must fire on MATCHED STAMINA_DRAIN");
});

test("campCardio emits its camp event when STAMINA_DRAIN bonus is PARTIAL", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campCardio"];
    res.sessionBonuses = [{ bonusType: "STAMINA_DRAIN", matchStatus: "PARTIAL" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightCardioPartial");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_cardio_fired");
    assert.strictEqual(hasCamp, true, "campCardio camp event must fire on PARTIAL STAMINA_DRAIN");
});

test("campCardio camp event is dropped when STAMINA_DRAIN bonus is UNMATCHED", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campCardio"];
    res.sessionBonuses = [{ bonusType: "STAMINA_DRAIN", matchStatus: "UNMATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightCardioDrop");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_cardio_fired");
    assert.strictEqual(hasCamp, false, "campCardio camp event must drop on UNMATCHED");
});

test("campTakedownDefence emits its camp event when SPRAWL_SUCCESS bonus is MATCHED", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campTakedownDefence"];
    res.sessionBonuses = [{ bonusType: "SPRAWL_SUCCESS", matchStatus: "MATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightSprawlKeep");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_takedown_defence_fired");
    assert.strictEqual(hasCamp, true, "campTakedownDefence camp event must fire on MATCHED SPRAWL_SUCCESS");
});

test("campTakedownDefence camp event is dropped when SPRAWL_SUCCESS bonus is UNMATCHED", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campTakedownDefence"];
    res.sessionBonuses = [{ bonusType: "SPRAWL_SUCCESS", matchStatus: "UNMATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightSprawlDrop");
    const hasCamp = eventLog.some((e) => e.templateKey === "camp_takedown_defence_fired");
    assert.strictEqual(hasCamp, false, "campTakedownDefence camp event must drop on UNMATCHED");
});

// Cross-check: the CAMP_BONUS_TYPE map values must match the real SESSION_BONUSES
// bonusType strings in consts/campConfig.js (guards against future drift).
test("CAMP_BONUS_TYPE values match real SESSION_BONUSES bonusType strings", () => {
    const { SESSION_BONUSES } = require("../../consts/campConfig");
    const realTypes = new Set(Object.values(SESSION_BONUSES).map((b) => b.bonusType));
    // campKey → expected bonusType per camp session.
    const expected = {
        campCardio: "STAMINA_DRAIN",
        campTakedownDefence: "SPRAWL_SUCCESS",
        campSubmissionEscape: "ESCAPE_PROBABILITY",
        campGnpPosture: "GNP_DAMAGE",
        campClinchControl: "CLINCH_DAMAGE",
        campStrikingAccuracy: "STRIKE_DAMAGE",
        campBodyShot: "BODY_DAMAGE",
    };
    for (const [key, bt] of Object.entries(expected)) {
        assert.ok(realTypes.has(bt), `${key} → ${bt} must exist in SESSION_BONUSES bonusType strings`);
    }
});

test("campBodyShot maps to a strike_body event (not a camp event)", () => {
    const res = decisionResult();
    res.rounds[0].campCommentary = ["campBodyShot"];
    res.sessionBonuses = [{ bonusType: "BODY_DAMAGE", matchStatus: "MATCHED" }];
    const { eventLog } = deriveFightDetails(res, baseCtx, "fightBody");
    const body = eventLog.find((e) => e.templateKey === "strike_body");
    assert.ok(body, "expected a strike_body event");
    assert.strictEqual(body.type, "strike");
    assert.strictEqual(body.vars.bodyPart, "body");
});

// ── Event log size + ordering ───────────────────────────────────────────────────
test("each round has 3–6 events, ordered by timestamp within the round", () => {
    const { eventLog } = deriveFightDetails(decisionResult(), baseCtx, "fightOrder");
    const byRound = new Map();
    for (const e of eventLog) {
        if (!byRound.has(e.round)) byRound.set(e.round, []);
        byRound.get(e.round).push(e);
    }
    for (const [, evs] of byRound) {
        assert.ok(evs.length >= 3 && evs.length <= 6, `round events between 3 and 6, got ${evs.length}`);
        // timestamps non-decreasing in seconds
        let prev = -1;
        for (const e of evs) {
            const [m, s] = e.timestamp.split(":").map(Number);
            const sec = m * 60 + s;
            assert.ok(sec >= prev, "timestamps non-decreasing");
            prev = sec;
        }
    }
});

// ── Schema-vocabulary conformance ───────────────────────────────────────────────
test("eventLog types are in the coarse vocabulary", () => {
    const allowed = new Set(["strike", "takedown", "submission", "ground", "knockdown", "camp", "finish", "neutral"]);
    const { eventLog } = deriveFightDetails(koResult(), baseCtx, "fightVocab");
    for (const e of eventLog) assert.ok(allowed.has(e.type), `bad type ${e.type}`);
});

// ════════════════════════════════════════════════════════════════════════════════
// Coherence-bug fixes (Fight Description System v2)
// ════════════════════════════════════════════════════════════════════════════════
const { buildBreakdownResponse } = require("../../utils/fightBreakdownView");

// Helper: persist-shaped breakdown (engine perspective) → shaped player-view.
function shapeAsPlayer(engineResult, ctx, fightId, outcome) {
    const bd = deriveFightDetails(engineResult, ctx, fightId);
    return buildBreakdownResponse({
        breakdown: { version: 1, ...bd },
        kind: "pve",
        fightId,
        outcome,
        youWon: engineResult.winner === "player",
        perspective: "player",
        header: { opponentName: "Opp", tier: "Pro", campGrade: null, weightCut: null },
        campOutcomes: [],
        wildcardText: null,
    });
}

// ── Item 4: split tko_finish by archetype; never emit the bare tko_finish key ──────
test("never emits the bare tko_finish key (any archetype / cause)", () => {
    const fixtures = [
        ["fightKO2", koResult(), "KO/TKO"],
        ["fightTkoStr", tkoStrikeResult(), "KO/TKO"],
        ["fightTkoGnd", tkoGroundResult(), "KO/TKO"],
        ["fightSub2", subLossResult(), "Loss (submission)"],
        ["fightCarry", carriedControlResult(), "Decision (unanimous)"],
    ];
    for (const [fid, res] of fixtures) {
        const { eventLog } = deriveFightDetails(res, baseCtx, fid);
        for (const e of eventLog) {
            assert.notStrictEqual(e.templateKey, "tko_finish", `${fid} emitted the forbidden bare tko_finish`);
        }
    }
});

test("ground-archetype finishing round → tko_finish_ground", () => {
    const { eventLog } = deriveFightDetails(tkoGroundResult(), baseCtx, "fightGnd");
    const last = eventLog[eventLog.length - 1];
    assert.strictEqual(last.templateKey, "tko_finish_ground");
    assert.strictEqual(last.type, "finish");
});

test("striking exhaustion finish (finishCause tko) → tko_finish_strike", () => {
    const { eventLog } = deriveFightDetails(tkoStrikeResult(), baseCtx, "fightStr");
    const last = eventLog[eventLog.length - 1];
    assert.strictEqual(last.templateKey, "tko_finish_strike");
});

test("striking clean KO (finishCause ko) → ko_finish", () => {
    const { eventLog } = deriveFightDetails(koResult(), baseCtx, "fightCleanKo");
    const last = eventLog[eventLog.length - 1];
    assert.strictEqual(last.templateKey, "ko_finish");
});

// ── Item 3: finish-event vars — strike for ko/tko, sub for submission, never both ──
test("finish event has the right var: (T)KO carries strike not sub; submission carries sub not strike", () => {
    const ko = deriveFightDetails(koResult(), baseCtx, "fightV1").eventLog.at(-1);
    assert.ok(ko.vars.strike, "ko_finish must carry vars.strike");
    assert.strictEqual(ko.vars.sub, null, "ko_finish must NOT carry vars.sub");

    const tkoG = deriveFightDetails(tkoGroundResult(), baseCtx, "fightV2").eventLog.at(-1);
    assert.ok(tkoG.vars.strike, "tko_finish_ground must carry vars.strike");
    assert.strictEqual(tkoG.vars.sub, null);

    const tkoS = deriveFightDetails(tkoStrikeResult(), baseCtx, "fightV3").eventLog.at(-1);
    assert.ok(tkoS.vars.strike, "tko_finish_strike must carry vars.strike");
    assert.strictEqual(tkoS.vars.sub, null);

    const sub = deriveFightDetails(subLossResult(), baseCtx, "fightV4").eventLog.at(-1);
    assert.ok(sub.vars.sub, "submission_finish must carry vars.sub");
    assert.strictEqual(sub.vars.strike, null, "submission_finish must NOT carry vars.strike");
});

// ── Item 2: header method derived from the finish event templateKey ────────────────
test("header method = KO/TKO/submission, derived from the finish event (not the outcome string)", () => {
    const ko = shapeAsPlayer(koResult(), baseCtx, "fightHKO", "KO/TKO");
    assert.strictEqual(ko.method, "KO");

    const tkoS = shapeAsPlayer(tkoStrikeResult(), baseCtx, "fightHTKOs", "KO/TKO");
    assert.strictEqual(tkoS.method, "TKO");

    const tkoG = shapeAsPlayer(tkoGroundResult(), baseCtx, "fightHTKOg", "KO/TKO");
    assert.strictEqual(tkoG.method, "TKO");

    const sub = shapeAsPlayer(subLossResult(), baseCtx, "fightHSub", "Loss (submission)");
    assert.strictEqual(sub.method, "submission");

    const dec = shapeAsPlayer(decisionResult(), baseCtx, "fightHDec", "Decision (unanimous)");
    assert.strictEqual(dec.method, "decision");
});

test("PvP path can express TKO (a 'ko'-method PvP doc whose finish event is tko_finish_*)", () => {
    // Same outcome string the engine emits; PvP stores method "ko" (enum has no tko).
    const bd = deriveFightDetails(tkoGroundResult(), baseCtx, "fightPvpTko");
    const shaped = buildBreakdownResponse({
        breakdown: { version: 1, ...bd },
        kind: "pvp",
        fightId: "fightPvpTko",
        outcome: "ko",
        method: "ko",
        youWon: true,
        perspective: "player",
        header: { opponentName: "Opp", tier: "contender" },
        campOutcomes: [],
        wildcardText: null,
    });
    assert.strictEqual(shaped.method, "TKO", "PvP TKO must not collapse to KO");
});

// ── Item 5: per-round knockdown counter == count of emitted knockdown events ────────
test("per-round knockdown counter equals the number of emitted knockdown events", () => {
    const fixtures = [
        ["fightKDk", koResult()],
        ["fightKDts", tkoStrikeResult()],
        ["fightKDtg", tkoGroundResult()],
        ["fightKDsub", subLossResult()],
        ["fightKDdec", decisionResult()],
    ];
    for (const [fid, res] of fixtures) {
        const { roundStats, eventLog } = deriveFightDetails(res, baseCtx, fid);
        for (const rs of roundStats) {
            const evs = eventLog.filter((e) => e.round === rs.round && e.type === "knockdown");
            // A fighter's knockdown stat = knockdowns they SCORED (the event's actor).
            const playerScored = evs.some((e) => e.actorIsPlayer) ? 1 : 0;  // player landed → player's KD
            const oppScored = evs.some((e) => !e.actorIsPlayer) ? 1 : 0;     // opponent landed → opp's KD
            assert.strictEqual(rs.knockdownsPlayer, playerScored, `${fid} r${rs.round} player-KD counter ≠ events`);
            assert.strictEqual(rs.knockdownsOpponent, oppScored, `${fid} r${rs.round} opp-KD counter ≠ events`);
        }
    }
});

test("clean KO credits the WINNER who scored it (not the victim); ground TKO shows 0", () => {
    // koResult is a player KO win → the PLAYER scored the knockdown, so it is theirs.
    const ko = deriveFightDetails(koResult(), baseCtx, "fightKDcount");
    const koFinal = ko.roundStats.at(-1);
    assert.strictEqual(koFinal.knockdownsPlayer, 1, "clean KO → the player who landed it is credited");
    assert.strictEqual(koFinal.knockdownsOpponent, 0, "the knocked-down opponent is NOT credited a knockdown");

    const tkoG = deriveFightDetails(tkoGroundResult(), baseCtx, "fightKDcountG");
    const gFinal = tkoG.roundStats.at(-1);
    const gKdEvents = tkoG.eventLog.filter((e) => e.round === gFinal.round && e.type === "knockdown");
    assert.strictEqual(gKdEvents.length, 0, "ground TKO emits no knockdown event");
    assert.strictEqual(gFinal.knockdownsPlayer, 0, "ground TKO → no knockdown credited");
    assert.strictEqual(gFinal.knockdownsOpponent, 0, "ground TKO counter must be 0");
});

// ── Item 6: carried-control framing on GROUND_* continuation rounds ────────────────
test("continuation round (control carried, 0 takedowns) emits ground_control_carried", () => {
    const { roundStats, eventLog } = deriveFightDetails(carriedControlResult(), baseCtx, "fightCarried");
    // Round 3 is the GROUND_PLAYER continuation.
    const r3 = roundStats.find((rs) => rs.round === 3);
    assert.strictEqual(r3.takedownsPlayer, 0, "continuation round has 0 new takedowns");
    const carried = eventLog.find((e) => e.round === 3 && e.templateKey === "ground_control_carried");
    assert.ok(carried, "expected a ground_control_carried event on the continuation round");
    assert.strictEqual(carried.type, "ground");
    assert.strictEqual(carried.actorIsPlayer, true);
    // The takedown round (2) itself must NOT carry control framing.
    const r2carried = eventLog.find((e) => e.round === 2 && e.templateKey === "ground_control_carried");
    assert.strictEqual(r2carried, undefined, "the takedown round must not be framed as carried");
});

// ── Item 7: exactly one finish event per fight, always last in its round ────────────
test("exactly one finish event per fight, and it is the last event of its round", () => {
    const fixtures = [
        ["fightF1", koResult()],
        ["fightF2", tkoStrikeResult()],
        ["fightF3", tkoGroundResult()],
        ["fightF4", subLossResult()],
    ];
    for (const [fid, res] of fixtures) {
        const { eventLog } = deriveFightDetails(res, baseCtx, fid);
        const finishes = eventLog.filter((e) => e.type === "finish");
        assert.strictEqual(finishes.length, 1, `${fid} must have exactly one finish event`);
        // It must be the very last event of the log (finish round is the last round).
        assert.strictEqual(eventLog.at(-1).type, "finish", `${fid} finish must be last`);
    }
});

test("decisions/draws emit NO finish event", () => {
    const { eventLog } = deriveFightDetails(decisionResult(), baseCtx, "fightNoFinish");
    assert.strictEqual(eventLog.some((e) => e.type === "finish"), false);
});
