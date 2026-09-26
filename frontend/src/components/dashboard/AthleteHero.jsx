import { t } from "@/lib/i18n";
import { PIECES_BY_ID, DEFAULT_BANNER, bannerRowBackground, bannerAccentColor } from "../banner/bannerCatalog";
import { fighterStreak } from "./homeModel";

/** "DK" from Dan Kovac, the monogram shown on the identity tile. */
function initialsFor(fighter) {
  const f = (fighter?.firstName || "").trim().charAt(0);
  const l = (fighter?.lastName || "").trim().charAt(0);
  const initials = `${f}${l}`.toUpperCase();
  return initials || "??";
}

function streakLabel(streak) {
  if (streak.key === "win") return t("home.athlete.streakWin", { n: streak.n });
  if (streak.key === "loss") return t("home.athlete.streakLoss", { n: streak.n });
  return t("home.athlete.streakNone");
}

/**
 * Athlete Page hero, identity block (decision #8: initials monogram on the
 * fighter's banner background, no BannerPreview) plus whatever the caller
 * renders as `children` (NextFightCard, in the c-hero grid's second column).
 */
export function AthleteHero({ fighter, ranking, loading, onOpenCareerProfile, dataTut, children }) {
  const firstName = fighter?.firstName ?? "";
  const lastName = fighter?.lastName ?? "";
  const nickname = fighter?.nickname ?? null;
  const tier = fighter?.promotionTier ?? "Amateur";
  const style = fighter?.style ?? "";
  const weightClass = fighter?.weightClass ?? "";
  const rec = fighter?.record ?? {};
  const recordText = `${rec.wins ?? 0}-${rec.losses ?? 0}-${rec.draws ?? 0}`;
  const ovr = fighter?.overallRating ?? "n/a";
  const streak = fighterStreak(fighter);

  // The identity block IS the fighter's banner: their chosen composition under a
  // light directional veil (same helper the ranking rows use), their texture, and
  // their accent on the nickname and the hero glow. The monogram sits on the raw
  // composition so it reads as the "portrait" corner of the same plate.
  const banner = fighter?.banner ?? DEFAULT_BANNER;
  const bgPiece = PIECES_BY_ID[banner.backgroundId] || PIECES_BY_ID[DEFAULT_BANNER.backgroundId];
  const accent = bannerAccentColor(banner) || bannerAccentColor(DEFAULT_BANNER) || "#ef4444";
  const idStyle = { background: bannerRowBackground(banner, { veil: "self" }), "--ap-accent": accent };
  const heroStyle = { "--ap-glow": `${accent}3d` };
  const monoStyle = bgPiece?.css ? { backgroundImage: bgPiece.css } : undefined;
  const texture = bgPiece?.texture ? `ap-id-tex ap-id-tex--${bgPiece.texture}` : null;

  const rankLoading = loading && ranking == null;
  const rankValue = ranking?.rank != null ? `#${ranking.rank}` : t("home.athlete.unranked");

  return (
    <header className="ap-hero" data-tut={dataTut} style={heroStyle}>
      <div className="ap-id" data-tut="dashboard-identity" style={idStyle}>
        {texture ? <i className={texture} aria-hidden="true" /> : null}
        <div className="ap-mono" style={monoStyle} aria-hidden="true">
          <span>{initialsFor(fighter)}</span>
        </div>
        <div className="ap-id-txt">
          {nickname ? <div className="ap-nick">&quot;{nickname}&quot;</div> : null}
          <div className="ap-name">{firstName} <small>{lastName}</small></div>
          <div className="ap-div">{t("home.athlete.division", { weightClass, tier, style })}</div>
          <div className="ap-rec">
            <div><b>{recordText}</b><span>{t("home.athlete.record")}</span></div>
            <div className="rank">
              {rankLoading ? <b className="ap-skel-txt">&nbsp;</b> : <b>{rankValue}</b>}
              <span>{t("home.athlete.rank")}</span>
            </div>
            <div><b>{ovr}</b><span>{t("home.athlete.ovr")}</span></div>
            <div><b>{streakLabel(streak)}</b><span>{t("home.athlete.streak")}</span></div>
          </div>
          <button type="button" className="ap-id-link" onClick={onOpenCareerProfile}>
            {t("home.athlete.careerLink")}
          </button>
        </div>
      </div>
      {children}
    </header>
  );
}
