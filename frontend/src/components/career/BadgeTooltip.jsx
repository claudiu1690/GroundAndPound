import { t } from "@/lib/i18n";

/**
 * Hover tooltip for a badge (positioned above its tile via CSS .b-tip).
 * Shows: name, description, then an earned line ("✓ Earned · {context}"),
 * else a progress line ("{current} / {target} {unit}"), else conditionLabel.
 */
export function BadgeTooltip({ badge }) {
  const { name, description, earned, context, progress, conditionLabel } = badge;

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
      <div className="tt-n">{name}</div>
      {description && <div className="tt-d">{description}</div>}
      {footer}
    </div>
  );
}
