import { memo, useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useHomeCamp } from "../../hooks/useHomeCamp";
import { prettifyBadgeId } from "../career/badgeCatalog";
import { CampBar } from "./CampBar";
import { NeedsToday } from "./NeedsToday";
import { StaffRow } from "./StaffRow";
import { CoachPanel } from "./CoachPanel";
import { OpenMatPanel } from "./OpenMatPanel";
import { MarketPanel } from "./MarketPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { DEEP_CLEAN_COST, DEEP_CLEAN_GAIN } from "./campConstants";

/** Scrolls + pulses an element by id (Needs-Today "jump to it" targeting). */
function flashElementById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el.classList.add("yc-flash");
  setTimeout(() => el.classList.remove("yc-flash"), reduce ? 1600 : 2100);
}

function describeTrainError(err) {
  const code = err?.code;
  if (code === "injury_blocked") return err.message || t("yourCamp.errors.injuryBlocked");
  const map = {
    drill_required: "yourCamp.errors.drillRequired",
    quantity_invalid: "yourCamp.errors.quantityInvalid",
    unknown_drill: "yourCamp.errors.unknownDrill",
    drill_locked: "yourCamp.errors.drillLocked",
    not_enough_energy: "yourCamp.errors.notEnoughEnergy",
    camp_not_found: "yourCamp.errors.campNotFound",
    coach_not_found: "yourCamp.errors.coachNotFound",
  };
  if (code && map[code]) return t(map[code]);
  return err?.message || t("yourCamp.errors.trainFailed");
}

function describePromoteError(err) {
  const code = err?.code;
  if (code === "insufficient_cash") {
    const cost = err.body?.cost;
    const have = err.body?.have;
    return t("yourCamp.errors.insufficientCash", {
      cost: cost != null ? cost.toLocaleString() : "?",
      have: have != null ? have.toLocaleString() : "?",
    });
  }
  const map = {
    max_rank: "yourCamp.errors.maxRank",
    requirements_not_met: "yourCamp.errors.requirementsNotMet",
    camp_not_found: "yourCamp.errors.campNotFound",
    coach_not_found: "yourCamp.errors.coachNotFound",
  };
  if (code && map[code]) return t(map[code]);
  return err?.message || t("yourCamp.errors.promoteFailed");
}

function describeClaimPerkError(err) {
  const code = err?.code;
  const map = {
    perk_not_claimable: "yourCamp.errors.perkNotClaimable",
    perk_already_held: "yourCamp.errors.perkAlreadyHeld",
    camp_not_found: "yourCamp.errors.campNotFound",
    coach_not_found: "yourCamp.errors.coachNotFound",
  };
  // Server messages are already coach-specific ("Viktor Petrov must reach
  // rank 4…") — prefer them, fall back to a generic translated string.
  if (code && map[code]) return err.message || t(map[code]);
  return err?.message || t("yourCamp.errors.claimPerkFailed");
}

/** GET /home-camp/:fighterId/market load failure (contract §3.2). */
function describeMarketError(err) {
  const code = err?.code;
  const body = err?.body || {};
  if (code === "market_locked") {
    return t("yourCamp.errors.marketLocked", { tier: body.requiredTier ?? "?" });
  }
  if (code === "camp_not_found") return t("yourCamp.errors.campNotFound");
  return err?.message || t("yourCamp.errors.marketLoadFailed");
}

/**
 * POST /home-camp/:fighterId/market/:candidateId/hire — errors IN THE ORDER
 * the backend validates them (contract §3.3): market_locked, candidate_expired,
 * candidate_not_found, slot_cooldown, no_slot, archetype_taken,
 * archetype_locked, insufficient_cash, 404s.
 */
function describeHireError(err) {
  const code = err?.code;
  const body = err?.body || {};
  switch (code) {
    case "market_locked":
      return t("yourCamp.errors.marketLocked", { tier: body.requiredTier ?? "?" });
    case "candidate_expired":
      return err.message || t("yourCamp.errors.candidateExpired");
    case "candidate_not_found":
      return err.message || t("yourCamp.errors.candidateNotFound");
    case "slot_cooldown":
      return t("yourCamp.errors.slotCooldown", { days: body.daysLeft ?? "?" });
    case "no_slot":
      return err.message || t("yourCamp.errors.noSlot");
    case "archetype_taken":
      return err.message || t("yourCamp.errors.archetypeTaken");
    case "archetype_locked":
      return err.message || t("yourCamp.errors.archetypeLocked");
    case "insufficient_cash":
      return t("yourCamp.errors.insufficientCashHire", {
        cost: body.cost != null ? body.cost.toLocaleString() : "?",
        have: body.have != null ? body.have.toLocaleString() : "?",
      });
    case "camp_not_found":
      return t("yourCamp.errors.campNotFound");
    default:
      return err?.message || t("yourCamp.errors.hireFailed");
  }
}

/** DELETE /home-camp/:fighterId/coaches/:coachId errors (contract §3.4). */
function describeFireError(err) {
  const code = err?.code;
  if (code === "last_coach") return err.message || t("yourCamp.errors.lastCoach");
  const map = {
    coach_not_found: "yourCamp.errors.coachNotFound",
    camp_not_found: "yourCamp.errors.campNotFound",
  };
  if (code && map[code]) return t(map[code]);
  return err?.message || t("yourCamp.errors.fireFailed");
}

/** POST /home-camp/:fighterId/renovate errors (contract §3.5). */
function describeRenovateError(err) {
  const code = err?.code;
  const body = err?.body || {};
  switch (code) {
    case "max_tier":
      return err.message || t("yourCamp.errors.maxTier");
    case "requirements_not_met":
      return err.message || t("yourCamp.errors.renovationRequirementsNotMet");
    case "insufficient_cash":
      return t("yourCamp.errors.insufficientCashRenovate", {
        cost: body.cost != null ? body.cost.toLocaleString() : "?",
        have: body.have != null ? body.have.toLocaleString() : "?",
      });
    case "renovation_unavailable":
      return err.message || t("yourCamp.errors.renovationUnavailable");
    case "camp_not_found":
      return t("yourCamp.errors.campNotFound");
    default:
      return err?.message || t("yourCamp.errors.renovateFailed");
  }
}

/** POST /home-camp/:fighterId/deep-clean errors (contract §3.6). */
function describeDeepCleanError(err) {
  const code = err?.code;
  const body = err?.body || {};
  switch (code) {
    case "condition_full":
      return err.message || t("yourCamp.errors.conditionFull");
    case "insufficient_cash":
      return t("yourCamp.errors.insufficientCashDeepClean", {
        cost: body.cost != null ? body.cost.toLocaleString() : "?",
        have: body.have != null ? body.have.toLocaleString() : "?",
      });
    case "camp_not_found":
      return t("yourCamp.errors.campNotFound");
    default:
      return err?.message || t("yourCamp.errors.deepCleanFailed");
  }
}

/**
 * Builds the fire-confirm preview (Phase 1, F3). Phase 1 has no "preview a
 * fire" endpoint — the real per-fire numbers (moraleHitTo, condition
 * before/after, cooldown) only exist in the DELETE response. This preview
 * uses what the currently-loaded CampState already tells us honestly:
 *  - the coach's own rank (really being lost — read straight off the coach),
 *  - the remaining coaches BY NAME, using each one's own visible
 *    `trait.key` to predict which of them is immune (Locker-Room Leader is
 *    immune to the morale hit HE takes when a colleague is fired — contract
 *    §4.3 STEP 2 / §4.4 table), rather than guessing,
 *  - condition before (from `condition.value`, live) and the predicted after.
 * The -10/-15/7-day figures themselves are the fixed, non-per-request
 * constants given directly in the architect contract (§2.4 MORALE_FIRE_HIT_OTHERS,
 * CONDITION_FIRE_HIT, SLOT_COOLDOWN_DAYS) — copy, not a re-derived game number.
 * The ACTUAL post-fire numbers (which is what the success message shows)
 * come straight from the DELETE response, never from this preview.
 */
function buildFirePreview(coach, campState) {
  const conditionBefore = campState?.condition?.value ?? 0;
  const conditionAfter = Math.max(0, conditionBefore - 15);
  const others = (campState?.coaches || []).filter((c) => c.coachId !== coach.coachId);
  const affectedNames = others
    .filter((c) => c.trait?.key !== "LOCKER_ROOM_LEADER")
    .map((c) => c.name);
  return { rank: coach.rank, conditionBefore, conditionAfter, affectedNames };
}

/**
 * Your Camp (Phase 0 + 1) — orchestrator. Owns the only `useHomeCamp` instance
 * for this screen; every child renders exactly what the API sent. Toasts /
 * level-up rows / the move-drop reveal reuse the existing gym-training
 * components via the `addToast` / `onMoveDropReveal` callbacks the App shell
 * already owns (single toast stack, no flicker between tabs).
 *
 * Phase 1 adds the Trainer Market (Scout → MarketPanel → hire), coach firing,
 * camp renovation, and Deep Clean — all funnelled through the same
 * `useHomeCamp` hook so it stays the ONLY camp API caller.
 */
export const CampTab = memo(function CampTab({ fighter, onRefreshFighter, onMessage, addToast, onMoveDropReveal }) {
  const fighterId = fighter?._id;
  const {
    camp: campState, loading, error, refetch, train, promote, claimPerk, claimTeach, rename,
    market, marketLoading, marketError, loadMarket, hire, fire, renovate, deepClean,
  } = useHomeCamp(fighterId);

  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [batchMode, setBatchMode] = useState("1"); // "1" | "5" | "10" | "max" — owner pick 06-V1
  const [training, setTraining] = useState(false);
  const [promotingCoachId, setPromotingCoachId] = useState(null);
  const [claimingCoachId, setClaimingCoachId] = useState(null);
  const [claimingTeachId, setClaimingTeachId] = useState(null);
  const [actionError, setActionError] = useState("");

  // ── Phase 1: Trainer Market ──────────────────────────────────────────
  const [marketOpen, setMarketOpen] = useState(false);
  const [pendingHire, setPendingHire] = useState(null); // candidate object
  const [hiring, setHiring] = useState(false);
  const [hireError, setHireError] = useState(null);

  // ── Phase 1: Fire ─────────────────────────────────────────────────────
  const [pendingFire, setPendingFire] = useState(null); // coach object
  const [firing, setFiring] = useState(false);
  const [fireError, setFireError] = useState(null);

  // ── Phase 1: Renovate ─────────────────────────────────────────────────
  const [renovating, setRenovating] = useState(false);

  // ── Phase 1: Deep Clean ───────────────────────────────────────────────
  const [deepCleanOpen, setDeepCleanOpen] = useState(false);
  const [deepCleaning, setDeepCleaning] = useState(false);
  const [deepCleanError, setDeepCleanError] = useState(null);

  // Keep the selection valid across refetches; default to the first coach.
  useEffect(() => {
    if (!campState) return;
    setSelectedCoachId((prev) => {
      if (prev && campState.coaches.some((c) => c.coachId === prev)) return prev;
      return campState.coaches[0]?.coachId ?? null;
    });
  }, [campState]);

  const handleNeedClick = useCallback((need) => {
    switch (need.type) {
      case "COACH_PROMOTE_READY":
        if (need.targetCoachId) setSelectedCoachId(need.targetCoachId);
        setTimeout(() => flashElementById("yc-next-rank-card"), 60);
        break;
      case "COACH_MORALE_LOW":
        if (need.targetCoachId) setSelectedCoachId(need.targetCoachId);
        setTimeout(() => flashElementById("yc-coach-main"), 60);
        break;
      case "CONDITION_LOW":
        flashElementById("yc-condition-metric");
        break;
      case "MARKET_RESET":
        setMarketOpen(true);
        loadMarket();
        setTimeout(() => flashElementById("yc-market-tile"), 60);
        break;
      default:
        break;
    }
  }, [loadMarket]);

  const handleTrainDrill = useCallback(
    async (coachId, drill, quantity = 1) => {
      if (!fighterId || training) return;
      setTraining(true);
      setActionError("");
      try {
        const result = await train({ coachId, drillKey: drill.key, quantity });
        const completed = result.completed ?? 0;

        if (completed > 0) {
          const xpGained = Object.entries(result.xpGained || {})
            .filter(([, v]) => v > 0)
            .map(([stat, amount]) => ({ stat, amount: Number(amount) }));
          const levelUps = (result.statChanges || [])
            .filter((c) => c.after > c.before)
            .map((c) => ({ stat: c.stat, oldValue: c.before, newValue: c.after }));
          const injuryEvents = (result.events || []).filter((e) => e && e.type === "injury");
          const injuries = injuryEvents.length
            ? injuryEvents.map((e) => ({ label: e.label, round: e.sessionIndex }))
            : (result.injurySustained || []).map((label) => ({ label, round: null }));
          const variant = injuries.length ? "injury" : (levelUps.length ? "levelup" : "normal");
          const rollTier = result.rollTier ?? null;
          const rollTierCounts = result.rollTierCounts ?? { great: 0, normal: 0, sluggish: 0 };
          const greatCount = rollTierCounts.great ?? 0;

          addToast?.({
            sessionName: drill.name,
            xpGained,
            levelUps,
            injuries,
            completed,
            energyRemaining: result.energyAfter,
            sessionsToday: result.sessionsToday ?? 0,
            maxStaminaGained: result.maxStaminaGained || 0,
            staminaCapHit: !!result.staminaCapHit,
            variant,
            rollTier,
            greatCount,
            booster: result.booster ?? null,
          });

          const newBadges = result.newlyEarnedBadges;
          if (Array.isArray(newBadges) && newBadges.length) {
            for (const b of newBadges) {
              addToast?.({ kind: "badge", badgeName: b.name || prettifyBadgeId(b.badgeId), badgeContext: b.context || null });
            }
          }
        }

        const moveDrop = result.moveDrop || null;
        if (moveDrop) {
          if (moveDrop.outcome === "DUPLICATE") {
            addToast?.({ kind: "moveDupe", name: moveDrop.name, cashAwarded: moveDrop.cashAwarded ?? 0 });
          } else {
            onMoveDropReveal?.(moveDrop);
          }
        }

        if (onRefreshFighter) await onRefreshFighter(fighterId);
      } catch (e) {
        setActionError(describeTrainError(e));
      } finally {
        setTraining(false);
      }
    },
    [fighterId, training, train, addToast, onMoveDropReveal, onRefreshFighter]
  );

  const handlePromote = useCallback(
    async (coachId) => {
      if (!fighterId || promotingCoachId) return;
      setPromotingCoachId(coachId);
      try {
        const res = await promote(coachId);
        const promotion = res?.promotion || null;
        onMessage?.(promotion?.message || t("yourCamp.dev.promoted"));

        // ── Teach-channel reveals (Phase 2, contract §6.1) ──────────────────
        // `taughtMoves` is ALWAYS an array (never null) — [] when the rank
        // teaches nothing. Walk it with the IDENTICAL branch already used for
        // a sparring-session `moveDrop`: DUPLICATE -> compact moveDupe toast,
        // else -> the existing DropRevealModal (tagged source:"coach" so the
        // eyebrow can differ, per F5). A Rank-4 Rare coach can deliver 2 moves
        // at once, a Legendary up to 3 — App.jsx's moveDropQueue (F2) makes
        // sure none of them are silently swallowed by the single-slot modal.
        const taughtMoves = Array.isArray(promotion?.taughtMoves) ? promotion.taughtMoves : [];
        for (const m of taughtMoves) {
          if (m.outcome === "DUPLICATE") {
            addToast?.({ kind: "moveDupe", name: m.name, cashAwarded: m.cashAwarded ?? 0 });
          } else {
            onMoveDropReveal?.({ ...m, source: "coach" });
          }
        }

        // ── Badge toasts ─────────────────────────────────────────────────
        // `newlyEarnedBadges` can contain UNRELATED badges — evaluateBadges
        // self-heals every qualifying badge on the same call (e.g. a promote
        // can surface `champ_amateur` alongside `boxer_rank4`). Loop it,
        // never index [0].
        const newBadges = Array.isArray(promotion?.newlyEarnedBadges) ? promotion.newlyEarnedBadges : [];
        for (const b of newBadges) {
          addToast?.({ kind: "badge", badgeName: b.name || prettifyBadgeId(b.badgeId), badgeContext: b.context || null });
        }

        if (onRefreshFighter) await onRefreshFighter(fighterId);
      } catch (e) {
        onMessage?.(describePromoteError(e));
      } finally {
        setPromotingCoachId(null);
      }
    },
    [fighterId, promotingCoachId, promote, onMessage, onRefreshFighter, addToast, onMoveDropReveal]
  );

  /**
   * Delivers the rank-4 archetype perk owed to a migrated coach. Free — no
   * cost/requirements gate to reflect (backend enforces claimable). Success
   * goes through the same toast stack as post-training feedback so it never
   * flickers the panel; failures surface via the top-level message banner,
   * same treatment as promote.
   */
  const handleClaimPerk = useCallback(
    async (coachId) => {
      if (!fighterId || claimingCoachId) return;
      setClaimingCoachId(coachId);
      try {
        const res = await claimPerk(coachId);
        const granted = res?.perkGranted;
        addToast?.({
          kind: "perk",
          name: granted?.name,
          message: granted?.message || t("yourCamp.dev.perkClaimed"),
        });

        // claim-perk carries `badgeGranted` / `newlyEarnedBadges` at the TOP
        // LEVEL (no `promotion` wrapper, unlike promote — contract §3.2): a
        // migrated Rank-4 coach earns his archetype badge here since he never
        // went through attemptPromotion. Loop, never index [0] — same
        // self-heal caveat as promote.
        const newBadges = Array.isArray(res?.newlyEarnedBadges) ? res.newlyEarnedBadges : [];
        for (const b of newBadges) {
          addToast?.({ kind: "badge", badgeName: b.name || prettifyBadgeId(b.badgeId), badgeContext: b.context || null });
        }

        if (onRefreshFighter) await onRefreshFighter(fighterId);
      } catch (e) {
        onMessage?.(describeClaimPerkError(e));
      } finally {
        setClaimingCoachId(null);
      }
    },
    [fighterId, claimingCoachId, claimPerk, addToast, onMessage, onRefreshFighter]
  );

  /**
   * Settles teach-pool moves owed from promotions the player bought before the teach channel
   * shipped. `taughtMoves` arrives in the SAME shape promote returns, so this reuses the exact
   * branch used there — DUPLICATE becomes a cash toast, everything else a queued reveal.
   */
  const handleClaimTeach = useCallback(
    async (coachId) => {
      if (!fighterId || claimingTeachId) return;
      setClaimingTeachId(coachId);
      try {
        const res = await claimTeach(coachId);
        onMessage?.(res?.message || t("yourCamp.teach.claimed"));
        const moves = Array.isArray(res?.taughtMoves) ? res.taughtMoves : [];
        for (const m of moves) {
          if (m.outcome === "DUPLICATE") {
            addToast?.({ kind: "moveDupe", name: m.name, cashAwarded: m.cashAwarded ?? 0 });
          } else {
            onMoveDropReveal?.({ ...m, source: "coach" });
          }
        }
        if (onRefreshFighter) await onRefreshFighter(fighterId);
      } catch (e) {
        onMessage?.(e?.message || t("yourCamp.errors.claimTeachFailed"));
      } finally {
        setClaimingTeachId(null);
      }
    },
    [fighterId, claimingTeachId, claimTeach, addToast, onMessage, onMoveDropReveal, onRefreshFighter]
  );

  // ── Phase 1: Trainer Market ───────────────────────────────────────────
  const handleScout = useCallback(() => {
    setMarketOpen(true);
    loadMarket();
  }, [loadMarket]);

  const handleCloseMarket = useCallback(() => {
    setMarketOpen(false);
  }, []);

  const handleRequestHire = useCallback((candidate) => {
    setHireError(null);
    setPendingHire(candidate);
  }, []);

  const handleCancelHire = useCallback(() => {
    if (hiring) return;
    setPendingHire(null);
    setHireError(null);
  }, [hiring]);

  const handleConfirmHire = useCallback(async () => {
    if (!pendingHire || hiring || !fighterId) return;
    setHiring(true);
    setHireError(null);
    try {
      const res = await hire(pendingHire.candidateId);
      onMessage?.(res?.hire?.message || t("yourCamp.market.hireSuccess", { name: pendingHire.name }));
      setPendingHire(null);
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      setHireError(describeHireError(e));
    } finally {
      setHiring(false);
    }
  }, [pendingHire, hiring, fighterId, hire, onMessage, onRefreshFighter]);

  // ── Phase 1: Fire ─────────────────────────────────────────────────────
  const handleRequestFire = useCallback((coach) => {
    setFireError(null);
    setPendingFire(coach);
  }, []);

  const handleCancelFire = useCallback(() => {
    if (firing) return;
    setPendingFire(null);
    setFireError(null);
  }, [firing]);

  const handleConfirmFire = useCallback(async () => {
    if (!pendingFire || firing || !fighterId) return;
    setFiring(true);
    setFireError(null);
    try {
      const res = await fire(pendingFire.coachId);
      onMessage?.(res?.fired?.message || t("yourCamp.fire.success", { name: pendingFire.name }));
      setPendingFire(null);
    } catch (e) {
      setFireError(describeFireError(e));
    } finally {
      setFiring(false);
    }
  }, [pendingFire, firing, fighterId, fire, onMessage]);

  // ── Phase 1: Renovate ─────────────────────────────────────────────────
  const handleRenovate = useCallback(async () => {
    if (renovating || !fighterId) return;
    setRenovating(true);
    try {
      const res = await renovate();
      // Renovation is the biggest moment in Phase 1 (it opens the Trainer
      // Market) — a toast, not just a banner line, per F4.
      addToast?.({ kind: "perk", message: res?.renovation?.message || t("yourCamp.renovate.success") });
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      onMessage?.(describeRenovateError(e));
    } finally {
      setRenovating(false);
    }
  }, [renovating, fighterId, renovate, addToast, onMessage, onRefreshFighter]);

  // ── Phase 1: Deep Clean ───────────────────────────────────────────────
  const handleRequestDeepClean = useCallback(() => {
    setDeepCleanError(null);
    setDeepCleanOpen(true);
  }, []);

  const handleCancelDeepClean = useCallback(() => {
    if (deepCleaning) return;
    setDeepCleanOpen(false);
    setDeepCleanError(null);
  }, [deepCleaning]);

  const handleConfirmDeepClean = useCallback(async () => {
    if (deepCleaning || !fighterId) return;
    setDeepCleaning(true);
    setDeepCleanError(null);
    try {
      const res = await deepClean();
      onMessage?.(res?.deepClean?.message || t("yourCamp.deepClean.success"));
      setDeepCleanOpen(false);
      if (onRefreshFighter) await onRefreshFighter(fighterId);
    } catch (e) {
      setDeepCleanError(describeDeepCleanError(e));
    } finally {
      setDeepCleaning(false);
    }
  }, [deepCleaning, fighterId, deepClean, onMessage, onRefreshFighter]);

  if (loading && !campState) {
    return <div className="yc-state yc-state--loading">{t("yourCamp.loading")}</div>;
  }
  if (error && !campState) {
    return (
      <div className="yc-state yc-state--error">
        {error.message}
        <button type="button" className="yc-btn-train-ghost" onClick={() => refetch()}>{t("common.retry")}</button>
      </div>
    );
  }
  if (!campState) return null;

  const selectedCoach = campState.coaches.find((c) => c.coachId === selectedCoachId) || null;
  const firePreview = pendingFire ? buildFirePreview(pendingFire, campState) : null;

  return (
    <div className="your-camp">
      {error && (
        <div className="yc-soft-error">{error.message}</div>
      )}

      <CampBar
        campMeta={campState.camp}
        condition={campState.condition}
        wages={campState.wages}
        passives={campState.passives}
        fighter={fighter}
        onRename={rename}
        onRenovate={handleRenovate}
        renovating={renovating}
        onDeepCleanRequest={handleRequestDeepClean}
      />

      <NeedsToday needs={campState.needs} onNeedClick={handleNeedClick} />

      <StaffRow
        coaches={campState.coaches}
        slots={campState.slots}
        market={campState.market}
        selectedCoachId={selectedCoachId}
        onSelect={setSelectedCoachId}
        onScout={handleScout}
      />

      {selectedCoach ? (
        <CoachPanel
          coach={selectedCoach}
          fighter={fighter}
          training={training}
          batchMode={batchMode}
          onBatchModeChange={setBatchMode}
          onTrain={(drill, qty) => handleTrainDrill(selectedCoach.coachId, drill, qty)}
          onPromote={() => handlePromote(selectedCoach.coachId)}
          promoting={promotingCoachId === selectedCoach.coachId}
          onClaimPerk={() => handleClaimPerk(selectedCoach.coachId)}
          claimingPerk={claimingCoachId === selectedCoach.coachId}
          onClaimTeach={() => handleClaimTeach(selectedCoach.coachId)}
          claimingTeach={claimingTeachId === selectedCoach.coachId}
          actionError={actionError}
          onFireRequest={() => handleRequestFire(selectedCoach)}
          firing={firing && pendingFire?.coachId === selectedCoach.coachId}
        />
      ) : (
        <div className="yc-state">{t("yourCamp.noCoach")}</div>
      )}

      <OpenMatPanel
        session={campState.fallbackSession}
        busy={training}
        batchMode={batchMode}
        fighter={fighter}
        onTrain={(qty) =>
          handleTrainDrill(
            null,
            { key: campState.fallbackSession.key, name: campState.fallbackSession.name },
            qty
          )
        }
      />

      <MarketPanel
        open={marketOpen}
        market={market}
        loading={marketLoading}
        error={marketError ? describeMarketError(marketError) : null}
        hiringCandidateId={hiring ? pendingHire?.candidateId : null}
        onHire={handleRequestHire}
        onRetry={() => loadMarket()}
        onClose={handleCloseMarket}
      />

      <ConfirmDialog
        open={!!pendingHire}
        title={pendingHire ? t("yourCamp.market.hireConfirmTitle", { name: pendingHire.name }) : ""}
        busy={hiring}
        busyLabel={t("yourCamp.market.hiring")}
        confirmLabel={t("yourCamp.market.hireConfirmCta")}
        error={hireError}
        onConfirm={handleConfirmHire}
        onCancel={handleCancelHire}
        lines={pendingHire ? [
          { label: t("yourCamp.market.hireFee"), value: `$${pendingHire.hireFee.toLocaleString()}` },
          { label: t("yourCamp.market.wage"), value: t("yourCamp.panel.wageValue", { amount: pendingHire.wage.toLocaleString() }) },
          ...(pendingHire.familiarityPreview
            ? [{
                label: t("yourCamp.market.familiarityLabel"),
                value: t("yourCamp.market.familiarityPreview", {
                  sessions: pendingHire.familiarityPreview.sessions,
                  wins: pendingHire.familiarityPreview.wins,
                }),
                tone: "pos",
              }]
            : []),
        ] : []}
      />

      <ConfirmDialog
        open={!!pendingFire}
        title={pendingFire ? t("yourCamp.fire.confirmTitle", { name: pendingFire.name }) : ""}
        busy={firing}
        busyLabel={t("yourCamp.fire.firing")}
        confirmLabel={t("yourCamp.fire.confirmCta")}
        destructive
        error={fireError}
        onConfirm={handleConfirmFire}
        onCancel={handleCancelFire}
        lines={firePreview ? [
          { label: t("yourCamp.fire.rankLost"), value: t("yourCamp.fire.rankLostVal", { rank: firePreview.rank }), tone: "bad" },
          {
            label: t("yourCamp.fire.moraleHit"),
            value: firePreview.affectedNames.length > 0
              ? t("yourCamp.fire.moraleHitVal", { names: firePreview.affectedNames.join(", ") })
              : t("yourCamp.fire.moraleHitNone"),
            tone: firePreview.affectedNames.length > 0 ? "bad" : "neu",
          },
          {
            label: t("yourCamp.fire.conditionHit"),
            value: t("yourCamp.fire.conditionHitVal", { before: firePreview.conditionBefore, after: firePreview.conditionAfter }),
            tone: "bad",
          },
          { label: t("yourCamp.fire.cooldown"), value: t("yourCamp.fire.cooldownVal"), tone: "warn" },
        ] : []}
      />

      <ConfirmDialog
        open={deepCleanOpen}
        title={t("yourCamp.deepClean.confirmTitle")}
        busy={deepCleaning}
        busyLabel={t("yourCamp.deepClean.cleaning")}
        confirmLabel={t("yourCamp.deepClean.confirmCta", { cost: DEEP_CLEAN_COST })}
        error={deepCleanError}
        onConfirm={handleConfirmDeepClean}
        onCancel={handleCancelDeepClean}
        lines={[
          { label: t("yourCamp.deepClean.cost"), value: `$${DEEP_CLEAN_COST.toLocaleString()}` },
          {
            label: t("yourCamp.bar.conditionLabel"),
            value: `${campState.condition?.value ?? 0} → ${Math.min(100, (campState.condition?.value ?? 0) + DEEP_CLEAN_GAIN)}`,
            tone: "pos",
          },
        ]}
      />
    </div>
  );
});
