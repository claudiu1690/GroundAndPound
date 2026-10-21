import { t } from "@/lib/i18n";
import { titleShotStep } from "./homeModel";

/** Copy for the first unmet step; "One" variants are used when n is 1. */
function stepText({ key, n, rank, gcs, champion }) {
  switch (key) {
    case "getRanked":
      return n === 1 ? t("home.strip.getRankedOne") : t("home.strip.getRanked", { n });
    case "reachTop5":
      return rank != null ? t("home.strip.reachTop5", { n, rank }) : t("home.strip.reachTop5NoRank", { n });
    case "winTop5":
      if (champion) return n === 1 ? t("home.strip.winTop5ChampionOne") : t("home.strip.winTop5Champion", { n });
      return n === 1 ? t("home.strip.winTop5One") : t("home.strip.winTop5", { n });
    case "rematch":
      return n === 1 ? t("home.strip.rematchOne") : t("home.strip.rematch", { n });
    case "reachOvr":
      return t("home.strip.reachOvr", { n });
    case "autoPromote":
      return t("home.strip.autoPromote", { n });
    case "autoPromoteNextFight":
      return t("home.strip.autoPromoteNextFight");
    case "lockInOvr":
      return t("home.strip.lockInOvr");
    case "ready":
      return gcs ? t("home.strip.readyGcs") : t("home.strip.ready");
    default:
      return null;
  }
}

/**
 * Title-shot progress strip, the thin red bar above the hero. Hidden until
 * `ranking` resolves (no flicker on load); ranking is otherwise always
 * present once the dashboard payload lands. Shows the first unmet step, not
 * a fixed message. No requirement counter or pips: the sentence is the whole
 * message, and the Rankings tile lists the three requirements.
 */
export function TitleShotStrip({ ranking, onNavigate }) {
  if (!ranking) return null;
  const step = titleShotStep(ranking);
  if (step.key === "hidden") return null;
  const text = stepText(step);
  // An unknown key (newer API than this client) has no copy: hide rather than show an empty bar.
  if (!text) return null;

  return (
    <button type="button" className="ap-strip ap-anim" onClick={() => onNavigate?.("rankings")}>
      <span className="ap-strip-label">{step.gcs ? t("home.strip.labelGcs") : t("home.strip.label")}</span>
      <span>{text}</span>
    </button>
  );
}
