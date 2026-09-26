/**
 * Pure derivations for the Athlete Page home screen (offer-board-contract.md
 * §5). No React, no fetching, no i18n, everything here takes plain data and
 * returns plain data so components stay declarative and this file stays
 * node-testable (tests/frontend/homeModel.test.js loads it directly).
 */
// Explicit extension: this file is loaded directly by Node (tests/frontend/
// homeModel.test.js, via pathToFileURL) as well as bundled by Vite. Vite
// resolves extensionless specifiers; Node's native ESM loader does not.
import { FIGHT_ENERGY_COST } from "../../constants/gameConstants.js";

// ── Time formatting ───────────────────────────────────────────
export function formatEta(minutes) {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function feedDate(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Relative time label from an ISO date string, "2h ago", "3d ago", etc. */
export function relativeTime(iso) {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ""; }
}

/**
 * Countdown label for a future ISO timestamp, "18h" or "45m". Returns null
 * once the timestamp is in the past (or invalid), so callers can fall back to
 * a "ready" copy instead of showing a negative countdown.
 */
export function formatTimeLeft(iso, now = Date.now()) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - now;
  if (diffMs <= 0) return null;
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.max(1, Math.round(diffMin / 60));
  return `${diffH}h`;
}

/**
 * Title-shot condition progress, from ranking.titleShot
 * {ovrMet, topFive, winsMet, winsInTier, titleWins}.
 * `nextLabel` is the number of wins still needed (the wins condition is the
 * last-mile gate); null once all three conditions are met.
 */
export function titleShotProgress(ranking) {
  const ts = ranking?.titleShot;
  if (!ts) return { done: 0, total: 3, nextLabel: null };
  const done = [ts.ovrMet, ts.topFive, ts.winsMet].filter(Boolean).length;
  const nextLabel = ts.winsMet ? null : Math.max(1, (ts.titleWins ?? 0) - (ts.winsInTier ?? 0));
  return { done, total: 3, nextLabel };
}

/** "$3,200" style formatting for purses, no currency lib in the frontend. */
export function formatPurse(n) {
  if (n == null) return "";
  return `$${Number(n).toLocaleString()}`;
}

// ── Athlete Page helpers (offer-board-contract.md §5) ──────────────────────

/** {key:"win"|"loss"|"none", n} from the player's own winStreak/consecutiveLosses. */
export function fighterStreak(fighter) {
  const win = fighter?.winStreak ?? 0;
  const loss = fighter?.consecutiveLosses ?? 0;
  if (win > 0) return { key: "win", n: win };
  if (loss > 0) return { key: "loss", n: loss };
  return { key: "none", n: 0 };
}

/** Same shape as fighterStreak, from an opponent's {result,count} streak. */
export function oppStreak(streak) {
  if (!streak || !streak.result || !(streak.count > 0)) return { key: "none", n: 0 };
  if (streak.result === "win") return { key: "win", n: streak.count };
  if (streak.result === "loss") return { key: "loss", n: streak.count };
  return { key: "none", n: 0 };
}

/**
 * Vitals, the Condition tile's energy/health meters, computed entirely from
 * the live `fighter` prop (same formula as dashboardService.buildVitals, run
 * client-side) so the meters are synchronous and never wait on useDashboard.
 */
export function vitalsModel(fighter) {
  const tier = fighter?.promotionTier;
  const energyObj = fighter?.energy && typeof fighter.energy === "object" ? fighter.energy : {};
  const cur = Number.isFinite(energyObj.current) ? energyObj.current : 0;
  const max = Number.isFinite(energyObj.max) ? energyObj.max : 100;
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const fightCost = FIGHT_ENERGY_COST[tier] ?? 10;
  const low = cur < fightCost;
  const eta = formatEta(Math.max(0, max - cur));

  const value = Number.isFinite(fighter?.health) ? fighter.health : 100;
  const healthPct = Math.max(0, Math.min(100, value));
  const state = value < 25 ? "critical" : value < 60 ? "hurt" : "ok";
  const healthEta = formatEta((100 - value) * 5);

  return {
    energy: { cur, max, pct, eta, low },
    health: { value, pct: healthPct, eta: healthEta, state },
  };
}

/**
 * Reroll button visibility/state from the offers block's OfferBoardMeta
 * fields. `rerollBlockedBy` is the single source of truth for why the button
 * is hidden or disabled, see offerBoardService's OfferBoardMeta JSDoc.
 */
export function rerollButtonState(offers) {
  const cost = offers?.rerollCost ?? null;
  const blockedBy = offers?.rerollBlockedBy ?? null;

  if (blockedBy === "frozen" || blockedBy === "blocked" || blockedBy === "no_board") {
    return { visible: false, disabled: true, reasonKey: null, cost };
  }
  if (blockedBy === "used") {
    return { visible: true, disabled: true, reasonKey: "used", cost };
  }
  if (blockedBy === "cash") {
    return { visible: true, disabled: true, reasonKey: "cash", cost };
  }
  return { visible: true, disabled: false, reasonKey: null, cost };
}

/**
 * Locked-TitleShot copy key, precedence: clear a rematch cooldown, then get
 * ranked top-5, then bank the qualifying wins, mirrors OfferCard's
 * LockedOverlay so Home and the Fight Hub never disagree about why a title
 * shot is locked.
 */
export function titleLockKey(titleLock) {
  if (!titleLock) return null;
  const { cooldownRemaining, winsNeeded, rankNeeded } = titleLock;
  if (cooldownRemaining > 0) return { key: "lockedCooldown", n: cooldownRemaining };
  if (rankNeeded) return { key: "lockedRank", n: null };
  if (winsNeeded > 0) return { key: "lockedWins", n: winsNeeded };
  return { key: "lockedDefault", n: null };
}

/**
 * Booking-row flags: `isMain` when this row is the same opponent the hero
 * card is leading with (offer branch only, an accepted fight is "signed",
 * not "main"), `isSigned` when this row IS the accepted fight.
 */
export function bookingRowFlags(item, heroBout) {
  const itemId = item?.opponentId ?? null;
  const heroId = heroBout?.opponentId ?? null;
  const isSigned = !!(heroBout && heroBout.source === "accepted" && itemId && heroId === itemId);
  const isMain = !isSigned && !!(heroBout && heroBout.source === "offer" && itemId && heroId === itemId);
  return { isMain, isSigned };
}
