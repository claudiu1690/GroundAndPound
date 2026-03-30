import { memo } from "react";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";

const OFFER_TYPE = { EASY: "Easy", EVEN: "Even", HARD: "Hard" };

const TYPE_CLASS = {
  [OFFER_TYPE.EASY]: "offer-card-easy",
  [OFFER_TYPE.EVEN]: "offer-card-even",
  [OFFER_TYPE.HARD]: "offer-card-hard",
};
const BADGE_CLASS = {
  [OFFER_TYPE.EASY]: "badge-easy",
  [OFFER_TYPE.EVEN]: "badge-even",
  [OFFER_TYPE.HARD]: "badge-hard",
};
const TYPE_META = {
  [OFFER_TYPE.EASY]: { desc: "3–5 OVR below you · Low risk, low reward" },
  [OFFER_TYPE.EVEN]: { desc: "Within 3 OVR · Competitive" },
  [OFFER_TYPE.HARD]: { desc: "2–5 OVR above you · High risk, high reward" },
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

export const FightOffers = memo(function FightOffers({ fighter, offers, onGetOffers, onAcceptOffer }) {
  if (!fighter) return null;
  const energyCost = FIGHT_ENERGY_COST[fighter.promotionTier] ?? 10;

  return (
    <section className="panel fight-offers">
      <h2 className="panel-title">Fight Offers</h2>
      <div className="panel-body">
        {offers.length === 0 ? (
          <>
            <p className="panel-hint" style={{ marginBottom: "0.75rem" }}>
              The promoter generates 3 offers (Easy, Even, Hard). Pick your next challenge wisely.
            </p>
            <button type="button" className="btn btn-primary" onClick={onGetOffers}>
              Request offers
            </button>
          </>
        ) : (
          <>
            <ul className="offers-list">
              {offers.map((o) => {
                const typeKey = o.type ?? "Even";
                const meta = TYPE_META[typeKey] ?? {};
                const ctx = o.context ?? {};
                return (
                  <li key={o.opponent?._id ?? typeKey} className={`offer-card ${TYPE_CLASS[typeKey] ?? ""}${o.nemesisMeta ? " offer-card-nemesis" : ""}`}>
                    <div className="offer-card-info">
                      <div className="offer-badge-row">
                        <span className={`offer-type-badge ${BADGE_CLASS[typeKey] ?? ""}`}>{typeKey}</span>
                        {o.nemesisMeta && (
                          <span className="offer-type-badge badge-nemesis">☠ Nemesis</span>
                        )}
                      </div>
                      <div className="offer-opponent-name">
                        {o.opponent?.name}
                        {o.opponent?.nickname && (
                          <span className="offer-opponent-nickname"> &quot;{o.opponent.nickname}&quot;</span>
                        )}
                      </div>
                      <div className="offer-opponent-meta">
                        <span className="offer-opponent-ovr">OVR {o.opponent?.overallRating}</span>
                        {o.opponent?.style ? ` · ${o.opponent.style}` : ""}
                        {meta.desc && <>{" · "}<span className="offer-meta-desc">{meta.desc}</span></>}
                      </div>
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
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onAcceptOffer(o.opponent._id, o.type)}
                      >
                        Accept
                      </button>
                      <span className="offer-energy-cost">{energyCost} energy</span>
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
