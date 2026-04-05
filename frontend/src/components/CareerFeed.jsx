import { memo, useEffect, useState } from "react";
import { api } from "../api";

const EVENT_CONFIG = {
    FIGHT_WIN:           { icon: "\u25CF", color: "#4ade80", label: "Win" },
    FIGHT_LOSS:          { icon: "\u25CF", color: "#f87171", label: "Loss" },
    FIGHT_DRAW:          { icon: "\u25CF", color: "#94a3b8", label: "Draw" },
    TIER_PROMOTION:      { icon: "\u2B06", color: "#fbbf24", label: "Promotion" },
    TITLE_WON:           { icon: "\uD83C\uDFC6", color: "#f59e0b", label: "Title" },
    NEMESIS_SET:          { icon: "\uD83D\uDD25", color: "#fb923c", label: "Nemesis" },
    NEMESIS_CLEARED:      { icon: "\u2714", color: "#4ade80", label: "Nemesis" },
    BADGE_EARNED:         { icon: "\u2605", color: "#c084fc", label: "Badge" },
    TITLE_SHOT_ELIGIBLE:  { icon: "\uD83C\uDFC6", color: "#fbbf24", label: "Title Shot" },
    MENTAL_RESET:         { icon: "\u26A0", color: "#fb923c", label: "Mental" },
};

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

export const CareerFeed = memo(function CareerFeed({ fighterId, refreshKey }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!fighterId) return;
        let cancelled = false;
        setLoading(true);
        api.getActivity(fighterId)
            .then((data) => {
                if (!cancelled) setEntries(data.activity ?? []);
            })
            .catch(() => {
                if (!cancelled) setEntries([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [fighterId, refreshKey]);

    if (loading && entries.length === 0) {
        return (
            <section className="career-feed">
                <h3 className="panel-section-title">Career Feed</h3>
                <p className="panel-hint" style={{ padding: "0.75rem 1rem" }}>Loading...</p>
            </section>
        );
    }

    return (
        <section className="career-feed">
            <h3 className="panel-section-title">Career Feed</h3>
            {entries.length === 0 ? (
                <p className="panel-hint" style={{ padding: "0.75rem 1rem" }}>
                    No career history yet. Step into the cage.
                </p>
            ) : (
                <ul className="cf-list">
                    {entries.map((entry) => {
                        const cfg = EVENT_CONFIG[entry.type] ?? EVENT_CONFIG.FIGHT_WIN;
                        const isTitleWon = entry.type === "TITLE_WON";
                        return (
                            <li
                                key={entry._id}
                                className={`cf-item${isTitleWon ? " cf-item--title" : ""}`}
                                style={isTitleWon ? { borderColor: "#f59e0b" } : undefined}
                            >
                                <span className="cf-icon" style={{ color: cfg.color }}>
                                    {cfg.icon}
                                </span>
                                <div className="cf-body">
                                    <span className="cf-detail">{entry.detail}</span>
                                    <span className="cf-time">{relativeTime(entry.createdAt)}</span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
});
