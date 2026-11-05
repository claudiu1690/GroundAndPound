/**
 * Unit tests for moveReadiness.js (the ready glow). Vitest globals, run through the node:test shim
 * in tests/frontend/firstSession.vitestFiles.qa.test.js.
 */
import { moveReadiness } from "./moveReadiness.js";

const mv = (moveId, triggerCondition, effectType = "PROC", firedCount = 0) => ({ moveId, name: moveId, triggerCondition, effectType, firedCount });
const fired = (round, moveId) => ({ round, timestamp: "1:00", type: "move", actorIsPlayer: true, templateKey: "move_fired", vars: { moveIds: [moveId] } });
const rnd = (round, health, stamina) => ({ round, health, stamina });

function view(moves, rounds, extra = {}) {
  return {
    healthStart: [100, 100],
    staminaStart: [95, 95],
    rounds,
    eventLog: [],
    loadout: { moves, camp: [] },
    ...extra,
  };
}

const FIVE = [rnd(1, [95, 90], [85, 85]), rnd(2, [90, 80], [75, 74]), rnd(3, [85, 68], [66, 63]), rnd(4, [80, 60], [57, 52]), rnd(5, [76, 55], [49, 44])];

test("Overhand Right opens the round he starts under 75, and closes when it fires", () => {
  const v = view([mv("FIN", "OPPONENT_HEALTH_BELOW_75", "SIGNATURE", 1)], FIVE, { eventLog: [fired(4, "FIN")] });
  const r = moveReadiness(v).FIN;
  // He ends round 2 on 80, round 3 on 68: round 4 is the first he starts under 75.
  expect(r.firstReadyRound).toBe(4);
  expect(r.value).toBe(68);
  expect(r.openRounds).toEqual([4]);
  expect(r.line).toEqual({ key: "health_he", vars: { name: "FIN", n: 4, value: 68 } });
  expect(r.reason).toBe(null);
});

test("ready but never fired gets the no-exchange reason; never ready names the threshold", () => {
  const ready = moveReadiness(view([mv("FIN", "OPPONENT_HEALTH_BELOW_75", "SIGNATURE")], FIVE)).FIN;
  expect(ready.openRounds).toEqual([4, 5]);
  expect(ready.reason).toEqual({ key: "readyNoExchange", vars: { n: 4 } });
  const never = moveReadiness(view([mv("CF", "OPPONENT_HEALTH_BELOW_50", "SIGNATURE")], FIVE)).CF;
  expect(never.firstReadyRound).toBe(null);
  expect(never.reason).toEqual({ key: "never_health_he", vars: { threshold: 50 } });
});

test("stamina gates read the value before the round's drain (the previous round's end)", () => {
  const r = moveReadiness(view([mv("SG", "OPPONENT_STAMINA_BELOW_70", "PROC", 2)], FIVE)).SG;
  // He ends round 2 on 74 (not under 70) and round 3 on 63: round 4 is the first open round.
  expect(r.openRounds).toEqual([4, 5]);
  expect(r.value).toBe(63);
  const you = moveReadiness(view([mv("SW", "PLAYER_STAMINA_BELOW_70", "PROC", 2)], FIVE)).SW;
  expect(you.openRounds).toEqual([4, 5]);
  expect(you.line.key).toBe("stamina_you");
});

test("late rounds use the scheduled length, not the rounds fought", () => {
  const three = FIVE.slice(0, 3);
  const r = moveReadiness(view([mv("DW", "LATE_ROUNDS")], three)).DW;
  expect(r.openRounds).toEqual([]);
  expect(r.reason).toEqual({ key: "neverLate", vars: { n: 3 } });
  const sched3 = moveReadiness(view([mv("DW", "LATE_ROUNDS")], three, { scheduledRounds: 3 })).DW;
  expect(sched3.openRounds).toEqual([3]);
});

test("Superman Punch is open in round 1 only; reactive, position and passive moves are not covered", () => {
  const out = moveReadiness(view([mv("SP", "ROUND_ONE", "SIGNATURE"), mv("SPR", "OPPONENT_SHOOTS_TAKEDOWN"), mv("FM", "PLAYER_TOP_POSITION"), mv("HH", "ALWAYS", "PASSIVE")], FIVE));
  expect(Object.keys(out)).toEqual(["SP"]);
  expect(out.SP.openRounds).toEqual([1]);
  expect(out.SP.reason).toEqual({ key: "readyNoExchangeR1", vars: { n: 1 } });
});

test("older fights without saved health or stamina: no glow and no reason for those triggers", () => {
  const old = FIVE.map((r) => ({ round: r.round, health: null, stamina: null }));
  const out = moveReadiness(view([mv("FIN", "OPPONENT_HEALTH_BELOW_75", "SIGNATURE")], old, { healthStart: null, staminaStart: null }));
  expect(out.FIN.openRounds).toEqual([]);
  expect(out.FIN.line).toBe(null);
  expect(out.FIN.reason).toBe(null);
});
