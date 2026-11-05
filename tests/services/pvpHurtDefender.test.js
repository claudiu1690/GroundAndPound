/**
 * Hurt-defender protection (v2.4, owner 2026-11-05: "move pvp to new damage and protect the
 * defenders at 50% health").
 *
 * A defender under DEFENDER_MIN_HEALTH (after passive regen) cannot be challenged: the fight is
 * refused with `defender_hurt`, the opponent list flags them (`isHurt` + `hurtUntil`), and bots skip
 * them. Models and Redis are stubbed in memory; no database.
 */
const assert = require("node:assert");
const { test } = require("node:test");

// Redis is destructured at require time by pvpFightService, so stub it before that require.
const redisLib = require("../../lib/redis");
redisLib.ensureRedisConnected = async () => {};
redisLib.redis.set = async () => "OK";
redisLib.redis.del = async () => 1;

const mongoose = require("mongoose");
const Fighter = require("../../models/fighterModel");
const Season = require("../../models/seasonModel");
const PVPRecord = require("../../models/pvpRecordModel");
const PVPFight = require("../../models/pvpFightModel");
const energyService = require("../../services/energyService");
const pvpRecordService = require("../../services/pvpRecordService");
const pvpMatchmakingService = require("../../services/pvpMatchmakingService");
const pvpBotService = require("../../services/pvpBotService");
const pvpFightService = require("../../services/pvpFightService");
const { DEFENDER_MIN_HEALTH } = require("../../consts/pvpConfig");

const MIN = 60 * 1000;
const REGEN_MS = 5 * MIN; // +1 health per 5 minutes (fighterService)

function stub(obj, key, value) {
    const real = obj[key];
    obj[key] = value;
    return () => { obj[key] = real; };
}

test("the threshold is 50 health", () => {
    assert.strictEqual(DEFENDER_MIN_HEALTH, 50);
});

test("hurtState: under 50 after regen is hurt, with the time regen brings them back to 50", () => {
    const now = Date.now();
    const { hurtState } = pvpMatchmakingService;
    const h = hurtState({ health: 40, healthLastRegenAt: new Date(now) }, now);
    assert.strictEqual(h.isHurt, true);
    // 10 points at 5 minutes each.
    const until = new Date(h.hurtUntil).getTime();
    assert.ok(Math.abs(until - (now + 10 * REGEN_MS)) < 2000, `hurtUntil ${h.hurtUntil}`);
    // 45 health, last regen 30 minutes ago: +6 makes 51, no longer hurt.
    assert.deepStrictEqual(hurtState({ health: 45, healthLastRegenAt: new Date(now - 30 * MIN) }, now), { isHurt: false, hurtUntil: null });
    // Exactly 50 is not hurt; no health field is treated as full.
    assert.strictEqual(hurtState({ health: 50, healthLastRegenAt: new Date(now) }, now).isHurt, false);
    assert.strictEqual(hurtState({}, now).isHurt, false);
    assert.strictEqual(hurtState(null, now).isHurt, false);
});

test("bots never pick a hurt defender", async () => {
    const pool = [
        { playerId: "a", isHurt: true },
        { playerId: "b", isHurt: false },
        { playerId: "c", isRecovering: true },
    ];
    const restore = [
        stub(pvpMatchmakingService, "getOpponents", async () => pool),
        stub(PVPFight, "distinct", async () => []),
    ];
    try {
        for (const r of [0, 0.4, 0.99]) {
            const pick = await pvpBotService.selectDefender({ _id: "bot" }, {}, {}, () => r);
            assert.strictEqual(pick.playerId, "b");
        }
        pool[1].isHurt = true;
        assert.strictEqual(await pvpBotService.selectDefender({ _id: "bot" }, {}, {}, () => 0), null);
    } finally {
        restore.forEach((f) => f());
    }
});

/** Run the real resolve up to the step after the defender checks. */
async function challenge(defenderHealth, lastRegenMinutesAgo) {
    const attackerId = new mongoose.Types.ObjectId();
    const defenderId = new mongoose.Types.ObjectId();
    const seasonId = new mongoose.Types.ObjectId();
    const now = Date.now();
    const attacker = { _id: attackerId, health: 100, injuries: [], pvpOnboarding: { unlocked: true, placementComplete: true }, markModified() {} };
    const defender = {
        _id: defenderId, health: defenderHealth, healthLastRegenAt: new Date(now - lastRegenMinutesAgo * MIN),
        injuries: [], pvpOnboarding: { unlocked: true, placementComplete: true }, markModified() {},
    };
    const PAST = new Error("PAST_DEFENDER_CHECKS");
    const restore = [
        stub(Fighter, "findById", async (id) => (String(id) === String(attackerId) ? attacker : defender)),
        stub(energyService, "getEnergy", async () => ({ current: 100 })),
        stub(pvpRecordService, "ensureUnlocked", async () => false),
        stub(Season, "findById", async () => ({ _id: seasonId, status: "active", weightClass: "Lightweight" })),
        stub(pvpRecordService, "getOrCreateRecord", async () => ({})),
        stub(PVPRecord, "findOne", async () => ({ weightClass: "Lightweight", defenseGameplan: "balanced" })),
        // The first database call after the defender checks: stop there.
        stub(PVPFight, "countDocuments", async () => { throw PAST; }),
    ];
    try {
        await pvpFightService.resolveFight(String(attackerId), { defenderId: String(defenderId), gameplan: "balanced", seasonId: String(seasonId) });
        return "resolved";
    } catch (e) {
        return e === PAST ? "allowed" : e.code || e.message;
    } finally {
        restore.forEach((f) => f());
    }
}

test("a challenge against a defender under 50 health is refused with defender_hurt", async () => {
    assert.strictEqual(await challenge(40, 0), "defender_hurt");
    assert.strictEqual(await challenge(49, 0), "defender_hurt");
});

test("50 health is enough, and passive regen since their last visit counts", async () => {
    assert.strictEqual(await challenge(50, 0), "allowed");
    // 45 health, 30 minutes of regen (+6): 51, allowed.
    assert.strictEqual(await challenge(45, 30), "allowed");
});
