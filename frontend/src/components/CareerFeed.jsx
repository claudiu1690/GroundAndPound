import { memo, useEffect, useState } from "react";
import { api } from "../api";
import {
    Trophy, X, Minus, ArrowUp, Crown, Flame, Swords, ShieldCheck, Target,
    AlertTriangle, Mic, Megaphone, Star, FileText, Cross, HeartPulse,
} from "lucide-react";

// Event type → timeline dot colour + icon + type-pill label.
// Colours follow the mockup palette (Win green, Loss red, Draw grey, Title gold,
// Promotion purple, Badge gold, Podcast blue, Post-fight green/red, Appearance
// blue, Contract amber, Injury red, Injury Healed green).
const GREEN = "#4ADE80";
const RED = "#C8102E";
const GREY = "#999999";
const GOLD = "#D4A820";
const BLUE = "#3B82F6";
const PURPLE = "#8B5CF6";
const AMBER = "#C87A10";

const EVENT_CONFIG = {
    FIGHT_WIN:           { color: GREEN,  Icon: Trophy,        label: "Win" },
    FIGHT_LOSS:          { color: RED,    Icon: X,             label: "Loss" },
    FIGHT_DRAW:          { color: GREY,   Icon: Minus,         label: "Draw" },
    TIER_PROMOTION:      { color: PURPLE, Icon: ArrowUp,       label: "Promotion" },
    TITLE_WON:           { color: GOLD,   Icon: Crown,         label: "Title" },
    NEMESIS_SET:         { color: RED,    Icon: Flame,         label: "Nemesis" },
    NEMESIS_CLEARED:     { color: PURPLE, Icon: Swords,        label: "Nemesis" },
    BADGE_EARNED:        { color: GOLD,   Icon: ShieldCheck,   label: "Badge" },
    TITLE_SHOT_ELIGIBLE: { color: GOLD,   Icon: Target,        label: "Title Shot" },
    MENTAL_RESET:        { color: GREY,   Icon: AlertTriangle, label: "Mental" },
    PODCAST:             { color: BLUE,   Icon: Mic,           label: "Podcast" },
    POST_FIGHT:          { color: RED,    Icon: Megaphone,     label: "Media" },
    APPEARANCE:          { color: BLUE,   Icon: Star,          label: "Appearance" },
    CONTRACT:            { color: AMBER,  Icon: FileText,      label: "Contract" },
    INJURY:              { color: RED,    Icon: Cross,         label: "Injury" },
    INJURY_HEALED:       { color: GREEN,  Icon: HeartPulse,    label: "Healed" },
};

const FALLBACK = { color: GREY, Icon: Minus, label: "Event" };

function tint(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
}

function relativeTime(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

function groupByDate(entries) {
    const now = new Date();
    const ty = now.getFullYear();
    const tm = now.getMonth();
    const td = now.getDate();
    const todayUTC = Date.UTC(ty, tm, td);

    const buckets = new Map();
    for (const entry of entries) {
        const d = new Date(entry.createdAt);
        const y = d.getFullYear();
        const m = d.getMonth();
        const day = d.getDate();
        const key = `${y}-${m}-${day}`;
        if (!buckets.has(key)) {
            const dayDiff = Math.round((todayUTC - Date.UTC(y, m, day)) / 86400000);
            let label;
            if (dayDiff === 0) label = "Today";
            else if (dayDiff === 1) label = "Yesterday";
            else if (dayDiff >= 2 && dayDiff <= 6) label = `${dayDiff} days ago`;
            else label = new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            buckets.set(key, { label, items: [] });
        }
        buckets.get(key).items.push(entry);
    }
    return Array.from(buckets.values());
}

export const CareerFeed = memo(function CareerFeed({ fighterId, refreshKey }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!fighterId) return;
        let cancelled = false;
        setLoading(true);
        setError(false);
        api.getActivity(fighterId)
            .then((data) => {
                // Badge events are now shown in the timeline (gold dot/pill).
                if (!cancelled) setEntries(data.activity ?? []);
            })
            .catch(() => {
                if (!cancelled) { setEntries([]); setError(true); }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [fighterId, refreshKey]);

    const groups = groupByDate(entries);

    return (
        <div className="feed-wrap">
            {loading && entries.length === 0 ? (
                <div className="career-empty">Loading…</div>
            ) : error && entries.length === 0 ? (
                <div className="career-empty">Could not load your career feed.</div>
            ) : entries.length === 0 ? (
                <div className="career-empty">No career history yet. Step into the cage.</div>
            ) : (
                groups.map((group) => (
                    <div key={group.label}>
                        <div className="feed-group-lbl">{group.label}</div>
                        {group.items.map((entry, idx) => {
                            const cfg = EVENT_CONFIG[entry.type] ?? FALLBACK;
                            const Icon = cfg.Icon;
                            const isLast = idx === group.items.length - 1;

                            const [first, ...rest] = (entry.detail ?? "").split(" · ");

                            // Surface free-earned Energy Drinks from meta as an extra detail chunk.
                            const drinks =
                                entry.type === "FIGHT_WIN"
                                    ? (entry.meta?.streakDrinks ?? 0)
                                    : (entry.type === "TIER_PROMOTION" || entry.type === "TITLE_WON")
                                        ? (entry.meta?.drinksGranted ?? 0)
                                        : 0;
                            const metaParts = [...rest];
                            if (drinks > 0) metaParts.push(`+${drinks} Energy Drink${drinks === 1 ? "" : "s"}`);
                            const sub = metaParts.join(" · ") || null;

                            // Reward line (fame / cash) if present on meta.
                            const fame = entry.meta?.fameGained ?? entry.meta?.fame ?? null;
                            const cash = entry.meta?.cashGained ?? entry.meta?.cash ?? entry.meta?.purse ?? null;
                            const rewardBits = [];
                            if (fame != null && fame !== 0) rewardBits.push(`+${Number(fame).toLocaleString()} fame`);
                            if (cash != null && cash !== 0) rewardBits.push(`+$${Number(cash).toLocaleString()}`);
                            const reward = rewardBits.join(" · ") || null;

                            const isTitleFight = entry.type === "TITLE_WON" || !!entry.meta?.isTitleFight;
                            const showTitleTag = isTitleFight && entry.type !== "TITLE_WON";

                            return (
                                <div className="feed-item" key={entry._id}>
                                    <div className="feed-icon">
                                        <div className="feed-dot" style={{ background: tint(cfg.color, 0.14), color: cfg.color }}>
                                            <Icon size={14} strokeWidth={2} />
                                        </div>
                                        {!isLast && <div className="feed-line" />}
                                    </div>
                                    <div className="feed-body">
                                        <div className="feed-top">
                                            <div className="feed-title">
                                                {first}
                                                {showTitleTag && (
                                                    <span className="feed-title-fight-tag">
                                                        <Crown size={11} strokeWidth={2.4} /> Title Fight
                                                    </span>
                                                )}
                                                <span
                                                    className="feed-type"
                                                    style={{ background: tint(cfg.color, 0.1), color: cfg.color, border: `1px solid ${tint(cfg.color, 0.25)}` }}
                                                >
                                                    {cfg.label}
                                                </span>
                                            </div>
                                            <div className="feed-right">
                                                {reward && <div className="feed-reward">{reward}</div>}
                                                <div className="feed-time">{relativeTime(entry.createdAt)}</div>
                                            </div>
                                        </div>
                                        {sub && <div className="feed-sub">{sub}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))
            )}
        </div>
    );
});
