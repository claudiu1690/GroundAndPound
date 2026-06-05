import { memo, useEffect, useState } from "react";
import { api } from "../api";
import { Trophy, X, Minus, ArrowUp, Crown, Flame, Swords, ShieldCheck, Target, AlertTriangle } from "lucide-react";

const EVENT_CONFIG = {
    FIGHT_WIN:           { tone: "win",     Icon: Trophy,        label: "Win" },
    FIGHT_LOSS:          { tone: "loss",    Icon: X,             label: "Loss" },
    FIGHT_DRAW:          { tone: "neutral", Icon: Minus,         label: "Draw" },
    TIER_PROMOTION:      { tone: "special", Icon: ArrowUp,       label: "Promotion" },
    TITLE_WON:           { tone: "badge",   Icon: Crown,         label: "Title" },
    NEMESIS_SET:         { tone: "nemesis", Icon: Flame,         label: "Nemesis" },
    NEMESIS_CLEARED:     { tone: "special", Icon: Swords,        label: "Nemesis" },
    BADGE_EARNED:        { tone: "badge",   Icon: ShieldCheck,   label: "Badge" },
    TITLE_SHOT_ELIGIBLE: { tone: "badge",   Icon: Target,        label: "Title Shot" },
    MENTAL_RESET:        { tone: "neutral", Icon: AlertTriangle, label: "Mental" },
};

const FALLBACK = { tone: "neutral", Icon: Minus, label: "Event" };

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

    useEffect(() => {
        if (!fighterId) return;
        let cancelled = false;
        setLoading(true);
        api.getActivity(fighterId)
            .then((data) => {
                // Badge events hidden from the feed — still logged server-side; will return as achievements.
                if (!cancelled) setEntries((data.activity ?? []).filter((e) => e.type !== "BADGE_EARNED"));
            })
            .catch(() => {
                if (!cancelled) setEntries([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [fighterId, refreshKey]);

    return (
        <section className="career-feed">
            <header className="page-header">
                <div className="page-eyebrow">Career</div>
                <h1 className="page-title">Career Feed</h1>
            </header>
            <div className="feed">
                {loading && entries.length === 0 ? (
                    <div className="feed-empty">Loading…</div>
                ) : entries.length === 0 ? (
                    <div className="feed-empty">No career history yet. Step into the cage.</div>
                ) : (
                    groupByDate(entries).map((group) => (
                        <div className="date-group" key={group.label}>
                            <div className="date-label">{group.label}</div>
                            {group.items.map((entry) => {
                                const cfg = EVENT_CONFIG[entry.type] ?? FALLBACK;
                                const Icon = cfg.Icon;
                                const [first, ...rest] = (entry.detail ?? "").split(" · ");
                                const meta = rest.join(" · ") || null;
                                // A title fight: the belt win (TITLE_WON) or any fight result
                                // flagged isTitleFight (so title losses/draws stand out too).
                                const isTitleFight = entry.type === "TITLE_WON" || !!entry.meta?.isTitleFight;
                                // TITLE_WON already carries the "Title" badge + crown, so only
                                // tag the win/loss/draw rows that would otherwise look ordinary.
                                const showTitleTag = isTitleFight && entry.type !== "TITLE_WON";
                                return (
                                    <div className={`feed-item${isTitleFight ? " feed-item--title" : ""}`} key={entry._id}>
                                        <span className={`feed-icon ${cfg.tone}`}><Icon size={16} strokeWidth={2} /></span>
                                        <div className="feed-content">
                                            <div className="feed-title">
                                                {first}
                                                {showTitleTag && (
                                                    <span className="feed-title-fight-tag">
                                                        <Crown size={11} strokeWidth={2.4} /> Title Fight
                                                    </span>
                                                )}
                                            </div>
                                            {meta && <div className="feed-meta">{meta}</div>}
                                            <div className="feed-time">{relativeTime(entry.createdAt)}</div>
                                        </div>
                                        <span className={`feed-type ${cfg.tone}`}>{cfg.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>
        </section>
    );
});
