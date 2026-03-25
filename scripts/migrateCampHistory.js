/**
 * Migration script: generates fake records and fight history for all existing Opponent documents.
 * Fight history is used to produce the Fighter Report card during camp preparation.
 *
 * Generation strategy:
 *   - Opponents with a 0-0-0 record are assigned a plausible record based on their promotionTier first.
 *   - Number of history entries = record.wins + record.losses + record.draws
 *   - Win methods are distributed by style probability tables
 *   - Loss methods are influenced by CHN stat (lower CHN → higher KO loss probability)
 *   - Rounds are randomised (1–3 for finishes, 1–5 for decisions)
 *
 * Run:  node scripts/migrateCampHistory.js
 * Safe: only updates opponents that have fightHistory.length === 0
 */

const mongoose = require("mongoose");
const config = require("../config");
const Opponent = require("../models/opponentModel");

// ── Win method probability tables per style ───────────────────────────────────
const WIN_METHOD_BY_STYLE = {
    Wrestler:              [{ method: "KO/TKO", weight: 0.50 }, { method: "Submission", weight: 0.25 }, { method: "Decision", weight: 0.25 }],
    "Brazilian Jiu-Jitsu": [{ method: "Submission", weight: 0.60 }, { method: "KO/TKO", weight: 0.10 }, { method: "Decision", weight: 0.30 }],
    Boxer:                 [{ method: "KO/TKO", weight: 0.55 }, { method: "Decision", weight: 0.40 }, { method: "Submission", weight: 0.05 }],
    Kickboxer:             [{ method: "KO/TKO", weight: 0.45 }, { method: "Decision", weight: 0.45 }, { method: "Submission", weight: 0.10 }],
    "Muay Thai":           [{ method: "KO/TKO", weight: 0.45 }, { method: "Decision", weight: 0.45 }, { method: "Submission", weight: 0.10 }],
    Judo:                  [{ method: "KO/TKO", weight: 0.35 }, { method: "Submission", weight: 0.35 }, { method: "Decision", weight: 0.30 }],
    Sambo:                 [{ method: "Submission", weight: 0.50 }, { method: "KO/TKO", weight: 0.25 }, { method: "Decision", weight: 0.25 }],
    Capoeira:              [{ method: "KO/TKO", weight: 0.35 }, { method: "Decision", weight: 0.55 }, { method: "Submission", weight: 0.10 }],
};

/**
 * Pick a method by weighted probability.
 */
function pickByWeight(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * total;
    for (const entry of entries) {
        roll -= entry.weight;
        if (roll <= 0) return entry.method;
    }
    return entries[entries.length - 1].method;
}

/**
 * Pick a loss method influenced by CHN stat.
 * Lower CHN = more likely to be KO'd; higher CHN = more likely to lose by decision or submission.
 */
function pickLossMethod(chn) {
    const chinNorm = Math.min(100, Math.max(1, chn || 10));
    const koWeight = Math.max(0.1, 0.7 - (chinNorm / 100) * 0.5);    // 0.1 – 0.7
    const subWeight = 0.15;
    const decWeight = Math.max(0.15, 1 - koWeight - subWeight);
    return pickByWeight([
        { method: "Loss (KO/TKO)", weight: koWeight },
        { method: "Loss (submission)", weight: subWeight },
        { method: "Loss (decision)", weight: decWeight },
    ]);
}

/**
 * Generate a round number: 1–3 for finishes, 1–5 for decisions.
 */
function randomRound(method) {
    const isFinish = method !== "Decision" && method !== "Loss (decision)";
    return isFinish ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 5) + 1;
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate a plausible win/loss/draw record based on promotion tier.
 * Mirrors the same logic in seedOpponentsAndGym.js.
 */
function generateRecord(promotionTier) {
    const ranges = {
        Amateur:         { wins: [1, 5],   losses: [0, 3], drawChance: 0.10 },
        "Regional Pro":  { wins: [4, 12],  losses: [1, 5], drawChance: 0.08 },
        National:        { wins: [8, 20],  losses: [2, 7], drawChance: 0.06 },
        "GCS Contender": { wins: [14, 28], losses: [2, 8], drawChance: 0.05 },
        GCS:             { wins: [20, 38], losses: [3, 10], drawChance: 0.04 },
    };
    const r = ranges[promotionTier] || ranges.Amateur;
    const wins   = randInt(r.wins[0],   r.wins[1]);
    const losses = randInt(r.losses[0], r.losses[1]);
    const draws  = Math.random() < r.drawChance ? randInt(1, 2) : 0;
    return { wins, losses, draws };
}

/**
 * Generate fight history for a single opponent.
 */
function generateFightHistory(opponent) {
    const { wins = 0, losses = 0, draws = 0 } = opponent.record || {};
    const style = opponent.style;
    const winTable = WIN_METHOD_BY_STYLE[style] || WIN_METHOD_BY_STYLE.Boxer;
    const history = [];

    for (let i = 0; i < wins; i++) {
        const method = pickByWeight(winTable);
        history.push({ result: "win", method, round: randomRound(method) });
    }
    for (let i = 0; i < losses; i++) {
        const method = pickLossMethod(opponent.chn);
        history.push({ result: "loss", method, round: randomRound(method) });
    }
    for (let i = 0; i < draws; i++) {
        history.push({ result: "draw", method: "Decision", round: 5 });
    }

    // Shuffle to avoid all wins appearing first
    for (let i = history.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [history[i], history[j]] = [history[j], history[i]];
    }
    return history;
}

async function run() {
    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    const opponents = await Opponent.find({ $or: [{ fightHistory: { $exists: false } }, { fightHistory: { $size: 0 } }] });
    console.log(`Found ${opponents.length} opponents without fight history`);

    let updated = 0;
    for (const opp of opponents) {
        const existingWins   = opp.record?.wins   ?? 0;
        const existingLosses = opp.record?.losses ?? 0;
        const existingDraws  = opp.record?.draws  ?? 0;
        const hasRecord = (existingWins + existingLosses + existingDraws) > 0;

        // If the opponent is still 0-0-0, assign them a proper record first
        const record = hasRecord
            ? { wins: existingWins, losses: existingLosses, draws: existingDraws }
            : generateRecord(opp.promotionTier);

        const fightHistory = generateFightHistory({ ...opp.toObject(), record });

        await Opponent.updateOne({ _id: opp._id }, { $set: { record, fightHistory } });
        updated++;
    }

    console.log(`Updated ${updated} opponents with records and fight history`);
    await mongoose.disconnect();
    console.log("Done.");
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

// ── Also export the generator so the seed script can use it ──────────────────
module.exports = { generateFightHistory };
