/**
 * consts/tutorialConfig (first-session contract A.7): debut step order, legacy step ids
 * normalised to debut_home, "complete" never a valid /advance target, tip keys.
 * Pure: no DB.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const cfg = require("../../consts/tutorialConfig");
const offerBoardConfig = require("../../consts/offerBoardConfig");

test("STEP_ORDER is the four debut steps then complete", () => {
    assert.deepEqual([...cfg.STEP_ORDER], ["debut_home", "debut_offer", "debut_report", "debut_camp", "complete"]);
    assert.equal(cfg.DEFAULT_STEP, "debut_home");
    assert.equal(cfg.FINAL_STEP, "complete");
    assert.equal(cfg.TUTORIAL_IRON_REWARD, 500);
    assert.ok(Object.isFrozen(cfg.STEP_ORDER));
});

test("normaliseStep: current ids pass, every legacy id and junk maps to debut_home", () => {
    for (const id of cfg.STEP_ORDER) assert.equal(cfg.normaliseStep(id), id);
    assert.equal(cfg.LEGACY_STEP_IDS.length, 9);
    for (const id of cfg.LEGACY_STEP_IDS) assert.equal(cfg.normaliseStep(id), "debut_home", id);
    for (const id of [undefined, null, "", "toString", "__proto__", 3, {}, ["debut_offer"]]) {
        assert.equal(cfg.normaliseStep(id), "debut_home", String(id));
    }
});

test("validateStepAdvance: exactly the next step; complete is never a target", () => {
    assert.equal(cfg.validateStepAdvance("debut_home", "debut_offer"), true);
    assert.equal(cfg.validateStepAdvance("debut_offer", "debut_report"), true);
    assert.equal(cfg.validateStepAdvance("debut_report", "debut_camp"), true);
    assert.equal(cfg.validateStepAdvance("debut_camp", "complete"), false);
    assert.equal(cfg.validateStepAdvance("debut_home", "debut_report"), false, "no skipping");
    assert.equal(cfg.validateStepAdvance("debut_offer", "debut_home"), false, "no going back");
    assert.equal(cfg.validateStepAdvance("debut_home", "debut_home"), false);
});

test("validateStepAdvance: a legacy current step is treated as debut_home", () => {
    assert.equal(cfg.validateStepAdvance("hospital_intro", "debut_offer"), true);
    assert.equal(cfg.validateStepAdvance("profile_intro", "debut_offer"), true);
    assert.equal(cfg.validateStepAdvance("fight_camp", "debut_report"), false);
    // Old ids are never valid targets.
    assert.equal(cfg.validateStepAdvance("debut_home", "gym_intro"), false);
});

test("validateStepAdvance: hostile incoming values are rejected", () => {
    for (const v of [undefined, null, 1, {}, ["debut_offer"], "DEBUT_OFFER", "__proto__"]) {
        assert.equal(cfg.validateStepAdvance("debut_home", v), false, String(v));
    }
});

test("TIP_KEYS = section keys + moment keys, frozen; isTipKey guards hostile input", () => {
    assert.deepEqual([...cfg.SECTION_TIP_KEYS],
        ["camp", "fight", "fightcamp", "weightcut", "rankings", "events", "hospital", "pvp", "moves", "sponsors", "media"]);
    assert.deepEqual([...cfg.MOMENT_TIP_KEYS],
        ["moment_energy_low", "moment_health_low", "moment_first_loss", "moment_first_injury"]);
    assert.deepEqual([...cfg.TIP_KEYS], [...cfg.SECTION_TIP_KEYS, ...cfg.MOMENT_TIP_KEYS]);
    assert.ok(Object.isFrozen(cfg.TIP_KEYS));
    assert.equal(cfg.isTipKey("hospital"), true);
    assert.equal(cfg.isTipKey("moment_first_loss"), true);
    for (const v of ["shop", "", "HOSPITAL", "toString", null, 1, ["camp"], { $ne: null }]) {
        assert.equal(cfg.isTipKey(v), false, String(v));
    }
});

test("DEBUT_OFFER_TYPE has one definition (offerBoardConfig) and a 1.00x purse", () => {
    assert.equal(cfg.DEBUT_OFFER_TYPE, "Debut");
    assert.equal(offerBoardConfig.DEBUT_OFFER_TYPE, "Debut");
    assert.equal(offerBoardConfig.OFFER_PURSE_MULT.Debut, 1.0);
});
