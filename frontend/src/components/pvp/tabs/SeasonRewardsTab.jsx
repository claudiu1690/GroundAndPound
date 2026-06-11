import { DIVISIONS, REWARDS } from "../pvpConst";

/**
 * Season Rewards tab — static display only.
 * Shows the REWARDS table with "You are here" highlight on the current division.
 */
export function SeasonRewardsTab({ season, yourRecord }) {
  const currentDiv = yourRecord?.division ?? null;

  const divStripeColor = {
    prospect: "#666666",
    contender: "#3B82F6",
    challenger: "#8B5CF6",
    elite: "#14B8A6",
    champion: "#C8102E",
  };

  return (
    <div className="pvp-rewards-wrap">
      <div className="pvp-section-lbl">
        {season?.name ? `${season.name} End Rewards` : "Season End Rewards"}
        {season?.endDate && (
          <span style={{ color: "#555", marginLeft: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
            · {Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))} weeks remaining
          </span>
        )}
      </div>

      {DIVISIONS.map((div) => {
        const reward = REWARDS[div.key];
        const isCurrent = div.key === currentDiv;
        const stripeColor = divStripeColor[div.key] ?? "#555";
        const divColor = div.color;
        const r = parseInt(divColor.slice(1, 3), 16);
        const g = parseInt(divColor.slice(3, 5), 16);
        const b = parseInt(divColor.slice(5, 7), 16);

        return (
          <div
            key={div.key}
            className={`pvp-rw-row ${isCurrent ? "pvp-rw-row-current" : ""}`}
            style={isCurrent ? { borderColor: "rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.03)" } : {}}
          >
            <div className="pvp-rw-stripe" style={{ background: stripeColor }} />
            <div className="pvp-rw-body">
              <div className="pvp-rw-div">
                <span
                  className="pvp-div-badge"
                  style={{
                    color: divColor,
                    background: `rgba(${r},${g},${b},0.12)`,
                    border: `1px solid rgba(${r},${g},${b},0.2)`,
                  }}
                >
                  {div.label}
                </span>
              </div>
              <div className="pvp-rw-prizes">
                <span className="pvp-rw-prize pvp-rw-prize-cash">
                  {reward.iron.toLocaleString()} cash
                </span>
                <span className="pvp-rw-prize pvp-rw-prize-fame">
                  +{reward.fame.toLocaleString()} fame
                </span>
                {reward.drinks > 0 && (
                  <span className="pvp-rw-prize pvp-rw-prize-drink">
                    {reward.drinks} drink{reward.drinks !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="pvp-rw-extras">
                {reward.badge && (
                  <span className="pvp-rw-extra-pill pvp-rw-extra-badge">
                    {div.label} Badge
                  </span>
                )}
                {isCurrent && <span className="pvp-you-here">You are here</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Belt Holder row */}
      <div className="pvp-rw-row" style={{ borderColor: "rgba(212,168,32,0.3)" }}>
        <div className="pvp-rw-stripe" style={{ background: "linear-gradient(to bottom,#D4A820,#C8102E)" }} />
        <div className="pvp-rw-body">
          <div className="pvp-rw-div">
            <div style={{ fontSize: 16, marginBottom: 2 }}>🏆</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 10, textTransform: "uppercase", color: "#D4A820" }}>Belt Holder</div>
            <div style={{ fontSize: 9, color: "#555" }}>#1 at season end</div>
          </div>
          <div className="pvp-rw-prizes">
            <span className="pvp-rw-prize pvp-rw-prize-cash">15,000 cash</span>
            <span className="pvp-rw-prize pvp-rw-prize-fame">+15,000 fame</span>
            <span className="pvp-rw-prize pvp-rw-prize-drink">7 drinks</span>
          </div>
          <div className="pvp-rw-extras">
            <span className="pvp-rw-extra-pill" style={{ background: "rgba(212,168,32,0.1)", color: "#D4A820", border: "1px solid rgba(212,168,32,0.2)" }}>
              Season Belt Badge
            </span>
            <span className="pvp-rw-extra-pill" style={{ background: "rgba(212,168,32,0.1)", color: "#D4A820", border: "1px solid rgba(212,168,32,0.2)" }}>
              Hall of Fame
            </span>
          </div>
        </div>
      </div>

      <div className="pvp-rewards-note">
        Rewards require at least 1 fight. Finish the season in your current division to claim.
      </div>
    </div>
  );
}
