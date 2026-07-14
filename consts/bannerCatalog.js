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
    // ── Styles (background compositions) ───────────────────────
    // Same ids/unlock tiers as the old flat-gradient set so saved banners and
    // progression carry over. `css` is a layered background shorthand (slash
    // cuts, sheens, washes); `texture` picks an overlay class in the preview
    // ("halftone" | "grain" | null).
    {
        id: "BG_SLATE", kind: "background", label: "Slate",
        visual: { css: "linear-gradient(115deg, #232327 0%, #141416 62%)", texture: "grain" },
        unlockAt: { always: true },
    },
    {
        id: "BG_CRIMSON", kind: "background", label: "Red Slash",
        visual: {
            css: "linear-gradient(115deg, transparent 0 58%, rgba(200,16,46,0.92) 58.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(200,16,46,0.30) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #1a1416 0%, #141416 65%)",
            texture: "halftone",
        },
        unlockAt: { notorietyTier: "PROSPECT" },
    },
    {
        id: "BG_NAVY", kind: "background", label: "Blue Steel",
        visual: {
            css: "linear-gradient(115deg, transparent 0 58%, rgba(59,130,246,0.85) 58.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(59,130,246,0.28) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #10141c 0%, #121316 65%)",
            texture: "halftone",
        },
        unlockAt: { notorietyTier: "PROSPECT" },
    },
    {
        id: "BG_CARBON", kind: "background", label: "Carbon",
        visual: {
            css: "radial-gradient(90% 130% at 18% 0%, rgba(255,255,255,0.09), transparent 55%), repeating-linear-gradient(45deg, #151517 0 6px, #1c1c1f 6px 12px)",
            texture: null,
        },
        unlockAt: { notorietyTier: "RISING_STAR" },
    },
    {
        id: "BG_EMERALD", kind: "background", label: "Jade Slash",
        visual: {
            css: "linear-gradient(115deg, transparent 0 58%, rgba(34,197,94,0.8) 58.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(34,197,94,0.25) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #0f1712 0%, #121412 65%)",
            texture: "halftone",
        },
        unlockAt: { notorietyTier: "RISING_STAR" },
    },
    {
        id: "BG_GOLD_MESH", kind: "background", label: "Gold Standard",
        visual: {
            css: "linear-gradient(100deg, transparent 0 60%, rgba(212,168,32,0.16) 60% 100%), linear-gradient(115deg, #1e1808 0%, #141416 68%)",
            texture: "grain",
        },
        unlockAt: { notorietyTier: "CONTENDER" },
    },
    {
        id: "BG_NEON", kind: "background", label: "Neon City",
        visual: {
            css: "linear-gradient(115deg, transparent 0 60%, rgba(236,72,153,0.5) 60.3% 65%, transparent 65.3%), linear-gradient(115deg, transparent 0 66%, rgba(126,34,206,0.4) 66.3% 69%, transparent 69.3%), linear-gradient(135deg, #170b28 0%, #0f0a18 60%)",
            texture: "halftone",
        },
        unlockAt: { notorietyTier: "STAR" },
    },
    {
        id: "BG_HOLO", kind: "background", label: "Holographic",
        visual: {
            css: "linear-gradient(135deg, rgba(192,132,252,0.35) 0%, rgba(56,189,248,0.3) 25%, rgba(251,191,36,0.28) 50%, rgba(244,114,182,0.33) 75%, rgba(192,132,252,0.35) 100%), linear-gradient(135deg, #17181c 0%, #101114 100%)",
            texture: "grain",
        },
        unlockAt: { notorietyTier: "LEGEND" },
    },

    // ── Badge-gated backgrounds ────────────────────────────────
    {
        id: "BG_SCORCHED", kind: "background", label: "Scorched Canvas",
        visual: {
            css: "radial-gradient(90% 130% at 20% 0%, rgba(249,115,22,0.18), transparent 55%), linear-gradient(115deg, transparent 0 60%, rgba(234,88,12,0.55) 60.3% 66%, transparent 66.3%), linear-gradient(115deg, transparent 0 67%, rgba(234,88,12,0.22) 67.3% 71%, transparent 71.3%), linear-gradient(115deg, #1a0f08 0%, #120a06 65%)",
            texture: "grain",
        },
        unlockAt: { badge: "ko_artist" },
    },
    {
        id: "BG_TITANIUM", kind: "background", label: "Titanium",
        visual: {
            css: "linear-gradient(100deg, transparent 0 58%, rgba(203,213,225,0.14) 58% 100%), radial-gradient(90% 130% at 82% 0%, rgba(226,232,240,0.10), transparent 55%), repeating-linear-gradient(100deg, #1c1e22 0 5px, #23262b 5px 10px)",
            texture: null,
        },
        unlockAt: { badge: "titan_rank4" },
    },
    {
        id: "BG_GOLD_LEAF", kind: "background", label: "Gold Leaf",
        visual: {
            css: "linear-gradient(100deg, transparent 0 55%, rgba(212,168,32,0.22) 55% 100%), radial-gradient(90% 130% at 82% 0%, rgba(250,204,21,0.16), transparent 55%), linear-gradient(115deg, #201907 0%, #131110 68%)",
            texture: "grain",
        },
        unlockAt: { badge: "champ_gcs" },
    },
    {
        id: "BG_THRONE", kind: "background", label: "Throne Room",
        visual: {
            css: "linear-gradient(115deg, transparent 0 60%, rgba(126,34,206,0.40) 60.3% 66%, transparent 66.3%), radial-gradient(90% 130% at 18% 0%, rgba(168,85,247,0.16), transparent 55%), linear-gradient(135deg, #1a0f22 0%, #120a16 62%)",
            texture: "halftone",
        },
        unlockAt: { badge: "pvp_belt_first" },
    },

    // ── Layouts (nameplate typesetting; stored in the legacy frameId slot) ──
    // `glyph` is only used for the editor swatch.
    {
        id: "LAYOUT_STACKED", kind: "frame", label: "Stacked",
        visual: { glyph: "≡" },
        unlockAt: { always: true },
    },
    {
        id: "LAYOUT_INLINE", kind: "frame", label: "Lower Third",
        visual: { glyph: "—" },
        unlockAt: { notorietyTier: "PROSPECT" },
    },
    {
        id: "LAYOUT_MARQUEE", kind: "frame", label: "Marquee",
        visual: { glyph: "◈" },
        unlockAt: { notorietyTier: "RISING_STAR" },
    },
    {
        id: "LAYOUT_BROADCAST", kind: "frame", label: "Broadcast",
        visual: { glyph: "▮" },
        unlockAt: { notorietyTier: "CONTENDER" },
    },
    {
        id: "LAYOUT_CHAMP", kind: "frame", label: "Championship",
        visual: { glyph: "★" },
        unlockAt: { beltsWon: true },
    },
    {
        id: "FRAME_WARPATH", kind: "frame", label: "Warpath",
        visual: { glyph: "⚔" },
        unlockAt: { badge: "giant_killer" },
    },
    {
        id: "FRAME_SPOTLIGHT", kind: "frame", label: "Spotlight",
        visual: { glyph: "◎" },
        unlockAt: { badge: "documentary" },
    },

    // ── Accent colors ──────────────────────────────────────────
    { id: "ACC_RED",    kind: "accent", label: "Blood Red",  visual: { color: "#ef4444" }, unlockAt: { always: true } },
    { id: "ACC_WHITE",  kind: "accent", label: "Bone White", visual: { color: "#f5f5f7" }, unlockAt: { always: true } },
    { id: "ACC_BLUE",   kind: "accent", label: "Ice Blue",   visual: { color: "#38bdf8" }, unlockAt: { always: true } },
    { id: "ACC_GOLD",   kind: "accent", label: "Gold",       visual: { color: "#fbbf24" }, unlockAt: { notorietyTier: "PROSPECT" } },
    { id: "ACC_GREEN",  kind: "accent", label: "Jade",       visual: { color: "#22c55e" }, unlockAt: { notorietyTier: "RISING_STAR" } },
    { id: "ACC_PURPLE", kind: "accent", label: "Royal",      visual: { color: "#c084fc" }, unlockAt: { notorietyTier: "CONTENDER" } },
    { id: "ACC_PINK",   kind: "accent", label: "Hot Pink",   visual: { color: "#f472b6" }, unlockAt: { notorietyTier: "STAR" } },
    { id: "ACC_CHAMPAGNE",   kind: "accent", label: "Champagne",   visual: { color: "#e8d48b" }, unlockAt: { badge: "perfect_camp" } },
    { id: "ACC_BLOOD_RIVAL", kind: "accent", label: "Blood Rival", visual: { color: "#7f1d1d" }, unlockAt: { badge: "nemesis_slayer" } },
    { id: "ACC_PLATINUM",    kind: "accent", label: "Platinum",    visual: { color: "#d9dde3" }, unlockAt: { badge: "veteran" } },
    { id: "ACC_TEAL_ICE",    kind: "accent", label: "Teal Ice",    visual: { color: "#2dd4bf" }, unlockAt: { badge: "sub_hunter" } },

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
    frameId: "LAYOUT_STACKED",
    accentColor: "ACC_RED",
    badgeSlots: [],
};

module.exports = {
    BANNER_PIECES,
    BANNER_KINDS,
    MAX_BADGE_SLOTS,
    DEFAULT_BANNER,
};
