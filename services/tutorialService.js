/**
 * Tutorial service — reads/advances the onboarding walkthrough state stored on
 * the fighter document, and credits the completion reward.
 *
 * See: GnP Onboarding & Tutorial Spec v1.0, sections 3 / 6 / 7.
 */
const Fighter = require("../models/fighterModel");
const {
    DEFAULT_STEP,
    FINAL_STEP,
    TUTORIAL_IRON_REWARD,
    validateStepAdvance,
} = require("../consts/tutorialConfig");

/**
 * Normalise a fighter's tutorial subdocument, tolerating legacy fighters that
 * predate the tutorial field. Mutates and returns the subdoc shape.
 */
function readTutorial(fighter) {
    const t = fighter.tutorial || {};
    return {
        completed: !!t.completed,
        current_step: t.current_step || DEFAULT_STEP,
        started_at: t.started_at || null,
        completed_at: t.completed_at || null,
    };
}

/**
 * GET state — returns the public tutorial state used by the client on login
 * to decide whether to mount the tutorial overlay.
 *
 * @param {string} fighterId
 * @returns {Promise<{completed:boolean,current_step:string}>}
 */
async function getState(fighterId) {
    const fighter = await Fighter.findById(fighterId).select("tutorial");
    if (!fighter) throw new Error("Fighter not found");
    const t = readTutorial(fighter);
    return { completed: t.completed, current_step: t.current_step };
}

/**
 * Advance the tutorial to the next step. Validates that `incomingStep` is
 * exactly one step after the persisted step — prevents clients skipping steps.
 *
 * @param {string} fighterId
 * @param {string} incomingStep
 * @returns {Promise<{completed:boolean,current_step:string}>}
 */
async function advance(fighterId, incomingStep) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const t = readTutorial(fighter);
    if (t.completed) throw new Error("Tutorial already completed");
    if (!incomingStep) throw new Error("Missing step");
    if (!validateStepAdvance(t.current_step, incomingStep)) {
        const err = new Error(`Invalid step transition: ${t.current_step} -> ${incomingStep}`);
        err.code = "TUTORIAL_INVALID_STEP";
        throw err;
    }

    fighter.tutorial = {
        completed: false,
        current_step: incomingStep,
        started_at: t.started_at || new Date(),
        completed_at: null,
    };
    await fighter.save();
    return { completed: false, current_step: incomingStep };
}

/**
 * Complete the tutorial — marks it done, stamps completed_at, and credits the
 * 500-iron signing bonus via the standard iron credit (same as a fight purse).
 *
 * Idempotent: a second call on an already-completed tutorial is a no-op and
 * does NOT re-credit iron.
 *
 * @param {string} fighterId
 * @returns {Promise<{completed:boolean,current_step:string,ironRewarded:number,iron:number}>}
 */
async function complete(fighterId) {
    const fighter = await Fighter.findById(fighterId);
    if (!fighter) throw new Error("Fighter not found");

    const t = readTutorial(fighter);
    if (t.completed) {
        return {
            completed: true,
            current_step: FINAL_STEP,
            ironRewarded: 0,
            iron: fighter.iron || 0,
        };
    }

    // Standard iron credit — no special transaction type (spec 6.2).
    fighter.iron = (fighter.iron || 0) + TUTORIAL_IRON_REWARD;
    fighter.tutorial = {
        completed: true,
        current_step: FINAL_STEP,
        started_at: t.started_at || new Date(),
        completed_at: new Date(),
    };
    await fighter.save();

    return {
        completed: true,
        current_step: FINAL_STEP,
        ironRewarded: TUTORIAL_IRON_REWARD,
        iron: fighter.iron,
    };
}

module.exports = { getState, advance, complete };
