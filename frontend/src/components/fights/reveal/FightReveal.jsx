import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { prefersReducedMotion } from "../../../utils/layout";
import { buildHighlightScript } from "./revealModel.js";
import { bigWord } from "./highlightLines.js";
import { CornerStrip } from "./CornerStrip.jsx";
import { FinishCard } from "./FinishCard.jsx";
import { CampCard, HighlightCard, FeedRow, MoveCard, PassivePills, QuietLine, ReadyRow, WildcardCard } from "./RevealCards.jsx";
import "./reveal.css";

/** Count-up for the counters: eases to the new value over `ms` (instant for reduced motion). */
function useCountUp(target, ms, instant) {
  const [val, setVal] = useState(instant ? target : 0);
  const fromRef = useRef(instant ? target : 0);
  useEffect(() => {
    if (instant || ms <= 0) {
      fromRef.current = target;
      setVal(target);
      return undefined;
    }
    const from = fromRef.current;
    if (from === target) return undefined;
    let raf = 0;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const v = Math.round(from + (target - from) * p);
      fromRef.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, instant]);
  return val;
}

function Num({ value, ms, instant }) {
  return <>{useCountUp(value, ms, instant)}</>;
}

/**
 * One fighter's panel in the middle of the screen: name, big health number, thick health bar
 * (real health when the fight saved it, else "100 minus damage"), stamina, and that fighter's
 * strikes and takedowns. The damage number and bar flash show on the panel of whoever was hit.
 */
function FighterPanel({ side, name, taken, health, pulse, hit = 0, hitKey, stamina, staminaShown, strikes, takedowns, countMs, instant, readyNames = [] }) {
  const hasHealth = Number.isFinite(health);
  const left = hasHealth ? Math.max(0, Math.min(100, health)) : 100 - Math.max(0, Math.min(100, taken));
  const hp = Math.round(left);
  return (
    <div className={`fr-rv-fp fr-rv-fighter fr-rv-fighter--${side}${hp < 30 ? " is-hurt" : ""}`}>
      <div className="fr-rv-fname">{name}</div>
      <div className="fr-rv-fp-hp">
        <span className="fr-rv-fp-hpnum">{hp}</span>
        <span className="fr-rv-fp-hplab">{t("reveal.hpShort")}</span>
      </div>
      <div
        className={`fr-rv-bar${pulse ? " fr-rv-bar--pulse" : ""}`}
        role="img"
        aria-label={t("reveal.barLabel", { name })}
      >
        {/* The chunk just lost stays visible for a beat, then drains away. */}
        <div className="fr-rv-bar-ghost" style={{ width: `${left}%` }} />
        <div className="fr-rv-bar-fill" style={{ width: `${left}%` }} />
        {/* The flash covers only the health that is left, never the empty track (a full-width red
            flash read as a full bar for a moment). */}
        {hit > 0 && <div key={`hf-${hitKey}`} className="fr-rv-bar-hit" style={{ width: `${left}%` }} aria-hidden="true" />}
      </div>
      {stamina != null && (
        <div className="fr-rv-vitals" data-testid="reveal-stamina">
          <StaminaBar value={stamina} shown={staminaShown ?? stamina} side={side} />
        </div>
      )}
      <div className="fr-rv-fp-stats" role="group" aria-label={t("reveal.counters.label")}>
        <div className="fr-rv-fp-stat">
          <b><Num value={strikes} ms={countMs} instant={instant} /></b>
          <span>{t("reveal.counters.strikes")}</span>
        </div>
        <div className="fr-rv-fp-stat">
          <b><Num value={takedowns} ms={countMs} instant={instant} /></b>
          <span>{t("reveal.counters.takedowns")}</span>
        </div>
      </div>
      {readyNames.length > 0 && (
        <div className="fr-rv-fp-ready" data-testid="reveal-ready-chip">
          {t("reveal.ready.chip", { names: readyNames.join(", ") })}
        </div>
      )}
      {hit > 0 && (
        <span key={`dn-${hitKey}`} className="fr-rv-dmg" data-testid="reveal-damage-number" aria-hidden="true">
          -{hit}
        </span>
      )}
    </div>
  );
}

/** "IT'S ALL OVER": the referee ends it, between the finishing blow and the result. */
function Stoppage({ item }) {
  const line = item.methodKey === "submission" ? t("reveal.stoppage.tap") : t("reveal.stoppage.waveOff");
  return (
    <div className="fr-rv-item fr-rv-stoppage" data-hkind="stoppage" data-testid="reveal-stoppage">
      <div className="fr-rv-stoppage-big">{t("reveal.stoppage.big")}</div>
      <div className="fr-rv-ln">{line}</div>
    </div>
  );
}

const STAMINA_LOW = 40;

/** Thin stamina bar under the health bar. `value` is the true number; the width clamps at 100. */
function StaminaBar({ value, shown, side }) {
  const pct = Math.max(0, Math.min(100, shown));
  const low = value < STAMINA_LOW;
  return (
    <div className={`fr-rv-vrow fr-rv-sta fr-rv-sta--${side}${low ? " is-low" : ""}`}>
      <span className="fr-rv-vlab">{t("reveal.staminaShort")}</span>
      <div className="fr-rv-sta-bar" role="img" aria-label={t("reveal.staminaLabel", { value: Math.round(value) })}>
        <div className="fr-rv-sta-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="fr-rv-vnum">{Math.round(value)}</span>
    </div>
  );
}

function RoundStrip({ meta, items, cursor, currentRound, isFinishCard, opponentName }) {
  if (!meta.length) return null;
  // A round is filled once its round card has played (a finishing round: once the finish lands).
  const done = new Set();
  for (let i = 0; i <= cursor && i < items.length; i += 1) {
    const it = items[i];
    if (it.kind === "round_card") done.add(it.round);
    if (it.kind === "finish_card" || (it.kind === "highlight" && it.hkind === "finish_hit")) {
      meta.filter((m) => m.finish).forEach((m) => done.add(m.round));
    }
  }
  if (isFinishCard) meta.forEach((m) => done.add(m.round));
  return (
    <div className="fr-rv-rounds" data-testid="reveal-rounds" role="group" aria-label={t("reveal.roundsLabel")}>
      {meta.map((m) => {
        const filled = done.has(m.round);
        const cls = filled ? `is-done is-${m.winner}` : "";
        const label = m.finish ? t("reveal.pillFinish") : `${m.score[0]}-${m.score[1]}`;
        const winnerText = m.winner === "player" ? t("reveal.you") : m.winner === "opponent" ? opponentName : t("reveal.pillEven");
        return (
          <div
            key={m.round}
            className={`fr-rv-rpill ${cls}${!isFinishCard && m.round === currentRound ? " is-current" : ""}`}
            data-round={m.round}
            aria-label={filled ? `${t("reveal.roundLabel", { n: m.round })}: ${m.finish ? label : `${winnerText} ${label}`}` : t("reveal.roundLabel", { n: m.round })}
          >
            <b>{t("reveal.clockRound", { n: m.round })}</b>
            {filled && <span>{label}</span>}
          </div>
        );
      })}
    </div>
  );
}

function RoundCard({ item, opponentName }) {
  const winnerName = item.winner === "player" ? t("reveal.you") : opponentName;
  const text = item.winner === "even"
    ? t("reveal.roundEvenShort", { n: item.round })
    : t("reveal.roundResult", { n: item.round, name: winnerName, score: `${item.score[0]}-${item.score[1]}` });
  return (
    <div className={`fr-rv-item fr-rv-roundcard fr-rv-roundcard--${item.winner}${item.dominant ? " is-dominant" : ""}`}>
      {text}
    </div>
  );
}

/**
 * Screen shake, sized to the hit (Game Feel and Juice: trauma squared, so small hits barely move
 * and big ones jolt). Amplitude in px, duration in ms. The whole screen moves, scaled up a touch so
 * its edges never show the page behind.
 */
const SHAKE = {
  heavy: { amp: 14, ms: 520 },
  medium: { amp: 5, ms: 300 },
};
function shakeFrames(amp) {
  // Decaying, alternating offsets (deterministic: the same hit always shakes the same way).
  const steps = [[-1, 0.6], [1, -0.8], [-0.8, -0.4], [0.7, 0.7], [-0.45, 0.3], [0.3, -0.35], [-0.15, 0.1], [0, 0]];
  return steps.map(([x, y], i) => {
    const k = amp * (1 - i / steps.length);
    return { transform: `translate(${(x * k).toFixed(1)}px, ${(y * k).toFixed(1)}px) scale(${i === steps.length - 1 ? 1 : 1.02})` };
  });
}

/** How many highlight items (cards and quiet lines) have played up to and including `cursor`. */
function highlightsUpTo(items, cursor) {
  let n = 0;
  for (let i = 0; i <= cursor && i < items.length; i += 1) {
    if (items[i].kind === "highlight" || items[i].kind === "quiet") n += 1;
  }
  return n;
}

const segsOf = (item) => item?.segments ?? [item?.baseMs ?? 0];

/**
 * Full-screen, click-through-proof playback of an already-resolved fight: a paced view of the
 * persisted event log (highlights with your cards).
 *
 * Pure presentation: it only reads `breakdownView` (including its `loadout`) and names. It owns
 * one timer chain (never two timers at once; a two-part item such as camp + card steps through
 * its segments on the same chain), cancels it on unmount, and fires `onDone` exactly once: when
 * the finish card has played out or See result is pressed (`watched`, or `skipped` if Skip was
 * pressed first), or on Escape (`skipped`). Skip lands on the finish card with the true totals.
 *
 * Props:
 *   breakdownView  the viewer-relative breakdown (rounds, eventLog, loadout, method, ...)
 *   playerName / opponentName
 *   onDone({ result, beatIndex, beatsTotal, speed })   beatIndex / beatsTotal count highlight items
 */
export function FightReveal({ breakdownView, playerName, opponentName, onDone }) {
  const oppName = opponentName || breakdownView?.header?.opponentName || "Opponent";
  const youName = playerName || breakdownView?.header?.playerName || t("reveal.you");
  const { items, totalHighlights, corner, staminaStart, roundsMeta } = useMemo(
    () => buildHighlightScript(breakdownView, { speed: 1, playerName: youName, opponentName: oppName }),
    [breakdownView, youName, oppName],
  );
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const [cursor, setCursor] = useState(0);
  const [seg, setSeg] = useState(0);
  const [speed, setSpeed] = useState(1);

  const cursorRef = useRef(0);
  const segRef = useRef(0);
  const speedRef = useRef(1);
  const timerRef = useRef(null);
  const slotRef = useRef({ startedAt: 0, baseLeft: 0, speed: 1 });
  const doneRef = useRef(false);
  const skippedRef = useRef(false);
  const skipBeatRef = useRef(null);
  const onDoneRef = useRef(onDone);
  const primaryBtnRef = useRef(null);
  const rootRef = useRef(null);
  const speedBtnRef = useRef(null);
  onDoneRef.current = onDone;

  const lastIdx = items.length - 1;

  const finish = useCallback((result) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const beatIndex = result === "watched"
      ? totalHighlights
      : (skipBeatRef.current ?? highlightsUpTo(items, cursorRef.current));
    onDoneRef.current?.({ result, beatIndex, beatsTotal: totalHighlights, speed: speedRef.current });
  }, [items, totalHighlights]);

  // Arm the timer for the current segment; `baseLeft` is the time left at 1x.
  const arm = useCallback((baseLeft) => {
    clearTimeout(timerRef.current);
    slotRef.current = { startedAt: Date.now(), baseLeft, speed: speedRef.current };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const segs = segsOf(items[cursorRef.current]);
      if (segRef.current + 1 < segs.length) {
        segRef.current += 1;
        setSeg(segRef.current);
        arm(segs[segRef.current]);
        return;
      }
      const nextIdx = cursorRef.current + 1;
      if (nextIdx >= items.length) {
        finish(skippedRef.current ? "skipped" : "watched");
        return;
      }
      cursorRef.current = nextIdx;
      segRef.current = 0;
      setCursor(nextIdx);
      setSeg(0);
      arm(segsOf(items[nextIdx])[0]);
    }, Math.max(0, baseLeft / speedRef.current));
  }, [items, finish]);

  // Start the chain. Cleanup cancels any pending timer (unmount, or StrictMode's second mount).
  useEffect(() => {
    if (doneRef.current) return undefined;
    arm(segsOf(items[cursorRef.current])[segRef.current] ?? 0);
    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [arm, items]);

  // Speed change: keep the time already spent on this segment, re-plan only what is left.
  const prevSpeedRef = useRef(1);
  useEffect(() => {
    speedRef.current = speed;
    if (prevSpeedRef.current === speed) return;
    const slot = slotRef.current;
    prevSpeedRef.current = speed;
    if (doneRef.current || !timerRef.current) return;
    const spentBase = (Date.now() - slot.startedAt) * slot.speed;
    arm(Math.max(0, slot.baseLeft - spentBase));
  }, [speed, arm]);

  const current = items[cursor] ?? items[lastIdx];
  const isFinishCard = current?.kind === "finish_card";

  // Skip lands on the finish card (true totals) instead of ending the reveal.
  const skipToFinish = useCallback(() => {
    if (doneRef.current || cursorRef.current >= lastIdx) return;
    skippedRef.current = true;
    skipBeatRef.current = highlightsUpTo(items, cursorRef.current);
    cursorRef.current = lastIdx;
    segRef.current = 0;
    setCursor(lastIdx);
    setSeg(0);
    arm(items[lastIdx].baseMs);
  }, [items, lastIdx, arm]);

  const seeResult = useCallback(() => finish(skippedRef.current ? "skipped" : "watched"), [finish]);

  // Escape ends the reveal; Tab stays on the reveal's two controls. Focus follows the primary button.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        finish(cursorRef.current >= lastIdx && !skippedRef.current ? "watched" : "skipped");
        return;
      }
      // Tab must not reach the Begin Fight / Accept buttons underneath (a second press would only
      // earn a 409 after the reveal).
      if (e.key === "Tab") {
        e.preventDefault();
        const primary = primaryBtnRef.current;
        (document.activeElement === primary ? speedBtnRef.current : primary)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [finish, lastIdx]);

  // The primary button (Skip, then See result) takes focus whenever it swaps.
  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, [isFinishCard]);

  const damage = current?.damage ?? [0, 0];
  // Player's bar drains by what the opponent dealt, and the other way round.
  const playerTaken = damage[1];
  const opponentTaken = damage[0];
  const health = Array.isArray(current?.health) ? current.health : null;

  // Stamina: bars begin at the fight-start value, then ease down to each round's value.
  const hasStamina = !!(staminaStart || items.some((it) => it.stamina));
  const stamina = current?.stamina ?? staminaStart;
  const [staminaShown, setStaminaShown] = useState(staminaStart);
  useEffect(() => {
    setStaminaShown(stamina ?? null);
  }, [stamina?.[0], stamina?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // The current round's already-played moments, newest first, at most 4. A move that became ready
  // at this round's start adds its READY line (it rides the round start item).
  const feedRows = [];
  if (current && !isFinishCard) {
    for (let i = cursor - 1; i >= 0 && feedRows.length < 4; i -= 1) {
      const it = items[i];
      if (it.round !== current.round) break;
      if (it.kind === "highlight" || it.kind === "quiet") feedRows.push(it);
      if (it.kind === "round_start") {
        for (const rn of it.readyNew ?? []) {
          if (feedRows.length < 4) feedRows.push({ kind: "ready", round: it.round, moveId: rn.moveId, line: rn.line, _key: `ready-${it.round}-${rn.moveId}` });
        }
      }
    }
  }

  const clockText = current?.clock
    ? (current.clock.timestamp
      ? t("reveal.clock", { n: current.clock.round, time: current.clock.timestamp })
      : t("reveal.clockRound", { n: current.clock.round }))
    : "";

  const segs = segsOf(current);
  const lastSeg = seg >= segs.length - 1;
  const inCombo = current?.kind === "highlight" && current.combo && seg === 0;
  const cornerState = inCombo ? current.combo.corner : current?.corner;
  const readyNames = (cornerState?.ready ?? [])
    .map((id) => (corner?.moves ?? []).find((m) => m.moveId === id)?.name)
    .filter(Boolean);
  const counters = current?.counters ?? { strikes: [0, 0], takedowns: [0, 0] };
  // Counters roll up for the whole time a card is on screen (a live stat ticking through the
  // round); round starts, round cards and the finish card settle in half a second.
  const rollsWithCard = current?.kind === "highlight" || current?.kind === "quiet";
  const countMs = Math.round((rollsWithCard ? Math.max(500, (current?.baseMs ?? 500) * 0.9) : 500) / speed);

  const passiveRows = current && current.round === 1 && !isFinishCard
    ? (corner?.moves ?? []).filter((m) => m.effectType === "PASSIVE" && cornerState?.passives?.includes(m.moveId))
    : [];

  function stageContent() {
    if (!current) return null;
    if (current.kind === "quiet") return <QuietLine line={current.line} />;
    if (current.kind === "round_card") return <RoundCard item={current} opponentName={oppName} />;
    if (current.kind === "stoppage") return <Stoppage item={current} />;
    if (current.kind === "finish_card") {
      return <FinishCard item={current} playerName={youName} opponentName={oppName} speed={speed} instant={reduced} />;
    }
    if (current.kind !== "highlight") return null;
    const { event } = current;
    if (inCombo) {
      return <CampCard event={current.combo.event} loadoutCamp={corner?.camp} line={current.combo.line} />;
    }
    switch (current.hkind) {
      case "move":
        return <MoveCard move={current.move} effectType={event.vars?.effectType || current.move?.effectType} line={current.line} />;
      case "camp":
        return <CampCard event={event} loadoutCamp={corner?.camp} line={current.line} />;
      case "wildcard":
        return <WildcardCard event={event} line={current.line} />;
      default:
        return (
          <HighlightCard
            name={event.actorIsPlayer ? youName : oppName}
            event={event}
            big={bigWord(event)}
            line={current.line}
          />
        );
    }
  }

  const fxKey = `${cursor}-${seg}`;
  const isStoppage = current?.kind === "stoppage";
  // The whole screen shakes only on the big moments (below); routine shots just land (owner: "every
  // card has a screen shake"). Heavy: knockdowns, finishes, signature slams, the stoppage. Medium:
  // big strikes, takedowns, landed move cards and their wildcard. The card itself only flies in.
  const shakeLevel = !lastSeg ? null
    : isStoppage ? "heavy"
      : current?.kind !== "highlight" ? null
        : current.hkind === "wildcard" ? "medium"
          : current.shake || current.impact === "heavy" ? "heavy"
            : current.impact === "medium" ? "medium"
              : null;
  const showFlash = (current?.kind === "highlight" && current.flash && lastSeg) || isStoppage;
  // Damage numbers and the hit flash on a bar: only on the part of a card that lands (not the camp
  // half of a combo), and never on the finish card (Skip would show the whole fight as one hit).
  const hpLoss = current && current.kind !== "finish_card" && lastSeg ? (current.hpLoss ?? [0, 0]) : [0, 0];
  const stageCls = [
    "fr-rv-stage-in",
    current?.from && lastSeg ? `is-from-${current.from}` : "",
    current?.impact && lastSeg ? `is-impact-${current.impact}` : "",
    current?.kind === "highlight" && current.hkind === "finish_hit" ? "is-finish-hit" : "",
  ].filter(Boolean).join(" ");

  // Shake the screen when the card lands (a flying card hits about 0.21 s in; others at once).
  useEffect(() => {
    if (!shakeLevel || reduced || !rootRef.current?.animate) return undefined;
    const { amp, ms } = SHAKE[shakeLevel];
    const anim = rootRef.current.animate(shakeFrames(amp), {
      duration: ms / speedRef.current,
      delay: (current?.from ? 210 : 0) / speedRef.current,
      easing: "linear",
    });
    return () => anim.cancel();
  }, [fxKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div
      ref={rootRef}
      className={`fight-reveal${reduced ? " fight-reveal--reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("reveal.dialogLabel")}
      data-testid="fight-reveal"
    >
      {/* The arena behind the fight: a painted empty cage (art/arena), dimmed so the cards stay readable. */}
      <div className="fr-rv-bg" aria-hidden="true" />
      <div className="fr-rv-top">
        <div className="fr-rv-clockrow">
          <div className="fr-rv-clock" aria-live="off">{clockText}</div>
        </div>
        <CornerStrip corner={corner} state={cornerState} />
      </div>

      <div className={`fr-rv-mid${isFinishCard ? " is-finish" : ""}`}>
        <FighterPanel
          side="player"
          name={youName}
          taken={playerTaken}
          health={health?.[0]}
          pulse={current?.hkind === "camp" || inCombo}
          hit={hpLoss[0]}
          hitKey={fxKey}
          stamina={hasStamina && stamina ? stamina[0] : null}
          staminaShown={(staminaShown ?? stamina)?.[0]}
          strikes={counters.strikes[0]}
          takedowns={counters.takedowns[0]}
          countMs={countMs}
          instant={reduced}
          readyNames={isFinishCard ? [] : readyNames}
        />
        <div className="fr-rv-stage" aria-live="polite">
          <PassivePills rows={passiveRows} />
          <div className="fr-rv-stage-main">
            <div key={fxKey} className={stageCls}>
              {stageContent()}
            </div>
          </div>
          {showFlash && <div key={`flash-${fxKey}`} className="fr-rv-flash" aria-hidden="true" />}
        </div>
        <FighterPanel
          side="opponent"
          name={oppName}
          taken={opponentTaken}
          health={health?.[1]}
          pulse={false}
          hit={hpLoss[1]}
          hitKey={fxKey}
          stamina={hasStamina && stamina ? stamina[1] : null}
          staminaShown={(staminaShown ?? stamina)?.[1]}
          strikes={counters.strikes[1]}
          takedowns={counters.takedowns[1]}
          countMs={countMs}
          instant={reduced}
        />
      </div>

      <div className="fr-rv-feed" data-testid="reveal-feed" aria-hidden="true">
        {feedRows.map((it, age) => (it.kind === "ready"
          ? <ReadyRow key={it._key} line={it.line} age={age} />
          : <FeedRow key={`${it.round}-${items.indexOf(it)}`} item={it} age={age} />
        ))}
      </div>

      <RoundStrip
        meta={roundsMeta}
        items={items}
        cursor={cursor}
        currentRound={current?.round}
        isFinishCard={isFinishCard}
        opponentName={oppName}
      />

      <div className="fr-rv-controls">
        <button
          type="button"
          ref={speedBtnRef}
          className={`fr-rv-speed${speed === 2 ? " is-on" : ""}`}
          aria-pressed={speed === 2}
          aria-label={t("reveal.speedAria")}
          onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
        >
          {t("reveal.speed")}
        </button>
        {isFinishCard ? (
          <button type="button" ref={primaryBtnRef} className="fr-rv-see-result" onClick={seeResult}>
            {t("reveal.seeResult")}
          </button>
        ) : (
          <button type="button" ref={primaryBtnRef} className="fr-rv-skip" onClick={skipToFinish}>
            {t("reveal.skip")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default FightReveal;
