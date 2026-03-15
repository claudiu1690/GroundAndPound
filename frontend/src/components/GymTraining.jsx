// Full session metadata matching backend TRAINING_SESSIONS constants
const SESSION_META = {
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

const SESSION_KEYS = Object.keys(SESSION_META);

function isMembershipValid(fighter, gymId) {
  if (!fighter?.gymMemberships) return false;
  const m = fighter.gymMemberships.find((x) => String(x.gymId) === String(gymId));
  if (!m) return false;
  return new Date(m.paidUntil) > new Date();
}

export function GymTraining({ fighter, gyms, trainGym, trainSession, onGymChange, onSessionChange, onTrain, onPayMembership }) {
  if (!fighter) return null;

  const selectedGym = trainGym && gyms?.length ? gyms.find((g) => g._id === trainGym) : null;
  const selected = SESSION_META[trainSession] ?? SESSION_META.bag_work;
  const needsMembership = selectedGym && selectedGym.monthlyIron > 0;
  const membershipPaid = needsMembership ? isMembershipValid(fighter, trainGym) : true;

  let membershipExpiresLabel = null;
  if (needsMembership && membershipPaid) {
    const m = fighter.gymMemberships?.find((x) => String(x.gymId) === String(trainGym));
    if (m) {
      membershipExpiresLabel = new Date(m.paidUntil).toLocaleDateString();
    }
  }

  return (
    <section className="panel gym-training">
      <h2 className="panel-title">Training</h2>

      <div className="panel-body" style={{ display: "flex", flexDirection: "column", padding: 0 }}>
        {/* ── top controls (always visible) ── */}
        <div className="gym-training-top">
          <div className="form-row">
            <label>Active Gym</label>
            <select value={trainGym} onChange={(e) => onGymChange(e.target.value)}>
              {gyms.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name} ({g.tier})
                </option>
              ))}
            </select>
          </div>

          {selectedGym && (
            <div className="gym-info">
              <span className="gym-info-tier">{selectedGym.tier}</span>
              {selectedGym.specialtyStats?.length > 0 && (
                <span>Specialty: <strong>{selectedGym.specialtyStats.join(", ")}</strong></span>
              )}
              {selectedGym.monthlyIron > 0 ? (
                membershipPaid ? (
                  <span style={{ color: "var(--green-bright)" }}>
                    ✓ Membership until {membershipExpiresLabel}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    onClick={() => onPayMembership && onPayMembership(trainGym, selectedGym.monthlyIron)}
                  >
                    Pay {selectedGym.monthlyIron} ⊗ Membership
                  </button>
                )
              ) : (
                <span style={{ color: "var(--text-muted)" }}>Free gym</span>
              )}
            </div>
          )}

          {/* Locked notice */}
          {needsMembership && !membershipPaid && (
            <div className="status-banner status-banner-danger" style={{ marginBottom: "0.5rem", fontSize: "11px" }}>
              Membership required to train here. Pay {selectedGym.monthlyIron} ⊗ to unlock.
            </div>
          )}

          <div className="gym-training-sessions-label">Choose Session</div>
        </div>

        {/* ── scrollable session grid ── */}
        <div className="gym-training-sessions">
          <div className="session-grid">
            {SESSION_KEYS.map((key) => {
              const m = SESSION_META[key];
              const isActive = trainSession === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`session-card cat-${m.category}${isActive ? " active" : ""}`}
                  onClick={() => onSessionChange(key)}
                >
                  <div className="session-card-header">
                    <span className="session-card-name">{m.label}</span>
                    <span className="session-card-energy">{m.cost}E</span>
                  </div>

                  <p className="session-card-desc">{m.desc}</p>

                  <div className="session-card-stats">
                    {m.stats.length > 0 ? (
                      m.stats.map((s) => (
                        <span key={s} className={`stat-chip ${STAT_CHIP_CLASS[s] ?? ""}`}>{s}</span>
                      ))
                    ) : m.special ? (
                      <span className="stat-chip stat-chip-special">{m.special}</span>
                    ) : null}
                  </div>

                  {m.stats.length > 0 && m.xpBase > 0 && (
                    <div className="session-card-xp">
                      ~{m.xpBase} XP{m.stats.length > 1 ? ` / ${m.stats.length} stats` : ""}
                    </div>
                  )}

                  {m.warn && (
                    <div className="session-card-warn">⚠ {m.warn}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── always-visible Train button ── */}
        <div className="gym-training-bottom">
          {needsMembership && !membershipPaid ? (
            <button type="button" className="btn btn-secondary" disabled style={{ width: "100%" }}>
              Pay Membership to Train
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onTrain}
              style={{ width: "100%", padding: "0.6rem", fontSize: "12px" }}
            >
              Train — {selected.label} · {selected.cost} Energy
              {selected.stats.length > 0 && ` → ${selected.stats.join(", ")}`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
