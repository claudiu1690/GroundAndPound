// Client-side DISPLAY metadata for badges. Visuals only — the server is the
// source of truth for which badges are earned and their progress. This file
// maps each badge id (and a category fallback) to a lucide icon + colour pair.
//
// `color` is the icon/stroke colour; `bg` is the soft tile background tint.

import {
  Trophy,
  Award,
  Medal,
  Flame,
  Skull,
  Swords,
  Crown,
  Mic,
  Video,
  Star,
  Dumbbell,
  Shield,
  Zap,
  Hand,
  Heart,
  HeartHandshake,
  Target,
  Gavel,
  Megaphone,
  Hammer,
  Sparkles,
  Activity,
  TrendingUp,
  Clock,
  Repeat,
  ShieldCheck,
  Radio,
  Users,
} from "lucide-react";

// Theme colours (mirror the mockup palette).
const RED = "#C8102E";
const GOLD = "#D4A820";
const BLUE = "#3B82F6";
const GREEN = "#3A9A4A";
const PURPLE = "#8B5CF6";
const TEAL = "#14B8A6";
const AMBER = "#C87A10";
const SILVER = "#BBBBBB";
const BRONZE = "#A07040";
const GREY = "#999999";

const tint = (hex, a = 0.12) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const make = (Icon, color) => ({ Icon, color, bg: tint(color) });

// ── Per-id catalog ──────────────────────────────────────────
export const BADGE_CATALOG = {
  // Career milestones (red / gold accents)
  first_blood:        make(Activity, RED),
  wins_10:            make(Trophy, GOLD),
  wins_25:            make(Trophy, GOLD),
  wins_50:            make(Trophy, GOLD),
  streak_5:           make(Flame, RED),
  streak_10:          make(Flame, RED),
  streak_20:          make(Flame, GOLD),
  division_dominator: make(Crown, GOLD),
  long_game:          make(Clock, AMBER),
  veteran:            make(Medal, AMBER),

  // Championships (tier-coloured)
  champ_amateur:       make(Award, GREY),
  champ_regional_pro:  make(Award, BRONZE),
  champ_national:      make(Award, SILVER),
  champ_gcs_contender: make(Award, BLUE),
  champ_gcs:           make(Award, GOLD),

  // Fighting style (varied)
  finisher:         make(Swords, RED),
  ko_artist:        make(Hand, AMBER),
  sub_hunter:       make(Target, TEAL),
  decision_machine: make(Gavel, GOLD),
  iron_chin:        make(Shield, GOLD),
  iron_will:        make(ShieldCheck, RED),
  giant_killer:     make(Skull, PURPLE),
  comeback_kid:     make(TrendingUp, GREEN),
  fight_of_night:   make(Sparkles, GOLD),
  perfect_camp:     make(Star, GREEN),
  callout_win:      make(Megaphone, BLUE),
  nemesis_slayer:   make(Skull, RED),
  beef_paid_off:    make(Flame, AMBER),
  serial_beefcake:  make(Flame, RED),

  // Gym mastery (teal family, varied per discipline)
  boxer_rank4:      make(Hand, RED),
  kickboxing_rank4: make(Zap, AMBER),
  muaythai_rank4:   make(Flame, RED),
  wrestling_rank4:  make(Dumbbell, BLUE),
  bjj_rank4:        make(Shield, TEAL),
  submission_rank4: make(Target, TEAL),
  precision_rank4:  make(Target, GOLD),
  titan_rank4:      make(Hammer, PURPLE),
  warroom_rank4:    make(Swords, RED),
  elite_rank4:      make(Medal, GOLD),
  sessions_50:      make(Dumbbell, TEAL),
  sessions_100:     make(Dumbbell, BLUE),
  sessions_250:     make(Dumbbell, GOLD),

  // Media (blue family)
  first_episode:     make(Mic, RED),
  media_star:        make(Radio, BLUE),
  documentary:       make(Video, GOLD),
  controversy:       make(Megaphone, RED),
  peoples_champion:  make(Users, GOLD),
  star_power:        make(Star, GOLD),
};

// Category fallbacks for any id not explicitly mapped.
const CATEGORY_FALLBACK = {
  career:        make(Trophy, RED),
  championships: make(Award, GOLD),
  style:         make(Swords, PURPLE),
  gym:           make(Dumbbell, TEAL),
  media:         make(Mic, BLUE),
};

const DEFAULT_VISUAL = make(Star, GOLD);

// Map from Lucide component name strings (as sent by the server) to the
// already-imported components. Only names that are imported above are listed.
const LUCIDE_NAME_MAP = {
  Trophy,
  Award,
  Medal,
  Flame,
  Skull,
  Swords,
  Crown,
  Mic,
  Video,
  Star,
  Dumbbell,
  Shield,
  Zap,
  Hand,
  Heart,
  HeartHandshake,
  Target,
  Gavel,
  Megaphone,
  Hammer,
  Sparkles,
  Activity,
  TrendingUp,
  Clock,
  Repeat,
  ShieldCheck,
  Radio,
  Users,
};

/**
 * Resolve a badge id → { Icon, color, bg }.
 *
 * Resolution order:
 *  1. Hardcoded BADGE_CATALOG entry for the id (PvE badges — unchanged).
 *  2. Server-provided icon name + color via `serverDescriptor` (e.g. PvP badges).
 *     Pass the badge object or any `{ icon, color }` shape. The icon value must
 *     be a Lucide component name string present in LUCIDE_NAME_MAP.
 *  3. Category fallback from CATEGORY_FALLBACK.
 *  4. DEFAULT_VISUAL (Star, gold).
 *
 * Backward-compatible: existing callers that pass only (id, categoryKey) still work.
 */
export function badgeVisual(id, categoryKey, serverDescriptor) {
  if (id && BADGE_CATALOG[id]) return BADGE_CATALOG[id];

  // Honor server-provided icon name + color for badges not in the local catalog.
  if (serverDescriptor) {
    const iconName = serverDescriptor.icon;
    const iconColor = serverDescriptor.color;
    if (iconName && iconColor && LUCIDE_NAME_MAP[iconName]) {
      return make(LUCIDE_NAME_MAP[iconName], iconColor);
    }
  }

  if (categoryKey && CATEGORY_FALLBACK[categoryKey]) return CATEGORY_FALLBACK[categoryKey];
  return DEFAULT_VISUAL;
}

// Prettify an unknown badge id for toast fallbacks ("first_blood" → "First Blood").
export function prettifyBadgeId(id) {
  if (!id) return "Badge";
  return String(id)
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Championship belt tier visuals ──────────────────────────
// Keyed by tier label/slug as best-effort; the server provides `tier` per slot.
const BELT_TIER_COLORS = {
  amateur:        GREY,
  regional_pro:   BRONZE,
  national:       SILVER,
  gcs_contender:  BLUE,
  gcs:            GOLD,
};

const BELT_TIER_LABELS = {
  amateur:       "Amateur",
  regional_pro:  "Regional Pro",
  national:      "National",
  gcs_contender: "GCS Cont.",
  gcs:           "GCS",
};

function normTier(tier) {
  return String(tier || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, "_")
    .replace(/_+/g, "_");
}

export function beltTierColor(tier) {
  const key = normTier(tier);
  if (BELT_TIER_COLORS[key]) return BELT_TIER_COLORS[key];
  // Loose contains-matching for label variants ("GCS Contender", etc.)
  if (key.includes("contender")) return BLUE;
  if (key.includes("gcs")) return GOLD;
  if (key.includes("national")) return SILVER;
  if (key.includes("regional")) return BRONZE;
  return GREY;
}

export function beltTierLabel(tier) {
  const key = normTier(tier);
  if (BELT_TIER_LABELS[key]) return BELT_TIER_LABELS[key];
  if (key.includes("contender")) return "GCS Cont.";
  // Title-case whatever the server sent.
  return prettifyBadgeId(tier);
}
