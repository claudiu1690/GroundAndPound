/**
 * Tutorial service: reads and advances the first-session (debut) flow state stored on the
 * fighter's `tutorial` subdocument, and records seen section / moment tips.
 *
 * Contract: docs/first-session-contract.md A.7 and B.1.
 *
 * Every write is an atomic Fighter.updateOne on `tutorial.*` dotted paths, never a
 * whole-document save(): the advance and the fight resolve run concurrently on Begin Fight,
 * and a load-modify-save here could revert the resolve's `tutorial.completed` or clobber
 * `iron` (contract G.3). The $500 signing bonus is NOT paid here any more; the first PvE
 * resolve pays it (fightService.resolveFightAndApply).
 */
const Fighter = require("../models/fighterModel");
const {
    FINAL_STEP,
    normaliseStep,
    validateStepAdvance,
    isTipKey,
} = require("../consts/tutorialConfig");

/**
 * Public tutorial state (GET /tutorial/:fighterId, POST .../advance).
 * @typedef {Object} TutorialState
 * @property {boolean} completed
 * @property {"debut_home"|"debut_offer"|"debut_report"|"debut_camp"|"complete"} current_step
 * @property {2} version
 * @property {string[]} tipsSeen  section and moment tip keys already shown (TIP_KEYS)
 */

function notFound() {
    return new Error("Fighter not found");
}

/**
 * Normalise a fighter's tutorial subdocument (hydrated or lean), tolerating legacy docs.
 * A completed tutorial always reports "complete"; otherwise legacy / unknown step ids map
 * to the first debut step.
 * @returns {{completed:boolean,current_step:string,started_at:?Date,completed_at:?Date,tipsSeen:string[]}}
 */
function readTutorial(fighter) {
    const t = (fighter && fighter.tutorial) || {};
    const completed = !!t.completed;
    return {
        completed,
        current_step: completed ? FINAL_STEP : normaliseStep(t.current_step),
        started_at: t.started_at || null,
        completed_at: t.completed_at || null,
        tipsSeen: Array.isArray(t.tipsSeen) ? t.tipsSeen.filter((k) => typeof k === "string") : [],
    };
}

/** @returns {TutorialState} */
function toState(fighter) {
    const t = readTutorial(fighter);
    return { completed: t.completed, current_step: t.current_step, version: 2, tipsSeen: t.tipsSeen };
}

async function loadTutorial(fighterId) {
    const doc = await Fighter.findById(fighterId).select("tutorial iron").lean();
    if (!doc) throw notFound();
    return doc;
}

/**
 * GET state: the client reads it on login to decide whether to mount the debut overlay.
 * @param {string} fighterId
 * @returns {Promise<TutorialState>}
 */
async function getState(fighterId) {
    return toState(await loadTutorial(fighterId));
}

/**
 * Advance to the next debut step. `incomingStep` must be exactly the next STEP_ORDER entry
 * after the (normalised) persisted step; "complete" is rejected (the resolve or /complete
 * sets it).
 *
 * @param {string} fighterId
 * @param {*} incomingStep
 * @returns {Promise<TutorialState>}
 */
async function advance(fighterId, incomingStep) {
    const doc = await loadTutorial(fighterId);
    const t = readTutorial(doc);
    if (t.completed) throw new Error("Tutorial already completed");
    if (incomingStep === undefined || incomingStep === null || incomingStep === "") throw new Error("Missing step");
    if (!validateStepAdvance(t.current_step, incomingStep)) {
        const shown = typeof incomingStep === "string" ? incomingStep.slice(0, 40) : typeof incomingStep;
        const err = new Error(`Invalid step transition: ${t.current_step} -> ${shown}`);
        err.code = "TUTORIAL_INVALID_STEP";
        throw err;
    }

    const res = await Fighter.updateOne(
        { _id: fighterId, "tutorial.completed": { $ne: true } },
        { $set: { "tutorial.current_step": incomingStep, "tutorial.started_at": t.started_at || new Date() } }
    );
    if (!res || res.matchedCount === 0) {
        // Either the fighter vanished or the resolve / End tutorial completed it meanwhile.
        const after = await Fighter.findById(fighterId).select("tutorial").lean();
        if (!after) throw notFound();
        throw new Error("Tutorial already completed");
    }
    return toState(await loadTutorial(fighterId));
}

/**
 * Complete the tutorial ("End tutorial"). Marks it done and stamps completed_at; credits
 * NOTHING (the signing bonus is paid by the first PvE resolve). Idempotent.
 *
 * @param {string} fighterId
 * @returns {Promise<{completed:true,current_step:"complete",ironRewarded:0,iron:number}>}
 */
async function complete(fighterId) {
    // No match = already completed (idempotent) or no such fighter (loadTutorial 404s).
    await Fighter.updateOne(
        { _id: fighterId, "tutorial.completed": { $ne: true } },
        { $set: { "tutorial.completed": true, "tutorial.current_step": FINAL_STEP, "tutorial.completed_at": new Date() } }
    );
    const doc = await loadTutorial(fighterId);
    return { completed: true, current_step: FINAL_STEP, ironRewarded: 0, iron: doc.iron || 0 };
}

/**
 * Record a section or moment tip as seen. `key` must be one of TIP_KEYS.
 *
 * @param {string} fighterId
 * @param {*} key
 * @returns {Promise<{tipsSeen:string[]}>}
 */
async function markTipSeen(fighterId, key) {
    if (!isTipKey(key)) {
        const err = new Error("Invalid tip key");
        err.code = "INVALID_TIP_KEY";
        throw err;
    }
    const res = await Fighter.updateOne({ _id: fighterId }, { $addToSet: { "tutorial.tipsSeen": key } });
    if (!res || res.matchedCount === 0) throw notFound();
    const doc = await loadTutorial(fighterId);
    return { tipsSeen: readTutorial(doc).tipsSeen };
}

module.exports = { getState, advance, complete, markTipSeen, readTutorial };
