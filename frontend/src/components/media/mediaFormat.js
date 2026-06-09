// Shared formatting + icon/color maps for the Media Hub.
//
// Mirrors a couple of small backend formulas (listenersFromScore) so the
// sidebar can show a live listeners value without an extra fetch.

import {
  Mic,
  Flame,
  Heart,
  Star,
  Coins,
  BarChart3,
  Lock,
  Users,
  Camera,
  Mic2,
  MonitorPlay,
  Video,
  Swords,
  HeartHandshake,
} from "lucide-react";

// ── Listeners ───────────────────────────────────────────────

/**
 * <1000 → integer; <1M → "k"; else "M".
 * Mirrors the backend's truncation (Math.floor(val*10)/10) so the sidebar value
 * matches `listenersFormatted` exactly — round would drift at the boundary.
 */
export function formatListeners(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  const fmt = (val, suffix) => {
    const oneDp = Math.floor(val * 10) / 10;
    return `${oneDp.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  };
  if (v < 1_000_000) return fmt(v / 1000, "k");
  return fmt(v / 1_000_000, "M");
}

/** Mirror of the backend listeners curve, for the sidebar live value. */
export function listenersFromScore(score) {
  return Math.round(200 + (Number(score) || 0) * 1.4);
}

// ── Relative time ───────────────────────────────────────────

/** Whole-day difference between `date` and now (0 = today). */
export function daysAgo(date) {
  if (!date) return 0;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return 0;
  const diff = Date.now() - then;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/** Human "2 days ago" / "just now" string. */
export function relativeTime(date) {
  if (!date) return "";
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

/** Countdown until a future date — "4 days left" / "today". */
export function daysLeftLabel(date) {
  if (!date) return "";
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return "";
  const diff = target - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.ceil(diff / 86_400_000);
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** "refreshes in Nd" style from a future date. */
export function refreshesInLabel(date) {
  if (!date) return "";
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return "";
  const diff = target - Date.now();
  if (diff <= 0) return "refreshing soon";
  const days = Math.ceil(diff / 86_400_000);
  return `refreshes in ${days}d`;
}

// ── CSS theme vars (mirror the app's dark theme) ────────────
export const C = {
  accent: "var(--c-accent, #C8102E)",
  gold: "var(--c-gold, #D4A820)",
  blue: "var(--c-blue, #3B82F6)",
  green: "#3A9A4A",
  purple: "#8B5CF6",
  red: "#F87171",
  muted: "var(--text-muted, #555)",
};

// ── Segment flag → stripe color + tag class + icon ──────────
// Catalog-driven: the backend tells us the `flag`, we map presentation.
export const SEGMENT_FLAG_META = {
  beef:    { color: C.accent, tagClass: "beef",    Icon: Flame, tagLabel: "Beef flag" },
  respect: { color: C.blue,   tagClass: "respect", Icon: Heart, tagLabel: "Respect flag" },
  fame:    { color: C.gold,   tagClass: "fame",    Icon: Star,  tagLabel: "Fame" },
  cash:    { color: C.green,  tagClass: "cash",    Icon: Coins, tagLabel: "Cash + fame" },
  predict: { color: C.gold,   tagClass: "fame",    Icon: BarChart3, tagLabel: "Events" },
  guest:   { color: C.purple, tagClass: "respect", Icon: Users, tagLabel: "Guest" },
};

export function segmentMeta(flag) {
  return SEGMENT_FLAG_META[flag] || { color: C.gold, tagClass: "fame", Icon: Star, tagLabel: "Fame" };
}

// ── Appearance type → icon + stripe + bg tint + description ─────────
// The frontend owns presentation (icon/color/description); the backend emits
// label, fame, cash, energyCost, etc. keyed by `type`.
export const APPEARANCE_META = {
  MAGAZINE_COVER: {
    Icon: Camera, color: C.gold, bg: "rgba(212,168,32,0.1)",
    description: "Pose for a glossy cover shoot. A clean fame bump.",
  },
  UNDERCARD_FEATURE: {
    Icon: Star, color: C.accent, bg: "rgba(200,16,46,0.1)",
    description: "Sign up for a spotlight slot — pays off on your next fight.",
  },
  PODCAST_GUEST: {
    Icon: Mic2, color: C.accent, bg: "rgba(200,16,46,0.1)",
    description: "Guest on a big show. Pick a rival and your tone — beef or respect.",
  },
  BRAND_DEAL_CLIP: {
    Icon: MonitorPlay, color: C.blue, bg: "rgba(59,130,246,0.1)",
    description: "Film a sponsor clip for a quick cash payout.",
  },
  CHARITY_EXHIBITION: {
    Icon: HeartHandshake, color: C.green, bg: "rgba(58,154,74,0.1)",
    description: "Headline a charity exhibition bout. Pure fame, no energy.",
  },
};

export function appearanceMeta(type, stripeColor) {
  const base = APPEARANCE_META[type] || { Icon: Star, color: C.gold, bg: "rgba(212,168,32,0.1)" };
  return stripeColor ? { ...base, color: stripeColor } : base;
}

/** Local description for an appearance type (the backend does not emit one). */
export function appearanceDescription(type) {
  return APPEARANCE_META[type]?.description || "";
}

// Win-outcome strings the backend emits (mirror of WIN_OUTCOMES in fightService).
const WIN_OUTCOMES = ["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"];

// ── Archive kind → stripe color + type pill class ───────────
export function archiveKindMeta(entry) {
  switch (entry.kind) {
    case "podcast":
      return { color: C.accent, pillClass: "media-arch-pill--podcast" };
    case "postfight":
      return WIN_OUTCOMES.includes(entry.outcome)
        ? { color: C.green, pillClass: "media-arch-pill--win" }
        : { color: C.red, pillClass: "media-arch-pill--loss" };
    case "appearance":
      return { color: C.blue, pillClass: "media-arch-pill--appearance" };
    case "documentary":
      return { color: C.gold, pillClass: "media-arch-pill--documentary" };
    default:
      return { color: C.muted, pillClass: "" };
  }
}

// Re-export a few icons callers commonly need.
export { Mic, Video, Lock, Swords };
