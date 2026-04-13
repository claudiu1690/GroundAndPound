import { memo } from "react";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";
import { Zap, Heart, TrendingUp, TrendingDown, AlertTriangle, Swords, Trophy, Lock } from "lucide-react";

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

function FightHub({ fighter, energyCost, onGetOffers }) {
  const rec = fighter.record ?? {};
  const energy = fighter.energy?.current ?? fighter.energy ?? 0;
  const health = fighter.health ?? 100;
  const hasEnergy = energy >= energyCost;
  const winStreak = fighter.winStreak ?? 0;
  const loseStreak = fighter.consecutiveLosses ?? 0;
  const blockingInjury = (fighter.injuries ?? []).find((inj) => inj.cannotFight);
  const blocked = fighter.mentalResetRequired || !!blockingInjury;

  return (
    <div className="fight-hub">
      <div className="fight-hub-header">
        <div className="fight-hub-ovr">{fighter.overallRating ?? 0}</div>
        <div className="fight-hub-ovr-label">OVERALL</div>
        <div className="fight-hub-tier">{fighter.promotionTier ?? "Amateur"}</div>
        <div className="fight-hub-record">
          {rec.wins ?? 0}W – {rec.losses ?? 0}L{(rec.draws ?? 0) > 0 ? ` – ${rec.draws}D` : ""}
        </div>
      </div>

      <div className="fight-hub-readiness">
        <div className={`fight-hub-stat ${hasEnergy ? "" : "fight-hub-stat--warn"}`}>
          <Zap size={12} />
          <span className="fight-hub-stat-label">Energy</span>
          <span className="fight-hub-stat-value">{energy} / {energyCost} needed</span>
        </div>
        <div className={`fight-hub-stat ${health >= 50 ? "" : "fight-hub-stat--warn"}`}>
          <Heart size={12} />
          <span className="fight-hub-stat-label">Health</span>
          <span className="fight-hub-stat-value">{health} / 100</span>
        </div>
        <div className="fight-hub-stat">
          {winStreak > 0 ? <TrendingUp size={12} /> : loseStreak > 0 ? <TrendingDown size={12} /> : <Swords size={12} />}
          <span className="fight-hub-stat-label">Streak</span>
          <span className="fight-hub-stat-value">
            {winStreak > 0
              ? <span style={{ color: "var(--green-bright)" }}>{winStreak}-fight win streak</span>
              : loseStreak > 0
              ? <span style={{ color: "var(--red-bright)" }}>{loseStreak}-fight losing streak</span>
              : "\u2014"}
          </span>
        </div>
      </div>

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

      <div className="fight-hub-cta">
        <button type="button" className="btn btn-primary fight-hub-btn" onClick={onGetOffers} disabled={blocked}>
          <Swords size={14} /> Request Offers
        </button>
        <span className="fight-hub-cost">{energyCost} energy per fight</span>
      </div>
    </div>
  );
}

export const FightOffers = memo(function FightOffers({ fighter, offers, onGetOffers, onAcceptOffer }) {
  if (!fighter) return null;
  const energyCost = FIGHT_ENERGY_COST[fighter.promotionTier] ?? 10;

  return (
    <section className="panel fight-offers">
      <h2 className="panel-title">Fight Offers</h2>
      <div className="panel-body">
        {offers.length === 0 ? (
          <FightHub fighter={fighter} energyCost={energyCost} onGetOffers={onGetOffers} />
        ) : (
          <>
            <ul className="offers-list">
              {offers.map((o) => {
                const typeKey = o.type ?? "Even";
                const meta = TYPE_META[typeKey] ?? {};
                const ctx = o.context ?? {};
                const isTitle = typeKey === "TitleShot";
                const isLocked = !!o.locked;
                const badgeLabel = isTitle ? "Title Shot" : typeKey;
                return (
                  <li key={o.opponent?._id ?? typeKey} className={`offer-card ${TYPE_CLASS[typeKey] ?? ""}${o.nemesisMeta ? " offer-card-nemesis" : ""}${isLocked ? " offer-card-locked" : ""}`}>
                    <div className="offer-card-info">
                      <div className="offer-badge-row">
                        {isTitle && <Trophy size={12} style={{ color: "#d4a012" }} />}
                        <span className={`offer-type-badge ${BADGE_CLASS[typeKey] ?? ""}`}>{badgeLabel}</span>
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
                            {o.cooldownRemaining > 0
                              ? `${o.cooldownRemaining} win${o.cooldownRemaining !== 1 ? "s" : ""} to retry`
                              : `${o.winsNeeded} win${o.winsNeeded !== 1 ? "s" : ""} needed`}
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
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
