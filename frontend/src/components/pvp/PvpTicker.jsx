import { memo } from "react";
import { Radio, Swords } from "lucide-react";

/**
 * PvP ticker — scrolling feed of recent ladder events relevant to you
 * (contract §3.1 hub.ticker). Read-only aggregation; one-tap action when an
 * item carries `action.type === "challenge"` (opens PvpChallengeFlow with
 * `action.defenderId`).
 *
 * Each ticker item: { id, kind, text, fought_at, actor:{fighterId,name}, action }
 * `kind` drives a small accent glyph; all fields guarded.
 *
 * Props: items (array | undefined), onChallenge(defenderId, item)
 */

const KIND_META = {
    you_attacked: { glyph: "⚔", cls: "you" },
    you_were_attacked: { glyph: "🛡", cls: "hit" },
    rival_fight: { glyph: "🔥", cls: "rival" },
    belt_change: { glyph: "👑", cls: "belt" },
    streak_break: { glyph: "💥", cls: "break" },
};

function timeAgo(iso) {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Date.now() - then;
    if (diff < 0) return "now";
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function TickerItem({ item, onChallenge }) {
    const meta = KIND_META[item.kind] || { glyph: "•", cls: "default" };
    const canChallenge = item.action?.type === "challenge" && item.action?.defenderId;

    return (
        <li className={`pvp-ticker-item pvp-ticker-item--${meta.cls}`}>
            <span className="pvp-ticker-glyph" aria-hidden="true">{meta.glyph}</span>
            <span className="pvp-ticker-text">{item.text || "—"}</span>
            <span className="pvp-ticker-time">{timeAgo(item.fought_at)}</span>
            {canChallenge && (
                <button
                    type="button"
                    className="pvp-ticker-action"
                    onClick={() => onChallenge(item.action.defenderId, item)}
                    title={`Challenge ${item.actor?.name || "this fighter"}`}
                >
                    <Swords size={11} /> Challenge
                </button>
            )}
        </li>
    );
}

export const PvpTicker = memo(function PvpTicker({ items, onChallenge }) {
    const list = Array.isArray(items) ? items : [];

    return (
        <section className="pvp-yard-module pvp-ticker">
            <header className="pvp-yard-module-head">
                <span className="pvp-yard-module-title">
                    <Radio size={13} className="pvp-ticker-live" /> The Wire
                </span>
                <span className="pvp-yard-module-sub">Live from the ladder</span>
            </header>

            {list.length === 0 ? (
                <div className="pvp-yard-empty">Quiet on the ladder. Recent action shows up here.</div>
            ) : (
                <ul className="pvp-ticker-list">
                    {list.map((item) => (
                        <TickerItem
                            key={item.id}
                            item={item}
                            onChallenge={onChallenge}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
});

export default PvpTicker;
