/**
 * Ready glow accuracy sweep (docs/move-ready-glow-spec.md §9).
 *
 * Resolves seeded fights with the REAL engine, derives the REAL breakdown, shapes it through the
 * REAL view builder (with the saved healthStart / staminaStart / scheduledRounds) and runs the REAL
 * frontend moveReadiness(). The glow is only honest if it matches the engine's gates, so:
 *   1. every logged fire of a covered move falls in a round the helper calls open;
 *   2. a move the helper calls "never ready" never fired;
 *   3. a move that fired was ready at some point;
 *   4. a one-shot (Overhand Right, Superman Punch) fired at most once, in its first-or-later open round.
 */
const assert = require("node:assert");
const { test } = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { resolveFight } = require("../../utils/fightResolution");
const { deriveFightDetails } = require("../../utils/fightBreakdown");
const { buildBreakdownResponse } = require("../../utils/fightBreakdownView");
const { buildLoadoutSnapshot } = require("../../utils/fightLoadoutSnapshot");
const specialMovesService = require("../../services/specialMovesService");

const helperP = import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/components/fights/moveReadiness.js")).href);
const modelP = import(pathToFileURL(path.resolve(__dirname, "../../frontend/src/components/fights/reveal/revealModel.js")).href);

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
    Math.random = mulberry32(seed);
    try { return fn(); } finally { Math.random = orig; }
}

const LOADOUTS = [
    ["THE_FINISHER", "SECOND_GEAR", "FIGHTING_SPIRIT"],
    ["KILLER_INSTINCT", "SECOND_WIND", "DEEP_WATERS"],
    ["SUPERMAN_PUNCH", "THE_FINISHER", "SECOND_WIND"],
];
const STRATS = [null, "Pressure Fighter", "Takedown Heavy", "Counter Striker", "Ground & Pound", "Submission Hunter"];

function statBlock(rng, lo, hi) {
    const v = () => Math.round(lo + rng() * (hi - lo));
    return { str: v(), spd: v(), leg: v(), wre: v(), gnd: v(), sub: v(), chn: v(), fiq: v() };
}

test("ready glow: every fire happens in a round the glow called open, and never-ready moves never fire", async () => {
    const { moveReadiness, READY_TRIGGERS } = await helperP;
    const counts = { fights: 0, fires: 0, readyNotFired: 0, neverReady: 0, byMove: {} };
    for (let i = 0; i < 360; i++) {
        const ids = LOADOUTS[i % LOADOUTS.length];
        const rng = mulberry32(1000 + i);
        const lo = 10 + Math.floor(rng() * 40);
        const p = { health: 60 + Math.floor(rng() * 41), stamina: 100, maxStamina: 100, ...statBlock(rng, lo, lo + 30) };
        const o = { health: 100, stamina: 100, maxStamina: 100, ...statBlock(rng, lo, lo + 30) };
        const maxRounds = i % 4 === 0 ? 3 : 5;
        const moveBonuses = specialMovesService.buildMoveBonuses({
            specialMovesOwned: ids.map((id) => ({ moveId: id, rarity: "LEGENDARY", acquiredAt: new Date(0) })),
            specialMovesEquipped: [...ids],
        });
        const opts = { maxRounds, moveBonuses, sessionBonuses: [], playerStrategy: STRATS[i % STRATS.length], opponentStrategy: STRATS[(i + 2) % STRATS.length] };
        const result = withSeed(5000 + i, () => resolveFight(p, o, opts));
        const fightId = `ready-${i}`;
        const bd = deriveFightDetails(result, {
            playerStyle: "Boxer", opponentStyle: "Wrestler", isTitle: false, isGrudge: false, comeback: false,
            isCallout: false, playerOvr: 30, opponentOvr: 30, playerName: "You", opponentName: "Him", maxRounds,
        }, fightId);
        const loadout = buildLoadoutSnapshot({
            moveBonuses: result.moveBonuses, sessionBonuses: result.sessionBonuses,
            equippedOrder: ids, ownedRarities: Object.fromEntries(ids.map((id) => [id, "LEGENDARY"])),
        });
        const view = buildBreakdownResponse({
            breakdown: {
                version: 2, roundStats: bd.roundStats, eventLog: bd.eventLog, introTemplateKey: bd.introTemplateKey,
                resultContextKey: bd.resultContextKey, loadout, staminaStart: bd.staminaStart, healthStart: bd.healthStart,
                scheduledRounds: maxRounds,
            },
            kind: "pve", fightId, outcome: result.outcome, youWon: result.winner === "player", perspective: "player",
            header: { playerName: "You", opponentName: "Him", tier: "Amateur", campGrade: "A", weightCut: { label: "easy", roll: 0 } },
        });
        const rd = moveReadiness(view);
        counts.fights++;
        for (const m of loadout.moves) {
            if (!READY_TRIGGERS[m.triggerCondition]) continue;
            const r = rd[m.moveId];
            const label = `${fightId} ${m.moveId}`;
            assert.ok(r, `${label}: covered move missing from readiness`);
            const bucket = counts.byMove[m.moveId] || (counts.byMove[m.moveId] = { fights: 0, fired: 0, ready: 0 });
            bucket.fights++;
            if (r.openRounds.length) bucket.ready++;
            if (m.firedCount > 0) bucket.fired++;
            for (const n of r.firedRounds) {
                counts.fires++;
                assert.ok(r.openRounds.includes(n), `${label}: fired in round ${n}, glow open in [${r.openRounds}]`);
            }
            if (!r.openRounds.length) {
                counts.neverReady++;
                assert.strictEqual(m.firedCount, 0, `${label}: helper says never ready but it fired ${m.firedCount}x`);
            }
            if (m.firedCount > 0) assert.ok(r.openRounds.length > 0, `${label}: fired but never ready`);
            if (r.oneShot) {
                assert.ok(m.firedCount <= 1, `${label}: one-shot fired ${m.firedCount}x`);
                assert.ok(r.firedRounds.length <= 1, `${label}: one-shot logged in ${r.firedRounds.length} rounds`);
            }
            if (r.openRounds.length && m.firedCount === 0) counts.readyNotFired++;
        }
    }
    if (process.env.SWEEP_DEBUG) console.log(JSON.stringify(counts));
    // The sweep must actually exercise every covered move, firing and not firing.
    for (const id of ["THE_FINISHER", "KILLER_INSTINCT", "SUPERMAN_PUNCH", "SECOND_GEAR", "SECOND_WIND", "FIGHTING_SPIRIT", "DEEP_WATERS"]) {
        const b = counts.byMove[id];
        assert.ok(b && b.fired > 0, `sweep never saw ${id} fire`);
        assert.ok(b.ready > 0, `sweep never saw ${id} ready`);
    }
    assert.ok(counts.neverReady > 0 && counts.readyNotFired >= 0 && counts.fires > 100, JSON.stringify(counts));
});


/** Builds one seeded fight's view exactly like the sweep above (shared seeds and loadouts). */
function buildView(i) {
    const ids = [["CLINCH_KILLER", "THE_FINISHER", "MOUNT_REAPER"], ["SUPERMAN_PUNCH", "SECOND_GEAR", "DEEP_WATERS"], ["KILLER_INSTINCT", "TOP_CONTROL", "SPRAWL_INSTINCT"]][i % 3];
    const rng = mulberry32(9000 + i);
    const lo = 10 + Math.floor(rng() * 40);
    const p = { health: 100, stamina: 100, maxStamina: 100, ...statBlock(rng, lo, lo + 30) };
    const o = { health: 100, stamina: 100, maxStamina: 100, ...statBlock(rng, lo, lo + 30) };
    const moveBonuses = specialMovesService.buildMoveBonuses({
        specialMovesOwned: ids.map((id) => ({ moveId: id, rarity: "LEGENDARY", acquiredAt: new Date(0) })),
        specialMovesEquipped: [...ids],
    });
    const camp = [
        { sessionType: "STRIKING_ACCURACY", label: "Striking Accuracy", bonusType: "STRIKE_DAMAGE", effectiveValue: 0.08, matchStatus: "MATCHED", triggered: false, triggerCount: 0 },
        { sessionType: "CLINCH_CONTROL", label: "Clinch Control", bonusType: "CLINCH_DAMAGE", effectiveValue: 0.1, matchStatus: "MATCHED", triggered: false, triggerCount: 0 },
    ];
    const result = withSeed(7000 + i, () => resolveFight(p, o, { maxRounds: 5, moveBonuses, sessionBonuses: camp, playerStrategy: STRATS[i % STRATS.length] }));
    const bd = deriveFightDetails(result, {
        playerStyle: "Boxer", opponentStyle: "Wrestler", isTitle: false, isGrudge: false, comeback: false,
        isCallout: false, playerOvr: 30, opponentOvr: 30, playerName: "You", opponentName: "Him", maxRounds: 5,
    }, `hit-${i}`);
    const loadout = buildLoadoutSnapshot({ moveBonuses: result.moveBonuses, sessionBonuses: result.sessionBonuses, equippedOrder: ids, ownedRarities: Object.fromEntries(ids.map((id) => [id, "LEGENDARY"])) });
    return buildBreakdownResponse({
        breakdown: { version: 2, roundStats: bd.roundStats, eventLog: bd.eventLog, introTemplateKey: bd.introTemplateKey, resultContextKey: bd.resultContextKey, loadout, staminaStart: bd.staminaStart, healthStart: bd.healthStart, scheduledRounds: 5 },
        kind: "pve", fightId: `hit-${i}`, outcome: result.outcome, youWon: result.winner === "player", perspective: "player",
        header: { playerName: "You", opponentName: "Him", tier: "Amateur", campGrade: "A", weightCut: { label: "easy", roll: 0 } },
    });
}

test("replay: a card that says he was hurt moves his health on that card (owner: WOBBLED but HP the same)", async () => {
    const { buildHighlightScript, hitWeight } = await modelP;
    let checked = 0;
    for (let i = 0; i < 240; i++) {
        const view = buildView(i);
        const { items } = buildHighlightScript(view);
        const byRound = {};
        for (const it of items) if (it.kind === "highlight") (byRound[it.round] = byRound[it.round] || []).push(it);
        for (const r of view.rounds) {
            const cards = byRound[r.round] || [];
            const prevEnd = r.round === 1 ? view.healthStart : view.rounds.find((x) => x.round === r.round - 1)?.health;
            if (!prevEnd || !r.health) continue;
            for (const it of cards) {
                const hw = hitWeight(it);
                const strong = hw && hw.w >= 3;
                if (!strong) continue;
                const roundLoss = Math.round(prevEnd[hw.target]) - Math.round(r.health[hw.target]);
                if (roundLoss < 3) continue; // a 1 to 2 point round can round to 0 on a single card
                checked++;
                assert.ok(it.hpLoss[hw.target] > 0, `hit-${i} R${r.round} ${it.hkind}/${it.event?.vars?.outcome || it.event?.templateKey}: round cost ${roundLoss} but the card moved nothing`);
            }
        }
    }
    assert.ok(checked > 50, `only ${checked} strong cards checked`);
});
