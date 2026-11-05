import { memo } from "react";
import { t } from "@/lib/i18n";
import { RARITY_COLORS, TRIGGER_WORDS } from "../../../constants/specialMovesCatalog";
import { ArtThumb } from "./ArtThumb.jsx";
import { OUTCOME_WORDS } from "../reveal/highlightLines.js";
import { bestOutcomeOf } from "../reveal/revealModel.js";
import { moveReadiness } from "../moveReadiness.js";
import "./yourCorner.css";

const TYPE_KEY = { SIGNATURE: "typeSignature", PROC: "typeProc", PASSIVE: "typePassive" };

function typeLabel(effectType) {
  const key = TYPE_KEY[effectType];
  return key ? t(`fights.yourCorner.${key}`) : "";
}

/**
 * The rows of "what fired": one per equipped move (art, name, type, best outcome, count) and one
 * per booked camp session. Shared by the replay's finish card and the report's "Your corner" block,
 * so both always show the same numbers (they come from the same persisted `loadout`).
 *
 * `bestOutcomes` is optional ({ [moveId]: outcome | null }); rows may also carry `bestOutcome`.
 */
/** The report's ready line and "didn't fire" reason for one move, from moveReadiness(). */
function ReadinessLines({ rd }) {
  if (!rd) return null;
  const lines = [];
  if (rd.line) lines.push(t(`fights.yourCorner.ready.${rd.line.key}`, rd.line.vars));
  if (rd.reason) lines.push(t(`fights.yourCorner.why.${rd.reason.key}`, rd.reason.vars));
  if (!lines.length) return null;
  return lines.map((text, i) => <span key={i} className={`yc-why${i === 0 && rd.line ? " is-ready" : ""}`}>{text}</span>);
}

export function FiredRows({ moves = [], camp = [], bestOutcomes = null, readiness = null }) {
  return (
    <div className="yc-rows">
      {moves.map((m) => {
        const passive = m.effectType === "PASSIVE";
        const n = m.firedCount || 0;
        const best = m.bestOutcome ?? bestOutcomes?.[m.moveId] ?? null;
        const sub = passive
          ? `${typeLabel(m.effectType)} · ${t("fights.yourCorner.alwaysOn")}`
          : n > 0
            ? `${typeLabel(m.effectType)} · ${best && OUTCOME_WORDS[best] ? OUTCOME_WORDS[best] : t("fights.yourCorner.fired")}`
            : `${typeLabel(m.effectType)} · ${TRIGGER_WORDS[m.triggerCondition] ?? ""}`.replace(/ · $/, "");
        const on = n > 0 || (passive && m.triggered);
        return (
          <div
            key={m.moveId}
            className={`yc-row${on ? "" : " is-off"}`}
            style={{ "--rarity-color": RARITY_COLORS[m.rarity] || RARITY_COLORS.COMMON }}
            data-kind="move"
          >
            <ArtThumb art={m.art} name={m.name} className="yc-thumb" />
            <span className="yc-main">
              <b className="yc-name">{m.name}</b>
              <span className="yc-sub">{sub}</span>
              <ReadinessLines rd={readiness?.[m.moveId]} />
            </span>
            <span className="yc-state">{n > 0 ? t("fights.yourCorner.times", { n }) : t("fights.yourCorner.didntFire")}</span>
          </div>
        );
      })}
      {camp.map((c) => (
        <div key={c.sessionType} className={`yc-row${c.triggered ? "" : " is-off"}`} data-kind="camp">
          <span className="yc-dot" aria-hidden="true">C</span>
          <span className="yc-main">
            <b className="yc-name">{c.label}</b>
            <span className="yc-sub">{t("fights.yourCorner.campSession")}</span>
          </span>
          <span className="yc-state">{c.triggered ? t("fights.yourCorner.paidOff") : t("fights.yourCorner.didntFire")}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * "Your corner" block of the full fight report. Hidden when the fight has no loadout snapshot
 * (older fights, PvP). Counts are the engine's per-move trigger counts and camp triggered flags.
 */
export const YourCorner = memo(function YourCorner({ loadout, eventLog, view = null }) {
  if (!loadout) return null;
  // Ready lines and reasons come from the same saved numbers the replay used (one shared helper).
  const readiness = view ? moveReadiness(view) : null;
  const moves = Array.isArray(loadout.moves) ? loadout.moves : [];
  const camp = Array.isArray(loadout.camp) ? loadout.camp : [];
  const log = Array.isArray(eventLog) ? eventLog : [];
  const bestOutcomes = Object.fromEntries(moves.map((m) => [m.moveId, bestOutcomeOf(m.moveId, log)]));
  return (
    <section className="your-corner" data-testid="your-corner" aria-label={t("fights.yourCorner.title")}>
      <div className="yc-head">{t("fights.yourCorner.title")}</div>
      {moves.length === 0 && camp.length === 0 ? (
        <div className="yc-empty">{t("fights.yourCorner.empty")}</div>
      ) : (
        <FiredRows moves={moves} camp={camp} bestOutcomes={bestOutcomes} readiness={readiness} />
      )}
    </section>
  );
});

export default YourCorner;
