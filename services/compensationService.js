const Compensation = require("../models/compensationModel");
const Fighter = require("../models/fighterModel");
const activityLogService = require("./activityLogService");
const { SOFT_CAP } = require("../consts/shopConfig");

/**
 * One-off goodwill payouts.
 *
 * Currently one campaign: the gym retirement in 1.6. Ten specialty gyms and the free gym were
 * closed, and the six gym-only perks and their badges have no route in the camp that replaced
 * them. Energy Drinks are the payout because the loss was mostly *time* (energy sunk into gym
 * sessions), and a drink converts straight back into training in the new system.
 *
 * ⚠️ THESE TWO CONSTANTS ARE THE CONTRACT. The script, the tests, the changelog and the Library
 * all quote them. Change the amount only before the campaign runs; afterwards a re-run must pay
 * the same number it paid the first time, and the ledger records what each fighter actually got.
 */
const GYM_RETIREMENT_CAMPAIGN = "gym-retirement-1.6";
const GYM_RETIREMENT_DRINKS = 3;

/**
 * Pay one fighter for one campaign, exactly once.
 *
 * Ordering is deliberate and is the whole correctness story:
 *   1. CLAIM  — insert the ledger row. The unique `{fighterId, campaign}` index rejects a second
 *               attempt with E11000, so two concurrent runs cannot both proceed.
 *   2. GRANT  — a single atomic pipeline update that clamps to SOFT_CAP. No read-modify-write,
 *               so a player spending drinks at the same moment cannot lose the grant.
 *   3. STAMP  — record what actually landed and when.
 *
 * A crash between 1 and 2 leaves a claimed-but-ungranted row; calling again completes it. The
 * reverse order would double-pay after a crash, which is the expensive mistake.
 *
 * @param {string|object} fighterId
 * @param {string} campaign
 * @param {number} drinks
 * @returns {Promise<{granted:number, status:"granted"|"already_granted"|"fighter_not_found"|"capped"}>}
 */
async function grantCampaign(fighterId, campaign, drinks) {
    let row;
    try {
        row = await Compensation.create({ fighterId, campaign, drinks });
    } catch (err) {
        if (err && err.code === 11000) {
            row = await Compensation.findOne({ fighterId, campaign });
            // Already paid and stamped — nothing owed. This is the normal re-run path.
            if (!row || row.grantedAt) return { granted: 0, status: "already_granted" };
            // Row exists but was never stamped: a previous run died mid-grant. Finish it.
        } else {
            throw err;
        }
    }

    // `new: false` returns the PRE-update document, which is what makes the actually-granted
    // count knowable without a second read that could race.
    const before = await Fighter.findOneAndUpdate(
        { _id: fighterId },
        [{
            $set: {
                "inventory.energyDrinks": {
                    $min: [
                        { $add: [{ $ifNull: ["$inventory.energyDrinks", 0] }, drinks] },
                        SOFT_CAP,
                    ],
                },
            },
        }],
        { new: false, projection: { "inventory.energyDrinks": 1 } }
    );

    if (!before) {
        // No such fighter. Drop the claim so a later, valid attempt is not blocked by it.
        await Compensation.deleteOne({ _id: row._id });
        return { granted: 0, status: "fighter_not_found" };
    }

    const had = (before.inventory && before.inventory.energyDrinks) || 0;
    const granted = Math.max(0, Math.min(drinks, SOFT_CAP - had));

    row.granted = granted;
    row.grantedAt = new Date();
    await row.save();

    return { granted, status: granted < drinks ? "capped" : "granted" };
}

/**
 * Pay the gym-retirement compensation to one fighter and tell them why.
 *
 * The feed entry is not decoration: drinks appearing in an inventory with no explanation reads
 * as a bug. It is written only on a real grant, so a re-run never spams the feed. A failed log
 * never fails the grant, because the drinks are the promise and the note is the courtesy.
 */
async function grantGymRetirement(fighterId) {
    const result = await grantCampaign(fighterId, GYM_RETIREMENT_CAMPAIGN, GYM_RETIREMENT_DRINKS);

    if (result.status === "granted" || result.status === "capped") {
        const detail = result.granted > 0
            ? `Gym closure goodwill: ${result.granted} Energy Drink${result.granted === 1 ? "" : "s"} added to your inventory.`
            : "Gym closure goodwill: your Energy Drinks were already at the cap, so nothing was added.";
        try {
            await activityLogService.log(fighterId, "GYM_COMPENSATION", detail, {
                campaign: GYM_RETIREMENT_CAMPAIGN,
                drinks: result.granted,
            });
        } catch (err) {
            console.error("[compensation] feed note failed (grant already applied):", err.message);
        }
    }

    return result;
}

module.exports = {
    GYM_RETIREMENT_CAMPAIGN,
    GYM_RETIREMENT_DRINKS,
    grantCampaign,
    grantGymRetirement,
};
