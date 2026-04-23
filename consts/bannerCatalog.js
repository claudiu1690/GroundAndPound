/**
 * Banner customizer catalog (Phase 2).
 *
 * Every piece declares its kind (background / frame / accent / badge) and an `unlockAt`
 * condition. Unlocks are evaluated dynamically from fighter state — no inventory needs
 * to be persisted, so adding new pieces later automatically lights up for eligible fighters.
 *
 * `visual` carries CSS-ready data for the BannerPreview component:
 *   - background.css   — any valid `background` shorthand (gradient, solid, url(), etc.)
 *   - frame.border     — CSS border shorthand
 *   - frame.boxShadow  — optional extra flair
 *   - accent.color     — hex for name / accent text
 *   - badge.icon       — emoji or short glyph
 *
 * Unlock keys (any combination; AND semantics):
 *   notorietyTier: "UNKNOWN" | "PROSPECT" | "RISING_STAR" | "CONTENDER" | "STAR" | "LEGEND"
 *   promotionTier: "Amateur" | "Regional Pro" | "National" | "GCS Contender" | "GCS"
 *   milestone:     "wins10" | "wins25" | "wins50" | "ko10"
 *   badge:         any string present in fighter.badges (e.g. "Champion", "Resilience")
 *   totalWins:     number — fighter.record.wins ≥ N
 *   koWins:        number — fighter.record.koWins ≥ N
 *   beltsWon:      true — fighter.badges includes "Champion"
 *   always:        true — always unlocked (starter pieces)
 */

const BANNER_PIECES = [
    // ── Backgrounds ────────────────────────────────────────────
    {
        id: "BG_SLATE", kind: "background", label: "Slate",
        visual: { css: "linear-gradient(135deg, #2c2c2e 0%, #3a3a3c 100%)" },
        unlockAt: { always: true },
    },
    {
        id: "BG_CRIMSON", kind: "background", label: "Crimson",
        visual: { css: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)" },
        unlockAt: { notorietyTier: "PROSPECT" },
    },
    {
        id: "BG_NAVY", kind: "background", label: "Deep Blue",
        visual: { css: "linear-gradient(135deg, #0c1a3a 0%, #1e3a8a 100%)" },
        unlockAt: { notorietyTier: "PROSPECT" },
    },
    {
        id: "BG_CARBON", kind: "background", label: "Carbon Fiber",
        visual: { css: "repeating-linear-gradient(45deg, #1a1a1c 0 6px, #2c2c2e 6px 12px)" },
        unlockAt: { notorietyTier: "RISING_STAR" },
    },
    {
        id: "BG_EMERALD", kind: "background", label: "Emerald",
        visual: { css: "linear-gradient(135deg, #052e1a 0%, #10b981 100%)" },
        unlockAt: { notorietyTier: "RISING_STAR" },
    },
    {
        id: "BG_GOLD_MESH", kind: "background", label: "Gold Mesh",
        visual: { css: "repeating-linear-gradient(90deg, #7c5a0b 0 2px, #d4a012 2px 4px, #7c5a0b 4px 6px)" },
        unlockAt: { notorietyTier: "CONTENDER" },
    },
    {
        id: "BG_NEON", kind: "background", label: "Neon City",
        visual: { css: "linear-gradient(135deg, #1a0b2e 0%, #7e22ce 50%, #ec4899 100%)" },
        unlockAt: { notorietyTier: "STAR" },
    },
    {
        id: "BG_HOLO", kind: "background", label: "Holographic",
        visual: { css: "linear-gradient(135deg, #c084fc 0%, #38bdf8 25%, #fbbf24 50%, #f472b6 75%, #c084fc 100%)" },
        unlockAt: { notorietyTier: "LEGEND" },
    },

    // ── Frames ─────────────────────────────────────────────────
    {
        id: "FRAME_NONE", kind: "frame", label: "No Frame",
        visual: { border: "1px solid rgba(255,255,255,0.15)" },
        unlockAt: { always: true },
    },
    {
        id: "FRAME_ROPE", kind: "frame", label: "Cage Rope",
        visual: { border: "3px double #b8860b" },
        unlockAt: { notorietyTier: "PROSPECT" },
    },
    {
        id: "FRAME_CHROME", kind: "frame", label: "Chrome",
        visual: { border: "3px solid #cbd5e1", boxShadow: "inset 0 0 0 1px #64748b" },
        unlockAt: { notorietyTier: "RISING_STAR" },
    },
    {
        id: "FRAME_GOLD", kind: "frame", label: "Gold Trim",
        visual: { border: "3px solid #d4a012", boxShadow: "inset 0 0 0 1px #7c5a0b, 0 0 8px rgba(212,160,18,0.3)" },
        unlockAt: { notorietyTier: "CONTENDER" },
    },
    {
        id: "FRAME_CHAMP", kind: "frame", label: "Championship",
        visual: { border: "4px double #fbbf24", boxShadow: "inset 0 0 0 2px #7c5a0b, 0 0 12px rgba(251,191,36,0.4)" },
        unlockAt: { beltsWon: true },
    },

    // ── Accent colors ──────────────────────────────────────────
    { id: "ACC_RED",    kind: "accent", label: "Blood Red",  visual: { color: "#ef4444" }, unlockAt: { always: true } },
    { id: "ACC_WHITE",  kind: "accent", label: "Bone White", visual: { color: "#f5f5f7" }, unlockAt: { always: true } },
    { id: "ACC_BLUE",   kind: "accent", label: "Ice Blue",   visual: { color: "#38bdf8" }, unlockAt: { always: true } },
    { id: "ACC_GOLD",   kind: "accent", label: "Gold",       visual: { color: "#fbbf24" }, unlockAt: { notorietyTier: "PROSPECT" } },
    { id: "ACC_GREEN",  kind: "accent", label: "Jade",       visual: { color: "#22c55e" }, unlockAt: { notorietyTier: "RISING_STAR" } },
    { id: "ACC_PURPLE", kind: "accent", label: "Royal",      visual: { color: "#c084fc" }, unlockAt: { notorietyTier: "CONTENDER" } },
    { id: "ACC_PINK",   kind: "accent", label: "Hot Pink",   visual: { color: "#f472b6" }, unlockAt: { notorietyTier: "STAR" } },

    // ── Badges (up to 3 can be pinned) ─────────────────────────
    {
        id: "BADGE_FIRST_WIN", kind: "badge", label: "First Win",
        visual: { icon: "1️⃣" },
        unlockAt: { totalWins: 1 },
    },
    {
        id: "BADGE_WINS_10", kind: "badge", label: "10 Wins",
        visual: { icon: "🔟" },
        unlockAt: { milestone: "wins10" },
    },
    {
        id: "BADGE_WINS_25", kind: "badge", label: "25 Wins",
        visual: { icon: "🏅" },
        unlockAt: { milestone: "wins25" },
    },
    {
        id: "BADGE_WINS_50", kind: "badge", label: "50 Wins",
        visual: { icon: "🎖" },
        unlockAt: { milestone: "wins50" },
    },
    {
        id: "BADGE_KO_10", kind: "badge", label: "10 KOs",
        visual: { icon: "💥" },
        unlockAt: { milestone: "ko10" },
    },
    {
        id: "BADGE_KO_5", kind: "badge", label: "Knockout Artist",
        visual: { icon: "🥊" },
        unlockAt: { koWins: 5 },
    },
    {
        id: "BADGE_CHAMPION", kind: "badge", label: "Champion",
        visual: { icon: "🏆" },
        unlockAt: { badge: "Champion" },
    },
    {
        id: "BADGE_RESILIENCE", kind: "badge", label: "Resilience",
        visual: { icon: "💪" },
        unlockAt: { badge: "Resilience" },
    },
    {
        id: "BADGE_LEGEND", kind: "badge", label: "Legend",
        visual: { icon: "⭐" },
        unlockAt: { notorietyTier: "LEGEND" },
    },
    {
        id: "BADGE_STAR", kind: "badge", label: "Star",
        visual: { icon: "✨" },
        unlockAt: { notorietyTier: "STAR" },
    },
    {
        id: "BADGE_CONTENDER", kind: "badge", label: "Contender",
        visual: { icon: "🎯" },
        unlockAt: { notorietyTier: "CONTENDER" },
    },
    {
        id: "BADGE_CALLOUT", kind: "badge", label: "Callout Win",
        visual: { icon: "📣" },
        unlockAt: { badge: "Callout Win" },
    },
    {
        id: "BADGE_DOCUMENTARY", kind: "badge", label: "Legacy",
        visual: { icon: "🎬" },
        unlockAt: { badge: "Documentary" },
    },
];

/** Kinds the editor groups pieces by. Order drives UI tabs. */
const BANNER_KINDS = ["background", "frame", "accent", "badge"];

/** Max badges that can be pinned at once. */
const MAX_BADGE_SLOTS = 3;

/** Default banner for new fighters. */
const DEFAULT_BANNER = {
    backgroundId: "BG_SLATE",
    frameId: "FRAME_NONE",
    accentColor: "ACC_RED",
    badgeSlots: [],
};

module.exports = {
    BANNER_PIECES,
    BANNER_KINDS,
    MAX_BADGE_SLOTS,
    DEFAULT_BANNER,
};
