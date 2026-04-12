import { memo, useState } from "react";
import { formatSessionXpHint } from "../../utils/trainingXpDisplay";
import { Zap, AlertTriangle, Check, Coins } from "lucide-react";

// Full session metadata matching backend TRAINING_SESSIONS constants (exported for TrainingResultPopup / App)
export const SESSION_META = {
  bag_work: {
    label: "Bag Work",
    category: "striking",
    cost: 4,
    stats: ["STR"],
    xpBase: 10,
    desc: "Heavy bag rounds — power and accuracy",
  },
  footwork: {
    label: "Footwork",
    category: "striking",
    cost: 4,
    stats: ["SPD"],
    xpBase: 10,
    desc: "Lateral movement, evasion and reaction speed",
  },
  kick_drills: {
    label: "Kick Drills",
    category: "striking",
    cost: 4,
    stats: ["LEG"],
    xpBase: 10,
    desc: "Repetitive kick technique on pads and bags",
  },
  pad_work: {
    label: "Pad Work",
    category: "striking",
    cost: 5,
    stats: ["STR", "SPD"],
    xpBase: 10,
    desc: "Combo work with a coach — power meets reaction",
  },
  wrestling: {
    label: "Wrestling",
    category: "grappling",
    cost: 5,
    stats: ["WRE"],
    xpBase: 10,
    desc: "Takedowns, cage control, scrambles",
  },
  clinch: {
    label: "Clinch Work",
    category: "grappling",
    cost: 5,
    stats: ["WRE", "STR"],
    xpBase: 10,
    desc: "Cage clinches, dirty boxing, body locks",
  },
  bjj: {
    label: "BJJ",
    category: "grappling",
    cost: 6,
    stats: ["GND", "SUB"],
    xpBase: 10,
    desc: "Ground game, sweeps, transitions, guard work",
  },
  submission: {
    label: "Submissions",
    category: "grappling",
    cost: 6,
    stats: ["SUB"],
    xpBase: 10,
    desc: "Choke and joint-lock mechanics — attack chains and escapes",
  },
  sparring: {
    label: "Sparring",
    category: "sparring",
    cost: 8,
    stats: ["STR", "SPD", "LEG", "WRE", "GND", "SUB", "CHN", "FIQ"],
    xpBase: 12,
    desc: "Full-contact rounds — highest XP, builds chin and IQ",
    warn: "3% injury risk",
  },
  film_study: {
    label: "Film Study",
    category: "mental",
    cost: 3,
    stats: ["FIQ"],
    xpBase: 10,
    desc: "Opponent breakdown — raises Fight IQ",
    warn: "T3+ gym only",
  },
  strength_conditioning: {
    label: "Conditioning",
    category: "physical",
    cost: 4,
    stats: [],
    xpBase: 0,
    desc: "+1 Max Stamina (cap 120)",
    special: "Max Stamina",
  },
  recovery: {
    label: "Recovery",
    category: "recovery",
    cost: 3,
    stats: [],
    xpBase: 0,
    desc: "Ice bath and physio — reduces injury timers",
    special: "Injury heal",
  },
};

const STAT_CHIP_CLASS = {
  STR: "stat-chip-str",
  SPD: "stat-chip-spd",
  LEG: "stat-chip-leg",
  WRE: "stat-chip-wre",
  GND: "stat-chip-gnd",
  SUB: "stat-chip-sub",
  CHN: "stat-chip-chn",
  FIQ: "stat-chip-fiq",
};

const CATEGORIES = [
  { id: "striking",  label: "Striking",  color: "#ef4444" },
  { id: "grappling", label: "Grappling", color: "#3b82f6" },
  { id: "sparring",  label: "Sparring",  color: "#f97316" },
  { id: "mental",    label: "Mental",    color: "#a855f7" },
  { id: "physical",  label: "Physical",  color: "#22c55e" },
  { id: "recovery",  label: "Recovery",  color: "#06b6d4" },
];

const SESSION_KEYS = Object.keys(SESSION_META);

function isMembershipValid(fighter, gymId) {
  if (!fighter?.gymMemberships) return false;
  const m = fighter.gymMemberships.find((x) => String(x.gymId) === String(gymId));
  if (!m) return false;
  return new Date(m.paidUntil) > new Date();
}

export const GymTraining = memo(function GymTraining({
  fighter,
  gyms,
  trainGym,
  onGymChange,
  onTrain,
  onPayMembership,
}) {
  const [activeCategory, setActiveCategory] = useState("striking");
  if (!fighter) return null;

  const injuryLocked = new Set(fighter?.injuryLockedStats || []);
  const energy = fighter.energy?.current ?? fighter.energy ?? 0;
  const selectedGym = trainGym && gyms?.length ? gyms.find((g) => g._id === trainGym) : null;
  const needsMembership = selectedGym && selectedGym.monthlyIron > 0;
  const membershipPaid = needsMembership ? isMembershipValid(fighter, trainGym) : true;
  const isSessionInjuryLocked = (meta) => (meta.stats || []).some((s) => injuryLocked.has(s));
  const membershipBlocked = needsMembership && !membershipPaid;

  let membershipExpiresLabel = null;
  if (needsMembership && membershipPaid) {
    const m = fighter.gymMemberships?.find((x) => String(x.gymId) === String(trainGym));
    if (m) membershipExpiresLabel = new Date(m.paidUntil).toLocaleDateString();
  }

  const categorySessions = SESSION_KEYS.filter(
    (key) => SESSION_META[key].category === activeCategory
  );

  return (
    <div className="training-hub">
      {/* ── Gym Bar ── */}
      <div className="th-gym-bar">
        <div className="th-gym-select-wrap">
          <select
            className="th-gym-select"
            value={trainGym}
            onChange={(e) => onGymChange(e.target.value)}
          >
            {gyms.map((g) => (
              <option key={g._id} value={g._id}>
                {g.name} ({g.tier})
              </option>
            ))}
          </select>
        </div>

        {selectedGym && (
          <div className="th-gym-meta">
            <span className="th-gym-tier">{selectedGym.tier}</span>
            {selectedGym.specialtyStats?.length > 0 && (
              <span className="th-gym-specialty">
                Specialty: <strong>{selectedGym.specialtyStats.join(", ")}</strong>
              </span>
            )}
            {selectedGym.monthlyIron > 0 ? (
              membershipPaid ? (
                <span className="th-gym-membership th-gym-membership--active">
                  <Check size={10} /> Until {membershipExpiresLabel}
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={() => onPayMembership && onPayMembership(trainGym, selectedGym.monthlyIron)}
                >
                  <Coins size={10} /> Pay {selectedGym.monthlyIron} Membership
                </button>
              )
            ) : (
              <span className="th-gym-membership">Free</span>
            )}
          </div>
        )}

        <div className="th-energy">
          <Zap size={12} /> {energy}E
        </div>
      </div>

      {/* ── Membership Block ── */}
      {membershipBlocked && (
        <div className="th-membership-block">
          <AlertTriangle size={12} /> Membership required to train here.
        </div>
      )}

      {/* ── Category Tabs ── */}
      <div className="th-category-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`th-cat-tab${activeCategory === cat.id ? " th-cat-tab--active" : ""}`}
            style={activeCategory === cat.id ? { borderColor: cat.color, color: cat.color } : undefined}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Session Cards ── */}
      <div className="th-sessions">
        {categorySessions.map((key) => {
          const m = SESSION_META[key];
          const isLocked = isSessionInjuryLocked(m);
          const notEnoughEnergy = energy < m.cost;
          const blocked = isLocked || membershipBlocked || notEnoughEnergy;

          return (
            <div
              key={key}
              className={`th-session-card${isLocked ? " th-session-card--locked" : ""}`}
            >
              <div className="th-sc-header">
                <span className="th-sc-name">{m.label}</span>
                <span className="th-sc-cost">{m.cost}E</span>
              </div>

              <p className="th-sc-desc">{m.desc}</p>

              <div className="th-sc-stats">
                {m.stats.length > 0 ? (
                  m.stats.map((s) => (
                    <span
                      key={s}
                      className={`stat-chip ${STAT_CHIP_CLASS[s] ?? ""}${injuryLocked.has(s) ? " stat-chip-disabled" : ""}`}
                    >
                      {s}
                    </span>
                  ))
                ) : m.special ? (
                  <span className="stat-chip stat-chip-special">{m.special}</span>
                ) : null}

                {m.stats.length > 0 && m.xpBase > 0 && (
                  <span className="th-sc-xp">
                    {formatSessionXpHint(m, selectedGym, fighter) ?? `~${m.xpBase} XP`}
                  </span>
                )}
              </div>

              {m.warn && (
                <div className="th-sc-warn"><AlertTriangle size={9} /> {m.warn}</div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-sm th-sc-train-btn"
                disabled={blocked}
                title={
                  isLocked ? "Session locked by injury" :
                  membershipBlocked ? "Pay membership first" :
                  notEnoughEnergy ? `Need ${m.cost}E (have ${energy}E)` : undefined
                }
                onClick={() => onTrain(key)}
              >
                {isLocked ? "Injury locked" : notEnoughEnergy ? `Need ${m.cost}E` : "Train"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});
