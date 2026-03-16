import { useState, useEffect, useCallback } from "react";
import { api, authStorage } from "./api";
import "./App.css";
import { MessageBar } from "./components/MessageBar";
import { FighterProfile } from "./components/FighterProfile";
import { GymTraining, SESSION_META } from "./components/GymTraining";
import { TrainingResultPopup } from "./components/TrainingResultPopup";
import { FightOffers } from "./components/FightOffers";
import { FightCamp } from "./components/FightCamp";
import { FightDescription } from "./components/FightDescription";
import { FightSummary } from "./components/FightSummary";
import { GymQuests } from "./components/GymQuests";
import { OctagonBackground } from "./components/OctagonBackground";
import { AuthPage } from "./components/AuthPage";

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
  { id: "Amateur",        label: "Amateur",       minOvr: 0,  nextOvr: 28 },
  { id: "Regional Pro",   label: "Regional Pro",  minOvr: 28, nextOvr: 44 },
  { id: "National",       label: "National",      minOvr: 44, nextOvr: 60 },
  { id: "GCS Contender",  label: "GCS Contender", minOvr: 60, nextOvr: 72 },
  { id: "GCS",            label: "GCS",           minOvr: 72, nextOvr: null },
];

// ── Header resource bar ─────────────────────────────────────
function HdrResource({ icon, label, value, max, barColor }) {
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
}

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
          <span>Notoriety: {fighter?.notoriety ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

// ── Quick actions ────────────────────────────────────────────
function QuickActions({ onNavigate, onRest }) {
  return (
    <div className="quick-actions-section">
      <div className="quick-actions-title">Quick Actions</div>
      <div className="quick-actions">
        <button className="qa-btn qa-train"   onClick={() => onNavigate("gym")}>Train</button>
        <button className="qa-btn qa-fight"   onClick={() => onNavigate("fights")}>Fight</button>
        <button className="qa-btn qa-recover" onClick={onRest}>Recover</button>
      </div>
    </div>
  );
}

// ── Fight history from record data ──────────────────────────
function FightHistoryPanel({ fighter, lastFightSummary }) {
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
}

// ── Tier progress (right panel) ─────────────────────────────
function TierProgress({ fighter }) {
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
}

// ── Right column panels ─────────────────────────────────────
function RightPanels({ fighter, lastFightSummary }) {
  const hasInjuries = fighter?.injuries?.length > 0;
  const inCamp = !!fighter?.acceptedFightId;

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
              ● Fight camp: {inCamp ? `${fighter?.trainingCampActions ?? 0} TCA logged` : "None"}
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
}

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
  const [trainGym, setTrainGym]                 = useState("");
  const [trainSession, setTrainSession]         = useState("bag_work");
  const [resolving, setResolving]               = useState(false);
  const [lastFightCommentary, setLastFightCommentary] = useState([]);
  const [lastFightSummary, setLastFightSummary] = useState(null);
  const [activeTab, setActiveTab]               = useState("gym");
  const [trainingResultPopup, setTrainingResultPopup] = useState({ open: false, sessionLabel: "", xpGained: {}, statLevelUps: [] });

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

  const loadGyms = useCallback(async () => {
    try {
      const list = await api.listGyms();
      setGyms(Array.isArray(list) ? list : []);
      if (list?.length && !trainGym) setTrainGym(list[0]._id);
    } catch (_) {}
  }, [trainGym]);

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

  // Periodic refresh every minute
  useEffect(() => {
    if (!fighter?._id) return;
    const t = setInterval(() => loadFighter(fighter._id), 60 * 1000);
    return () => clearInterval(t);
  }, [fighter?._id, loadFighter]);

  // Called by AuthPage after successful login/register
  const handleAuthenticated = (fighterId) => {
    setAuthed(true);
    loadFighter(fighterId);
    loadGyms();
  };

  const handleLogout = () => {
    authStorage.clear();
    setAuthed(false);
    setFighter(null);
    setOffers([]);
    setLastFightSummary(null);
    setLastFightCommentary([]);
    setActiveTab("gym");
    setMessage("");
  };

  const handleUpdateFighter = async (id, body) => {
    try {
      await api.updateFighter(id, body);
      await loadFighter(id);
      setMessage("Profile updated.");
    } catch (e) {
      setMessage(e.message || "Update failed");
    }
  };

  const handleTrain = async () => {
    if (!fighter?._id || !trainGym) { setMessage("Select a fighter and a gym."); return; }
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
    } catch (e) {
      setMessage(e.message || "Train failed");
    }
  };

  const handlePayMembership = async (gymId, cost) => {
    if (!fighter?._id) return;
    setMessage(`Paying gym membership (${cost} ⊗)…`);
    try {
      const result = await api.payGymMembership(fighter._id, gymId);
      setMessage(result.message || "Membership paid.");
      loadFighter(fighter._id, { clearMessage: false });
    } catch (e) {
      setMessage(e.message || "Payment failed");
    }
  };

  const handleRest = async () => {
    if (!fighter?._id) return;
    setMessage("Resting…");
    try {
      const result = await api.rest(fighter._id);
      setMessage("Rest complete. Health and Stamina restored.");
      loadFighter(fighter._id, { clearMessage: false });
    } catch (e) {
      setMessage(e.message || "Rest failed");
    }
  };

  const handleGetOffers = async () => {
    if (!fighter?._id) return;
    setMessage("Loading offers…");
    try {
      const list = await api.getOffers(fighter._id);
      setOffers(Array.isArray(list) ? list : []);
      setMessage(list?.length ? `${list.length} offer(s) ready.` : "No offers. Seed opponents?");
    } catch (e) {
      setMessage(e.message || "Failed to get offers");
      setOffers([]);
    }
  };

  const handleAcceptOffer = async (opponentId, offerType = "Even") => {
    if (!fighter?._id) return;
    setMessage("Accepting fight…");
    try {
      const fight = await api.createOffer(fighter._id, { opponentId, offerType });
      await api.acceptOffer(fighter._id, fight._id);
      setMessage("Fight accepted. Build your camp then step into the cage.");
      loadFighter(fighter._id);
      setOffers([]);
    } catch (e) {
      setMessage(e.message || "Accept failed");
    }
  };

  const handleCamp = async () => {
    if (!fighter?._id) return;
    try {
      await api.addCampAction(fighter._id);
      const updated = await api.getFighter(fighter._id);
      setFighter(updated);
      setMessage(`Camp action added. Total: ${updated.trainingCampActions ?? 0}.`);
    } catch (e) {
      setMessage(e.message || "Camp failed");
    }
  };

  const handleResolve = async () => {
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
      const out  = result.fight?.outcome || "—";
      const iron = result.fight?.ironEarned ?? 0;
      const rec  = result.fighter?.record;
      setMessage(`${out} — +${iron} ⊗${rec ? ` | Record: ${rec.wins}-${rec.losses}-${rec.draws}` : ""}`);
      loadFighter(fighter._id);
    } catch (e) {
      setMessage(e.message || "Resolve failed");
    }
    setResolving(false);
  };

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
            <span className="hdr-iron">
              <span className="hdr-iron-icon">⊗</span>
              {fighter.iron ?? 0}
            </span>
          )}

          <div className="hdr-resources">
            {fighter && (
              <>
                <HdrResource icon="⚡" label="Energy"  value={fighter.energy}         max={100}                    barColor="#3b82f6" />
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
                ⛺ Camp <span className="hdr-badge-count">{fighter.trainingCampActions ?? 0}</span>
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
        onClose={() => setTrainingResultPopup((p) => ({ ...p, open: false }))}
      />

      {/* ── BODY: centered block = nav + main ── */}
      <div className="app-body">
        <div className="app-center-wrap">

        {/* Left nav — attached to center block */}
        <nav className="app-nav">
          <div className="nav-fighter-profile">
            <FighterProfile
              fighter={fighter}
              gyms={gyms}
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
                  onClick={(e) => { e.preventDefault(); setActiveTab(item.id); }}
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
              <div className="page-two-col">
                <GymTraining
                  fighter={fighter}
                  gyms={gyms}
                  trainGym={trainGym}
                  trainSession={trainSession}
                  onGymChange={setTrainGym}
                  onSessionChange={setTrainSession}
                  onTrain={handleTrain}
                  onPayMembership={handlePayMembership}
                />
                <GymQuests fighter={fighter} gymId={trainGym} />
              </div>
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
                  resolving={resolving}
                  onCamp={handleCamp}
                  onResolve={handleResolve}
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
