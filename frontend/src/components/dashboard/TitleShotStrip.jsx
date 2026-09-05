import { t } from "@/lib/i18n";
import { titleShotProgress } from "./homeModel";

/**
 * Title-shot progress strip — the thin red bar above the hero. Hidden until
 * `ranking` resolves (no flicker on load); ranking is otherwise always
 * present once the dashboard payload lands.
 */
export function TitleShotStrip({ ranking, onNavigate }) {
  if (!ranking) return null;
  const { done, total, nextLabel } = titleShotProgress(ranking);

  return (
    <button type="button" className="hn-strip hn-anim" onClick={() => onNavigate?.("rankings")}>
      <span className="hn-strip-label">{t("home.strip.label")}</span>
      <span>{nextLabel != null ? t("home.strip.locked", { n: nextLabel }) : t("home.strip.progress", { done, total })}</span>
      <span className="hn-strip-count">{t("home.strip.progress", { done, total })}</span>
      <span className="hn-pips" aria-label={t("home.strip.progress", { done, total })}>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < done ? "on" : ""} />
        ))}
      </span>
    </button>
  );
}
