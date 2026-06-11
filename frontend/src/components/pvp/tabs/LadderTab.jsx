import { Shield, Flame, Swords } from "lucide-react";
import { usePvpLadder } from "../../../hooks/usePvpLadder";
import { EmptyState } from "../EmptyState";
import { divisionColor, seasonWeightClassLabel } from "../pvpConst";

function DivBadge({ division, color }) {
  const c = color || divisionColor(division);
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return (
    <span
      className={`pvp-div-badge pvp-div-badge-${division}`}
      style={{
        color: c,
        background: `rgba(${r},${g},${b},0.12)`,
        border: `1px solid rgba(${r},${g},${b},0.2)`,
      }}
    >
      {division}
    </span>
  );
}

export function LadderTab({ season, yourRecord, poolCount, myFighterId, onFight }) {
  const seasonId = season?.id;
  const wc = season?.weightClass;
  const { data, loading, error } = usePvpLadder(wc, seasonId);

  const rows = data?.rows ?? [];

  // If the pool for *my* division is small, show empty state
  if (!loading && !error && poolCount != null && poolCount < 5) {
    return (
      <EmptyState
        season={season}
        poolCount={poolCount}
        beltUnclaimed={!season?.beltHolderId}
        onFight={onFight}
      />
    );
  }

  return (
    <div className="pvp-ladder-layout">
      {/* Position card */}
      {yourRecord && (
        <div className="pvp-pos-card">
          <div className="pvp-pos-top">
            <DivBadge division={yourRecord.division} color={yourRecord.divisionColor} />
            <div className="pvp-pos-info">
              <div className="pvp-pos-name">{yourRecord.name}</div>
              <div className="pvp-pos-sub">
                {seasonWeightClassLabel(season) ?? wc} · #{yourRecord.rank ?? "—"} in division
              </div>
            </div>
            <div className="pvp-pos-dp">
              <div className="pvp-pos-dp-v">{(yourRecord.dp ?? 0).toLocaleString()}</div>
              <div className="pvp-pos-dp-l">Division Points</div>
            </div>
          </div>
          <div className="pvp-pos-body">
            {/* Progress bar */}
            {yourRecord.promoteAt && (
              <div className="pvp-prog-sec">
                <div className="pvp-prog-lbs">
                  <span className="pvp-prog-lb">
                    Progress to {getNextDivLabel(yourRecord.division)}
                  </span>
                  <span className="pvp-prog-v">
                    <span>{(yourRecord.dp ?? 0).toLocaleString()}</span> / {yourRecord.promoteAt.toLocaleString()} DP
                  </span>
                </div>
                <div className="pvp-prog-track">
                  <div
                    className="pvp-prog-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((yourRecord.dp - yourRecord.divisionFloor) / (yourRecord.promoteAt - yourRecord.divisionFloor)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="pvp-prog-note">
                  <span>{Math.max(0, yourRecord.promoteAt - yourRecord.dp).toLocaleString()} DP</span> needed to promote
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="pvp-rec-grid">
              <div className="pvp-ri"><div className="pvp-rv pvp-rv-g">{yourRecord.wins ?? 0}</div><div className="pvp-rl">Wins</div></div>
              <div className="pvp-ri"><div className="pvp-rv pvp-rv-r">{yourRecord.losses ?? 0}</div><div className="pvp-rl">Losses</div></div>
              <div className="pvp-ri">
                <div className="pvp-rv">
                  {yourRecord.wins + yourRecord.losses > 0
                    ? Math.round((yourRecord.wins / (yourRecord.wins + yourRecord.losses)) * 100) + "%"
                    : "—"}
                </div>
                <div className="pvp-rl">Win %</div>
              </div>
              <div className="pvp-ri"><div className="pvp-rv" style={{ color: "#D4A820" }}>{(yourRecord.wins ?? 0) + (yourRecord.losses ?? 0)}</div><div className="pvp-rl">Fights</div></div>
            </div>

            {/* Streak banner */}
            {yourRecord.winStreak >= 3 && (
              <div className="pvp-streak-banner">
                <Flame size={15} strokeWidth={2} style={{ color: "#D4A820" }} />
                <div className="pvp-streak-text">
                  <strong>{yourRecord.winStreak}-win streak active</strong> — ×1.25 DP multiplier on next win.
                </div>
                <div className="pvp-streak-mult">×1.25</div>
              </div>
            )}

            {/* Promotion shield banner */}
            {yourRecord.promotionShield > 0 && (
              <div className="pvp-shield-banner">
                <Shield size={13} strokeWidth={2} style={{ color: "#3B82F6" }} />
                <div className="pvp-shield-text">
                  <strong>Promotion Shield active</strong> — {yourRecord.promotionShield} fight{yourRecord.promotionShield !== 1 ? "s" : ""} of DP protection remaining
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="pvp-lb-card">
        <div className="pvp-lb-head">
          <div className="pvp-lb-title">{seasonWeightClassLabel(season) ?? wc} Ladder</div>
          <div className="pvp-lb-sub">
            {loading ? "Loading…" : `${data?.total ?? 0} fighters`}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="pvp-lb-empty">Loading ladder…</div>
        ) : error ? (
          <div className="pvp-lb-empty pvp-lb-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="pvp-lb-empty">No fighters yet. Be the first.</div>
        ) : (
          <>
            {rows.map((row, idx) => {
              const isYou = row.playerId === myFighterId;
              const prevRow = idx > 0 ? rows[idx - 1] : null;
              const showSep = !isYou && prevRow && !prevRow.isYou && idx > 0 && idx === rows.findIndex(r => r.playerId === myFighterId) - 1;

              return (
                <div key={row.playerId}>
                  {showSep && <div className="pvp-lb-sep">· · ·</div>}
                  <div className={`pvp-lb-row ${row.isBeltHolder ? "pvp-lb-row-champ" : ""} ${isYou ? "pvp-lb-row-you" : ""}`}>
                    <div className={`pvp-lb-rank ${row.rank <= 3 ? "pvp-lb-rank-gold" : ""}`}>{row.rank}</div>
                    <div className="pvp-lb-belt">
                      {row.isBeltHolder ? "🏆" : ""}
                    </div>
                    <div className={`pvp-lb-name ${isYou ? "pvp-lb-name-acc" : ""}`}>
                      {row.name}
                      {row.isBeltHolder && (
                        <span className="pvp-lb-belt-tag">Belt</span>
                      )}
                      {isYou && <span className="pvp-you-tag">You</span>}
                    </div>
                    <DivBadge division={row.division} color={row.divisionColor} />
                    {season?.crossWeightClass && row.realWeightClass && (
                      <span className="pvp-wc-pill">{row.realWeightClass}</span>
                    )}
                    <div className={`pvp-lb-dp ${isYou ? "pvp-lb-dp-bright" : ""}`}>
                      {(row.dp ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Always show "you" row if not in visible list */}
            {yourRecord && !rows.some(r => r.playerId === myFighterId) && (
              <>
                <div className="pvp-lb-sep">· · ·</div>
                <div className="pvp-lb-row pvp-lb-row-you">
                  <div className="pvp-lb-rank" style={{ color: "#C8102E" }}>{yourRecord.rank ?? "—"}</div>
                  <div className="pvp-lb-belt"></div>
                  <div className="pvp-lb-name pvp-lb-name-acc">
                    {yourRecord.name} <span className="pvp-you-tag">You</span>
                  </div>
                  <DivBadge division={yourRecord.division} color={yourRecord.divisionColor} />
                  {season?.crossWeightClass && yourRecord.realWeightClass && (
                    <span className="pvp-wc-pill">{yourRecord.realWeightClass}</span>
                  )}
                  <div className="pvp-lb-dp pvp-lb-dp-bright">{(yourRecord.dp ?? 0).toLocaleString()}</div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getNextDivLabel(div) {
  const order = ["prospect", "contender", "challenger", "elite", "champion"];
  const idx = order.indexOf(div);
  if (idx < 0 || idx >= order.length - 1) return "";
  const next = order[idx + 1];
  return next.charAt(0).toUpperCase() + next.slice(1);
}
