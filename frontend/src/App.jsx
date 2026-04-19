import { useState, useEffect, useCallback, memo } from "react";
import { api, authStorage } from "./api";
import "./App.css";
import { MessageBar } from "./components/layout/MessageBar";
import { FighterProfile } from "./components/fighterProfile/FighterProfile";
import { GymTraining, SESSION_META } from "./components/gym/GymTraining";
import { GymSelector } from "./components/gym/GymSelector";
import { TrainingResultPopup } from "./components/gym/TrainingResultPopup";
import { TierUpOverlay, BeltWonOverlay } from "./components/fights/TierUpOverlay";
import { FightOffers } from "./components/fights/FightOffers";
import { FightCamp } from "./components/fights/FightCamp";
import { FighterReport } from "./components/fights/FighterReport";
import { CampSummary } from "./components/fights/CampSummary";
import { FightDescription } from "./components/fights/FightDescription";
import { FightSummary } from "./components/fights/FightSummary";
import { OctagonBackground } from "./components/layout/OctagonBackground";
import { CareerFeed } from "./components/CareerFeed";
import { AuthPage } from "./components/auth/AuthPage";
import { FightLimitPopup } from "./components/fights/FightLimitPopup";

// ── Navigation definition ──────────────────────────────────
const NAV_ITEMS = [
  { id: "gym",     label: "Training",   icon: "⬡", active: true },
  { id: "fights",  label: "Fight",      icon: "✕", active: true },
  { id: "career",  label: "Career",     icon: "◆", active: true },
  { id: null,      label: "Rankings",   icon: "▲", active: false },
  { id: null,      label: "Contracts",  icon: "▣", active: false },
  { id: null,      label: "Shop",       icon: "⊕", active: false },
  { id: null,      label: "Events",     icon: "◷", active: false },
  { id: null,      label: "Messages",   icon: "✉", active: false },
];

// ── Tier ladder for display ────────────────────────────────
const TIER_LADDER_DISPLAY = [
  { id: "Amateur",        label: "Amateur",       minOvr: 0,  nextOvr: 30 },
  { id: "Regional Pro",   label: "Regional Pro",  minOvr: 30, nextOvr: 45 },
  { id: "National",       label: "National",      minOvr: 45, nextOvr: 60 },
  { id: "GCS Contender",  label: "GCS Contender", minOvr: 60, nextOvr: 62 },
  { id: "GCS",            label: "GCS",           minOvr: 62, nextOvr: null },
];

// ── Header resource bar ─────────────────────────────────────
const HdrResource = memo(function HdrResource({ icon, label, value, max, barColor }) {
  const pct = Math.min(100, Math.round(((value ?? 0) / (max ?? 100)) * 100));
  return (
    <div className="hdr-resource">
      <span className="hdr-resource-icon">{icon}</span>
      <span className="hdr-resource-label">{label}:</span>
      <span className="hdr-resource-val">{value ?? 0}/{max ?? 100}</span>
      <div className="hdr-resource-bar">
        <div className="hdr-resource-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  );
});

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
          <span>⊗ {fighter?.iron ?? 0}</span>
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
const GATED_TIERS = new Set(["Regional Pro", "National", "GCS"]);

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
  const titleReady = pending && wins >= 3 && cooldown <= 0;
  const titleCooldown = pending && cooldown > 0;
  const titleWinsNeeded = pending && wins < 3;

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
            OVR reached — {3 - wins} more win{3 - wins !== 1 ? "s" : ""} to earn title shot
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
              <div className="rp-detail">Iron earned: +{lastFightSummary.ironEarned ?? 0} ⊗</div>
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
            <li className={`sl-item ${fighter?.mentalResetRequired ? "sl-danger" : ""}`}>
              ● Mental state: {fighter?.mentalResetRequired ? "Reset required — visit My Fighter" : "Clear"}
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
const GymTrainingTab = memo(function GymTrainingTab({ fighter, gyms, onTrain, onSwitchGym, onRankUp }) {
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

  const handleTrain = useCallback((sessionKey) => {
    if (!selectedGymId) return;
    onTrain(selectedGymId, sessionKey);
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
      onBack={() => setShowSelector(true)}
      onSwitchGym={onSwitchGym}
      onRankUp={onRankUp}
    />
  );
});

// ── Main App ────────────────────────────────────────────────
function App() {
  // ── Auth state ─────────────────────────────────────────────
  const [authed, setAuthed] = useState(authStorage.isLoggedIn());

  // ── Game state ─────────────────────────────────────────────
  const [fighter,  setFighter]                  = useState(null);
  const [gyms,     setGyms]                     = useState([]);
  const [offers,   setOffers]                   = useState([]);
  const [message,  setMessage]                  = useState("");
  const [loading,  setLoading]                  = useState(true);
  const [resolving, setResolving]               = useState(false);
  const [lastFightCommentary, setLastFightCommentary] = useState([]);
  const [lastFightSummary, setLastFightSummary] = useState(null);
  const [feedRefreshKey, setFeedRefreshKey]     = useState(0);
  const [champions, setChampions]               = useState([]);
  const [activeTab, setActiveTab]               = useState("gym");
  const [trainingResultPopup, setTrainingResultPopup] = useState({ open: false, sessionLabel: "", xpGained: {}, statLevelUps: [] });
  const [tierUpModal, setTierUpModal] = useState(null);
  const [beltWonModal, setBeltWonModal] = useState(null);
  const [fightLimitPopup, setFightLimitPopup] = useState({ open: false, message: "" });
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

  const maybeShowBlockPopup = useCallback((rawMessage, errorCode) => {
    const blockingCodes = new Set([
      "FIGHT_DAILY_CAP_REACHED",
      "FIGHT_NOT_ENOUGH_ENERGY",
      "FIGHT_MENTAL_RESET_REQUIRED",
      "FIGHT_DOCTOR_VISIT_REQUIRED",
      "FIGHT_NO_ACCEPTED_FIGHT",
      "FIGHT_INVALID_STRATEGY",
      "FIGHT_INVALID_WEIGHT_CUT",
    ]);
    const msg = (rawMessage || "").toLowerCase();
    const fallbackByMessage = [
      "daily fight cap reached",
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
      setLoading(false);
    })();
  }, [authed, loadFighter, loadGyms]);

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
    setActiveTab("gym");
    setMessage("");
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
    async (trainGym, trainSession) => {
      if (!fighter?._id || !trainGym) {
        setMessage("Select a fighter and a gym.");
        return;
      }
      try {
        const result = await api.train(fighter._id, trainGym, trainSession);
        const sessionLabel = (SESSION_META[trainSession] ?? SESSION_META.bag_work).label;
        setTrainingResultPopup({
          open: true,
          sessionLabel,
          xpGained: result.xpGained ?? {},
          statLevelUps: result.statLevelUps ?? [],
        });
        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
      } catch (e) {
        setMessage(e.message || "Train failed");
      }
    },
    [fighter?._id, loadFighter]
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
      if (!fighter?._id) return;
      try {
        const result = await api.rankUpGym(fighter._id, gymId);
        setMessage(result.rankUp?.unlockDescription || "Ranked up!");
        loadFighter(fighter._id, { clearMessage: false });
        loadGyms();
      } catch (e) {
        setMessage(e.message || "Rank up failed");
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
    setLastFightSummary(null);
    try {
      const result = await api.resolveFight(fighter._id);
      const commentary = result.fight?.commentary || result.result?.commentary || [];
      setLastFightCommentary(Array.isArray(commentary) ? commentary : []);
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
      setMessage(`${out} — +${iron} ⊗${rec ? ` | Record: ${rec.wins}-${rec.losses}-${rec.draws}` : ""}${firstWinHint}`);
      loadFighter(fighter._id);
      setFeedRefreshKey((k) => k + 1);
      // Clean up camp state after fight
      setCampState(null);
      setCampReport(null);
      setCampSummaryData(null);
      setShowCampSummary(false);
    } catch (e) {
      const errMsg = e.message || "Resolve failed";
      maybeShowBlockPopup(errMsg, e.code);
      setMessage(errMsg);
    }
    setResolving(false);
  }, [fighter?._id, loadFighter, maybeShowBlockPopup]);

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

  const closeTrainingPopup = useCallback(() => {
    setTrainingResultPopup((p) => ({ ...p, open: false }));
  }, []);

  const handleNavTab = useCallback((id) => {
    setActiveTab(id);
  }, []);

  // Show auth page if not logged in
  if (!authed) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">Loading…</div>
      </div>
    );
  }

  const injuryCount = fighter?.injuries?.length ?? 0;
  const campActive  = !!fighter?.acceptedFightId;

  return (
    <div className="app">

      {/* ── TOP HEADER (centered) ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-logo">Ground <span>&amp;</span> Pound</h1>
          <div className="hdr-sep" />

          {fighter && (
            <>
              <div className="hdr-fame-block" title={fighter.notoriety?.isFrozen ? "Fame frozen — win to resume growth" : "Fame — affects fight purses"}>
                <span className={`hdr-fame-tier hdr-tier-${fighter.notoriety?.peakTier ?? "UNKNOWN"}`}>
                  {fighter.notoriety?.tierLabel ?? "Unknown"}
                </span>
                <span className="hdr-fame-score">{(fighter.notoriety?.score ?? 0).toLocaleString()}</span>
                {fighter.notoriety?.isFrozen && <span className="hdr-fame-freeze" title="Frozen">❄</span>}
              </div>
              <span className="hdr-iron">
                <span className="hdr-iron-icon">⊗</span>
                {fighter.iron ?? 0}
              </span>
            </>
          )}

          <div className="hdr-resources">
            {fighter && (
              <>
                <HdrResource icon="⚡" label="Energy" value={fighter.energy?.current ?? fighter.energy ?? 0} max={fighter.energy?.max ?? 100} barColor="#3b82f6" />
                <HdrResource icon="❤" label="Health" value={fighter.health ?? 100} max={100} barColor="#e31837" />
              </>
            )}
          </div>

          <div className="hdr-right">
            {injuryCount > 0 && (
              <div className="hdr-badge-btn">
                🩹 <span className="hdr-badge-count">{injuryCount}</span>
              </div>
            )}
            {campActive && (
              <div className="hdr-badge-btn">
                ⛺ Camp <span className="hdr-badge-count">{campState?.slotsUsed ?? fighter.trainingCampActions ?? 0}</span>
              </div>
            )}
            <button className="hdr-logout" onClick={handleLogout} title="Sign out">Sign Out</button>
          </div>
        </div>
      </header>

      {/* ── MESSAGE BAR ── */}
      <MessageBar message={message} />

      {/* ── TRAINING RESULT POPUP (after train, no message bar) ── */}
      <TrainingResultPopup
        open={trainingResultPopup.open}
        sessionLabel={trainingResultPopup.sessionLabel}
        xpGained={trainingResultPopup.xpGained}
        statLevelUps={trainingResultPopup.statLevelUps}
        onClose={closeTrainingPopup}
      />

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

      {/* ── FIGHTER REPORT MODAL ── */}
      {showFighterReport && campReport && (
        <FighterReport
          report={campReport}
          onStartCamp={() => setShowFighterReport(false)}
          onClose={() => setShowFighterReport(false)}
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
        />
      )}

      {/* ── BODY: centered block = nav + main ── */}
      <div className="app-body">
        <div className="app-center-wrap">

        {/* Left nav — attached to center block */}
        <nav className="app-nav">
          <div className="nav-fighter-profile">
            <FighterProfile
              fighter={fighter}
              gyms={gyms}
              campSlotsUsed={campState?.slotsUsed}
              onUpdateFighter={handleUpdateFighter}
              onRefreshFighter={loadFighter}
              onMessage={setMessage}
            />
          </div>
          <div className="nav-menu">
            <div className="nav-section-label">Menu</div>
            {NAV_ITEMS.map((item, i) => (
              item.active ? (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`nav-item ${activeTab === item.id ? "active" : ""}`}
                  onClick={(e) => { e.preventDefault(); handleNavTab(item.id); }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </a>
              ) : (
                <div key={i} className="nav-item disabled">
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </div>
              )
            ))}
          </div>
        </nav>

        {/* Main content — centered column with left/right empty space */}
        <main className="app-main">
          <div className="app-main-center">

          {/* ── DASHBOARD ── */}
          {activeTab === "home" && (
            <div className="dashboard">
              <div className="dashboard-left">
                <QuickActions onNavigate={setActiveTab} />

              </div>

              <div className="dashboard-right">
                <OctagonBackground />
                <div className="dashboard-right-content">
                  <RightPanels
                    fighter={fighter}
                    lastFightSummary={lastFightSummary}
                    campSlotsUsed={campState?.slotsUsed}
                    champions={champions}
                  />
                </div>
              </div>
            </div>
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
                onSwitchGym={handleSwitchGym}
                onRankUp={handleRankUp}
              />
            </div>
          )}

          {/* ── CAREER FEED ── */}
          {activeTab === "career" && (
            <div className="page-layout">
              <CareerFeed
                fighterId={fighter?._id}
                refreshKey={feedRefreshKey}
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
                />
              ) : lastFightSummary ? (
                <>
                  <div className="page-two-col">
                    <FightSummary summary={lastFightSummary} />
                    <FightDescription commentary={lastFightCommentary} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: "0.5rem" }}>
                    <button type="button" className="btn btn-primary" onClick={() => setLastFightSummary(null)}>
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
                />
              )}

            </div>
          )}

          </div>
        </main>

        </div>
      </div>
    </div>
  );
}

export default App;
