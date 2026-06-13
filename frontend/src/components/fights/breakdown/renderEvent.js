/**
 * Fight Description System — pure render helpers.
 * No React. Deterministic PRNG seeded by string hash so summary + drawer
 * always pick the same template variant.
 */

import { INTRO, EVENT, RESULT, ROUND_WINNER } from "./eventTemplates.js";

// ── Seeded PRNG ──────────────────────────────────────────────────────────────
/**
 * Simple string hash (djb2) → integer seed → pick index into array.
 * Deterministic for the same seedStr + array length.
 */
function seededPick(array, seedStr) {
  if (!array || array.length === 0) return "";
  let hash = 5381;
  for (let i = 0; i < seedStr.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) + hash) ^ seedStr.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  const idx = hash % array.length;
  return array[idx];
}

// ── Placeholder substitution ─────────────────────────────────────────────────
function substitute(template, vars) {
  return template
    .replace(/\{actor\}/g, vars.actor ?? "")
    .replace(/\{target\}/g, vars.target ?? "")
    .replace(/\{playerName\}/g, vars.playerName ?? "")
    .replace(/\{opponentName\}/g, vars.opponentName ?? "")
    .replace(/\{strike\}/g, vars.strike ?? "right hand")
    .replace(/\{sub\}/g, vars.sub ?? "rear naked choke")
    .replace(/\{position\}/g, vars.position ?? "against the fence")
    .replace(/\{bodyPart\}/g, vars.bodyPart ?? "body");
}

// ── renderEvent ──────────────────────────────────────────────────────────────
/**
 * @param {object} entry  - one eventLog entry from the breakdown payload
 * @param {object} ctx    - { playerName, opponentName, fightId, index }
 * @returns {{ text: string, styleClass: string }}
 */
export function renderEvent(entry, { playerName, opponentName, fightId, index }) {
  const actor = entry.actorIsPlayer ? playerName : opponentName;
  const target = entry.actorIsPlayer ? opponentName : playerName;

  const templates = EVENT[entry.templateKey];
  const seedStr = `${fightId}:${entry.round}:${index}`;
  const template = templates
    ? seededPick(templates, seedStr)
    : `${actor} makes a move.`;

  const text = substitute(template, {
    actor,
    target,
    playerName,
    opponentName,
    strike: entry.vars?.strike ?? "right hand",
    sub: entry.vars?.sub ?? "rear naked choke",
    position: entry.vars?.position ?? "against the fence",
    bodyPart: entry.vars?.bodyPart ?? "body",
  });

  // Style class resolution
  let styleClass = "neutral";

  if (entry.type === "camp") {
    styleClass = "camp";
  } else if (entry.type === "finish") {
    // covers ko_finish, submission_finish, tko_finish_strike, tko_finish_ground,
    // and legacy tko_finish
    styleClass = entry.actorIsPlayer ? "hl" : "danger";
  } else if (entry.templateKey === "tko_finish_strike" || entry.templateKey === "tko_finish_ground") {
    // explicit catch for the new split TKO keys regardless of the type field
    styleClass = entry.actorIsPlayer ? "hl" : "danger";
  } else if (entry.type === "knockdown") {
    styleClass = entry.actorIsPlayer ? "hl" : "danger";
  } else if (entry.templateKey === "strike_hurt") {
    styleClass = entry.actorIsPlayer ? "hl" : "danger";
  } else if (entry.type === "takedown" && entry.templateKey === "takedown_secured") {
    styleClass = entry.actorIsPlayer ? "hl" : "danger";
  } else if (entry.type === "ground" || entry.type === "submission") {
    // ground_control_carried (type "ground") follows same rule as ground_pound
    styleClass = entry.actorIsPlayer ? "hl" : "danger";
  }

  return { text, styleClass };
}

// ── renderIntro ──────────────────────────────────────────────────────────────
/**
 * @param {string} introTemplateKey
 * @param {object} ctx - { playerName, opponentName, fightId }
 * @returns {string}
 */
export function renderIntro(introTemplateKey, { playerName, opponentName, fightId }) {
  const key = introTemplateKey || "standard";
  const templates = INTRO[key] ?? INTRO.standard;
  const seedStr = `${fightId}:intro`;
  const template = seededPick(templates, seedStr);
  return substitute(template, { playerName, opponentName });
}

// ── renderResult ─────────────────────────────────────────────────────────────
/**
 * Selects the correct result template family using `youWon` (win/loss) and
 * `finishMethod` ("submission"|"ko"|"decision"|"draw") — both passed in
 * explicitly from the finish event's templateKey/method, NOT derived by
 * substring-matching the outcome string.
 *
 * @param {string|null} outcome          - raw outcome string (used only for draw detection when finishMethod absent)
 * @param {string}      resultContextKey - e.g. "standard", "nemesis", "giantKiller"
 * @param {object}      ctx
 *   youWon        {boolean}      — true = win, false = loss
 *   finishMethod  {string}       — "submission"|"ko"|"decision"|"draw"
 *   playerName    {string}
 *   opponentName  {string}
 *   sub           {string|null}  — from finish event vars
 *   strike        {string|null}  — from finish event vars
 *   fightId       {string}
 * @returns {string}
 */
export function renderResult(outcome, resultContextKey, {
  playerName,
  opponentName,
  sub,
  strike,
  fightId,
  youWon,
  finishMethod,
}) {
  // finishMethod is the authoritative source; fall back to outcome substring only
  // when finishMethod is absent (legacy callers)
  let method = finishMethod;
  if (!method) {
    const lc = (outcome ?? "").toLowerCase();
    if (lc.includes("draw")) {
      method = "draw";
    } else if (lc.includes("submission")) {
      method = "submission";
    } else if (lc.includes("ko") || lc.includes("tko") || lc.includes("knockout")) {
      method = "ko";
    } else {
      method = "decision";
    }
  }

  if (method === "draw") {
    return renderDraw({ playerName, opponentName, fightId });
  }

  const winLoss = youWon ? "win" : "loss";
  const resultKey = `${winLoss}_${method}`;
  const resultMap = RESULT[resultKey];
  if (!resultMap) {
    return `${playerName} ${winLoss === "win" ? "wins" : "loses"} by ${method}.`;
  }

  // giantKiller context is only valid for wins
  let ctxKey = resultContextKey || "standard";
  if (winLoss === "loss" && ctxKey === "giantKiller") ctxKey = "standard";
  const variants = resultMap[ctxKey] ?? resultMap.standard ?? [];

  const seedStr = `${fightId}:result`;
  const template = seededPick(variants, seedStr);

  return substitute(template, {
    playerName,
    opponentName,
    sub: sub ?? "rear naked choke",
    strike: strike ?? "right hand",
  });
}

function renderDraw({ playerName, opponentName, fightId }) {
  const variants = RESULT.draw?.standard ?? [];
  const seedStr = `${fightId}:result`;
  const template = seededPick(variants, seedStr);
  return substitute(template, { playerName, opponentName });
}

// ── renderRoundWinner ────────────────────────────────────────────────────────
/**
 * @param {"player"|"opponent"|"even"} roundWinner
 * @param {object} ctx - { playerName, opponentName, fightId, round, dominant }
 * @returns {{ label: string, category: string }}
 */
export function renderRoundWinner(roundWinner, { playerName, opponentName, fightId, round, dominant }) {
  let category;
  if (roundWinner === "player") {
    category = dominant ? "player_dominant" : "player_ahead";
  } else if (roundWinner === "opponent") {
    category = dominant ? "opponent_dominant" : "opponent_ahead";
  } else {
    category = "even";
  }

  const templates = ROUND_WINNER[category] ?? ROUND_WINNER.even;
  const seedStr = `${fightId}:rw:${round}`;
  const template = seededPick(templates, seedStr);
  const label = substitute(template, { playerName, opponentName });

  return { label, category };
}
