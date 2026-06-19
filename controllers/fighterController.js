const fighterService = require("../services/fighterService");
const dashboardService = require("../services/dashboardService");

async function list(req, res) {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const fighters = await fighterService.listFighters(limit);
        res.json(fighters);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function create(req, res) {
    try {
        const fighter = await fighterService.createFighter(req.body);
        res.status(201).json(fighter);
    } catch (err) {
        // Surface client-fixable validation errors (missing fields, profane name)
        // with their message; everything else is a server error.
        if (err.statusCode === 400 || err.validation || (err.message && err.message.includes("required"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getById(req, res) {
    try {
        const fighter = await fighterService.getFighterById(req.params.id);
        const statProgress = fighterService.buildStatProgress(fighter);
        res.json({ ...fighter, statProgress });
    } catch (err) {
        if (err.message === "Fighter not found") {
            return res.status(404).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function update(req, res) {
    try {
        const fighter = await fighterService.updateFighter(req.params.id, req.body);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") {
            return res.status(404).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function deductEnergy(req, res) {
    try {
        const amount = parseInt(req.body.amount || req.query.amount, 10) || 1;
        const fighter = await fighterService.deductEnergy(req.params.id, amount);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") res.status(404).json({ message: err.message });
        else if (err.message === "Not enough energy") res.status(400).json({ message: err.message });
        else {
            console.error(err);
            res.status(500).json({ message: "Internal server error" });
        }
    }
}

function isDebugEnergyRechargeAllowed() {
    return process.env.NODE_ENV !== "production" || process.env.DEBUG_ALLOW_ENERGY_RECHARGE === "1";
}

/** DEBUG: refill energy to max (disabled in production unless DEBUG_ALLOW_ENERGY_RECHARGE=1). */
async function debugRechargeEnergy(req, res) {
    if (!isDebugEnergyRechargeAllowed()) {
        return res.status(404).json({ message: "Not found" });
    }
    try {
        const fighter = await fighterService.debugRefillEnergyToMax(req.params.id);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function train(req, res) {
    try {
        const { id } = req.params;
        const { gymId, sessionType, quantity } = req.body;
        if (!gymId || !sessionType) {
            return res.status(400).json({ message: "gymId and sessionType are required" });
        }
        if (quantity !== undefined && !(Number.isInteger(quantity) && quantity >= 1)) {
            return res.status(400).json({ message: "quantity must be an integer >= 1" });
        }
        const trainingService = require("../services/trainingService");
        const result = await trainingService.doTraining(id, gymId, sessionType, quantity ?? 1);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message === "Gym not found") return res.status(404).json({ message: err.message });
        if (err.message === "Not enough energy" || err.message === "Unknown training session type"
            || err.message.includes("gym") || err.message.startsWith("Cannot spar")
            || err.message.startsWith("Cannot do")) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function doctorVisit(req, res) {
    try {
        const { injuryType } = req.body;
        if (!injuryType) return res.status(400).json({ message: "injuryType is required" });
        const fighter = await fighterService.doctorVisit(req.params.id, injuryType);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("Not enough") || err.message.includes("not found") || err.message.includes("not require"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function hospitalSkipRecovery(req, res) {
    try {
        const { injuryType } = req.body;
        if (!injuryType) return res.status(400).json({ message: "injuryType is required" });
        const fighter = await fighterService.hospitalSkipRecovery(req.params.id, injuryType);
        res.json(fighter);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("Not enough") || err.message.includes("not found") || err.message.includes("not eligible"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function hospitalFullRecovery(req, res) {
    try {
        const result = await fighterService.hospitalFullRecovery(req.params.id);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("Not enough") || err.message.includes("No active"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function hospitalQuote(req, res) {
    try {
        const quote = await fighterService.hospitalQuote(req.params.id);
        res.json(quote);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function hospitalRestoreHealth(req, res) {
    try {
        const { package: packageKey } = req.body;
        if (!packageKey) return res.status(400).json({ message: "package is required" });
        const result = await fighterService.hospitalRestoreHealth(req.params.id, packageKey);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message && (err.message.includes("Not enough") || err.message.includes("already full") || err.message.includes("Unknown"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}


async function switchGym(req, res) {
    try {
        const fighter = await fighterService.switchGym(req.params.id, req.body.gymId);
        res.json({ fighter, message: "Gym membership activated." });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function rankUpGym(req, res) {
    try {
        const Gym = require("../models/gymModel");
        const Fighter = require("../models/fighterModel");
        const gymRankService = require("../services/gymRankService");

        const fighter = await Fighter.findById(req.params.id);
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });
        const gym = await Gym.findById(req.body.gymId);
        if (!gym) return res.status(404).json({ message: "Gym not found" });

        const result = gymRankService.attemptManualRankUp(fighter, gym);
        await fighter.save();
        res.json({ fighter: fighterService.toPublicFighter(fighter), rankUp: result });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

async function notorietyLeaderboard(req, res) {
    try {
        const Fighter = require("../models/fighterModel");
        const { NOTORIETY_TIERS } = require("../consts/notorietyConfig");
        const list = await Fighter.find({})
            .sort({ "notoriety.score": -1 })
            .limit(20)
            .select("firstName lastName nickname overallRating notoriety weightClass")
            .lean();
        const rows = list.map((f) => {
            const n = f.notoriety;
            const score = typeof n === "object" && n != null ? n.score ?? 0 : Number(n) || 0;
            const peakTier = typeof n === "object" && n != null ? n.peakTier : "UNKNOWN";
            const def = NOTORIETY_TIERS[peakTier] || NOTORIETY_TIERS.UNKNOWN;
            return {
                id: f._id,
                name: `${f.firstName} ${f.lastName}`,
                nickname: f.nickname,
                overallRating: f.overallRating,
                weightClass: f.weightClass,
                notorietyScore: score,
                peakTier,
                tierLabel: def.label,
            };
        });
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getChampions(req, res) {
    try {
        const Fighter = require("../models/fighterModel");
        const Opponent = require("../models/opponentModel");
        const fighter = await Fighter.findById(req.params.id).lean();
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });
        const { CHAMPION_TIERS } = require("../services/championService");
        const champions = await Opponent.find({
            isChampion: true,
            weightClass: fighter.weightClass,
            championTier: { $in: CHAMPION_TIERS },
        }).select("name nickname overallRating style championTier record").lean();
        res.json({ champions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getActivity(req, res) {
    try {
        const ActivityLog = require("../models/activityLogModel");
        const logs = await ActivityLog
            .find({ fighterId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();
        res.json({ activity: logs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getDashboard(req, res) {
    try {
        const dashboard = await dashboardService.buildDashboard(req.params.id);
        res.json(dashboard);
    } catch (err) {
        if (err.message === "Fighter not found") {
            return res.status(404).json({ message: "Fighter not found" });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function mediaEventStub(req, res) {
    res.status(501).json({
        message: "Media events are not implemented yet. (Post-fight interview, weigh-in, podcast, etc.)",
    });
}

async function getFameEvents(req, res) {
    try {
        const notorietyService = require("../services/notorietyService");
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
        const events = await notorietyService.listRecentFameEvents(req.params.id, limit);
        res.json({ events });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getBannerCatalog(req, res) {
    try {
        const Fighter = require("../models/fighterModel");
        const bannerService = require("../services/bannerService");
        const fighter = await Fighter.findById(req.params.id).lean();
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });
        res.json(bannerService.buildCatalogFor(fighter));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function getCalloutRoster(req, res) {
    try {
        const calloutService = require("../services/calloutService");
        const data = await calloutService.listRoster(req.params.id);
        res.json(data);
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function createCallout(req, res) {
    try {
        const calloutService = require("../services/calloutService");
        const { opponentId } = req.body || {};
        if (!opponentId) return res.status(400).json({ message: "opponentId is required" });
        const result = await calloutService.createCallout(req.params.id, opponentId);
        res.status(201).json(result);
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "Opponent not found") {
            return res.status(404).json({ message: err.message });
        }
        const clientErrors = [
            "You already have an active callout — cancel it first",
            "Wrong weight class",
            "Cannot call out a champion",
            "Opponent is outside your callable tier range",
        ];
        if (clientErrors.includes(err.message) || (err.message && err.message.startsWith("Not enough fame"))) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function cancelCallout(req, res) {
    try {
        const calloutService = require("../services/calloutService");
        const result = await calloutService.cancelCallout(req.params.id);
        res.json(result);
    } catch (err) {
        if (err.message === "Fighter not found" || err.message === "No active callout") {
            return res.status(404).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

// ── Career Page / badge system ─────────────────────────────────

const PROFILE_TIER_ORDER = ["Amateur", "Regional Pro", "National", "GCS Contender", "GCS"];
const BELT_BADGE_BY_TIER = {
    "Amateur": "champ_amateur",
    "Regional Pro": "champ_regional_pro",
    "National": "champ_national",
    "GCS Contender": "champ_gcs_contender",
    "GCS": "champ_gcs",
};

/**
 * GET /fighters/:id/profile — Career Page payload.
 * Returns { fighter, belts[5], badges, pvp:null }.
 */
async function getCareerProfile(req, res) {
    try {
        const Fighter = require("../models/fighterModel");
        const badgeService = require("../services/badgeService");
        const { tierRank } = require("../consts/notorietyConfig");
        const { PROMOTION_TIERS } = require("../consts/gameConstants");

        const fighter = await Fighter.findById(req.params.id).populate("gymId", "name");
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });

        // Lazy self-heal: award any state-derivable badges the fighter now qualifies for
        // (e.g. championship badges proven by promotion tier) so the belts and the badge
        // grid always agree, without depending on the one-time migration. Silent (no feed).
        try {
            const healed = badgeService.evaluateBadges(fighter, {}, { silent: true });
            if (healed.newlyEarned.length > 0) await fighter.save();
        } catch (_) { /* non-fatal — fall back to whatever is already stored */ }

        const earnedIds = new Set((fighter.badgesEarned || []).map((b) => b && b.badgeId).filter(Boolean));

        // Belt accessibility compares promotion-tier ladder ordering.
        const PROMOTION_TIER_ORDER = Object.keys(PROMOTION_TIERS); // Amateur..GCS in ladder order
        const promoRank = (t) => {
            const idx = PROMOTION_TIER_ORDER.indexOf(t);
            return idx < 0 ? 0 : idx;
        };
        const playerPromoRank = promoRank(fighter.promotionTier);

        const belts = PROMOTION_TIER_ORDER.map((tier) => {
            const badgeId = BELT_BADGE_BY_TIER[tier] || null;
            const winnable = tier !== "GCS Contender";
            let state;
            if (winnable && badgeId && earnedIds.has(badgeId)) {
                state = "won";
            } else if (promoRank(tier) <= playerPromoRank) {
                state = "accessible";
            } else {
                state = "locked";
            }
            // GCS Contender belt is never "won" (non-winnable), but can be accessible/locked.
            return { tier, badgeId, state, winnable };
        });

        res.json({
            fighter: fighterService.toPublicFighter(fighter),
            belts,
            badges: badgeService.buildBadgeProfile(fighter),
            pvp: null,
        });
        // tierRank referenced for parity with contract intent; promotion-tier ordering
        // is the authoritative comparison for belt accessibility.
        void tierRank;
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * PUT /fighters/:id/pinned-badges — set up to 3 pinned (earned) badges.
 */
async function setPinnedBadges(req, res) {
    try {
        const Fighter = require("../models/fighterModel");
        const { getBadge } = require("../consts/badgeCatalog");

        const raw = req.body && req.body.pinnedBadges;
        if (!Array.isArray(raw)) {
            return res.status(400).json({ message: "pinnedBadges must be an array of badge ids" });
        }
        if (!raw.every((x) => typeof x === "string")) {
            return res.status(400).json({ message: "pinnedBadges must be an array of strings" });
        }
        // Dedupe preserving order.
        const deduped = [];
        for (const id of raw) {
            if (!deduped.includes(id)) deduped.push(id);
        }
        if (deduped.length > 3) {
            return res.status(400).json({ message: "You can pin at most 3 badges" });
        }

        const fighter = await Fighter.findById(req.params.id);
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });

        const earnedIds = new Set((fighter.badgesEarned || []).map((b) => b && b.badgeId).filter(Boolean));
        for (const id of deduped) {
            if (!getBadge(id) || !earnedIds.has(id)) {
                return res.status(400).json({
                    message: "Cannot pin a badge you have not earned",
                    code: "BADGE_NOT_EARNED",
                });
            }
        }

        fighter.pinnedBadges = deduped;
        await fighter.save();
        res.json({ pinnedBadges: deduped });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * POST /fighters/:id/badges/seen — acknowledge all newly-unlocked badges
 * (clears the "NEW" highlight / unlock modal). Idempotent.
 */
async function markBadgesSeen(req, res) {
    try {
        const Fighter = require("../models/fighterModel");
        const badgeService = require("../services/badgeService");
        const fighter = await Fighter.findById(req.params.id);
        if (!fighter) return res.status(404).json({ message: "Fighter not found" });
        const changed = badgeService.markBadgesSeen(fighter);
        if (changed > 0) await fighter.save();
        res.json({ acknowledged: changed });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function saveBanner(req, res) {
    try {
        const bannerService = require("../services/bannerService");
        const banner = await bannerService.saveBanner(req.params.id, req.body || {});
        res.json({ banner });
    } catch (err) {
        if (err.message === "Fighter not found") return res.status(404).json({ message: err.message });
        if (err.message?.startsWith("Unknown banner piece")
            || err.message?.startsWith("Piece ")) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = {
    list,
    create,
    getById,
    update,
    deductEnergy,
    debugRechargeEnergy,
    train,
    doctorVisit,
    switchGym,
    rankUpGym,
    notorietyLeaderboard,
    getChampions,
    getActivity,
    getDashboard,
    mediaEventStub,
    getFameEvents,
    getBannerCatalog,
    saveBanner,
    getCareerProfile,
    setPinnedBadges,
    markBadgesSeen,
    getCalloutRoster,
    createCallout,
    cancelCallout,
    hospitalSkipRecovery,
    hospitalFullRecovery,
    hospitalQuote,
    hospitalRestoreHealth,
};
