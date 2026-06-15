import { useState, useEffect, useCallback, useRef, memo } from "react";
import { api, authStorage } from "./api";
import "./App.css";
import { FighterProfile } from "./components/fighterProfile/FighterProfile";
import { GymTraining, SESSION_META } from "./components/gym/GymTraining";
import { GymSelector } from "./components/gym/GymSelector";
import { ToastContainer } from "./components/gym/ToastContainer";
import { TierUpOverlay, BeltWonOverlay } from "./components/fights/TierUpOverlay";
import { FightOffers } from "./components/fights/FightOffers";
import { FightCamp } from "./components/fights/FightCamp";
import { FighterReport } from "./components/fights/FighterReport";
import { CampSummary } from "./components/fights/CampSummary";
import { FightDescription } from "./components/fights/FightDescription";
import { FightSummary } from "./components/fights/FightSummary";
import { ContenderModal } from "./components/fights/ContenderModal";
import { OctagonBackground } from "./components/layout/OctagonBackground";
import { CareerFeed } from "./components/CareerFeed";
import { CareerPage } from "./components/career/CareerPage";
import { prettifyBadgeId } from "./components/career/badgeCatalog";
import { AuthPage } from "./components/auth/AuthPage";
import { FightLimitPopup } from "./components/fights/FightLimitPopup";
import { FameDrawer } from "./components/fame/FameDrawer";
import { ContractsTab } from "./components/contracts/ContractsTab";
import { MediaHub } from "./components/media/MediaHub";
import { EventsTab } from "./components/events/EventsTab";
import { HospitalTab } from "./components/hospital/HospitalTab";
import { RankingsTab } from "./components/rankings/RankingsTab";
import { PostFightInterview } from "./components/fights/PostFightInterview";
import { TutorialOverlay } from "./components/tutorial/TutorialOverlay";
import { LibraryTab } from "./components/library/LibraryTab";
import { AccountTab } from "./components/account/AccountTab";
import { EmailVerifyBanner } from "./components/account/EmailVerifyBanner";
import { DashboardTab } from "./components/dashboard/DashboardTab";
import { ShopTab } from "./components/shop/ShopTab";
import { InventorySidebar } from "./components/shop/InventorySidebar";
import { CookieConsent } from "./components/legal/CookieConsent";
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
  Zap,
  Heart,
  CheckCircle2,
  Circle,
  ChevronRight,
  Trophy,
  Crosshair,
} from "lucide-react";

// ── Navigation definition ──────────────────────────────────
const NAV_ITEMS = [
  { id: "home",      label: "Home",      icon: <LayoutDashboard size={13} strokeWidth={2.2} />, active: true },
  { id: "gym",       label: "Training",  icon: <Dumbbell size={13} strokeWidth={2.2} />,    active: true },
  { id: "fights",    label: "Fight",     icon: <Swords size={13} strokeWidth={2.2} />,      active: true },
  { id: "career",    label: "Career",    icon: <FileText size={13} strokeWidth={2.2} />,    active: true },
  { id: "pvp",       label: "Proving Ground", icon: <Crosshair size={13} strokeWidth={2.2} />, active: true },
  { id: "rankings",  label: "Rankings",  icon: <ListOrdered size={13} strokeWidth={2.2} />, active: true },
  { id: "contracts", label: "Contracts", icon: <ScrollText size={13} strokeWidth={2.2} />,  active: true },
  { id: "hospital",  label: "Hospital",  icon: <Cross size={13} strokeWidth={2.2} />,       active: true },
  { id: "shop",      label: "Shop",      icon: <ShoppingBag size={13} strokeWidth={2.2} />, active: true },
  { id: "events",    label: "Events",    icon: <CalendarDays size={13} strokeWidth={2.2} />,active: true },
  { id: "media",     label: "Media",     icon: <Mic size={13} strokeWidth={2.2} />,         active: true },
  { id: "library",   label: "Library",   icon: <BookOpen size={13} strokeWidth={2.2} />,    active: true },
];

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

function FighterCard({ fighter }) {
  const rec = fighter?.record ?? {};
  const gym = fighter?.gymId;
  const gymName = gym?.name ?? (typeof gym === "string" ? "—" : "—");

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
            : "No fighter selected"}
        </div>

        <div className="fighter-card-meta">
          <span>Record: <strong>{rec.wins ?? 0}W – {rec.losses ?? 0}L</strong></span>
          <span>OVR: <strong className="text-red">{fighter?.overallRating ?? "—"}</strong></span>
          <span>{fighter?.promotionTier ?? "Amateur"}</span>
        </div>

        <div className="fighter-card-bars">
          {[
            { label: "Energy", val: fighter?.energy ?? 100, max: 100, color: "#3b82f6" },
            { label: "Health", val: fighter?.health ?? 100, max: 100, color: "#e31837" },
          ].map(({ label, val, max, color }) => {
            const pct = Math.min(100, Math.round((val / max) * 100));
            return (
              <div key={label} className="fc-bar-row">
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
          <span>Gym: {gymName}</span>
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
const QuickActions = memo(function QuickActions({ onNavigate }) {
  return (
    <div className="quick-actions-section">
      <div className="quick-actions-title">Quick Actions</div>
      <div className="quick-actions">
        <button className="qa-btn qa-train" onClick={() => onNavigate("gym")}>Train</button>
        <button className="qa-btn qa-fight" onClick={() => onNavigate("fights")}>Fight</button>
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
      <h3 className="panel-title">Tier Competition</h3>
      <div className="panel-body">
        <div className="tier-steps">
          {TIER_LADDER_DISPLAY.map((t, i) => {
            const done   = i < currentIdx;
            const active = t.id === currentTier;
            const champ = (champions ?? []).find((c) => c.championTier === t.id);
            return (
              <div key={t.id} className={`tier-step ${active ? "tier-active" : done ? "tier-done" : "tier-locked"}`}>
                {done ? <CheckCircle2 size={10} /> : active ? <ChevronRight size={10} /> : <Circle size={10} />} {t.label}
                {!done && !active && t.minOvr > 0 && <span style={{ color: "var(--text-muted)", marginLeft: "0.3rem", fontSize: "9px" }}>OVR {t.minOvr}+</span>}
                {GATED_TIERS.has(t.id) && champ && !done && (
                  <span style={{ color: "var(--gold-bright)", marginLeft: "0.3rem", fontSize: "9px" }}>
                    Champ: {champ.name} ({champ.overallRating})
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Title shot status messages */}
        {titleReady && (
          <div className="tier-title-status tier-title-ready">
            <Trophy size={12} /> Title shot available — fight for the belt!
          </div>
        )}
        {titleCooldown && (
          <div className="tier-title-status tier-title-cooldown">
            Title shot lost — {cooldown} more win{cooldown !== 1 ? "s" : ""} to retry
          </div>
        )}
        {titleWinsNeeded && (
          <div className="tier-title-status tier-title-wins">
            OVR reached — {titleWins - wins} more win{titleWins - wins !== 1 ? "s" : ""} to earn title shot
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
            GCS Champion — top tier reached.
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
        <h3 className="panel-title">Latest Fight Result</h3>
        <div className="panel-body">
          {lastFightSummary ? (
            <>
              <div className={`rp-outcome ${["KO/TKO","Submission","Decision (unanimous)","Decision (split)"].includes(lastFightSummary.outcome) ? "rp-win" : "rp-loss"}`}>
                {lastFightSummary.outcome}
              </div>
              <div className="rp-detail">Record: {lastFightSummary.recordAfter}</div>
              <div className="rp-detail">Cash earned: +${lastFightSummary.ironEarned ?? 0}</div>
              <div className="rp-detail">XP ×{lastFightSummary.xpMultiplier}</div>
              {lastFightSummary.promoted && (
                <div className="rp-promoted">⬆ Promoted to {lastFightSummary.promoted.to}!</div>
              )}
              {lastFightSummary.injuriesSustained?.length > 0 && (
                <div className="rp-detail" style={{ color: "#fbbf24", marginTop: "0.25rem" }}>
                  Injury: {lastFightSummary.injuriesSustained.join(", ")}
                </div>
              )}
            </>
          ) : (
            <p className="panel-hint">No recent fight data.</p>
          )}
        </div>
      </section>

      {/* Status */}
      <section className="rp-panel">
        <h3 className="panel-title">Game News</h3>
        <div className="panel-body">
          <ul className="status-list">
            <li className={`sl-item ${inCamp ? "sl-active" : ""}`}>
              ● Fight camp: {inCamp ? `${campSessions} session${campSessions === 1 ? "" : "s"} logged` : "None"}
            </li>
            <li className={`sl-item ${fighter?.comebackMode ? "sl-warn" : ""}`}>
              ● Comeback mode: {fighter?.comebackMode ? "Active — ×1.5 XP on next fight" : "—"}
            </li>
            <li className={`sl-item ${hasInjuries ? "sl-danger" : ""}`}>
              ● Injuries: {hasInjuries ? fighter.injuries.map((i) => i.label).join(", ") : "None"}
            </li>
            <li className="sl-item">
              ● Energy: +1 per minute (auto-regen)
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
  // Post-training toast stack (replaces the old result modal).
  const { toasts, addToast, beginDismiss } = useToasts();
  // Which session card currently shows the success border-flash (null = none).
  const [flashSessionKey, setFlashSessionKey] = useState(null);
  const flashTimerRef = useRef(null);
  // In-flight guard so a slow batch can't be double-submitted — one click now
  // spends up to 25× energy.
  const [training, setTraining] = useState(false);
  const [tierUpModal, setTierUpModal] = useState(null);
  const [beltWonModal, setBeltWonModal] = useState(null);
  const [fightLimitPopup, setFightLimitPopup] = useState({ open: false, message: "" });
  // One-time "you're a contender" announcement. We track the previous
  // pendingPromotion value so we only fire on the absent→set transition.
  const [contenderModal, setContenderModal] = useState(null);
  const prevPendingPromotionRef = useRef(undefined);
  const [fameDrawerOpen, setFameDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  /** Bumps after train / membership pay so gym quest panel refetches without a full page reload. */

  // ── Camp v1.1 state ────────────────────────────────────────
  const [campReport, setCampReport]           = useState(null);
  const [showFighterReport, setShowFighterReport] = useState(false);
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
      setFightLimitPopup({ open: true, message: rawMessage || "Action unavailable right now." });
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
    } catch (_) {}
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

  // Periodic refresh every minute
  useEffect(() => {
    if (!fighter?._id) return;
    const t = setInterval(() => loadFighter(fighter._id), 60 * 1000);
    return () => clearInterval(t);
  }, [fighter?._id, loadFighter]);

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

  // Email-change confirmation redirect — the backend bounces the user here from
  // /account/email/confirm with one of two query params. Surface the result via
  // the message bar, then strip the params so a refresh doesn't repeat it.
  useEffect(() => {
    if (bootParams.emailUpdated) {
      setMessage("Email address confirmed and updated.");
      clearBootParams();
    } else if (bootParams.emailUpdateError) {
      const map = {
        invalid_token:     "That email-confirmation link is invalid.",
        token_expired:     "That email-confirmation link has expired — please request a new one from your account page.",
        email_taken:       "That email is already in use by another account.",
        already_confirmed: "This email change has already been applied.",
      };
      setMessage(map[bootParams.emailUpdateError] || "Email confirmation failed.");
      clearBootParams();
    }
  }, [bootParams.emailUpdated, bootParams.emailUpdateError]);

  // Email-verification redirect — same pattern. On success we also flip the
  // local accountStatus so the banner disappears without needing a refetch.
  useEffect(() => {
    if (bootParams.emailVerified) {
      setMessage("Email verified — you're all set.");
      setAccountStatus((prev) => prev ? { ...prev, emailConfirmed: true, emailVerifyCooldown: 0 } : prev);
      clearBootParams();
    } else if (bootParams.emailVerifyError) {
      const map = {
        invalid_token: "That verification link is invalid or has already been used.",
        expired:       "That verification link has expired — request a new one from the banner at the top of the app.",
      };
      setMessage(map[bootParams.emailVerifyError] || "Email verification failed.");
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
        setMessage("Profile updated.");
      } catch (e) {
        setMessage(e.message || "Update failed");
      }
    },
    [loadFighter]
  );

  const handleTrain = useCallback(
    async (trainGym, trainSession, quantity = 1) => {
      if (!fighter?._id || !trainGym) {
        setMessage("Select a fighter and a gym.");
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
              addToast({ kind: "badge", badgeName: prettifyBadgeId(b.badgeId), badgeContext: b.context || null });
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

        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
      } catch (e) {
        // Covers 400 "Not enough energy", clamp-to-0, "quantity must be an
        // integer >= 1", etc.
        setMessage(e.message || "Train failed");
      } finally {
        setTraining(false);
      }
    },
    [fighter?._id, loadFighter, loadGyms, training, addToast]
  );

  const handleSwitchGym = useCallback(
    async (gymId) => {
      if (!fighter?._id) return;
      setMessage("Joining gym...");
      try {
        const result = await api.switchGym(fighter._id, gymId);
        setMessage(result.message || "Gym membership activated.");
        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
      } catch (e) {
        setMessage(e.message || "Failed to join gym");
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
    setMessage("Loading offers…");
    try {
      const list = await api.getOffers(fighter._id);
      setOffers(Array.isArray(list) ? list : []);
      setMessage(list?.length ? `${list.length} offer(s) ready.` : "No offers. Seed opponents?");
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
      setMessage("Accepting fight…");
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
        setMessage("Fight accepted — review your opponent before camp.");
        loadFighter(fighter._id, { clearMessage: false });
        setActiveTab("fights");
        tutorialBus.emit("fight_accepted");
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
        setMessage(`Injury in camp: ${result.injuryTriggered.label} — make a choice.`);
      } else {
        setMessage(`Session added: ${sessionType.replace(/_/g, " ").toLowerCase()}.`);
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
      setMessage("Session removed — energy refunded.");
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
      setMessage(choice === "STOP" ? "Camp stopped — entering fight healthy." : "Pushing through — injury penalty will apply at fight time.");
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
      setMessage(skip ? "Camp skipped — entering fight underprepared." : `Camp finalised — Rating: ${summary.campRating}`);
    } catch (e) {
      setMessage(e.message || "Failed to finalise camp");
    }
  }, [fighter?._id, fighter?.acceptedFightId, loadCampState]);

  const handleResolve = useCallback(async () => {
    if (!fighter?._id) return;
    setResolving(true);
    setMessage("Fight night…");
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
      if (result.summary?.notorietyTierUp) {
        setTierUpModal(result.summary.notorietyTierUp);
      }
      if (result.summary?.beltWon && result.summary?.promoted) {
        setBeltWonModal({
          from: result.summary.promoted.from,
          to: result.summary.promoted.to,
          weightClass: result.fighter?.weightClass,
        });
      }
      const out = result.fight?.outcome || "—";
      const iron = result.fight?.ironEarned ?? 0;
      const rec = result.fighter?.record;
      // First-fight hint: show once after first career win
      const isFirstWin = rec && rec.wins === 1 && result.summary?.recordChange === "W";
      const firstWinHint = isFirstWin ? " | Build your record and raise your OVR to earn a title shot. Win the belt to move up." : "";
      setMessage(`${out} — +$${iron}${rec ? ` | Record: ${rec.wins}-${rec.losses}-${rec.draws}` : ""}${firstWinHint}`);
      // Badge-unlock toasts — one per newly earned badge from the fight resolve.
      const newBadges = result.summary?.newlyEarnedBadges;
      if (Array.isArray(newBadges) && newBadges.length) {
        for (const b of newBadges) {
          addToast({
            kind: "badge",
            badgeName: prettifyBadgeId(b.badgeId),
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
      setMessage(e.message || "Failed to set weight cut");
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

  // Show auth page if not logged in. When the user arrived via the
  // password-reset email link we land directly on the forgot-password "apply"
  // form by passing the token through.
  if (!authed) {
    return <AuthPage onAuthenticated={handleAuthenticated} initialResetToken={bootParams.resetToken} />;
  }

  if (loading) {
    return (
      <div className="app">
        {/* Keep the consent notice visible during the load spinner so a
            first-time player isn't shown an un-acknowledged screen, then a pop-in. */}
        <CookieConsent />
        <div className="app-loading">Loading…</div>
      </div>
    );
  }

  const injuryCount = fighter?.injuries?.length ?? 0;
  const campActive  = !!fighter?.acceptedFightId;
  // Unread offline-defense dot — derived from the fighter prop (updated by the 60s poll)
  const pvpUnread = (fighter?.pvpDefense?.unreadCount ?? 0) > 0;

  return (
    <div className="app">

      {/* ── COOKIE / STORAGE ACKNOWLEDGEMENT ── */}
      <CookieConsent />

      {/* ── EMAIL-VERIFY BANNER ──
          Soft verification: the user can keep playing while this banner is up.
          Disappears the moment they click the link in their email (the verify
          redirect flips accountStatus.emailConfirmed via the URL-param effect). */}
      {accountStatus && !accountStatus.emailConfirmed && (
        <EmailVerifyBanner
          email={accountStatus.email}
          accountId={accountStatus.accountId}
          initialCooldown={accountStatus.emailVerifyCooldown}
          onMessage={setMessage}
        />
      )}

      {/* ── POST-TRAINING TOASTS (after train, no message bar) ── */}
      <ToastContainer toasts={toasts} onDismiss={beginDismiss} />

      <TierUpOverlay
        open={!!tierUpModal}
        fromTier={tierUpModal?.from}
        toTier={tierUpModal?.to}
        onClose={() => setTierUpModal(null)}
      />

      <BeltWonOverlay
        open={!!beltWonModal}
        fromTier={beltWonModal?.from}
        toTier={beltWonModal?.to}
        weightClass={beltWonModal?.weightClass}
        onClose={() => setBeltWonModal(null)}
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
        <div className="tlogo m-tlogo">GROUND <span>&amp;</span> POUND</div>
        <button type="button" className="m-hamburger" aria-label="Open menu" onClick={() => setMobileDrawerOpen(true)}>
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
          <div className="tlogo">GROUND <span>&amp;</span> POUND</div>
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
                  {item.id === "pvp" && pvpUnread && <span className="nav-dot" aria-label="Unread defense report" />}
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
          />
          <InventorySidebar
            fighter={fighter}
            onRefreshFighter={loadFighter}
            onNavigateShop={() => handleNavTab("shop")}
            onMessage={setMessage}
          />
          <nav className="sidebar-menu sb-menu">
            <div className="nav-section-label">Menu</div>
            {NAV_ITEMS.map((item, i) => (
              item.active ? (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  data-tut={["gym", "fights", "rankings", "events", "hospital"].includes(item.id) ? `nav-${item.id}` : undefined}
                  className={`sb-menu-item ${activeTab === item.id ? "active" : ""}`}
                  onClick={(e) => { e.preventDefault(); handleNavTab(item.id); }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {item.id === "pvp" && pvpUnread && <span className="nav-dot" aria-label="Unread defense report" />}
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
            />
          )}

          {/* ── MY FIGHTER ── (profile lives in left nav) */}
          {activeTab === "fighter" && (
            <div className="fighter-page fighter-page-nav-only">
              <p className="panel-hint" style={{ padding: "1.5rem" }}>Fighter details are in the left panel.</p>
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

          {/* ── CAREER (Feed + Profile) ── */}
          {activeTab === "career" && (
            <div className="page-layout">
              <CareerPage
                fighter={fighter}
                fighterId={fighter?._id}
                refreshKey={feedRefreshKey}
                onMessage={setMessage}
                onRefreshFighter={loadFighter}
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
                    <FightSummary summary={lastFightSummary} description={<FightDescription commentary={lastFightCommentary} breakdown={lastFightBreakdown} playerName={fighter ? `${fighter.firstName} "${fighter.nickname || "—"}" ${fighter.lastName}` : undefined} />} />
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
                      Continue
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
        <button type="button" className={`m-nav-item ${activeTab === "gym" ? "act" : ""}`} onClick={() => handleNavTab("gym")}>
          <Dumbbell size={17} strokeWidth={2.2} /><span>Train</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "fights" ? "act" : ""}`} onClick={() => handleNavTab("fights")}>
          <Swords size={17} strokeWidth={2.2} /><span>Fight</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "career" ? "act" : ""}`} onClick={() => handleNavTab("career")}>
          <FileText size={17} strokeWidth={2.2} /><span>Career</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "rankings" ? "act" : ""}`} onClick={() => handleNavTab("rankings")}>
          <ListOrdered size={17} strokeWidth={2.2} /><span>Rank</span>
        </button>
        <button type="button" className={`m-nav-item ${activeTab === "pvp" ? "act" : ""}`} onClick={() => handleNavTab("pvp")}>
          <Crosshair size={17} strokeWidth={2.2} /><span>PVP</span>
          {pvpUnread && <span className="nav-dot" aria-label="Unread defense report" />}
        </button>
        <button type="button" className={`m-nav-item ${mobileDrawerOpen ? "act" : ""}`} onClick={() => setMobileDrawerOpen(true)}>
          <Menu size={17} strokeWidth={2.2} /><span>More</span>
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
              <button type="button" className="m-drawer-close" aria-label="Close menu" onClick={() => setMobileDrawerOpen(false)}>
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
                <div className="nav-section-label">Menu</div>
                {NAV_ITEMS.map((item, i) => (
                  item.active ? (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      data-tut={["gym", "fights", "rankings", "events", "hospital"].includes(item.id) ? `nav-${item.id}` : undefined}
                      className={`sb-menu-item ${activeTab === item.id ? "active" : ""}`}
                      onClick={(e) => { e.preventDefault(); handleNavTab(item.id); }}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                      {item.id === "pvp" && pvpUnread && <span className="nav-dot" aria-label="Unread defense report" />}
                    </a>
                  ) : (
                    <div key={i} className="sb-menu-item disabled">
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                    </div>
                  )
                ))}
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* ── FULL-WIDTH BOTTOM BAR ── */}
      <footer className="bottombar">
        <div className="bottombar-inner">
          <span className="bb-brand">GROUND <span>&amp;</span> POUND</span>
          <span className="bb-copyright">© {new Date().getFullYear()} Digital Olive. All rights reserved.</span>
          {injuryCount > 0 && (
            <button type="button" className="bb-pill bb-pill-injury" onClick={() => handleNavTab("hospital")}>
              🩹 {injuryCount} injur{injuryCount === 1 ? "y" : "ies"}
            </button>
          )}
          {campActive && (
            <button type="button" className="bb-pill bb-pill-camp" onClick={() => handleNavTab("fights")}>
              ⛺ Camp — {campState?.slotsUsed ?? fighter.trainingCampActions ?? 0} sessions
            </button>
          )}
          {fighter && (
            <button type="button" className="bb-pill bb-pill-fame" onClick={() => setFameDrawerOpen(true)}>
              ★ Fame
            </button>
          )}
          <div className="bb-right">
            <button
              type="button"
              className={`bb-btn ${activeTab === "account" ? "active" : ""}`}
              onClick={() => handleNavTab("account")}
              title="Account settings"
            >
              <UserCircle2 size={12} strokeWidth={2.2} /> Account
            </button>
            <button
              type="button"
              className="bb-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("open-cookie-policy"))}
              title="Cookie Policy"
            >
              Cookie Policy
            </button>
            <button type="button" className="bb-btn" onClick={handleLogout} title="Sign out">Sign Out</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
