import { t } from "@/lib/i18n";
import { titleShotProgress } from "./homeModel";

/**
 * Title-shot progress strip, the thin red bar above the hero. Hidden until
 * `ranking` resolves (no flicker on load); ranking is otherwise always
 * present once the dashboard payload lands.
 */
export function TitleShotStrip({ ranking, onNavigate }) {
  if (!ranking) return null;
  const { done, total, nextLabel } = titleShotProgress(ranking);

  return (
    <button type="button" className="ap-strip ap-anim" onClick={() => onNavigate?.("rankings")}>
      <span className="ap-strip-label">{t("home.strip.label")}</span>
      <span>{nextLabel != null ? t("home.strip.locked", { n: nextLabel }) : t("home.strip.progress", { done, total })}</span>
      <span className="ap-strip-count">{t("home.strip.progress", { done, total })}</span>
      <span className="ap-strip-pips" aria-label={t("home.strip.progress", { done, total })}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < done ? "on" : ""} />
        ))}
      </span>
    </button>
  );
}
