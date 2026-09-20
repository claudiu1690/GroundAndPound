import { t } from "@/lib/i18n";

/**
 * Hover tooltip for a badge (positioned above its tile via CSS .b-tip).
 * Shows: name, description, then an earned line ("✓ Earned · {context}"),
 * else a progress line ("{current} / {target} {unit}"), else conditionLabel.
 */
export function BadgeTooltip({ badge }) {
  const { name, description, earned, context, progress, conditionLabel, legacy } = badge;

  let footer = null;
  if (earned) {
    footer = (
      <div className="tt-e">{t("career.badges.tooltipEarned")}{context ? ` · ${context}` : ""}</div>
    );
  } else if (progress && progress.target != null) {
    const unit = progress.unit ? ` ${progress.unit}` : "";
    footer = <div className="tt-l">{progress.current} / {progress.target}{unit}</div>;
  } else if (conditionLabel) {
    footer = <div className="tt-l">{conditionLabel}</div>;
  }

  return (
    <div className="b-tip" role="tooltip">
      <div className="tt-n">
        {name}
        {/* An earned badge whose route no longer exists. The server only sends a legacy badge
            once it is earned (retired-and-unearned ones are filtered out), so this chip always
            means "you have this and it can no longer be obtained" — worth saying, because the
            description still names a gym the player can no longer visit. */}
        {legacy && <span className="tt-retired">{t("career.badges.retired")}</span>}
      </div>
      {description && <div className="tt-d">{description}</div>}
      {footer}
    </div>
  );
}
