import { memo, useCallback, useState } from "react";
import { PvpRevengeBoard } from "./PvpRevengeBoard";
import { PvpTicker } from "./PvpTicker";
import { PvpContracts } from "./PvpContracts";
import { PvpChallengeFlow } from "./PvpChallengeFlow";

/**
 * "The Yard" — the hub home / feed (contract §5). Three stacked modules:
 *   1. Revenge board (≤3 one-tap Challenge cards)
 *   2. Ticker (scrolling ladder feed, one-tap challenge actions)
 *   3. Contracts (progress bars + Claim)
 *
 * The Yard owns the shared PvpChallengeFlow entry: revenge cards and ticker
 * challenge actions open it with the relevant `defenderId`. Revenge opens it with
 * `context="revenge"` so the REVENGE stake chip lights. On resolve, the fighter is
 * refreshed and the hub is refetched (`onRefetchHub`) so identity/cards stay fresh.
 *
 * Props:
 *   hub { revenge_cards, ticker, contracts } (sliced from /pvp/hub)
 *   fighter, onMessage, onRefreshFighter, onRefetchHub, onViewLadder
 */
export const PvpYard = memo(function PvpYard({
    hub,
    fighter,
    onMessage,
    onRefreshFighter,
    onRefetchHub,
    onViewLadder,
}) {
    // { defenderId, preview, context } | null
    const [challenge, setChallenge] = useState(null);

    const openRevenge = useCallback((card) => {
        setChallenge({
            defenderId: card.fighterId,
            preview: {
                name: card.name,
                ovr: card.ovr,
                style: card.style,
            },
            context: "revenge",
        });
    }, []);

    const openTicker = useCallback((defenderId, item) => {
        setChallenge({
            defenderId,
            preview: { name: item?.actor?.name },
            // Ticker challenges are revenge-flavoured when they stem from a hit.
            context: item?.kind === "you_were_attacked" ? "revenge" : undefined,
        });
    }, []);

    const handleResolved = useCallback((result) => {
        setChallenge(null);
        if (result?.fighter && onRefreshFighter && fighter?._id) {
            onRefreshFighter(fighter._id, { clearMessage: false });
        }
        // Re-pull the hub so revenge cards / ticker / identity reflect the fight.
        onRefetchHub?.();
    }, [fighter?._id, onRefreshFighter, onRefetchHub]);

    return (
        <div className="pvp-yard">
            <PvpRevengeBoard
                cards={hub?.revenge_cards}
                onChallenge={openRevenge}
            />
            <PvpTicker
                items={hub?.ticker}
                onChallenge={openTicker}
            />
            <PvpContracts
                contracts={hub?.contracts}
                onClaimed={onRefetchHub}
                onMessage={onMessage}
            />

            {challenge && (
                <PvpChallengeFlow
                    fighter={fighter}
                    defenderId={challenge.defenderId}
                    defenderPreview={challenge.preview}
                    context={challenge.context}
                    onClose={() => setChallenge(null)}
                    onResolved={handleResolved}
                    onViewLadder={onViewLadder ? () => { setChallenge(null); onViewLadder(); } : undefined}
                    onMessage={onMessage}
                />
            )}
        </div>
    );
});

export default PvpYard;
