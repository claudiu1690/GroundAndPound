import { memo, useState } from "react";
import { t } from "@/lib/i18n";
import { useDashboard } from "../../hooks/useDashboard";
import { PvpSeasonCountdown } from "./PvpSeasonCountdown";
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
  Crosshair,
} from "lucide-react";
import { tierLabel } from "../../constants/fame";
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants";
import { GazetteModal } from "../gazette/GazetteModal";

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

/** Relative time label from an ISO date string — "2h ago", "3d ago", etc. */
function relativeTime(iso) {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ""; }
}

/** Derive result pill text and color class from leadStory.resultBand */
function gazetteResultPill(leadStory) {
  const band = leadStory?.resultBand;
  if (!band?.outcomeLabel) return null;
  const label = band.outcomeLabel;
  const method = band.methodRound ? ` · ${band.methodRound}` : "";
  const text = `${label}${method}`;
  const l = label.toLowerCase();
  const cls = l.includes("win") || l.includes("victor") ? "gz-tile-pill--win"
    : l.includes("loss") || l.includes("defeat") ? "gz-tile-pill--loss"
    : "gz-tile-pill--draw";
  return { text, cls };
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

  // Gazette modal state — owned here
  const [gazetteOpen, setGazetteOpen] = useState(false);

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
    fameContext = t("dashboard.moneyFame.topTierReached");
    fameBarFull = true;
  } else if (nextKey == null) {
    fameContext = t("dashboard.moneyFame.keepFighting");
    fameBarFull = false;
  } else {
    fameContext = t("dashboard.moneyFame.toNextTier", { remaining: Math.max(0, nextTh - fameScore).toLocaleString(), tier: tierLabel(nextKey) });
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
  const pvp = data?.pvp ?? null;
  const sponsorship = data?.sponsorship ?? null;

  // Pre-season: render a live countdown on the tile while the season is "upcoming".
  const pvpUpcoming = (pvp?.status === "upcoming" && pvp.startsAt)
    ? { startsAt: pvp.startsAt, seasonLabel: pvp.seasonLabel }
    : null;
  const nudge = data?.nudge ?? null;

  // ── Gazette tile data ──────────────────────────────────────────────────────
  const gazette = fighter?.gazette ?? null;
  const gazetteEmpty = !gazette?.issueNumber || !gazette?.leadStory;
  const leadStory = gazette?.leadStory ?? null;
  const resultPill = gazetteResultPill(leadStory);
  const gazetteTeaser = leadStory?.bodyParagraphs?.[0]
    ? leadStory.bodyParagraphs[0].split(/[.!?]/)[0] + "."
    : (leadStory?.deck ?? null);
  const secondaryBullets = Array.isArray(gazette?.sidebarItems)
    ? gazette.sidebarItems.slice(0, 3)
    : [];

  return (
    <section className="dashboard-tab" data-tut="dashboard-root">

      {/* ── 3-UP TOP ROW: Gazette · Rankings · Proving Ground ── */}
      <div className="dash-top-row">

        {/* Gazette tile */}
        <div
          className="dash-gz-tile"
          onClick={() => setGazetteOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setGazetteOpen(true); } }}
          aria-label={t("dashboard.gazette.openAriaLabel")}
        >
          {/* top accent bar rendered via CSS ::before */}
          <div className="dash-gz-masthead">
            <span className="dash-gz-name">{t("dashboard.gazette.mastheadName")}</span>
            {gazette?.updatedAt && (
              <span className="dash-gz-date">{relativeTime(gazette.updatedAt)}</span>
            )}
          </div>

          {gazetteEmpty ? (
            <div className="dash-gz-empty">
              {t("dashboard.gazette.empty")}
            </div>
          ) : (
            <>
              {resultPill && (
                <div className={`dash-gz-pill ${resultPill.cls}`}>{resultPill.text}</div>
              )}
              {leadStory?.headline && (
                <div className="dash-gz-headline">{leadStory.headline}</div>
              )}
              {gazetteTeaser && (
                <div className="dash-gz-teaser">{gazetteTeaser}</div>
              )}
              {secondaryBullets.length > 0 && (
                <>
                  <div className="dash-gz-divider" />
                  <ul className="dash-gz-bullets">
                    {secondaryBullets.map((item, i) => (
                      <li key={i} className="dash-gz-bullet-item">
                        <span
                          className="dash-gz-bullet-dot"
                          style={{ background: item.categoryColor || "var(--c-accent)" }}
                        />
                        <span className="dash-gz-bullet-text">{item.headline || item.body}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <div className="dash-gz-footer">
            <span className="dash-gz-cta">{t("dashboard.gazette.footerCta")}</span>
            {gazette?.updatedAt && (
              <span className="dash-gz-updated">{t("dashboard.gazette.footerUpdated", { time: relativeTime(gazette.updatedAt) })}</span>
            )}
          </div>
        </div>

        {/* Rankings tile */}
        <div
          className="dash-top-tile dash-top-tile--rankings"
          onClick={() => nav("rankings")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav("rankings"); } }}
        >
          <div className="rnk-eye">{t("dashboard.rankings.label")}</div>

          {ranking?.rank != null ? (
            <>
              <div className="rnk-main">
                <span className="rnk-num">#{ranking.rank}</span>
                <span className="rnk-of">{t("dashboard.rankings.ofTotal", { n: ranking.rosterSize ?? "—" })}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "11px", color: "#666" }}>
                  {ranking.division ? `${ranking.division} ${t("dashboard.rankings.divisionSuffix")}` : ""}
                </span>
                {ranking.delta != null && ranking.delta !== 0 ? (
                  <span className={`rnk-move${ranking.delta > 0 ? " rnk-move--up" : ""}`}>
                    {ranking.delta > 0
                      ? `↑ +${ranking.delta} ${t("dashboard.rankings.thisSession")}`
                      : `↓ −${Math.abs(ranking.delta)} ${t("dashboard.rankings.thisSession")}`}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div className="dash-top-tile-muted" style={{ marginBottom: "8px" }}>{t("dashboard.rankings.unranked")}</div>
          )}

          <div className="rnk-divider" />

          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "#666", marginBottom: "8px" }}>
            {t("dashboard.rankings.titleShotConditions")}
          </div>

          {ranking?.titleShot ? (
            <div className="rnk-checks">
              <div className={`rnk-check${ranking.titleShot.ovrMet ? " done" : ""}`}>
                <span className={`rnk-check-icon${ranking.titleShot.ovrMet ? "" : " x"}`}>
                  {ranking.titleShot.ovrMet ? "✓" : "✗"}
                </span>
                {t("dashboard.rankings.conditionOvr")}
              </div>
              <div className={`rnk-check${ranking.titleShot.topFive ? " done" : ""}`}>
                <span className={`rnk-check-icon${ranking.titleShot.topFive ? "" : " x"}`}>
                  {ranking.titleShot.topFive ? "✓" : "✗"}
                </span>
                {t("dashboard.rankings.conditionTopFive")}
                {ranking.rank != null && (
                  <span className="rnk-check-hint">{t("dashboard.rankings.topFiveHint", { rank: ranking.rank })}</span>
                )}
              </div>
              <div className={`rnk-check${ranking.titleShot.winsMet ? " done" : ""}`}>
                <span className={`rnk-check-icon${ranking.titleShot.winsMet ? "" : " x"}`}>
                  {ranking.titleShot.winsMet ? "✓" : "✗"}
                </span>
                {t("dashboard.rankings.conditionWins")}
                <span className="rnk-check-hint">
                  {t("dashboard.rankings.winsHint", { won: ranking.titleShot.winsInTier ?? 0, need: ranking.titleShot.titleWins ?? 0 })}
                </span>
              </div>
            </div>
          ) : (
            <div className="rnk-checks" />
          )}

          <div className="rnk-link">{t("dashboard.rankings.viewCta")}</div>
        </div>

        {/* Proving Ground tile */}
        <div
          className="dash-top-tile dash-top-tile--pvp"
          onClick={() => nav("pvp")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav("pvp"); } }}
        >
          {pvpUpcoming ? (
            <>
              <div className="pvp-eye">{t("dashboard.provingGround.label")}</div>
              <div className="pvp-title">{t("dashboard.provingGround.title")}</div>
              <div className="pvp-season">{pvpUpcoming.seasonLabel}</div>
              <PvpSeasonCountdown startsAt={pvpUpcoming.startsAt} />
              <div className="pvp-link">{t("dashboard.provingGround.cta")}</div>
            </>
          ) : pvp != null ? (
            <>
              <div className="pvp-eye">{t("dashboard.provingGround.label")}</div>
              <div className="pvp-title">{t("dashboard.provingGround.title")}</div>
              <div className="pvp-season">{pvp.seasonLabel}</div>
              <div className="pvp-divider" />
              <div className="pvp-stats">
                <div className="pvp-stat">
                  <div className="pvp-stat-val" style={{ color: "#4ADE80" }}>{pvp.wins}</div>
                  <div className="pvp-stat-lbl">{t("dashboard.provingGround.statWins")}</div>
                </div>
                <div className="pvp-stat">
                  <div className="pvp-stat-val" style={{ color: "#C8102E" }}>{pvp.losses}</div>
                  <div className="pvp-stat-lbl">{t("dashboard.provingGround.statLosses")}</div>
                </div>
                <div className="pvp-stat">
                  <div className="pvp-stat-val" style={{ color: "#D4A820" }}>{pvp.dp}</div>
                  <div className="pvp-stat-lbl">{t("dashboard.provingGround.statDp")}</div>
                </div>
              </div>
              {pvp.crossWeightClass && (
                <div className="pvp-badge">● {t("dashboard.provingGround.openBadge")}</div>
              )}
              {pvp.weeksRemaining != null && (
                <div className="pvp-time">
                  <span>{pvp.weeksRemaining}</span> {t("dashboard.provingGround.weeksRemaining")}
                </div>
              )}
              <div className="pvp-link">{t("dashboard.provingGround.cta")}</div>
            </>
          ) : (
            <>
              <div className="pvp-eye">{t("dashboard.provingGround.label")}</div>
              <div className="pvp-title">{t("dashboard.provingGround.title")}</div>
              <div className="pvp-season" style={{ color: "#666" }}>{t("dashboard.provingGround.seasonNotActive")}</div>
              <div className="pvp-link">{t("dashboard.provingGround.cta")}</div>
            </>
          )}
        </div>
      </div>

      {/* Gazette modal */}
      <GazetteModal
        open={gazetteOpen}
        gazette={gazette}
        onClose={() => setGazetteOpen(false)}
        onNavigate={(t) => { setGazetteOpen(false); nav(t); }}
      />

      {/* ── HERO CTA (priority element; first on mobile) ── */}
      {hero ? (
        <ModuleCard className="dash-hero" stripe={hero?.key === "comeback_fight" || hero?.key === "comeback_nemesis" ? "amber" : "accent"} dataTut="dashboard-hero">
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
            {hero.label || t("dashboard.hero.defaultLabel")}
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
                    label={t("dashboard.vitals.energyLabel")}
                    pct={pct}
                    stateClass={`dash-energy ${stateClass}`}
                    statusText={`${cur}/${max}`}
                    etaText={eta ? t("dashboard.vitals.energyFullIn", { eta }) : t("dashboard.vitals.energyRested")}
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
                  ? t("dashboard.vitals.healthInjured")
                  : h.state === "hurt" || h.state === "critical"
                    ? t("dashboard.vitals.healthBangedUp")
                    : t("dashboard.vitals.healthHealthy");
                return (
                  <VitalBar
                    icon={<HeartPulse size={13} strokeWidth={2.2} />}
                    label={t("dashboard.vitals.healthLabel")}
                    pct={val}
                    stateClass={`dash-health ${stateClass}`}
                    statusText={hLabel}
                    etaText={eta ? t("dashboard.vitals.healthFullIn", { eta }) : null}
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
                  <Brain size={12} strokeWidth={2.2} /> {t("dashboard.vitals.mentalResetChip")}
                </button>
              ) : null}
            </>
          ) : loading ? (
            <>
              <div className="dash-skel-line" />
              <div className="dash-skel-line" />
            </>
          ) : (
            <p className="dash-muted">{t("dashboard.vitals.unavailable")}</p>
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
            <RotateCcw size={13} strokeWidth={2.2} /> {t("dashboard.error.retry")}
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
              {t("dashboard.camp.title")}
            </span>
            {camp.isTitleFight ? <span className="dash-title-badge">{t("dashboard.camp.titleFightBadge")}</span> : null}
          </div>
          <div className="dash-camp-progress">
            {t("dashboard.camp.sessions", { used: camp.slotsUsed ?? 0, max: camp.maxSlots ?? 0 })}
            {camp.previewGrade ? (
              <span className="dash-camp-grade"> · {t("dashboard.camp.grade", { grade: camp.previewGrade })}</span>
            ) : null}
            {camp.finalised ? <span className="dash-camp-final"> · {t("dashboard.camp.finalised")}</span> : null}
          </div>
          <button type="button" className="dash-card-btn" onClick={() => nav("fights")}>
            {t("dashboard.camp.cta")} <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </ModuleCard>
      ) : null}

      {/* ── STATS & XP ── */}
      {statRows.length ? (
        <ModuleCard className="dash-stats" onClick={() => nav("gym")}>
          <div className="dash-card-head">
            <span className="dash-card-title">
              <BarChart3 size={14} strokeWidth={2.2} />
              {t("dashboard.stats.title")}
            </span>
            <span className="dash-stats-ovr">{t("dashboard.stats.ovrLabel", { ovr })}</span>
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
                  {injuries.length} {injuries.length === 1 ? t("dashboard.injuries.titleSingular") : t("dashboard.injuries.titlePlural")}
                </span>
                {anyCannotFight ? (
                  <span className="dash-warn-badge">{t("dashboard.injuries.cannotFightBadge")}</span>
                ) : null}
              </div>
              <div className="dash-injuries-worst">
                {worst?.label ?? worst?.type ?? t("dashboard.injuries.titleSingular")}
                {worst?.recoveryHoursLeft != null
                  ? ` · ${t("dashboard.injuries.recoversIn", { h: Math.ceil(worst.recoveryHoursLeft) })}`
                  : ""}
              </div>
              <button type="button" className="dash-card-btn" onClick={() => nav("hospital")}>
                {t("dashboard.injuries.cta")} <ChevronRight size={14} strokeWidth={2.4} />
              </button>
            </ModuleCard>
          );
        })()
      ) : null}

      {/* ── LOWER GRID: feed / resources / sponsorship / nudge ── */}
      <div className="dash-grid">
        {/* Career feed */}
        <ModuleCard className="dash-feed" onClick={() => nav("career")}>
          <div className="dash-card-head">
            <span className="dash-card-title">
              <FileText size={14} strokeWidth={2.2} />
              {t("dashboard.feed.title")}
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
            <p className="dash-muted">{t("dashboard.feed.noEvents")}</p>
          )}
          <button type="button" className="dash-card-btn" onClick={() => nav("career")}>
            {t("dashboard.feed.cta")} <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </ModuleCard>

        {/* Money & Fame — display only */}
        <ModuleCard className="dash-money" stripe="gold">
          <div className="dash-card-head">
            <span className="dash-card-title">{t("dashboard.moneyFame.title")}</span>
            {(fameFrozen || fameDecaying) ? (
              <span className="dash-money-chips">
                {fameFrozen ? (
                  <span className="dash-money-chip is-frozen">
                    <Snowflake size={11} strokeWidth={2.2} /> {t("dashboard.moneyFame.frozen")}
                  </span>
                ) : null}
                {fameDecaying ? (
                  <span className="dash-money-chip is-decay">
                    <AlertTriangle size={11} strokeWidth={2.2} /> {t("dashboard.moneyFame.fameDecaying")}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="dash-money-iron">
            <Coins size={16} strokeWidth={2.2} />
            <span className="dash-iron-num">{Number(ironVal).toLocaleString()}</span>
            <span className="dash-iron-label">{t("dashboard.moneyFame.cashLabel")}</span>
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
              <div className="dash-fame-purse">{t("dashboard.moneyFame.pursePct", { pct: pursePct })}</div>
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
                {t("dashboard.sponsorship.title")}
              </span>
            </div>
            <div className="dash-sponsor-brand">{sponsorship.brand}</div>
            {sponsorship.progressText ? (
              <div className="dash-sponsor-progress">{sponsorship.progressText}</div>
            ) : null}
            {sponsorship.rewardPerFight != null ? (
              <div className="dash-sponsor-reward">
                {t("dashboard.sponsorship.rewardPerFight", { reward: sponsorship.rewardPerFight })}
              </div>
            ) : null}
            <button type="button" className="dash-card-btn" onClick={() => nav("contracts")}>
              {t("dashboard.sponsorship.cta")} <ChevronRight size={14} strokeWidth={2.4} />
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
