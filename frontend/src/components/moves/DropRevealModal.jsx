import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, ArrowUpCircle } from "lucide-react";
import { MoveArt } from "./MoveArt";
import { RarityPips } from "./RarityPips";
import { RARITY_LABELS, RARITY_COLORS, rarityIndex } from "../../constants/specialMovesCatalog";
import { t } from "@/lib/i18n";

/**
 * Themed rising-ember/sparkle field around the revealed card. Deterministic
 * (index-derived) positions/timings — no per-render randomness — so the effect
 * is stable across re-renders. Count scales with rarity: a Legendary pull
 * throws off noticeably more sparks than a Common.
 */
const SPARKS = Array.from({ length: 22 }, (_, i) => ({
    x: (i * 41) % 100,
    size: 4 + (i % 3) * 3,
    delay: (i % 11) * 0.26,
    dur: 2.4 + (i % 5) * 0.55,
    drift: ((i % 5) - 2) * 16,
}));
const SPARK_COUNT = [10, 14, 18, 22]; // by rarity index: Common → Legendary

/**
 * The drop-reveal payoff — shown when a sparring session's response carries
 * `moveDrop`. Only handles NEW and UPGRADE (the tall-card moments); DUPLICATE
 * is intentionally NOT rendered here — the caller (App.jsx) surfaces it as a
 * compact cash toast instead (see TrainingToast's "moveDupe" kind), per spec:
 * "a compact cash toast/line, NOT a big card."
 *
 * Reveal flow: the card arrives FACE-DOWN (card back). Clicking it flips it
 * (3D rotateY) to expose the art, then the name / rarity / effect text stage
 * in below. Nothing about the move (name, rarity, art) is shown pre-flip so
 * the flip is a genuine reveal moment.
 */
export function DropRevealModal({ drop, onClose }) {
    const [flipped, setFlipped] = useState(false);

    // Re-arm the face-down state for every new drop.
    useEffect(() => { setFlipped(false); }, [drop]);

    useEffect(() => {
        if (!drop) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [drop, onClose]);

    if (!drop || drop.outcome === "DUPLICATE") return null;

    const isUpgrade = drop.outcome === "UPGRADE";
    // Phase 2 (F5): a coach's rank-up teach channel reuses this same modal
    // (contract §6.1) — `source:"coach"` (set by CampTab#handlePromote before
    // calling onMoveDropReveal) swaps only the eyebrow copy so a coach-taught
    // move doesn't read like a sparring-session drop.
    const fromCoach = drop.source === "coach";
    const shownRarity = isUpgrade ? drop.toRarity : drop.rarity;
    const rarityColor = RARITY_COLORS[shownRarity] || RARITY_COLORS.COMMON;
    const sparkCount = SPARK_COUNT[Math.max(0, rarityIndex(shownRarity))] || SPARK_COUNT[0];

    return createPortal(
        <div className="drop-reveal-root" role="dialog" aria-modal="true" aria-label={t("moves.dropReveal.dialogLabel")}>
            <div className="drop-reveal-backdrop" onClick={onClose} />
            <div className={`drop-reveal-shell${isUpgrade ? " drop-reveal-shell--upgrade" : " drop-reveal-shell--new"}${flipped ? " is-revealed" : ""}`}>
                <button type="button" className="drop-reveal-close" onClick={onClose} aria-label={t("moves.dropReveal.closeLabel")}>
                    <X size={18} />
                </button>

                <div className="drop-reveal-eyebrow">
                    {isUpgrade ? (
                        <><ArrowUpCircle size={14} /> {t(fromCoach ? "moves.dropReveal.coachUpgradeEyebrow" : "moves.dropReveal.upgradeEyebrow")}</>
                    ) : (
                        <><Sparkles size={14} /> {t(fromCoach ? "moves.dropReveal.coachNewEyebrow" : "moves.dropReveal.newEyebrow")}</>
                    )}
                </div>

                {/* Card stage — holds the rarity aura, the flip card, and (post-reveal)
                    the themed sparkle field. Rarity color flows via --rarity-color. */}
                <div className="drop-stage" style={{ "--rarity-color": rarityColor }}>
                    <div className={`drop-aura${flipped ? " is-live" : ""}`} aria-hidden="true" />

                    {/* Face-down → click → 3D flip. The front face carries the real art. */}
                    <button
                        type="button"
                        className={`drop-flip${flipped ? " is-flipped" : ""}`}
                        onClick={() => setFlipped(true)}
                        disabled={flipped}
                        aria-label={flipped ? drop.name : t("moves.dropReveal.revealLabel")}
                    >
                        <div className="drop-flip-inner">
                            <div className="drop-flip-face drop-flip-face--back" aria-hidden="true">
                                <div className="drop-cardback">
                                    <div className="drop-cardback-logo">
                                        <span className="drop-cardback-word">Ground</span>
                                        <span className="drop-cardback-mid">
                                            <i /><span className="drop-cardback-amp">&amp;</span><i />
                                        </span>
                                        <span className="drop-cardback-word">Pound</span>
                                    </div>
                                </div>
                            </div>
                            <div className="drop-flip-face drop-flip-face--front">
                                <MoveArt art={drop.art} rarity={shownRarity} size="tall" />
                                <span className="drop-flip-shine" aria-hidden="true" />
                            </div>
                        </div>
                    </button>

                    {flipped && (
                        <div className="drop-sparkles" aria-hidden="true">
                            {SPARKS.slice(0, sparkCount).map((s, i) => (
                                <span
                                    key={i}
                                    className="drop-spark"
                                    style={{
                                        left: `${s.x}%`,
                                        "--size": `${s.size}px`,
                                        "--delay": `${s.delay}s`,
                                        "--dur": `${s.dur}s`,
                                        "--drift": `${s.drift}px`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {!flipped && <div className="drop-reveal-hint">{t("moves.dropReveal.tapToReveal")}</div>}

                {flipped && (
                    <div className="drop-reveal-info">
                        {isUpgrade && (
                            <div className="drop-reveal-rarity-transition">
                                <span className="drop-reveal-rarity-chip" data-rarity={drop.fromRarity}>
                                    {RARITY_LABELS[drop.fromRarity] || drop.fromRarity}
                                </span>
                                <span className="drop-reveal-rarity-arrow">→</span>
                                <span className="drop-reveal-rarity-chip drop-reveal-rarity-chip--to" data-rarity={drop.toRarity}>
                                    {RARITY_LABELS[drop.toRarity] || drop.toRarity}
                                </span>
                            </div>
                        )}

                        <div className="drop-reveal-name">{drop.name}</div>
                        {!isUpgrade && (
                            <span className="drop-reveal-rarity-chip drop-reveal-rarity-chip--solo" data-rarity={drop.rarity}>
                                {RARITY_LABELS[drop.rarity] || drop.rarity}
                            </span>
                        )}
                        <RarityPips rarity={shownRarity} />

                        {drop.description && <p className="drop-reveal-desc">{drop.description}</p>}
                        {drop.flavor && <p className="drop-reveal-flavor">“{drop.flavor}”</p>}

                        <button type="button" className="btn btn-primary drop-reveal-cta" onClick={onClose}>
                            {t("moves.dropReveal.cta")}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
