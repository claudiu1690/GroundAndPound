import { memo, useState } from "react";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";
import { Zap, Heart, TrendingUp, TrendingDown, AlertTriangle, Swords, Trophy, Lock, Megaphone } from "lucide-react";
import { CalloutModal } from "./CalloutModal";

const OFFER_TYPE = { EASY: "Easy", EVEN: "Even", HARD: "Hard", TITLE: "TitleShot" };

const TYPE_CLASS = {
  [OFFER_TYPE.EASY]: "offer-card-easy",
  [OFFER_TYPE.EVEN]: "offer-card-even",
  [OFFER_TYPE.HARD]: "offer-card-hard",
  [OFFER_TYPE.TITLE]: "offer-card-title",
};
const BADGE_CLASS = {
  [OFFER_TYPE.EASY]: "badge-easy",
  [OFFER_TYPE.EVEN]: "badge-even",
  [OFFER_TYPE.HARD]: "badge-hard",
  [OFFER_TYPE.TITLE]: "badge-title",
};
const TYPE_META = {
  [OFFER_TYPE.EASY]: { desc: "3–5 OVR below you · Low risk, low reward" },
  [OFFER_TYPE.EVEN]: { desc: "Within 3 OVR · Competitive" },
  [OFFER_TYPE.HARD]: { desc: "2–5 OVR above you · High risk, high reward" },
  [OFFER_TYPE.TITLE]: { desc: "Championship bout · Fight for the belt" },
};

const RESULT_STYLE = {
  win:  { label: "W", className: "offer-result-win" },
  loss: { label: "L", className: "offer-result-loss" },
  draw: { label: "D", className: "offer-result-draw" },
};

function RecordLine({ record }) {
  if (!record) return <span className="offer-record-empty">Record: —</span>;
  const { wins = 0, losses = 0, draws = 0 } = record;
  if (wins === 0 && losses === 0 && draws === 0) return <span className="offer-record-empty">Record: —</span>;
  return (
    <span className="offer-record">
      <span className="offer-record-w">{wins}W</span>
      {" – "}
      <span className="offer-record-l">{losses}L</span>
      {draws > 0 && <>{" – "}<span className="offer-record-d">{draws}D</span></>}
    </span>
  );
}

function LastThree({ fights }) {
  if (!fights || fights.length === 0) return null;
  return (
    <span className="offer-last-three">
      {fights.map((f, i) => {
        const rs = RESULT_STYLE[f.result] ?? { label: "?", className: "offer-result-draw" };
        return (
          <span
            key={i}
            className={`offer-result-pill ${rs.className}`}
            title={f.method ?? f.result}
          >
            {rs.label}
          </span>
        );
      })}
    </span>
  );
}

function StreakBadge({ streak }) {
  if (!streak) return null;
  const isWin = streak.result === "win";
  return (
    <span className={`offer-streak-badge ${isWin ? "offer-streak-win" : "offer-streak-loss"}`}>
      {streak.count}-fight {isWin ? "win" : "losing"} streak
    </span>
  );
}

/**
 * Format the player's rank into a {value, label, tone} triple used by the stat tile.
 *   1     → "👑" / CHAMPION
 *   null  → "—"  / UNRANKED
 *   N     → "#N" / RANK
 */
function rankTileProps(rank) {
  // `rank` here is the player's display rank (1-N) — the player never sits at the
  // champion slot in their own tier's rankings, so we don't need a champion branch.
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

/**
 * Readiness tile — icon-led card with a progress bar and status sub-line.
 * Used for live values (energy, health) that change between fights.
 * tone: "ok" | "warn" | "danger" | "win" | "loss" | "neutral".
 */
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

/**
 * Streak tile — third readiness slot. No progress bar; tone-coloured value/icon.
 * tone: "win" | "loss" | "neutral".
 */
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
          sub={health >= 80 ? "At full strength" : health >= 50 ? "A bit beat up" : health >= 30 ? "Low \u2014 rest soon" : "Critical"}
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
        // Callout requires top 14 displayed (= DB ranks 2-15 = top 15 fighters including champ).
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
 * Banner above the offers list — gives the player their bearings:
 *   - Tier badge on the left
 *   - Stat tiles for OVR / Rank / Record in a horizontal grid
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

  return (
    <section className="panel fight-offers">
      <h2 className="panel-title">Fight Offers</h2>
      <div className="panel-body">
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

            <ul className="offers-list">
              {offers.map((o, idx) => {
                const typeKey = o.type ?? "Even";
                const meta = TYPE_META[typeKey] ?? {};
                const ctx = o.context ?? {};
                const isTitle = typeKey === "TitleShot";
                const isLocked = !!o.locked;
                const badgeLabel = isTitle ? "Title Shot" : typeKey;
                return (
                  <li key={o.opponent?._id ?? typeKey} data-tut={idx === 0 ? "offer-card" : undefined} className={`offer-card ${TYPE_CLASS[typeKey] ?? ""}${o.nemesisMeta ? " offer-card-nemesis" : ""}${o.isCallout ? " offer-card-callout" : ""}${o.beefMatch ? " offer-card-beef" : ""}${o.respectMatch ? " offer-card-respect" : ""}${isLocked ? " offer-card-locked" : ""}`}>
                    <div className="offer-card-info">
                      <div className="offer-badge-row">
                        {isTitle && <Trophy size={12} style={{ color: "#d4a012" }} />}
                        <span className={`offer-type-badge ${BADGE_CLASS[typeKey] ?? ""}`}>{badgeLabel}</span>
                        {o.isCallout && (
                          <span className="offer-type-badge badge-callout">📣 Called out</span>
                        )}
                        {o.beefMatch && !o.isCallout && (
                          <span className="offer-type-badge badge-beef" title={`Beef flag (${o.beefMatch.expiresAfterFights} fights left) — +30% fame on the win`}>
                            🔥 Beef · +30% fame
                          </span>
                        )}
                        {o.respectMatch && (
                          <span className="offer-type-badge badge-respect" title={`Respect flag (${o.respectMatch.expiresAfterFights} fights left) — +15% cash on the win`}>
                            🙇 Respect · +15% cash
                          </span>
                        )}
                        {o.nemesisMeta && (
                          <span className="offer-type-badge badge-nemesis">{"\u2620"} Nemesis</span>
                        )}
                      </div>
                      <div className="offer-opponent-name">
                        {o.opponent?.name}
                        {o.opponent?.nickname && (
                          <span className="offer-opponent-nickname"> &quot;{o.opponent.nickname}&quot;</span>
                        )}
                        {isTitle && <span className="offer-champ-tag">CHAMPION</span>}
                      </div>
                      <div className="offer-opponent-meta">
                        <span className="offer-opponent-ovr">OVR {o.opponent?.overallRating}</span>
                        {typeof o.opponent?.fixedRank === "number" && (() => {
                          const rankToShow = typeof o.opponent.displayRank === "number"
                            ? o.opponent.displayRank
                            : o.opponent.fixedRank;
                          return (
                            <span className="offer-opponent-rank" title={`Currently ranked #${rankToShow} in their tier`}>
                              {rankToShow === 1 ? " · 👑 #1" : ` · #${rankToShow}`}
                            </span>
                          );
                        })()}
                        {o.opponent?.style ? ` · ${o.opponent.style}` : ""}
                        {meta.desc && <>{" · "}<span className="offer-meta-desc">{meta.desc}</span></>}
                      </div>
                      {isTitle && o.titleShotMeta && (
                        <div className="offer-title-meta">
                          Win this fight to promote to <strong>{o.titleShotMeta.targetTier}</strong>
                        </div>
                      )}
                      {o.nemesisMeta && (
                        <div className="offer-nemesis-meta">
                          <span className="offer-nemesis-losses">
                            {o.nemesisMeta.lossCount} loss{o.nemesisMeta.lossCount !== 1 ? "es" : ""} against this fighter — settle the score
                          </span>
                          <span className="offer-nemesis-bonus">Win bonus: +150 Notoriety</span>
                        </div>
                      )}
                      <div className="offer-context">
                        <RecordLine record={o.opponent?.record} />
                        {ctx.lastThree?.length > 0 && (
                          <span className="offer-last-three-group">
                            <span className="offer-last-three-label">Last 3</span>
                            <LastThree fights={ctx.lastThree} />
                          </span>
                        )}
                        <StreakBadge streak={ctx.streak} />
                      </div>
                    </div>
                    <div className="offer-accept-col">
                      {isLocked ? (
                        <>
                          <Lock size={14} style={{ color: "var(--text-muted)" }} />
                          <span className="offer-locked-text">
                            {(() => {
                              if (o.cooldownRemaining > 0) {
                                return `${o.cooldownRemaining} win${o.cooldownRemaining !== 1 ? "s" : ""} to retry`;
                              }
                              if (o.winsNeeded > 0) {
                                return `${o.winsNeeded} win${o.winsNeeded !== 1 ? "s" : ""} needed`;
                              }
                              if (o.rankNeeded) {
                                return o.currentRank == null
                                  ? "Reach the rankings first"
                                  : `Reach top 5 (currently #${o.currentRank})`;
                              }
                              return "Locked";
                            })()}
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            data-tut={idx === 0 ? "offer-accept" : undefined}
                            className={`btn ${isTitle ? "btn-title" : "btn-primary"} btn-sm`}
                            onClick={() => onAcceptOffer(o.opponent._id, o.type)}
                          >
                            {isTitle ? "Accept Title Shot" : "Accept"}
                          </button>
                          <span className="offer-energy-cost">{energyCost} energy</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: "0.75rem" }} onClick={onGetOffers}>
              Refresh offers
            </button>
          </>
        )}
      </div>
    </section>
  );
});
