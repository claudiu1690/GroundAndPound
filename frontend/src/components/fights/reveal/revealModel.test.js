/**
 * Unit tests for revealModel.js (pure highlight script builder).
 * Same style as renderEvent.test.js: vitest globals (`test`, `expect`), run through the node:test
 * shim in tests/frontend/firstSession.vitestFiles.qa.test.js.
 */

import {
  buildHighlightScript,
  selectHighlights,
  readingMs,
  roundScore,
  methodKeyOf,
  canPlayReveal,
  COUNTERS_MS,
  QUIET_MS,
  ROUND_CARD_MS,
  SIG_SLAM_MS,
  PROC_SLAM_MS,
  CAMP_MS,
  FINISH_HIT_MS,
  FINISH_CARD_MS,
  STOPPAGE_MS,
  SCORE_ROW_MS,
  SCORE_VERDICT_MS,
  sideScore,
  hitWeight,
} from "./revealModel.js";

const NULLS = { strike: null, sub: null, position: null, bodyPart: null, moveIds: [], bonusType: null, effectType: null, outcome: null, stat: null, count: null };

const ev = (round, templateKey, type = "strike", extra = {}) => ({
  round,
  timestamp: "1:00",
  type,
  actorIsPlayer: true,
  templateKey,
  vars: { ...NULLS },
  ...extra,
});

const mf = (round, timestamp, moveId, bonusType, effectType, outcome, count = 1) => ({
  round,
  timestamp,
  type: "move",
  actorIsPlayer: true,
  templateKey: "move_fired",
  vars: { ...NULLS, moveIds: [moveId], bonusType, effectType, outcome, count },
});

const camp = (round, timestamp, key) => ev(round, key, "camp", { timestamp });

const MOVES = [
  { moveId: "THE_FINISHER", name: "Overhand Right", rarity: "LEGENDARY", effectType: "SIGNATURE", bonusType: "SIG_FINISHER_STRIKE", triggerCondition: "OPPONENT_HEALTH_BELOW_75", art: "the_finisher", triggered: true, firedCount: 1 },
  { moveId: "SPRAWL_INSTINCT", name: "Sprawl", rarity: "RARE", effectType: "PROC", bonusType: "SPRAWL_SUCCESS", triggerCondition: "OPPONENT_SHOOTS_TAKEDOWN", art: "sprawl_instinct", triggered: true, firedCount: 2 },
  { moveId: "HEAVY_HANDS", name: "Heavy Hands", rarity: "UNCOMMON", effectType: "PASSIVE", bonusType: "STRIKE_DAMAGE", triggerCondition: "ALWAYS", art: "heavy_hands", triggered: true, firedCount: 5 },
  { moveId: "MOUNT_REAPER", name: "Full Mount", rarity: "UNCOMMON", effectType: "PROC", bonusType: "GNP_DAMAGE", triggerCondition: "PLAYER_TOP_POSITION", art: "mount_reaper", triggered: false, firedCount: 0 },
];
const CAMP = [
  { sessionType: "TAKEDOWN_DEFENCE", label: "Takedown Defence Drilling", matchStatus: "MATCHED", triggered: true, firedCount: 1 },
  { sessionType: "CARDIO_PUSH", label: "Cardio Push", matchStatus: "PARTIAL", triggered: false, firedCount: 0 },
];

function roundRow(round, damage, roundWinner = "player", dominant = false, strikes = [5, 3], takedowns = [0, 0]) {
  return { round, roundWinner, dominant, damage, strikes, takedowns };
}

function view(eventLog, extra = {}) {
  return {
    fightId: "fx",
    method: "decision",
    outcome: "Decision (unanimous)",
    youWon: true,
    header: { outcomeWord: "VICTORY", playerName: "Stone", opponentName: "Tarek" },
    rounds: [roundRow(1, [10, 20]), roundRow(2, [20, 40], "opponent"), roundRow(3, [30, 60])],
    eventLog,
    loadout: { moves: MOVES, camp: CAMP },
    ...extra,
  };
}

const highlightsOf = (items, round) => items.filter((i) => i.kind === "highlight" && (round == null || i.round === round));

// ── selectHighlights ─────────────────────────────────────────────────────────
test("a first-fire move becomes a slam and a repeat becomes a tick on the next kept item", () => {
  const events = [
    mf(1, "4:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
    ev(1, "strike_hurt", "strike", { timestamp: "2:00" }),
  ];
  const first = selectHighlights(events, []);
  expect(first.highlights.map((h) => h.hkind)).toEqual(["move", "big_strike"]);
  const again = selectHighlights(events, ["SPRAWL_INSTINCT"]);
  expect(again.highlights.map((h) => h.hkind)).toEqual(["big_strike"]);
  expect(again.highlights[0].ticks).toEqual(["SPRAWL_INSTINCT"]);
});

test("a tick with nothing after it rides the round card (trailing)", () => {
  const events = [ev(1, "strike_hurt", "strike", { timestamp: "3:00" }), mf(1, "1:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed")];
  const r = selectHighlights(events, ["SPRAWL_INSTINCT"]);
  expect(r.highlights).toHaveLength(1);
  expect(r.highlights[0].ticks).toEqual([]);
  expect(r.trailing.ticks).toEqual(["SPRAWL_INSTINCT"]);
});

test("firedSoFar is not mutated", () => {
  const fired = new Set();
  selectHighlights([mf(1, "4:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed")], fired);
  expect(fired.size).toBe(0);
});

test("a camp event right before a move on the same exchange is a combo, counted once", () => {
  const events = [
    camp(1, "4:09", "camp_takedown_defence_fired"),
    mf(1, "4:09", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
  ];
  const { highlights } = selectHighlights(events, []);
  expect(highlights).toHaveLength(1);
  expect(highlights[0].hkind).toBe("move");
  expect(highlights[0].combo.event.templateKey).toBe("camp_takedown_defence_fired");
});

test("a camp event at another time is its own highlight", () => {
  const events = [
    camp(1, "4:30", "camp_cardio_fired"),
    mf(1, "4:09", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
  ];
  expect(selectHighlights(events, []).highlights.map((h) => h.hkind)).toEqual(["camp", "move"]);
});

test("a knockdown on the slam's exchange is absorbed into the slam, but not when the move only ticks", () => {
  const events = [
    ev(1, "knockdown", "knockdown", { timestamp: "2:20" }),
    mf(1, "2:20", "THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "knockdown"),
  ];
  expect(selectHighlights(events, []).highlights.map((h) => h.hkind)).toEqual(["move"]);
  const repeat = selectHighlights(events, ["THE_FINISHER"]);
  expect(repeat.highlights.map((h) => h.hkind)).toEqual(["knockdown"]);
  expect(repeat.highlights[0].ticks).toEqual([]);
  expect(repeat.trailing.ticks).toEqual(["THE_FINISHER"]);
});

test("routine strikes, ground pounds and stuffed takedowns play as exchanges (owner: show the shots)", () => {
  const events = [
    ev(1, "strike_clean"), ev(1, "strike_body"), ev(1, "ground_pound", "ground"),
    ev(1, "takedown_stuffed", "takedown"), ev(1, "ground_control_carried", "ground"),
  ];
  expect(selectHighlights(events, []).highlights.map((h) => h.hkind)).toEqual(["exchange", "exchange", "exchange", "exchange", "exchange"]);
});

test("at most 5 highlights, best priority kept, log order restored", () => {
  const events = [
    ev(1, "strike_hurt", "strike", { timestamp: "4:50" }),
    ev(1, "takedown_secured", "takedown", { timestamp: "4:40" }),
    ev(1, "submission_attempt", "submission", { timestamp: "4:30" }),
    ev(1, "knockdown", "knockdown", { timestamp: "4:20" }),
    camp(1, "4:10", "camp_cardio_fired"),
    ev(1, "wildcard_fired", "wildcard", { timestamp: null, actorIsPlayer: false }),
    ev(1, "strike_clean", "strike", { timestamp: "4:05" }),
  ];
  const { highlights } = selectHighlights(events, []);
  expect(highlights).toHaveLength(5);
  expect(highlights.map((h) => h.hkind)).toEqual(["takedown", "submission", "knockdown", "camp", "wildcard"]);
});

test("a move that loses the cut still counts as a tick", () => {
  const events = [
    ev(1, "wildcard_fired", "wildcard", { timestamp: null }),
    camp(1, "4:30", "camp_cardio_fired"),
    ev(1, "ko_finish", "finish", { timestamp: "3:00" }),
    mf(1, "3:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
    ev(1, "knockdown", "knockdown", { timestamp: "1:00" }),
  ];
  // Five slots: all five fit, in log order.
  const r = selectHighlights(events, []);
  expect(r.highlights.map((h) => h.hkind)).toEqual(["wildcard", "camp", "finish_hit", "move", "knockdown"]);
  // Now crowd the move out: a combo-less slam at prio 1 only loses when four better exist.
  const crowded = [
    ev(1, "ko_finish", "finish", { timestamp: "3:00" }),
    mf(1, "2:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
    mf(1, "1:30", "THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "landed"),
    mf(1, "1:00", "MOUNT_REAPER", "GNP_DAMAGE", "PROC", "ground_pound"),
    mf(1, "0:30", "HEAVY_HANDS", "STRIKE_DAMAGE", "PROC", "landed", 3),
    mf(1, "0:20", "SECOND_WIND", "STAMINA_DRAIN", "PROC", null),
  ];
  const c = selectHighlights(crowded, []);
  expect(c.highlights).toHaveLength(5);
  // The cut move's counter is not lost: it is a tick on the next kept item or trailing.
  const carried = [...c.trailing.ticks, ...c.highlights.flatMap((h) => h.ticks)];
  expect(carried).toEqual(["SECOND_WIND"]);
});

test("a round-only move (null timestamp) is a normal slam", () => {
  const { highlights } = selectHighlights([mf(2, null, "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", null)], []);
  expect(highlights.map((h) => h.hkind)).toEqual(["move"]);
});

// ── buildHighlightScript ─────────────────────────────────────────────────────
test("every round has round_start first, then highlights or one quiet item, then a round card", () => {
  const { items } = buildHighlightScript(view([ev(2, "strike_hurt", "strike", { timestamp: "2:00" })]));
  const kinds = items.map((i) => `${i.kind}:${i.round}`);
  expect(kinds[0]).toBe("round_start:1");
  expect(kinds.filter((k) => k.startsWith("quiet"))).toEqual(["quiet:1", "quiet:3"]);
  expect(kinds.filter((k) => k.startsWith("round_card"))).toHaveLength(3);
  expect(items[items.length - 1].kind).toBe("finish_card");
  expect(items.filter((i) => i.kind === "round_start")).toHaveLength(3);
});

test("a quiet round gets a variant 0..2 and a line", () => {
  const q = buildHighlightScript(view([])).items.find((i) => i.kind === "quiet");
  expect(q.variant === 0 || q.variant === 1 || q.variant === 2).toBe(true);
  expect(q.line.length).toBeGreaterThan(5);
});

test("highlights per round never exceed 5", () => {
  const events = [];
  for (let i = 0; i < 12; i += 1) events.push(ev(1, "strike_hurt", "strike", { timestamp: `4:${10 + i}` }));
  const { items } = buildHighlightScript(view(events));
  expect(highlightsOf(items, 1).length).toBeLessThanOrEqual(5);
});

test("a finish skips the scorecard for the finishing round and ends with the finish card", () => {
  const v = view([ev(2, "tko_finish_strike", "finish", { timestamp: "2:41" })], {
    method: "TKO", outcome: "KO/TKO", finishRound: 2, finishTime: "2:41",
    rounds: [roundRow(1, [10, 5]), roundRow(2, [40, 8])],
  });
  const { items } = buildHighlightScript(v);
  expect(items.filter((i) => i.kind === "round_card").map((i) => i.round)).toEqual([1]);
  const fin = items[items.length - 1];
  expect(fin.methodKey).toBe("tko");
  expect(fin.finishTime).toBe("2:41");
  expect(items.filter((i) => i.hkind === "finish_hit")).toHaveLength(1);
});

test("durations at 1x: counters, round card, slams, camp, finish; 2x halves all", () => {
  const events = [
    mf(1, "4:09", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
    camp(2, "3:00", "camp_cardio_fired"),
    mf(3, "2:20", "THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "landed"),
  ];
  const one = buildHighlightScript(view(events), { speed: 1 }).items;
  const two = buildHighlightScript(view(events), { speed: 2 }).items;
  const proc = one.find((i) => i.hkind === "move" && i.round === 1);
  const sig = one.find((i) => i.hkind === "move" && i.round === 3);
  const c = one.find((i) => i.hkind === "camp");
  expect(one.find((i) => i.kind === "round_start").durationMs).toBe(COUNTERS_MS);
  expect(one.find((i) => i.kind === "round_card").durationMs).toBe(ROUND_CARD_MS);
  expect(proc.durationMs).toBe(Math.max(PROC_SLAM_MS, readingMs(proc.line)));
  expect(sig.durationMs).toBe(Math.max(SIG_SLAM_MS, readingMs(sig.line)));
  expect(c.durationMs).toBe(Math.max(CAMP_MS, readingMs(c.line)));
  // A decision: the finish card also reads the scorecard (one step per round, then the verdict).
  const decisionMs = FINISH_CARD_MS + 3 * SCORE_ROW_MS + SCORE_VERDICT_MS;
  expect(one[one.length - 1].durationMs).toBe(decisionMs);
  one.forEach((it, i) => expect(two[i].durationMs).toBe(Math.round(it.baseMs / 2)));
  expect(two[two.length - 1].durationMs).toBe(Math.round(decisionMs / 2));
});

test("quiet lasts 1.6 s and a finish hit 1.6 s", () => {
  const items = buildHighlightScript(view([ev(3, "ko_finish", "finish", { timestamp: "1:10" })], { method: "KO", finishRound: 3, finishTime: "1:10" })).items;
  expect(items.find((i) => i.kind === "quiet").durationMs).toBe(QUIET_MS);
  expect(items.find((i) => i.hkind === "finish_hit").durationMs).toBe(FINISH_HIT_MS);
});

test("readingMs is 900 ms plus 280 ms per word", () => {
  expect(readingMs("one two three")).toBe(900 + 3 * 280);
  expect(readingMs("")).toBe(900);
});

test("signature slam flashes and shakes, a plain proc does neither, camp none, wildcard shakes", () => {
  const events = [
    mf(1, "4:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
    mf(3, "2:00", "THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "landed"),
    camp(3, "1:00", "camp_cardio_fired"),
    ev(3, "wildcard_fired", "wildcard", { timestamp: null, actorIsPlayer: false }),
  ];
  const { items } = buildHighlightScript(view(events));
  const proc = items.find((i) => i.hkind === "move" && i.round === 1);
  expect([proc.flash, proc.shake]).toEqual([false, false]);
  const sig = items.find((i) => i.hkind === "move" && i.round === 3);
  expect([sig.flash, sig.shake]).toEqual([true, true]);
  expect(items.find((i) => i.hkind === "camp").shake).toBe(false);
  expect(items.find((i) => i.hkind === "wildcard").shake).toBe(true);
});

test("a proc slam shakes when its outcome is a knockdown or a finish", () => {
  const kd = buildHighlightScript(view([mf(1, "4:00", "SPRAWL_INSTINCT", "STRIKE_DAMAGE", "PROC", "knockdown")])).items.find((i) => i.hkind === "move");
  expect([kd.flash, kd.shake]).toEqual([false, true]);
});

test("corner counters follow the log: slam counts, ticks add, camp lights", () => {
  const events = [
    mf(1, "4:09", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
    camp(1, "3:00", "camp_takedown_defence_fired"),
    mf(2, "3:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
  ];
  const { items } = buildHighlightScript(view(events));
  const slam = items.find((i) => i.hkind === "move");
  expect(slam.corner.moves.SPRAWL_INSTINCT).toBe(1);
  expect(slam.corner.camp).toEqual({});
  const r1card = items.find((i) => i.kind === "round_card" && i.round === 1);
  expect(r1card.corner.camp.TAKEDOWN_DEFENCE).toBe(true);
  // The repeat in round 2 is a tick that rides the round 2 card.
  const r2card = items.find((i) => i.kind === "round_card" && i.round === 2);
  expect(r2card.corner.moves.SPRAWL_INSTINCT).toBe(2);
});

test("a merged entry counts every id it carries and plays the highest rarity", () => {
  const merged = mf(1, "4:00", "MOUNT_REAPER", "GNP_DAMAGE", "PROC", "ground_pound");
  merged.vars.moveIds = ["MOUNT_REAPER", "THE_FINISHER"];
  const { items } = buildHighlightScript(view([merged]));
  const slam = items.find((i) => i.hkind === "move");
  expect(slam.corner.moves).toEqual({ MOUNT_REAPER: 1, THE_FINISHER: 1 });
  expect(slam.move.moveId).toBe("THE_FINISHER");
});

test("a combo is one item with two segments and a mid-item corner", () => {
  const events = [
    camp(1, "4:09", "camp_takedown_defence_fired"),
    mf(1, "4:09", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
  ];
  const slam = buildHighlightScript(view(events)).items.find((i) => i.hkind === "move");
  expect(slam.segments).toHaveLength(2);
  expect(slam.baseMs).toBe(slam.segments[0] + slam.segments[1]);
  expect(slam.combo.corner.camp.TAKEDOWN_DEFENCE).toBe(true);
  expect(slam.combo.corner.moves.SPRAWL_INSTINCT).toBe(undefined);
  expect(slam.corner.moves.SPRAWL_INSTINCT).toBe(1);
});

test("passives: pill on round 1 only, only if triggered; corner lit from the start", () => {
  const { items } = buildHighlightScript(view([]));
  const starts = items.filter((i) => i.kind === "round_start");
  expect(starts[0].passives).toEqual(["HEAVY_HANDS"]);
  expect(starts[1].passives).toEqual([]);
  expect(starts[0].corner.passives).toEqual(["HEAVY_HANDS"]);
  const off = buildHighlightScript(view([], { loadout: { moves: MOVES.map((m) => (m.effectType === "PASSIVE" ? { ...m, triggered: false } : m)), camp: CAMP } }));
  expect(off.items[0].passives).toEqual([]);
});

test("finish card carries the loadout truth and the best outcome per move", () => {
  const events = [
    mf(1, "4:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "takedown_landed"),
    mf(2, "3:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed"),
  ];
  const fin = buildHighlightScript(view(events)).items.pop();
  expect(fin.kind).toBe("finish_card");
  expect(fin.whatFired.moves).toHaveLength(4);
  expect(fin.whatFired.camp).toHaveLength(2);
  const sprawl = fin.whatFired.moves.find((m) => m.moveId === "SPRAWL_INSTINCT");
  expect(sprawl.bestOutcome).toBe("stuffed");
  expect(sprawl.firedCount).toBe(2);
  expect(fin.whatFired.moves.find((m) => m.moveId === "MOUNT_REAPER").bestOutcome).toBe(null);
  expect(fin.corner.moves).toEqual({ THE_FINISHER: 1, SPRAWL_INSTINCT: 2 });
  expect(fin.corner.camp).toEqual({ TAKEDOWN_DEFENCE: true });
});

test("legacy view without a loadout: no corner, no What fired, no slams", () => {
  const v = view([ev(1, "knockdown", "knockdown", { timestamp: "2:00" })], { loadout: null });
  const script = buildHighlightScript(v);
  expect(script.corner).toBe(null);
  expect(script.items.some((i) => i.hkind === "move")).toBe(false);
  expect(script.items[script.items.length - 1].whatFired).toBe(null);
  expect(script.items.find((i) => i.hkind === "knockdown")).toBeTruthy();
});

test("counters start each round on the totals so far and end it on the round totals", () => {
  const v = view([], { rounds: [roundRow(1, [5, 5], "player", false, [10, 4], [1, 0]), roundRow(2, [9, 9], "player", false, [6, 8], [0, 1])] });
  const items = buildHighlightScript(v).items;
  const starts = items.filter((i) => i.kind === "round_start");
  expect(starts[0].counters).toEqual({ strikes: [0, 0], takedowns: [0, 0] });
  expect(starts[1].counters).toEqual({ strikes: [10, 4], takedowns: [1, 0] });
  const cards = items.filter((i) => i.kind === "round_card");
  expect(cards[0].counters).toEqual({ strikes: [10, 4], takedowns: [1, 0] });
  expect(cards[1].counters).toEqual({ strikes: [16, 12], takedowns: [1, 1] });
});

test("counters climb live: each card adds the strikes and takedowns it shows, never going down", () => {
  const opp = (k, t) => ({ ...ev(1, k, k === "takedown_secured" ? "takedown" : "strike", { timestamp: t }), actorIsPlayer: false });
  const events = [ev(1, "strike_clean", "strike", { timestamp: "0:30" }), opp("strike_clean", "1:10"), opp("takedown_secured", "2:00"), ev(1, "strike_hurt", "strike", { timestamp: "3:00" })];
  const v = view(events, { rounds: [roundRow(1, [5, 5], "player", false, [9, 4], [0, 1])] });
  const items = buildHighlightScript(v).items;
  const hs = highlightsOf(items, 1);
  // Strikes tick through the whole round: both sides rise on every card (faster on their own),
  // and the last card of the round lands exactly on the round totals, so the round card adds nothing.
  const strikes = hs.map((h) => h.counters.strikes);
  for (let k = 1; k < strikes.length; k++) {
    expect(strikes[k][0]).toBeGreaterThanOrEqual(strikes[k - 1][0]);
    expect(strikes[k][1]).toBeGreaterThanOrEqual(strikes[k - 1][1]);
  }
  expect(strikes[0][0]).toBeGreaterThan(0);
  expect(strikes[0][1]).toBeGreaterThan(0);
  expect(strikes[strikes.length - 1]).toEqual([9, 4]);
  // Your big strike (last card) moves your count more than their takedown card does.
  expect(strikes[3][0] - strikes[2][0]).toBeGreaterThan(strikes[2][0] - strikes[1][0]);
  const rc = items.find((i) => i.kind === "round_card");
  expect(rc.counters.strikes).toEqual([9, 4]);
  expect(hs.map((h) => h.counters.takedowns)).toEqual([[0, 0], [0, 0], [0, 1], [0, 1]]);
  let prev = [0, 0, 0, 0];
  for (const it of items) {
    const now = [...it.counters.strikes, ...it.counters.takedowns];
    now.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(prev[i]));
    prev = now;
  }
});

test("damage grows monotonically and ends at the round totals", () => {
  const events = [ev(1, "knockdown", "knockdown"), ev(2, "strike_hurt"), ev(3, "strike_hurt")];
  const { items } = buildHighlightScript(view(events));
  let p = 0;
  let o = 0;
  for (const it of items) {
    expect(it.damage[0]).toBeGreaterThanOrEqual(p - 1e-9);
    expect(it.damage[1]).toBeGreaterThanOrEqual(o - 1e-9);
    p = it.damage[0];
    o = it.damage[1];
  }
  expect(items[items.length - 1].damage).toEqual([30, 60]);
});

test("highlight items point at the real log entry", () => {
  const events = [ev(1, "strike_clean"), ev(2, "knockdown", "knockdown", { timestamp: "2:10" })];
  const kd = buildHighlightScript(view(events)).items.find((i) => i.hkind === "knockdown");
  expect(events[kd.logIndex]).toEqual(kd.event);
});

test("round card scores are winner first", () => {
  expect(roundScore("player", false)).toEqual([10, 9]);
  expect(roundScore("opponent", true)).toEqual([10, 8]);
  expect(roundScore("even", false)).toEqual([10, 10]);
});

test("method keys", () => {
  expect(methodKeyOf({ method: "KO" })).toBe("ko");
  expect(methodKeyOf({ method: "TKO" })).toBe("tko");
  expect(methodKeyOf({ method: "submission" })).toBe("submission");
  expect(methodKeyOf({ method: "decision", outcome: "Decision (split)" })).toBe("split");
  expect(methodKeyOf({ method: "decision", outcome: "Decision (unanimous)" })).toBe("decision");
  expect(methodKeyOf({ method: "draw", outcome: "Draw" })).toBe("draw");
});

test("canPlayReveal guards legacy and malformed payloads", () => {
  expect(canPlayReveal(null)).toBe(false);
  expect(canPlayReveal({ legacy: true, eventLog: [] })).toBe(false);
  expect(canPlayReveal({ rounds: [] })).toBe(false);
  expect(canPlayReveal({ eventLog: [] })).toBe(true);
});

test("an empty fight still yields a finish card", () => {
  const { items, totalHighlights } = buildHighlightScript({ method: "decision", outcome: "Decision (unanimous)", rounds: [], eventLog: [] });
  expect(totalHighlights).toBe(0);
  expect(items).toHaveLength(1);
  expect(items[0].kind).toBe("finish_card");
});

test("totalMs is the sum of item durations", () => {
  const s = buildHighlightScript(view([ev(1, "knockdown", "knockdown")]));
  expect(s.totalMs).toBe(s.items.reduce((a, i) => a + i.durationMs, 0));
});

// Owner feedback 2026-11-04: "no text other than camp procs, no shots". Every round plays its real
// logged exchanges; a camp session gets its gold card only the first time it fires in the fight.
test("rounds play their real shots, and a camp that fires every round only gets one card", () => {
  const ev = (round, key, actorIsPlayer, ts, vars = {}) => ({ round, timestamp: ts, type: key.startsWith("camp_") ? "camp" : "strike", actorIsPlayer, templateKey: key, vars: { moveIds: [], ...vars } });
  const r1 = [ev(1, "camp_striking_accuracy_fired", true, "0:59"), ev(1, "strike_clean", true, "2:24", { strike: "uppercut" }), ev(1, "strike_clean", false, "3:49", { strike: "jab" })];
  const first = selectHighlights(r1, [], "player", []);
  expect(first.highlights.map((h) => h.hkind)).toEqual(["camp", "exchange", "exchange"]);
  expect([...first.campFired]).toEqual(["STRIKING_ACCURACY"]);
  const r2 = [ev(2, "camp_striking_accuracy_fired", true, "1:19"), ev(2, "strike_clean", true, "2:44", { strike: "body shot" })];
  const second = selectHighlights(r2, [], "player", first.campFired);
  expect(second.highlights.map((h) => h.hkind)).toEqual(["exchange"]);
  expect(second.highlights[0].campTicks).toEqual(["STRIKING_ACCURACY"]);
  // An even round still shows what happened.
  expect(selectHighlights(r2.slice(1), [], "even", []).highlights.length).toBe(1);
});

// ── stamina and round strip data ─────────────────────────────────────────────
test("items carry the stamina of their round: fixed through the round, dropping at round_start", () => {
  const events = [ev(1, "strike_clean"), ev(2, "strike_clean"), ev(3, "strike_clean")];
  const v = view(events, { staminaStart: [100, 98] });
  v.rounds[0].stamina = [90, 85];
  v.rounds[1].stamina = [78, 70.5];
  v.rounds[2].stamina = [62, 38];
  const { items, staminaStart } = buildHighlightScript(v);
  expect(staminaStart).toEqual([100, 98]);
  for (const it of items.filter((i) => i.round === 1)) expect(it.stamina).toEqual([90, 85]);
  for (const it of items.filter((i) => i.round === 2)) expect(it.stamina).toEqual([78, 70.5]);
  expect(items.find((i) => i.kind === "round_start" && i.round === 3).stamina).toEqual([62, 38]);
  expect(items[items.length - 1].stamina).toEqual([62, 38]);
});

test("stamina is null on every item when the view has none", () => {
  const { items, staminaStart } = buildHighlightScript(view([ev(1, "strike_clean")]));
  expect(staminaStart).toBe(null);
  expect(items.every((i) => i.stamina === null)).toBe(true);
});

test("a round without stamina keeps the previous value; malformed pairs are ignored", () => {
  const v = view([], { staminaStart: [100, 100] });
  v.rounds[0].stamina = [88, 91];
  v.rounds[1].stamina = [80, null];
  const { items } = buildHighlightScript(v);
  expect(items.find((i) => i.kind === "round_start" && i.round === 2).stamina).toEqual([88, 91]);
});

test("roundsMeta lists each round with winner, score and the finishing round", () => {
  const { roundsMeta } = buildHighlightScript(view([]));
  expect(roundsMeta.map((m) => m.winner)).toEqual(["player", "opponent", "player"]);
  expect(roundsMeta[0].score).toEqual([10, 9]);
  expect(roundsMeta.some((m) => m.finish)).toBe(false);
  const fin = buildHighlightScript(view([], { method: "ko", outcome: "KO", finishRound: 3 })).roundsMeta;
  expect(fin.map((m) => m.finish)).toEqual([false, false, true]);
});

// Owner 2026-11-04: "the hp needs to start at the actual hp of the player".
test("health bars start at the fighter's real HP and land on each round's saved health", () => {
  const v = view([], {
    healthStart: [72, 100],
    rounds: [{ ...roundRow(1, [10, 5]), health: [65, 88] }, { ...roundRow(2, [15, 9]), health: [60, 80] }],
  });
  const { items } = buildHighlightScript(v);
  const starts = items.filter((i) => i.kind === "round_start");
  expect(starts[0].health).toEqual([72, 100]);
  expect(starts[1].health).toEqual([65, 88]);
  const cards = items.filter((i) => i.kind === "round_card" || i.kind === "quiet");
  expect(cards[cards.length - 1].health).toEqual([60, 80]);
  expect(items[items.length - 1].health).toEqual([60, 80]);
  expect(buildHighlightScript(view([])).items[0].health).toBe(null);
});


// ── Hits that land, stoppage, decision scorecard ─────────────────────────────
test("each side's health drops only on the cards where the other side lands", () => {
  const oppShot = { ...ev(1, "strike_clean", "strike", { timestamp: "0:40" }), actorIsPlayer: false };
  const myShot = ev(1, "strike_clean", "strike", { timestamp: "1:30" });
  const v = view([oppShot, myShot], {
    rounds: [{ ...roundRow(1, [10, 20]), health: [90, 80] }],
    healthStart: [100, 100],
  });
  const hs = highlightsOf(buildHighlightScript(v).items, 1);
  expect(hs.length).toBe(2);
  // His shot: only your bar moves, and the damage number says so.
  expect(hs[0].health).toEqual([90, 100]);
  expect(hs[0].hpLoss).toEqual([10, 0]);
  expect(hs[0].from).toBe("right");
  expect(hs[0].impact).toBe("light");
  // Your shot: his bar lands on the saved round-end value.
  expect(hs[1].health).toEqual([90, 80]);
  expect(hs[1].hpLoss).toEqual([0, 20]);
  expect(hs[1].from).toBe("left");
});

test("health a round lost without a visible hit lands on the round card", () => {
  const myShot = ev(1, "strike_clean", "strike", { timestamp: "1:30" });
  const v = view([myShot], { rounds: [{ ...roundRow(1, [5, 10]), health: [95, 90] }], healthStart: [100, 100] });
  const items = buildHighlightScript(v).items;
  expect(highlightsOf(items, 1)[0].health).toEqual([100, 90]);
  const rc = items.find((i) => i.kind === "round_card");
  expect(rc.health).toEqual([95, 90]);
  expect(rc.hpLoss).toEqual([5, 0]);
});

test("hitWeight: stuffed takedowns and missed cards hurt nobody; a knockdown hurts more than a jab", () => {
  expect(hitWeight({ hkind: "exchange", event: ev(1, "takedown_stuffed") })).toBe(null);
  expect(hitWeight({ hkind: "move", event: mf(1, "1:00", "SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "stuffed") })).toBe(null);
  expect(hitWeight({ hkind: "knockdown", event: ev(1, "knockdown") }).w).toBeGreaterThan(hitWeight({ hkind: "exchange", event: ev(1, "strike_clean") }).w);
  expect(hitWeight({ hkind: "exchange", event: { ...ev(1, "strike_clean"), actorIsPlayer: false } }).target).toBe(0);
});

test("a finish plays the stoppage right before the finish card; Skip-able, no scorecard", () => {
  const items = buildHighlightScript(view([ev(3, "ko_finish", "finish", { timestamp: "1:10" })], { method: "KO", finishRound: 3, finishTime: "1:10" })).items;
  const n = items.length;
  expect(items[n - 2].kind).toBe("stoppage");
  expect(items[n - 2].durationMs).toBe(STOPPAGE_MS);
  expect(items[n - 2].methodKey).toBe("ko");
  expect(items[n - 1].kind).toBe("finish_card");
  expect(items[n - 1].scorecard).toBe(null);
  expect(items[n - 1].winnerName).toBe("Stone");
  expect(items[n - 1].durationMs).toBe(FINISH_CARD_MS);
  expect(items.find((i) => i.hkind === "finish_hit").impact).toBe("heavy");
});

test("a decision carries the round-by-round scorecard with totals and the kind of decision", () => {
  const v = view([], {
    rounds: [roundRow(1, [10, 20]), roundRow(2, [20, 40], "opponent", true), roundRow(3, [30, 60], "even")],
    outcome: "Decision (split)",
    method: "decision",
  });
  const items = buildHighlightScript(v).items;
  expect(items.some((i) => i.kind === "stoppage")).toBe(false);
  const fc = items[items.length - 1];
  expect(fc.scorecard.rows.map((r) => r.score)).toEqual([[10, 9], [8, 10], [10, 10]]);
  expect(fc.scorecard.rows.map((r) => r.winner)).toEqual(["player", "opponent", "even"]);
  expect(fc.scorecard.totals).toEqual([28, 29]);
  expect(fc.scorecard.kind).toBe("split");
  expect(fc.winnerName).toBe("Stone");
});

test("sideScore is player-first", () => {
  expect(sideScore("player", false)).toEqual([10, 9]);
  expect(sideScore("opponent", true)).toEqual([8, 10]);
  expect(sideScore("even", false)).toEqual([10, 10]);
});

// ── Ready glow ───────────────────────────────────────────────────────────────
test("a one-shot glows from the round its gate opens until it fires; the round start carries the READY line", () => {
  const rounds = [
    { ...roundRow(1, [5, 10]), health: [95, 90], stamina: [88, 88] },
    { ...roundRow(2, [10, 25]), health: [90, 70], stamina: [78, 78] },
    { ...roundRow(3, [15, 40]), health: [85, 55], stamina: [68, 68] },
  ];
  const events = [ev(2, "strike_clean", "strike", { timestamp: "1:00" }), mf(3, "2:00", "THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "landed"), ev(3, "strike_clean", "strike", { timestamp: "3:00" })];
  const v = view(events, { rounds, healthStart: [100, 100], staminaStart: [95, 95], loadout: { moves: [MOVES[0]], camp: [] } });
  const items = buildHighlightScript(v).items;
  const starts = items.filter((i) => i.kind === "round_start");
  // He ends round 2 on 70: round 3 is the first round he starts under 75.
  expect(starts[2].readyNew).toEqual([{ moveId: "THE_FINISHER", line: { key: "health_he", vars: { name: "Overhand Right", n: 3, value: 70 } } }]);
  expect(starts[1].readyNew).toEqual([]);
  expect(starts[1].corner.ready).toEqual([]);
  expect(starts[2].corner.ready).toEqual(["THE_FINISHER"]);
  const slam = items.find((i) => i.hkind === "move");
  expect(slam.corner.ready).toEqual([]);
  const fc = items[items.length - 1];
  expect(fc.readiness.THE_FINISHER.firstReadyRound).toBe(3);
});

test("a move card that hurt him (WOBBLED) drops his health on that card", () => {
  const events = [ev(1, "strike_clean", "strike", { timestamp: "0:40" }), mf(1, "2:10", "THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "hurt")];
  const v = view(events, { rounds: [{ ...roundRow(1, [5, 20]), health: [100, 80] }], healthStart: [100, 100], loadout: { moves: [MOVES[0]], camp: [] } });
  const items = buildHighlightScript(v).items;
  const card = items.find((i) => i.hkind === "move");
  expect(card.hpLoss[1]).toBeGreaterThan(0);
  // The hurt card weighs more than the plain shot before it.
  const shot = items.find((i) => i.hkind === "exchange");
  expect(card.hpLoss[1]).toBeGreaterThan(shot.hpLoss[1]);
  expect(card.impact).toBe("heavy");
});

test("camp cards that tell a hit drop his health; defensive camp cards do not", () => {
  expect(hitWeight({ hkind: "camp", event: camp(1, "1:00", "camp_striking_accuracy_fired") })).toEqual({ target: 1, w: 1 });
  expect(hitWeight({ hkind: "camp", event: camp(1, "1:00", "camp_takedown_defence_fired") })).toBe(null);
  expect(hitWeight({ hkind: "move", event: mf(1, "1:00", "MOUNT_REAPER", "GNP_DAMAGE", "PROC", "ground_pound") })).toEqual({ target: 1, w: 2 });
});
