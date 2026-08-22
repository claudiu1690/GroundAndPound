import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { api, authStorage } from "./api";
import { t } from "@/lib/i18n";
import "./App.css";
import { FighterProfile } from "./components/fighterProfile/FighterProfile";
import { BannerUnlockModal } from "./components/banner/BannerUnlockModal";
import { GymTraining, SESSION_META } from "./components/gym/GymTraining";
import { GymSelector } from "./components/gym/GymSelector";
import { ToastContainer } from "./components/gym/ToastContainer";
import { CampTab } from "./components/camp/CampTab";
import { TierUpOverlay, BeltWonOverlay } from "./components/fights/TierUpOverlay";
import { FightOffers } from "./components/fights/FightOffers";
import { FightCamp } from "./components/fights/FightCamp";
import { FighterReport } from "./components/fights/FighterReport";
import { FaceOff } from "./components/fights/FaceOff";
import { CampSummary } from "./components/fights/CampSummary";
import { FightDescription } from "./components/fights/FightDescription";
import { FightSummary } from "./components/fights/FightSummary";
import { ContenderModal } from "./components/fights/ContenderModal";
import { OctagonBackground } from "./components/layout/OctagonBackground";
import { CareerFeed } from "./components/CareerFeed";
import { CareerPage } from "./components/career/CareerPage";
import { prettifyBadgeId } from "./components/career/badgeCatalog";
import { AuthPage } from "./components/auth/AuthPage";
import { LandingPage } from "./components/landing/LandingPage";
import { FightLimitPopup } from "./components/fights/FightLimitPopup";
import { FameDrawer } from "./components/fame/FameDrawer";
import { ContractsTab } from "./components/contracts/ContractsTab";
import { MovesTab } from "./components/moves/MovesTab";
import { DropRevealModal } from "./components/moves/DropRevealModal";
import { MediaHub } from "./components/media/MediaHub";
import { PersonaMomentModal } from "./components/media/PersonaMomentModal";
import { PERSONA_MOMENT_EVENT } from "./components/media/personaMoments";
import { EventsTab } from "./components/events/EventsTab";
import { HospitalTab } from "./components/hospital/HospitalTab";
import { RankingsTab } from "./components/rankings/RankingsTab";
import { PostFightInterview } from "./components/fights/PostFightInterview";
import { TutorialOverlay } from "./components/tutorial/TutorialOverlay";
import { LibraryTab } from "./components/library/LibraryTab";
import { AccountTab } from "./components/account/AccountTab";
import { EmailVerifyBanner } from "./components/account/EmailVerifyBanner";
import { GuestBanner } from "./components/account/GuestBanner";
import { DashboardTab } from "./components/dashboard/DashboardTab";
import { ShopTab } from "./components/shop/ShopTab";
import { InventorySidebar } from "./components/shop/InventorySidebar";
import { CookieConsent } from "./components/legal/CookieConsent";
import { LegalModals } from "./components/legal/LegalModals";
import { ReportBugModal } from "./components/shared/ReportBugModal";
import { ChangelogModal } from "./components/changelog/ChangelogModal";
import { CHANGELOG_ENTRIES, CURRENT_VERSION } from "./components/changelog/changelogContent";
import { tutorialBus } from "./utils/tutorialBus";
import { TITLE_WINS } from "./constants/gameConstants";
import { useToasts } from "./hooks/useToasts";
import { PvpHub } from "./components/pvp/PvpHub";
import {
  LayoutDashboard,
  BookOpen,
  UserCircle2,
  Dumbbell,
  Swords,
  FileText,
  ListOrdered,
  ScrollText,
  Cross,
  ShoppingBag,
  CalendarDays,
  Mic,
  Menu,
  X,
  LogOut,
  Zap,
  Heart,
  CheckCircle2,
  Circle,
  ChevronRight,
  Trophy,
  Crosshair,
  Sparkles,
  Building2,
} from "lucide-react";

// ── Navigation definition ──────────────────────────────────
// Labels are resolved lazily at render time via t() so this array would be
// safe to define at module scope for i18n purposes alone — but Phase 2 (Your
// Camp) makes the "gym" item conditional on the `gymsRetired` flag, which is
// only known at runtime (learned from a 410 on the boot gyms call). A
// module-scope call froze that decision at first import forever, so the gym
// tab would never disappear in production even after the flag flips —
// this MUST be called from inside the component (see NAV_ITEMS useMemo below).
function buildNavItems({ gymsRetired = false } = {}) {
  return [
    { id: "home",      label: t("layout.nav.home"),          icon: <LayoutDashboard size={13} strokeWidth={2.2} />, active: true },
    // "The 10 gyms have closed" (contract §3.5 / P2-D1) — once GYMS_RETIRED
    // flips, this item drops out of the nav entirely (not disabled — gone).
    ...(gymsRetired ? [] : [
      { id: "gym",       label: t("layout.nav.training"),      icon: <Dumbbell size={13} strokeWidth={2.2} />,       active: true },
    ]),
    // Your Camp. While the gyms are open it sits right after Training as an alternative
    // training venue; once GYMS_RETIRED flips, Training is gone from the list above and this
    // becomes the first item under Home — and the ONLY place to train. Player-facing copy that
    // positions it ("right under Home") depends on that, so keep it directly after the
    // conditional block.
    { id: "camp",      label: t("layout.nav.yourCamp"),      icon: <Building2 size={13} strokeWidth={2.2} />,      active: true },
    // Special Moves sits with the "build your fighter" cluster — beside the training venue,
    // before Fight (train → kit out your moveset → go use it), not buried down by Shop.
    { id: "moves",     label: t("layout.nav.moves"),         icon: <Sparkles size={13} strokeWidth={2.2} />,       active: true },
    { id: "fights",    label: t("layout.nav.fight"),         icon: <Swords size={13} strokeWidth={2.2} />,         active: true },
    { id: "career",    label: t("layout.nav.career"),        icon: <FileText size={13} strokeWidth={2.2} />,       active: true },
    { id: "pvp",       label: t("layout.nav.provingGround"), icon: <Crosshair size={13} strokeWidth={2.2} />,      active: true },
    { id: "rankings",  label: t("layout.nav.rankings"),      icon: <ListOrdered size={13} strokeWidth={2.2} />,    active: true },
    { id: "contracts", label: t("layout.nav.contracts"),     icon: <ScrollText size={13} strokeWidth={2.2} />,     active: true },
    { id: "hospital",  label: t("layout.nav.hospital"),      icon: <Cross size={13} strokeWidth={2.2} />,          active: true },
    { id: "shop",      label: t("layout.nav.shop"),          icon: <ShoppingBag size={13} strokeWidth={2.2} />,    active: true },
    { id: "events",    label: t("layout.nav.events"),        icon: <CalendarDays size={13} strokeWidth={2.2} />,   active: true },
    { id: "media",     label: t("layout.nav.media"),         icon: <Mic size={13} strokeWidth={2.2} />,            active: true },
    { id: "library",   label: t("layout.nav.library"),       icon: <BookOpen size={13} strokeWidth={2.2} />,       active: true },
  ];
}

// ── Changelog / What's New ──────────────────────────────────
const LAST_SEEN_VERSION_KEY = "gnp_last_seen_version";

// ── Tier ladder for display ────────────────────────────────
const TIER_LADDER_DISPLAY = [
  { id: "Amateur",        label: "Amateur",       minOvr: 0,  nextOvr: 30 },
  { id: "Regional Pro",   label: "Regional Pro",  minOvr: 30, nextOvr: 45 },
  { id: "National",       label: "National",      minOvr: 45, nextOvr: 60 },
  { id: "GCS Contender",  label: "GCS Contender", minOvr: 60, nextOvr: 62 },
  { id: "GCS",            label: "GCS",           minOvr: 62, nextOvr: null },
];


// ── Fighter card (dashboard) ────────────────────────────────
/** Derive a stable 1-20 photo index from the fighter's Mongo _id string */
function fighterPhotoIndex(id) {
  if (!id) return 1;
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (sum % 20) + 1;
}

// NOTE: FighterCard/QuickActions below are not currently rendered anywhere in
// this file (superseded by DashboardTab) — kept in sync with the gymsRetired
// flag anyway per the Phase 2 contract so they aren't a stale trap if ever
// revived.
function FighterCard({ fighter, gymsRetired }) {
  const rec = fighter?.record ?? {};
  const gym = fighter?.gymId;
  const gymName = gymsRetired ? t("layout.nav.yourCamp") : (gym?.name ?? (typeof gym === "string" ? "—" : "—"));

  // Use beaten portrait if the fighter is in comeback mode (= last fight was a loss)
  const isBeaten = !!(fighter?.comebackMode || fighter?.consecutiveLosses > 0);
  const photoIdx = fighterPhotoIndex(fighter?._id);
  const paddedIdx = String(photoIdx).padStart(2, "0");
  const photoSrc = fighter
    ? isBeaten
      ? `/fighters_beaten_200x250/fighter_beaten_${paddedIdx}.png`
      : `/fighters_200x250/fighter_${paddedIdx}.png`
    : null;

  return (
    <div className="fighter-card">
      <div className="fighter-card-photo">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={`${fighter.firstName} ${fighter.lastName}`}
            className="fighter-card-img"
            draggable="false"
          />
        ) : (
          <div className="fighter-card-avatar">?</div>
        )}
      </div>

      <div className="fighter-card-info">
        <div className="fighter-card-name">
          {fighter
            ? `${fighter.firstName} "${fighter.nickname || "—"}" ${fighter.lastName}`
            : t("layout.fighterCard.noFighterSelected")}
        </div>

        <div className="fighter-card-meta">
          <span>{t("layout.fighterCard.record")} <strong>{rec.wins ?? 0}W – {rec.losses ?? 0}L</strong></span>
          <span>{t("layout.fighterCard.ovr")} <strong className="text-red">{fighter?.overallRating ?? "—"}</strong></span>
          <span>{fighter?.promotionTier ?? "Amateur"}</span>
        </div>

        <div className="fighter-card-bars">
          {[
            { label: t("layout.fighterCard.energy"), val: fighter?.energy ?? 100, max: 100, color: "#3b82f6", tip: t("layout.fighterCard.energyTooltip") },
            { label: t("layout.fighterCard.health"), val: fighter?.health ?? 100, max: 100, color: "#e31837", tip: t("layout.fighterCard.healthTooltip") },
          ].map(({ label, val, max, color, tip }) => {
            const pct = Math.min(100, Math.round((val / max) * 100));
            return (
              <div key={label} className="fc-bar-row" title={tip}>
                <span className="fc-bar-label">{label}:</span>
                <div className="fc-bar-wrap">
                  <div className="fc-bar-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="fighter-card-footer">
          <span>${fighter?.iron ?? 0}</span>
          <span>{gymsRetired ? t("layout.nav.yourCamp") : `Gym: ${gymName}`}</span>
          <span className="fighter-card-fame">
            {fighter?.notoriety?.tierLabel && (
              <span className={`fc-tier fc-tier-${fighter.notoriety.peakTier}`}>{fighter.notoriety.tierLabel}</span>
            )}
            <span className="fc-fame-score">{(fighter?.notoriety?.score ?? 0).toLocaleString()}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Quick actions ────────────────────────────────────────────
const QuickActions = memo(function QuickActions({ onNavigate, gymsRetired }) {
  return (
    <div className="quick-actions-section">
      <div className="quick-actions-title">{t("layout.quickActions.title")}</div>
      <div className="quick-actions">
        <button className="qa-btn qa-train" onClick={() => onNavigate(gymsRetired ? "camp" : "gym")}>{t("layout.quickActions.train")}</button>
        <button className="qa-btn qa-fight" onClick={() => onNavigate("fights")}>{t("layout.quickActions.fight")}</button>
      </div>
    </div>
  );
});

// ── Tier progress (right panel) ─────────────────────────────
const GATED_TIERS = new Set(["Amateur", "Regional Pro", "National", "GCS"]);

const TierProgress = memo(function TierProgress({ fighter, champions }) {
  if (!fighter) return null;
  const currentTier = fighter.promotionTier ?? "Amateur";
  const ovr = fighter.overallRating ?? 0;
  const currentIdx = TIER_LADDER_DISPLAY.findIndex((t) => t.id === currentTier);
  const next = TIER_LADDER_DISPLAY[currentIdx + 1] ?? null;
  const current = TIER_LADDER_DISPLAY[currentIdx] ?? TIER_LADDER_DISPLAY[0];
  const pct = next
    ? Math.min(100, Math.round(((ovr - current.minOvr) / (next.minOvr - current.minOvr)) * 100))
    : 100;

  const pending = fighter.pendingPromotion;
  const wins = fighter.winsInCurrentTier ?? 0;
  const cooldown = fighter.titleShotCooldown ?? 0;
  const titleWins = TITLE_WINS[currentTier] ?? 3;
  const rank = fighter.ranking?.rank ?? null;
  const top5 = rank != null && rank <= 5;
  const titleReady = pending && top5 && wins >= titleWins && cooldown <= 0;
  const titleCooldown = pending && cooldown > 0;
  const titleWinsNeeded = pending && cooldown <= 0 && top5 && wins < titleWins;

  // Find champion for the current gated tier
  const currentChamp = (champions ?? []).find((c) => c.championTier === currentTier);

  return (
    <section className="rp-panel">
      <h3 className="panel-title">{t("layout.tierProgress.title")}</h3>
      <div className="panel-body">
        <div className="tier-steps">
          {TIER_LADDER_DISPLAY.map((tier, i) => {
            const done   = i < currentIdx;
            const active = tier.id === currentTier;
            const champ = (champions ?? []).find((c) => c.championTier === tier.id);
            return (
              <div key={tier.id} className={`tier-step ${active ? "tier-active" : done ? "tier-done" : "tier-locked"}`}>
                {done ? <CheckCircle2 size={10} /> : active ? <ChevronRight size={10} /> : <Circle size={10} />} {tier.label}
                {!done && !active && tier.minOvr > 0 && <span style={{ color: "var(--text-muted)", marginLeft: "0.3rem", fontSize: "9px" }}>OVR {tier.minOvr}+</span>}
                {GATED_TIERS.has(tier.id) && champ && !done && (
                  <span style={{ color: "var(--gold-bright)", marginLeft: "0.3rem", fontSize: "9px" }}>
                    {t("layout.tierProgress.champLabel", { name: champ.name, ovr: champ.overallRating })}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Title shot status messages */}
        {titleReady && (
          <div className="tier-title-status tier-title-ready">
            <Trophy size={12} /> {t("layout.tierProgress.titleShotAvailable")}
          </div>
        )}
        {titleCooldown && (
          <div className="tier-title-status tier-title-cooldown">
            {t("layout.tierProgress.titleShotCooldown", { count: cooldown, suffix: cooldown !== 1 ? "s" : "" })}
          </div>
        )}
        {titleWinsNeeded && (
          <div className="tier-title-status tier-title-wins">
            {t("layout.tierProgress.titleWinsNeeded", { count: titleWins - wins, suffix: titleWins - wins !== 1 ? "s" : "" })}
          </div>
        )}

        {/* Standard OVR progress (only when no pending promotion) */}
        {!pending && next ? (
          <div className="tier-progress-wrap">
            <div className="tier-progress-label">
              <span>{"\u2192"} {next.label}</span>
              <span>OVR {ovr} / {next.minOvr}</span>
            </div>
            <div className="tier-progress-bar">
              <div className="tier-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : !pending && !next ? (
          <div style={{ fontSize: "12px", color: "var(--gold-bright)", fontWeight: 700, marginTop: "0.5rem" }}>
            {t("layout.tierProgress.gcsChampion")}
          </div>
        ) : null}
      </div>
    </section>
  );
});

// ── Right column panels ─────────────────────────────────────
const RightPanels = memo(function RightPanels({ fighter, lastFightSummary, campSlotsUsed, champions }) {
  const hasInjuries = fighter?.injuries?.length > 0;
  const inCamp = !!fighter?.acceptedFightId;
  const campSessions = campSlotsUsed ?? fighter?.trainingCampActions ?? 0;

  return (
    <>
      {/* Latest Fight Result */}
      <section className="rp-panel">
        <h3 className="panel-title">{t("layout.rightPanels.latestFight.title")}</h3>
        <div className="panel-body">
          {lastFightSummary ? (
            <>
              <div className={`rp-outcome ${["KO/TKO","Submission","Decision (unanimous)","Decision (split)"].includes(lastFightSummary.outcome) ? "rp-win" : "rp-loss"}`}>
                {lastFightSummary.outcome}
              </div>
              <div className="rp-detail">{t("layout.rightPanels.latestFight.recordLabel", { record: lastFightSummary.recordAfter })}</div>
              <div className="rp-detail">{t("layout.rightPanels.latestFight.cashEarned", { amount: lastFightSummary.ironEarned ?? 0 })}</div>
              <div className="rp-detail">{t("layout.rightPanels.latestFight.xpMultiplier", { xp: lastFightSummary.xpMultiplier })}</div>
              {lastFightSummary.promoted && (
                <div className="rp-promoted">{t("layout.rightPanels.latestFight.promoted", { tier: lastFightSummary.promoted.to })}</div>
              )}
              {lastFightSummary.injuriesSustained?.length > 0 && (
                <div className="rp-detail" style={{ color: "#fbbf24", marginTop: "0.25rem" }}>
                  {t("layout.rightPanels.latestFight.injury", { injuries: lastFightSummary.injuriesSustained.join(", ") })}
                </div>
              )}
            </>
          ) : (
            <p className="panel-hint">{t("layout.rightPanels.latestFight.noData")}</p>
          )}
        </div>
      </section>

      {/* Status */}
      <section className="rp-panel">
        <h3 className="panel-title">{t("layout.rightPanels.gameNews.title")}</h3>
        <div className="panel-body">
          <ul className="status-list">
            <li className={`sl-item ${inCamp ? "sl-active" : ""}`}>
              {t("layout.rightPanels.gameNews.fightCamp", { status: inCamp ? t("layout.rightPanels.gameNews.fightCampSessions", { count: campSessions, suffix: campSessions === 1 ? "" : "s" }) : t("layout.rightPanels.gameNews.fightCampNone") })}
            </li>
            <li className={`sl-item ${fighter?.comebackMode ? "sl-warn" : ""}`}>
              {t("layout.rightPanels.gameNews.comebackMode", { status: fighter?.comebackMode ? t("layout.rightPanels.gameNews.comebackActive") : t("layout.rightPanels.gameNews.comebackInactive") })}
            </li>
            <li className={`sl-item ${hasInjuries ? "sl-danger" : ""}`}>
              {t("layout.rightPanels.gameNews.injuries", { status: hasInjuries ? fighter.injuries.map((i) => i.label).join(", ") : t("layout.rightPanels.gameNews.injuriesNone") })}
            </li>
            <li className="sl-item">
              {t("layout.rightPanels.gameNews.energyRegen")}
            </li>
          </ul>
        </div>
      </section>

      {/* Tier competition */}
      <TierProgress fighter={fighter} champions={champions} />
    </>
  );
});

/**
 * Two-view gym system: selector grid → training view inside gym.
 */
const GymTrainingTab = memo(function GymTrainingTab({ fighter, gyms, onTrain, training, onSwitchGym, onRankUp, flashSessionKey }) {
  // Default to the fighter's active gym (if membership is active), otherwise show gym selector
  const activeGymFromMembership = gyms?.find((g) => g.membership?.isActive);
  const freeGym = gyms?.find((g) => g.isFreeGym);
  const defaultGymId = activeGymFromMembership?._id ?? freeGym?._id ?? null;

  const [selectedGymId, setSelectedGymId] = useState(defaultGymId);
  const [showSelector, setShowSelector] = useState(false);

  // Update default when gyms/fighter change (e.g., after switching gym)
  useEffect(() => {
    if (showSelector) return; // don't override if user is browsing gyms
    const active = gyms?.find((g) => g.membership?.isActive);
    if (active) setSelectedGymId(active._id);
  }, [gyms, fighter?.activeGymId]);

  const selectedGym = selectedGymId ? gyms?.find((g) => String(g._id) === String(selectedGymId)) : null;

  const handleTrain = useCallback((sessionKey, quantity) => {
    if (!selectedGymId) return;
    onTrain(selectedGymId, sessionKey, quantity);
  }, [onTrain, selectedGymId]);

  if (showSelector || !selectedGym) {
    return (
      <GymSelector
        gyms={gyms}
        fighter={fighter}
        onSelectGym={(id) => { setSelectedGymId(id); setShowSelector(false); }}
      />
    );
  }

  return (
    <GymTraining
      gym={selectedGym}
      fighter={fighter}
      allGyms={gyms}
      onTrain={handleTrain}
      training={training}
      onBack={() => setShowSelector(true)}
      onSwitchGym={onSwitchGym}
      onRankUp={onRankUp}
      flashSessionKey={flashSessionKey}
    />
  );
});

// ── URL-param helpers ───────────────────────────────────────
// Several account-related flows arrive via query strings — pulled once at boot:
//   ?reset_password_token=...   → land on the forgot-password "apply" form
//   ?email_updated=true         → user clicked the email-change confirmation link
//   ?email_update_error=<code>  → confirmation link was invalid/expired
function readBootParams() {
  if (typeof window === "undefined") return {};
  try {
    const url = new URL(window.location.href);
    return {
      resetToken:        url.searchParams.get("reset_password_token") || null,
      emailUpdated:      url.searchParams.get("email_updated") === "true",
      emailUpdateError:  url.searchParams.get("email_update_error") || null,
      emailVerified:     url.searchParams.get("email_verified") === "true",
      emailVerifyError:  url.searchParams.get("email_verify_error") || null,
    };
  } catch (_) {
    return {};
  }
}

function clearBootParams() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let dirty = false;
    [
      "reset_password_token",
      "email_updated",
      "email_update_error",
      "email_verified",
      "email_verify_error",
    ].forEach((k) => {
      if (url.searchParams.has(k)) { url.searchParams.delete(k); dirty = true; }
    });
    if (dirty) {
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
    }
  } catch (_) {}
}

// ── Main App ────────────────────────────────────────────────
function App() {
  // ── Boot-time URL params (reset link, email-update redirect) ──
  const [bootParams] = useState(readBootParams);

  // ── Auth state ─────────────────────────────────────────────
  const [authed, setAuthed] = useState(authStorage.isLoggedIn());

  // ── Game state ─────────────────────────────────────────────
  // Account-level status surfaced to the top-bar (email verify banner).
  // Shape: { accountId, email, emailConfirmed, emailVerifyCooldown } | null.
  // Loaded once on auth, refreshed when the verify URL param flips it.
  const [accountStatus, setAccountStatus] = useState(null);
  const [fighter,  setFighter]                  = useState(null);
  const [gyms,     setGyms]                     = useState([]);
  const [offers,   setOffers]                   = useState([]);
  const [message,  setMessage]                  = useState("");
  const [loading,  setLoading]                  = useState(true);
  const [resolving, setResolving]               = useState(false);
  const [lastFightCommentary, setLastFightCommentary] = useState([]);
  const [lastFightBreakdown, setLastFightBreakdown]   = useState(null);
  const [lastFightSummary, setLastFightSummary] = useState(null);
  const [feedRefreshKey, setFeedRefreshKey]     = useState(0);
  const [champions, setChampions]               = useState([]);
  const [activeTab, setActiveTab]               = useState("home");
  // Your Camp (Phase 2) — learned from the 410 the boot-time `loadGyms` call
  // gets back once GYMS_RETIRED flips server-side (contract §6.3). Drives:
  // NAV_ITEMS (drops the gym tab), forcing activeTab "gym"→"camp", the
  // dashboard quick-action / STEP_RESUME_TAB re-point, and the mid-session
  // gyms_retired catch in handleTrain below. Defaults false — byte-identical
  // to today's behaviour until the flag is actually flipped.
  const [gymsRetired, setGymsRetired]           = useState(false);
  // Post-training toast stack (replaces the old result modal).
  const { toasts, addToast, beginDismiss } = useToasts();
  // Which session card currently shows the success border-flash (null = none).
  const [flashSessionKey, setFlashSessionKey] = useState(null);
  const flashTimerRef = useRef(null);
  // In-flight guard so a slow batch can't be double-submitted — one click now
  // spends up to 25× energy.
  const [training, setTraining] = useState(false);
  // Special-move drop reveal (NEW/UPGRADE outcomes only — DUPLICATE surfaces
  // as a compact toast instead, see handleTrain). QUEUED (Phase 2, F2) —
  // `DropRevealModal` is single-slot, but a Rank-4 Rare coach teaches 2 moves
  // and a Legendary up to 3 in one promotion (contract §6.1/§10 risk #11).
  // `onClose` shifts the next one off the front; without this, reveals 2 and
  // 3 would be silently swallowed.
  const [moveDropQueue, setMoveDropQueue] = useState([]);
  const enqueueMoveDrop = useCallback((drop) => setMoveDropQueue((q) => [...q, drop]), []);
  const advanceMoveDrop = useCallback(() => setMoveDropQueue((q) => q.slice(1)), []);
  const currentMoveDrop = moveDropQueue[0] || null;
  // Post-fight celebration overlays (belt / tier-up / banner-unlock) — ordered
  // queue so they never stack; each closes into the next. REPLACED (never
  // appended) on every fight resolve so a stale queue can't leak into the
  // next fight's celebrations.
  const [overlayQueue, setOverlayQueue] = useState([]);
  const advanceOverlay = useCallback(() => setOverlayQueue((q) => q.slice(1)), []);
  const currentOverlay = overlayQueue[0] || null;
  // Nonce that tells the (always-mounted) sidebar FighterProfile to open its
  // banner editor — bumped by the banner-unlock modal's "Customize" CTA.
  const [openBannerEditorSignal, setOpenBannerEditorSignal] = useState(0);
  // Persona Moment celebrations (crowned / signature-unlock). Fed by the
  // gp:persona-moment window event emitted at the four persona-nudging response
  // sites (podcast / appearance / documentary / post-fight interview). APPENDED
  // (never replaced) — milestones are once-ever, so a stale entry can't recur.
  // Rendered only while no fight overlay is up, so it never buries a belt win.
  const [personaMomentQueue, setPersonaMomentQueue] = useState([]);
  const advancePersonaMoment = useCallback(() => setPersonaMomentQueue((q) => q.slice(1)), []);
  useEffect(() => {
    const onMoment = (e) => setPersonaMomentQueue((q) => [...q, e.detail]);
    window.addEventListener(PERSONA_MOMENT_EVENT, onMoment);
    return () => window.removeEventListener(PERSONA_MOMENT_EVENT, onMoment);
  }, []);
  const [fightLimitPopup, setFightLimitPopup] = useState({ open: false, message: "" });
  // One-time "you're a contender" announcement. We track the previous
  // pendingPromotion value so we only fire on the absent→set transition.
  const [contenderModal, setContenderModal] = useState(null);
  const prevPendingPromotionRef = useRef(undefined);
  const [fameDrawerOpen, setFameDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  // "What's New" changelog — auto-opens once for returning players on a major
  // release they haven't seen yet (gated on fighter load, see effect below).
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogUnseen, setChangelogUnseen] = useState(false);
  const changelogCheckedRef = useRef(false);
  /** Bumps after train / membership pay so gym quest panel refetches without a full page reload. */

  // ── Camp v1.1 state ────────────────────────────────────────
  const [campReport, setCampReport]           = useState(null);
  const [showFighterReport, setShowFighterReport] = useState(false);
  // Face-off overlay shown on accept, above the (already-loaded) Fighter Report.
  const [faceOff, setFaceOff]                 = useState(null);
  const [reportFromCamp, setReportFromCamp]       = useState(false);
  const [campState, setCampState]             = useState(null);
  const [addingSession, setAddingSession]     = useState(null); // sessionType key while loading
  const [showCampSummary, setShowCampSummary] = useState(false);
  const [campSummaryData, setCampSummaryData] = useState(null);
  const [weightCut, setWeightCut]             = useState(null);
  // Selected pre-fight supplement label, surfaced in the camp summary modal.
  const [selectedBuffLabel, setSelectedBuffLabel] = useState(null);

  // Auto-close the mobile drawer whenever the active tab changes.
  useEffect(() => { setMobileDrawerOpen(false); }, [activeTab]);

  // Clear the pending card-flash timer on unmount.
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const maybeShowBlockPopup = useCallback((rawMessage, errorCode) => {
    const blockingCodes = new Set([
      "FIGHT_NOT_ENOUGH_ENERGY",
      "FIGHT_MENTAL_RESET_REQUIRED",
      "FIGHT_DOCTOR_VISIT_REQUIRED",
      "FIGHT_NO_ACCEPTED_FIGHT",
      "FIGHT_INVALID_STRATEGY",
      "FIGHT_INVALID_WEIGHT_CUT",
    ]);
    const msg = (rawMessage || "").toLowerCase();
    const fallbackByMessage = [
      "not enough energy",
      "mental reset required",
      "cannot fight:",
      "no accepted fight",
      "invalid strategy",
      "invalid weight cut strategy",
    ];
    const shouldPopup = (errorCode && blockingCodes.has(errorCode))
      || fallbackByMessage.some((p) => msg.includes(p));
    if (shouldPopup) {
      setFightLimitPopup({ open: true, message: rawMessage || t("app.actionUnavailable") });
    }
    return shouldPopup;
  }, []);

  const loadFighter = useCallback(async (id, options = {}) => {
    if (!id) return;
    try {
      const f = await api.getFighter(id);
      setFighter(f);
      if (options.clearMessage !== false) setMessage("");
      // Fetch champions for tier progress display
      api.getChampions(id).then((data) => setChampions(data.champions ?? [])).catch(() => {});
    } catch (e) {
      setMessage(e.message || "Failed to load fighter");
    }
  }, []);

  // Sync camp state when fighter data indicates an active fight
  const syncCampState = useCallback(async (f) => {
    if (!f?.acceptedFightId) {
      setCampState(null);
      return;
    }
    try {
      const state = await api.getCampState(f.acceptedFightId, f._id);
      setCampState(state);
    } catch (_) {
      setCampState(null);
    }
  }, []);

  const loadGyms = useCallback(async (fId) => {
    try {
      const id = fId || fighter?._id;
      if (!id) return;
      const list = await api.listGymsForFighter(id);
      setGyms(Array.isArray(list) ? list : []);
    } catch (e) {
      // The FE learns GYMS_RETIRED from THIS 410 (contract §6.3) — this is the
      // boot-time call `loadGyms` already makes, so no new endpoint is added.
      if (e?.status === 410 && e?.code === "gyms_retired") {
        setGymsRetired(true);
        setGyms([]);
      }
    }
  }, [fighter?._id]);

  // Pull account-level status (emailConfirmed + verify-resend cooldown) for
  // the top-of-app verify banner. Decodes the account id from the JWT so we
  // don't have to plumb it through the auth flow.
  const loadAccountStatus = useCallback(async () => {
    try {
      const token = authStorage.getToken();
      if (!token) return;
      const payload = JSON.parse(atob(token.split(".")[1]));
      const accountId = payload?.id;
      if (!accountId) return;
      const profile = await api.getAccountProfile(accountId);
      setAccountStatus({
        accountId: profile.accountId,
        email: profile.email,
        emailConfirmed: profile.emailConfirmed !== false,
        emailVerifyCooldown: profile.emailVerifyCooldown || 0,
        isGuest: !!profile.isGuest,
        hasRecoveryCode: !!profile.hasRecoveryCode,
      });
    } catch (_) { /* silent — banner just stays hidden */ }
  }, []);

  // Load initial data once authenticated
  useEffect(() => {
    if (!authed) return;
    const fighterId = authStorage.getFighterId();
    (async () => {
      setLoading(true);
      if (fighterId) {
        await loadFighter(fighterId);
        await loadGyms(fighterId);
      }
      // Account status loads in parallel — banner shows up the moment it lands,
      // doesn't gate the rest of the boot.
      loadAccountStatus();
      setLoading(false);
    })();
  }, [authed, loadFighter, loadGyms, loadAccountStatus]);

  // Sync camp state whenever fighter changes
  useEffect(() => {
    if (fighter) syncCampState(fighter);
  }, [fighter?._id, fighter?.acceptedFightId, syncCampState]);

  // Once the gyms have retired, the "gym" tab no longer exists in NAV_ITEMS —
  // if the player is sitting on it (e.g. it was the last tab before the flag
  // flipped, or a stale deep link), bounce them to Your Camp rather than
  // rendering a blank/orphaned screen (contract §6.3/§6.4).
  useEffect(() => {
    if (gymsRetired && activeTab === "gym") setActiveTab("camp");
  }, [gymsRetired, activeTab]);

  // Periodic refresh every minute
  useEffect(() => {
    if (!fighter?._id) return;
    const t = setInterval(() => loadFighter(fighter._id), 60 * 1000);
    return () => clearInterval(t);
  }, [fighter?._id, loadFighter]);

  /**
   * Return leg of a Stripe Checkout: `/?purchase=success` or `/?purchase=cancelled`.
   *
   * ⚠️ THE PARAM IS A HINT, NOT PROOF OF PAYMENT. Anyone can type this URL, and the goods are
   * granted by the signature-verified webhook alone. So this only navigates, refreshes, and
   * reports — it never credits anything.
   *
   * It also RE-READS rather than trusting the first read. The redirect frequently beats the
   * webhook by a second or two, so a single refresh can show the old inventory and read as a
   * purchase that vanished. Re-reading a few seconds later lets the drinks appear on their own.
   *
   * The param is stripped with replaceState so a page refresh does not replay the message.
   */
  const purchaseReturnHandled = useRef(false);
  useEffect(() => {
    if (purchaseReturnHandled.current || !fighter?._id) return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("purchase");
    if (!outcome) return;
    purchaseReturnHandled.current = true;

    window.history.replaceState({}, "", window.location.pathname);
    setActiveTab("shop");

    if (outcome === "success") {
      setMessage(t("shop.messages.premiumReturnSuccess"));
      loadFighter(fighter._id);
      const again = setTimeout(() => loadFighter(fighter._id), 4000);
      return () => clearTimeout(again);
    }
    if (outcome === "cancelled") setMessage(t("shop.messages.premiumReturnCancelled"));
    return undefined;
  }, [fighter?._id, loadFighter]);

  // Surface the transient `message` state as an auto-dismissing notice toast.
  // Many handlers (hospital, training, camp, account, etc.) call setMessage/onMessage
  // on both error and success paths, but the app had no global surface for it — so
  // those messages (e.g. "Not enough cash…") were silently dropped. This renders the
  // latest one and clears it after a few seconds.
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(t);
  }, [message]);

  // One-time contender announcement — fire when pendingPromotion goes from
  // absent → set, once per (fighter, targetTier) lifecycle. The persistent
  // ContenderChecklist panel carries the info afterwards.
  useEffect(() => {
    const fighterId = fighter?._id;
    if (!fighterId) return;
    // Don't pop the announcement over the onboarding tutorial.
    if (fighter.tutorial && !fighter.tutorial.completed) return;

    const target = fighter.pendingPromotion ?? null;
    const prev = prevPendingPromotionRef.current;
    prevPendingPromotionRef.current = target;

    // Only react to a genuine absent→set transition. `prev === undefined` is
    // the very first observation (fresh load) — treat a contender we load into
    // as "already seen unless the localStorage key says otherwise".
    if (!target) return;
    if (prev === target) return;

    const storageKey = `gnp_seen_contender_${fighterId}_${target}`;
    let alreadySeen = false;
    try { alreadySeen = localStorage.getItem(storageKey) === "1"; } catch (_) {}
    if (alreadySeen) return;

    // Resolve the champion name for the target tier: prefer a loaded title-shot
    // offer, fall back to the champions roster for the current tier.
    const currentTier = fighter.promotionTier ?? "Amateur";
    const titleOffer = (offers ?? []).find((o) => o?.type === "TitleShot");
    const rosterChamp = (champions ?? []).find((c) => c.championTier === currentTier);
    const champName = titleOffer?.opponent?.name ?? rosterChamp?.name ?? null;

    try { localStorage.setItem(storageKey, "1"); } catch (_) {}
    setContenderModal({ currentTier, targetTier: target, champName });
  }, [
    fighter?._id,
    fighter?.pendingPromotion,
    fighter?.promotionTier,
    fighter?.tutorial?.completed,
    offers,
    champions,
  ]);

  const openChangelog = useCallback(() => {
    setChangelogOpen(true);
    try { localStorage.setItem(LAST_SEEN_VERSION_KEY, CURRENT_VERSION); } catch (_) {}
    setChangelogUnseen(false);
  }, []);

  // One-shot "What's New" check, gated on the fighter being loaded (the major
  // auto-open must not fire over the onboarding tutorial). Uses a ref guard so
  // the 60s fighter poll can't re-run this and re-open a modal the player closed.
  useEffect(() => {
    if (!authed || loading || !fighter) return;
    if (changelogCheckedRef.current) return;

    let stored;
    try {
      stored = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch (_) {
      // Storage unreadable (private mode etc.) — we can't tell a new player
      // from a returning one. Show the dot as a gentle signal but never
      // auto-open, and since nothing can persist, don't keep re-checking.
      setChangelogUnseen(true);
      changelogCheckedRef.current = true;
      return;
    }

    // First visit: nothing stored yet — silently mark current version as seen.
    // Must be checked BEFORE the "differs" branch, or first-visit players would
    // get an unearned What's New popup/badge.
    if (!stored) {
      try { localStorage.setItem(LAST_SEEN_VERSION_KEY, CURRENT_VERSION); } catch (_) {}
      changelogCheckedRef.current = true;
      return;
    }

    if (stored === CURRENT_VERSION) {
      changelogCheckedRef.current = true;
      return;
    }

    setChangelogUnseen(true);
    const isMajor = CHANGELOG_ENTRIES[0]?.major === true;
    const inTutorial = !!(fighter?.tutorial && !fighter.tutorial.completed);
    if (isMajor && inTutorial) {
      // Suppressed while onboarding — leave the ref unset so the effect
      // re-evaluates on later fighter refreshes and the auto-open still fires
      // once the tutorial completes. (Manually opening the modal writes the
      // seen-version, which resolves this via the equality branch above.)
      return;
    }
    if (isMajor) {
      openChangelog();
    }
    changelogCheckedRef.current = true;
  }, [authed, loading, fighter, openChangelog]);

  // Email-change confirmation redirect — the backend bounces the user here from
  // /account/email/confirm with one of two query params. Surface the result via
  // the message bar, then strip the params so a refresh doesn't repeat it.
  useEffect(() => {
    if (bootParams.emailUpdated) {
      setMessage(t("app.emailUpdated"));
      clearBootParams();
    } else if (bootParams.emailUpdateError) {
      const map = {
        invalid_token:     t("app.emailError.invalidToken"),
        token_expired:     t("app.emailError.tokenExpired"),
        email_taken:       t("app.emailError.emailTaken"),
        already_confirmed: t("app.emailError.alreadyConfirmed"),
      };
      setMessage(map[bootParams.emailUpdateError] || t("app.emailError.confirmFailed"));
      clearBootParams();
    }
  }, [bootParams.emailUpdated, bootParams.emailUpdateError]);

  // ── Tutorial resume routing ──────────────────────────────────
  // activeTab resets to "home" on every page load, but some tutorial steps
  // focus elements that only exist on another screen. Most such steps open
  // with a nav-* phase (or carry skipIfAbsent) and heal themselves, but the
  // training step is a single phase pinned to gym-screen anchors with no
  // in-step navigation — after a mid-tutorial refresh the player lands on
  // home and gets trapped behind a full scrim with no anchor to cut out and
  // no way to reach the gym. Route to the required tab once on resume so the
  // step's focal elements exist. (During these steps the scrim locks the
  // player to that screen anyway, so forcing the tab can't fight the user.)
  const tutorialResumedRef = useRef(false);
  useEffect(() => {
    if (tutorialResumedRef.current) return;
    const tut = fighter?.tutorial;
    if (!tut || tut.completed) return;
    tutorialResumedRef.current = true;
    // Gyms retired (contract §6.3): the training_session step's anchors live
    // in Your Camp now, not the old gym screen.
    const STEP_RESUME_TAB = { training_session: gymsRetired ? "camp" : "gym" };
    const tab = STEP_RESUME_TAB[tut.current_step];
    if (tab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fighter?.tutorial?.current_step, fighter?.tutorial?.completed, gymsRetired]);

  // Email-verification redirect — same pattern. On success we also flip the
  // local accountStatus so the banner disappears without needing a refetch.
  useEffect(() => {
    if (bootParams.emailVerified) {
      setMessage(t("app.emailVerified"));
      setAccountStatus((prev) => prev ? { ...prev, emailConfirmed: true, emailVerifyCooldown: 0 } : prev);
      clearBootParams();
    } else if (bootParams.emailVerifyError) {
      const map = {
        invalid_token: t("app.emailError.verifyInvalid"),
        expired:       t("app.emailError.verifyExpired"),
      };
      setMessage(map[bootParams.emailVerifyError] || t("app.emailError.verifyFailed"));
      clearBootParams();
    }
  }, [bootParams.emailVerified, bootParams.emailVerifyError]);

  // Called by AuthPage after successful login/register
  const handleAuthenticated = useCallback(
    (fighterId) => {
      setAuthed(true);
      loadFighter(fighterId);
      loadGyms(fighterId);
    },
    [loadFighter, loadGyms]
  );

  const handleLogout = useCallback(() => {
    authStorage.clear();
    setAuthed(false);
    setFighter(null);
    setOffers([]);
    setLastFightSummary(null);
    setLastFightCommentary([]);
    setActiveTab("home");
    setMessage("");
    setAccountStatus(null);
  }, []);

  const handleUpdateFighter = useCallback(
    async (id, body) => {
      try {
        await api.updateFighter(id, body);
        await loadFighter(id);
        setMessage(t("app.profileUpdated"));
      } catch (e) {
        setMessage(e.message || "Update failed");
      }
    },
    [loadFighter]
  );

  const handleTrain = useCallback(
    async (trainGym, trainSession, quantity = 1) => {
      if (!fighter?._id || !trainGym) {
        setMessage(t("app.noFighterSelected"));
        return;
      }
      // One click can now spend up to 25× energy — block re-entry while a
      // batch is resolving.
      if (training) return;
      setTraining(true);
      const qty = Math.max(1, Math.floor(Number(quantity) || 1));
      try {
        const result = await api.train(fighter._id, trainGym, trainSession, qty);
        const completed = result.completed ?? 0;

        if (completed > 0) {
          // ── Build the post-training toast view-model ──────────────────
          const sessionName = (SESSION_META[trainSession] ?? SESSION_META.bag_work).label;
          const xpGained = Object.entries(result.xpGained || {})
            .filter(([, v]) => v > 0)
            .map(([stat, amount]) => ({ stat, amount: Number(amount) }));
          const levelUps = (result.statChanges || [])
            .filter((c) => c.after > c.before)
            .map((c) => ({ stat: c.stat, oldValue: c.before, newValue: c.after }));
          // Injuries: prefer the richer events (carry the round), fall back to labels.
          const injuryEvents = (result.events || []).filter((e) => e && e.type === "injury");
          const injuries = injuryEvents.length
            ? injuryEvents.map((e) => ({ label: e.label, round: e.sessionIndex }))
            : (result.injurySustained || []).map((label) => ({ label, round: null }));
          const variant = injuries.length ? "injury" : (levelUps.length ? "levelup" : "normal");
          // Per-session XP RNG (additive; may be absent during rollout).
          const rollTier = result.rollTier ?? null;
          const rollTierCounts = result.rollTierCounts ?? { great: 0, normal: 0, sluggish: 0 };
          const greatCount = rollTierCounts.great ?? 0;
          addToast({
            sessionName,
            xpGained,
            levelUps,
            injuries,
            completed,
            energyRemaining: result.energyAfter,
            sessionsToday: result.sessionsToday ?? 0,
            maxStaminaGained: result.maxStaminaGained || 0,
            staminaCapHit: !!result.staminaCapHit,
            variant,
            rollTier,
            greatCount,
            // XP booster status surfaced post-train (additive; absent if none).
            booster: result.booster ?? null,
          });

          // Badge-unlock toasts from training milestones (e.g. session counts).
          const newBadges = result.newlyEarnedBadges;
          if (Array.isArray(newBadges) && newBadges.length) {
            for (const b of newBadges) {
              addToast({ kind: "badge", badgeName: b.name || prettifyBadgeId(b.badgeId), badgeContext: b.context || null });
            }
          }

          // Tutorial step 2 advances on a successful training session. The old
          // modal fired this on dismiss; with toasts there's no dismiss gate, so
          // we emit immediately on success.
          tutorialBus.emit("training_complete");

          // Trigger the session-card border flash (CSS-only animation).
          setFlashSessionKey(trainSession);
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlashSessionKey(null), 2500);
        }

        // ── Special-move drop (sparring-family sessions only) ────────────
        // NEW/UPGRADE get the tall-card reveal; DUPLICATE is a compact cash
        // toast that also patches the displayed cash from newBalance so the
        // sidebar doesn't wait on the fighter refetch below.
        const moveDrop = result.moveDrop || null;
        if (moveDrop) {
          if (moveDrop.outcome === "DUPLICATE") {
            addToast({
              kind: "moveDupe",
              name: moveDrop.name,
              cashAwarded: moveDrop.cashAwarded ?? 0,
            });
            if (moveDrop.newBalance != null) {
              setFighter((prev) => (prev ? { ...prev, iron: moveDrop.newBalance } : prev));
            }
          } else {
            enqueueMoveDrop(moveDrop);
          }
        }

        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
      } catch (e) {
        // Mid-session retirement (contract §6.4 / Q on risk #4): the
        // gymsRetired middleware runs BEFORE the controller, so no energy is
        // ever deducted here — safe to just redirect and inform, never refund.
        if (e.code === "gyms_retired") {
          setGymsRetired(true);
          setActiveTab("camp");
          setMessage(t("app.gymsRetiredMessage"));
          return;
        }
        // Covers 400 "Not enough energy", clamp-to-0, "quantity must be an
        // integer >= 1", etc.
        setMessage(e.message || "Train failed");
      } finally {
        setTraining(false);
      }
    },
    [fighter?._id, loadFighter, loadGyms, training, addToast, enqueueMoveDrop]
  );

  const handleSwitchGym = useCallback(
    async (gymId) => {
      if (!fighter?._id) return { ok: false, error: "No fighter loaded." };
      try {
        const result = await api.switchGym(fighter._id, gymId);
        setMessage(result.message || "Gym membership activated.");
        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
        return { ok: true };
      } catch (e) {
        // Returned to the gym view so it can show the reason inline (e.g.
        // "Not enough cash — need $1,500") — there is no global message bar.
        return { ok: false, error: e.message || "Couldn't join this gym." };
      }
    },
    [fighter?._id, loadFighter, loadGyms]
  );

  const handleRankUp = useCallback(
    async (gymId) => {
      if (!fighter?._id) return { ok: false, error: "No fighter loaded." };
      try {
        const result = await api.rankUpGym(fighter._id, gymId);
        setMessage(result.rankUp?.unlockDescription || "Ranked up!");
        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
        return { ok: true };
      } catch (e) {
        // Returned to the gym view so it can show the reason inline (e.g.
        // "Need $1,500 (have $200)") — there is no global message bar.
        return { ok: false, error: e.message || "Rank up failed." };
      }
    },
    [fighter?._id, loadFighter, loadGyms]
  );

const handleGetOffers = useCallback(async () => {
    if (!fighter?._id) return;
    setMessage(t("app.loadingOffers"));
    try {
      const list = await api.getOffers(fighter._id);
      setOffers(Array.isArray(list) ? list : []);
      setMessage(list?.length ? t("app.offersReady", { count: list.length }) : t("app.noOffers"));
    } catch (e) {
      const errMsg = e.message || "Failed to get offers";
      maybeShowBlockPopup(errMsg, e.code);
      setMessage(errMsg);
      setOffers([]);
    }
  }, [fighter?._id, maybeShowBlockPopup]);

  const handleAcceptOffer = useCallback(
    async (opponentId, offerType = "Even") => {
      if (!fighter?._id) return;
      setMessage(t("app.fightAccepting"));
      try {
        const fight = await api.createOffer(fighter._id, { opponentId, offerType });
        await api.acceptOffer(fighter._id, fight._id);
        setOffers([]);

        // Fetch Fighter Report and camp state immediately after accept
        const [report, state] = await Promise.all([
          api.getCampReport(fight._id),
          api.getCampState(fight._id, fighter._id),
        ]);
        setCampReport(report);
        setCampState(state);
        setReportFromCamp(false);
        setShowFighterReport(true);
        // Face-off plays as an overlay ON TOP of the now-loaded report; when it
        // finishes (auto or Skip) it unmounts, revealing the report underneath.
        // Public tale-of-the-tape only — the report keeps the opponent's stats fogged.
        setFaceOff({
          player: {
            name: `${fighter.firstName ?? ""} ${fighter.lastName ?? ""}`.trim(),
            nickname: fighter.nickname,
            record: `${fighter.record?.wins ?? 0}-${fighter.record?.losses ?? 0}${(fighter.record?.draws ?? 0) > 0 ? `-${fighter.record.draws}` : ""}`,
            ovr: fighter.overallRating,
            style: fighter.style,
            weightClass: fighter.weightClass,
          },
          opponent: {
            name: report.name,
            nickname: report.nickname,
            record: report.record,
            ovr: report.overallRating,
            style: report.style,
            weightClass: fighter.weightClass, // same division as the player
            isTitle: !!report.isTitleFight,
          },
        });
        setMessage(t("app.fightAccepted"));
        loadFighter(fighter._id, { clearMessage: false });
        setActiveTab("fights");
        // NOTE: tutorialBus.emit("fight_accepted") fires from the FaceOff's
        // onDone (below in render) — not here — so the tutorial waits for the
        // face-off to finish before advancing to the Fighter Report tooltip.
      } catch (e) {
        const errMsg = e.message || "Accept failed";
        maybeShowBlockPopup(errMsg, e.code);
        setMessage(errMsg);
      }
    },
    [fighter?._id, loadFighter, maybeShowBlockPopup]
  );

  const loadCampState = useCallback(async (fightId) => {
    if (!fightId || !fighter?._id) return;
    try {
      const state = await api.getCampState(fightId, fighter._id);
      setCampState(state);
    } catch (_) {}
  }, [fighter?._id]);

  const handleAddCampSession = useCallback(async (sessionType) => {
    const fightId = fighter?.acceptedFightId;
    if (!fightId || !fighter?._id) return;
    setAddingSession(sessionType);
    try {
      const result = await api.addCampSession(fightId, fighter._id, sessionType);
      setCampState(result.camp ? { ...result.camp, slotsUsed: result.slotsUsed, slotsRemaining: result.slotsRemaining, previewRating: result.previewRating } : null);
      if (result.injuryTriggered) {
        setMessage(t("app.campInjury", { label: result.injuryTriggered.label }));
      } else {
        setMessage(t("app.campSession", { session: sessionType.replace(/_/g, " ").toLowerCase() }));
      }
      loadFighter(fighter._id, { clearMessage: false });
    } catch (e) {
      setMessage(e.message || "Failed to add session");
    }
    setAddingSession(null);
  }, [fighter?._id, fighter?.acceptedFightId, loadFighter]);

  const handleRemoveCampSession = useCallback(async (slotIndex) => {
    const fightId = fighter?.acceptedFightId;
    if (!fightId || !fighter?._id) return;
    try {
      const result = await api.removeCampSession(fightId, fighter._id, slotIndex);
      setCampState(result.camp ? { ...result.camp, slotsUsed: result.slotsUsed, slotsRemaining: result.slotsRemaining, previewRating: result.previewRating } : null);
      setMessage(t("app.sessionRemoved"));
      loadFighter(fighter._id, { clearMessage: false });
    } catch (e) {
      setMessage(e.message || "Failed to remove session");
    }
  }, [fighter?._id, fighter?.acceptedFightId, loadFighter]);

  const handleResolveCampInjury = useCallback(async (choice) => {
    const fightId = fighter?.acceptedFightId;
    if (!fightId || !fighter?._id) return;
    try {
      await api.resolveCampInjury(fightId, fighter._id, choice);
      await loadCampState(fightId);
      setMessage(choice === "STOP" ? t("app.campStopped") : t("app.pushingThrough"));
    } catch (e) {
      setMessage(e.message || "Failed to resolve injury");
    }
  }, [fighter?._id, fighter?.acceptedFightId, loadCampState]);

  const handleFinaliseCamp = useCallback(async (skip = false) => {
    const fightId = fighter?.acceptedFightId;
    if (!fightId || !fighter?._id) return;
    try {
      const summary = await api.finaliseCamp(fightId, fighter._id, skip);
      setCampSummaryData(summary);
      setWeightCut(null);
      await loadCampState(fightId);
      setShowCampSummary(true);
      tutorialBus.emit("camp_finalised");
      setMessage(skip ? t("app.campSkipped") : t("app.campFinalised", { rating: summary.campRating }));
    } catch (e) {
      setMessage(e.message || "Failed to finalise camp");
    }
  }, [fighter?._id, fighter?.acceptedFightId, loadCampState]);

  // Resume path for an already-finalised but unresolved camp. The Camp Summary
  // (which holds the only "Begin Fight" button) lives in ephemeral state that is
  // lost on reload — so a camp finalised in a prior session, or one where the
  // finalise response errored after the server set finalisedAt, would otherwise
  // be a dead end. Rebuild the summary from the persisted camp state and reopen it.
  const handleProceedFinalisedCamp = useCallback(() => {
    if (!campState?.finalisedAt) return;
    setCampSummaryData({
      campRating: campState.campRating,
      campBreakdown: campState.campBreakdown ?? [],
      sessionBonuses: campState.sessionBonuses ?? [],
      wasSkipped: campState.wasSkipped ?? false,
      injuryPenalty: campState.injuryPenalty ?? null,
      injuryChoice: campState.injuryChoice ?? null,
      sessions: campState.sessions ?? [],
    });
    setShowCampSummary(true);
  }, [campState]);

  const handleResolve = useCallback(async () => {
    if (!fighter?._id) return;
    setResolving(true);
    setMessage(t("app.fightNight"));
    setLastFightCommentary([]);
    setLastFightBreakdown(null);
    setLastFightSummary(null);
    try {
      const result = await api.resolveFight(fighter._id);
      const commentary = result.fight?.commentary || result.result?.commentary || [];
      setLastFightCommentary(Array.isArray(commentary) ? commentary : []);
      // prefer the shaped view the backend attaches as breakdownView (same shape
      // as GET /fights/:id/breakdown); fall back to the raw subdoc for old deploys
      setLastFightBreakdown(result.breakdownView ?? result.fight?.breakdown ?? null);
      setLastFightSummary(result.summary ?? null);
      // Post-fight celebration overlays, priority order: belt > tier > banner.
      // REPLACE (never append) — a fresh fight always overwrites any leftover
      // queue from a previous resolve.
      const queue = [];
      if (result.summary?.beltWon && result.summary?.promoted) {
        queue.push({
          type: "belt",
          from: result.summary.promoted.from,
          to: result.summary.promoted.to,
          weightClass: result.fighter?.weightClass,
        });
      }
      if (result.summary?.notorietyTierUp) {
        queue.push({ type: "tier", ...result.summary.notorietyTierUp });
      }
      if (result.summary?.newlyUnlockedBannerPieces?.length) {
        queue.push({ type: "banner", pieces: result.summary.newlyUnlockedBannerPieces });
      }
      setOverlayQueue(queue);
      const out = result.fight?.outcome || "—";
      const iron = result.fight?.ironEarned ?? 0;
      const rec = result.fighter?.record;
      // First-fight hint: show once after first career win
      const isFirstWin = rec && rec.wins === 1 && result.summary?.recordChange === "W";
      const firstWinHint = isFirstWin ? t("app.firstWinHint") : "";
      setMessage(`${out} — +$${iron}${rec ? ` | Record: ${rec.wins}-${rec.losses}-${rec.draws}` : ""}${firstWinHint}`);
      // Badge-unlock toasts — one per newly earned badge from the fight resolve.
      const newBadges = result.summary?.newlyEarnedBadges;
      if (Array.isArray(newBadges) && newBadges.length) {
        for (const b of newBadges) {
          addToast({
            kind: "badge",
            badgeName: b.name || prettifyBadgeId(b.badgeId),
            badgeContext: b.context || null,
          });
        }
      }
      loadFighter(fighter._id);
      // Refresh gyms too — a win updates gym rank progress (relevantWins, e.g.
      // KO/TKO win requirements), which lives on the gyms payload, not the fighter.
      loadGyms(fighter._id);
      setFeedRefreshKey((k) => k + 1);
      // Clean up camp state after fight
      setCampState(null);
      setCampReport(null);
      setCampSummaryData(null);
      setShowCampSummary(false);
      setSelectedBuffLabel(null);
      tutorialBus.emit("fight_resolved");
    } catch (e) {
      const errMsg = e.message || "Resolve failed";
      maybeShowBlockPopup(errMsg, e.code);
      setMessage(errMsg);
    }
    setResolving(false);
  }, [fighter?._id, loadFighter, loadGyms, maybeShowBlockPopup, addToast]);

  const handleBeginFight = useCallback(async () => {
    if (!weightCut || !fighter?._id || !fighter?.acceptedFightId) return;
    try {
      await api.setWeightCut(fighter._id, fighter.acceptedFightId, weightCut);
    } catch (e) {
      setMessage(e.message || t("app.weightCutFailed"));
      return;
    }
    setShowCampSummary(false);
    handleResolve();
  }, [weightCut, fighter?._id, fighter?.acceptedFightId, handleResolve]);

  // Tutorial completion — reload the fighter so the overlay unmounts (the
  // refreshed tutorial.completed flag) and the credited iron / gazette appear.
  const handleTutorialComplete = useCallback(async () => {
    if (fighter?._id) await loadFighter(fighter._id);
  }, [fighter?._id, loadFighter]);

  const handleNavTab = useCallback((id) => {
    setActiveTab(id);
  }, []);

  // Career sub-tab (Feed / Profile), lifted so the dashboard can deep-link to Profile.
  const [careerSubTab, setCareerSubTab] = useState("feed");
  const openCareerProfile = useCallback(() => {
    setCareerSubTab("profile");
    setActiveTab("career");
  }, []);

  // Deep-link: open a specific fight's breakdown drawer in the Career feed.
  // Set by onOpenCareerFight (passed to PvpHub), consumed by CareerPage.
  const [careerInitialFight, setCareerInitialFight] = useState(null);
  const onOpenCareerFight = useCallback((fightId, kind = "pvp") => {
    setCareerInitialFight({ fightId, kind });
    setActiveTab("career");
  }, []);

  // Nav items depend on `gymsRetired` — MUST be recomputed per-render (a
  // module-scope call froze this forever and the gym tab would never
  // disappear once the flag flipped in production, contract §6.3/§10 risk #14).
  const NAV_ITEMS = useMemo(() => buildNavItems({ gymsRetired }), [gymsRetired]);

  // Show auth page if not logged in. When the user arrived via the
  // password-reset email link we land directly on the forgot-password "apply"
  // form by passing the token through.
  if (!authed) {
    return <LandingPage onAuthenticated={handleAuthenticated} initialResetToken={bootParams.resetToken} />;
  }

  if (loading) {
    return (
      <div className="app">
        {/* Keep the consent notice visible during the load spinner so a
            first-time player isn't shown an un-acknowledged screen, then a pop-in. */}
        <CookieConsent />
        <div className="app-loading">{t("app.loading")}</div>
      </div>
    );
  }

  const injuryCount = fighter?.injuries?.length ?? 0;
  const campActive  = !!fighter?.acceptedFightId;
  // Unread offline-defense dot — derived from the fighter prop (updated by the 60s poll)
  const pvpUnread = (fighter?.pvpDefense?.unreadCount ?? 0) > 0;

  return (
    <div className="app">

      {/* ── COOKIE / STORAGE ACKNOWLEDGEMENT + LEGAL MODALS ── */}
      <CookieConsent />
      <LegalModals />
      <ReportBugModal />

      {/* ── GUEST / EMAIL-VERIFY BANNER (mutually exclusive) ──
          Guests have no email attached, so the verify banner would be
          meaningless for them — GuestBanner takes precedence whenever
          accountStatus.isGuest is true. Once a guest claims an email, isGuest
          flips false and (if still unconfirmed) the normal verify banner
          takes over automatically.
          Soft verification: the user can keep playing while either banner is
          up. The verify banner disappears the moment they click the link in
          their email (accountStatus.emailConfirmed via the URL-param effect). */}
      {accountStatus && accountStatus.isGuest && (
        <GuestBanner onSecureClick={() => setActiveTab("account")} />
      )}
      {accountStatus && !accountStatus.isGuest && !accountStatus.emailConfirmed && (
        <EmailVerifyBanner
          email={accountStatus.email}
          accountId={accountStatus.accountId}
          initialCooldown={accountStatus.emailVerifyCooldown}
          onMessage={setMessage}
        />
      )}

      {/* ── POST-TRAINING TOASTS (after train, no message bar) ── */}
      <ToastContainer toasts={toasts} onDismiss={beginDismiss} />

      {/* ── SPECIAL MOVE DROP REVEAL (NEW/UPGRADE only) ── */}
      <DropRevealModal drop={currentMoveDrop} onClose={advanceMoveDrop} />

      {/* ── GLOBAL NOTICE TOAST — surfaces the `message` state (errors + key
          successes from handlers across the app that have no inline surface). ── */}
      {message && (
        <div className="app-msg-toast" role="status" aria-live="polite">
          <span className="app-msg-toast-text">{message}</span>
          <button
            type="button"
            className="app-msg-toast-close"
            aria-label={t("app.dismissNotice")}
            onClick={() => setMessage("")}
          >
            ✕
          </button>
        </div>
      )}

      <BeltWonOverlay
        open={currentOverlay?.type === "belt"}
        fromTier={currentOverlay?.from}
        toTier={currentOverlay?.to}
        weightClass={currentOverlay?.weightClass}
        onClose={advanceOverlay}
      />

      <TierUpOverlay
        open={currentOverlay?.type === "tier"}
        fromTier={currentOverlay?.from}
        toTier={currentOverlay?.to}
        onClose={advanceOverlay}
      />

      <BannerUnlockModal
        pieces={currentOverlay?.type === "banner" ? currentOverlay.pieces : null}
        onClose={advanceOverlay}
        onCustomize={() => { advanceOverlay(); setOpenBannerEditorSignal((n) => n + 1); }}
      />

      <PersonaMomentModal
        moment={!currentOverlay ? (personaMomentQueue[0] || null) : null}
        onClose={advancePersonaMoment}
        onSeePersona={() => { advancePersonaMoment(); setActiveTab("media"); }}
      />

      <FightLimitPopup
        open={!!fightLimitPopup.open}
        message={fightLimitPopup.message}
        onClose={() => setFightLimitPopup({ open: false, message: "" })}
      />

      <ContenderModal
        open={!!contenderModal}
        currentTier={contenderModal?.currentTier}
        targetTier={contenderModal?.targetTier}
        champName={contenderModal?.champName}
        onClose={() => { setContenderModal(null); setActiveTab("fights"); }}
      />

      <FameDrawer
        open={fameDrawerOpen}
        fighter={fighter}
        onClose={() => setFameDrawerOpen(false)}
        onNavigate={handleNavTab}
      />

      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
      />

      {/* ── ONBOARDING TUTORIAL ── */}
      {fighter?._id && fighter.tutorial && !fighter.tutorial.completed && (
        <TutorialOverlay
          key="tutorial"
          fighterId={fighter._id}
          initialStep={fighter.tutorial.current_step}
          lastFightOutcome={
            lastFightSummary?.recordChange === "W" ? "win"
              : lastFightSummary?.recordChange === "L" ? "loss"
                : null
          }
          onComplete={handleTutorialComplete}
        />
      )}

      {/* ── FIGHTER REPORT MODAL ── */}
      {showFighterReport && campReport && (
        <FighterReport
          report={campReport}
          onStartCamp={() => { setShowFighterReport(false); tutorialBus.emit("fighter_report_closed"); }}
          onClose={() => { setShowFighterReport(false); tutorialBus.emit("fighter_report_closed"); }}
          hideStartButton={reportFromCamp}
          isTitleFight={campState?.isTitleFight}
        />
      )}

      {/* ── FIGHT ACCEPT FACE-OFF (overlays the report, then unmounts) ── */}
      {faceOff && (
        <FaceOff
          player={faceOff.player}
          opponent={faceOff.opponent}
          onDone={() => {
            setFaceOff(null);
            // Advance the tutorial only once the face-off has played out
            // (auto, Skip, or Esc/Enter) so the fight_camp step's Fighter
            // Report tooltip doesn't render on top of the cutscene. No-op
            // outside the tutorial.
            tutorialBus.emit("fight_accepted");
          }}
        />
      )}

      {/* ── CAMP SUMMARY MODAL ── */}
      {showCampSummary && campSummaryData && (
        <CampSummary
          summaryData={campSummaryData}
          onBeginFight={handleBeginFight}
          resolving={resolving}
          weightCut={weightCut}
          onWeightCutChange={setWeightCut}
          isTitleFight={campState?.isTitleFight}
          selectedBuffLabel={selectedBuffLabel ?? (campState?.selectedBuffId ? "1 supplement" : null)}
          selectedBuffId={campState?.selectedBuffId ?? null}
        />
      )}

      {/* ── MOBILE TOP BAR ── (hidden on desktop via CSS) */}
      <header className="m-topbar">
        <div className="tlogo m-tlogo">{t("layout.topbar.brandName")}</div>
        <button type="button" className="m-hamburger" aria-label={t("layout.topbar.openMenu")} onClick={() => setMobileDrawerOpen(true)}>
          <Menu size={22} strokeWidth={2.2} />
        </button>
      </header>

      {/* ── MOBILE FIGHTER STRIP ── */}
      <div className="m-fighter-strip">
        <div className="m-fs-id">
          <span className="m-fs-name">{fighter?.firstName} {fighter?.lastName}</span>
          {fighter?.nickname && <span className="m-fs-nick">"{fighter.nickname}"</span>}
        </div>
        <div className="m-fs-badges">
          <span className="m-fs-ovr">{fighter?.overallRating ?? "—"}</span>
          <span className="m-fs-tier">{fighter?.promotionTier ?? "Amateur"}</span>
          <span className="m-fs-record">{fighter?.record?.wins ?? 0}-{fighter?.record?.losses ?? 0}</span>
        </div>
      </div>

      {/* ── MOBILE RESOURCE STRIP ── */}
      {(() => {
        const energyCur = fighter?.energy?.current ?? fighter?.energy ?? 0;
        const energyMax = fighter?.energy?.max ?? 100;
        const energyPct = energyMax > 0 ? Math.min(100, Math.max(0, (energyCur / energyMax) * 100)) : 0;
        const healthPct = Math.min(100, Math.max(0, fighter?.health ?? 0));
        return (
          <div className="m-resource-strip">
            <div className="m-rs-left">
              <span className="m-rs-iron">{(fighter?.iron ?? 0).toLocaleString()}</span>
              <span className="m-rs-fame" onClick={() => setFameDrawerOpen(true)}>{(fighter?.notoriety?.score ?? 0).toLocaleString()}</span>
            </div>
            <div className="m-rs-right">
              <Zap size={12} className="m-rs-icon m-rs-icon-energy" />
              <div className="m-rs-bar"><div className="m-rs-bar-fill m-rs-energy" style={{ width: `${energyPct}%` }} /></div>
              <Heart size={12} className="m-rs-icon m-rs-icon-health" />
              <div className="m-rs-bar"><div className="m-rs-bar-fill m-rs-health" style={{ width: `${healthPct}%` }} /></div>
            </div>
          </div>
        );
      })()}

      {/* ── TOP BAR ── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="tlogo">{t("layout.topbar.brandName")}</div>
          <nav className="topbar-nav">
            {NAV_ITEMS.map((item, i) => (
              item.active ? (
                <button
                  key={item.id}
                  type="button"
                  className={`tni ${activeTab === item.id ? "act" : ""}`}
                  onClick={() => handleNavTab(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {item.id === "pvp" && pvpUnread && <span className="nav-dot" aria-label={t("layout.topbar.unreadDefenseReport")} />}
                </button>
              ) : (
                <span key={i} className="tni disabled">
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </span>
              )
            ))}
          </nav>
        </div>
      </header>

      {/* ── BODY: sidebar + main ── */}
      <div className="layout">

        {/* Left sidebar */}
        <aside className="sidebar">
          <FighterProfile
            fighter={fighter}
            gyms={gyms}
            campSlotsUsed={campState?.slotsUsed}
            onUpdateFighter={handleUpdateFighter}
            onRefreshFighter={loadFighter}
            onMessage={setMessage}
            openBannerEditorSignal={openBannerEditorSignal}
          />
          <InventorySidebar
            fighter={fighter}
            onRefreshFighter={loadFighter}
            onNavigateShop={() => handleNavTab("shop")}
            onMessage={setMessage}
          />
          <nav className="sidebar-menu sb-menu">
            <div className="nav-section-label">{t("layout.nav.menu")}</div>
            {NAV_ITEMS.map((item, i) => (
              item.active ? (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  data-tut={["gym", "camp", "fights", "rankings", "events", "hospital"].includes(item.id) ? `nav-${item.id}` : undefined}
                  className={`sb-menu-item ${activeTab === item.id ? "active" : ""}`}
                  onClick={(e) => { e.preventDefault(); handleNavTab(item.id); }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {item.id === "pvp" && pvpUnread && <span className="nav-dot" aria-label={t("layout.topbar.unreadDefenseReport")} />}
                </a>
              ) : (
                <div key={i} className="sb-menu-item disabled">
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </div>
              )
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="main">

          {/* ── DASHBOARD / HOME ── */}
          {activeTab === "home" && (
            <DashboardTab
              fighter={fighter}
              onNavigate={handleNavTab}
              onOpenProfile={() => setMobileDrawerOpen(true)}
              onOpenCareerProfile={openCareerProfile}
              refreshKey={feedRefreshKey}
              gymsRetired={gymsRetired}
            />
          )}

          {/* ── MY FIGHTER ── (profile lives in left nav) */}
          {activeTab === "fighter" && (
            <div className="fighter-page fighter-page-nav-only">
              <p className="panel-hint" style={{ padding: "1.5rem" }}>{t("app.fighterPageHint")}</p>
            </div>
          )}

          {/* ── TRAINING / GYM ── */}
          {activeTab === "gym" && (
            <div className="page-layout">
              <GymTrainingTab
                fighter={fighter}
                gyms={gyms}
                onTrain={handleTrain}
                training={training}
                onSwitchGym={handleSwitchGym}
                onRankUp={handleRankUp}
                flashSessionKey={flashSessionKey}
              />
            </div>
          )}

          {/* ── YOUR CAMP (Phase 0) ── */}
          {activeTab === "camp" && (
            <div className="page-layout">
              <CampTab
                fighter={fighter}
                onRefreshFighter={loadFighter}
                onMessage={setMessage}
                addToast={addToast}
                onMoveDropReveal={enqueueMoveDrop}
              />
            </div>
          )}

          {/* ── CAREER (Feed + Profile) ── */}
          {activeTab === "career" && (
            <div className="page-layout">
              <CareerPage
                fighter={fighter}
                fighterId={fighter?._id}
                refreshKey={feedRefreshKey}
                onMessage={setMessage}
                onRefreshFighter={loadFighter}
                onNavigate={handleNavTab}
                subTab={careerSubTab}
                onSubTabChange={setCareerSubTab}
                initialFight={careerInitialFight}
                onInitialFightConsumed={() => setCareerInitialFight(null)}
              />
            </div>
          )}

          {/* ── CONTRACTS ── */}
          {activeTab === "contracts" && (
            <div className="page-layout">
              <ContractsTab
                fighter={fighter}
                onMessage={setMessage}
                onRefreshFighter={loadFighter}
              />
            </div>
          )}

          {/* ── SPECIAL MOVES ── */}
          {activeTab === "moves" && (
            <div className="page-layout">
              <MovesTab
                fighter={fighter}
                onMessage={setMessage}
              />
            </div>
          )}

          {/* ── MEDIA ── */}
          {activeTab === "media" && (
            <div className="page-layout">
              <MediaHub
                fighter={fighter}
                onMessage={setMessage}
                onRefreshFighter={loadFighter}
                onNavigate={handleNavTab}
              />
            </div>
          )}

          {/* ── EVENTS ── */}
          {activeTab === "events" && (
            <div className="page-layout">
              <EventsTab
                fighter={fighter}
                onMessage={setMessage}
                onRefreshFighter={loadFighter}
                /* In-place iron patch after a bet is placed — avoids the full
                   fighter refetch + global re-render. Same pattern as the
                   post-fight interview fame delta. */
                onLocalIronDelta={(delta) => {
                  setFighter((prev) => {
                    if (!prev) return prev;
                    return { ...prev, iron: Math.max(0, (prev.iron || 0) + delta) };
                  });
                }}
              />
            </div>
          )}

          {/* ── HOSPITAL ── */}
          {activeTab === "hospital" && (
            <div className="page-layout">
              <HospitalTab
                fighter={fighter}
                onMessage={setMessage}
                onRefreshFighter={loadFighter}
              />
            </div>
          )}

          {activeTab === "rankings" && (
            <div className="page-layout">
              <RankingsTab
                fighter={fighter}
                onMessage={setMessage}
              />
            </div>
          )}

          {/* ── LIBRARY ── */}
          {activeTab === "library" && (
            <div className="page-layout">
              <LibraryTab />
            </div>
          )}

          {/* ── SHOP ── */}
          {activeTab === "shop" && (
            <div className="page-layout">
              <ShopTab
                fighter={fighter}
                onRefreshFighter={loadFighter}
                onMessage={setMessage}
              />
            </div>
          )}

          {/* ── ACCOUNT SETTINGS ── */}
          {activeTab === "account" && (
            <div className="page-layout">
              <AccountTab
                onMessage={setMessage}
                onLogout={handleLogout}
                onFighterRefresh={loadFighter}
                onAccountStatusRefresh={loadAccountStatus}
              />
            </div>
          )}

          {/* ── PROVING GROUND (PVP) ── */}
          {activeTab === "pvp" && (
            <div className="page-layout">
              <PvpHub
                fighter={fighter}
                onNavigate={handleNavTab}
                onRefreshFighter={loadFighter}
                onOpenCareerFight={onOpenCareerFight}
              />
            </div>
          )}

          {/* ── FIGHTS ── */}
          {activeTab === "fights" && (
            <div className="page-layout">
              {fighter?.acceptedFightId ? (
                <FightCamp
                  fighter={fighter}
                  campState={campState}
                  campReport={campReport}
                  onAddSession={handleAddCampSession}
                  onRemoveSession={handleRemoveCampSession}
                  onResolveInjury={handleResolveCampInjury}
                  onFinalise={() => handleFinaliseCamp(false)}
                  onProceedToFight={handleProceedFinalisedCamp}
                  onViewReport={() => { setReportFromCamp(true); setShowFighterReport(true); }}
                  addingSession={addingSession}
                  finalising={resolving}
                  onMessage={setMessage}
                  onNavigateShop={() => handleNavTab("shop")}
                  onRefreshFighter={loadFighter}
                  onSelectBuff={(buffId, label) => {
                    setCampState((prev) => prev ? { ...prev, selectedBuffId: buffId } : prev);
                    setSelectedBuffLabel(buffId ? label : null);
                  }}
                />
              ) : lastFightSummary ? (
                <>
                  <div className="fight-result-screen">
                    <FightSummary summary={lastFightSummary} description={<FightDescription commentary={lastFightCommentary} breakdown={lastFightBreakdown} playerName={fighter ? [fighter.firstName, fighter.nickname ? `"${fighter.nickname}"` : null, fighter.lastName].filter(Boolean).join(" ") : undefined} />} />
                  </div>
                  {/* Post-fight interview is offered only after wins. A loss skips the
                      press conference entirely — no fame opportunity, no flag-writing.
                      Draws don't trigger an interview either (no clear "win" to pitch).
                      The component stays mounted after the player picks a tone so its
                      built-in DONE state can show what they said and which flag was placed
                      — passing `initialResult` lets it boot directly into DONE on re-renders. */}
                  {lastFightSummary.fightId && lastFightSummary.recordChange === "W" && (
                    <PostFightInterview
                      fighterId={fighter?._id}
                      fightId={lastFightSummary.fightId}
                      opponentId={lastFightSummary.opponentId}
                      opponentName={lastFightSummary.opponentName}
                      initialResult={lastFightSummary.interviewResult}
                      onResolved={(res) => {
                        // Store the result so the component shows its DONE state on re-renders.
                        setLastFightSummary((prev) => prev ? { ...prev, interviewDone: true, interviewResult: res } : prev);
                        // Apply the fame delta locally instead of refetching the full
                        // fighter from the server — a full setFighter() replacement
                        // changes the object reference, which re-renders the sidebar,
                        // stat meters, badges, and fight summary in lockstep and reads
                        // visually like a full-app refresh. Other server-side state
                        // (flags, fight history) syncs on the next natural refresh
                        // (60s interval, or any subsequent player action).
                        if (res?.fameDelta) {
                          setFighter((prev) => {
                            if (!prev) return prev;
                            const score = (prev.notoriety?.score || 0) + res.fameDelta;
                            return { ...prev, notoriety: { ...prev.notoriety, score } };
                          });
                        }
                        tutorialBus.emit("interview_done");
                      }}
                      onMessage={setMessage}
                    />
                  )}
                  <div className="continue-row">
                    <button
                      type="button"
                      data-tut="result-continue"
                      className="btn btn-primary continue-btn"
                      onClick={() => { setLastFightSummary(null); tutorialBus.emit("result_dismissed"); }}
                    >
                      {t("app.continueBtn")}
                    </button>
                  </div>
                </>
              ) : (
                <FightOffers
                  fighter={fighter}
                  offers={offers}
                  onGetOffers={handleGetOffers}
                  onAcceptOffer={handleAcceptOffer}
                  onRefreshFighter={loadFighter}
                  onMessage={setMessage}
                />
              )}

            </div>
          )}

        </main>

      </div>

      {/* ── MOBILE BOTTOM NAV ── (hidden on desktop via CSS) */}
      <nav className="m-bottom-nav">
        {/* Points at Your Camp once the gyms retire (contract §6.3) — the
            "gym" tab no longer exists in NAV_ITEMS at that point. */}
        <button type="button" className={`m-nav-item ${activeTab === (gymsRetired ? "camp" : "gym") ? "act" : ""}`} onClick={() => handleNavTab(gymsRetired ? "camp" : "gym")}>
          <Dumbbell size={17} strokeWidth={2.2} /><span>{t("layout.nav.train")}</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "fights" ? "act" : ""}`} onClick={() => handleNavTab("fights")}>
          <Swords size={17} strokeWidth={2.2} /><span>{t("layout.nav.fight")}</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "career" ? "act" : ""}`} onClick={() => handleNavTab("career")}>
          <FileText size={17} strokeWidth={2.2} /><span>{t("layout.nav.career")}</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "rankings" ? "act" : ""}`} onClick={() => handleNavTab("rankings")}>
          <ListOrdered size={17} strokeWidth={2.2} /><span>{t("layout.nav.rank")}</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "pvp" ? "act" : ""}`} onClick={() => handleNavTab("pvp")}>
          <Crosshair size={17} strokeWidth={2.2} /><span>{t("layout.nav.pvp")}</span>
          {pvpUnread && <span className="nav-dot" aria-label={t("layout.topbar.unreadDefenseReport")} />}
        </button>
        <button type="button" className={`m-nav-item ${mobileDrawerOpen ? "act" : ""}`} onClick={() => setMobileDrawerOpen(true)}>
          <Menu size={17} strokeWidth={2.2} /><span>{t("layout.nav.more")}</span>
        </button>
      </nav>

      {/* ── MOBILE RIGHT DRAWER ── (render-gated, inline; hidden on desktop via CSS) */}
      {mobileDrawerOpen && (
        <>
          <div className="m-drawer-overlay" onClick={() => setMobileDrawerOpen(false)} />
          <aside className="m-drawer open">
            <div className="m-drawer-head">
              <span className="m-drawer-title">
                {fighter?.firstName} {fighter?.lastName}
                {fighter?.nickname && <em>"{fighter.nickname}"</em>}
              </span>
              <button type="button" className="m-drawer-close" aria-label={t("layout.drawer.closeMenu")} onClick={() => setMobileDrawerOpen(false)}>
                <X size={20} strokeWidth={2.2} />
              </button>
            </div>
            <div className="m-drawer-body">
              <FighterProfile
                fighter={fighter}
                gyms={gyms}
                campSlotsUsed={campState?.slotsUsed}
                onUpdateFighter={handleUpdateFighter}
                onRefreshFighter={loadFighter}
                onMessage={setMessage}
              />
              <InventorySidebar
                fighter={fighter}
                onRefreshFighter={loadFighter}
                onNavigateShop={() => handleNavTab("shop")}
                onMessage={setMessage}
              />
              <nav className="sidebar-menu sb-menu m-drawer-menu">
                <div className="nav-section-label">{t("layout.nav.menu")}</div>
                {NAV_ITEMS.map((item, i) => (
                  item.active ? (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      data-tut={["gym", "camp", "fights", "rankings", "events", "hospital"].includes(item.id) ? `nav-${item.id}` : undefined}
                      className={`sb-menu-item ${activeTab === item.id ? "active" : ""}`}
                      onClick={(e) => { e.preventDefault(); handleNavTab(item.id); }}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                      {item.id === "pvp" && pvpUnread && <span className="nav-dot" aria-label={t("layout.topbar.unreadDefenseReport")} />}
                    </a>
                  ) : (
                    <div key={i} className="sb-menu-item disabled">
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                    </div>
                  )
                ))}
              </nav>
              {/* Account + session actions. The desktop bottombar holds these, but
                  it's display:none on mobile — so surface them in the drawer or the
                  player has no way to reach Account settings or sign out on portrait. */}
              <nav className="sidebar-menu sb-menu m-drawer-menu">
                <div className="nav-section-label">{t("layout.bottombar.account")}</div>
                <a
                  href="#account"
                  className={`sb-menu-item ${activeTab === "account" ? "active" : ""}`}
                  onClick={(e) => { e.preventDefault(); handleNavTab("account"); setMobileDrawerOpen(false); }}
                >
                  <span className="nav-icon"><UserCircle2 size={13} strokeWidth={2.2} /></span>
                  {t("layout.bottombar.accountSettings")}
                </a>
                <button
                  type="button"
                  className="sb-menu-item"
                  onClick={() => { setMobileDrawerOpen(false); handleLogout(); }}
                >
                  <span className="nav-icon"><LogOut size={13} strokeWidth={2.2} /></span>
                  {t("layout.bottombar.signOut")}
                </button>
              </nav>
              <div className="m-drawer-legal">
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-cookie-policy"))}>{t("layout.bottombar.cookiePolicy")}</button>
                <span>·</span>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-privacy-policy"))}>{t("layout.bottombar.privacy")}</button>
                <span>·</span>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-terms"))}>{t("layout.bottombar.terms")}</button>
                <span>·</span>
                <button type="button" onClick={() => { setMobileDrawerOpen(false); window.dispatchEvent(new CustomEvent("open-bug-report")); }}>Report a Bug</button>
                <span>·</span>
                <button type="button" className="bb-btn-whatsnew" onClick={() => { setMobileDrawerOpen(false); openChangelog(); }}>
                  {t("changelog.whatsNewButton")} v{CURRENT_VERSION}
                  {changelogUnseen && <span className="nav-dot nav-dot--pulse" aria-label={t("changelog.unseenLabel")} />}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ── FULL-WIDTH BOTTOM BAR ── */}
      <footer className="bottombar">
        <div className="bottombar-inner">
          <span className="bb-brand">{t("layout.bottombar.brandName")}</span>
          <span className="bb-copyright">{t("layout.bottombar.copyright", { year: new Date().getFullYear() })}</span>
          {injuryCount > 0 && (
            <button type="button" className="bb-pill bb-pill-injury" onClick={() => handleNavTab("hospital")}>
              🩹 {t(injuryCount === 1 ? "layout.bottombar.injurySingular" : "layout.bottombar.injuryPlural", { count: injuryCount })}
            </button>
          )}
          {campActive && (
            <button type="button" className="bb-pill bb-pill-camp" onClick={() => handleNavTab("fights")}>
              ⛺ {t("layout.bottombar.campSessions", { count: campState?.slotsUsed ?? fighter.trainingCampActions ?? 0 })}
            </button>
          )}
          {fighter && (
            <button type="button" className="bb-pill bb-pill-fame" onClick={() => setFameDrawerOpen(true)}>
              {t("layout.bottombar.fame")}
            </button>
          )}
          <div className="bb-right">
            <button
              type="button"
              className={`bb-btn ${activeTab === "account" ? "active" : ""}`}
              onClick={() => handleNavTab("account")}
              title={t("layout.bottombar.accountSettings")}
            >
              <UserCircle2 size={12} strokeWidth={2.2} /> {t("layout.bottombar.account")}
            </button>
            <button
              type="button"
              className="bb-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-cookie-policy"))}
              title={t("layout.bottombar.cookiePolicyTitle")}
            >
              {t("layout.bottombar.cookiePolicy")}
            </button>
            <button
              type="button"
              className="bb-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-privacy-policy"))}
            >
              {t("layout.bottombar.privacy")}
            </button>
            <button
              type="button"
              className="bb-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-terms"))}
            >
              {t("layout.bottombar.terms")}
            </button>
            <button
              type="button"
              className="bb-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-bug-report"))}
            >
              Report a Bug
            </button>
            <button
              type="button"
              className="bb-btn bb-btn-whatsnew"
              onClick={openChangelog}
            >
              {t("changelog.whatsNewButton")} v{CURRENT_VERSION}
              {changelogUnseen && <span className="nav-dot nav-dot--pulse" aria-label={t("changelog.unseenLabel")} />}
            </button>
            <button type="button" className="bb-btn" onClick={handleLogout} title={t("layout.bottombar.signOutTitle")}>{t("layout.bottombar.signOut")}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
