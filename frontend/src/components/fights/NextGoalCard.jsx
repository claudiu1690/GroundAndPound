import { memo } from "react";
import { t } from "@/lib/i18n";
import "./debut.css";

/**
 * The nearest unfinished goal, shown on the result screen under the hero tiles.
 * Renders `summary.nextGoal` (see services/nextGoalService.js on the server) and hides itself when
 * the field is missing or malformed, e.g. a result restored from an older payload.
 *
 *   key: "rank" | "pvp_unlock" | "top5" | "title" | "tier" | "top"; titleTier names the title chased
 *   secondary: { key: "pvp_unlock", current, target } | null
 */
export const NextGoalCard = memo(function NextGoalCard({ nextGoal }) {
  if (!nextGoal || typeof nextGoal.key !== "string") return null;

  const { key, current, target, rank, tier, threshold, titleTier, secondary } = nextGoal;
  const hasProgress = Number.isFinite(current) && Number.isFinite(target) && target > 0;

  let line = null;
  let progress = hasProgress ? current / target : null;
  switch (key) {
    case "rank":
      line = hasProgress ? t("fights.summary.nextGoal.rank", { n: current, target }) : null;
      break;
    case "pvp_unlock":
      line = hasProgress ? t("fights.summary.nextGoal.pvp_unlock", { n: current, target }) : null;
      break;
    case "top5":
      line = titleTier
        ? t("fights.summary.nextGoal.top5Title", { titleTier })
        : t("fights.summary.nextGoal.top5");
      progress = null;
      break;
    case "title":
      line = hasProgress
        ? (titleTier
          ? t("fights.summary.nextGoal.title_shotTier", { titleTier, n: current, target })
          : t("fights.summary.nextGoal.title_shot", { n: current, target }))
        : null;
      break;
    case "tier":
      // The next tier is won by beating this tier's champion; OVR is only the first gate, so the
      // goal names the title (owner, 2026-11-04). Older payloads without titleTier keep the old line.
      line = tier && Number.isFinite(threshold)
        ? (titleTier
          ? t("fights.summary.nextGoal.tierTitle", { titleTier, threshold })
          : t("fights.summary.nextGoal.tier", { tier, threshold }))
        : null;
      break;
    case "top":
      line = t("fights.summary.nextGoal.top");
      progress = null;
      break;
    default:
      return null;
  }
  if (!line) return null;

  const sub = key === "top5" && Number.isFinite(rank)
    ? t("fights.summary.nextGoal.top5Rank", { rank })
    : key === "tier" && Number.isFinite(current)
      ? (titleTier
        ? t("fights.summary.nextGoal.tierTitleNow", { ovr: current, tier })
        : t("fights.summary.nextGoal.tierNow", { ovr: current }))
      : null;

  const showSecondary = secondary && secondary.key === "pvp_unlock"
    && Number.isFinite(secondary.current) && Number.isFinite(secondary.target);

  return (
    <div className="next-goal">
      <div className="next-goal-eyebrow">{t("fights.summary.nextGoal.title")}</div>
      <div className="next-goal-line">{line}</div>
      {sub && <div className="next-goal-secondary">{sub}</div>}
      {progress != null && (
        <div className="next-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, progress) * 100)}>
          <div className="next-goal-bar-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
        </div>
      )}
      {showSecondary && (
        <div className="next-goal-secondary">
          {t("fights.summary.nextGoal.secondary", { n: secondary.current, target: secondary.target })}
        </div>
      )}
    </div>
  );
});

export default NextGoalCard;
