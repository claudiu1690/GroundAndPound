import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/** Stats & XP tile — renders synchronously from fighter.statProgress. */
export function StatsTile({ statRows, ovr, onNavigate, index }) {
  if (!statRows?.length) return null;
  return (
    <HomeTile
      tone="plain"
      span={8}
      index={index}
      className="hn-stats"
      head={<span>{t("home.stats.title")}</span>}
      link={{ label: t("home.stats.cta"), onClick: onNavigate }}
    >
      <div className="hn-stats-grid">
        {statRows.map((r) => (
          <div className="hn-stat" key={r.name} title={r.xpLine ? `${r.tooltip}. ${r.xpLine}` : r.tooltip}>
            <b>{r.name}</b>
            <span className={`hn-bar ${r.pct >= 90 ? "" : "is-blue"}`} style={{ "--w": `${Math.max(0, Math.min(100, r.pct))}%` }}><i /></span>
            <em>{r.value}</em>
          </div>
        ))}
      </div>
      <div className="hn-stats-foot">
        <b>{t("home.stats.ovrLabel", { ovr })}</b>
        <span className="hn-bar" style={{ "--w": `${Math.max(0, Math.min(100, ovr))}%` }}><i /></span>
      </div>
    </HomeTile>
  );
}
