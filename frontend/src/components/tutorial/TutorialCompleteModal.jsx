import { useState } from "react";
import { TUTORIAL_COMPLETE } from "../../constants/tutorialSteps";
import { t } from "../../lib/i18n";

/**
 * Step 8 — Tutorial Complete.
 *
 * Full-screen completion modal shown over the (now fully visible) game UI.
 * The CTA marks the tutorial complete server-side, credits the 500-iron
 * signing bonus, and releases the player into the full game.
 */
export function TutorialCompleteModal({ onConfirm }) {
    const [submitting, setSubmitting] = useState(false);
    const c = TUTORIAL_COMPLETE;

    async function handleConfirm() {
        if (submitting) return;
        setSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="tut-complete-root" role="dialog" aria-modal="true">
            <div className="tut-complete-card">
                <h1 className="tut-complete-headline">{t("tutorial.complete.headline")}</h1>
                <p className="tut-complete-sub">{t("tutorial.complete.subheadline")}</p>

                <div className="tut-complete-reward">
                    <span className="tut-complete-reward-icon">$</span>
                    <span className="tut-complete-reward-amount">+{c.rewardIron}</span>
                    <span className="tut-complete-reward-label">{t("tutorial.complete.rewardLabel")}</span>
                </div>

                <p className="tut-complete-body">{t("tutorial.complete.body")}</p>

                <button
                    type="button"
                    className="tut-complete-cta"
                    onClick={handleConfirm}
                    disabled={submitting}
                >
                    {submitting ? t("tutorial.complete.entering") : t("tutorial.complete.cta")}
                </button>
            </div>
        </div>
    );
}

export default TutorialCompleteModal;
