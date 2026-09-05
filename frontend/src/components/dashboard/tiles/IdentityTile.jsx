import { t } from "@/lib/i18n";
import { HomeTile } from "./HomeTile";

/**
 * Identity / fighter-card tile. Renders synchronously from the `fighter` prop
 * (never skeletons — home-contract.md §9). No portrait: the owner ruled those
 * out, so identity is an initials monogram, same treatment as everywhere else
 * in the game that has no art budget for a face.
 */
export function IdentityTile({ fighter, onOpenCareerProfile, index }) {
  const firstName = fighter?.firstName ?? "";
  const lastName = fighter?.lastName ?? "";
  const nickname = fighter?.nickname ?? null;
  const ovr = fighter?.overallRating ?? "n/a";
  const tier = fighter?.promotionTier ?? "Amateur";
  const rec = fighter?.record ?? {};
  const wins = rec.wins ?? 0;
  const losses = rec.losses ?? 0;
  const draws = rec.draws ?? 0;
  const fameTierLabel = fighter?.notoriety?.tierLabel ?? "n/a";
  const weightClass = fighter?.weightClass ?? "";
  const style = fighter?.style ?? "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "??";

  return (
    <HomeTile
      tone="quiet"
      span={3}
      index={index}
      className="hn-id"
      dataTut="dashboard-identity"
      head={
        <>
          <span>{t("home.id.title")}</span>
          <span>{t("home.id.tapProfile")}</span>
        </>
      }
      link={{ label: t("home.id.cta"), onClick: onOpenCareerProfile }}
    >
      <div className="hn-id-top">
        <span className="hn-id-mono" aria-hidden="true">{initials}</span>
        <span className="hn-id-name">
          <b>{firstName} {lastName}</b>
          {nickname ? <i>"{nickname}"</i> : null}
        </span>
        <span className="hn-id-ovr">
          {ovr}
          <small>{t("home.id.ovrLabel")}</small>
        </span>
      </div>
      <div className="hn-id-list">
        <span><small>{t("home.id.tier")}</small>{tier}</span>
        <span><small>{t("home.id.fame")}</small>{fameTierLabel}</span>
        <span><small>{t("home.id.record")}</small>{wins} W {losses} L{draws ? ` ${draws} D` : ""}</span>
        <span><small>{t("home.id.class")}</small>{weightClass} {style}</span>
      </div>
    </HomeTile>
  );
}
