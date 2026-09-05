import { t } from "@/lib/i18n";
import { BannerPreview } from "../banner/BannerPreview";
import { heroCopy, rivalFighter, formatPurse, RIVAL_BANNER } from "./homeModel";

/**
 * Fight Night hero — the main-event banner. The CTA always comes from the
 * server's `heroAction` (every branch of computeHeroAction already returns a
 * label/sublabel), never invented client-side copy. `heroBout` only decides
 * whether a rival plate + VS + stakes render alongside it (home-contract.md §5,
 * §9): no heroBout means no rival plate, no VS, just your plate and the CTA.
 */
export function FightNightHero({ fighter, heroAction, heroBout, offers, loading, onNavigate, dataTut }) {
  if (loading) {
    return (
      <header className="hn-hero hn-skel" data-tut={dataTut} style={{ minHeight: 320, borderRadius: 10 }} />
    );
  }

  const copy = heroCopy(heroAction, heroBout, offers);
  const rival = heroBout ? rivalFighter(heroBout) : null;

  return (
    <header className="hn-hero" data-tut={dataTut}>
      <div className="hn-hero-bg" />
      <div className="hn-sweep" />
      <div className="hn-hero-inner">
        <div className="hn-eyebrow hn-hero-eyebrow hn-anim">{t("home.hero.eyebrow")}</div>

        <div className={`hn-bout hn-anim${copy.hasBout ? "" : " hn-bout--solo"}`}>
          <div className="hn-fighter hn-fighter--me hn-anim">
            <BannerPreview fighter={fighter} size="full" />
            <span className="hn-role">{t("home.hero.roleYou")}</span>
          </div>

          {copy.hasBout ? (
            <>
              <div className="hn-vs hn-anim">
                {t("home.hero.vs")}
                {copy.boutWeightClass ? (
                  <small>
                    {copy.boutRounds != null
                      ? t("home.hero.bout", { weightClass: copy.boutWeightClass, rounds: copy.boutRounds })
                      : copy.boutWeightClass}
                  </small>
                ) : null}
              </div>
              <div className="hn-fighter hn-fighter--rival hn-anim">
                <BannerPreview fighter={rival} banner={RIVAL_BANNER} size="full" />
                <span className="hn-role">{t(`home.hero.${copy.rivalRoleKey}`)}</span>
              </div>
            </>
          ) : null}
        </div>

        {(copy.stakesBoldKey || copy.purseAmount != null || !copy.hasBout) ? (
          <p className="hn-stakes hn-anim">
            {copy.stakesBoldKey ? <strong>{t(`home.hero.${copy.stakesBoldKey}`)} </strong> : null}
            {!copy.hasBout ? t("home.hero.noBout") : null}
            {copy.purseAmount != null ? t("home.hero.stakesPurse", { purse: formatPurse(copy.purseAmount) }) : null}
          </p>
        ) : null}

        <div className="hn-cta-row hn-anim">
          <button type="button" className="hn-cta" onClick={() => onNavigate?.(heroAction?.linkTarget)}>
            {copy.ctaLabel}
            {copy.ctaPillCount ? <span className="hn-cta-pill">{t("home.hero.ctaPill", { n: copy.ctaPillCount })}</span> : null}
          </button>
          {copy.ctaSublabel ? <span className="hn-cta-note">{copy.ctaSublabel}</span> : null}
        </div>
      </div>
    </header>
  );
}
