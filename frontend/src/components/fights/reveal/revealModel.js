/**
 * Fight reveal: pure script builder (highlights with your cards).
 *
 * Turns the persisted, viewer-relative breakdown (`breakdownView`, the same shape as
 * GET /fights/:id/breakdown and the `breakdownView` on the resolve response) into an ordered list
 * of timed items the FightReveal component plays back. No React, no i18n, no DOM. The replay is a
 * filtered, paced view of the persisted `eventLog`: it never invents a moment the log lacks, so
 * everything it shows is also in the full fight report (spec §7).
 *
 * breakdownView fields consumed (contract D.2; the client cannot import the backend JSDoc):
 *   fightId, legacy, method, outcome, youWon, finishRound, finishTime,
 *   header { playerName, opponentName, outcomeWord },
 *   rounds[] { round, roundWinner, dominant, damage:[p,o], strikes:[p,o], takedowns:[p,o] },
 *   eventLog[] { round, timestamp (string | null), type, actorIsPlayer, templateKey,
 *                vars { strike, sub, position, bodyPart, moveIds[], bonusType, effectType,
 *                       outcome, stat, count } },
 *   loadout (null | { moves[] { moveId, name, rarity, effectType, bonusType, triggerCondition, art,
 *                               triggered, firedCount },
 *                     camp[] { sessionType, label, matchStatus, triggered, firedCount } }).
 *
 * Item kinds (every item also has `round`, `baseMs`, `durationMs`, `damage` [p,o] cumulative 0..100,
 * `clock` { round, timestamp | null }, `counters` { strikes:[p,o], takedowns:[p,o] } cumulative
 * through the round, and `corner` { moves:{[moveId]:count}, camp:{[sessionType]:true},
 * passives:[moveId] } = the corner state after the item):
 *   (every item also has `stamina` [p,o] | null: the fighters' stamina through that point)
 *   round_start   { passives: [moveId], readyNew: [{ moveId, line: { key, vars } }] }  passives listed
 *                 on round 1 only; readyNew = moves whose gate first opens this round (ready glow)
 *   (every item's `corner` also carries `ready: [moveId]`, the moves glowing at that item, and the
 *    finish card carries `readiness`, the moveReadiness() map for the What fired reasons)
 *   highlight     { hkind: move | camp | wildcard | knockdown | submission | takedown | big_strike |
 *                          finish_hit, event, eventIndex (in round), logIndex (in eventLog), line,
 *                   combo?: { event, eventIndex, logIndex, line, corner }, move?, ticks: [moveId],
 *                   campTicks: [sessionType], flash, shake, segments: [ms] }
 *   quiet         { variant, line }
 *   round_card    { winner, dominant, score }
 *   stoppage      { methodKey }  finishes only: the referee ends it, before the finish card
 *   finish_card   { methodKey, youWon, outcomeWord, finishRound, finishTime, tally, whatFired,
 *                   winnerName (null on a draw),
 *                   scorecard (decisions only: { rows[] { round, winner, score:[p,o] }, totals:[p,o],
 *                              kind: unanimous | split | decision | draw }) }
 *
 * Every item also carries `hpLoss` [p,o] (the drop in the rounded health numbers since the last
 * item, for the damage numbers), `impact` ("heavy" | "medium" | "light" | null) and `from`
 * ("left" for your side, "right" for theirs, null for non-cards).
 */

import { RARITY } from "../../../constants/specialMovesCatalog.js";
import { shortLine, quietVariant, quietLine, OUTCOME_RANK } from "./highlightLines.js";
import { moveReadiness } from "../moveReadiness.js";

export const COUNTERS_MS = 500;
export const QUIET_MS = 1600;
export const ROUND_CARD_MS = 1000;
export const SIG_SLAM_MS = 2600;
export const PROC_SLAM_MS = 2100;
export const CAMP_MS = 2000;
export const WILD_MS = 2000;
export const FINISH_HIT_MS = 1600;
export const FINISH_CARD_MS = 4000;
/** The stoppage beat after a finishing blow ("IT'S ALL OVER"), before the finish card. */
export const STOPPAGE_MS = 2200;
/** Decision scorecard on the finish card: one row step per round, then the verdict under it. */
export const SCORE_ROW_MS = 450;
export const SCORE_VERDICT_MS = 900;
export const MAX_HIGHLIGHTS = 5;
/** Routine exchanges read faster than big moments: short lines, about 4 words a second. */
export const EXCHANGE_MIN_MS = 1700;
export function exchangeMs(text) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(EXCHANGE_MIN_MS, 700 + 230 * words);
}
/** Logged exchanges that play as small cards. Every one is a real eventLog entry. */
export const EXCHANGE_KEYS = new Set(["strike_clean", "strike_body", "ground_pound", "ground_control_carried", "takedown_stuffed"]);

/** Reading time for a short line: 900 ms plus 280 ms per word. */
export function readingMs(text) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  return 900 + 280 * words;
}

/** Camp event template -> the CAMP_SESSIONS key of the session that fired. */
export const CAMP_EVENT_SESSION = {
  camp_takedown_defence_fired: "TAKEDOWN_DEFENCE",
  camp_submission_escape_fired: "SUBMISSION_ESCAPES",
  camp_gnp_fired: "GROUND_AND_POUND_POSTURE",
  camp_cardio_fired: "CARDIO_PUSH",
  camp_striking_accuracy_fired: "STRIKING_ACCURACY",
  camp_clinch_fired: "CLINCH_CONTROL",
};

const FINISH_KEYS = new Set(["ko_finish", "tko_finish", "tko_finish_strike", "tko_finish_ground", "submission_finish"]);
const ABSORB_TYPES = new Set(["knockdown", "takedown", "submission"]);

const isCamp = (e) => e.type === "camp" || (e.templateKey || "").startsWith("camp_");
const isFinish = (e) => e.type === "finish" || FINISH_KEYS.has(e.templateKey);
const isMoveFired = (e) => e.templateKey === "move_fired";

/** "camp" | "wildcard" | null: the chip a logged event plays with. */
export function beatChip(event) {
  if (!event) return null;
  if (event.templateKey === "wildcard_fired") return "wildcard";
  if (isCamp(event)) return "camp";
  return null;
}

/**
 * Choose the highlights for one round (pure; `firedSoFar` is not mutated).
 *
 * Candidates in priority order: finish, first-fire move (with the camp event right before it on
 * the same exchange as a combo), camp, wildcard, knockdown, submission attempt, takedown, hurt.
 * Moments told by a move slam on the same exchange (knockdown, takedown, submission) are absorbed.
 * The best MAX_HIGHLIGHTS stay, in log order. A move that fired before, or lost the cut, becomes a
 * tick (no time): the corner counter still rises and it rides the next kept item, so counts stay
 * true. Same for a camp event that lost the cut.
 *
 * @param {object[]} roundEvents  the round's events in log order
 * @param {Set<string>|string[]} [firedSoFar]  move ids that already slammed earlier in the fight
 * @returns {{ highlights: object[], trailing: { ticks: string[], campTicks: string[] }, fired: Set<string> }}
 */
export function selectHighlights(roundEvents, firedSoFar = [], roundWinner = null, campSoFar = []) {
  const list = (roundEvents || []).map((event, eventIndex) => ({ event, eventIndex }));
  const fired = new Set(firedSoFar);
  const campFired = new Set(campSoFar);
  const campSession = (e) => CAMP_EVENT_SESSION[e.templateKey] ?? null;
  // A camp session gets its gold card the first time it fires in the fight; later fires only tick
  // its corner chip (Striking Accuracy can fire every round and must not crowd out the fight).
  const campFirst = new Set();
  for (const { event, eventIndex } of list) {
    if (!isCamp(event)) continue;
    const sess = campSession(event);
    if (sess && !campFired.has(sess)) campFirst.add(eventIndex);
    if (sess) campFired.add(sess);
  }

  // Pass 1: which move_fired events are first-fire slams.
  const slam = new Set();
  for (const { event, eventIndex } of list) {
    if (!isMoveFired(event)) continue;
    const ids = Array.isArray(event.vars?.moveIds) ? event.vars.moveIds : [];
    if (ids.some((id) => !fired.has(id))) slam.add(eventIndex);
    ids.forEach((id) => fired.add(id));
  }

  // Moments a slam already tells (same exchange), and the camp event a slam combos with.
  const absorbed = new Set();
  const comboCamp = new Map(); // slam index -> camp list entry
  const consumed = new Set();
  for (const idx of slam) {
    const ts = list[idx].event.timestamp;
    if (ts != null) {
      for (const o of list) {
        if (o.eventIndex !== idx && !isMoveFired(o.event) && o.event.timestamp === ts && ABSORB_TYPES.has(o.event.type)) {
          absorbed.add(o.eventIndex);
        }
      }
    }
    const prev = list[idx - 1];
    if (prev && isCamp(prev.event) && campFirst.has(prev.eventIndex) && ts != null && prev.event.timestamp === ts && !consumed.has(prev.eventIndex)) {
      comboCamp.set(idx, prev);
      consumed.add(prev.eventIndex);
    }
  }

  const candidates = [];
  const ticksRaw = [];
  for (const { event, eventIndex } of list) {
    if (isFinish(event)) {
      candidates.push({ hkind: "finish_hit", prio: 0, event, eventIndex });
    } else if (isMoveFired(event)) {
      if (slam.has(eventIndex)) {
        candidates.push({ hkind: "move", prio: 1, event, eventIndex, combo: comboCamp.get(eventIndex) ?? null });
      } else {
        ticksRaw.push({ eventIndex, moveIds: event.vars?.moveIds ?? [], count: event.vars?.count ?? 1 });
      }
    } else if (isCamp(event)) {
      if (consumed.has(eventIndex)) continue;
      if (campFirst.has(eventIndex)) candidates.push({ hkind: "camp", prio: 2, event, eventIndex });
      else ticksRaw.push({ eventIndex, camp: campSession(event) });
    } else if (event.templateKey === "wildcard_fired") {
      candidates.push({ hkind: "wildcard", prio: 3, event, eventIndex });
    } else if (event.templateKey === "knockdown" && !absorbed.has(eventIndex)) {
      candidates.push({ hkind: "knockdown", prio: 4, event, eventIndex });
    } else if (event.templateKey === "submission_attempt" && !absorbed.has(eventIndex)) {
      candidates.push({ hkind: "submission", prio: 5, event, eventIndex });
    } else if (event.templateKey === "takedown_secured" && !absorbed.has(eventIndex)) {
      candidates.push({ hkind: "takedown", prio: 6, event, eventIndex });
    } else if (event.templateKey === "strike_hurt") {
      candidates.push({ hkind: "big_strike", prio: 7, event, eventIndex });
    } else if (EXCHANGE_KEYS.has(event.templateKey) && !absorbed.has(eventIndex)) {
      // The shots, body work and ground and pound of the round: real logged exchanges, smaller cards.
      candidates.push({ hkind: "exchange", prio: 8, event, eventIndex });
    }
  }

  const ranked = [...candidates].sort((a, b) => a.prio - b.prio || a.eventIndex - b.eventIndex);
  const keepSet = new Set(ranked.slice(0, MAX_HIGHLIGHTS));
  const highlights = candidates.filter((c) => keepSet.has(c)).map((c) => ({ ...c, ticks: [], campTicks: [] }));

  // Losers that carry a counter still count.
  for (const c of candidates) {
    if (keepSet.has(c)) continue;
    if (c.hkind === "move") {
      ticksRaw.push({ eventIndex: c.eventIndex, moveIds: c.event.vars?.moveIds ?? [], count: c.event.vars?.count ?? 1 });
      if (c.combo) ticksRaw.push({ eventIndex: c.combo.eventIndex, camp: campSession(c.combo.event) });
    } else if (c.hkind === "camp") {
      ticksRaw.push({ eventIndex: c.eventIndex, camp: campSession(c.event) });
    }
  }

  const primary = (h) => (h.combo ? Math.min(h.combo.eventIndex, h.eventIndex) : h.eventIndex);
  const trailing = { ticks: [], campTicks: [] };
  for (const tk of ticksRaw.sort((a, b) => a.eventIndex - b.eventIndex)) {
    const host = highlights.find((h) => primary(h) > tk.eventIndex);
    const target = host ?? trailing;
    if (tk.camp) {
      target.campTicks.push(tk.camp);
    } else {
      for (let i = 0; i < (tk.count || 1); i += 1) target.ticks.push(...tk.moveIds);
    }
  }

  return { highlights, trailing, fired, campFired };
}

/**
 * Which fighter a highlight hurts and how hard, used to spread the round's real health loss over
 * the cards that show the hits (your bar drops on his shots, his bar on yours). The round still
 * lands on the persisted health; only where inside the round each point goes is presentation.
 * @returns {{ target: 0|1, w: number } | null}  target 0 = player, 1 = opponent
 */
/** Camp events whose line describes the player landing on him. */
const CAMP_HIT_KEYS = new Set(["camp_striking_accuracy_fired", "camp_clinch_fired", "camp_gnp_fired"]);

export function hitWeight(h) {
  const e = h?.event;
  if (!e) return null;
  const target = e.actorIsPlayer ? 1 : 0;
  switch (h.hkind) {
    case "finish_hit": return { target, w: 4 };
    case "knockdown": return { target, w: 3 };
    case "big_strike": return { target, w: 2 };
    case "takedown": return { target, w: 1 };
    case "exchange": return e.templateKey === "takedown_stuffed" ? null : { target, w: 1 };
    case "move": {
      // Every outcome that says the shot hurt him must move his bar on this card (a "hurt" card
      // reads WOBBLED; without a weight his health stayed put until a later card).
      const o = e.vars?.outcome;
      if (o === "knockdown" || o === "finish" || o === "hurt") return { target, w: 3 };
      if (o === "landed" || o === "ground_pound") return { target, w: 2 };
      if (o === "takedown_landed") return { target, w: 1 };
      return null;
    }
    case "camp":
      // Camp cards that tell a hit (sharper shots, clinch work, ground strikes) drop his bar too.
      return CAMP_HIT_KEYS.has(e.templateKey) ? { target, w: 1 } : null;
    default: return null;
  }
}

/**
 * Which side's strike counter a card moves, and by how much of that side's round total.
 * @returns {{ side: 0|1, w: number } | null}  side 0 = player
 */
export function strikeWeight(h) {
  const e = h?.event;
  if (!e) return null;
  const side = e.actorIsPlayer ? 0 : 1;
  switch (h.hkind) {
    case "exchange": return e.templateKey === "takedown_stuffed" ? null : { side, w: 1 };
    case "big_strike":
    case "knockdown":
    case "finish_hit": return { side, w: 2 };
    case "move": {
      const o = e.vars?.outcome;
      if (o === "hurt" || o === "knockdown" || o === "finish") return { side, w: 2 };
      return o === "landed" || o === "ground_pound" ? { side, w: 1 } : null;
    }
    case "camp": return CAMP_HIT_KEYS.has(e.templateKey) ? { side, w: 1 } : null;
    default: return null;
  }
}

/** The side whose takedown a card shows (0 = player), or null. */
export function takedownSide(h) {
  const e = h?.event;
  if (!e) return null;
  if (h.hkind === "takedown") return e.actorIsPlayer ? 0 : 1;
  if (h.hkind === "move" && e.vars?.outcome === "takedown_landed") return e.actorIsPlayer ? 0 : 1;
  return null;
}

/** How a highlight should land on screen: "heavy" (shake + flash), "medium" (small shake), "light". */
export function impactOf(item) {
  if (item.kind !== "highlight") return null;
  if (item.hkind === "finish_hit" || item.hkind === "knockdown") return "heavy";
  const o = item.event?.vars?.outcome;
  if (item.hkind === "move" && (o === "knockdown" || o === "finish" || o === "hurt")) return "heavy";
  if (item.hkind === "big_strike" || item.hkind === "takedown") return "medium";
  if (item.hkind === "move" && o === "landed") return "medium";
  const loss = item.hpLoss ?? [0, 0];
  return loss[0] > 0 || loss[1] > 0 ? "light" : null;
}

/** Which side a card slides in from: yours from the left, theirs from the right. */
export function sideOf(item) {
  if (item.kind !== "highlight") return null;
  if (item.hkind === "wildcard") return "right";
  if (item.hkind === "move" || item.hkind === "camp") return "left";
  return item.event?.actorIsPlayer ? "left" : "right";
}

/** Player-first judge score for a round on the decision scorecard: [player, opponent]. */
export function sideScore(roundWinner, dominant) {
  const lose = dominant ? 8 : 9;
  if (roundWinner === "player") return [10, lose];
  if (roundWinner === "opponent") return [lose, 10];
  return [10, 10];
}

/** "unanimous" | "split" | "decision" | "draw" from the saved outcome string. */
export function decisionKindOf(view) {
  const outcome = String(view?.outcome ?? "").toLowerCase();
  if (methodKeyOf(view) === "draw") return "draw";
  if (outcome.includes("unanimous")) return "unanimous";
  if (outcome.includes("split")) return "split";
  return "decision";
}

/** A stamina pair [player, opponent] as finite numbers, or null when absent or malformed. */
export function staminaPair(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const a = Number(v[0]);
  const b = Number(v[1]);
  if (v[0] == null || v[1] == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function clamp100(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/** Winner-first judge score for a round: 10 to 9, 10 to 8 when dominant, 10 to 10 when even. */
export function roundScore(roundWinner, dominant) {
  if (roundWinner === "player" || roundWinner === "opponent") return [10, dominant ? 8 : 9];
  return [10, 10];
}

/** "ko" | "tko" | "submission" | "decision" | "split" | "draw" for the finish card. */
export function methodKeyOf(view) {
  const m = String(view?.method ?? "").toLowerCase();
  const outcome = String(view?.outcome ?? "").toLowerCase();
  if (m === "draw" || outcome.includes("draw")) return "draw";
  if (m === "ko") return "ko";
  if (m === "tko") return "tko";
  if (m === "submission") return "submission";
  if (outcome.includes("split")) return "split";
  return "decision";
}

function isFinishMethod(key) {
  return key === "ko" || key === "tko" || key === "submission";
}

function outcomeWordOf(view) {
  if (view?.header?.outcomeWord) return view.header.outcomeWord;
  if (methodKeyOf(view) === "draw") return "DRAW";
  return view?.youWon ? "VICTORY" : "DEFEAT";
}

/** Loadout rows behind a move_fired event, with a minimal stand-in for ids the loadout lacks. */
function rowsFor(event, moves) {
  const ids = Array.isArray(event?.vars?.moveIds) ? event.vars.moveIds : [];
  return ids.map((id) => moves.find((m) => m.moveId === id) ?? {
    moveId: id,
    name: String(id).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
    rarity: null,
    effectType: event.vars?.effectType ?? "PROC",
    art: null,
  });
}

/** The card a merged slam plays: highest rarity, then loadout order. */
function pickSlamRow(event, moves) {
  const rows = rowsFor(event, moves);
  let best = null;
  for (const r of rows) {
    if (!best || RARITY.indexOf(r.rarity) > RARITY.indexOf(best.rarity)) best = r;
  }
  return best;
}

export function bestOutcomeOf(moveId, eventLog) {
  let bestRank = Infinity;
  let best = null;
  for (const e of eventLog) {
    if (!isMoveFired(e) || !(e.vars?.moveIds || []).includes(moveId)) continue;
    const rank = OUTCOME_RANK.indexOf(e.vars?.outcome);
    if (rank !== -1 && rank < bestRank) { bestRank = rank; best = e.vars.outcome; }
  }
  return best;
}

/**
 * @param {object} view  breakdownView
 * @param {{ speed?: number, playerName?: string, opponentName?: string }} [opts]
 * @returns {{ items: object[], totalHighlights: number, totalMs: number, corner: object|null }}
 */
export function buildHighlightScript(view, { speed = 1, playerName, opponentName } = {}) {
  const sp = speed > 0 ? speed : 1;
  const rounds = [...(view?.rounds ?? [])].sort((a, b) => a.round - b.round);
  const eventLog = Array.isArray(view?.eventLog) ? view.eventLog : [];
  const loadout = view?.loadout && typeof view.loadout === "object" ? view.loadout : null;
  const moves = Array.isArray(loadout?.moves) ? loadout.moves : [];
  const camp = Array.isArray(loadout?.camp) ? loadout.camp : [];
  const methodKey = methodKeyOf(view);
  const finished = isFinishMethod(methodKey);
  const fightId = view?.fightId ?? "fight";
  const names = {
    playerName: playerName || view?.header?.playerName || "You",
    opponentName: opponentName || view?.header?.opponentName || "Opponent",
  };
  const lineOf = (event, eventIndex) => shortLine(event, { ...names, fightId, eventIndex, moves });

  const items = [];
  const make = (item) => ({ ...item, durationMs: Math.round(item.baseMs / sp) });

  // Corner state, accumulated as items play.
  const cMoves = {};
  const cCamp = {};
  let cPassives = [];
  // Ready glow: moves whose engine gate is open this round (a one-shot only until it fires).
  const readiness = moveReadiness(view);
  let curRound = null;
  const readyNow = () => Object.entries(readiness)
    .filter(([id, rd]) => curRound != null && rd.openRounds.includes(curRound) && !(rd.oneShot && (cMoves[id] || 0) > 0))
    .map(([id]) => id);
  const snap = () => ({ moves: { ...cMoves }, camp: { ...cCamp }, passives: [...cPassives], ready: readyNow() });
  const addMoveIds = (ids, n = 1) => { for (const id of ids || []) cMoves[id] = (cMoves[id] || 0) + n; };
  const lightCamp = (session) => { if (session) cCamp[session] = true; };

  const passiveIds = moves.filter((m) => m.effectType === "PASSIVE" && m.triggered).map((m) => m.moveId);

  // Stamina: starts at staminaStart, drops to the round's value at its round_start and stays there.
  const staminaStart = staminaPair(view?.staminaStart);
  let curStamina = staminaStart;
  let prevDamage = [0, 0];
  // Health: the fighters' REAL health (the player walks in with their current HP, not 100), from
  // healthStart and each round's end-of-round health. null on fights saved before health was kept.
  let curHealth = staminaPair(view?.healthStart);
  let lastClock = { round: rounds[0]?.round ?? 1, timestamp: null };
  let fired = new Set();
  let campSeen = new Set();
  const tally = { player: 0, opponent: 0, even: 0 };
  const cum = { strikes: [0, 0], takedowns: [0, 0] };
  let highlightCount = 0;

  rounds.forEach((r, ri) => {
    curRound = r.round;
    const roundIdx = [];
    const roundEvents = [];
    eventLog.forEach((e, i) => { if (e.round === r.round) { roundIdx.push(i); roundEvents.push(e); } });
    const { highlights, trailing, fired: firedAfter, campFired } = selectHighlights(roundEvents, fired, r.roundWinner, campSeen);
    fired = firedAfter;
    campSeen = campFired;

    // Counters climb as the round plays: the round starts on last round's totals, each card adds
    // the strikes and takedowns it shows, and the round card lands on the saved round totals.
    const startCum = { strikes: [...cum.strikes], takedowns: [...cum.takedowns] };
    const roundStrikes = [r.strikes?.[0] || 0, r.strikes?.[1] || 0];
    const roundTakedowns = [r.takedowns?.[0] || 0, r.takedowns?.[1] || 0];
    cum.strikes = [cum.strikes[0] + roundStrikes[0], cum.strikes[1] + roundStrikes[1]];
    cum.takedowns = [cum.takedowns[0] + roundTakedowns[0], cum.takedowns[1] + roundTakedowns[1]];
    const counters = { strikes: [...cum.strikes], takedowns: [...cum.takedowns] };

    const endDamage = [clamp100(r.damage?.[0]), clamp100(r.damage?.[1])];
    // Cumulative damage can only grow; guard against a malformed dip.
    const end = [Math.max(prevDamage[0], endDamage[0]), Math.max(prevDamage[1], endDamage[1])];

    if (ri === 0) cPassives = passiveIds;
    curStamina = staminaPair(r.stamina) ?? curStamina;
    const stamina = curStamina ? [...curStamina] : null;
    const hFrom = curHealth;
    const hTo = staminaPair(r.health);
    const hAt = (f) => (hFrom && hTo
      ? [hFrom[0] + (hTo[0] - hFrom[0]) * f, hFrom[1] + (hTo[1] - hFrom[1]) * f]
      : (hTo && f >= 1 ? [...hTo] : (hFrom ? [...hFrom] : null)));
    items.push(make({
      kind: "round_start",
      round: r.round,
      baseMs: COUNTERS_MS,
      damage: [...prevDamage],
      stamina,
      health: hAt(0),
      clock: { round: r.round, timestamp: null },
      counters: { strikes: [...startCum.strikes], takedowns: [...startCum.takedowns] },
      corner: snap(),
      passives: ri === 0 ? passiveIds : [],
      // Moves whose gate first opens this round: the READY line (i18n key + vars, no text here).
      readyNew: Object.entries(readiness)
        .filter(([, rd]) => rd.firstReadyRound === r.round && rd.line)
        .map(([moveId, rd]) => ({ moveId, line: rd.line })),
    }));

    // Each side's health drops on the cards where the other side lands; a side nobody visibly hit
    // this round keeps its health until the round card, which lands on the saved value.
    const hits = highlights.map(hitWeight);
    const totW = [0, 0];
    hits.forEach((hw) => { if (hw) totW[hw.target] += hw.w; });
    const cumW = [0, 0];
    // Takedowns: one per takedown card of that side, up to the round's real count. Strikes are
    // spread over the whole round after the cards are timed (see below).
    const tdSeen = [0, 0];
    const roundFirstIdx = items.length;

    highlights.forEach((h, i) => {
      const f = (i + 1) / highlights.length;
      const hw = hits[i];
      if (hw) cumW[hw.target] += hw.w;
      const tdSide = takedownSide(h);
      if (tdSide != null && tdSeen[tdSide] < roundTakedowns[tdSide]) tdSeen[tdSide] += 1;
      const liveCounters = {
        strikes: [...startCum.strikes],
        takedowns: [0, 1].map((s) => startCum.takedowns[s] + tdSeen[s]),
      };
      const hHit = hFrom && hTo
        ? [0, 1].map((s) => (totW[s] > 0 ? hFrom[s] + (hTo[s] - hFrom[s]) * (cumW[s] / totW[s]) : hFrom[s]))
        : hAt(f);
      const damage = [
        prevDamage[0] + (end[0] - prevDamage[0]) * f,
        prevDamage[1] + (end[1] - prevDamage[1]) * f,
      ];
      const { event, eventIndex } = h;
      const line = lineOf(event, eventIndex);
      lastClock = { round: r.round, timestamp: event.timestamp ?? null };

      // Ticks first (counters rise as the item starts), then the item's own lights.
      addMoveIds(h.ticks);
      h.campTicks.forEach(lightCamp);

      const item = {
        kind: "highlight",
        round: r.round,
        hkind: h.hkind,
        event,
        eventIndex,
        logIndex: roundIdx[eventIndex],
        line,
        ticks: [...h.ticks],
        campTicks: [...h.campTicks],
        flash: false,
        shake: false,
        damage,
        stamina,
        health: hHit,
        clock: lastClock,
        counters: liveCounters,
      };

      let segments;
      if (h.hkind === "move") {
        const row = pickSlamRow(event, moves);
        const sig = (event.vars?.effectType || row?.effectType) === "SIGNATURE";
        const outcome = event.vars?.outcome;
        item.move = row;
        item.flash = sig;
        item.shake = sig || outcome === "knockdown" || outcome === "finish";
        const slamMs = Math.max(sig ? SIG_SLAM_MS : PROC_SLAM_MS, readingMs(line));
        if (h.combo) {
          const cLine = lineOf(h.combo.event, h.combo.eventIndex);
          lightCamp(CAMP_EVENT_SESSION[h.combo.event.templateKey]);
          item.combo = {
            event: h.combo.event,
            eventIndex: h.combo.eventIndex,
            logIndex: roundIdx[h.combo.eventIndex],
            line: cLine,
            corner: snap(),
          };
          segments = [Math.max(CAMP_MS, readingMs(cLine)), slamMs];
        } else {
          segments = [slamMs];
        }
        addMoveIds(event.vars?.moveIds, event.vars?.count ?? 1);
      } else if (h.hkind === "camp") {
        lightCamp(CAMP_EVENT_SESSION[event.templateKey]);
        segments = [Math.max(CAMP_MS, readingMs(line))];
      } else if (h.hkind === "wildcard") {
        item.shake = true;
        segments = [Math.max(WILD_MS, readingMs(line))];
      } else if (h.hkind === "finish_hit") {
        item.flash = true;
        item.shake = true;
        segments = [FINISH_HIT_MS];
      } else {
        if (h.hkind === "knockdown") { item.flash = true; item.shake = true; }
        segments = [h.hkind === "exchange" ? exchangeMs(line) : readingMs(line)];
      }
      item.segments = segments;
      item.baseMs = segments.reduce((s, ms) => s + ms, 0);
      item.corner = snap();
      items.push(make(item));
      highlightCount += 1;
    });

    if (!highlights.length) {
      const variant = quietVariant(fightId, r.round);
      items.push(make({
        kind: "quiet",
        round: r.round,
        variant,
        line: quietLine(variant),
        baseMs: QUIET_MS,
        damage: end,
        stamina,
        health: hAt(1),
        clock: { round: r.round, timestamp: lastClock.timestamp },
        counters,
        corner: snap(),
      }));
      highlightCount += 1;
    }

    // Strikes tick through the whole round like a live stat: each side's round total is spread over
    // every card of the round by its time on screen, three times faster on that side's own landed
    // cards (more for a big shot). Each card's counter is the value reached when it ends, and the
    // panel rolls up to it while the card plays, so nothing jumps at the round's start or end.
    const roundItems = items.slice(roundFirstIdx).filter((it) => it.kind === "highlight" || it.kind === "quiet");
    if (roundItems.length) {
      const wts = [0, 1].map((side) => roundItems.map((it) => {
        const sw = it.kind === "highlight" ? strikeWeight(it) : null;
        return Math.max(1, it.baseMs || 0) * (sw && sw.side === side ? 1 + 2 * sw.w : 1);
      }));
      const tot = wts.map((w) => w.reduce((a, b) => a + b, 0));
      const acc = [0, 0];
      roundItems.forEach((it, k) => {
        acc[0] += wts[0][k];
        acc[1] += wts[1][k];
        it.counters = {
          strikes: [0, 1].map((side) => startCum.strikes[side] + Math.round(roundStrikes[side] * (acc[side] / tot[side]))),
          takedowns: [...it.counters.takedowns],
        };
      });
    }

    // Counters of repeat or cut-off cards ride the round card.
    addMoveIds(trailing.ticks);
    trailing.campTicks.forEach(lightCamp);

    if (r.roundWinner === "player") tally.player += 1;
    else if (r.roundWinner === "opponent") tally.opponent += 1;
    else tally.even += 1;

    const isLast = ri === rounds.length - 1;
    // A finish ends the last round mid-flow: no scorecard for it, the finish card follows.
    if (!(isLast && finished)) {
      items.push(make({
        kind: "round_card",
        round: r.round,
        baseMs: ROUND_CARD_MS,
        damage: end,
        stamina,
        health: hAt(1),
        clock: { round: r.round, timestamp: lastClock.timestamp },
        counters,
        corner: snap(),
        winner: r.roundWinner,
        dominant: !!r.dominant,
        score: roundScore(r.roundWinner, r.dominant),
      }));
    }
    prevDamage = end;
    curHealth = hTo ?? curHealth;
  });

  // The finish card shows the true totals from the loadout, so Skip and watching to the end agree.
  let finishCorner = snap();
  let whatFired = null;
  if (loadout) {
    finishCorner = {
      moves: Object.fromEntries(moves.filter((m) => m.effectType !== "PASSIVE" && m.firedCount > 0).map((m) => [m.moveId, m.firedCount])),
      camp: Object.fromEntries(camp.filter((c) => c.triggered).map((c) => [c.sessionType, true])),
      passives: passiveIds,
    };
    whatFired = {
      moves: moves.map((m) => ({ ...m, bestOutcome: bestOutcomeOf(m.moveId, eventLog) })),
      camp: camp.map((c) => ({ ...c })),
    };
  }

  const lastRound = rounds.length ? rounds[rounds.length - 1].round : 1;
  const winnerName = methodKey === "draw" ? null : (view?.youWon ? names.playerName : names.opponentName);
  const finalHealth = curHealth ? [...curHealth] : null;

  // The stoppage: the referee ends it after the finishing blow, then the result is read out.
  if (finished) {
    items.push(make({
      kind: "stoppage",
      round: lastRound,
      baseMs: STOPPAGE_MS,
      damage: prevDamage,
      stamina: curStamina ? [...curStamina] : null,
      health: finalHealth,
      clock: lastClock,
      counters: { strikes: [...cum.strikes], takedowns: [...cum.takedowns] },
      corner: snap(),
      // No result here (spoiler rule): who won is only told by the finish card.
      methodKey,
    }));
  }

  // Decisions: the round-by-round card (the same rounds the report shows), totals, then the verdict.
  let scorecard = null;
  if (!finished) {
    const rows = rounds.map((r) => ({
      round: r.round,
      winner: r.roundWinner === "player" || r.roundWinner === "opponent" ? r.roundWinner : "even",
      score: sideScore(r.roundWinner, r.dominant),
    }));
    scorecard = {
      rows,
      totals: rows.reduce((t, r) => [t[0] + r.score[0], t[1] + r.score[1]], [0, 0]),
      kind: decisionKindOf(view),
    };
  }
  const finishBase = FINISH_CARD_MS + (scorecard ? scorecard.rows.length * SCORE_ROW_MS + SCORE_VERDICT_MS : 0);

  items.push(make({
    kind: "finish_card",
    round: lastRound,
    baseMs: finishBase,
    damage: prevDamage,
    stamina: curStamina ? [...curStamina] : null,
    health: curHealth ? [...curHealth] : null,
    clock: lastClock,
    counters: { strikes: [...cum.strikes], takedowns: [...cum.takedowns] },
    corner: finishCorner,
    methodKey,
    youWon: !!view?.youWon,
    outcomeWord: outcomeWordOf(view),
    finishRound: view?.finishRound ?? null,
    finishTime: view?.finishTime ?? null,
    tally: { ...tally },
    whatFired,
    readiness,
    winnerName,
    scorecard,
  }));

  // Damage numbers and impact: each item's visible health loss (rounded, as the bar numbers show).
  let shown = null;
  for (const it of items) {
    const h = Array.isArray(it.health) ? it.health.map((v) => Math.round(v)) : null;
    it.hpLoss = h && shown && it.kind !== "finish_card"
      ? [Math.max(0, shown[0] - h[0]), Math.max(0, shown[1] - h[1])]
      : [0, 0];
    if (h) shown = h;
    it.impact = impactOf(it);
    it.from = sideOf(it);
  }

  // One entry per round for the round strip; the finishing round shows "Finish" instead of a score.
  const lastRoundNo = rounds.length ? rounds[rounds.length - 1].round : null;
  const finishNo = finished ? (view?.finishRound ?? lastRoundNo) : null;
  const roundsMeta = rounds.map((r) => ({
    round: r.round,
    winner: r.roundWinner === "player" || r.roundWinner === "opponent" ? r.roundWinner : "even",
    dominant: !!r.dominant,
    score: roundScore(r.roundWinner, r.dominant),
    finish: finished && r.round === finishNo,
  }));

  return {
    staminaStart,
    roundsMeta,
    items,
    totalHighlights: highlightCount,
    totalMs: items.reduce((s, it) => s + it.durationMs, 0),
    corner: loadout ? { moves, camp } : null,
  };
}

/** True when a resolve payload carries a breakdown the reveal can play. */
export function canPlayReveal(view) {
  return !!view && view.legacy !== true && Array.isArray(view.eventLog);
}
