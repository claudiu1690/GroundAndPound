import { useState, useEffect, useCallback, memo } from "react";
import { api, authStorage } from "./api";
import "./App.css";
import { MessageBar } from "./components/layout/MessageBar";
import { FighterProfile } from "./components/fighterProfile/FighterProfile";
import { GymTraining, SESSION_META } from "./components/gym/GymTraining";
import { TrainingResultPopup } from "./components/gym/TrainingResultPopup";
import { TierUpOverlay } from "./components/fights/TierUpOverlay";
import { FightOffers } from "./components/fights/FightOffers";
import { FightCamp } from "./components/fights/FightCamp";
import { FighterReport } from "./components/fights/FighterReport";
import { CampSummary } from "./components/fights/CampSummary";
import { FightDescription } from "./components/fights/FightDescription";
import { FightSummary } from "./components/fights/FightSummary";
import { GymQuests } from "./components/gym/GymQuests";
import { OctagonBackground } from "./components/layout/OctagonBackground";
import { AuthPage } from "./components/auth/AuthPage";
import { FightLimitPopup } from "./components/fights/FightLimitPopup";

// ── Navigation definition ──────────────────────────────────
const NAV_ITEMS = [
  { id: "gym",     label: "Training",   icon: "⬡", active: true },
  { id: "fights",  label: "Fight",      icon: "✕", active: true },
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
            { label: "Energy",  val: fighter?.energy ?? 100,  max: 100,                        color: "#3b82f6" },
            { label: "Health",  val: fighter?.health ?? 100,  max: 100,                        color: "#e31837" },
            { label: "Stamina", val: fighter?.stamina ?? 100, max: fighter?.maxStamina ?? 100, color: "#22c55e" },
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
const QuickActions = memo(function QuickActions({ onNavigate, onRest, fighter }) {
  const maxSt = fighter?.maxStamina ?? 100;
  const healthFull = (fighter?.health ?? 100) >= 100;
  const staminaFull = (fighter?.stamina ?? maxSt) >= maxSt;
  const restDisabled = !fighter || (healthFull && staminaFull);

  return (
    <div className="quick-actions-section">
      <div className="quick-actions-title">Quick Actions</div>
      <div className="quick-actions">
        <button className="qa-btn qa-train"   onClick={() => onNavigate("gym")}>Train</button>
        <button className="qa-btn qa-fight"   onClick={() => onNavigate("fights")}>Fight</button>
        <button
          type="button"
          className="qa-btn qa-recover"
          disabled={restDisabled}
          title={restDisabled ? "Health and stamina are already full" : "Rest — 3 energy, +25 Health & Stamina (same as profile)"}
          onClick={onRest}
        >
          Recover
        </button>
      </div>
    </div>
  );
});

// ── Fight history from record data ──────────────────────────
const FightHistoryPanel = memo(function FightHistoryPanel({ fighter, lastFightSummary }) {
  const rec = fighter?.record ?? {};
  const items = [];

  if (lastFightSummary) {
    const isWin = ["KO/TKO","Submission","Decision (unanimous)","Decision (split)"].includes(lastFightSummary.outcome);
    items.push({ type: isWin ? "win" : "loss", text: lastFightSummary.outcome, sub: `Record: ${lastFightSummary.recordAfter}` });
  }
  if ((rec.koWins ?? 0) > 0)       items.push({ type: "win",  text: "KO/TKO Wins",       sub: `${rec.koWins} career finishes` });
  if ((rec.subWins ?? 0) > 0)      items.push({ type: "win",  text: "Submission Wins",    sub: `${rec.subWins} career submissions` });
  if ((rec.decisionWins ?? 0) > 0) items.push({ type: "win",  text: "Decision Wins",      sub: `${rec.decisionWins} decisions` });
  if ((rec.losses ?? 0) > 0)       items.push({ type: "loss", text: "Career Losses",      sub: `${rec.losses} total` });

  return (
    <section className="fight-history-panel">
      <h3 className="panel-section-title">Fight History</h3>
      {items.length === 0 ? (
        <p className="panel-hint" style={{ padding: "0.75rem 1rem" }}>No fights yet. Hit the cage!</p>
      ) : (
        <ul className="fight-history-list">
          {items.slice(0, 6).map((item, i) => (
            <li key={i} className={`fh-item fh-${item.type}`}>
              <span className="fh-dot" />
              <div>
                <span className="fh-text">{item.text}</span>
                <span className="fh-sub">{item.sub}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

// ── Tier progress (right panel) ─────────────────────────────
const TierProgress = memo(function TierProgress({ fighter }) {
  if (!fighter) return null;
  const currentTier = fighter.promotionTier ?? "Amateur";
  const ovr = fighter.overallRating ?? 0;
  const currentIdx = TIER_LADDER_DISPLAY.findIndex((t) => t.id === currentTier);
  const next = TIER_LADDER_DISPLAY[currentIdx + 1] ?? null;
  const current = TIER_LADDER_DISPLAY[currentIdx] ?? TIER_LADDER_DISPLAY[0];
  const pct = next
    ? Math.min(100, Math.round(((ovr - current.minOvr) / (next.minOvr - current.minOvr)) * 100))
    : 100;

  return (
    <section className="rp-panel">
      <h3 className="panel-title">Tier Competition</h3>
      <div className="panel-body">
        <div className="tier-steps">
          {TIER_LADDER_DISPLAY.map((t, i) => {
            const done   = i < currentIdx;
            const active = t.id === currentTier;
            return (
              <div key={t.id} className={`tier-step ${active ? "tier-active" : done ? "tier-done" : "tier-locked"}`}>
                {done ? "✓" : active ? "►" : "○"} {t.label}
                {!done && !active && t.minOvr > 0 && <span style={{ color: "var(--text-muted)", marginLeft: "0.3rem", fontSize: "9px" }}>OVR {t.minOvr}+</span>}
              </div>
            );
          })}
        </div>
        {next ? (
          <div className="tier-progress-wrap">
            <div className="tier-progress-label">
              <span>→ {next.label}</span>
              <span>OVR {ovr} / {next.minOvr}</span>
            </div>
            <div className="tier-progress-bar">
              <div className="tier-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--gold-bright)", fontWeight: 700, marginTop: "0.5rem" }}>
            GCS Champion — top tier reached.
          </div>
        )}
      </div>
    </section>
  );
});

// ── Right column panels ─────────────────────────────────────
const RightPanels = memo(function RightPanels({ fighter, lastFightSummary, campSlotsUsed }) {
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
      <TierProgress fighter={fighter} />
    </>
  );
});

/** Default gym: home (`fighter.gymId`), else first gym with valid paid membership, else first listed gym. */
function pickDefaultGymId(fighter, gyms) {
  if (!gyms?.length) return "";
  const homeId = fighter?.gymId?._id ?? fighter?.gymId;
  if (homeId != null && homeId !== "" && gyms.some((g) => String(g._id) === String(homeId))) {
    return String(homeId);
  }
  const now = Date.now();
  for (const m of fighter?.gymMemberships || []) {
    if (!m?.paidUntil || new Date(m.paidUntil).getTime() <= now) continue;
    if (gyms.some((g) => String(g._id) === String(m.gymId))) return String(m.gymId);
  }
  return String(gyms[0]._id);
}

/**
 * Gym + session selection lives here so changing gym/session does not re-render all of App.
 */
const GymTrainingTab = memo(function GymTrainingTab({ fighter, gyms, onTrain, onPayMembership, questRefreshKey }) {
  const [trainGym, setTrainGym] = useState("");
  const [trainSession, setTrainSession] = useState("bag_work");

  useEffect(() => {
    if (!gyms?.length) return;
    const preferred = pickDefaultGymId(fighter, gyms);
    if (!trainGym) {
      setTrainGym(preferred);
      return;
    }
    const naiveFirst = String(gyms[0]._id);
    if (String(trainGym) === naiveFirst && preferred !== naiveFirst) {
      setTrainGym(preferred);
    }
  }, [gyms, trainGym, fighter]);

  useEffect(() => {
    if (!gyms?.length || !trainGym) return;
    if (!gyms.some((g) => String(g._id) === String(trainGym))) {
      setTrainGym(pickDefaultGymId(fighter, gyms));
    }
  }, [gyms, trainGym, fighter]);

  const handleTrainClick = useCallback(() => {
    onTrain(trainGym, trainSession);
  }, [onTrain, trainGym, trainSession]);

  return (
    <div className="page-two-col">
      <GymTraining
        fighter={fighter}
        gyms={gyms}
        trainGym={trainGym}
        trainSession={trainSession}
        onGymChange={setTrainGym}
        onSessionChange={setTrainSession}
        onTrain={handleTrainClick}
        onPayMembership={onPayMembership}
      />
      <GymQuests fighter={fighter} gymId={trainGym} refreshKey={questRefreshKey} />
    </div>
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
  const [activeTab, setActiveTab]               = useState("gym");
  const [trainingResultPopup, setTrainingResultPopup] = useState({ open: false, sessionLabel: "", xpGained: {}, statLevelUps: [] });
  const [tierUpModal, setTierUpModal] = useState(null);
  const [fightLimitPopup, setFightLimitPopup] = useState({ open: false, message: "" });
  /** Bumps after train / membership pay so gym quest panel refetches without a full page reload. */
  const [gymQuestRefresh, setGymQuestRefresh] = useState(0);

  // ── Camp v1.1 state ────────────────────────────────────────
  const [campReport, setCampReport]           = useState(null);
  const [showFighterReport, setShowFighterReport] = useState(false);
  const [campState, setCampState]             = useState(null);
  const [addingSession, setAddingSession]     = useState(null); // sessionType key while loading
  const [showCampSummary, setShowCampSummary] = useState(false);
  const [campSummaryData, setCampSummaryData] = useState(null);

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

  const loadGyms = useCallback(async () => {
    try {
      const list = await api.listGyms();
      setGyms(Array.isArray(list) ? list : []);
    } catch (_) {}
  }, []);

  // Load initial data once authenticated
  useEffect(() => {
    if (!authed) return;
    const fighterId = authStorage.getFighterId();
    (async () => {
      setLoading(true);
      await Promise.all([
        fighterId ? loadFighter(fighterId) : Promise.resolve(),
        loadGyms(),
      ]);
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
      loadGyms();
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
        setGymQuestRefresh((k) => k + 1);
      } catch (e) {
        setMessage(e.message || "Train failed");
      }
    },
    [fighter?._id, loadFighter]
  );

  const handlePayMembership = useCallback(
    async (gymId, cost) => {
      if (!fighter?._id) return;
      setMessage(`Paying gym membership (${cost} ⊗)…`);
      try {
        const result = await api.payGymMembership(fighter._id, gymId);
        setMessage(result.message || "Membership paid.");
        loadFighter(fighter._id, { clearMessage: false });
        setGymQuestRefresh((k) => k + 1);
      } catch (e) {
        setMessage(e.message || "Payment failed");
      }
    },
    [fighter?._id, loadFighter]
  );

  const handleRest = useCallback(async () => {
    if (!fighter?._id) return;
    setMessage("Resting…");
    try {
      await api.rest(fighter._id);
      setMessage("Rest complete. Health and Stamina restored.");
      loadFighter(fighter._id, { clearMessage: false });
    } catch (e) {
      setMessage(e.message || "Rest failed");
    }
  }, [fighter?._id, loadFighter]);

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
      const out = result.fight?.outcome || "—";
      const iron = result.fight?.ironEarned ?? 0;
      const rec = result.fighter?.record;
      setMessage(`${out} — +${iron} ⊗${rec ? ` | Record: ${rec.wins}-${rec.losses}-${rec.draws}` : ""}`);
      loadFighter(fighter._id);
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

  const handleBeginFight = useCallback(() => {
    setShowCampSummary(false);
    handleResolve();
  }, [handleResolve]);

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
                <HdrResource icon="⚡" label="Energy"  value={fighter.energy?.current ?? fighter.energy ?? 0} max={fighter.energy?.max ?? 100} barColor="#3b82f6" />
                <HdrResource icon="❤" label="Health"  value={fighter.health ?? 100}  max={100}                    barColor="#e31837" />
                <HdrResource icon="◎" label="Stamina" value={fighter.stamina ?? 100} max={fighter.maxStamina ?? 100} barColor="#22c55e" />
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
        />
      )}

      {/* ── CAMP SUMMARY MODAL ── */}
      {showCampSummary && campSummaryData && (
        <CampSummary
          summaryData={campSummaryData}
          onBeginFight={handleBeginFight}
          resolving={resolving}
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
                <QuickActions
                  fighter={fighter}
                  onNavigate={setActiveTab}
                  onRest={handleRest}
                />

                <FightHistoryPanel
                  fighter={fighter}
                  lastFightSummary={lastFightSummary}
                />
              </div>

              <div className="dashboard-right">
                <OctagonBackground />
                <div className="dashboard-right-content">
                  <RightPanels
                    fighter={fighter}
                    lastFightSummary={lastFightSummary}
                    campSlotsUsed={campState?.slotsUsed}
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
                onPayMembership={handlePayMembership}
                questRefreshKey={gymQuestRefresh}
              />
            </div>
          )}

          {/* ── FIGHTS ── */}
          {activeTab === "fights" && (
            <div className="page-layout">
              {!fighter?.acceptedFightId ? (
                <FightOffers
                  fighter={fighter}
                  offers={offers}
                  onGetOffers={handleGetOffers}
                  onAcceptOffer={handleAcceptOffer}
                />
              ) : (
                <FightCamp
                  fighter={fighter}
                  campState={campState}
                  campReport={campReport}
                  onAddSession={handleAddCampSession}
                  onResolveInjury={handleResolveCampInjury}
                  onFinalise={() => handleFinaliseCamp(false)}
                  onSkip={() => handleFinaliseCamp(true)}
                  onViewReport={() => setShowFighterReport(true)}
                  addingSession={addingSession}
                  finalising={resolving}
                  onMessage={setMessage}
                />
              )}

              {lastFightSummary && (
                <div className="page-two-col">
                  <FightSummary summary={lastFightSummary} />
                  <FightDescription commentary={lastFightCommentary} />
                </div>
              )}

              {!lastFightSummary && lastFightCommentary.length > 0 && (
                <FightDescription commentary={lastFightCommentary} />
              )}

              {fighter?.acceptedFightId && offers.length === 0 && (
                <FightOffers
                  fighter={fighter}
                  offers={[]}
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
