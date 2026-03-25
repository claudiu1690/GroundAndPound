import { memo } from "react";

const TYPE_CLASS = { Easy: "offer-card-easy", Even: "offer-card-even", Hard: "offer-card-hard" };
const BADGE_CLASS = { Easy: "badge-easy", Even: "badge-even", Hard: "badge-hard" };

const TYPE_META = {
  Easy:  { desc: "3–5 OVR below you · Low risk, low reward" },
  Even:  { desc: "Within 3 OVR · Competitive" },
  Hard:  { desc: "2–5 OVR above you · High risk, high reward" },
};

export const FightOffers = memo(function FightOffers({ fighter, offers, onGetOffers, onAcceptOffer }) {
  if (!fighter) return null;

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
                return (
                  <li key={o.opponent?._id ?? typeKey} className={`offer-card ${TYPE_CLASS[typeKey] ?? ""}`}>
                    <div className="offer-card-info">
                      <div>
                        <span className={`offer-type-badge ${BADGE_CLASS[typeKey] ?? ""}`}>{typeKey}</span>
                      </div>
                      <div className="offer-opponent-name">
                        {o.opponent?.name}
                        {o.opponent?.nickname ? <span style={{ color: "var(--text-sec)", fontWeight: 400 }}> &quot;{o.opponent.nickname}&quot;</span> : ""}
                      </div>
                      <div className="offer-opponent-meta">
                        <span className="offer-opponent-ovr">OVR {o.opponent?.overallRating}</span>
                        {o.opponent?.style ? ` · ${o.opponent.style}` : ""}
                        {" · "}
                        <span style={{ color: "var(--text-muted)" }}>{meta.desc}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onAcceptOffer(o.opponent._id, o.type)}
                    >
                      Accept
                    </button>
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
