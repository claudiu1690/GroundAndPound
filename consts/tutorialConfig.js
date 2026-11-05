/**
 * First-session flow (onboarding v2): server-side configuration.
 * Contract: docs/first-session-contract.md A.7. Spec: docs/first-session-spec.md.
 *
 * The guided onboarding is now the debut flow: Home hero, the single Debut offer, the
 * Fighter Report and the Fight Camp. It is tracked by the `tutorial` subdocument on the
 * fighter (see fighterModel.js). The client advances through the debut steps; the server
 * validates the sequence. The final step ("complete") is NEVER reached through
 * /advance: the first PvE resolve sets it (fightService), or POST /complete ("End tutorial").
 *
 * After the debut, each section teaches itself once through section tips and moment tips
 * (TIP_KEYS), recorded on `tutorial.tipsSeen`.
 */
const { DEBUT_OFFER_TYPE } = require("./offerBoardConfig");

/** Ordered list of step identifiers; progression must follow this sequence. */
const STEP_ORDER = Object.freeze([
    "debut_home",   // 1 Home hero: "Your debut is booked"
    "debut_offer",  // 2 the single Debut offer on the board
    "debut_report", // 3 Fighter Report with the Coach's pick
    "debut_camp",   // 4 Fight Camp + weight cut, until Begin Fight
    "complete",     // set by the first PvE resolve or by End tutorial, never by /advance
]);

/**
 * Step ids of the v1 nine-step tour. Persisted on legacy fighters as
 * `tutorial.current_step`; the boot migration rewrites them, and normaliseStep maps any
 * straggler to DEFAULT_STEP so nobody is stranded.
 */
const LEGACY_STEP_IDS = Object.freeze([
    "profile_intro", "gym_intro", "training_session", "fight_offer", "fight_camp",
    "fight_result", "rankings_intro", "events_intro", "hospital_intro",
]);

/** First step a brand-new fighter starts on. */
const DEFAULT_STEP = "debut_home";

/** Terminal step id. */
const FINAL_STEP = "complete";

/** Iron credited once per fighter as the signing bonus (paid in the first PvE resolve). */
const TUTORIAL_IRON_REWARD = 500;

/** Section tips: one short sequence the first time the player opens each section. */
const SECTION_TIP_KEYS = Object.freeze([
    "camp", "fight", "fightcamp", "weightcut", "rankings", "events", "hospital",
    "pvp", "moves", "sponsors", "media",
]);

/** Moment tips: one tip the first time a screenless mechanic happens. */
const MOMENT_TIP_KEYS = Object.freeze([
    "moment_energy_low", "moment_health_low", "moment_first_loss", "moment_first_injury",
]);

/** Every key POST /tutorial/:fighterId/tips/seen accepts. */
const TIP_KEYS = Object.freeze([...SECTION_TIP_KEYS, ...MOMENT_TIP_KEYS]);

/**
 * Map any persisted step id to a current one. Current ids pass through; legacy and
 * unknown ids (and empty values) map to DEFAULT_STEP.
 * @param {*} id
 * @returns {string}
 */
function normaliseStep(id) {
    if (typeof id === "string" && STEP_ORDER.includes(id)) return id;
    return DEFAULT_STEP;
}

/**
 * Validate that `incomingStep` is exactly one step after `currentStep` (normalised).
 * "complete" is never a valid advance target: only the resolve or /complete set it.
 *
 * @param {string} currentStep  the fighter's persisted current_step (may be legacy)
 * @param {string} incomingStep the step the client is trying to advance to
 * @returns {boolean}
 */
function validateStepAdvance(currentStep, incomingStep) {
    if (typeof incomingStep !== "string" || incomingStep === FINAL_STEP) return false;
    const currentIndex = STEP_ORDER.indexOf(normaliseStep(currentStep));
    const incomingIndex = STEP_ORDER.indexOf(incomingStep);
    if (currentIndex === -1 || incomingIndex === -1) return false;
    return incomingIndex === currentIndex + 1;
}

/** @param {*} key @returns {boolean} */
function isTipKey(key) {
    return typeof key === "string" && TIP_KEYS.includes(key);
}

module.exports = {
    STEP_ORDER,
    LEGACY_STEP_IDS,
    DEFAULT_STEP,
    FINAL_STEP,
    TUTORIAL_IRON_REWARD,
    SECTION_TIP_KEYS,
    MOMENT_TIP_KEYS,
    TIP_KEYS,
    DEBUT_OFFER_TYPE,
    normaliseStep,
    validateStepAdvance,
    isTipKey,
};
