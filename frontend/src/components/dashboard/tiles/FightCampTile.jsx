import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/**
 * Fight camp tile — the camp for an ACCEPTED bout (data.camp). Distinct from
 * MyCampTile, which is the persistent head-coach camp (data.homeCamp);
 * buildCamp (backend) stays the fight camp only, untouched by this rewrite.
 */
export function FightCampTile({ camp, loading, onNavigate, index }) {
  if (loading && !camp) {
    return (
      <HomeTile tone="plain" span={4} index={index} className="hn-fc hn-skel" head={<span>{t("home.fightCamp.title")}</span>}>
        <div style={{ height: 72 }} />
      </HomeTile>
    );
  }
  if (!camp) {
    return (
      <HomeTile tone="plain" span={4} index={index} className="hn-camp" head={<span>{t("home.fightCamp.title")}</span>}>
        <p>{t("home.empty.fightCamp")}</p>
      </HomeTile>
    );
  }

  return (
    <HomeTile
      tone="plain"
      span={4}
      index={index}
      className="hn-camp"
      head={
        <>
          <span>{t("home.fightCamp.title")}</span>
          {camp.isTitleFight ? <span className="hn-badge is-warn">{t("home.fightCamp.titleFightBadge")}</span> : null}
        </>
      }
      link={{ label: t("home.fightCamp.cta"), onClick: () => onNavigate?.("fights"), gold: true }}
    >
      <h3>{t("home.fightCamp.sessions", { used: camp.slotsUsed ?? 0, max: camp.maxSlots ?? 0 })}</h3>
      <div className="hn-camp-row">
        {camp.previewGrade ? (
          <span className="hn-grade">
            {camp.previewGrade}
            <small>{t("home.fightCamp.gradeLabel")}</small>
          </span>
        ) : null}
        <span className="hn-pips" aria-label={`${camp.slotsUsed ?? 0} of ${camp.maxSlots ?? 0}`}>
          {Array.from({ length: camp.maxSlots ?? 0 }, (_, i) => (
            <i key={i} className={i < (camp.slotsUsed ?? 0) ? "on" : ""} />
          ))}
        </span>
      </div>
      <p>
        {camp.finalised ? t("home.fightCamp.finalised") : t("home.fightCamp.slotsLeft", { n: (camp.maxSlots ?? 0) - (camp.slotsUsed ?? 0) })}
      </p>
    </HomeTile>
  );
}
