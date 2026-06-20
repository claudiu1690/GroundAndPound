import { useMemo } from "react";
import { Flame, Grab, Lock, Shield, Scale } from "lucide-react";
import { GAMEPLAN_META } from "./pvpConst";
import { t } from "../../lib/i18n";

/** Lucide icons for each gameplan key. */
export const GP_ICONS = {
  striking:   Flame,
  wrestling:  Grab,
  submission: Lock,
  counter:    Shield,
  balanced:   Scale,
};

/** Per-gameplan border / background / tag color tokens. */
export const gpColors = {
  striking:   { border: "#C8102E", bg: "rgba(200,16,46,0.05)",   tagBg: "rgba(200,16,46,0.1)",   tagColor: "#C8102E", tagBorder: "rgba(200,16,46,0.2)"  },
  wrestling:  { border: "#3B82F6", bg: "rgba(59,130,246,0.05)",  tagBg: "rgba(59,130,246,0.1)",  tagColor: "#3B82F6", tagBorder: "rgba(59,130,246,0.2)" },
  submission: { border: "#A855F7", bg: "rgba(168,85,247,0.05)",  tagBg: "rgba(168,85,247,0.1)",  tagColor: "#A855F7", tagBorder: "rgba(168,85,247,0.2)" },
  counter:    { border: "#3A9A4A", bg: "rgba(58,154,74,0.05)",   tagBg: "rgba(58,154,74,0.1)",   tagColor: "#4ADE80", tagBorder: "rgba(58,154,74,0.2)"  },
  balanced:   { border: "#3B82F6", bg: "rgba(59,130,246,0.05)",  tagBg: "rgba(59,130,246,0.1)",  tagColor: "#3B82F6", tagBorder: "rgba(59,130,246,0.2)" },
};

const GAMEPLAN_KEYS = ["striking", "wrestling", "submission", "counter", "balanced"];

/**
 * Computes which gameplan cluster best suits the given fighter's stats.
 * Clusters: striking = avg(str, spd, leg), wrestling = avg(wre, gnd),
 *           submission = avg(sub, gnd), counter = chn; balanced excluded.
 * Returns the best key, or null if stats are absent / all zero.
 */
export function computeSuitedGameplan(fighter) {
  if (!fighter) return null;
  const s = fighter;
  const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);
  const clusters = {
    striking:   (num(s.str) + num(s.spd) + num(s.leg)) / 3,
    wrestling:  (num(s.wre) + num(s.gnd)) / 2,
    submission: (num(s.sub) + num(s.gnd)) / 2,
    counter:    num(s.chn),
  };
  let best = null;
  let bestVal = 0;
  for (const [key, val] of Object.entries(clusters)) {
    if (val > bestVal) { bestVal = val; best = key; }
  }
  return bestVal > 0 ? best : null;
}

/**
 * GameplanPicker — shared card-grid picker used in PreFight and DefenseResults.
 *
 * Props:
 *   selected  {string}   — currently selected gameplan key
 *   onSelect  {function} — called with the chosen key when a card is clicked
 *   fighter   {object}   — fighter stats object; when present, shows "Suits your build" pill
 *   disabled  {boolean}  — disables all cards (e.g. while saving)
 */
export function GameplanPicker({ selected, onSelect, fighter, disabled }) {
  const suitedGameplan = useMemo(() => computeSuitedGameplan(fighter), [fighter]);

  return (
    <div className="pvp-gameplan-grid">
      {GAMEPLAN_KEYS.map((gp) => {
        const meta   = GAMEPLAN_META[gp];
        const sel    = selected === gp;
        const colors = gpColors[gp];
        const Icon   = GP_ICONS[gp];
        const suited = suitedGameplan === gp;
        return (
          <button
            key={gp}
            className={`pvp-gp-card${sel ? " pvp-gp-sel" : ""}`}
            style={sel ? { borderColor: colors.border, background: colors.bg } : {}}
            onClick={() => !disabled && onSelect(gp)}
            disabled={disabled}
          >
            <div className="pvp-gp-icon">
              <Icon size={20} strokeWidth={2} color={sel ? colors.border : "#777"} />
            </div>
            <div className="pvp-gp-name" style={sel ? { color: colors.border } : {}}>
              {meta.label}
            </div>
            <div className="pvp-gp-desc">{meta.desc}</div>
            <span
              className="pvp-gp-tag"
              style={{
                background:   colors.tagBg,
                color:        colors.tagColor,
                border:       `1px solid ${colors.tagBorder}`,
              }}
            >
              {meta.tag}
            </span>
            {suited && (
              <span className="pvp-gp-suited-pill">{t("pvp.gameplan.suitedPill")}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
