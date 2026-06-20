import { memo, useState } from "react";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";
import { Zap, Heart, TrendingUp, TrendingDown, AlertTriangle, Swords, Trophy, Lock, Megaphone } from "lucide-react";
import { t } from "@/lib/i18n";
import { CalloutModal } from "./CalloutModal";
import { ContenderChecklist } from "./ContenderChecklist";
import { TITLE_WINS } from "../../constants/gameConstants";
import { OfferCard } from "./OfferCard";
import { buildCardModel } from "./offerIntel";

const OFFER_TYPE = { EASY: "Easy", EVEN: "Even", HARD: "Hard", TITLE: "TitleShot" };

function rankTileProps(rank) {
  if (rank == null) return { value: "—", label: t("fights.hub.unranked"), tone: "unranked" };
  return { value: `#${rank}`, label: t("fights.hub.rankLabel"), tone: "rank" };
}

function StatTile({ value, label, tone }) {
  return (
    <div className={`stat-tile stat-tile-${tone || "default"}`}>
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  );
}

function ReadinessTile({ icon, value, max, label, sub, tone = "ok" }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`readiness-tile readiness-tile-${tone}`}>
      <div className="readiness-tile-icon">{icon}</div>
      <div className="readiness-tile-value">
        {value}
        {typeof max === "number" && <span className="readiness-tile-max"> / {max}</span>}
      </div>
      <div className="readiness-tile-label">{label}</div>
      {typeof max === "number" && (
        <div className="readiness-tile-bar"><div className="readiness-tile-bar-fill" style={{ width: `${pct}%` }} /></div>
      )}
      {sub && <div className="readiness-tile-sub">{sub}</div>}
    </div>
  );
}

function StreakTile({ winStreak, loseStreak }) {
  const tone = winStreak > 0 ? "win" : loseStreak > 0 ? "loss" : "neutral";
  const icon = winStreak > 0 ? <TrendingUp size={22} /> : loseStreak > 0 ? <TrendingDown size={22} /> : <Swords size={22} />;
  const value = winStreak > 0 ? `${winStreak}W` : loseStreak > 0 ? `${loseStreak}L` : "—";
  const sub = winStreak > 0 ? t("fights.hub.streakWin", { n: winStreak }) : loseStreak > 0 ? t("fights.hub.streakLoss", { n: loseStreak }) : t("fights.hub.streakNone");
  return (
    <div className={`readiness-tile readiness-tile-streak readiness-tile-${tone}`}>
      <div className="readiness-tile-icon">{icon}</div>
      <div className="readiness-tile-value">{value}</div>
      <div className="readiness-tile-label">{t("fights.hub.streak")}</div>
      <div className="readiness-tile-sub">{sub}</div>
    </div>
  );
}

function FightHub({ fighter, energyCost, onGetOffers, onOpenCallout }) {
  const rec = fighter.record ?? {};
  const energy = fighter.energy?.current ?? fighter.energy ?? 0;
  const health = fighter.health ?? 100;
  const hasEnergy = energy >= energyCost;
  const winStreak = fighter.winStreak ?? 0;
  const loseStreak = fighter.consecutiveLosses ?? 0;
  const blockingInjury = (fighter.injuries ?? []).find((inj) => inj.cannotFight);
  const blocked = fighter.mentalResetRequired || !!blockingInjury;
  const rank = fighter.ranking?.rank ?? null;
  const rankTile = rankTileProps(rank);
  const recordText = `${rec.wins ?? 0}-${rec.losses ?? 0}${(rec.draws ?? 0) > 0 ? `-${rec.draws}` : ""}`;
  const tier = fighter.promotionTier ?? "Amateur";

  return (
    <div className="fight-hub">
      <div className="page-title">{t("fights.hub.pageTitle")}</div>
      <div className="tier-label fight-hub-tier-strip">{tier}</div>

      <div className="fight-hub-stat-grid">
        <StatTile value={fighter.overallRating ?? 0} label={t("fights.hub.overallRating")} tone="ovr" />
        <StatTile value={rankTile.value} label={t("fights.hub.divisionRank")} tone={rankTile.tone} />
        <StatTile value={recordText} label={t("fights.hub.record")} tone="default" />
      </div>

      <div className="fight-hub-readiness">
        <ReadinessTile
          icon={<Zap size={20} />}
          value={energy}
          max={100}
          label={t("fights.hub.energy")}
          sub={hasEnergy ? t("fights.hub.energyReady", { cost: energyCost }) : t("fights.hub.energyNeed", { need: energyCost - energy })}
          tone={hasEnergy ? "ok" : "warn"}
        />
        <ReadinessTile
          icon={<Heart size={20} />}
          value={health}
          max={100}
          label={t("fights.hub.health")}
          sub={health >= 80 ? t("fights.hub.healthFull") : health >= 50 ? t("fights.hub.healthBeatUp") : health >= 30 ? t("fights.hub.healthLow") : t("fights.hub.healthCritical")}
          tone={health >= 50 ? "ok" : health >= 30 ? "warn" : "danger"}
        />
        <StreakTile winStreak={winStreak} loseStreak={loseStreak} />
      </div>

      {/* Badge display removed — badges still earned/stored; will return as achievements. */}

      {fighter.mentalResetRequired && (
        <div className="fight-hub-alert fight-hub-alert--danger">
          <AlertTriangle size={12} /> {t("fights.hub.alertMentalReset")}
        </div>
      )}
      {blockingInjury && (
        <div className="fight-hub-alert fight-hub-alert--danger">
          <AlertTriangle size={12} /> {t("fights.hub.alertBlockingInjury", { label: blockingInjury.label })}
        </div>
      )}
      {health < 30 && !blocked && (
        <div className="fight-hub-alert fight-hub-alert--warn">
          <AlertTriangle size={12} /> {t("fights.hub.alertLowHealth")}
        </div>
      )}
      {fighter.comebackMode && (
        <div className="fight-hub-alert fight-hub-alert--info">
          {t("fights.hub.alertComeback")}
        </div>
      )}

      {(() => {
        const calloutEligible = rank != null && rank <= 14;
        const calloutTooltip = calloutEligible
          ? t("fights.hub.calloutTooltipEligible")
          : rank == null
            ? t("fights.hub.calloutTooltipUnranked")
            : t("fights.hub.calloutTooltipRank", { rank });
        return (
          <div className="fight-hub-cta">
            <button type="button" className="btn btn-primary fight-hub-btn" onClick={onGetOffers} disabled={blocked} data-tut="request-offers">
              <Swords size={14} /> {t("fights.hub.requestOffers")}
            </button>
            <button
              type="button"
              className="btn btn-secondary fight-hub-btn fight-hub-btn-secondary"
              onClick={onOpenCallout}
              disabled={blocked || !calloutEligible}
              title={calloutTooltip}
            >
              <Megaphone size={14} /> {t("fights.hub.callOut")}
              {!calloutEligible && <Lock size={10} style={{ marginLeft: 4, opacity: 0.7 }} />}
            </button>
            <span className="fight-hub-cost">{t("fights.hub.energyCost", { cost: energyCost })}</span>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Banner above the offers list — tier badge + stat tiles for OVR / Rank / Record.
 */
function OffersStandingBanner({ fighter }) {
  const rank = fighter.ranking?.rank ?? null;
  const rec = fighter.record ?? {};
  const tier = fighter.promotionTier ?? "Amateur";
  const rankTile = rankTileProps(rank);
  const recordText = `${rec.wins ?? 0}-${rec.losses ?? 0}${(rec.draws ?? 0) > 0 ? `-${rec.draws}` : ""}`;
  return (
    <div className="offers-standing-banner">
      <div className="standing-tier-tag">{tier}</div>
      <div className="standing-stat-grid">
        <StatTile value={fighter.overallRating ?? 0} label={t("fights.hub.standingOvr")} tone="ovr" />
        <StatTile value={rankTile.value} label={rankTile.label} tone={rankTile.tone} />
        <StatTile value={recordText} label={t("fights.hub.standingRecord")} tone="default" />
      </div>
    </div>
  );
}

function ActiveCalloutBanner({ activeCallout, onOpenCallout }) {
  if (!activeCallout?.opponentId) return null;
  return (
    <div className="active-callout-banner" role="status">
      <Megaphone size={14} />
      <span>
        {t("fights.offers.activeCalloutBanner", { name: activeCallout.opponentName })}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenCallout}>
        {t("fights.offers.manage")}
      </button>
    </div>
  );
}

export const FightOffers = memo(function FightOffers({ fighter, offers, onGetOffers, onAcceptOffer, onRefreshFighter, onMessage }) {
  const [calloutOpen, setCalloutOpen] = useState(false);
  if (!fighter) return null;
  const energyCost = FIGHT_ENERGY_COST[fighter.promotionTier] ?? 10;
  const activeCallout = fighter.activeCallout?.opponentId ? fighter.activeCallout : null;

  // Show the contender checklist while the player is a title CONTENDER but the
  // shot is not yet ready (cooldown, not top-5, or wins short of the gate).
  const showChecklist = (() => {
    if (!fighter.pendingPromotion) return false;
    const rank = fighter.ranking?.rank ?? null;
    const top5 = rank != null && rank <= 5;
    const wins = fighter.winsInCurrentTier ?? 0;
    const titleWins = TITLE_WINS[fighter.promotionTier] ?? 3;
    const cooldown = fighter.titleShotCooldown ?? 0;
    return cooldown > 0 || !top5 || wins < titleWins;
  })();

  // Build card model from offers
  const cardModels = buildCardModel(offers);
  const isFourCards = cardModels.length === 4;

  return (
    <section className="panel fight-offers">
      <h2 className="panel-title">{t("fights.offers.panelTitle")}</h2>
      <div className="panel-body">
        {showChecklist && <ContenderChecklist fighter={fighter} offers={offers} />}

        <ActiveCalloutBanner activeCallout={activeCallout} onOpenCallout={() => setCalloutOpen(true)} />

        <CalloutModal
          open={calloutOpen}
          fighter={fighter}
          onClose={() => setCalloutOpen(false)}
          onCalledOut={() => { if (onRefreshFighter) onRefreshFighter(fighter._id); }}
          onCancelled={() => { if (onRefreshFighter) onRefreshFighter(fighter._id); }}
          onMessage={onMessage}
        />

        {offers.length === 0 ? (
          <FightHub
            fighter={fighter}
            energyCost={energyCost}
            onGetOffers={onGetOffers}
            onOpenCallout={() => setCalloutOpen(true)}
          />
        ) : (
          <>
            <OffersStandingBanner fighter={fighter} />

            <div className={`offers-grid${isFourCards ? " offers-grid--four" : ""}`}>
              {cardModels.map(({ variant, offer }, idx) => {
                // Inject the resolved variant onto the offer so OfferCard can read it
                const enrichedOffer = { ...offer, _variant: variant };
                return (
                  <OfferCard
                    key={offer.opponent?._id ?? `${variant}-${idx}`}
                    offer={enrichedOffer}
                    fighter={fighter}
                    energyCost={energyCost}
                    onAccept={(opponentId, type) => onAcceptOffer(opponentId, type)}
                  />
                );
              })}
            </div>

            <div className="bottom-row">
              <button
                type="button"
                className="refresh-btn"
                onClick={onGetOffers}
              >
                {t("fights.hub.refreshOffers")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
});
