import { memo, useState } from "react";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";
import { Zap, Heart, TrendingUp, TrendingDown, AlertTriangle, Swords, Trophy, Lock, Megaphone } from "lucide-react";
import { CalloutModal } from "./CalloutModal";
import { ContenderChecklist } from "./ContenderChecklist";
import { TITLE_WINS } from "../../constants/gameConstants";
import { OfferCard } from "./OfferCard";
import { buildCardModel } from "./offerIntel";

const OFFER_TYPE = { EASY: "Easy", EVEN: "Even", HARD: "Hard", TITLE: "TitleShot" };

function rankTileProps(rank) {
  if (rank == null) return { value: "—", label: "UNRANKED", tone: "unranked" };
  return { value: `#${rank}`, label: "RANK", tone: "rank" };
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
  const sub = winStreak > 0 ? `${winStreak}-fight win streak` : loseStreak > 0 ? `${loseStreak}-fight losing streak` : "No active streak";
  return (
    <div className={`readiness-tile readiness-tile-streak readiness-tile-${tone}`}>
      <div className="readiness-tile-icon">{icon}</div>
      <div className="readiness-tile-value">{value}</div>
      <div className="readiness-tile-label">STREAK</div>
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
      <div className="page-title">Fight Offers</div>
      <div className="tier-label fight-hub-tier-strip">{tier}</div>

      <div className="fight-hub-stat-grid">
        <StatTile value={fighter.overallRating ?? 0} label="Overall Rating" tone="ovr" />
        <StatTile value={rankTile.value} label="Division Rank" tone={rankTile.tone} />
        <StatTile value={recordText} label="Record" tone="default" />
      </div>

      <div className="fight-hub-readiness">
        <ReadinessTile
          icon={<Zap size={20} />}
          value={energy}
          max={100}
          label="ENERGY"
          sub={hasEnergy ? `Ready · ${energyCost} energy per fight` : `Need ${energyCost - energy} more`}
          tone={hasEnergy ? "ok" : "warn"}
        />
        <ReadinessTile
          icon={<Heart size={20} />}
          value={health}
          max={100}
          label="HEALTH"
          sub={health >= 80 ? "At full strength" : health >= 50 ? "A bit beat up" : health >= 30 ? "Low — rest soon" : "Critical"}
          tone={health >= 50 ? "ok" : health >= 30 ? "warn" : "danger"}
        />
        <StreakTile winStreak={winStreak} loseStreak={loseStreak} />
      </div>

      {/* Badge display removed — badges still earned/stored; will return as achievements. */}

      {fighter.mentalResetRequired && (
        <div className="fight-hub-alert fight-hub-alert--danger">
          <AlertTriangle size={12} /> Mental reset required before next fight
        </div>
      )}
      {blockingInjury && (
        <div className="fight-hub-alert fight-hub-alert--danger">
          <AlertTriangle size={12} /> Doctor visit required: {blockingInjury.label}
        </div>
      )}
      {health < 30 && !blocked && (
        <div className="fight-hub-alert fight-hub-alert--warn">
          <AlertTriangle size={12} /> Low health — consider resting before your next fight
        </div>
      )}
      {fighter.comebackMode && (
        <div className="fight-hub-alert fight-hub-alert--info">
          Comeback mode active — x1.5 XP on next win
        </div>
      )}

      {(() => {
        const calloutEligible = rank != null && rank <= 14;
        const calloutTooltip = calloutEligible
          ? "Spend fame to force a specific opponent into your next Hard offer"
          : rank == null
            ? "Reach the rankings first (3 fights in this tier)"
            : `Reach top 14 to unlock callouts — currently #${rank}`;
        return (
          <div className="fight-hub-cta">
            <button type="button" className="btn btn-primary fight-hub-btn" onClick={onGetOffers} disabled={blocked} data-tut="request-offers">
              <Swords size={14} /> Request Offers
            </button>
            <button
              type="button"
              className="btn btn-secondary fight-hub-btn fight-hub-btn-secondary"
              onClick={onOpenCallout}
              disabled={blocked || !calloutEligible}
              title={calloutTooltip}
            >
              <Megaphone size={14} /> Call Out
              {!calloutEligible && <Lock size={10} style={{ marginLeft: 4, opacity: 0.7 }} />}
            </button>
            <span className="fight-hub-cost">{energyCost} energy per fight</span>
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
        <StatTile value={fighter.overallRating ?? 0} label="OVR" tone="ovr" />
        <StatTile value={rankTile.value} label={rankTile.label} tone={rankTile.tone} />
        <StatTile value={recordText} label="RECORD" tone="default" />
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
        Callout active: <strong>{activeCallout.opponentName}</strong> will appear in your next Hard offer with full intel.
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenCallout}>
        Manage
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
      <h2 className="panel-title">Fight Offers</h2>
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
                Refresh Offers
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
});
