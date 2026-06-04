import { memo } from "react";
import { Flame, Swords } from "lucide-react";
import { STYLE_COLORS } from "../fights/FighterReport";

/**
 * Revenge board — "These people hit you. Hit back." (contract §3.1 hub.revenge_cards).
 *
 * Up to 3 one-tap Challenge cards. Tapping a card opens PvpChallengeFlow with that
 * card's `fighterId` as the defender, in `context="revenge"` so the REVENGE stake
 * chip lights up. Cards with `attackable === false` show their `block_reason`.
 *
 * Props: cards (array | undefined), onChallenge(card)
 */

const DEFAULT_STYLE_COLOR = { label: "#94a3b8" };

const BLOCK_REASON_LABEL = {
    target_recovering: "They're recovering",
    out_of_bracket: "Out of range (±8 OVR)",
    target_not_attackable: "Can't be challenged right now",
    self: "That's you",
    daily_pvp_cap_reached: "No attacks left today",
};

function timeAgo(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const diff = Date.now() - then;
    if (diff < 0) return "just now";
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "<1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function RevengeCard({ card, onChallenge }) {
    const styleColor = STYLE_COLORS[card.style] ?? DEFAULT_STYLE_COLOR;
    const attackable = card.attackable !== false;
    const ago = timeAgo(card.last_fought_at);
    const blockLabel = card.block_reason ? (BLOCK_REASON_LABEL[card.block_reason] || "Unavailable") : null;

    return (
        <div className={`pvp-revenge-card${attackable ? "" : " pvp-revenge-card--blocked"}`}>
            <div className="pvp-revenge-card-top">
                <span className="pvp-revenge-name">{card.name || "Unknown"}</span>
                {card.ovr != null && <span className="pvp-revenge-ovr">{card.ovr} OVR</span>}
            </div>
            <div className="pvp-revenge-card-meta">
                {card.style && (
                    <span className="pvp-revenge-style" style={{ color: styleColor.label }}>{card.style}</span>
                )}
                <span className="pvp-revenge-line">
                    {card.last_method ? `${card.last_method}'d you` : "Beat you"}
                    {ago ? ` · ${ago}` : ""}
                </span>
            </div>
            {attackable ? (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm pvp-revenge-btn"
                    onClick={() => onChallenge(card)}
                >
                    <Swords size={12} /> Settle it
                </button>
            ) : (
                <button
                    type="button"
                    className="btn btn-secondary btn-sm pvp-revenge-btn"
                    disabled
                    title={blockLabel}
                >
                    {blockLabel}
                </button>
            )}
        </div>
    );
}

export const PvpRevengeBoard = memo(function PvpRevengeBoard({ cards, onChallenge }) {
    const list = Array.isArray(cards) ? cards.slice(0, 3) : [];

    return (
        <section className="pvp-yard-module pvp-revenge">
            <header className="pvp-yard-module-head">
                <span className="pvp-yard-module-title">
                    <Flame size={13} className="pvp-revenge-flame" /> Revenge Board
                </span>
                <span className="pvp-yard-module-sub">They hit you. Hit back.</span>
            </header>

            {list.length === 0 ? (
                <div className="pvp-yard-empty">
                    No scores to settle. Nobody&apos;s beaten you recently — keep it that way.
                </div>
            ) : (
                <div className="pvp-revenge-grid">
                    {list.map((card) => (
                        <RevengeCard
                            key={card.fighterId}
                            card={card}
                            onChallenge={onChallenge}
                        />
                    ))}
                </div>
            )}
        </section>
    );
});

export default PvpRevengeBoard;
