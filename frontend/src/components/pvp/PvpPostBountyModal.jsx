import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Target, Coins, Flame } from "lucide-react";
import { api } from "../../api";

/**
 * Post-bounty form (contract §7.2 / §7.7). Put real iron on a target's head.
 *
 * Amount: slider min 250 → max = the target-tier purse (1× signingFee), clamped
 * to the poster's wallet. Method requirement: Any / KO / Submission / Decision.
 * Escrow + burn preview: "You pay 1000 → 100 burned, 900 to the bounty" (10%
 * post-burn per §7.2: escrow = round(amount × 0.9)).
 *
 * Submit → postPvpBounty, mapping err.code to a player-facing message:
 *   bounty_below_min / bounty_above_max / insufficient_iron /
 *   bounty_duplicate / bounty_self / target_not_attackable / bounty_forbidden /
 *   fighter_not_found.
 *
 * Props:
 *   target   { fighterId, name, ovr, style, signingFee?, max_bounty?, tier? }
 *   playerIron  (number) — poster's current iron
 *   onClose  () => void
 *   onPosted (response) => void  — bounty created; parent refreshes board + fighter
 */

const MIN_BOUNTY = 250;
const POST_BURN_RATE = 0.1; // 10% burned on posting → 90% escrow

const METHODS = [
    { key: "any", label: "Any", hint: "Any win collects" },
    { key: "KO", label: "KO/TKO", hint: "Must finish by strikes" },
    { key: "Submission", label: "Submission", hint: "Must finish by sub" },
    { key: "Decision", label: "Decision", hint: "Must win on the cards" },
];

const ERROR_CODE_MESSAGES = {
    bounty_below_min: `Minimum bounty is ${MIN_BOUNTY} iron.`,
    bounty_above_max: "That's above the cap for this target's tier.",
    insufficient_iron: "You don't have enough iron for that bounty.",
    bounty_duplicate: "You already have an open bounty on this fighter.",
    bounty_self: "You can't post a bounty on yourself.",
    target_not_attackable: "This fighter can't be targeted right now.",
    bounty_forbidden: "You can't post a bounty on this fighter.",
    fighter_not_found: "That fighter could not be found.",
};

function resolveBountyError(err) {
    const code = err?.code;
    if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];
    return err?.message || "Couldn't post the bounty. Try again.";
}

export const PvpPostBountyModal = memo(function PvpPostBountyModal({ target, playerIron = 0, onClose, onPosted }) {
    // Target-tier purse cap (1× signingFee). Tolerant of field names; falls back
    // to a sane default so the slider is never broken if the field is missing.
    const tierMax = Number(
        target?.max_bounty
        ?? target?.signingFee
        ?? target?.signing_fee
        ?? target?.tier_purse
        ?? 1000
    ) || 1000;

    // The most the poster can actually post: the lower of the tier cap and wallet.
    const walletCap = Math.max(0, Math.floor(Number(playerIron) || 0));
    const effectiveMax = Math.max(MIN_BOUNTY, Math.min(tierMax, walletCap || tierMax));
    const canAfford = walletCap >= MIN_BOUNTY;

    const [amount, setAmount] = useState(MIN_BOUNTY);
    const [method, setMethod] = useState("any");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Initialise the amount to the min (or the affordable max if below min).
    useEffect(() => {
        setAmount(Math.min(Math.max(MIN_BOUNTY, MIN_BOUNTY), effectiveMax));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.fighterId]);

    // Close on Escape.
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape" && !submitting) onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, submitting]);

    // Escrow + burn math (client mirror; the server is authoritative on settle).
    const preview = useMemo(() => {
        const pay = Math.round(amount) || 0;
        const escrow = Math.round(pay * (1 - POST_BURN_RATE));
        const burned = pay - escrow;
        return { pay, escrow, burned };
    }, [amount]);

    const amountValid = preview.pay >= MIN_BOUNTY && preview.pay <= tierMax && preview.pay <= walletCap;

    let hint = "";
    if (!canAfford) {
        hint = `You need at least ${MIN_BOUNTY} iron to post a bounty. You have ${walletCap.toLocaleString()}.`;
    } else if (preview.pay < MIN_BOUNTY) {
        hint = `Below the ${MIN_BOUNTY} iron minimum.`;
    } else if (preview.pay > tierMax) {
        hint = `Above the ${tierMax.toLocaleString()} iron cap for this tier.`;
    } else if (preview.pay > walletCap) {
        hint = `Only ${walletCap.toLocaleString()} iron available.`;
    }

    const submit = useCallback(async () => {
        if (submitting || !amountValid || !target?.fighterId) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await api.postPvpBounty({
                target_id: target.fighterId,
                amount: Math.round(amount),
                method_required: method,
            });
            onPosted?.(res);
        } catch (e) {
            setError(resolveBountyError(e));
        } finally {
            setSubmitting(false);
        }
    }, [submitting, amountValid, target?.fighterId, amount, method, onPosted]);

    const setPct = (pct) => () => {
        const next = Math.max(MIN_BOUNTY, Math.min(effectiveMax, Math.round(effectiveMax * pct)));
        setAmount(next);
    };

    return createPortal(
        <div className="pvp-flow-overlay" role="dialog" aria-modal="true" aria-label="Post a bounty">
            <div className="pvp-flow-card pvp-bounty-modal">
                <div className="pvp-flow-header">
                    <span className="pvp-tape-eyebrow pvp-tape-eyebrow--grudge">
                        <Target size={12} /> POST A BOUNTY
                    </span>
                    <button type="button" className="fr-close" onClick={onClose} disabled={submitting} title="Cancel">&times;</button>
                </div>

                <div className="pvp-bounty-target">
                    <div className="pvp-bounty-target-name">{target?.name || "Unknown fighter"}</div>
                    <div className="pvp-bounty-target-meta">
                        {target?.style && <span className="pvp-pill">{target.style}</span>}
                        {target?.ovr != null && <span className="pvp-pill">{target.ovr} OVR</span>}
                    </div>
                    <p className="pvp-bounty-target-blurb">
                        Anyone who beats them in-bracket collects the escrow. Iron leaves your wallet now.
                    </p>
                </div>

                {/* Amount */}
                <div className="pvp-bounty-field">
                    <div className="pvp-bounty-field-head">
                        <span className="pvp-bounty-field-label"><Coins size={11} /> Bounty amount</span>
                        <span className="pvp-bounty-amount-val">{preview.pay.toLocaleString()} iron</span>
                    </div>
                    <input
                        type="range"
                        className="pvp-bounty-slider"
                        min={MIN_BOUNTY}
                        max={effectiveMax}
                        step={10}
                        value={Math.min(amount, effectiveMax)}
                        onChange={(e) => setAmount(parseInt(e.target.value, 10))}
                        disabled={!canAfford || submitting}
                        aria-label="Bounty amount"
                    />
                    <div className="pvp-bounty-slider-scale">
                        <span>{MIN_BOUNTY}</span>
                        <span>max {effectiveMax.toLocaleString()}</span>
                    </div>
                    <div className="pvp-bounty-chips">
                        <button type="button" onClick={() => setAmount(MIN_BOUNTY)} disabled={!canAfford || submitting}>Min</button>
                        <button type="button" onClick={setPct(0.25)} disabled={!canAfford || submitting}>25%</button>
                        <button type="button" onClick={setPct(0.5)} disabled={!canAfford || submitting}>50%</button>
                        <button type="button" onClick={setPct(1)} disabled={!canAfford || submitting}>Max</button>
                    </div>
                </div>

                {/* Method requirement */}
                <div className="pvp-bounty-field">
                    <span className="pvp-bounty-field-label">Method requirement</span>
                    <div className="pvp-bounty-methods">
                        {METHODS.map((m) => (
                            <button
                                key={m.key}
                                type="button"
                                className={`pvp-bounty-method${method === m.key ? " selected" : ""}`}
                                onClick={() => setMethod(m.key)}
                                disabled={submitting}
                                title={m.hint}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Escrow + burn preview */}
                <div className="pvp-bounty-preview">
                    <div className="pvp-bounty-preview-row">
                        <span>You pay</span>
                        <strong className="pvp-bounty-preview-pay">{preview.pay.toLocaleString()}</strong>
                    </div>
                    <div className="pvp-bounty-preview-arrow">→</div>
                    <div className="pvp-bounty-preview-split">
                        <span className="pvp-bounty-preview-burn">
                            <Flame size={10} /> {preview.burned.toLocaleString()} burned
                        </span>
                        <span className="pvp-bounty-preview-escrow">
                            <Coins size={10} /> {preview.escrow.toLocaleString()} to the bounty
                        </span>
                    </div>
                </div>

                {hint && <div className="pvp-bounty-hint">{hint}</div>}
                {error && <div className="pvp-error">{error}</div>}

                <div className="pvp-flow-actions">
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={submit}
                        disabled={!amountValid || submitting}
                    >
                        {submitting ? "Posting…" : `Post · ${preview.pay.toLocaleString()} iron`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default PvpPostBountyModal;
