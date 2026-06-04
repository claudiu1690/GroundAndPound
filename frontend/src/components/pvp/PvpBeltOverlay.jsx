import { memo } from "react";
import { createPortal } from "react-dom";
import { Trophy, ShieldOff } from "lucide-react";

/**
 * Full-screen belt-transfer moment for PvP. Reuses TierUpOverlay styling
 * (`tier-up-overlay` / `tier-up-modal`).
 *
 *   mode="won"  → gold "PVP CHAMPION" (extracted from the old inline
 *                 BeltTransferOverlay).
 *   mode="lost" → red "YOU LOST THE BELT" (Tier-3; wired but stays dark until
 *                 belt.lost lands — render only when explicitly opened).
 *
 * Props: { mode, open, previousChampion, newChampion, onContinue }.
 */
export const PvpBeltOverlay = memo(function PvpBeltOverlay({
    mode = "won",
    open = true,
    previousChampion,
    newChampion,
    onContinue,
}) {
    if (!open) return null;

    if (mode === "lost") {
        return createPortal(
            <div className="tier-up-overlay pvp-belt-overlay--lost" role="dialog" aria-modal="true" aria-label="PvP belt lost">
                <div className="tier-up-modal" style={{ borderColor: "#e31837" }}>
                    <p className="tier-up-kicker" style={{ color: "#f87171" }}>Championship lost</p>
                    <h2 className="tier-up-title" style={{ color: "#f87171" }}>
                        <ShieldOff size={24} /> YOU LOST THE BELT <ShieldOff size={24} />
                    </h2>
                    <p className="tier-up-transition">
                        {newChampion
                            ? <><strong>{newChampion}</strong> took the PvP belt from you.</>
                            : <>The PvP belt has been taken from you.</>}
                    </p>
                    <p className="tier-up-hint">The ladder never sleeps — chase the rematch and take it back.</p>
                    <button type="button" className="btn btn-primary tier-up-dismiss" onClick={onContinue}>
                        Continue
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="tier-up-overlay" role="dialog" aria-modal="true" aria-label="PvP belt won">
            <div className="tier-up-modal" style={{ borderColor: "#d4a012" }}>
                <p className="tier-up-kicker" style={{ color: "#fbbf24" }}>Championship victory</p>
                <h2 className="tier-up-title" style={{ color: "#fbbf24" }}>
                    <Trophy size={24} /> PVP CHAMPION <Trophy size={24} />
                </h2>
                <p className="tier-up-transition">
                    {previousChampion
                        ? <>You beat <strong>{previousChampion}</strong> and took the PvP belt.</>
                        : <>You took the PvP belt.</>}
                </p>
                <p className="tier-up-hint">Defend it well — the ladder is coming for you.</p>
                <button type="button" className="btn btn-title tier-up-dismiss" onClick={onContinue}>
                    Continue
                </button>
            </div>
        </div>,
        document.body
    );
});

export default PvpBeltOverlay;
