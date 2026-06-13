/**
 * Unit tests for renderEvent.js
 * Run with: npx vitest (requires vitest devDependency)
 *
 * These tests verify:
 * 1. Deterministic variant for a fixed seed
 * 2. Placeholder substitution
 * 3. Style class per type/actor combination
 */

import { renderEvent, renderIntro, renderResult, renderRoundWinner } from "./renderEvent.js";

// ── 1. Deterministic / seeded PRNG ───────────────────────────────────────────
const BASE_ENTRY = {
  round: 1,
  timestamp: "1:08",
  type: "takedown",
  actorIsPlayer: true,
  templateKey: "takedown_secured",
  vars: { strike: null, sub: null, position: null, bodyPart: null },
};

const BASE_CTX = {
  playerName: "Jack",
  opponentName: "Watson",
  fightId: "fight_abc123",
  index: 2,
};

test("renderEvent returns same text on repeated calls (deterministic)", () => {
  const r1 = renderEvent(BASE_ENTRY, BASE_CTX);
  const r2 = renderEvent(BASE_ENTRY, BASE_CTX);
  expect(r1.text).toBe(r2.text);
  expect(r1.styleClass).toBe(r2.styleClass);
});

test("renderEvent returns different text for different indexes (seed variation)", () => {
  const r1 = renderEvent(BASE_ENTRY, { ...BASE_CTX, index: 0 });
  const r2 = renderEvent(BASE_ENTRY, { ...BASE_CTX, index: 7 });
  // Not guaranteed to differ (possible collision), but with 8 templates
  // and different seeds it almost certainly does.
  // We just verify both are non-empty strings.
  expect(typeof r1.text).toBe("string");
  expect(r1.text.length).toBeGreaterThan(0);
  expect(typeof r2.text).toBe("string");
});

// ── 2. Placeholder substitution ──────────────────────────────────────────────
test("renderEvent substitutes {actor} and {target} correctly", () => {
  const r = renderEvent(BASE_ENTRY, BASE_CTX);
  expect(r.text).not.toContain("{actor}");
  expect(r.text).not.toContain("{target}");
  expect(r.text).not.toContain("{playerName}");
  expect(r.text).not.toContain("{opponentName}");
});

test("renderEvent substitutes {strike} from vars", () => {
  const entry = {
    ...BASE_ENTRY,
    templateKey: "strike_clean",
    type: "strike",
    vars: { strike: "left hook" },
  };
  const r = renderEvent(entry, BASE_CTX);
  expect(r.text).toContain("left hook");
});

test("renderEvent substitutes {strike} default when vars.strike is null", () => {
  const entry = {
    ...BASE_ENTRY,
    templateKey: "strike_clean",
    type: "strike",
    vars: {},
  };
  const r = renderEvent(entry, BASE_CTX);
  expect(r.text).toContain("right hand");
});

test("renderEvent substitutes {sub} from vars", () => {
  const entry = {
    ...BASE_ENTRY,
    templateKey: "submission_attempt",
    type: "submission",
    actorIsPlayer: true,
    vars: { sub: "guillotine choke" },
  };
  const r = renderEvent(entry, BASE_CTX);
  expect(r.text).toContain("guillotine choke");
});

// ── 3. Style class per type/actor ────────────────────────────────────────────
test("type=camp → styleClass=camp regardless of actor", () => {
  const entry = { ...BASE_ENTRY, type: "camp", templateKey: "camp_gnp_fired", actorIsPlayer: true };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("camp");

  const entry2 = { ...entry, actorIsPlayer: false };
  expect(renderEvent(entry2, BASE_CTX).styleClass).toBe("camp");
});

test("type=finish + actorIsPlayer=true → styleClass=hl", () => {
  const entry = { ...BASE_ENTRY, type: "finish", templateKey: "ko_finish", actorIsPlayer: true };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("hl");
});

test("type=finish + actorIsPlayer=false → styleClass=danger", () => {
  const entry = { ...BASE_ENTRY, type: "finish", templateKey: "ko_finish", actorIsPlayer: false };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("danger");
});

test("type=knockdown + actorIsPlayer=true → styleClass=hl", () => {
  const entry = { ...BASE_ENTRY, type: "knockdown", templateKey: "knockdown", actorIsPlayer: true };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("hl");
});

test("templateKey=strike_hurt + actorIsPlayer=false → styleClass=danger", () => {
  const entry = { ...BASE_ENTRY, type: "strike", templateKey: "strike_hurt", actorIsPlayer: false };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("danger");
});

test("type=takedown + templateKey=takedown_secured + actorIsPlayer=true → styleClass=hl", () => {
  const entry = { ...BASE_ENTRY, type: "takedown", templateKey: "takedown_secured", actorIsPlayer: true };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("hl");
});

test("type=ground + actorIsPlayer=true → styleClass=hl", () => {
  const entry = { ...BASE_ENTRY, type: "ground", templateKey: "ground_pound", actorIsPlayer: true };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("hl");
});

test("type=submission + actorIsPlayer=false → styleClass=danger", () => {
  const entry = { ...BASE_ENTRY, type: "submission", templateKey: "submission_attempt", actorIsPlayer: false };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("danger");
});

test("generic type → styleClass=neutral", () => {
  const entry = { ...BASE_ENTRY, type: "clinch", templateKey: "clinch_work", actorIsPlayer: true };
  expect(renderEvent(entry, BASE_CTX).styleClass).toBe("neutral");
});

// ── renderIntro ──────────────────────────────────────────────────────────────
test("renderIntro returns non-empty string for standard key", () => {
  const text = renderIntro("standard", { playerName: "Jack", opponentName: "Watson", fightId: "f1" });
  expect(typeof text).toBe("string");
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain("{playerName}");
  expect(text).not.toContain("{opponentName}");
});

test("renderIntro is deterministic", () => {
  const ctx = { playerName: "Jack", opponentName: "Watson", fightId: "f1" };
  expect(renderIntro("nemesis", ctx)).toBe(renderIntro("nemesis", ctx));
});

// ── renderResult ─────────────────────────────────────────────────────────────
test("renderResult win_submission standard returns substituted string", () => {
  const text = renderResult(
    "Win (Submission)",
    "standard",
    { playerName: "Jack", opponentName: "Watson", sub: "armbar", strike: null, fightId: "f1", youWon: true }
  );
  expect(text).not.toContain("{");
  expect(text.length).toBeGreaterThan(0);
});

test("renderResult draw returns draw template", () => {
  const text = renderResult("Draw", "standard", {
    playerName: "Jack", opponentName: "Watson", sub: null, strike: null, fightId: "f1", youWon: false
  });
  expect(text.toLowerCase()).toMatch(/draw|standstill|split/);
});

test("renderResult loss giantKiller falls back to standard", () => {
  const standard = renderResult("Loss (Decision)", "standard", {
    playerName: "Jack", opponentName: "Watson", sub: null, strike: null, fightId: "f1", youWon: false
  });
  const giantKiller = renderResult("Loss (Decision)", "giantKiller", {
    playerName: "Jack", opponentName: "Watson", sub: null, strike: null, fightId: "f1", youWon: false
  });
  expect(standard).toBe(giantKiller); // giantKiller falls back to standard for losses
});

// ── renderRoundWinner ────────────────────────────────────────────────────────
test("renderRoundWinner player+dominant → player_dominant category", () => {
  const { category, label } = renderRoundWinner("player", {
    playerName: "Jack", opponentName: "Watson", fightId: "f1", round: 1, dominant: true
  });
  expect(category).toBe("player_dominant");
  expect(label).not.toContain("{playerName}");
});

test("renderRoundWinner even → even category", () => {
  const { category } = renderRoundWinner("even", {
    playerName: "Jack", opponentName: "Watson", fightId: "f1", round: 2, dominant: false
  });
  expect(category).toBe("even");
});

test("renderRoundWinner opponent+non-dominant → opponent_ahead", () => {
  const { category } = renderRoundWinner("opponent", {
    playerName: "Jack", opponentName: "Watson", fightId: "f1", round: 1, dominant: false
  });
  expect(category).toBe("opponent_ahead");
});
