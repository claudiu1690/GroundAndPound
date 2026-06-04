import { memo, useCallback, useState } from "react";
import { ClipboardList, Flame } from "lucide-react";
import { api } from "../../api";

/**
 * This week's contracts — daily + weekly PvP objectives with progress bars
 * (contract §3.1 hub.contracts, claim via §3.3 POST /pvp/contracts/:id/claim).
 *
 * Claim is optimistic (the row marks itself claimed immediately) then the parent
 * refetches the hub via `onClaimed()` so fame/identity stay authoritative. If the
 * claim fails the optimistic flag is rolled back.
 *
 * Each contract: { id, label, goal, progress, claimed, claimable, reward:{fame} }
 * Container: { daily:[...], weekly:[...], daily_resets_at, weekly_resets_at }
 *
 * Props: contracts (object | undefined), onClaimed(), onMessage(msg)
 */

function resetCountdown(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return null;
    const hours = Math.floor(ms / 3_600_000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d`;
    if (hours >= 1) return `${hours}h`;
    return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

function ContractRow({ contract, claimingId, optimisticClaimed, onClaim }) {
    const goal = contract.goal ?? 0;
    const progress = Math.min(contract.progress ?? 0, goal || (contract.progress ?? 0));
    const pct = goal > 0 ? Math.min(100, Math.round((progress / goal) * 100)) : 0;
    const claimed = !!contract.claimed || optimisticClaimed.has(contract.id);
    const claimable = !claimed && contract.claimable === true;
    const isClaiming = claimingId === contract.id;
    const fame = contract.reward?.fame;

    return (
        <div className={`pvp-contract${claimed ? " pvp-contract--done" : ""}`}>
            <div className="pvp-contract-top">
                <span className="pvp-contract-label">{contract.label || "Objective"}</span>
                {fame != null && (
                    <span className="pvp-contract-reward"><Flame size={10} /> {fame}</span>
                )}
            </div>
            <div className="pvp-contract-bar-row">
                <span className="pvp-contract-bar">
                    <span
                        className={`pvp-contract-fill${claimed ? " pvp-contract-fill--done" : ""}`}
                        style={{ width: `${claimed ? 100 : pct}%` }}
                    />
                </span>
                <span className="pvp-contract-count">{progress}/{goal || "—"}</span>
            </div>
            <div className="pvp-contract-foot">
                {claimed ? (
                    <span className="pvp-contract-claimed">✓ Claimed</span>
                ) : claimable ? (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm pvp-contract-claim"
                        onClick={() => onClaim(contract)}
                        disabled={isClaiming}
                    >
                        {isClaiming ? "Claiming…" : "Claim"}
                    </button>
                ) : (
                    <span className="pvp-contract-progressing">In progress</span>
                )}
            </div>
        </div>
    );
}

export const PvpContracts = memo(function PvpContracts({ contracts, onClaimed, onMessage }) {
    const [claimingId, setClaimingId] = useState(null);
    const [optimisticClaimed, setOptimisticClaimed] = useState(() => new Set());

    const daily = Array.isArray(contracts?.daily) ? contracts.daily : [];
    const weekly = Array.isArray(contracts?.weekly) ? contracts.weekly : [];
    const dailyReset = resetCountdown(contracts?.daily_resets_at);
    const weeklyReset = resetCountdown(contracts?.weekly_resets_at);

    const handleClaim = useCallback(async (contract) => {
        if (claimingId) return;
        setClaimingId(contract.id);
        // Optimistic: flag as claimed immediately.
        setOptimisticClaimed((prev) => new Set(prev).add(contract.id));
        try {
            await api.claimPvpContract(contract.id);
            onMessage?.(`Contract claimed${contract.reward?.fame != null ? ` — +${contract.reward.fame} fame` : ""}.`);
            // Refetch the hub for authoritative identity/contract state.
            onClaimed?.();
        } catch (e) {
            // Roll back the optimistic flag.
            setOptimisticClaimed((prev) => {
                const next = new Set(prev);
                next.delete(contract.id);
                return next;
            });
            onMessage?.(e?.message || "Couldn't claim that contract.");
        } finally {
            setClaimingId(null);
        }
    }, [claimingId, onClaimed, onMessage]);

    const hasAny = daily.length > 0 || weekly.length > 0;

    return (
        <section className="pvp-yard-module pvp-contracts">
            <header className="pvp-yard-module-head">
                <span className="pvp-yard-module-title">
                    <ClipboardList size={13} /> Contracts
                </span>
                <span className="pvp-yard-module-sub">Objectives, capped fame</span>
            </header>

            {!hasAny ? (
                <div className="pvp-yard-empty">No active contracts. Check back after the next reset.</div>
            ) : (
                <div className="pvp-contracts-body">
                    {daily.length > 0 && (
                        <div className="pvp-contract-group">
                            <div className="pvp-contract-group-head">
                                <span>Daily</span>
                                {dailyReset && <span className="pvp-contract-reset">resets in {dailyReset}</span>}
                            </div>
                            {daily.map((c) => (
                                <ContractRow
                                    key={c.id}
                                    contract={c}
                                    claimingId={claimingId}
                                    optimisticClaimed={optimisticClaimed}
                                    onClaim={handleClaim}
                                />
                            ))}
                        </div>
                    )}
                    {weekly.length > 0 && (
                        <div className="pvp-contract-group">
                            <div className="pvp-contract-group-head">
                                <span>Weekly</span>
                                {weeklyReset && <span className="pvp-contract-reset">resets in {weeklyReset}</span>}
                            </div>
                            {weekly.map((c) => (
                                <ContractRow
                                    key={c.id}
                                    contract={c}
                                    claimingId={claimingId}
                                    optimisticClaimed={optimisticClaimed}
                                    onClaim={handleClaim}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
});

export default PvpContracts;
