import { useState, useEffect, useRef, useCallback } from "react";
import { Check } from "lucide-react";
import { GameplanPicker } from "./GameplanPicker";
import { api } from "../../api";
import { t } from "../../lib/i18n";
import { OPEN_LABEL } from "./pvpConst";

/**
 * PreSeasonCountdown — shown in PvpHub when season.status === "upcoming".
 *
 * Props:
 *   season   {object}   — season DTO from usePvpSeason (includes startDate, seasonNumber, etc.)
 *   fighter  {object}   — current fighter (for pvpDefenseGameplan seed)
 *   onElapsed {function} — silentRefetch from usePvpSeason; called on 30s polling and on fast
 *                          5s polling when the clock hits zero. Parent re-renders when status
 *                          flips to "active" — no manual navigation needed.
 */
export function PreSeasonCountdown({ season, fighter, onElapsed }) {
  // ── Timer state ──────────────────────────────────────────────────────────────
  const [remainingMs, setRemainingMs] = useState(
    () => Math.max(0, new Date(season?.startDate) - Date.now())
  );

  // Track whether the local clock has hit zero (triggers fast-poll mode)
  const clockZero = remainingMs === 0;

  // ── Defense gameplan state ───────────────────────────────────────────────────
  const [showGameplan, setShowGameplan] = useState(false);
  const [gameplan, setGameplan] = useState(
    fighter?.pvpDefenseGameplan ?? "balanced"
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // ── Polling refs ─────────────────────────────────────────────────────────────
  // We keep the poll interval in a ref so we can swap between 30s and 5s without
  // restarting the 1s clock timer.
  const pollIntervalRef = useRef(null);

  const startPolling = useCallback(
    (intervalMs) => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(() => {
        if (onElapsed) onElapsed();
      }, intervalMs);
    },
    [onElapsed]
  );

  // ── 1-second countdown tick ──────────────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(season?.startDate) - Date.now()));
    }, 1000);
    return () => clearInterval(tick);
  }, [season?.startDate]);

  // ── Polling — normal 30s; switches to 5s when clock hits zero ────────────────
  useEffect(() => {
    if (clockZero) {
      startPolling(5000);
    } else {
      startPolling(30000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [clockZero, startPolling]);

  // ── Derived timer values ─────────────────────────────────────────────────────
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isSubHour = remainingMs > 0 && hours === 0;
  const isZero = remainingMs === 0;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // Formatted display string
  let timerDisplay;
  if (isZero) {
    timerDisplay = "00:00";
  } else if (isSubHour) {
    timerDisplay = `${pad2(minutes)}:${pad2(seconds)}`;
  } else {
    // hours can be > 2 digits — no fixed padding on hours per spec
    timerDisplay = `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  // Timer label
  let timerLabel;
  if (isZero) {
    timerLabel = t("pvp.preSeason.timerLabelOpening");
  } else if (isSubHour) {
    timerLabel = t("pvp.preSeason.timerLabelSubHour", { n: season?.seasonNumber ?? "?" });
  } else {
    timerLabel = t("pvp.preSeason.timerLabel", { n: season?.seasonNumber ?? "?" });
  }

  // ── Weight/cross pill text ───────────────────────────────────────────────────
  const weightPill = season?.crossWeightClass
    ? OPEN_LABEL
    : (season?.weightClassLabel ?? season?.weightClass ?? "—");

  // ── Defense gameplan handler ─────────────────────────────────────────────────
  async function handleSetGameplan(gp) {
    setGameplan(gp);
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.pvpSetDefenseGameplan(gp);
      setSaveMsg("saved");
    } catch (e) {
      setSaveMsg(e.message || t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="pvp-hub">
      {/* ── Hero banner (reuses existing pvp-hero / pvp-inner / pvp-title styles) ── */}
      <div
        className="pvp-hero"
        style={{ backgroundImage: "url(/pvp/octagon.webp)" }}
      >
        <div className="pvp-hero-overlay" aria-hidden="true" />
        <div className="pvp-inner pvp-ps-hero-inner">
          <div>
            <div className="pvp-eye">{t("pvp.preSeason.heroEyebrow")}</div>
            <div className="pvp-title pvp-ps-title-block">
              <span>{t("pvp.preSeason.heroTitleL1")}</span>
              <br />
              <span>{t("pvp.preSeason.heroTitleL2")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="pvp-ps-body">

        {/* ── Big live timer ── */}
        <div className="pvp-ps-timer-wrap">
          <div
            className={`pvp-ps-timer${isSubHour ? " pvp-ps-timer-subhour" : ""}${isZero ? " pvp-ps-timer-zero" : ""}`}
          >
            {timerDisplay}
          </div>
          {isZero && (
            <div className="pvp-ps-spinner" aria-hidden="true" />
          )}
          <div className="pvp-ps-timer-label">{timerLabel}</div>
        </div>

        {/* ── Season identity card ── */}
        <div className="pvp-ps-card">
          <div className="pvp-ps-card-title">
            Season {season?.seasonNumber}
            {season?.name ? ` — ${season.name}` : ""}
          </div>
          {season?.twistName && (
            <div className="pvp-ps-card-twist">
              <span className="pvp-ps-twist-icon">⚔</span>
              {" "}
              <strong>{season.twistName}</strong>
              {season.twistEffect ? ` — ${season.twistEffect}` : ""}
            </div>
          )}
          <div className="pvp-ps-card-meta">
            <span className="pvp-ps-weight-pill">{weightPill}</span>
            <span className="pvp-ps-belt-tag">{t("pvp.preSeason.beltUnclaimed")}</span>
          </div>
        </div>

        {/* ── What's at stake strip ── */}
        <div className="pvp-ps-stakes">
          <div className="pvp-ps-stake-cell">
            <div className="pvp-ps-stake-value pvp-ps-stake-gold">
              {t("pvp.preSeason.stakesGoldValue")}
            </div>
            <div className="pvp-ps-stake-label">{t("pvp.preSeason.stakesGoldLabel")}</div>
          </div>
          <div className="pvp-ps-stake-divider" aria-hidden="true" />
          <div className="pvp-ps-stake-cell">
            <div className="pvp-ps-stake-value pvp-ps-stake-red">
              {t("pvp.preSeason.stakesChampionValue")}
            </div>
            <div className="pvp-ps-stake-label">{t("pvp.preSeason.stakesChampionLabel")}</div>
          </div>
          <div className="pvp-ps-stake-divider" aria-hidden="true" />
          <div className="pvp-ps-stake-cell">
            <div className="pvp-ps-stake-value">{t("pvp.preSeason.stakesBeltValue")}</div>
            <div className="pvp-ps-stake-label">{t("pvp.preSeason.stakesBeltLabel")}</div>
          </div>
        </div>

        {/* ── New-player primer ── */}
        <div className="pvp-ps-primer">
          <div className="pvp-ps-primer-label">{t("pvp.preSeason.primerLabel")}</div>
          <p className="pvp-ps-primer-body">{t("pvp.preSeason.primerBody")}</p>
        </div>

        {/* ── Set Defense CTA ── */}
        <div className="pvp-ps-defense">
          {!showGameplan ? (
            <button
              className="pvp-ps-defense-btn"
              onClick={() => setShowGameplan(true)}
            >
              {t("pvp.preSeason.setDefenseCta")}
            </button>
          ) : (
            <div className="pvp-ps-defense-panel">
              <div className="pvp-gps-title">{t("pvp.defense.gameplanSetTitle")}</div>
              <div className="pvp-gps-sub">{t("pvp.defense.gameplanSetSub")}</div>
              <GameplanPicker
                selected={gameplan}
                onSelect={handleSetGameplan}
                fighter={fighter}
                disabled={saving}
              />
              {saveMsg && (
                <div
                  className={`pvp-gps-save${saveMsg === "saved" ? " pvp-gps-save-ok" : " pvp-gps-save-err"}`}
                >
                  {saveMsg === "saved" && (
                    <Check size={13} strokeWidth={3} />
                  )}
                  {saveMsg === "saved"
                    ? t("pvp.defense.gameplanSaved")
                    : saveMsg}
                </div>
              )}
              <button
                className="pvp-ps-defense-close"
                onClick={() => { setShowGameplan(false); setSaveMsg(null); }}
              >
                {t("common.close")}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
