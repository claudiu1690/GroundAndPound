import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { divisionLabel, OPEN_LABEL } from "./pvpConst";
import { t } from "../../lib/i18n";

const RANK_START_MS = 1700;
const RANK_DUR_MS = 900;
const MS_PER_CHAR = 9;
const TIMELINE_END_MS = 7000;
const BILL_FIRST_START_MS = 5100;
const BILL_STAGGER_MS = 320;

function formatEndDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // "20 September" — matches the approved mockup's date style.
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/**
 * Builds up to 4 "what's new" lines for the next-season card.
 * Line 1 is always derived from `season.twistName` / `season.twistEffect`
 * (skipped when either is missing). The remaining lines come from
 * `pvp.seasonPoster.whatsNew.s{seasonNumber}.line{1..3}`, falling back per
 * line to `pvp.seasonPoster.whatsNew.default.line{1..3}`. A line whose
 * resolved `lead` still starts with "pvp." (the i18n missing-key echo) is
 * dropped. A new season then needs no code change — only new s{n} keys.
 */
function buildWhatsNewLines(season) {
  const lines = [];
  if (season?.twistName && season?.twistEffect) {
    lines.push({ lead: `${season.twistName}:`, body: season.twistEffect });
  }
  const n = season?.seasonNumber;
  for (let i = 1; i <= 3 && lines.length < 4; i++) {
    let lead = t(`pvp.seasonPoster.whatsNew.s${n}.line${i}.lead`);
    let body = t(`pvp.seasonPoster.whatsNew.s${n}.line${i}.body`);
    if (lead.startsWith("pvp.")) {
      lead = t(`pvp.seasonPoster.whatsNew.default.line${i}.lead`);
      body = t(`pvp.seasonPoster.whatsNew.default.line${i}.body`);
    }
    if (lead.startsWith("pvp.")) continue; // still missing after fallback — drop
    lines.push({ lead, body });
  }
  return lines.slice(0, 4);
}

/**
 * SeasonPosterModal — the single "Fight Poster" modal for the season
 * rollover. Replaces SeasonEndModal + NewSeasonModal.
 *
 * Ported 1:1 from the approved mockup
 * (`mockups/season-rollover-popup-mocks.html`, the `.mock-v1` block):
 * markup order, CSS, keyframes, timings and all three responsive blocks —
 * only class names change (`.mock-v1`/`.v1-*` -> `.season-poster`/`.sp-*`).
 * The mockup's DOM-manipulating animation IIFE is reimplemented below as a
 * single rAF loop driving React state (rank count-up, per-line typewriter).
 *
 * Props:
 *   lastSeasonRecord — the ended-season block (assumed non-null while mounted)
 *   season           — the new current season, or null / non-"active" /
 *                       seasonNumber <= lastSeasonRecord.seasonNumber when
 *                       there is no next season yet
 *   onEnterLadder, onClose — required callbacks. This
 *   component never calls the API itself — PvpHub owns the acknowledge POST.
 *
 * Mount the component keyed by `lastSeasonRecord.seasonId` at the call site
 * so a new ended season always gets a fresh mount (fresh animation timeline).
 */
export function SeasonPosterModal({ lastSeasonRecord, season, onEnterLadder, onClose }) {
  const posterRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const hasNextSeason = !!season
    && season.status === "active"
    && (lastSeasonRecord?.seasonNumber == null || season.seasonNumber > lastSeasonRecord.seasonNumber);

  const lines = useMemo(() => (hasNextSeason ? buildWhatsNewLines(season) : []), [hasNextSeason, season]);

  const rank = lastSeasonRecord?.rank ?? null;
  const poolSize = lastSeasonRecord?.poolSize;
  const rankFrom = poolSize != null ? poolSize : (rank ?? 0);
  const rankTo = rank ?? 0;

  const billTimings = useMemo(
    () => lines.map((line, i) => ({
      total: line.lead.length + line.body.length,
      start: BILL_FIRST_START_MS + i * BILL_STAGGER_MS,
    })),
    [lines]
  );

  const [playing, setPlaying] = useState(false);
  const [rankVal, setRankVal] = useState(rankFrom);
  const [billState, setBillState] = useState(() => billTimings.map(() => ({ started: false, chars: 0, typing: false })));

  // Single rAF timeline: rank count-up (poolSize -> rank) + per-line
  // typewriter, cancelled on unmount. Reduced motion skips the loop and
  // renders final values.
  //
  // Deliberately NOT guarded by a "already started" ref: React StrictMode
  // mounts, cleans up, and remounts in development, and such a guard makes
  // the second (real) mount a no-op, freezing the poster on its first frame.
  // The cleanup below cancels both handles, so re-running is safe and simply
  // restarts the timeline from the top.
  useEffect(() => {
    if (reduceMotion) {
      setRankVal(rankTo);
      setBillState(billTimings.map((b) => ({ started: true, chars: b.total, typing: false })));
      const frame = requestAnimationFrame(() => setPlaying(true));
      return () => cancelAnimationFrame(frame);
    }

    let raf = 0;
    let t0 = 0;
    // Re-entry (StrictMode remount) restarts from the first frame.
    setRankVal(rankFrom);
    setBillState(billTimings.map(() => ({ started: false, chars: 0, typing: false })));

    function tick(now) {
      if (!t0) t0 = now;
      const elapsed = now - t0;
      if (elapsed >= RANK_START_MS) {
        const p = Math.min(1, (elapsed - RANK_START_MS) / RANK_DUR_MS);
        const eased = 1 - Math.pow(1 - p, 3);
        setRankVal(Math.round(rankFrom + (rankTo - rankFrom) * eased));
      }
      setBillState(billTimings.map((b) => {
        const started = elapsed >= b.start;
        const chars = started ? Math.min(b.total, Math.floor((elapsed - b.start) / MS_PER_CHAR)) : 0;
        return { started, chars, typing: started && chars < b.total };
      }));
      if (elapsed < TIMELINE_END_MS) {
        raf = requestAnimationFrame(tick);
      } else {
        setRankVal(rankTo);
        setBillState(billTimings.map((b) => ({ started: true, chars: b.total, typing: false })));
        raf = 0;
      }
    }

    const kickoff = requestAnimationFrame(() => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(kickoff);
      if (raf) cancelAnimationFrame(raf);
    };
    // Intentionally run once per mount only — timeline constants are frozen
    // from the props this instance was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus on mount (the poster itself, not a button, so the reveal
  // animation isn't visually skipped), Escape-to-close, Tab focus trap
  // cycling close/actions, and focus restore on unmount.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    posterRef.current?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;
      const root = posterRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll(".sp-close, .sp-actions .sp-btn"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === "function") {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [onClose]);

  // Body scroll lock — matches LandingPage.jsx's lightbox pattern.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!lastSeasonRecord) return null;

  const {
    seasonNumber, seasonName, weightClass, division,
    dp, isBeltHolder, rewards, newDivision, newDp,
    seasonEndDate, wins: winsRaw, losses: lossesRaw,
    firstSeasonBonusPaid, firstSeasonBonus,
  } = lastSeasonRecord;

  const wins = winsRaw ?? 0;
  const losses = lossesRaw ?? 0;
  const hasRecord = wins + losses > 0;

  const endedWcLabel = weightClass === "Open" ? OPEN_LABEL : weightClass;
  const endDateLabel = formatEndDate(seasonEndDate);

  const iron = rewards?.iron ?? 0;
  const fame = rewards?.fame ?? 0;
  const drinks = rewards?.drinks ?? 0;
  const badge = rewards?.badge ?? null;
  const hasPayout = iron > 0 || fame > 0 || drinks > 0 || !!badge;

  const stubs = [];
  if (iron > 0) stubs.push({ key: "cash", small: t("pvp.seasonPoster.stubCash"), value: `+${iron.toLocaleString()}` });
  if (fame > 0) stubs.push({ key: "fame", small: t("pvp.seasonPoster.stubFame"), value: `+${fame.toLocaleString()}` });
  if (drinks > 0) stubs.push({ key: "drinks", small: t("pvp.seasonPoster.stubDrinks"), value: `+${drinks.toLocaleString()}` });
  if (badge) stubs.push({ key: "badge", small: t("pvp.seasonPoster.stubBadge"), isBadge: true, badgeName: divisionLabel(division) });

  const weeksLeft = season?.endDate
    ? Math.max(0, Math.ceil((new Date(season.endDate) - Date.now()) / (7 * 86400000)))
    : 0;

  const nextSeasonNumber = season?.seasonNumber ?? ((seasonNumber ?? 0) + 1);
  // The dialog is named by aria-label alone. Adding aria-labelledby pointing at
  // the season title would win the accessible-name computation and screen
  // readers would announce just "Iron Circuit", losing the results-and-launch
  // context this string carries.
  const dialogAriaLabel = t("pvp.seasonPoster.dialogAria", { n: seasonNumber, next: nextSeasonNumber });

  return createPortal(
    <div className={`season-poster${playing ? " is-playing" : ""}`}>
      <div className="sp-backdrop" aria-hidden="true" onClick={onClose} />
      <svg className="sp-defs" aria-hidden="true">
        <defs>
          <filter id="sp-rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="sp-grain">
            <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <linearGradient id="sp-foil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b0" />
            <stop offset=".45" stopColor="#D4A820" />
            <stop offset="1" stopColor="#8a6508" />
          </linearGradient>
        </defs>
      </svg>

      <div
        className="sp-poster"
        role="dialog"
        aria-modal="true"
        aria-label={dialogAriaLabel}
        tabIndex={-1}
        ref={posterRef}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sp-pin" aria-hidden="true" />
        <svg className="sp-grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#sp-grain)" /></svg>
        <div className="sp-frame" aria-hidden="true" />
        <button className="sp-close" type="button" aria-label={t("pvp.seasonPoster.closeAria")} onClick={onClose}>&times;</button>

        <div className="sp-scroll">
          <header className="sp-head">
            <p className="sp-eyebrow">{t("pvp.seasonPoster.eyebrow", { weightClass: endedWcLabel, date: endDateLabel })}</p>
            <p className="sp-kicker">{t("pvp.seasonPoster.kicker", { n: seasonNumber })}</p>
            <h1 className="sp-title" id="sp-title">{seasonName}</h1>
            <span className="sp-stamp sp-stamp-closed" aria-hidden="true">{t("pvp.seasonPoster.stampClosed")}</span>
          </header>

          <p className="sp-note">
            {endDateLabel
              ? t("pvp.seasonPoster.note", { seasonName, date: endDateLabel })
              : t("pvp.seasonPoster.noteNoDate", { seasonName })}
          </p>

          {isBeltHolder && <p className="sp-belt">{t("pvp.seasonPoster.beltHolder")}</p>}

          <div className="sp-rule sp-standing">{t("pvp.seasonPoster.standingRule")}</div>
          <p className="sp-division">{divisionLabel(division)}</p>

          <div className="sp-stats">
            <div className="sp-stat">
              <small>{t("pvp.seasonPoster.rankLabel")}</small>
              <strong>
                #{rankVal}
                {poolSize != null && <> <em>{t("pvp.seasonPoster.rankOf", { n: poolSize })}</em></>}
              </strong>
            </div>
            <div className="sp-stat">
              <small>{t("pvp.seasonPoster.dpLabel")}</small>
              <strong>{(dp ?? 0).toLocaleString()} <em>{t("pvp.seasonPoster.dpUnit")}</em></strong>
            </div>
            <div className="sp-stat">
              <small>{t("pvp.seasonPoster.recordLabel")}</small>
              <strong>
                <span className="sp-w">{wins}</span> W <span className="sp-l">{losses}</span> L
                {hasRecord && <em>{t("pvp.seasonPoster.winRate", { pct: Math.round((wins / (wins + losses)) * 100) })}</em>}
              </strong>
            </div>
          </div>

          {hasPayout && (
            <div className="sp-payout">
              <div className="sp-perf">
                <span>{t("pvp.seasonPoster.payoutLabel", { n: seasonNumber })}</span>
                <span>{t("pvp.seasonPoster.tearHere")} ▾</span>
              </div>
              <div className="sp-stubs" style={{ "--sp-stub-count": stubs.length }}>
                {stubs.map((s, i) => (
                  <div className="sp-stub" key={s.key}>
                    <small>{s.small}</small>
                    {s.isBadge ? (
                      <>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 2l9 3.5V11c0 5.5-4 9.5-9 11-5-1.5-9-5.5-9-11V5.5z" fill="url(#sp-foil)" stroke="#8a6508" strokeWidth=".8" />
                          <path d="M12 7.2l1.4 2.9 3.2.4-2.3 2.2.6 3.2L12 14.4l-2.9 1.5.6-3.2-2.3-2.2 3.2-.4z" fill="#3a2a05" />
                        </svg>
                        <strong className="sp-badge-name">{s.badgeName}</strong>
                      </>
                    ) : (
                      <strong>{s.value}</strong>
                    )}
                    <span className="sp-serial">{t("pvp.seasonPoster.serial", { n: String(i + 1).padStart(4, "0") })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {firstSeasonBonusPaid && (
            <p className="sp-bonus">
              {t("pvp.seasonPoster.firstBonus")}
              <b>{t("pvp.seasonPoster.firstBonusCash", { n: (firstSeasonBonus?.iron ?? 500).toLocaleString() })}</b>,{" "}
              <b>{t("pvp.seasonPoster.firstBonusFame", { n: (firstSeasonBonus?.fame ?? 100).toLocaleString() })}</b>
            </p>
          )}

          <div className="sp-band">
            {hasNextSeason ? (
              <>
                <p className="sp-eyebrow">{t("pvp.seasonPoster.nextEyebrow", { weeks: weeksLeft })}</p>
                <p className="sp-kicker">{t("pvp.seasonPoster.kicker", { n: season.seasonNumber })}</p>
                <h2 className="sp-title">{season.name}</h2>
                <span className="sp-stamp sp-stamp-live" aria-hidden="true">{t("pvp.seasonPoster.stampLive")}</span>
                <p className="sp-s2">
                  {t("pvp.seasonPoster.nextBody", {
                    n: season.seasonNumber,
                    name: season.name,
                    division: divisionLabel(newDivision ?? "prospect"),
                    dp: (newDp ?? 0).toLocaleString(),
                  })}
                </p>
                {lines.length > 0 && (
                  <div className="sp-card">
                    <div className="sp-rule">{t("pvp.seasonPoster.onTheCard")}</div>
                    {lines.map((line, i) => {
                      const st = billState[i] ?? { started: false, chars: 0, typing: false };
                      const leadShown = line.lead.slice(0, Math.min(line.lead.length, st.chars));
                      const bodyShown = line.body.slice(0, Math.max(0, st.chars - line.lead.length));
                      return (
                        <p key={i} className={`sp-bill${st.started ? " is-on" : ""}${st.typing ? " is-typing" : ""}`}>
                          <b>{leadShown}</b> <span>{bodyShown}</span>
                        </p>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="sp-s2">{t("pvp.seasonPoster.noNextSeason")}</p>
            )}
          </div>

          <div className="sp-actions">
            {hasNextSeason ? (
              <button className="sp-btn sp-btn-primary" type="button" onClick={onEnterLadder}>{t("pvp.seasonPoster.btnEnter")}</button>
            ) : (
              <button className="sp-btn sp-btn-primary" type="button" onClick={onClose}>{t("pvp.seasonPoster.btnClose")}</button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SeasonPosterModal;
