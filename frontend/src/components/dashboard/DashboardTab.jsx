import { memo } from "react";
import { useDashboard } from "../../hooks/useDashboard";
import { statMeterRows } from "../fighterProfile/profileModel";
import {
  Stethoscope,
  ListOrdered,
  TrendingUp,
  TrendingDown,
  Coins,
  Star,
  HeartPulse,
  Zap,
  Tent,
  FileText,
  ScrollText,
  ChevronRight,
  AlertTriangle,
  Brain,
  RotateCcw,
  BarChart3,
  Snowflake,
} from "lucide-react";
import { tierLabel } from "../../constants/fame";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";

// ── Time formatting ───────────────────────────────────────────
function formatEta(minutes) {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function feedDate(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Small presentational helpers ──────────────────────────────
function VitalBar({ icon, label, pct, stateClass, statusText, etaText, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      className={`dash-vital ${clickable ? "dash-vital-clickable" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
    >
      <div className="dash-vital-head">
        <span className="dash-vital-label">
          {icon}
          {label}
        </span>
        <span className="dash-vital-status">{statusText}</span>
      </div>
      <div className="dash-bar-track">
        <div
          className={`dash-bar-fill ${stateClass}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      {etaText ? <span className="dash-vital-eta">{etaText}</span> : null}
    </div>
  );
}

function ModuleCard({ className = "", stripe = "", children, onClick, dataTut, role }) {
  const clickable = typeof onClick === "function";
  return (
    <div
      className={`dash-card ${stripe ? `dash-stripe dash-stripe-${stripe}` : ""} ${
        clickable ? "dash-card-clickable" : ""
      } ${className}`}
      data-tut={dataTut}
      onClick={onClick}
      role={clickable ? role || "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

/**
 * Home / dashboard screen.
 *
 * Identity + resources render synchronously from the `fighter` prop so there's
 * no flicker on landing; the async modules fill in from the dashboard payload
 * once `useDashboard` resolves. On error we keep identity visible and offer a
 * retry. Conditional modules (camp/offers/injuries/sponsorship) are hidden
 * entirely when their payload is null/empty — no empty placeholders.
 */
export const DashboardTab = memo(function DashboardTab({
  fighter,
  onNavigate,
  onOpenCareerProfile,
  refreshKey,
}) {
  const fighterId = fighter?._id;
  const { data, loading, error, reload } = useDashboard(fighterId, { refreshKey });

  const nav = (target) => {
    if (target && typeof onNavigate === "function") onNavigate(target);
  };

  // ── Identity (synchronous from prop, enriched by payload when present) ──
  const identity = data?.identity ?? null;
  const firstName = identity?.firstName ?? fighter?.firstName ?? "";
  const lastName = identity?.lastName ?? fighter?.lastName ?? "";
  const nickname = identity?.nickname ?? fighter?.nickname ?? null;
  const ovr = identity?.overallRating ?? fighter?.overallRating ?? "—";
  const tier = identity?.promotionTier ?? fighter?.promotionTier ?? "Amateur";
  const rec = identity?.record ?? fighter?.record ?? {};
  const wins = rec?.wins ?? 0;
  const losses = rec?.losses ?? 0;
  const draws = rec?.draws ?? 0;
  const fameTierLabel = fighter?.notoriety?.tierLabel ?? null;

  // ── Stats & XP (synchronous from prop's statProgress) ──
  const statRows = fighter?.statProgress ? statMeterRows(fighter.statProgress) : [];

  // ── Money & Fame (synchronous from prop, payload preferred when present) ──
  const n = fighter?.notoriety ?? null;
  const ironVal = data?.resources?.iron ?? fighter?.iron ?? 0;
  const fameScore = data?.resources?.fame ?? n?.score ?? 0;
  const fameTier = n?.tierLabel ?? "Unknown";
  const purseFrac = n?.purseModifier ?? 0;
  const progress = Math.max(0, Math.min(100, Number(n?.progressWithinTier ?? 0)));
  const nextTh = n?.nextTierThreshold ?? null;
  const nextKey = n?.nextTierKey ?? null;
  const fameFrozen = !!n?.isFrozen;
  const fameDecaying = !!n?.decayWarningActive;

  let fameContext, fameBarFull;
  if (nextTh == null) {
    fameContext = "Top tier reached";
    fameBarFull = true;
  } else if (nextKey == null) {
    fameContext = "Keep fighting to build fame.";
    fameBarFull = false;
  } else {
    fameContext = `${Math.max(0, nextTh - fameScore).toLocaleString()} to ${tierLabel(nextKey)}`;
    fameBarFull = false;
  }
  const fameBarWidth = fameBarFull ? 100 : progress;
  const pursePct = Math.round(purseFrac * 100);

  // ── Async modules ──
  const vitals = data?.vitals ?? null;
  const hero = data?.heroAction ?? null;
  const camp = data?.camp ?? null;
  const injuries = Array.isArray(data?.injuries) ? data.injuries : [];
  const feed = Array.isArray(data?.feed) ? data.feed.slice(0, 3) : [];
  const ranking = data?.ranking ?? null;
  const sponsorship = data?.sponsorship ?? null;
  const nudge = data?.nudge ?? null;

  return (
    <section className="dashboard-tab" data-tut="dashboard-root">
      {/* ── HERO CTA (priority element; first on mobile) ── */}
      {hero ? (
        <ModuleCard className="dash-hero" stripe="accent" dataTut="dashboard-hero">
          <div className="dash-hero-text">
            <div className="dash-hero-label">{hero.label}</div>
            {hero.sublabel ? (
              <div className="dash-hero-sub">{hero.sublabel}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="dash-hero-btn"
            onClick={() => nav(hero.linkTarget)}
          >
            {hero.label || "Continue"}
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        </ModuleCard>
      ) : loading ? (
        <ModuleCard className="dash-hero dash-skeleton" stripe="accent">
          <div className="dash-skel-line dash-skel-lg" />
          <div className="dash-skel-line" />
        </ModuleCard>
      ) : null}

      {/* ── TOP BAND: identity + vitals ── */}
      <div className="dash-band">
        {/* Identity strip — click to open your full profile */}
        <ModuleCard className="dash-identity" dataTut="dashboard-identity" onClick={onOpenCareerProfile}>
          <div className="dash-identity-info">
            <div className="dash-identity-name">
              {firstName}
              {nickname ? <span className="dash-identity-nick"> "{nickname}" </span> : " "}
              {lastName}
            </div>
            <div className="dash-identity-meta">
              <span className="dash-ovr-badge">OVR {ovr}</span>
              <span className="dash-tier">{tier}</span>
              {fameTierLabel ? (
                <span className="dash-fame-tier">{fameTierLabel}</span>
              ) : null}
            </div>
            <div className="dash-identity-record">
              {wins}W – {losses}L{draws ? ` – ${draws}D` : ""}
            </div>
          </div>
        </ModuleCard>

        {/* Vitals */}
        <ModuleCard className="dash-vitals">
          {vitals ? (
            <>
              {(() => {
                // Drive energy from the LIVE fighter prop — the same object the side
                // panel reads, polled in sync by App. vitals.energy is a one-shot
                // snapshot from the dashboard fetch (no polling) and would otherwise
                // drift behind the sidebar as energy regenerates. Fall back to the
                // snapshot only if the live value is unavailable.
                const liveEnergy =
                  fighter?.energy && typeof fighter.energy === "object" ? fighter.energy : null;
                const cur = liveEnergy?.current ?? vitals.energy?.current ?? 0;
                const max = liveEnergy?.max ?? vitals.energy?.max ?? 100;
                const pct = max > 0 ? (cur / max) * 100 : 0;
                // Recompute eta + state from the live value so they match the number
                // (server formula: +1 energy/min; "low" below the tier's per-fight cost).
                const fightCost = FIGHT_ENERGY_COST[tier] ?? 10;
                const energyState = cur <= 0 ? "empty" : cur < fightCost ? "low" : "ok";
                const eta = formatEta(Math.max(0, max - cur));
                const stateClass =
                  energyState === "empty"
                    ? "is-empty"
                    : energyState === "low"
                      ? "is-low"
                      : "is-ok";
                return (
                  <VitalBar
                    icon={<Zap size={13} strokeWidth={2.2} />}
                    label="Energy"
                    pct={pct}
                    stateClass={`dash-energy ${stateClass}`}
                    statusText={`${cur}/${max}`}
                    etaText={eta ? `Full in ${eta}` : "Rested"}
                  />
                );
              })()}
              {(() => {
                const h = vitals.health ?? {};
                const val = h.value ?? 0;
                const eta = formatEta(h.etaMinutes);
                const stateClass =
                  h.state === "critical"
                    ? "is-critical"
                    : h.state === "hurt"
                      ? "is-hurt"
                      : "is-ok";
                const hLabel = h.injuriesActive
                  ? "Injured"
                  : h.state === "hurt" || h.state === "critical"
                    ? "Banged up"
                    : "Healthy";
                return (
                  <VitalBar
                    icon={<HeartPulse size={13} strokeWidth={2.2} />}
                    label="Health"
                    pct={val}
                    stateClass={`dash-health ${stateClass}`}
                    statusText={hLabel}
                    etaText={eta ? `Full in ${eta}` : null}
                    onClick={() => nav("hospital")}
                  />
                );
              })()}
              {vitals.mentalResetRequired ? (
                <button
                  type="button"
                  className="dash-flag-chip"
                  onClick={() => nav("hospital")}
                >
                  <Brain size={12} strokeWidth={2.2} /> Mental reset required
                </button>
              ) : null}
            </>
          ) : loading ? (
            <>
              <div className="dash-skel-line" />
              <div className="dash-skel-line" />
            </>
          ) : (
            <p className="dash-muted">Vitals unavailable.</p>
          )}
        </ModuleCard>
      </div>

      {/* ── ERROR (identity stays visible above) ── */}
      {error && !data ? (
        <ModuleCard className="dash-error">
          <span className="dash-error-text">
            <AlertTriangle size={14} strokeWidth={2.2} /> {error}
          </span>
          <button type="button" className="dash-retry-btn" onClick={reload}>
            <RotateCcw size={13} strokeWidth={2.2} /> Retry
          </button>
        </ModuleCard>
      ) : null}

      {/* ── CAMP ── */}
      {camp ? (
        <ModuleCard
          className="dash-camp"
          stripe={camp.isTitleFight ? "gold" : "accent"}
          onClick={() => nav("fights")}
        >
          <div className="dash-card-head">
            <span className="dash-card-title">
              <Tent size={14} strokeWidth={2.2} />
              Fight Camp
            </span>
            {camp.isTitleFight ? <span className="dash-title-badge">Title Fight</span> : null}
          </div>
          <div className="dash-camp-progress">
            Sessions: {camp.slotsUsed ?? 0}/{camp.maxSlots ?? 0}
            {camp.previewGrade ? (
              <span className="dash-camp-grade"> · Grade {camp.previewGrade}</span>
            ) : null}
            {camp.finalised ? <span className="dash-camp-final"> · Finalised</span> : null}
          </div>
          <button type="button" className="dash-card-btn" onClick={() => nav("fights")}>
            Go to Camp <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </ModuleCard>
      ) : null}

      {/* ── STATS & XP ── */}
      {statRows.length ? (
        <ModuleCard className="dash-stats" onClick={() => nav("gym")}>
          <div className="dash-card-head">
            <span className="dash-card-title">
              <BarChart3 size={14} strokeWidth={2.2} />
              Stats &amp; XP
            </span>
            <span className="dash-stats-ovr">OVR {ovr}</span>
          </div>
          <div className="dash-stats-grid">
            {statRows.map((r) => (
              <div
                className="dash-stat-row"
                key={r.name}
                title={r.xpLine ? `${r.tooltip} — ${r.xpLine}` : r.tooltip}
              >
                <span className="dash-stat-name">{r.name}</span>
                <span className="dash-stat-value">{r.value}</span>
                <div className="dash-stat-bar-track">
                  <div
                    className="dash-stat-bar-fill"
                    style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ModuleCard>
      ) : null}

      {/* ── INJURIES ── */}
      {injuries.length ? (
        (() => {
          // Worst / soonest: cannotFight first, then fewest recovery hours left.
          const sorted = [...injuries].sort((a, b) => {
            if (!!b.cannotFight !== !!a.cannotFight) return b.cannotFight ? 1 : -1;
            return (a.recoveryHoursLeft ?? Infinity) - (b.recoveryHoursLeft ?? Infinity);
          });
          const worst = sorted[0];
          const anyCannotFight = injuries.some((i) => i.cannotFight);
          return (
            <ModuleCard
              className="dash-injuries"
              stripe="amber"
              onClick={() => nav("hospital")}
            >
              <div className="dash-card-head">
                <span className="dash-card-title">
                  <Stethoscope size={14} strokeWidth={2.2} />
                  {injuries.length} Injur{injuries.length === 1 ? "y" : "ies"}
                </span>
                {anyCannotFight ? (
                  <span className="dash-warn-badge">Cannot fight</span>
                ) : null}
              </div>
              <div className="dash-injuries-worst">
                {worst?.label ?? worst?.type ?? "Injury"}
                {worst?.recoveryHoursLeft != null
                  ? ` · recovers in ${Math.ceil(worst.recoveryHoursLeft)}h`
                  : ""}
              </div>
              <button type="button" className="dash-card-btn" onClick={() => nav("hospital")}>
                Visit Hospital <ChevronRight size={14} strokeWidth={2.4} />
              </button>
            </ModuleCard>
          );
        })()
      ) : null}

      {/* ── LOWER GRID: feed / ranking / resources / sponsorship / nudge ── */}
      <div className="dash-grid">
        {/* Career feed */}
        <ModuleCard className="dash-feed" onClick={() => nav("career")}>
          <div className="dash-card-head">
            <span className="dash-card-title">
              <FileText size={14} strokeWidth={2.2} />
              Recent Career
            </span>
          </div>
          {feed.length ? (
            <ul className="dash-feed-list">
              {feed.map((row, i) => (
                <li className="dash-feed-row" key={i}>
                  <span className="dash-feed-date">{feedDate(row.createdAt)}</span>
                  <span className="dash-feed-detail">{row.detail ?? "Event"}</span>
                </li>
              ))}
            </ul>
          ) : loading && !data ? (
            <div className="dash-skel-line" />
          ) : (
            <p className="dash-muted">No career events yet…</p>
          )}
          <button type="button" className="dash-card-btn" onClick={() => nav("career")}>
            View Career <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </ModuleCard>

        {/* Ranking */}
        <ModuleCard className="dash-ranking" onClick={() => nav("rankings")}>
          <div className="dash-card-head">
            <span className="dash-card-title">
              <ListOrdered size={14} strokeWidth={2.2} />
              Ranking
            </span>
            {ranking?.isTopFive ? (
              <span className="dash-title-badge">Title contender</span>
            ) : null}
          </div>
          {ranking && ranking.rank != null ? (
            <div className="dash-ranking-body">
              <span className="dash-rank-num">#{ranking.rank}</span>
              <span className="dash-rank-of">of {ranking.rosterSize ?? "—"}</span>
              {ranking.delta != null && ranking.delta !== 0 ? (
                <span
                  className={`dash-rank-delta ${ranking.delta > 0 ? "up" : "down"}`}
                >
                  {ranking.delta > 0 ? (
                    <TrendingUp size={12} strokeWidth={2.4} />
                  ) : (
                    <TrendingDown size={12} strokeWidth={2.4} />
                  )}
                  {Math.abs(ranking.delta)}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="dash-muted">
              Unranked — fight 3 in your tier to enter the rankings
            </p>
          )}
          <button type="button" className="dash-card-btn" onClick={() => nav("rankings")}>
            View Rankings <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </ModuleCard>

        {/* Money & Fame — display only */}
        <ModuleCard className="dash-money" stripe="gold">
          <div className="dash-card-head">
            <span className="dash-card-title">Money &amp; Fame</span>
            {(fameFrozen || fameDecaying) ? (
              <span className="dash-money-chips">
                {fameFrozen ? (
                  <span className="dash-money-chip is-frozen">
                    <Snowflake size={11} strokeWidth={2.2} /> Frozen
                  </span>
                ) : null}
                {fameDecaying ? (
                  <span className="dash-money-chip is-decay">
                    <AlertTriangle size={11} strokeWidth={2.2} /> Fame decaying
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="dash-money-iron">
            <Coins size={16} strokeWidth={2.2} />
            <span className="dash-iron-num">{Number(ironVal).toLocaleString()}</span>
            <span className="dash-iron-label">Cash</span>
          </div>

          <div className="dash-fame-block">
            <div className="dash-fame-head">
              <Star size={14} strokeWidth={2.2} />
              <span className="dash-fame-tier-label">{fameTier}</span>
              <span className="dash-fame-score">{Number(fameScore).toLocaleString()}</span>
            </div>
            <div className="dash-bar-track">
              <div className="dash-bar-fill dash-fame-fill" style={{ width: `${fameBarWidth}%` }} />
            </div>
            <div className="dash-fame-context">{fameContext}</div>
            {pursePct > 0 ? (
              <div className="dash-fame-purse">+{pursePct}% fight purses</div>
            ) : null}
          </div>
        </ModuleCard>

        {/* Sponsorship */}
        {sponsorship ? (
          <ModuleCard
            className="dash-sponsorship"
            stripe="amber"
            onClick={() => nav("contracts")}
          >
            <div className="dash-card-head">
              <span className="dash-card-title">
                <ScrollText size={14} strokeWidth={2.2} />
                Sponsorship
              </span>
            </div>
            <div className="dash-sponsor-brand">{sponsorship.brand}</div>
            {sponsorship.progressText ? (
              <div className="dash-sponsor-progress">{sponsorship.progressText}</div>
            ) : null}
            {sponsorship.rewardPerFight != null ? (
              <div className="dash-sponsor-reward">
                {sponsorship.rewardPerFight} / fight
              </div>
            ) : null}
            <button type="button" className="dash-card-btn" onClick={() => nav("contracts")}>
              View Contracts <ChevronRight size={14} strokeWidth={2.4} />
            </button>
          </ModuleCard>
        ) : null}

        {/* Nudge — always present */}
        {nudge ? (
          <ModuleCard
            className="dash-nudge"
            onClick={() => nav(nudge.linkTarget)}
          >
            <span className="dash-nudge-text">{nudge.text}</span>
            <ChevronRight size={14} strokeWidth={2.4} />
          </ModuleCard>
        ) : null}
      </div>
    </section>
  );
});
