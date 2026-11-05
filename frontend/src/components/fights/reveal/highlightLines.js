/**
 * Fight reveal: short commentary for highlight cards (8 to 10 words), pure and i18n free so the
 * node test shim can load it. The full report keeps the long lines (breakdown/eventTemplates.js).
 *
 * Rule (spec §7.4): a line claims only what the logged event says. Move lines are written per
 * `vars.outcome`; when the outcome is not in the table the line falls back to the card's `default`
 * and then to the generic "{move} fires: {trigger}.", which names the card and its trigger only.
 *
 * Placeholders: {actor} {target} {move} {trigger} {area} {sub} {strike}.
 * Picks use the same djb2 seededPick as the report, seeded by `${fightId}:${round}:${index}:hl`.
 */

import { seededPick, moveNamesOf, moveTriggerOf } from "../breakdown/renderEvent.js";
import { WILDCARD_AREA } from "../breakdown/eventTemplates.js";

/**
 * Display mirror of the backend `move_fired` outcome vocabulary (utils/fightBreakdownView.js
 * EventLogEntry JSDoc). Same pattern as constants/specialMovesCatalog.js.
 */
export const MOVE_OUTCOMES = [
  "stuffed", "takedown_landed", "ground_pound", "absorbed", "escaped", "sub_attempt",
  "sub_finished", "tapped", "hurt", "landed", "knockdown", "finish",
];

/** Best outcome first. Used to pick the "What fired" sub line; null ranks last. */
export const OUTCOME_RANK = [
  "finish", "knockdown", "sub_finished", "stuffed", "tapped", "takedown_landed",
  "ground_pound", "hurt", "escaped", "absorbed", "sub_attempt", "landed",
];

/** Finish card sub line per best outcome ("Signature · the knockdown"). */
export const OUTCOME_WORDS = {
  finish: "the finish",
  knockdown: "the knockdown",
  sub_finished: "the submission",
  stuffed: "stuffed a takedown",
  tapped: "fired as you tapped",
  takedown_landed: "on a takedown",
  ground_pound: "ground strikes",
  hurt: "a hurt",
  escaped: "escaped a hold",
  absorbed: "soaked up damage",
  sub_attempt: "a submission attempt",
  landed: "a clean shot",
};

// Only ever shown for a round the judges scored even (see revealModel: a won round shows the
// winner's best logged exchange instead), so the lines must not claim either fighter led.
export const QUIET_LINES = [
  "An even round. Neither fighter pulls ahead.",
  "Back and forth. Nobody gets the better of it.",
  "Even on the cards. Both fighters trade and reset.",
];

const STRIKE_MOVE = {
  landed: ["The {move} lands. {target} feels that one.", "{move} fires and finds the target."],
  hurt: ["{target} is hurt. The {move} lands clean.", "The {move} lands and {target} wobbles."],
  knockdown: ["{target} is hurt. The {move} lands. Down!", "The {move} lands. {target} drops!"],
  finish: ["The {move} lands. {target} is out!", "The {move} lands and it is over!"],
};

const SUB_MOVE = {
  sub_attempt: ["The hold is locked in. {target} fights it off.", "{move} fires. {target} defends the hold."],
  sub_finished: ["The hold is locked in. {target} taps.", "{move} fires. {target} has to tap."],
};

const SOAK_MOVE = {
  absorbed: ["Flat on the back, still in charge. Nothing lands clean.", "{move} fires. The damage is soaked up."],
};

/** move_fired short lines: bonusType -> outcome | "default" -> variants. */
export const MOVE_LINES = {
  SPRAWL_SUCCESS: {
    stuffed: ["Hips back. Stuffed flat.", "{target} shoots. Nothing there. Sprawled."],
    takedown_landed: ["{move} fires, but {target} still drags it down."],
  },
  ESCAPE_PROBABILITY: {
    escaped: ["Caught, then gone. One hip escape and out.", "Locked in, then out. The escape works."],
    tapped: ["{move} fires. Not enough this time."],
  },
  GNP_DAMAGE: {
    takedown_landed: ["{move} fires. Down they go, shots coming."],
    ground_pound: ["{move}. Heavy shots from the top.", "Top position. The shots land heavy."],
    finish: ["Top position. The shots do not stop. It's over."],
  },
  SIG_TAKEDOWN_BLITZ: {
    takedown_landed: ["First takedown of the night. Planted hard."],
    ground_pound: ["First takedown of the night. Shots follow."],
    finish: ["First takedown of the night. The shots end it."],
  },
  SUBMISSION_SUCCESS: SUB_MOVE,
  SIG_SUBMISSION_HUNT: SUB_MOVE,
  STRIKE_DAMAGE: STRIKE_MOVE,
  SIG_FINISHER_STRIKE: STRIKE_MOVE,
  SIG_FAST_START: STRIKE_MOVE,
  CLINCH_DAMAGE: STRIKE_MOVE,
  STAMINA_DRAIN: {
    default: ["The tank should be empty. It isn't."],
  },
  FLASH_KO_RESISTANCE: {
    absorbed: ["Hurt, not gone. {actor} eats it and stays."],
  },
  GROUND_DAMAGE_REDUCTION: SOAK_MOVE,
  SIG_IRON_RECOVERY: SOAK_MOVE,
  SIG_KILLER_INSTINCT: {
    ground_pound: ["Forearm across the jaw. {target} stays flat."],
    finish: ["Forearm across the jaw. {target} stays flat."],
    escaped: ["Crossface set. {target} still squirms out."],
  },
};

const GENERIC_MOVE = ["{move} fires: {trigger}."];

/** Short lines by template key. `.you` / `.them` keys depend on who the actor is. */
export const LINES = {
  "knockdown.you": ["Clean shot. {target} is down on the canvas!", "{actor} lands big. {target} drops!"],
  "knockdown.them": ["{actor} lands big. {target} is down!", "A huge shot. {target} hits the canvas."],
  "takedown_secured.you": ["Double leg. {target} is planted on the mat.", "{actor} shoots in deep. Takedown."],
  "takedown_secured.them": ["{actor} shoots in. {target} is taken down.", "{actor} changes levels. {target} hits the mat."],
  "submission_attempt.you": ["{actor} sinks in the {sub}. {target} has to defend.", "The {sub} is on. {target} scrambles."],
  "submission_attempt.them": ["{actor} goes for the {sub}. Danger!", "{actor} locks up the {sub}. Defend it!"],
  "submission_finish.you": ["{actor} locks in the {sub}. {target} taps!", "No way out of the {sub}. {target} taps!"],
  "submission_finish.them": ["{actor} locks in the {sub}. {target} has to tap.", "The {sub} is too deep. The fight is over."],
  "ko_finish.you": ["{actor} lands the {strike}. {target} is out cold!", "The {strike} lands. {target} is out!"],
  "ko_finish.them": ["{actor} lands the {strike}. {target} is out.", "The {strike} lands. Lights out."],
  "tko_finish_strike.you": ["{actor} swarms. The referee waves it off!", "{target} cannot defend. The referee stops it!"],
  "tko_finish_strike.them": ["{actor} swarms. The referee steps in.", "{target} cannot defend. It is stopped."],
  "tko_finish_ground.you": ["{actor} pounds from the top. The referee stops it!", "Too many shots from the top. It is stopped!"],
  "tko_finish_ground.them": ["{actor} pounds from the top. The referee steps in.", "Too many shots from the top. It is stopped."],
  "strike_hurt.you": ["{actor} lands clean. {target} is hurt.", "A hard shot lands. {target} wobbles."],
  "strike_hurt.them": ["{actor} lands clean. {target} is hurt.", "A hard shot lands. {target} is shaken."],
  camp_takedown_defence_fired: ["{target} shoots. The takedown drilling shows.", "The sprawl work from camp is ready."],
  camp_submission_escape_fired: ["Caught in a hold. The camp escape work shows.", "The escape drills from camp pay off."],
  camp_gnp_fired: ["Solid posture. The ground strikes land harder.", "The posture work from camp shows on top."],
  camp_cardio_fired: ["{actor} still has gas. The cardio work shows.", "The pace is high. {actor} keeps moving."],
  camp_striking_accuracy_fired: ["Crisp and accurate. The striking work shows.", "The shots find the mark. Camp work paying off."],
  camp_clinch_fired: ["{actor} owns the clinch. Drilled in camp.", "Inside work from {actor}. The clinch drills pay off."],
  wildcard_fired: ["{actor} shows {area}. You were not ready for it.", "A habit the tape never showed: {area}."],
  // Routine logged exchanges (revealModel EXCHANGE_KEYS). Strike lines name the real strike from
  // vars.strike; the ".plain" variants are used when the log has no strike name.
  "ground_pound.you": ["{actor} drops shots from the top.", "Heavy hands from top. {target} covers up."],
  "ground_pound.them": ["{actor} drops shots from the top.", "{actor} pounds away. {target} covers up."],
  "ground_control_carried.you": ["{actor} stays heavy on top.", "Top control. {target} can't get up."],
  "ground_control_carried.them": ["{actor} stays heavy on top.", "Pinned underneath. {target} can't get up."],
  "strike_body.you": ["{actor} digs a {strike} to the body.", "{actor} goes to the body with a {strike}."],
  "strike_body.them": ["{actor} digs a {strike} to the body.", "{actor} goes to the body with a {strike}."],
  "strike_clean.you": ["{actor} lands a clean {strike}.", "{actor} sticks the {strike}.", "The {strike} from {actor} finds the mark."],
  "strike_clean.them": ["{actor} lands a clean {strike}.", "{actor} sticks the {strike}.", "The {strike} from {actor} finds the mark."],
  "strike_body.plain": ["{actor} digs to the body.", "Body work from {actor}."],
  "strike_clean.plain": ["{actor} lands clean.", "{actor} finds the range."],
  "takedown_stuffed.you": ["{actor} shoots. {target} stuffs it.", "{target} sprawls. {actor}'s shot goes nowhere."],
  "takedown_stuffed.them": ["{actor} shoots. {target} stuffs it.", "{target} sprawls. {actor}'s shot goes nowhere."],
};

/** Big word on a highlight card. Plain strings: the reveal cards are all caps by CSS. */
const SMALL = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function bigWord(event) {
  const key = event?.templateKey;
  const v = event?.vars || {};
  switch (key) {
    case "knockdown": return "Knockdown";
    case "takedown_secured": return "Takedown";
    case "submission_attempt": return v.sub ? SMALL(v.sub) : "Submission attempt";
    case "submission_finish": return v.sub ? SMALL(v.sub) : "Submission";
    case "ko_finish": return "Knockout";
    case "tko_finish_strike": return "Stoppage";
    case "tko_finish_ground": return "Ground stoppage";
    case "strike_hurt": return v.strike ? `Big ${v.strike}` : "Big strike";
    case "ground_pound": return "Ground and pound";
    case "ground_control_carried": return "Top control";
    case "strike_body": return v.strike ? SMALL(v.strike) : "Body work";
    case "strike_clean": return v.strike ? SMALL(v.strike) : "Clean shot";
    case "takedown_stuffed": return "Stuffed";
    default: return "";
  }
}

function fill(template, vars) {
  return template
    .replace(/\{actor\}/g, vars.actor ?? "")
    .replace(/\{target\}/g, vars.target ?? "")
    .replace(/\{move\}/g, vars.move ?? "")
    .replace(/\{trigger\}/g, vars.trigger ?? "")
    .replace(/\{area\}/g, vars.area ?? "")
    .replace(/\{sub\}/g, vars.sub ?? "submission")
    .replace(/\{strike\}/g, vars.strike ?? "right hand")
    // A card with no known trigger leaves a dangling colon; tidy it.
    .replace(/:\s*\./g, ".")
    .replace(/\s+\./g, ".");
}

/** Variant index 0..2 for a quiet round, stable per fight and round. */
export function quietVariant(fightId, round) {
  return seededPick([0, 1, 2], `${fightId}:quiet:${round}`);
}

export function quietLine(variant) {
  return QUIET_LINES[variant] ?? QUIET_LINES[0];
}

/**
 * @param {object} event  one eventLog entry
 * @param {{ playerName?: string, opponentName?: string, fightId?: string, eventIndex?: number, moves?: object[] }} [ctx]
 * @returns {string}
 */
export function shortLine(event, ctx = {}) {
  if (!event) return "";
  const { playerName = "You", opponentName = "Opponent", fightId = "fight", eventIndex = 0, moves } = ctx;
  const actor = event.actorIsPlayer ? playerName : opponentName;
  const target = event.actorIsPlayer ? opponentName : playerName;
  const seed = `${fightId}:${event.round}:${eventIndex}:hl`;
  const v = event.vars || {};
  let variants;

  if (event.templateKey === "move_fired") {
    const byType = MOVE_LINES[v.bonusType];
    variants = (v.outcome != null ? byType?.[v.outcome] : null) ?? byType?.default ?? GENERIC_MOVE;
  } else {
    const plain = (event.templateKey === "strike_clean" || event.templateKey === "strike_body") && !v.strike;
    variants = (plain ? LINES[`${event.templateKey}.plain`] : null)
      ?? LINES[`${event.templateKey}.${event.actorIsPlayer ? "you" : "them"}`] ?? LINES[event.templateKey];
  }
  if (!variants) return "";

  return fill(seededPick(variants, seed), {
    actor,
    target,
    move: event.templateKey === "move_fired" ? moveNamesOf(event, moves) : "",
    trigger: event.templateKey === "move_fired" ? moveTriggerOf(event, moves) : "",
    area: WILDCARD_AREA[v.stat] ?? "something new",
    sub: v.sub || undefined,
    strike: v.strike || undefined,
  });
}
