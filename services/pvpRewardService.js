/**
 * Ground & Pound — PVP season finalize + rewards + soft reset.
 *
 * finalizeSeason is LAUNCH-CRITICAL and must be safe to re-run. It is guarded by
 * DUAL idempotency:
 *   1. season.status === "ended"  → whole-season early return.
 *   2. per-record `rewardedAt`    → a record already paid is skipped on re-finalize,
 *                                    so a crash mid-loop never double-pays.
 * Plus: HallOfFame has a unique seasonId index, and soft-reset record creation is
 * dup-key guarded.
 */

const Season = require("../models/seasonModel");
const PVPRecord = require("../models/pvpRecordModel");
const HallOfFame = require("../models/hallOfFameModel");
const Fighter = require("../models/fighterModel");
const notorietyService = require("./notorietyService");
const shopService = require("./shopService");
const activityLogService = require("./activityLogService");
const pvpSeasonService = require("./pvpSeasonService");
const {
    REWARDS,
    SOFT_RESET,
    MIN_FIGHTS_FOR_REWARD,
    divisionFloor,
    badgeIdFor,
} = require("../consts/pvpConfig");

function hasFought(record) {
    return (record.wins + record.losses) >= MIN_FIGHTS_FOR_REWARD;
}

/** Award a synthesized PVP badge imperatively into fighter.badgesEarned (mutation only). */
function awardBadge(fighter, badgeId, context) {
    if (!badgeId) return;
    if (!Array.isArray(fighter.badgesEarned)) fighter.badgesEarned = [];
    const already = fighter.badgesEarned.some((e) => e && e.badgeId === badgeId);
    if (already) return;
    fighter.badgesEarned.push({ badgeId, earnedAt: new Date(), context: context || null, seen: false });
    fighter.markModified("badgesEarned");
}

/**
 * Apply a full reward bundle (iron + fame + drinks + badge) to a loaded fighter doc.
 * Mutation only — caller saves.
 */
function applyRewardBundle(fighter, reward, { badgeId, context, feedType, feedDetail, season, code = "PVP_SEASON_REWARD" }) {
    if (reward.iron) fighter.iron = (fighter.iron || 0) + reward.iron;
    if (reward.fame) {
        // skipFreezeBlock so a frozen (3-loss) fighter still receives PVP season fame.
        notorietyService.applyNotorietyDelta(fighter, reward.fame, {
            code,
            reason: feedDetail || "PVP season reward",
            meta: { seasonId: String(season._id), seasonNumber: season.seasonNumber },
            skipFreezeBlock: true,
        });
    }
    if (reward.drinks) shopService.grantEnergyDrinks(fighter, reward.drinks);
    if (badgeId) awardBadge(fighter, badgeId, context);
    if (feedType) {
        try {
            activityLogService.log(fighter._id, feedType, feedDetail, {
                seasonId: String(season._id),
                seasonNumber: season.seasonNumber,
                weightClass: season.weightClass,
            });
        } catch (_) { /* feed failures never block rewards */ }
    }
}

/**
 * Finalize a season: pay rewards, crown belt, create HoF, soft reset, seed N+1.
 * @param {import("mongoose").Document} season
 * @returns {{ ended:boolean, rewarded:number, beltHolderId:(string|null) }}
 */
async function finalizeSeason(season) {
    // ── Idempotency guard 1: fully complete (ended AND redistributed). ───────
    // An ended-but-not-yet-redistributed season FALLS THROUGH and re-runs: a crash
    // between status="ended" and redistribution completing would otherwise strand the
    // season (the active-season sweep would never re-pick it). Every step below is
    // idempotent — rewards skip rewardedAt, HoF/seed/record creates are dup-key guarded —
    // so re-running is safe. redistributedAt is the single completion marker.
    if (season.status === "ended" && season.redistributedAt) {
        return { ended: false, rewarded: 0, beltHolderId: season.beltHolderId ? String(season.beltHolderId) : null };
    }

    const ladder = await PVPRecord.find({ seasonId: season._id, weightClass: season.weightClass })
        .sort({ dp: -1 });

    // Belt holder = highest-dp champion-division record with >=1 fight (may be null).
    const beltRecord = ladder.find((r) => r.division === "champion" && hasFought(r)) || null;
    const beltHolderId = beltRecord ? String(beltRecord.playerId) : null;
    season.beltHolderId = beltRecord ? beltRecord.playerId : null;

    // ── HallOfFame (idempotent via unique seasonId index). ───────────────────
    if (beltRecord) {
        try {
            await HallOfFame.create({
                seasonId: season._id,
                seasonNumber: season.seasonNumber,
                weightClass: season.weightClass,
                beltHolderId: beltRecord.playerId,
                finalDp: beltRecord.dp,
                record: { wins: beltRecord.wins, losses: beltRecord.losses },
            });
        } catch (err) {
            if (!(err && err.code === 11000)) {
                console.error(`[PVP finalize] HoF create failed for season ${season._id}:`, err.message);
            }
        }
    }

    // ── Rewards loop — per-fighter, dual-idempotent via record.rewardedAt. ───
    let rewarded = 0;
    for (const record of ladder) {
        if (!hasFought(record)) continue;          // 0-fight records get nothing.
        if (record.rewardedAt) continue;           // already paid (re-finalize safety).

        const isBelt = beltRecord && String(record._id) === String(beltRecord._id);
        // Belt REPLACES champion rewards (no stack).
        const reward = isBelt ? REWARDS.beltHolder : REWARDS[record.division];
        if (!reward) continue;

        let fighter;
        try {
            // eslint-disable-next-line no-await-in-loop
            fighter = await Fighter.findById(record.playerId);
        } catch (err) {
            console.error(`[PVP finalize] load fighter ${record.playerId} failed:`, err.message);
            continue;
        }
        if (!fighter) {
            // Fighter gone — mark rewarded so we don't loop forever, but pay nothing.
            record.rewardedAt = new Date();
            // eslint-disable-next-line no-await-in-loop
            await record.save().catch(() => {});
            continue;
        }

        const badgeId = isBelt
            ? badgeIdFor("belt", season.seasonNumber, season.weightClass)
            : (reward.badge ? badgeIdFor(record.division, season.seasonNumber, season.weightClass) : null);

        applyRewardBundle(fighter, reward, {
            badgeId,
            context: season.name,
            feedType: isBelt ? "pvp_belt_won" : "pvp_season_end",
            feedDetail: isBelt
                ? `Won the ${season.weightClass} Proving Ground belt — ${season.name}`
                : `Finished ${season.name} in the ${record.division} division`,
            season,
        });

        // ── First-Proving-Ground-season welcome bonus (one-time per fighter). ──
        // Rides this record's rewardedAt idempotency: paid bonus + flag are committed
        // together with rewardedAt below, so a re-finalize never double-pays.
        let firstSeasonBonusPaid = false;
        if (fighter.pvpOnboarding && fighter.pvpOnboarding.firstSeasonComplete === false) {
            applyRewardBundle(fighter, { iron: 500, fame: 100, drinks: 0, badge: null }, {
                feedType: "pvp_season_first",
                feedDetail: "First Proving Ground season complete — welcome bonus",
                code: "PVP_FIRST_SEASON_BONUS",
                season,
            });
            fighter.pvpOnboarding.firstSeasonComplete = true;
            fighter.markModified("pvpOnboarding");
            firstSeasonBonusPaid = true;
        }

        try {
            // eslint-disable-next-line no-await-in-loop
            await fighter.save();
            record.rewardedAt = new Date();
            if (firstSeasonBonusPaid) record.firstSeasonBonusPaid = true;
            // eslint-disable-next-line no-await-in-loop
            await record.save();
            rewarded += 1;
        } catch (err) {
            // One bad fighter must not strand the whole season — leave rewardedAt unset
            // so the next sweep retries this record specifically.
            console.error(`[PVP finalize] reward save failed for fighter ${record.playerId}:`, err.message);
        }
    }

    // ── Mark season ended ONLY after the reward loop completed. ───────────────
    season.status = "ended";
    await season.save();

    // ── Soft reset + seed N+1 (best-effort; failures logged, not fatal). ─────
    if (pvpSeasonService.isCrossWeightClass(season)) {
        // Open season → redistribute everyone into their REAL weight class for the
        // normal per-WC next cycle. Seed the 4 per-WC seasons first (Map<realWC, doc>),
        // then per-record soft-reset into the matching target.
        try {
            const nextSeasons = await pvpSeasonService.seedPerWcCycle(
                season.seasonNumber + 1,
                season.endDate,
                "upcoming"
            );
            await softResetOpen(season, ladder, nextSeasons);
        } catch (err) {
            console.error(`[PVP finalize] open redistribution failed for season ${season._id}:`, err.message);
        }
    } else {
        try {
            await softReset(season, ladder);
        } catch (err) {
            console.error(`[PVP finalize] soft reset failed for season ${season._id}:`, err.message);
        }
        try {
            const startDate = season.endDate;
            const nextTwist = pvpSeasonService.pickTwistForSeason(season.seasonNumber + 1);
            await pvpSeasonService.seedSeason(season.seasonNumber + 1, season.weightClass, nextTwist, startDate, "upcoming");
        } catch (err) {
            console.error(`[PVP finalize] seed N+1 failed for season ${season._id}:`, err.message);
        }
    }

    // ── Completion marker. ONLY set after redistribution + N+1 seeding ran. ──
    // If any of the above threw and was swallowed (best-effort), the partial state is
    // still recoverable because the inner creates are dup-key/rewardedAt guarded — but
    // we only stamp redistributedAt here, so a hard crash before this line leaves the
    // season re-runnable on the next sweep.
    season.redistributedAt = new Date();
    await season.save();

    return { ended: true, rewarded, beltHolderId };
}

/**
 * Create reset records for season N+1 (same weight class). Old records are kept.
 * Each finished record's division maps via SOFT_RESET, dp = that division's floor,
 * counters zeroed, defenseGameplan copied, OVR snapshot carried.
 */
async function softReset(season, ladder = null) {
    const nextSeason = await Season.findOne({
        weightClass: season.weightClass,
        seasonNumber: season.seasonNumber + 1,
    });
    if (!nextSeason) {
        // N+1 not seeded yet — seed it first so we have a target.
        const seeded = await pvpSeasonService.seedSeason(
            season.seasonNumber + 1,
            season.weightClass,
            pvpSeasonService.pickTwistForSeason(season.seasonNumber + 1),
            season.endDate,
            "upcoming"
        );
        if (!seeded) return;
        return softResetInto(season, seeded, ladder);
    }
    return softResetInto(season, nextSeason, ladder);
}

async function softResetInto(season, nextSeason, ladder) {
    const records = ladder || (await PVPRecord.find({ seasonId: season._id, weightClass: season.weightClass }));
    for (const record of records) {
        const targetDivision = SOFT_RESET[record.division] || "prospect";
        const dp = divisionFloor(targetDivision);
        try {
            // eslint-disable-next-line no-await-in-loop
            await PVPRecord.create({
                playerId: record.playerId,
                seasonId: nextSeason._id,
                weightClass: nextSeason.weightClass,
                // For a per-WC next season, nextSeason.weightClass IS the real class, so
                // carrying it forward (or the record's own) is always correct.
                realWeightClass: record.realWeightClass || nextSeason.weightClass,
                division: targetDivision,
                dp,
                peakDp: 0,
                overallRating: record.overallRating,
                wins: 0,
                losses: 0,
                winStreak: 0,
                longestStreak: 0,
                defenseGameplan: record.defenseGameplan,
                promotionShield: 0,
                lastFightAt: null,
                lastActiveAt: new Date(),
            });
        } catch (err) {
            if (!(err && err.code === 11000)) {
                console.error(`[PVP soft reset] create failed for player ${record.playerId}:`, err.message);
            }
            // dup-key → already reset, skip.
        }
    }
}

/**
 * Open-season redistribution: spread an ended Open season's records into the per-WC
 * next-cycle seasons by each player's REAL weight class. Mirrors softResetInto but the
 * target season is chosen per-record (not shared). Idempotent — re-running against an
 * already-redistributed season hits the {playerId,seasonId} unique index and skips.
 *
 * @param {import("mongoose").Document} openSeason the ended Open season
 * @param {Array} ladder optional pre-loaded records for openSeason
 * @param {Map<string, object>} nextSeasons Map<realWeightClass, seasonDoc> from seedPerWcCycle
 */
async function softResetOpen(openSeason, ladder, nextSeasons) {
    const records = ladder || (await PVPRecord.find({ seasonId: openSeason._id }));
    for (const record of records) {
        // Resolve the player's real weight class: prefer the stamped field, else look up
        // the live fighter (covers legacy records that predate realWeightClass).
        let realWc = record.realWeightClass;
        if (!realWc) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const f = await Fighter.findById(record.playerId).select("weightClass").lean();
                realWc = f ? f.weightClass : null;
            } catch (err) {
                console.error(`[PVP open reset] fighter load failed for ${record.playerId}:`, err.message);
                continue;
            }
        }
        if (!realWc) continue; // deleted fighter / unknown class — nothing to redistribute into.

        const target = nextSeasons.get(realWc);
        if (!target) {
            console.error(`[PVP open reset] no target season for class "${realWc}" (player ${record.playerId}) — skipped.`);
            continue;
        }

        const targetDivision = SOFT_RESET[record.division] || "prospect";
        const dp = divisionFloor(targetDivision);
        try {
            // eslint-disable-next-line no-await-in-loop
            await PVPRecord.create({
                playerId: record.playerId,
                seasonId: target._id,
                weightClass: target.weightClass, // REAL WC (e.g. "Middleweight"), NOT "Open".
                realWeightClass: realWc,
                division: targetDivision,
                dp,
                peakDp: 0,
                overallRating: record.overallRating,
                wins: 0,
                losses: 0,
                winStreak: 0,
                longestStreak: 0,
                defenseGameplan: record.defenseGameplan,
                promotionShield: 0,
                lastFightAt: null,
                lastActiveAt: new Date(),
            });
        } catch (err) {
            if (!(err && err.code === 11000)) {
                console.error(`[PVP open reset] create failed for player ${record.playerId}:`, err.message);
            }
            // dup-key → already redistributed, skip (re-run safe).
        }
    }
}

module.exports = { finalizeSeason, softReset, softResetOpen, applyRewardBundle, awardBadge, hasFought };
