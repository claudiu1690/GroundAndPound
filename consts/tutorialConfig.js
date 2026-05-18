/**
 * Onboarding & Tutorial — server-side configuration.
 *
 * The tutorial is a linear, non-skippable walkthrough that runs on a new
 * player's first login. It is tracked by a `tutorial` subdocument on the
 * fighter (see fighterModel.js). The client drives progression; the server
 * validates the step sequence and credits the completion reward.
 *
 * See: GnP Onboarding & Tutorial Spec v1.0.
 */

/** Ordered list of step identifiers — progression must follow this sequence. */
const STEP_ORDER = [
    "profile_intro",    // Step 1  — Fighter Profile Introduction
    "gym_intro",        // Step 2  — Gym Introduction
    "training_session", // Step 3  — First Training Session
    "fight_offer",      // Step 4  — Fight Offer
    "fight_camp",       // Step 5  — Fight Camp
    "fight_result",     // Step 6  — Fight Result & Fame
    "rankings_intro",   // Step 7  — Rankings Introduction
    "events_intro",     // Step 8  — Events Introduction
    "hospital_intro",   // Step 9  — Hospital Introduction
    "complete",         // Step 10 — Tutorial Complete
];

/** First step a brand-new fighter starts on. */
const DEFAULT_STEP = STEP_ORDER[0];

/** Terminal step id — reaching it means the completion modal is showing. */
const FINAL_STEP = STEP_ORDER[STEP_ORDER.length - 1];

/** Iron credited to the fighter when the tutorial completes (the "Signing Bonus"). */
const TUTORIAL_IRON_REWARD = 500;

/**
 * Validate that `incomingStep` is exactly one step after `currentStep`.
 * Rejects arbitrary / out-of-order step ids so a client cannot skip ahead.
 *
 * @param {string} currentStep  the fighter's persisted current_step
 * @param {string} incomingStep the step the client is trying to advance to
 * @returns {boolean}
 */
function validateStepAdvance(currentStep, incomingStep) {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const incomingIndex = STEP_ORDER.indexOf(incomingStep);
    if (currentIndex === -1 || incomingIndex === -1) return false;
    return incomingIndex === currentIndex + 1;
}

module.exports = {
    STEP_ORDER,
    DEFAULT_STEP,
    FINAL_STEP,
    TUTORIAL_IRON_REWARD,
    validateStepAdvance,
};
