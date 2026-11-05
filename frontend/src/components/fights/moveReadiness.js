/**
 * Special move readiness ("the ready glow", docs/move-ready-glow-spec.md). Pure, no React or i18n.
 *
 * For each equipped move whose trigger is a state the saved fight shows exactly, works out the
 * rounds where the engine's gate was open, from the same numbers the engine read:
 *   - health and stamina gates are read at ROUND START, before that round's stamina drain, so
 *     round n uses what the fighters ended round n-1 with (`rounds[].health` / `rounds[].stamina`),
 *     or `healthStart` / `staminaStart` for round 1;
 *   - LATE_ROUNDS is the back half of the SCHEDULED fight (`scheduledRounds`, 5 when absent);
 *   - ROUND_ONE is round 1.
 * Reactive triggers (the move fires on the event itself) and position triggers are not covered.
 *
 * Shared by the replay (revealModel), the replay's finish card and the report's Your corner block,
 * so every view tells the same story.
 *
 * Input: the viewer-relative breakdown view (index 0 = the player).
 * Output: { [moveId]: Readiness } for covered moves only, where Readiness =
 *   { trigger, oneShot, openRounds: number[], firstReadyRound: number|null, value: number|null,
 *     who: "you"|"he"|null, firedRounds: number[], fired: boolean, line: { key, vars } | null,
 *     reason: { key, vars } | null }
 *   line   = the ready line (first time it opened), keyed for i18n
 *   reason = why it did not fire, only when it did not (null when the data cannot say)
 */

const DEFAULT_SCHEDULED = 5;

/** trigger -> how its gate works. who: 0 = player, 1 = opponent. */
export const READY_TRIGGERS = {
  OPPONENT_HEALTH_BELOW_75: { kind: "health", who: 1, below: 75, oneShot: true, notFired: "readyNoExchange" },
  OPPONENT_HEALTH_BELOW_50: { kind: "health", who: 1, below: 50, oneShot: false, notFired: "readyNoTop" },
  PLAYER_HEALTH_BELOW_75: { kind: "health", who: 0, below: 75, oneShot: false, notFired: "readyNoHit" },
  PLAYER_STAMINA_BELOW_70: { kind: "stamina", who: 0, below: 70, oneShot: false, notFired: null },
  OPPONENT_STAMINA_BELOW_70: { kind: "stamina", who: 1, below: 70, oneShot: false, notFired: "readyNoExchange" },
  LATE_ROUNDS: { kind: "late", oneShot: false, notFired: "readyNoExchange" },
  ROUND_ONE: { kind: "roundOne", oneShot: true, notFired: "readyNoExchangeR1" },
};

function pairOf(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const a = Number(v[0]);
  const b = Number(v[1]);
  if (v[0] == null || v[1] == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

/** [player, opponent] values entering each fought round, keyed by round number, or null. */
function startValues(view, field, startField) {
  const rounds = [...(view?.rounds ?? [])].sort((a, b) => a.round - b.round);
  const out = {};
  let prev = pairOf(view?.[startField]);
  for (const r of rounds) {
    out[r.round] = prev;
    prev = pairOf(r[field]);
  }
  return out;
}

export function moveReadiness(view) {
  const moves = Array.isArray(view?.loadout?.moves) ? view.loadout.moves : [];
  if (!moves.length) return {};
  const rounds = [...(view?.rounds ?? [])].map((r) => r.round).sort((a, b) => a - b);
  if (!rounds.length) return {};
  const lastRound = rounds[rounds.length - 1];
  const scheduled = Number.isInteger(view?.scheduledRounds) && view.scheduledRounds > 0 ? view.scheduledRounds : DEFAULT_SCHEDULED;
  const health = startValues(view, "health", "healthStart");
  const stamina = startValues(view, "stamina", "staminaStart");
  const log = Array.isArray(view?.eventLog) ? view.eventLog : [];

  const out = {};
  for (const m of moves) {
    const cfg = READY_TRIGGERS[m.triggerCondition];
    if (!cfg || m.effectType === "PASSIVE") continue;

    const firedRounds = [...new Set(log
      .filter((e) => e.templateKey === "move_fired" && Array.isArray(e.vars?.moveIds) && e.vars.moveIds.includes(m.moveId))
      .map((e) => e.round))].sort((a, b) => a - b);
    const fired = (m.firedCount || 0) > 0 || firedRounds.length > 0;

    let open = [];
    let value = null;
    let known = true;
    if (cfg.kind === "health" || cfg.kind === "stamina") {
      const table = cfg.kind === "health" ? health : stamina;
      for (const n of rounds) {
        const pair = table[n];
        if (!pair) { known = false; break; }
        if (pair[cfg.who] < cfg.below) {
          if (value == null) value = Math.round(pair[cfg.who]);
          open.push(n);
        }
      }
      if (!known) open = [];
    } else if (cfg.kind === "late") {
      open = rounds.filter((n) => n > Math.ceil(scheduled / 2));
    } else if (cfg.kind === "roundOne") {
      open = rounds.includes(1) ? [1] : [];
    }

    // A one-shot closes once it fires; it stays open from the first ready round until then.
    if (cfg.oneShot && open.length) {
      const firstFire = firedRounds.find((n) => n >= open[0]);
      if (firstFire != null) open = open.filter((n) => n <= firstFire);
    }

    const firstReadyRound = open.length ? open[0] : null;
    const who = cfg.who === 0 ? "you" : cfg.who === 1 ? "he" : null;

    let line = null;
    if (firstReadyRound != null) {
      if (cfg.kind === "late") line = { key: "late", vars: { name: m.name, n: firstReadyRound } };
      else if (cfg.kind === "roundOne") line = { key: "roundOne", vars: { name: m.name, n: 1 } };
      else line = { key: `${cfg.kind}_${who}`, vars: { name: m.name, n: firstReadyRound, value } };
    }

    let reason = null;
    if (!fired && known) {
      if (firstReadyRound == null) {
        if (cfg.kind === "late") reason = { key: "neverLate", vars: { n: lastRound } };
        else if (cfg.kind === "health" || cfg.kind === "stamina") reason = { key: `never_${cfg.kind}_${who}`, vars: { threshold: cfg.below } };
      } else if (cfg.notFired) {
        reason = { key: cfg.notFired, vars: { n: firstReadyRound } };
      }
    }

    out[m.moveId] = {
      trigger: m.triggerCondition,
      oneShot: cfg.oneShot,
      openRounds: open,
      firstReadyRound,
      value,
      who,
      firedRounds,
      fired,
      line,
      reason,
    };
  }
  return out;
}
