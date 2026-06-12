import { useState, useMemo } from "react";
import { Zap, ChevronLeft, Flame, Grab, Lock, Shield, Scale } from "lucide-react";
import { GAMEPLAN_META, gameplanLabel } from "./pvpConst";
import { api } from "../../api";

// Gameplan card icons (lucide — matches the app's line-icon style).
const GP_ICONS = { striking: Flame, wrestling: Grab, submission: Lock, counter: Shield, balanced: Scale };

/**
 * Screen 2 — Pre-Fight.
 * Shows VS header, gameplan picker, opponent intel, fight button.
 * On success transitions to FightResult via onFightComplete callback.
 */
export function PreFight({ fighter, candidate, season, myRecord, onBack, onFightComplete }) {
  const [gameplan, setGameplan] = useState("balanced");
  const [fighting, setFighting] = useState(false);
  const [error, setError] = useState(null);

  const energyCur = fighter?.energy?.current ?? 0;
  const energyAfter = Math.max(0, energyCur - 15);

  // Fight-blocking injury: any active injury with cannotFight === true
  const blockingInjury = (fighter?.injuries ?? []).find((inj) => inj.cannotFight);
  const isInjuryBlocked = !!blockingInjury;

  // Low HP advisory (< 50) — warns but does not block
  const health = fighter?.health ?? 100;
  const isLowHp = health < 50 && !isInjuryBlocked;

  const canFight = energyCur >= 15 && !fighting && !isInjuryBlocked;

  const bracketLabel = {
    none: null,
    plus10: "+10% bonus DP — expanded bracket",
    plus25: "+25% bonus DP — large bracket",
  }[candidate?.bracketBonus ?? "none"];

  async function handleFight() {
    if (!canFight) return;
    setFighting(true);
    setError(null);
    try {
      const result = await api.pvpFight({
        defenderId: candidate.playerId,
        gameplan,
        seasonId: season.id,
        weightClass: season.weightClass,
      });
      onFightComplete(result);
    } catch (e) {
      const code = e.code ?? e.errorCode ?? null;
      setError(
        code === "attacker_injured"
          ? "You're injured — visit the Hospital before fighting."
          : code === "defender_recovering"
            ? "This fighter is recovering and can't be challenged right now."
            : e.status === 402
              ? "Not enough energy — PVP fights cost 15 energy."
              : e.status === 403
                ? e.message?.toLowerCase().includes("injur") || code?.includes("injur")
                  ? "You're injured — visit the Hospital before fighting."
                  : "The Proving Ground unlocks at 3 career wins."
                : e.status === 409
                  ? e.message?.toLowerCase().includes("recover")
                    ? "This fighter is recovering and can't be challenged right now."
                    : "This fighter is protected and can't be challenged right now."
                  : e.message || "Fight failed. Try again."
      );
    } finally {
      setFighting(false);
    }
  }

  const gpColors = {
    striking:   { border: "#C8102E", bg: "rgba(200,16,46,0.05)", tagBg: "rgba(200,16,46,0.1)", tagColor: "#C8102E", tagBorder: "rgba(200,16,46,0.2)" },
    wrestling:  { border: "#3B82F6", bg: "rgba(59,130,246,0.05)", tagBg: "rgba(59,130,246,0.1)", tagColor: "#3B82F6", tagBorder: "rgba(59,130,246,0.2)" },
    submission: { border: "#A855F7", bg: "rgba(168,85,247,0.05)", tagBg: "rgba(168,85,247,0.1)", tagColor: "#A855F7", tagBorder: "rgba(168,85,247,0.2)" },
    counter:    { border: "#3A9A4A", bg: "rgba(58,154,74,0.05)", tagBg: "rgba(58,154,74,0.1)", tagColor: "#4ADE80", tagBorder: "rgba(58,154,74,0.2)" },
    balanced:   { border: "#3B82F6", bg: "rgba(59,130,246,0.05)", tagBg: "rgba(59,130,246,0.1)", tagColor: "#3B82F6", tagBorder: "rgba(59,130,246,0.2)" },
  };

  // Compute which gameplan "suits the build" — display-only, computed once.
  // Clusters: striking=avg(str,spd,leg), wrestling=avg(wre,gnd),
  //           submission=avg(sub,gnd), counter=chn, balanced=excluded.
  const suitedGameplan = useMemo(() => {
    if (!fighter) return null;
    const s = fighter;
    const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);
    const clusters = {
      striking:   (num(s.str) + num(s.spd) + num(s.leg)) / 3,
      wrestling:  (num(s.wre) + num(s.gnd)) / 2,
      submission: (num(s.sub) + num(s.gnd)) / 2,
      counter:    num(s.chn),
    };
    let best = null;
    let bestVal = 0;
    for (const [key, val] of Object.entries(clusters)) {
      if (val > bestVal) { bestVal = val; best = key; }
    }
    // Only return a result if stats had real values (bestVal > 0)
    return bestVal > 0 ? best : null;
  }, [fighter]);

  return (
    <div className="pvp-card">
      {/* Nav */}
      <div className="pvp-card-nav">
        <button className="pvp-cnav-back" onClick={onBack}>
          <ChevronLeft size={14} strokeWidth={2.5} /> Back
        </button>
        <div className="pvp-cnav-title">PVP Challenge</div>
        <div className="pvp-cnav-right">
          <Zap size={12} strokeWidth={2} /> {energyCur} energy
        </div>
      </div>

      {/* VS Hero */}
      <div className="pvp-pf-hero">
        <div className="pvp-pf-glow" />
        <div className="pvp-pf-vs">
          {/* You */}
          <div className="pvp-pf-fighter">
            <div className="pvp-pf-name">
              {fighter?.firstName} {fighter?.lastName}
            </div>
            <div className="pvp-pf-meta">
              {myRecord && (
                <span
                  className="pvp-div-badge"
                  style={{ color: myRecord.divisionColor, background: `rgba(0,0,0,0.1)`, border: `1px solid ${myRecord.divisionColor}40` }}
                >
                  {myRecord.division}
                </span>
              )}
              <span style={{ color: "#555" }}>OVR {fighter?.overallRating ?? "—"}</span>
              {myRecord && <span style={{ color: "#555" }}>{(myRecord.dp ?? 0).toLocaleString()} DP</span>}
            </div>
          </div>

          <div className="pvp-pf-sep">VS</div>

          {/* Opponent */}
          <div className="pvp-pf-fighter pvp-pf-right">
            <div className="pvp-pf-name" style={{ textAlign: "right" }}>{candidate.name}</div>
            <div className="pvp-pf-meta" style={{ justifyContent: "flex-end" }}>
              {candidate.fightingStyle && (
                <span className="pvp-mc-style">{candidate.fightingStyle}</span>
              )}
              <span style={{ color: "#555" }}>{(candidate.dp ?? 0).toLocaleString()} DP</span>
              <span style={{ color: "#555" }}>OVR {candidate.overallRating ?? "—"}</span>
              {season?.crossWeightClass && candidate.realWeightClass && (
                <span className="pvp-wc-pill">{candidate.realWeightClass}</span>
              )}
              <span
                className="pvp-div-badge"
                style={{ color: candidate.divisionColor, background: `rgba(0,0,0,0.1)`, border: `1px solid ${candidate.divisionColor}40` }}
              >
                {candidate.division}
              </span>
            </div>
          </div>
        </div>

        {/* Flags row */}
        <div className="pvp-pf-flags">
          {candidate.isRival && (
            <span className="pvp-pf-flag pvp-pf-flag-rival">
              Rival match — win for Rivalry Resolved + bonus DP
            </span>
          )}
          {candidate.isBeltHolder && (
            <span className="pvp-pf-flag pvp-pf-flag-belt">
              Belt Holder — +50 bonus DP if you win
            </span>
          )}
          {bracketLabel && (
            <span className="pvp-pf-flag pvp-pf-flag-bracket">{bracketLabel}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="pvp-pf-body">
        {/* Gameplan picker */}
        <div>
          <div className="pvp-section-lbl" style={{ marginBottom: 8 }}>Pick your gameplan</div>
          <div className="pvp-gameplan-grid">
            {["striking", "wrestling", "submission", "counter", "balanced"].map((gp) => {
              const meta = GAMEPLAN_META[gp];
              const sel = gameplan === gp;
              const colors = gpColors[gp];
              const Icon = GP_ICONS[gp];
              const suited = suitedGameplan === gp;
              return (
                <button
                  key={gp}
                  className={`pvp-gp-card ${sel ? "pvp-gp-sel" : ""}`}
                  style={sel ? { borderColor: colors.border, background: colors.bg } : {}}
                  onClick={() => setGameplan(gp)}
                >
                  <div className="pvp-gp-icon">
                    <Icon size={20} strokeWidth={2} color={sel ? colors.border : "#777"} />
                  </div>
                  <div className="pvp-gp-name" style={sel ? { color: colors.border } : {}}>
                    {meta.label}
                  </div>
                  <div className="pvp-gp-desc">{meta.desc}</div>
                  <span
                    className="pvp-gp-tag"
                    style={{ background: colors.tagBg, color: colors.tagColor, border: `1px solid ${colors.tagBorder}` }}
                  >
                    {meta.tag}
                  </span>
                  {suited && (
                    <span className="pvp-gp-suited-pill">Suits your build</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Opponent intel */}
        <div className="pvp-intel-card">
          <div className="pvp-intel-title">Opponent Intel — {candidate.name}</div>
          <div className="pvp-intel-grid">
            <div className="pvp-ig">
              <div className="pvp-ig-v">{candidate.wins ?? 0}-{candidate.losses ?? 0}</div>
              <div className="pvp-ig-l">W-L</div>
              <div className="pvp-ig-hint">{candidate.wins ?? 0}-{candidate.losses ?? 0} this season</div>
            </div>
            <div className="pvp-ig">
              <div className="pvp-ig-v">{candidate.overallRating ?? "—"}</div>
              <div className="pvp-ig-l">OVR</div>
              <div className={`pvp-ig-hint ${candidate.difficulty === "hard" ? "pvp-ig-r" : candidate.difficulty === "easy" ? "pvp-ig-w" : ""}`}>
                {candidate.difficulty === "hard" ? "Tough matchup" : candidate.difficulty === "easy" ? "Easier matchup" : "Even match"}
              </div>
            </div>
            <div className="pvp-ig">
              <div className="pvp-ig-v">{(candidate.dp ?? 0).toLocaleString()}</div>
              <div className="pvp-ig-l">DP</div>
            </div>
            <div className="pvp-ig">
              <div className="pvp-ig-v">{gameplanLabel(candidate.defenseGameplan)}</div>
              <div className="pvp-ig-l">Defense</div>
              <div className="pvp-ig-hint">Their default plan</div>
            </div>
          </div>
        </div>

        {/* Injury-blocked notice — disables fighting */}
        {isInjuryBlocked && (
          <div className="pvp-pf-injury-block">
            <span className="pvp-pf-injury-block-icon">+</span>
            Recovering — visit the Hospital before your next PVP fight.
            <div className="pvp-pf-injury-block-sub">
              {blockingInjury.label ?? "Injury"} must be treated before you can fight.
            </div>
          </div>
        )}

        {/* Low HP advisory — does not block fighting */}
        {isLowHp && (
          <div className="pvp-pf-low-hp">
            Low HP ({health}/100) — you will start this fight hurt. Consider visiting the Hospital first.
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="pvp-error-note">{error}</div>
        )}

        {/* Fight button */}
        <button
          className="pvp-fight-btn"
          onClick={handleFight}
          disabled={!canFight}
          style={!canFight ? { opacity: 0.5, cursor: "not-allowed" } : {}}
        >
          {fighting ? "Resolving…" : "Fight · 15 energy"}
        </button>
        <div className="pvp-energy-note">
          {isInjuryBlocked
            ? "Can't fight while recovering from injury"
            : canFight
              ? `${energyAfter} energy remaining after this fight`
              : energyCur < 15
                ? "Not enough energy (need 15)"
                : ""}
        </div>
      </div>
    </div>
  );
}
