/**
 * Ground & Pound — PVP fight orchestrator.
 *
 * One request both CREATES and RESOLVES a PVP fight, so there is no "accepted" row to
 * guard double-submit. The ONLY guard against double energy-spend / double-DP from two
 * near-simultaneous clicks is a per-attacker Redis lock (SET NX PX). Mandatory.
 *
 * Engine reuse: utils/fightResolution.resolveFight (the pure stat-driven simulator —
 * NOT fightService.resolveFightAndApply, which is bound to NPC/camp/injury/purse logic).
 * Gameplan weighting is applied to THROWAWAY stat copies; the real fighters are never
 * mutated stat-wise.
 */

const mongoose = require("mongoose");
const Fighter = require("../models/fighterModel");
const Season = require("../models/seasonModel");
const PVPRecord = require("../models/pvpRecordModel");
const PVPFight = require("../models/pvpFightModel");
const { redis, ensureRedisConnected } = require("../lib/redis");
const { resolveFight } = require("../utils/fightResolution");
const activityLogService = require("./activityLogService");
const pvpRecordService = require("./pvpRecordService");
const pvpSeasonService = require("./pvpSeasonService");
const pvpRivalryService = require("./pvpRivalryService");
const energyService = require("./energyService");
const { computeDp, applyDpAndDivision } = require("./pvpDpService");
const {
    GAMEPLAN_WEIGHTS,
    GAMEPLAN_KEYS,
    TWISTS,
    DP,
    PLACEMENT_DP,
    PLACEMENT_FIGHTS,
    NEW_COMPETITOR_SHIELD_DAYS,
    divisionForDp,
    divisionMeta,
    bracketTier,
} = require("../consts/pvpConfig");

const DAY_MS = 24 * 3600 * 1000;

const PVP_ENERGY_COST = 15;
const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const LOCK_TTL_MS = 10000;

class PvpError extends Error {
    constructor(code, message, status) {
        super(message || code);
        this.code = code;
        this.status = status || 400;
        this.isPvp = true;
    }
}

/** Build a throwaway gameplan-weighted stat copy. NEVER persisted. */
function weightedStats(fighter, gameplan) {
    const w = GAMEPLAN_WEIGHTS[gameplan] || {};
    const copy = { ...fighter.toObject() };
    for (const k of STAT_KEYS) {
        let v = typeof copy[k] === "number" ? copy[k] : 10;
        if (w[k]) v = Math.round(v * w[k]);
        copy[k] = Math.max(1, v);
    }
    copy.stamina = copy.maxStamina ?? 100;
    copy.health = 100;
    return copy;
}

/** Map engine outcome → PVP method + winner side. */
function mapOutcome(result) {
    const o = result.outcome || "";
    if (o === "Draw") return { method: "draw", attackerWon: false, isDraw: true };
    if (o === "KO/TKO") return { method: "ko", attackerWon: true, isDraw: false };
    if (o === "Submission") return { method: "submission", attackerWon: true, isDraw: false };
    if (o.startsWith("Decision")) return { method: "decision", attackerWon: true, isDraw: false };
    if (o === "Loss (KO/TKO)") return { method: "ko", attackerWon: false, isDraw: false };
    if (o === "Loss (submission)") return { method: "submission", attackerWon: false, isDraw: false };
    if (o === "Loss (decision)") return { method: "decision", attackerWon: false, isDraw: false };
    // Fallback — treat as attacker loss by decision.
    return { method: "decision", attackerWon: false, isDraw: false };
}

/** UTC ISO-week start (Monday 00:00:00.000 UTC) for the given date. */
function startOfIsoWeekUtc(now = new Date()) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const diff = (day === 0 ? 6 : day - 1); // days since Monday
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
}

async function fighterRank(record) {
    const higher = await PVPRecord.countDocuments({
        seasonId: record.seasonId,
        weightClass: record.weightClass,
        dp: { $gt: record.dp },
    });
    return higher + 1;
}

/**
 * Resolve a PVP fight. Actor (attacker) comes from the authed token — NEVER the body.
 * @param {string} attackerFighterId
 * @param {{ defenderId, gameplan, seasonId, weightClass }} body
 */
async function resolveFightForAttacker(attackerFighterId, body = {}) {
    const { defenderId, gameplan, seasonId } = body;

    // ── Input validation (hostile input). ───────────────────────────────────
    if (!gameplan || !GAMEPLAN_KEYS.includes(gameplan)) {
        throw new PvpError("bad_gameplan", "Invalid gameplan.", 400);
    }
    if (!defenderId || !mongoose.isValidObjectId(defenderId)) {
        throw new PvpError("defender_not_found", "Defender not found.", 404);
    }
    if (String(defenderId) === String(attackerFighterId)) {
        throw new PvpError("self_target", "You cannot fight yourself.", 400);
    }
    if (!seasonId || !mongoose.isValidObjectId(seasonId)) {
        throw new PvpError("season_not_found", "Season not found.", 404);
    }

    await ensureRedisConnected();
    const lockKey = `pvp:fight:lock:${attackerFighterId}`;
    const acquired = await redis.set(lockKey, "1", "PX", LOCK_TTL_MS, "NX");
    if (!acquired) {
        throw new PvpError("duplicate_in_flight", "A fight is already resolving — try again in a moment.", 429);
    }

    try {
        return await runResolution(attackerFighterId, defenderId, gameplan, seasonId);
    } finally {
        // Best-effort release.
        try { await redis.del(lockKey); } catch (_) { /* lock TTL will reap it */ }
    }
}

async function runResolution(attackerFighterId, defenderId, gameplan, seasonId) {
    const now = new Date();

    // ── Load attacker + energy check. ────────────────────────────────────────
    const attacker = await Fighter.findById(attackerFighterId);
    if (!attacker) throw new PvpError("defender_not_found", "Fighter not found.", 404);
    // Energy lives in Redis (live, regen-ticked); the Mongo energy field is only a
    // periodic backup. Read the LIVE value via energyService — reading attacker.energy
    // directly sees a stale value and spuriously 402s a player who actually has energy.
    const { current: energyCurrent } = await energyService.getEnergy(attackerFighterId);
    if (energyCurrent < PVP_ENERGY_COST) {
        throw new PvpError("insufficient_energy", "Not enough energy — PVP fights cost 15 energy.", 402);
    }

    // ── (a) Lazy shield expiry: a time-expired New Competitor Shield is cleared
    // silently on the attacker's next action (no feed — it lapsed, wasn't spent). ──
    if (
        attacker.pvpOnboarding &&
        attacker.pvpOnboarding.shieldExpiresAt &&
        now >= attacker.pvpOnboarding.shieldExpiresAt
    ) {
        attacker.pvpOnboarding.shieldExpiresAt = null;
        attacker.markModified("pvpOnboarding");
    }

    // ── (b) Locked guard: self-heal first, then reject if still locked. ──────
    const unlockChanged = await pvpRecordService.ensureUnlocked(attacker);
    if (unlockChanged) attacker.markModified("pvpOnboarding");
    if (!attacker.pvpOnboarding || !attacker.pvpOnboarding.unlocked) {
        throw new PvpError("pvp_locked", "The Proving Ground unlocks at 3 career wins.", 403);
    }

    // ── Season must be active. ───────────────────────────────────────────────
    const season = await Season.findById(seasonId);
    if (!season) throw new PvpError("season_not_found", "Season not found.", 404);
    if (season.status !== "active") {
        throw new PvpError("season_not_active", "This season is not active.", 409);
    }

    // ── Defender + records. ──────────────────────────────────────────────────
    const defender = await Fighter.findById(defenderId);
    if (!defender) throw new PvpError("defender_not_found", "Defender not found.", 404);

    const attackerRecord = await pvpRecordService.getOrCreateRecord(attackerFighterId, season, attacker);
    if (!attackerRecord) throw new PvpError("season_not_active", "This season is not active.", 409);

    const defenderRecord = await PVPRecord.findOne({ playerId: defenderId, seasonId: season._id });
    if (!defenderRecord || defenderRecord.weightClass !== season.weightClass) {
        throw new PvpError("defender_not_in_season", "Defender is not registered in this season.", 409);
    }

    // ── (c) Protected-defender rejection: a shielded OR mid-placement defender
    // cannot be challenged. ──────────────────────────────────────────────────
    const defShielded = !!(
        defender.pvpOnboarding &&
        defender.pvpOnboarding.shieldExpiresAt &&
        now < defender.pvpOnboarding.shieldExpiresAt
    );
    const defInPlacement = !!(
        defender.pvpOnboarding &&
        defender.pvpOnboarding.unlocked &&
        !defender.pvpOnboarding.placementComplete
    );
    if (defShielded || defInPlacement) {
        throw new PvpError("defender_protected", "This fighter is protected and can't be challenged right now.", 409);
    }

    // ── (d) Is THIS fight a placement fight for the attacker? ────────────────
    const isPlacement = !!(
        attacker.pvpOnboarding &&
        attacker.pvpOnboarding.unlocked &&
        !attacker.pvpOnboarding.placementComplete
    );

    // ── (e) Shield clear-on-attack: stepping into the open ends protection. Runs
    // after all validation (so a rejected attack keeps the shield). ──────────
    if (
        attacker.pvpOnboarding &&
        attacker.pvpOnboarding.shieldExpiresAt &&
        now < attacker.pvpOnboarding.shieldExpiresAt
    ) {
        attacker.pvpOnboarding.shieldExpiresAt = null;
        attacker.markModified("pvpOnboarding");
        try {
            activityLogService.log(
                attackerFighterId,
                "pvp_shield_cleared",
                "Protection lifted — you stepped into the open",
                { seasonId: String(season._id), weightClass: season.weightClass }
            );
        } catch (_) { /* feed failures never block the fight */ }
    }

    // ── Repeat count (BEFORE writing this fight). Placement fights never count. ─
    const weekStart = startOfIsoWeekUtc(now);
    const repeatCount = await PVPFight.countDocuments({
        attackerId: attackerFighterId,
        defenderId,
        seasonId: season._id,
        fightAt: { $gte: weekStart },
        isPlacement: { $ne: true },
    });

    // ── Belt-holder flag: is the defender the current #1 in champion division? ─
    const beltHolderId = await pvpRecordService.currentBeltHolderId(season._id, season.weightClass);
    const isBeltHolderFight = beltHolderId != null && String(defenderId) === beltHolderId;

    // ── Run the engine on throwaway weighted copies. ─────────────────────────
    const weightedAttacker = weightedStats(attacker, gameplan);
    const weightedDefender = weightedStats(defender, defenderRecord.defenseGameplan);
    const attackerName = pvpRecordService.fighterName(attacker);
    const defenderName = pvpRecordService.fighterName(defender);
    const engine = resolveFight(weightedAttacker, weightedDefender, {
        playerName: attackerName,
        opponentName: defenderName,
        ctx: {
            playerOvr: attacker.overallRating || 0,
            opponentOvr: defender.overallRating || 0,
        },
    });

    const { method, attackerWon, isDraw } = mapOutcome(engine);

    const attackerName2 = attackerName; // alias kept for placement-branch readability

    // ════════════════════════════════════════════════════════════════════════
    // (g) PLACEMENT BRANCH — the attacker's first 3 PVP fights.
    //   - Attacker DP change is 0 (no computeDp / applyDpAndDivision for attacker).
    //   - Attacker W/L increments; winStreak / longestStreak stay UNTOUCHED (0).
    //   - DEFENDER RECORD IS NEVER MUTATED OR SAVED — no DP, no W/L, no streak, no
    //     lastFightAt/lastActiveAt, no OVR snapshot. The defender doc is read-only here.
    //   - Rivalry is SKIPPED entirely (no priorWinCount, no processRivalry).
    //   - On the 3rd placement fight → seed DP/division from placement wins + grant the
    //     New Competitor Shield.
    // ════════════════════════════════════════════════════════════════════════
    if (isPlacement) {
        const attackerDpBefore = attackerRecord.dp;          // 0 during placement
        const attackerDivisionBefore = attackerRecord.division;
        const rankBefore = await fighterRank(attackerRecord);

        // Attacker W/L (no streak). Draw is "not a win".
        if (!isDraw) {
            if (attackerWon) attackerRecord.wins += 1;
            else attackerRecord.losses += 1;
        }
        attackerRecord.lastFightAt = now;
        pvpRecordService.touchActive(attackerRecord);
        if (typeof attacker.overallRating === "number") attackerRecord.overallRating = attacker.overallRating;

        // Spend energy via the energy service (Redis source of truth), then mirror the
        // result onto the doc so the upcoming attacker.save() stays consistent.
        const energyRemaining = (await energyService.deductEnergy(attackerFighterId, PVP_ENERGY_COST)).current;
        if (attacker.energy && typeof attacker.energy === "object") {
            attacker.energy.current = energyRemaining;
            attacker.energy.lastSyncedAt = now;
        }

        // Onboarding counters on the fighter doc.
        if (!attacker.pvpOnboarding) attacker.pvpOnboarding = {};
        attacker.pvpOnboarding.placementFights = (attacker.pvpOnboarding.placementFights || 0) + 1;
        if (attackerWon) {
            attacker.pvpOnboarding.placementWins = (attacker.pvpOnboarding.placementWins || 0) + 1;
        }

        // Completion: 3rd placement fight → seed entry DP/division + grant shield.
        let placementComplete = false;
        let shieldGranted = false;
        if (attacker.pvpOnboarding.placementFights >= PLACEMENT_FIGHTS) {
            const pWins = attacker.pvpOnboarding.placementWins || 0;
            const seedDp = PLACEMENT_DP[pWins] != null ? PLACEMENT_DP[pWins] : 0;
            attackerRecord.dp = seedDp;
            attackerRecord.peakDp = seedDp;
            attackerRecord.division = divisionForDp(seedDp);
            attacker.pvpOnboarding.placementComplete = true;
            attacker.pvpOnboarding.shieldExpiresAt = new Date(now.getTime() + NEW_COMPETITOR_SHIELD_DAYS * DAY_MS);
            placementComplete = true;
            shieldGranted = true;
        }
        attacker.markModified("pvpOnboarding");

        // Persist attacker record + fighter. DEFENDER RECORD IS NOT SAVED.
        await attackerRecord.save();
        await attacker.save();

        const winnerId = isDraw ? null : (attackerWon ? attackerFighterId : defenderId);
        const loserId = isDraw ? null : (attackerWon ? defenderId : attackerFighterId);

        // Zeroed DP breakdown (placement awards no DP to either side).
        const zeroBreakdown = {
            base: 0, rivalryBonus: 0, beltHolderBonus: 0, bracketBonus: 0,
            streakMultiplier: 1, repeatPenalty: 1, twistBonus: 0, catchUpMultiplier: 1,
        };

        let fightDoc;
        try {
            fightDoc = await PVPFight.create({
                seasonId: season._id,
                weightClass: season.weightClass,
                attackerId: attackerFighterId,
                defenderId,
                attackerGameplan: gameplan,
                defenderGameplan: defenderRecord.defenseGameplan,
                winnerId,
                loserId,
                method,
                attackerDpChange: 0,
                defenderDpChange: 0,
                attackerDpBefore,
                attackerDpAfter: attackerRecord.dp,
                defenderDpBefore: defenderRecord.dp,
                defenderDpAfter: defenderRecord.dp, // unchanged — read only
                attackerDivisionBefore,
                attackerDivisionAfter: attackerRecord.division,
                defenderDivisionBefore: defenderRecord.division,
                defenderDivisionAfter: defenderRecord.division,
                dpBreakdown: zeroBreakdown,
                isRivalryFight: false,
                isRivalryResolved: false,
                isBeltHolderFight,
                isPlacement: true,
                wasDefenseWhileOffline: true,
                twistApplied: false,
                twistName: (TWISTS[season.twist] || {}).name || null,
                defenderSeen: false,
                commentary: engine.commentary || [],
            });
        } catch (err) {
            console.error("[PVP placement] failed to write fight doc:", err.message);
        }

        // Defender still gets a defense feed (dpChange 0). Attacker placement feed below.
        try {
            const meta = { seasonId: String(season._id), weightClass: season.weightClass, placement: true };
            if (isDraw) {
                activityLogService.log(defenderId, "pvp_defended", `PVP draw vs ${attackerName2}`, { ...meta, draw: true });
            } else if (attackerWon) {
                activityLogService.log(defenderId, "pvp_defense_loss", `Lost a PVP defense to ${attackerName2}`, meta);
            } else {
                activityLogService.log(defenderId, "pvp_defended", `Defended against ${attackerName2}`, meta);
            }
            if (placementComplete) {
                activityLogService.log(
                    attackerFighterId,
                    "pvp_placement_done",
                    `Placement complete — you enter at ${attackerRecord.division} with ${attackerRecord.dp} DP`,
                    { ...meta, division: attackerRecord.division, dp: attackerRecord.dp }
                );
            }
        } catch (_) { /* feed failures never block the fight */ }

        const attMeta = divisionMeta(attackerRecord.division);
        const rankAfter = await fighterRank(attackerRecord);
        const placementFightNumber = attacker.pvpOnboarding.placementFights;

        return {
            fightId: fightDoc ? String(fightDoc._id) : null,
            winnerId: winnerId ? String(winnerId) : null,
            loserId: loserId ? String(loserId) : null,
            method,
            youWon: attackerWon,
            isPlacement: true,
            placement: {
                fightNumber: placementFightNumber,
                total: PLACEMENT_FIGHTS,
                wins: attacker.pvpOnboarding.placementWins || 0,
            },
            ...(placementComplete ? { placementComplete: true, shieldGranted: true } : {}),
            attacker: {
                playerId: String(attackerFighterId),
                name: attackerName2,
                dpBefore: attackerDpBefore,
                dpAfter: attackerRecord.dp,
                dpChange: 0,
                divisionBefore: attackerDivisionBefore,
                divisionAfter: attackerRecord.division,
                division: attackerRecord.division,
                divisionColor: attMeta ? attMeta.color : null,
                rankBefore,
                rankAfter,
                streakAfter: attackerRecord.winStreak, // stays 0 in placement
                promoted: false,
            },
            defender: {
                playerId: String(defenderId),
                name: defenderName,
                dpBefore: defenderRecord.dp,
                dpAfter: defenderRecord.dp,
                dpChange: 0,
                divisionBefore: defenderRecord.division,
                divisionAfter: defenderRecord.division,
                overallRating: defender.overallRating || 0,
                realWeightClass: defender.weightClass,
            },
            dpBreakdown: zeroBreakdown,
            twistApplied: false,
            twistName: (TWISTS[season.twist] || {}).name || null,
            flags: {
                isRivalryFight: false,
                isRivalryResolved: false,
                isBeltHolderFight,
                isPromotion: false,
            },
            energyRemaining,
            commentary: engine.commentary || [],
            streakBefore: 0,
            streakBroken: false,
            playerIsNowBeltHolder: false,
            beltHolderDpAfter: null,
            seasonWeeksRemaining: Math.max(0, Math.ceil((season.endDate.getTime() - now.getTime()) / (7 * DAY_MS))),
            seasonNumber: season.seasonNumber,
            crossWeightClass: pvpSeasonService.isCrossWeightClass(season),
        };
    }

    // ── (f) Catch-up: late joiner below elite gets ×2 WIN DP while the window is open. ─
    const catchUpActive = !!(
        attackerRecord.catchUpExpiresAt &&
        now < attackerRecord.catchUpExpiresAt &&
        attackerRecord.division !== "elite" &&
        attackerRecord.division !== "champion"
    );

    // ── Rivalry prediction (so the +25 resolving bonus applies THIS fight). ──
    let priorWins = 0;
    if (attackerWon) {
        priorWins = await pvpRivalryService.priorWinCount(season._id, attackerFighterId, defenderId);
    }
    const isRivalryResolved = attackerWon && priorWins === 2; // this win is the 3rd.

    // ── DP computation. ──────────────────────────────────────────────────────
    const bTier = bracketTier(attacker.overallRating || 0, defender.overallRating || 0);

    const attackerDp = computeDp({
        isWin: attackerWon,
        isDraw,
        isAttacker: true,
        method,
        attackerStreak: attackerRecord.winStreak + (attackerWon ? 0 : 0), // current streak BEFORE this fight
        isBeltHolderFight,
        isRivalryResolved,
        bracketTier: bTier,
        twist: season.twist,
        repeatCount,
        catchUpActive,
    });

    // Defender DP: never gains. Attacker-win → defender loses (-28 floored). Attacker-loss
    // → defender successfully defended → 0 (no gain). Draw → 0.
    let defenderDpChange = 0;
    if (!isDraw) {
        if (attackerWon) {
            const def = computeDp({ isWin: false, isAttacker: false, method });
            defenderDpChange = def.dpChange; // -28 (floored by caller below)
        } else {
            defenderDpChange = 0; // defense held — no gain.
        }
    }

    // ── Snapshot before-state. ───────────────────────────────────────────────
    const attackerDpBefore = attackerRecord.dp;
    const defenderDpBefore = defenderRecord.dp;
    const attackerDivisionBefore = attackerRecord.division;
    const defenderDivisionBefore = defenderRecord.division;
    const rankBefore = await fighterRank(attackerRecord);
    const attackerStreakBefore = attackerRecord.winStreak;

    // ── Apply DP + division to both records. ─────────────────────────────────
    const attackerApply = applyDpAndDivision(attackerRecord, attackerDp.dpChange, { isWin: attackerWon });
    const defenderApply = applyDpAndDivision(defenderRecord, defenderDpChange, { isWin: false });

    // ── Counters / streaks. ──────────────────────────────────────────────────
    if (isDraw) {
        // Draw — no win/loss/streak change (contract §6 draw note). Records still touched.
    } else if (attackerWon) {
        attackerRecord.wins += 1;
        attackerRecord.winStreak += 1;
        if (attackerRecord.winStreak > attackerRecord.longestStreak) {
            attackerRecord.longestStreak = attackerRecord.winStreak;
        }
        defenderRecord.losses += 1;
        defenderRecord.winStreak = 0;
    } else {
        attackerRecord.losses += 1;
        attackerRecord.winStreak = 0;
        defenderRecord.wins += 1;
        defenderRecord.winStreak += 1;
        if (defenderRecord.winStreak > defenderRecord.longestStreak) {
            defenderRecord.longestStreak = defenderRecord.winStreak;
        }
    }

    attackerRecord.lastFightAt = now;
    defenderRecord.lastFightAt = now;
    pvpRecordService.touchActive(attackerRecord);
    // OVR snapshot refresh (division cache recompute is upward-only safe — applyDp already set division).
    if (typeof attacker.overallRating === "number") attackerRecord.overallRating = attacker.overallRating;
    if (typeof defender.overallRating === "number") defenderRecord.overallRating = defender.overallRating;

    // ── Deduct attacker energy via the energy service (Redis source of truth). ──
    const energyRemaining = (await energyService.deductEnergy(attackerFighterId, PVP_ENERGY_COST)).current;
    if (attacker.energy && typeof attacker.energy === "object") {
        attacker.energy.current = energyRemaining;
        attacker.energy.lastSyncedAt = now;
    }

    // ── Persist: records → fighters → fight doc → rivalry → feed. ────────────
    await attackerRecord.save();
    await defenderRecord.save();
    await attacker.save();

    // ── Recompute belt holder AFTER record saves (additive DTO surface). ──────
    const beltHolderAfterId = await pvpRecordService.currentBeltHolderId(season._id, season.weightClass);
    const playerIsNowBeltHolder = beltHolderAfterId != null && String(beltHolderAfterId) === String(attackerFighterId);
    const beltHolderDpAfter = playerIsNowBeltHolder ? defenderRecord.dp : null;
    const seasonWeeksRemaining = Math.max(0, Math.ceil((season.endDate.getTime() - now.getTime()) / (7 * 24 * 3600 * 1000)));

    const winnerId = isDraw ? null : (attackerWon ? attackerFighterId : defenderId);
    const loserId = isDraw ? null : (attackerWon ? defenderId : attackerFighterId);

    let fightDoc;
    try {
        fightDoc = await PVPFight.create({
            seasonId: season._id,
            weightClass: season.weightClass,
            attackerId: attackerFighterId,
            defenderId,
            attackerGameplan: gameplan,
            defenderGameplan: defenderRecord.defenseGameplan,
            winnerId,
            loserId,
            method,
            attackerDpChange: attackerDp.dpChange,
            defenderDpChange,
            attackerDpBefore,
            attackerDpAfter: attackerRecord.dp,
            defenderDpBefore,
            defenderDpAfter: defenderRecord.dp,
            attackerDivisionBefore,
            attackerDivisionAfter: attackerRecord.division,
            defenderDivisionBefore,
            defenderDivisionAfter: defenderRecord.division,
            dpBreakdown: attackerDp.breakdown,
            isRivalryFight: false, // set after rivalry persists below
            isRivalryResolved,
            isBeltHolderFight,
            wasDefenseWhileOffline: true,
            twistApplied: attackerDp.twistApplied,
            twistName: (TWISTS[season.twist] || {}).name || null,
            defenderSeen: false,
            commentary: engine.commentary || [],
        });
    } catch (err) {
        console.error("[PVP fight] failed to write fight doc:", err.message);
    }

    // ── Rivalry persistence (after DP write). ────────────────────────────────
    let rivalryFlags = { isRivalryFight: false, isRivalryResolved: false };
    if (attackerWon) {
        try {
            rivalryFlags = await pvpRivalryService.processRivalry(season._id, attackerFighterId, defenderId, priorWins);
            if (fightDoc && rivalryFlags.isRivalryFight) {
                fightDoc.isRivalryFight = true;
                await fightDoc.save();
            }
        } catch (err) {
            console.error("[PVP fight] rivalry processing failed:", err.message);
        }
    }

    // ── Feed entries (non-fatal). ────────────────────────────────────────────
    writeFeed({
        attackerId: attackerFighterId,
        defenderId,
        attackerName,
        defenderName,
        attackerWon,
        isDraw,
        method,
        attackerDpChange: attackerDp.dpChange,
        defenderDpChange,
        promoted: attackerApply.promoted,
        rivalryFlags,
        season,
    });

    // ── Build the FightResult DTO (§3.4). ────────────────────────────────────
    const rankAfter = await fighterRank(attackerRecord);
    const attMeta = divisionMeta(attackerRecord.division);

    return {
        fightId: fightDoc ? String(fightDoc._id) : null,
        winnerId: winnerId ? String(winnerId) : null,
        loserId: loserId ? String(loserId) : null,
        method,
        youWon: attackerWon,
        isPlacement: false,
        placement: null,
        catchUpActive,
        attacker: {
            playerId: String(attackerFighterId),
            name: attackerName,
            dpBefore: attackerDpBefore,
            dpAfter: attackerRecord.dp,
            dpChange: attackerDp.dpChange,
            divisionBefore: attackerDivisionBefore,
            divisionAfter: attackerRecord.division,
            division: attackerRecord.division,
            divisionColor: attMeta ? attMeta.color : null,
            rankBefore,
            rankAfter,
            streakAfter: attackerRecord.winStreak,
            promoted: attackerApply.promoted,
        },
        defender: {
            playerId: String(defenderId),
            name: defenderName,
            dpBefore: defenderDpBefore,
            dpAfter: defenderRecord.dp,
            dpChange: defenderDpChange,
            divisionBefore: defenderDivisionBefore,
            divisionAfter: defenderRecord.division,
            overallRating: defender.overallRating || 0,
            realWeightClass: defender.weightClass,
        },
        dpBreakdown: attackerDp.breakdown,
        twistApplied: attackerDp.twistApplied,
        twistName: (TWISTS[season.twist] || {}).name || null,
        flags: {
            isRivalryFight: !!rivalryFlags.isRivalryFight,
            isRivalryResolved: !!rivalryFlags.isRivalryResolved,
            isBeltHolderFight,
            isPromotion: attackerApply.promoted,
        },
        energyRemaining,
        commentary: engine.commentary || [],
        streakBefore: attackerStreakBefore,
        streakBroken: !attackerWon && !isDraw && attackerStreakBefore >= DP.STREAK_MIN,
        playerIsNowBeltHolder,
        beltHolderDpAfter,
        seasonWeeksRemaining,
        seasonNumber: season.seasonNumber,
        crossWeightClass: pvpSeasonService.isCrossWeightClass(season),
    };
}

function writeFeed({ attackerId, defenderId, attackerName, defenderName, attackerWon, isDraw, method, attackerDpChange, defenderDpChange, promoted, rivalryFlags, season }) {
    const meta = { seasonId: String(season._id), weightClass: season.weightClass };
    try {
        if (isDraw) {
            // Both careers log the bout (DP unchanged for both, M-3).
            activityLogService.log(attackerId, "pvp_loss", `PVP draw vs ${defenderName}`, { ...meta, draw: true });
            activityLogService.log(defenderId, "pvp_defended", `PVP draw vs ${attackerName}`, { ...meta, draw: true });
            return;
        }
        if (attackerWon) {
            activityLogService.log(attackerId, "pvp_win", `PVP win vs ${defenderName} by ${method} (${attackerDpChange >= 0 ? "+" : ""}${attackerDpChange} DP)`, meta);
            activityLogService.log(defenderId, "pvp_defense_loss", `Lost a PVP defense to ${attackerName} (${defenderDpChange} DP)`, meta);
            if (promoted) {
                activityLogService.log(attackerId, "pvp_promoted", `Promoted in the Proving Ground`, meta);
            }
            if (rivalryFlags && rivalryFlags.isRivalryResolved) {
                activityLogService.log(attackerId, "pvp_rivalry_resolved", `Settled the rivalry with ${defenderName}`, meta);
            } else if (rivalryFlags && rivalryFlags.isRivalryFight) {
                activityLogService.log(attackerId, "pvp_rivalry_set", `Rivalry brewing with ${defenderName}`, meta);
            }
        } else {
            activityLogService.log(attackerId, "pvp_loss", `PVP loss to ${defenderName} by ${method} (${attackerDpChange} DP)`, meta);
            activityLogService.log(defenderId, "pvp_defended", `Defended against ${attackerName}`, meta);
        }
    } catch (_) { /* feed failures never block the fight */ }
}

/**
 * Unread defense results for a fighter. Marks them seen on read (ack=true default).
 */
async function listDefenseResults(fighterId, ack = true) {
    const rows = await PVPFight.find({ defenderId: fighterId, defenderSeen: false })
        .sort({ fightAt: -1 })
        .limit(50);

    const fighterIds = rows.map((r) => r.attackerId);
    const fighters = await Fighter.find({ _id: { $in: fighterIds } })
        .select("firstName lastName nickname").lean();
    const nameMap = new Map(fighters.map((f) => [String(f._id), pvpRecordService.fighterName(f)]));

    const results = rows.map((r) => ({
        fightId: String(r._id),
        fightAt: r.fightAt,
        attackerId: String(r.attackerId),
        attackerName: nameMap.get(String(r.attackerId)) || "Unknown",
        youWon: String(r.winnerId || "") === String(fighterId),
        method: r.method,
        dpChange: r.defenderDpChange,
        halfRate: true,
        divisionAfter: r.defenderDivisionAfter,
        // Placement attacks put no DP at stake for the defender (informational row).
        isPlacement: !!r.isPlacement,
        noDpAtStake: !!r.isPlacement,
    }));

    const unreadCount = results.length;

    if (ack && rows.length > 0) {
        const ids = rows.map((r) => r._id);
        try {
            await PVPFight.updateMany({ _id: { $in: ids } }, { $set: { defenderSeen: true } });
        } catch (err) {
            console.error("[PVP defense-results] ack failed:", err.message);
        }
    }

    return { results, unreadCount };
}

/**
 * Paginated fight history (attacker + defender rows) for a fighter in a season.
 */
async function listFights(seasonId, fighterId, { page = 1, limit = 25 } = {}) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const filter = {
        seasonId,
        $or: [{ attackerId: fighterId }, { defenderId: fighterId }],
    };
    const total = await PVPFight.countDocuments(filter);
    const rows = await PVPFight.find(filter)
        .sort({ fightAt: -1 })
        .skip((p - 1) * l)
        .limit(l);

    const oppIds = rows.map((r) => (String(r.attackerId) === String(fighterId) ? r.defenderId : r.attackerId));
    const fighters = await Fighter.find({ _id: { $in: oppIds } })
        .select("firstName lastName nickname").lean();
    const nameMap = new Map(fighters.map((f) => [String(f._id), pvpRecordService.fighterName(f)]));

    const fights = rows.map((r) => {
        const isAttacker = String(r.attackerId) === String(fighterId);
        const oppId = isAttacker ? r.defenderId : r.attackerId;
        const youWon = String(r.winnerId || "") === String(fighterId);
        return {
            fightId: String(r._id),
            fightAt: r.fightAt,
            role: isAttacker ? "attacker" : "defender",
            opponentId: String(oppId),
            opponentName: nameMap.get(String(oppId)) || "Unknown",
            youWon,
            method: r.method,
            dpChange: isAttacker ? r.attackerDpChange : r.defenderDpChange,
            divisionAfter: isAttacker ? r.attackerDivisionAfter : r.defenderDivisionAfter,
            isRivalryFight: r.isRivalryFight,
            isBeltHolderFight: r.isBeltHolderFight,
            wasDefenseWhileOffline: !isAttacker && r.wasDefenseWhileOffline,
        };
    });

    return {
        fights,
        page: p,
        limit: l,
        total,
        totalPages: Math.max(1, Math.ceil(total / l)),
    };
}

/**
 * Set the actor's defense gameplan on their active-season record.
 */
async function setDefenseGameplan(fighterId, gameplan) {
    if (!gameplan || !GAMEPLAN_KEYS.includes(gameplan)) {
        throw new PvpError("bad_gameplan", "Invalid gameplan.", 400);
    }
    const fighter = await Fighter.findById(fighterId).select("weightClass");
    if (!fighter) throw new PvpError("no_active_record", "No active record.", 409);
    const season = await pvpSeasonService.getCurrentSeasonForFighter(fighter.weightClass);
    if (!season || season.status !== "active") throw new PvpError("no_active_record", "No active record.", 409);
    const record = await PVPRecord.findOne({ playerId: fighterId, seasonId: season._id });
    if (!record) throw new PvpError("no_active_record", "No active record.", 409);
    record.defenseGameplan = gameplan;
    await record.save();
    return { defenseGameplan: record.defenseGameplan };
}

module.exports = {
    resolveFight: resolveFightForAttacker,
    listDefenseResults,
    listFights,
    setDefenseGameplan,
    PvpError,
    weightedStats,
    mapOutcome,
    startOfIsoWeekUtc,
};
