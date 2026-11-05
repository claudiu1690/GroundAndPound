import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { FIGHT_ENERGY_COST } from "../constants/gameConstants";
import { SECTION_TIP_KEYS, isMomentKey, pickTip, tipCards, tipVisible } from "../constants/sectionTips";
import { pveFightCount } from "../utils/fighterMath";

const NO_OFFERS = [];

/**
 * Section tips and moment tips (constants/sectionTips.js), driven by what the player is looking at.
 *
 * Enabled only once the debut tutorial is complete and the player has not turned tips off
 * (Account settings, or "Hide tips" on a card). Exactly one sequence shows at a time. A tip counts
 * as seen the moment its first card is actually on screen (optimistic locally, then
 * POST /tutorial/:id/tips/seen). If none of a tip's anchors ever appears it is dropped for this page
 * session without being marked seen, so a tip is never burned on a screen that was not ready.
 * Leaving the screen pauses a sequence; coming back resumes it within the same page session.
 * A reload drops the remainder.
 *
 * Returns what TipsOverlay renders:
 *   card      { anchor, title, body } | null
 *   index, total
 *   onShown() the card's anchor is on screen (marks the tip seen)
 *   onGotIt() next card, or finish the sequence
 *   onAbsent() the card's anchor never appeared: skip it
 *   onHide()  turn all tips off
 */
export function useTips({
  fighter,
  activeTab,
  showCampSummary,
  lastFightSummary,
  boardOffers,
  suspended = false,
  onFighterRefresh,
  onMessage,
}) {
  const fighterId = fighter?._id;
  const serverSeen = fighter?.tutorial?.tipsSeen;

  const [seen, setSeen] = useState(() => new Set(serverSeen ?? []));
  const [active, setActive] = useState(null); // { key, index, shown }
  const [localOff, setLocalOff] = useState(false);
  const pausedRef = useRef(new Map()); // key -> card index to resume at
  const droppedRef = useRef(new Set()); // keys whose anchors never appeared this page session

  // Server list wins for what it knows; local additions stay until the next refresh covers them.
  useEffect(() => {
    if (!serverSeen) return;
    setSeen((prev) => {
      const next = new Set(prev);
      let changed = false;
      serverSeen.forEach((k) => { if (!next.has(k)) { next.add(k); changed = true; } });
      return changed ? next : prev;
    });
  }, [serverSeen]);

  const enabled = !!fighter?.tutorial?.completed
    && fighter?.settings?.sectionTips !== false
    && !localOff
    && !suspended;

  // ── What the player is looking at ──────────────────────────
  const accepted = !!fighter?.acceptedFightId;
  const showResult = !!lastFightSummary && !accepted;
  const offers = boardOffers ?? NO_OFFERS;
  const energyCost = FIGHT_ENERGY_COST[fighter?.promotionTier] ?? 10;
  const energy = fighter?.energy?.current ?? fighter?.energy ?? 0;
  const health = fighter?.health ?? 100;
  const wins = fighter?.record?.wins ?? 0;
  const pve = pveFightCount(fighter);
  const injuriesList = fighter?.injuries;
  const summaryInjuries = lastFightSummary?.injuriesSustained;
  const recordChange = lastFightSummary?.recordChange ?? null;

  const injuries = useMemo(() => (summaryInjuries ?? []).map((label) => {
    const match = (injuriesList ?? []).find((i) => i.label === label);
    const hours = match?.recoveryHoursLeft > 0
      ? match.recoveryHoursLeft
      : (match?.recoveryDaysLeft > 0 ? match.recoveryDaysLeft * 24 : null);
    return { label, hours };
  }), [summaryInjuries, injuriesList]);

  const ctx = useMemo(() => ({
    tab: activeTab,
    pve,
    wins,
    accepted,
    showCampSummary: !!showCampSummary,
    showResult,
    normalBoard: offers.some((o) => o.type !== "Debut"),
    offers,
    energy,
    energyCost,
    health,
    recordChange,
    injuries,
  }), [activeTab, pve, wins, accepted, showCampSummary, showResult, offers, energy, energyCost, health, recordChange, injuries]);

  // ── Pause when the screen changes, drop a tip that never got shown ──
  useEffect(() => {
    if (!active) return;
    if (tipVisible(active.key, ctx)) return;
    if (active.shown) pausedRef.current.set(active.key, active.index);
    setActive(null);
  }, [active, ctx]);

  // ── Start or resume the next due tip ───────────────────────
  useEffect(() => {
    if (!enabled || active || !fighterId) return;
    for (const [key, index] of pausedRef.current) {
      if (tipVisible(key, ctx)) {
        pausedRef.current.delete(key);
        setActive({ key, index, shown: true });
        return;
      }
    }
    const skipped = [...droppedRef.current, ...pausedRef.current.keys()];
    // Union with the server list at read time: on the first render after a load, `seen` was
    // initialised before the fighter arrived and the merge effect has not landed yet, so the
    // local set alone would re-show tips the player has already seen.
    const allSeen = serverSeen?.length ? new Set([...seen, ...serverSeen]) : seen;
    const key = pickTip(ctx, allSeen, skipped);
    if (key) setActive({ key, index: 0, shown: false });
  }, [enabled, active, fighterId, ctx, seen, serverSeen]);

  // ── Ending a sequence ──────────────────────────────────────
  const finish = useCallback((result) => {
    if (!active) return;
    if (active.shown && !isMomentKey(active.key) && SECTION_TIP_KEYS.includes(active.key) && fighterId) {
      api.trackClientEvent(fighterId, "section_tip", { section: active.key, result }).catch(() => {});
    }
    if (!active.shown) droppedRef.current.add(active.key);
    setActive(null);
  }, [active, fighterId]);

  const cards = useMemo(() => (active ? tipCards(active.key, ctx) : []), [active, ctx]);
  const total = cards.length;

  const onShown = useCallback(() => {
    if (!active || active.shown) return;
    setActive((cur) => (cur && cur.key === active.key ? { ...cur, shown: true } : cur));
    setSeen((prev) => new Set(prev).add(active.key));
    if (fighterId) api.markTipSeen(fighterId, active.key).catch(() => { /* local seen keeps it quiet */ });
  }, [active, fighterId]);

  const onGotIt = useCallback(() => {
    if (!active) return;
    if (active.index < total - 1) setActive({ ...active, index: active.index + 1 });
    else finish("done");
  }, [active, total, finish]);

  const onAbsent = useCallback(() => {
    if (!active) return;
    if (active.index < total - 1) setActive({ ...active, index: active.index + 1 });
    else finish("done");
  }, [active, total, finish]);

  const onHide = useCallback(async () => {
    if (!fighterId) return;
    finish("hidden");
    setLocalOff(true);
    try {
      await api.updateFighterSettings(fighterId, { sectionTips: false });
      await onFighterRefresh?.(fighterId, { clearMessage: false });
    } catch (e) {
      onMessage?.(e?.message || "Could not hide tips");
    } finally {
      // The refreshed fighter now says tips are off; the local latch is no longer needed, and
      // clearing it lets Account settings turn them back on.
      setLocalOff(false);
    }
  }, [fighterId, finish, onFighterRefresh, onMessage]);

  return {
    card: enabled && active ? (cards[active.index] ?? null) : null,
    index: active?.index ?? 0,
    total,
    onShown,
    onGotIt,
    onAbsent,
    onHide,
  };
}

export default useTips;
