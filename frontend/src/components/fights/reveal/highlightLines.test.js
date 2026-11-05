/**
 * Unit tests for highlightLines.js (short lines for highlight cards).
 * vitest-style globals; registered in tests/frontend/firstSession.vitestFiles.qa.test.js.
 */

import {
  shortLine,
  bigWord,
  quietLine,
  quietVariant,
  LINES,
  MOVE_LINES,
  QUIET_LINES,
  MOVE_OUTCOMES,
  OUTCOME_RANK,
  OUTCOME_WORDS,
} from "./highlightLines.js";
import { EVENT, WILDCARD_AREA } from "../breakdown/eventTemplates.js";
import { renderEvent } from "../breakdown/renderEvent.js";

const NULLS = { strike: null, sub: null, position: null, bodyPart: null, moveIds: [], bonusType: null, effectType: null, outcome: null, stat: null, count: null };
const CTX = { playerName: "Stone", opponentName: "Tarek", fightId: "fx", eventIndex: 3 };
const MOVES = [
  { moveId: "SPRAWL_INSTINCT", name: "Sprawl", rarity: "RARE", effectType: "PROC", triggerCondition: "OPPONENT_SHOOTS_TAKEDOWN" },
  { moveId: "THE_FINISHER", name: "Overhand Right", rarity: "LEGENDARY", effectType: "SIGNATURE", triggerCondition: "OPPONENT_HEALTH_BELOW_75" },
];

const entry = (templateKey, extra = {}, vars = {}) => ({
  round: 2,
  timestamp: "2:00",
  type: "strike",
  actorIsPlayer: true,
  templateKey,
  vars: { ...NULLS, ...vars },
  ...extra,
});

const moveEntry = (moveId, bonusType, outcome) =>
  entry("move_fired", { type: "move" }, { moveIds: [moveId], bonusType, effectType: "PROC", outcome, count: 1 });

function allLines() {
  const out = [];
  for (const arr of Object.values(LINES)) out.push(...arr);
  for (const byType of Object.values(MOVE_LINES)) for (const arr of Object.values(byType)) out.push(...arr);
  out.push(...QUIET_LINES);
  return out;
}

test("no em or en dashes in any short line", () => {
  for (const l of allLines()) expect(/[–—]/.test(l)).toBe(false);
});

test("short lines are short: 3 to 12 words", () => {
  for (const l of allLines()) {
    const n = l.split(/\s+/).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(12);
  }
});

test("lines are deterministic for the same seed", () => {
  const e = entry("knockdown", { type: "knockdown" });
  expect(shortLine(e, CTX)).toBe(shortLine(e, CTX));
});

test("placeholders are all substituted", () => {
  const keys = Object.keys(LINES);
  for (const k of keys) {
    const base = k.replace(/\.(you|them)$/, "");
    const e = entry(base, { actorIsPlayer: !k.endsWith(".them") }, { stat: "wre" });
    expect(shortLine(e, CTX).includes("{")).toBe(false);
    expect(shortLine(e, CTX).length).toBeGreaterThan(3);
  }
});

test("actor and target follow who acted", () => {
  const you = shortLine(entry("takedown_secured", { type: "takedown", actorIsPlayer: true }), CTX);
  expect(/Tarek|Stone/.test(you)).toBe(true);
  const kdThem = LINES["knockdown.them"];
  expect(kdThem.length).toBeGreaterThan(1);
});

test("wildcard line names the real area from vars.stat and never an invented one", () => {
  for (const stat of Object.keys(WILDCARD_AREA)) {
    const text = shortLine(entry("wildcard_fired", { type: "wildcard", actorIsPlayer: false, timestamp: null }, { stat }), CTX);
    expect(text.includes(WILDCARD_AREA[stat])).toBe(true);
  }
});

test("move lines are written per outcome and claim only that outcome", () => {
  const stuffed = shortLine(moveEntry("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "stuffed"), { ...CTX, moves: MOVES });
  const landed = shortLine(moveEntry("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "takedown_landed"), { ...CTX, moves: MOVES });
  expect(/stuffed|sprawled|hips back/i.test(stuffed)).toBe(true);
  expect(/stuffed|sprawled|hips back/i.test(landed)).toBe(false);
  expect(landed.includes("still drags it down")).toBe(true);
  // A sprawl with an unknown outcome names the card and its trigger and says nothing about the result.
  const unknown = shortLine(moveEntry("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", null), { ...CTX, moves: MOVES });
  expect(/stuffed|sprawled|drags/i.test(unknown)).toBe(false);
  expect(unknown.includes("Sprawl")).toBe(true);
  expect(unknown.includes("When they shoot a takedown")).toBe(true);
});

test("strike moves say down only on a knockdown and out only on a finish", () => {
  const ctx = { ...CTX, moves: MOVES };
  const mk = (outcome) => shortLine(moveEntry("THE_FINISHER", "SIG_FINISHER_STRIKE", outcome), ctx);
  expect(/down|drops/i.test(mk("knockdown"))).toBe(true);
  expect(/down|drops|out/i.test(mk("landed"))).toBe(false);
  expect(/down|drops|out/i.test(mk("hurt"))).toBe(false);
  expect(/out|over/i.test(mk("finish"))).toBe(true);
  for (const o of ["landed", "hurt", "knockdown", "finish"]) expect(mk(o).includes("Overhand Right")).toBe(true);
});

test("unknown bonus type falls back to the generic card line, with name and trigger", () => {
  const text = shortLine(moveEntry("THE_FINISHER", "SOMETHING_NEW", "landed"), { ...CTX, moves: MOVES });
  expect(text).toBe("Overhand Right fires: When they're under 75% health.");
});

test("a move missing from the loadout still gets a name from its id", () => {
  const text = shortLine(moveEntry("MYSTERY_MOVE", "SOMETHING_NEW", null), CTX);
  expect(text.includes("Mystery Move")).toBe(true);
  expect(text.includes("()")).toBe(false);
});

test("every outcome in the vocabulary has a rank word, and the ranking only uses the vocabulary", () => {
  for (const o of OUTCOME_RANK) expect(MOVE_OUTCOMES.includes(o)).toBe(true);
  for (const o of MOVE_OUTCOMES) expect(typeof OUTCOME_WORDS[o]).toBe("string");
  expect(OUTCOME_RANK[0]).toBe("finish");
});

test("quiet lines: three variants, stable per fight and round", () => {
  expect(QUIET_LINES).toHaveLength(3);
  expect(quietVariant("fx", 2)).toBe(quietVariant("fx", 2));
  expect(quietLine(quietVariant("fx", 2)).length).toBeGreaterThan(5);
  expect(quietLine(99)).toBe(QUIET_LINES[0]);
});

test("big words come from the event, not invented", () => {
  expect(bigWord(entry("knockdown"))).toBe("Knockdown");
  expect(bigWord(entry("submission_attempt", {}, { sub: "armbar" }))).toBe("Armbar");
  expect(bigWord(entry("strike_hurt", {}, { strike: "knee" }))).toBe("Big knee");
  expect(bigWord(entry("strike_clean"))).toBe("Clean shot");
  expect(bigWord(entry("strike_clean", {}, { strike: "uppercut" }))).toBe("Uppercut");
  expect(bigWord(entry("strike_flurry_unknown"))).toBe("");
});

test("the report renders the same move events with real card names and no placeholders", () => {
  const cases = [
    moveEntry("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "stuffed"),
    moveEntry("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", null),
    moveEntry("THE_FINISHER", "SIG_FINISHER_STRIKE", "knockdown"),
    moveEntry("THE_FINISHER", "BRAND_NEW_TYPE", "finish"),
  ];
  for (const e of cases) {
    const { text, styleClass } = renderEvent(e, { ...CTX, index: 1, moves: MOVES });
    expect(text.includes("{")).toBe(false);
    expect(text.includes("()")).toBe(false);
    expect(/Sprawl|Overhand Right/.test(text)).toBe(true);
    expect(styleClass).toBe("move");
  }
  const wild = renderEvent(entry("wildcard_fired", { type: "wildcard", actorIsPlayer: false, timestamp: null }, { stat: "leg" }), { ...CTX, index: 0 });
  expect(wild.text.includes("a kicking game")).toBe(true);
  expect(wild.styleClass).toBe("wildcard");
  expect(Array.isArray(EVENT.wildcard_fired)).toBe(true);
});
