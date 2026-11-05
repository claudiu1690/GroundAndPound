/**
 * Fight replay "Highlights with your cards": consistency test (contract section F, spec section 7).
 *
 * The owner requirement: everything the replay shows is a real persisted eventLog event that the
 * detailed fight description also renders, with real-or-null times, outcome-accurate lines and
 * identical counts. This resolves seeded fights with the REAL engine, derives the REAL breakdown,
 * shapes it through the REAL view builder and feeds the REAL frontend pure modules (loaded as ESM).
 *
 * Builder deviations honoured: items carry logIndex (global eventLog index); a combo is one
 * item with combo {event, logIndex, line}; moves/camp that lose the 4-card cut become ticks.
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
const golden = require("../fixtures/fightResolution.golden.json");

const FE = path.resolve(__dirname, "../../frontend/src/components/fights");
const modsP = Promise.all([
    import(pathToFileURL(path.join(FE, "reveal/revealModel.js")).href),
    import(pathToFileURL(path.join(FE, "reveal/highlightLines.js")).href),
    import(pathToFileURL(path.join(FE, "breakdown/renderEvent.js")).href),
]).then(([model, lines, render]) => ({ model, lines, render }));

// Fixtures copied from tests/utils/fightResolution.golden.test.js (requiring it would run it).
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
    try { return { result: fn(), draws }; } finally { Math.random = orig; }
}
const fighter = (o = {}) => ({
    health: 100, stamina: 100, maxStamina: 100,
    str: 40, spd: 40, leg: 30, wre: 25, gnd: 25, sub: 20, chn: 45, fiq: 30, ...o,
});
const STRIKER = { str: 60, spd: 55, leg: 50, wre: 25, gnd: 20, sub: 15, chn: 50, fiq: 40 };
const GRAPPLER = { str: 40, spd: 35, leg: 25, wre: 65, gnd: 60, sub: 60, chn: 45, fiq: 40 };
const BRAWLER = { str: 70, spd: 45, leg: 45, wre: 40, gnd: 35, sub: 25, chn: 35, fiq: 30 };
const SCENARIOS = [
    { name: "striker-mirror-3r", seed: 11, p: STRIKER, o: STRIKER, opts: { maxRounds: 3, playerStrategy: "Pressure Fighter", opponentStrategy: "Counter Striker" } },
    { name: "grappler-vs-striker-5r", seed: 23, p: GRAPPLER, o: STRIKER, opts: { maxRounds: 5, playerStrategy: "Takedown Heavy", opponentStrategy: "Pressure Fighter" } },
    { name: "striker-vs-grappler-5r", seed: 37, p: STRIKER, o: GRAPPLER, opts: { maxRounds: 5, playerStrategy: "Counter Striker", opponentStrategy: "Submission Hunter" } },
    { name: "grappler-mirror-sub-hunt-5r", seed: 41, p: GRAPPLER, o: GRAPPLER, opts: { maxRounds: 5, playerStrategy: "Submission Hunter", opponentStrategy: "Ground & Pound" } },
    { name: "brawler-vs-striker-3r", seed: 53, p: BRAWLER, o: STRIKER, opts: { maxRounds: 3, playerStrategy: "Clinch Bully", opponentStrategy: null } },
    { name: "default-mirror-5r", seed: 67, p: {}, o: {}, opts: { maxRounds: 5 } },
    { name: "grappler-vs-brawler-ironwill-5r", seed: 79, p: GRAPPLER, o: BRAWLER, opts: { maxRounds: 5, playerStrategy: "Ground & Pound", opponentStrategy: "Takedown Heavy", ironWillPerk: true } },
    { name: "striker-vs-grappler-with-camp-3r", seed: 97, p: STRIKER, o: GRAPPLER, opts: { maxRounds: 3, playerStrategy: "Survival Mode", opponentStrategy: "Takedown Heavy" }, camp: true },
    { name: "dominant-wrestler-5r", seed: 101, p: { ...GRAPPLER, wre: 90, gnd: 80, sub: 75 }, o: { ...STRIKER, wre: 10, gnd: 10, sub: 10, chn: 25 }, opts: { maxRounds: 5, playerStrategy: "Ground & Pound", opponentStrategy: "Pressure Fighter" } },
    { name: "dominant-striker-5r", seed: 131, p: { str: 90, spd: 80, leg: 70, wre: 30, gnd: 25, sub: 20, chn: 90, fiq: 50 }, o: { str: 15, spd: 15, leg: 15, wre: 20, gnd: 20, sub: 15, chn: 10, fiq: 20 }, opts: { maxRounds: 5, playerStrategy: "Pressure Fighter" } },
    { name: "dominant-sub-hunter-3r", seed: 151, p: { ...GRAPPLER, wre: 80, sub: 90 }, o: { ...BRAWLER, wre: 15, sub: 10 }, opts: { maxRounds: 3, playerStrategy: "Submission Hunter", opponentStrategy: "Clinch Bully" } },
];
const LOADOUTS = {
    none: null,
    offense_L: { ids: ["HEAVY_HANDS", "THE_FINISHER", "KILLER_INSTINCT"], rarity: "LEGENDARY" },
    defense_R: { ids: ["GRANITE_JAW", "VETERAN_IQ", "NEVER_TAP"], rarity: "RARE" },
    grapple_L: { ids: ["SPRAWL_INSTINCT", "MOUNT_REAPER", "IRON_RECOVERY"], rarity: "LEGENDARY" },
    tempo_U: { ids: ["BODY_SNATCHER", "CLINCH_KILLER", "SECOND_WIND"], rarity: "UNCOMMON" },
};
function buildLoadoutBonuses(spec) {
    if (!spec) return [];
    return specialMovesService.buildMoveBonuses({
        specialMovesOwned: spec.ids.map((id) => ({ moveId: id, rarity: spec.rarity, acquiredAt: new Date(0) })),
        specialMovesEquipped: [...spec.ids],
    });
}
function goldenCamp() {
    return [
        { sessionType: "STRIKING_ACCURACY", bonusType: "STRIKE_DAMAGE", effectiveValue: 0.05, triggered: false, triggerCount: 0 },
        { sessionType: "TAKEDOWN_DEFENCE", bonusType: "SPRAWL_SUCCESS", effectiveValue: 0.08, triggered: false, triggerCount: 0 },
        { sessionType: "CARDIO_PUSH", bonusType: "STAMINA_DRAIN", effectiveValue: 0.1, triggered: false, triggerCount: 0 },
    ];
}
/** Real booked camp: every lane carries label/sessionType/matchStatus (as buildSessionBonuses writes). */
function fullCamp() {
    const row = (sessionType, label, bonusType, v, matchStatus = "MATCHED") =>
        ({ sessionType, label, bonusType, effectiveValue: v, matchStatus, triggered: false, triggerCount: 0 });
    return [
        row("TAKEDOWN_DEFENCE", "Takedown Defence Drilling", "SPRAWL_SUCCESS", 0.12),
        row("SUBMISSION_ESCAPES", "Submission Escapes", "ESCAPE_PROBABILITY", 0.12),
        row("STRIKING_ACCURACY", "Striking Accuracy", "STRIKE_DAMAGE", 0.08),
        row("CARDIO_PUSH", "Cardio Push", "STAMINA_DRAIN", 0.1, "PARTIAL"),
        row("GROUND_AND_POUND_POSTURE", "Ground and Pound Posture", "GNP_DAMAGE", 0.1),
        row("CLINCH_CONTROL", "Clinch Control", "CLINCH_DAMAGE", 0.1),
    ];
}
const WILDCARD = () => ({ stat: "wre", counterSession: "GAME_PLAN_STUDY", fightEffect: 0.15, description: "has added a wrestling game" });

const ctxFor = (maxRounds) => ({
    playerStyle: "Wrestler", opponentStyle: "Boxer", isTitle: false, isGrudge: false, comeback: false,
    isCallout: false, playerOvr: 30, opponentOvr: 30, playerName: "Tarek", opponentName: "Rival", maxRounds,
});

/** Run the whole pipeline once. */
async function pipeline({ sc, loadoutName, spec, camp, wildcard, seed }) {
    const { model, lines, render } = await modsP;
    const moveBonuses = buildLoadoutBonuses(spec);
    const sessionBonuses = camp === "full" ? fullCamp() : camp === "golden" ? goldenCamp() : [];
    const { result, draws } = withSeed(seed ?? sc.seed, () =>
        resolveFight(fighter(sc.p), fighter(sc.o), { ...sc.opts, sessionBonuses, moveBonuses, wildcard: wildcard ?? null }));
    const fightId = `fight-${sc.name}-${loadoutName}-${camp || "nocamp"}-${wildcard ? "wc" : "nowc"}-${seed ?? sc.seed}`;
    const bd = deriveFightDetails(result, ctxFor(sc.opts.maxRounds), fightId);
    const ownedRarities = spec ? Object.fromEntries(spec.ids.map((id) => [id, spec.rarity])) : {};
    const loadout = buildLoadoutSnapshot({
        moveBonuses: result.moveBonuses, sessionBonuses: result.sessionBonuses,
        equippedOrder: spec ? spec.ids : [], ownedRarities,
    });
    const view = buildBreakdownResponse({
        breakdown: { version: 2, roundStats: bd.roundStats, eventLog: bd.eventLog, introTemplateKey: bd.introTemplateKey, resultContextKey: bd.resultContextKey, loadout },
        kind: "pve", fightId, outcome: result.outcome,
        youWon: result.winner === "player", perspective: "player",
        header: { playerName: "Tarek", opponentName: "Rival", tier: "Amateur", campGrade: "A", weightCut: { label: "easy", roll: 0 } },
    });
    const script = model.buildHighlightScript(view, { speed: 1 });
    return { model, lines, render, result, draws, bd, loadout, view, script, fightId, label: fightId };
}

const DASH = /[–—]/;
const FALLBACK = /makes a move\./;
const wordsOf = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

const stats = { fights: 0, moveEvents: 0, campEvents: 0, wildcardEvents: 0, highlights: 0, combos: 0, quiet: 0,
    outcomes: new Set(), withTimedMove: 0, stuffedEvents: 0 };

function checkFight(p) {
    const { model, lines, render, result, loadout, view, script, label } = p;
    const log = view.eventLog;
    const items = script.items;
    stats.fights += 1;
    const rounds = view.rounds.map((r) => r.round);

    // Rule 2: every highlight (incl. exchange) and combo is a logged event.
    const perRound = {};
    const campCardsSeen = {};
    for (const it of items) {
        if (it.kind === "quiet") {
            stats.quiet += 1;
            const rd = view.rounds.find((r) => r.round === it.round);
            // Owner 2026-11-04: a round only reads as quiet when it logged nothing the replay can show.
            const inRound = log.filter((e) => e.round === it.round);
            const noisy = inRound.filter((e) => ["finish", "wildcard"].includes(e.type) || ["knockdown", "submission_attempt", "takedown_secured", "strike_hurt", "strike_clean", "strike_body", "ground_pound", "ground_control_carried", "takedown_stuffed"].includes(e.templateKey));
            assert.equal(noisy.length, 0, `${label}: quiet item in round ${it.round} though it has highlightable events ${noisy.map((e) => e.templateKey)}`);
            assert.ok(it.line && !DASH.test(it.line), `${label}: quiet line`);
        }
        if (it.kind !== "highlight") continue;
        stats.highlights += 1;
        if (it.hkind === "exchange") stats.exchange = (stats.exchange || 0) + 1;
        perRound[it.round] = (perRound[it.round] || 0) + 1;
        assert.ok(Number.isInteger(it.logIndex), `${label}: highlight without logIndex`);
        assert.deepStrictEqual(log[it.logIndex], it.event, `${label}: highlight does not match eventLog[${it.logIndex}]`);
        assert.equal(it.event.round, it.round, `${label}: highlight round`);
        if (it.combo) {
            stats.combos += 1;
            assert.deepStrictEqual(log[it.combo.logIndex], it.combo.event, `${label}: combo does not match eventLog[${it.combo.logIndex}]`);
            assert.equal(it.combo.event.round, it.event.round);
            assert.equal(it.combo.event.timestamp, it.event.timestamp, `${label}: combo camp/move timestamps differ`);
            assert.equal(it.combo.event.type, "camp");
            assert.equal(it.event.type, "move");
            assert.ok(it.combo.logIndex < it.logIndex);
            assert.equal(it.segments.length, 2, `${label}: combo has two segments`);
        }
        assert.ok(it.line && it.line.length > 0, `${label}: empty short line for ${it.event.templateKey} (${it.hkind})`);
        for (const ln of [it.line, it.combo && it.combo.line].filter(Boolean)) {
            assert.ok(!/[{}]/.test(ln), `${label}: placeholder in "${ln}"`);
            assert.ok(!DASH.test(ln), `${label}: dash in "${ln}"`);
            assert.ok(!/undefined|NaN|null/.test(ln), `${label}: bad value in "${ln}"`);
            assert.ok(wordsOf(ln) <= 14, `${label}: line too long "${ln}"`);
        }
        assert.ok(it.durationMs > 0 && it.baseMs === it.segments.reduce((a, b) => a + b, 0));
        assert.equal(it.clock.timestamp, it.event.timestamp ?? null, `${label}: clock != event timestamp`);
        if (it.hkind === "exchange") {
            assert.ok(["ground_pound", "ground_control_carried", "takedown_stuffed", "strike_body", "strike_clean"].includes(it.event.templateKey), `${label}: exchange key ${it.event.templateKey}`);
            // Strike lines name the logged strike when there is one.
            if (["strike_clean", "strike_body"].includes(it.event.templateKey) && it.event.vars && it.event.vars.strike) {
                assert.ok(it.line.toLowerCase().includes(String(it.event.vars.strike).toLowerCase()), `${label}: exchange line "${it.line}" does not name ${it.event.vars.strike}`);
            }
        }
        // One gold camp card per session per fight; later fires only tick the corner chip.
        for (const campEv of [it.hkind === "camp" ? it.event : null, it.combo ? it.combo.event : null].filter(Boolean)) {
            const key = campEv.templateKey;
            campCardsSeen[key] = (campCardsSeen[key] || 0) + 1;
            assert.equal(campCardsSeen[key], 1, `${label}: second camp card for ${key}`);
        }
    }
    for (const r of rounds) assert.ok((perRound[r] || 0) <= 5, `${label}: round ${r} has ${perRound[r]} highlights`);
    for (const r of rounds) {
        const hl = items.filter((i) => i.round === r && i.kind === "highlight").length;
        const q = items.filter((i) => i.round === r && i.kind === "quiet").length;
        assert.ok(hl + q > 0, `${label}: round ${r} empty`);
        assert.ok(!(hl > 0 && q > 0), `${label}: round ${r} has both quiet and highlights`);
    }

    // Spoilers: finish card last and unique; finish_hit only in the finish round.
    const finishEvt = [...log].reverse().find((e) => e.type === "finish");
    const finishIdx = items.findIndex((i) => i.kind === "finish_card");
    assert.equal(finishIdx, items.length - 1, `${label}: finish_card must be last`);
    assert.equal(items.filter((i) => i.kind === "finish_card").length, 1);
    for (const it of items.slice(0, finishIdx)) {
        if (it.kind === "highlight" && it.hkind === "finish_hit") {
            assert.ok(finishEvt && it.event.round === finishEvt.round, `${label}: finish_hit outside finish round`);
        }
        assert.ok(!("outcomeWord" in it) && !("youWon" in it), `${label}: result leaked into ${it.kind}`);
    }
    assert.equal(items.filter((i) => i.hkind === "finish_hit").length, finishEvt ? 1 : 0, `${label}: finish_hit count`);

    // Rule 3: the full report renders every logged moment.
    const names = { playerName: "Tarek", opponentName: "Rival", fightId: view.fightId, moves: loadout.moves };
    log.forEach((e, index) => {
        const out = render.renderEvent(e, { ...names, index });
        assert.ok(out && typeof out.text === "string" && out.text.length > 0, `${label}: renderEvent empty for ${e.templateKey}`);
        assert.ok(!FALLBACK.test(out.text), `${label}: renderEvent fell back for ${e.templateKey}: ${out.text}`);
        assert.ok(!/[{}]/.test(out.text), `${label}: placeholder in report text for ${e.templateKey}: ${out.text}`);
        assert.ok(!/undefined|NaN/.test(out.text), `${label}: bad value in report text: ${out.text}`);
        if (["move", "wildcard"].includes(e.type)) {
            assert.ok(!DASH.test(out.text), `${label}: dash in new report line "${out.text}"`);
            assert.equal(out.styleClass, e.type);
        }
        if (e.type === "move") {
            stats.moveEvents += 1;
            const nm = e.vars.moveIds.map((id) => loadout.moves.find((m) => m.moveId === id)?.name).filter(Boolean);
            assert.equal(nm.length, e.vars.moveIds.length, `${label}: move_fired id missing from loadout`);
        }
        if (e.type === "camp") { stats.campEvents += 1; assert.equal(out.styleClass, "camp"); }
        if (e.type === "wildcard") stats.wildcardEvents += 1;
        if (e.templateKey === "takedown_stuffed") stats.stuffedEvents += 1;
    });

    // Rule 4: times real or absent.
    const TS = /^\d:\d{2}$/;
    for (const e of log) {
        if (e.timestamp != null) assert.match(e.timestamp, TS, `${label}: bad timestamp ${e.timestamp}`);
        if (e.templateKey === "wildcard_fired") assert.equal(e.timestamp, null, `${label}: wildcard has a clock time`);
        if (e.type === "move" && e.timestamp != null) {
            stats.withTimedMove += 1;
            const anchor = log.find((o) => o.round === e.round && o.timestamp === e.timestamp && o.type !== "move" && o.type !== "camp");
            assert.ok(anchor, `${label}: move_fired at ${e.timestamp} R${e.round} has no real exchange at that time`);
        }
    }
    for (const r of rounds) {
        let prev = -1;
        for (const e of log.filter((x) => x.round === r && x.timestamp != null)) {
            const [m, s] = e.timestamp.split(":").map(Number);
            const t = m * 60 + s;
            assert.ok(t >= prev, `${label}: R${r} clock goes backwards at ${e.templateKey} ${e.timestamp}`);
            prev = t;
        }
    }

    // Rule 5: outcome-accurate.
    const sameTs = (mv, pred) => log.some((o) => o.round === mv.round && o.timestamp === mv.timestamp && o.type !== "move" && pred(o));
    for (const mv of log.filter((e) => e.type === "move")) {
        stats.outcomes.add(mv.vars.outcome);
        assert.ok(["PROC", "SIGNATURE"].includes(mv.vars.effectType), `${label}: move_fired effectType ${mv.vars.effectType}`);
        assert.equal(mv.actorIsPlayer, true, `${label}: move_fired must be on the player side`);
        assert.ok(mv.vars.count >= 1, `${label}: move_fired count`);
        const rs = view.rounds.find((r) => r.round === mv.round);
        const out = mv.vars.outcome;
        const roundEvents = log.filter((e) => e.round === mv.round);
        const ts = mv.timestamp;
        if (out === "stuffed") {
            assert.equal(rs.takedowns[1], 0, `${label}: stuffed but the opponent landed a takedown in R${mv.round}`);
            if (ts) assert.ok(sameTs(mv, (o) => o.templateKey === "takedown_stuffed" && !o.actorIsPlayer), `${label}: stuffed not on a takedown_stuffed`);
        }
        if (out === "takedown_landed" && mv.vars.bonusType === "SPRAWL_SUCCESS") {
            assert.equal(rs.takedowns[1], 1, `${label}: sprawl takedown_landed but opponent TD=${rs.takedowns[1]}`);
        }
        if (out === "takedown_landed" && ts) assert.ok(sameTs(mv, (o) => o.templateKey === "takedown_secured"), `${label}: takedown_landed not on takedown_secured`);
        if (out === "takedown_landed" && mv.vars.bonusType !== "SPRAWL_SUCCESS") assert.ok(rs.takedowns[0] >= 1, `${label}: our takedown_landed but takedowns[0]=0`);
        if (out === "knockdown") {
            assert.ok(roundEvents.some((e) => e.templateKey === "knockdown" && e.actorIsPlayer), `${label}: knockdown claim without a player knockdown`);
            if (ts) assert.ok(sameTs(mv, (o) => o.templateKey === "knockdown" && o.actorIsPlayer), `${label}: knockdown claim not on the knockdown exchange`);
        }
        if (out === "finish") {
            assert.ok(finishEvt && finishEvt.round === mv.round && finishEvt.actorIsPlayer, `${label}: finish claim`);
            if (ts) assert.equal(ts, finishEvt.timestamp, `${label}: finish claim at ${ts} but finish at ${finishEvt.timestamp}`);
        }
        if (out === "sub_finished") assert.ok(finishEvt && finishEvt.templateKey === "submission_finish" && finishEvt.actorIsPlayer && finishEvt.round === mv.round, `${label}: sub_finished`);
        if (out === "tapped") assert.ok(finishEvt && finishEvt.templateKey === "submission_finish" && !finishEvt.actorIsPlayer && finishEvt.round === mv.round, `${label}: tapped`);
        if (out === "sub_attempt" && ts) assert.ok(sameTs(mv, (o) => o.templateKey === "submission_attempt" && o.actorIsPlayer), `${label}: sub_attempt not on our sub attempt`);
        if (out === "hurt" && ts) assert.ok(sameTs(mv, (o) => o.templateKey === "strike_hurt" && o.actorIsPlayer), `${label}: hurt not on our strike_hurt`);
        if (out === "landed" && ts) assert.ok(sameTs(mv, (o) => /^strike_/.test(o.templateKey) && o.actorIsPlayer), `${label}: landed not on our strike`);
        if (out === "ground_pound" && ts) assert.ok(sameTs(mv, (o) => ["ground_pound", "ground_control_carried"].includes(o.templateKey) && o.actorIsPlayer), `${label}: ground_pound not on our ground event`);
        if (out === "absorbed" && ts) assert.ok(sameTs(mv, (o) => !o.actorIsPlayer), `${label}: absorbed not on an opponent exchange`);
        if (out === "escaped" && ts) assert.ok(sameTs(mv, (o) => o.templateKey === "submission_attempt" && !o.actorIsPlayer), `${label}: escaped not on an opponent sub attempt`);

        // A short line may only claim what the outcome says.
        const line = lines.shortLine(mv, { playerName: "Tarek", opponentName: "Rival", fightId: view.fightId, eventIndex: 0, moves: loadout.moves });
        assert.ok(line.length > 0 && !/[{}]/.test(line) && !DASH.test(line), `${label}: move line "${line}"`);
        if (/stuffed|sprawled/i.test(line)) assert.equal(out, "stuffed", `${label}: line "${line}" claims a stuff, outcome ${out}`);
        if (/\bdown\b|drops|canvas/i.test(line) && mv.vars.bonusType !== "SPRAWL_SUCCESS") assert.ok(out === "knockdown" || out === "takedown_landed", `${label}: line "${line}" claims a knockdown, outcome ${out}`);
        if (/\bout!|over!|it.s over/i.test(line)) assert.equal(out, "finish", `${label}: line "${line}" claims the finish, outcome ${out}`);
        if (/\btaps\b/i.test(line)) assert.equal(out, "sub_finished", `${label}: line "${line}" claims a tap, outcome ${out}`);
        if (/wobbles|is hurt/i.test(line)) assert.ok(["hurt", "knockdown"].includes(out), `${label}: line "${line}" claims hurt, outcome ${out}`);
        if (/still squirms out|One hip escape|The escape works/i.test(line)) assert.equal(out, "escaped", `${label}: line "${line}" claims an escape, outcome ${out}`);
        if (/Planted hard|drags it down|Down they go/i.test(line)) assert.equal(out, "takedown_landed", `${label}: line "${line}" claims a takedown, outcome ${out}`);
        if (/Heavy shots|shots land heavy/i.test(line)) assert.equal(out, "ground_pound", `${label}: line "${line}"`);
        const long = render.renderEvent(mv, { playerName: "Tarek", opponentName: "Rival", fightId: view.fightId, index: 0, moves: loadout.moves }).text;
        if (/\bstuffed\b/i.test(long)) assert.equal(out, "stuffed", `${label}: long line "${long}" claims a stuff, outcome ${out}`);
        if (/\btaps\b/i.test(long)) assert.ok(out === "sub_finished" || out === "tapped", `${label}: long line "${long}" claims a tap, outcome ${out}`);
    }

    // Wildcard: exactly one, in its round, only when not countered and the round was played.
    const wc = result.wildcard;
    const wcEvents = log.filter((e) => e.templateKey === "wildcard_fired");
    if (wc && !wc.countered && wc.round <= result.rounds.length) {
        assert.equal(wcEvents.length, 1, `${label}: expected one wildcard_fired`);
        assert.equal(wcEvents[0].round, wc.round);
        assert.equal(wcEvents[0].vars.stat, wc.stat);
        assert.equal(wcEvents[0].actorIsPlayer, false);
        const line = lines.shortLine(wcEvents[0], { playerName: "Tarek", opponentName: "Rival", fightId: view.fightId, eventIndex: 0 });
        assert.ok(/wrestling game/.test(line), `${label}: wildcard line must name the real area: "${line}"`);
    } else {
        assert.equal(wcEvents.length, 0, `${label}: wildcard_fired without an applied wildcard`);
    }

    // Rule 6: counts match everywhere.
    assert.deepStrictEqual(view.loadout, loadout, `${label}: view.loadout differs from the snapshot`);
    const lastBeforeFinish = items[finishIdx - 1];
    for (const row of loadout.moves) {
        const entry = result.moveBonuses.find((b) => (b.moveIds || [b.moveId]).includes(row.moveId));
        assert.ok(entry, `${label}: no engine entry for ${row.moveId}`);
        assert.equal(row.firedCount, entry.triggerCount || 0, `${label}: ${row.moveId} firedCount != triggerCount`);
        assert.equal(row.triggered, !!entry.triggered);
        const evSum = log.filter((e) => e.type === "move" && e.vars.moveIds.includes(row.moveId)).reduce((s, e) => s + e.vars.count, 0);
        if (row.effectType === "PASSIVE") {
            assert.equal(evSum, 0, `${label}: passive ${row.moveId} produced move_fired`);
            continue;
        }
        assert.equal(evSum, row.firedCount, `${label}: ${row.moveId} events ${evSum} vs firedCount ${row.firedCount}`);
        assert.equal(lastBeforeFinish.corner.moves[row.moveId] || 0, row.firedCount, `${label}: corner count for ${row.moveId} before finish card`);
    }
    let prev = {};
    for (const it of items.slice(0, finishIdx)) {
        for (const [k, v] of Object.entries(prev)) assert.ok((it.corner.moves[k] || 0) >= v, `${label}: corner ${k} decreased`);
        prev = it.corner.moves;
    }
    const fc = items[finishIdx];
    assert.deepStrictEqual(fc.whatFired.moves.map(({ bestOutcome, ...r }) => r), loadout.moves, `${label}: finish card What fired (moves) != loadout`);
    assert.deepStrictEqual(fc.whatFired.camp, loadout.camp, `${label}: finish card What fired (camp) != loadout`);
    for (const m of fc.whatFired.moves) {
        const outs = log.filter((e) => e.type === "move" && e.vars.moveIds.includes(m.moveId)).map((e) => e.vars.outcome);
        if (!outs.length) assert.equal(m.bestOutcome, null, `${label}: bestOutcome without events`);
        else if (m.bestOutcome !== null) assert.ok(outs.includes(m.bestOutcome), `${label}: bestOutcome ${m.bestOutcome} not among ${outs}`);
    }
    for (const e of log.filter((x) => x.type === "camp")) {
        const session = model.CAMP_EVENT_SESSION[e.templateKey];
        const row = loadout.camp.find((c) => c.sessionType === session);
        assert.ok(row, `${label}: ${e.templateKey} shown but session ${session} is not in the corner`);
        assert.ok(row.triggered, `${label}: ${e.templateKey} shown but ${session} not triggered`);
    }
    assert.deepStrictEqual(loadout.camp.map((c) => !!c.triggered), (result.sessionBonuses || []).map((b) => !!b.triggered), `${label}: camp triggered flags`);
    if (!loadout.camp.length) assert.equal(log.filter((e) => e.type === "camp").length, 0, `${label}: camp events without any booked session`);
    for (const s of Object.keys(lastBeforeFinish.corner.camp)) {
        assert.ok(loadout.camp.find((c) => c.sessionType === s && c.triggered), `${label}: corner lit ${s} that did not fire`);
    }

    // Rule 7: passive pill only if real.
    const starts = items.filter((i) => i.kind === "round_start");
    assert.deepStrictEqual(starts[0].passives, loadout.moves.filter((m) => m.effectType === "PASSIVE" && m.triggered).map((m) => m.moveId), `${label}: passives`);
    for (const it of starts.slice(1)) assert.deepStrictEqual(it.passives, []);

    // Counters equal the persisted round stats.
    const sum = (k, i) => view.rounds.reduce((s, r) => s + (r[k][i] || 0), 0);
    assert.deepStrictEqual(fc.counters.strikes, [sum("strikes", 0), sum("strikes", 1)], `${label}: strike counters`);
    assert.deepStrictEqual(fc.counters.takedowns, [sum("takedowns", 0), sum("takedowns", 1)], `${label}: takedown counters`);

    // 2x: same sequence, halved durations. Deterministic rebuild.
    const fast = model.buildHighlightScript(view, { speed: 2 });
    assert.equal(fast.items.length, items.length);
    fast.items.forEach((f, i) => {
        assert.equal(f.kind, items[i].kind);
        assert.equal(f.baseMs, items[i].baseMs);
        assert.equal(f.durationMs, Math.round(items[i].baseMs / 2));
        assert.equal(f.logIndex, items[i].logIndex);
    });
    assert.deepStrictEqual(model.buildHighlightScript(view, { speed: 1 }), script);
}


test("replay consistency: golden scenarios x loadouts (+ rule 8 engine purity vs golden fixture)", async () => {
    for (const sc of SCENARIOS) {
        for (const [loadoutName, spec] of Object.entries(LOADOUTS)) {
            const p = await pipeline({ sc, loadoutName, spec, camp: sc.camp ? "golden" : null, wildcard: null });
            checkFight(p);
            const g = golden[`${sc.name}::${loadoutName}`];
            assert.ok(g, `missing golden ${sc.name}::${loadoutName}`);
            assert.equal(p.draws, g.rngDraws, `${p.label}: RNG draw count drifted`);
            assert.equal(p.result.outcome, g.outcome);
            assert.equal(p.result.winner, g.winner);
            p.result.rounds.forEach((r, i) => {
                for (const k of ["playerDamage", "opponentDamage", "playerHealth", "opponentHealth", "event"]) {
                    assert.deepStrictEqual(r[k], g.rounds[i][k], `${p.label}: round ${r.round} ${k} drifted from golden`);
                }
            });
            assert.deepStrictEqual(p.result.moveBonuses.map((b) => b.triggerCount), g.moveBonuses.map((b) => b.triggerCount));
        }
    }
});

test("replay consistency: booked camp sessions and an uncountered wildcard", async () => {
    const wanted = ["grappler-vs-striker-5r", "striker-vs-grappler-5r", "grappler-mirror-sub-hunt-5r", "dominant-wrestler-5r", "dominant-striker-5r", "dominant-sub-hunter-3r", "striker-mirror-3r"];
    for (const sc of SCENARIOS.filter((s) => wanted.includes(s.name))) {
        for (const [loadoutName, spec] of Object.entries(LOADOUTS)) {
            for (const seed of [sc.seed, sc.seed + 1000, sc.seed + 2000]) {
                checkFight(await pipeline({ sc, loadoutName, spec, camp: "full", wildcard: WILDCARD(), seed }));
            }
        }
    }
});

test("replay consistency: a countered wildcard is not a moment", async () => {
    const sc = SCENARIOS[1];
    const camp = fullCamp();
    camp.push({ sessionType: "GAME_PLAN_STUDY", label: "Game Plan", bonusType: "OPPONENT_DAMAGE_REDUCTION", effectiveValue: 0.1, matchStatus: "MATCHED", triggered: false, triggerCount: 0 });
    const { result } = withSeed(sc.seed, () => resolveFight(fighter(sc.p), fighter(sc.o), { ...sc.opts, sessionBonuses: camp, moveBonuses: [], wildcard: WILDCARD() }));
    assert.equal(result.wildcard.countered, true);
    const bd = deriveFightDetails(result, ctxFor(5), "fight-countered");
    assert.equal(bd.eventLog.filter((e) => e.templateKey === "wildcard_fired").length, 0);
});

test("replay consistency: coverage sanity (the sweep exercised what it claims)", () => {
    assert.ok(stats.fights >= 55 + 7 * 5 * 3, `fights ${stats.fights}`);
    assert.ok(stats.moveEvents > 30, `move events ${stats.moveEvents}`);
    assert.ok(stats.campEvents > 10, `camp events ${stats.campEvents}`);
    assert.ok(stats.wildcardEvents > 3, `wildcard events ${stats.wildcardEvents}`);
    assert.ok(stats.combos > 0, `combos ${stats.combos}`);
    assert.ok(stats.withTimedMove > 5, `timed moves ${stats.withTimedMove}`);
    assert.ok(stats.quiet >= 0, `quiet rounds ${stats.quiet}`);
    assert.ok((stats.exchange || 0) > 0, "exchange highlights");
    assert.ok(stats.outcomes.size >= 5, `outcomes ${[...stats.outcomes].join(",")}`);
});

test("replay consistency: Fight schema keeps nullable timestamps, move vars and the loadout", async () => {
    const Fight = require("../../models/fightModel");
    const sc = SCENARIOS[1];
    const p = await pipeline({ sc, loadoutName: "grapple_L", spec: LOADOUTS.grapple_L, camp: "full", wildcard: WILDCARD(), seed: sc.seed + 1000 });
    const doc = new Fight({ breakdown: { version: 2, roundStats: p.bd.roundStats, eventLog: p.bd.eventLog, introTemplateKey: p.bd.introTemplateKey, resultContextKey: p.bd.resultContextKey, loadout: p.loadout } });
    const err = doc.validateSync();
    const bdErrors = err ? Object.keys(err.errors).filter((k) => k.startsWith("breakdown")) : [];
    assert.deepStrictEqual(bdErrors, [], `breakdown validation errors: ${bdErrors.join(", ")}`);
    const out = doc.toObject().breakdown;
    assert.equal(out.eventLog.length, p.bd.eventLog.length);
    p.bd.eventLog.forEach((e, i) => {
        const o = out.eventLog[i];
        assert.equal(o.timestamp ?? null, e.timestamp ?? null, `timestamp lost/changed at ${i} (${e.templateKey})`);
        assert.equal(o.templateKey, e.templateKey);
        if (e.type === "move") {
            assert.deepStrictEqual([...o.vars.moveIds], e.vars.moveIds);
            for (const k of ["bonusType", "effectType", "outcome", "count"]) assert.equal(o.vars[k], e.vars[k], `vars.${k} stripped on move_fired`);
        }
        if (e.type === "wildcard") assert.equal(o.vars.stat, e.vars.stat);
    });
    assert.ok(out.loadout, "loadout stripped by schema");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(out.loadout)), JSON.parse(JSON.stringify(p.loadout)));
    const v2 = buildBreakdownResponse({ breakdown: JSON.parse(JSON.stringify(out)), kind: "pve", fightId: p.fightId, outcome: p.result.outcome, youWon: p.result.winner === "player", perspective: "player", header: { playerName: "Tarek", opponentName: "Rival" } });
    assert.deepStrictEqual(v2.eventLog, p.view.eventLog);
    assert.deepStrictEqual(v2.loadout, p.view.loadout);
});

test("replay consistency: no-loadout views (v1 legacy / PvP) build a script without cards", async () => {
    const { model, render } = await modsP;
    const p = await pipeline({ sc: SCENARIOS[0], loadoutName: "none", spec: null, camp: null, wildcard: null });
    const legacy = { ...p.view, loadout: null };
    const script = model.buildHighlightScript(legacy, { speed: 1 });
    const fc = script.items[script.items.length - 1];
    assert.equal(fc.kind, "finish_card");
    assert.equal(fc.whatFired, null);
    assert.equal(script.corner, null);
    for (const it of script.items) assert.ok(!(it.kind === "highlight" && it.hkind === "move"));
    const stripped = { ...legacy, eventLog: legacy.eventLog.map((e) => ({ ...e, vars: { strike: e.vars.strike, sub: e.vars.sub } })) };
    assert.doesNotThrow(() => model.buildHighlightScript(stripped, { speed: 1 }));
    assert.doesNotThrow(() => model.buildHighlightScript({ ...legacy, eventLog: legacy.eventLog.map((e) => ({ ...e, timestamp: null })) }, { speed: 2 }));
    assert.doesNotThrow(() => model.buildHighlightScript({ ...legacy, eventLog: [] }, { speed: 1 }));
    assert.doesNotThrow(() => model.buildHighlightScript({ fightId: "x", rounds: [], eventLog: [] }, { speed: 1 }));
    const r = render.renderEvent({ round: 1, timestamp: null, type: "weird", actorIsPlayer: true, templateKey: "nope", vars: {} }, { playerName: "A", opponentName: "B", fightId: "f", index: 0 });
    assert.ok(r.text.length > 0);
});
