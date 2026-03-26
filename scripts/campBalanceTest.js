/**
 * Camp v2 Balance Simulation — conditional bonus impact analysis.
 *
 * Runs fight simulations across 5 scenarios to verify:
 * 1. Perfect camp (S-rated) does not produce >70% win rate vs equal opponent
 * 2. No camp gives ~45-50% win rate
 * 3. Mismatched camp performs similar to no camp
 * 4. Partial-only (Game Plan Study) gives modest improvement
 * 5. Mixed camp across styles — bonuses fire only when relevant
 *
 * Also tests at Amateur, National, and GCS stat levels.
 *
 * Usage:
 *   node scripts/campBalanceTest.js [runsPerScenario]
 *   node scripts/campBalanceTest.js 200
 */

const { resolveFight } = require("../utils/fightResolution");
const { buildSessionBonuses } = require("../services/campService");
const {
    SESSION_BONUSES,
    MATCH_STATUSES,
    WILDCARD_DESCRIPTIONS,
    STAT_COUNTER_SESSION,
} = require("../consts/campConfig");

const RUNS = parseInt(process.argv[2], 10) || 100;

// ── Fighter builders ────────────────────────────────────────────────────────

function makeFighter(baseStats) {
    return {
        health: 100, stamina: 100,
        str: baseStats.str, spd: baseStats.spd, leg: baseStats.leg, wre: baseStats.wre,
        gnd: baseStats.gnd, sub: baseStats.sub, chn: baseStats.chn, fiq: baseStats.fiq,
    };
}

const STAT_LEVELS = {
    Amateur:  { str: 18, spd: 16, leg: 14, wre: 12, gnd: 10, sub: 10, chn: 14, fiq: 10 },
    National: { str: 50, spd: 45, leg: 42, wre: 38, gnd: 35, sub: 30, chn: 40, fiq: 35 },
    GCS:      { str: 75, spd: 70, leg: 68, wre: 65, gnd: 60, sub: 55, chn: 65, fiq: 60 },
};

// ── Session bonus builders ──────────────────────────────────────────────────

function makeSessionBonuses(sessionTypes, matchStatus = MATCH_STATUSES.MATCHED) {
    const sessions = sessionTypes.map((type, i) => ({
        sessionType: type,
        slotIndex: i,
        energySpent: 5,
        matchStatus,
        pointsEarned: matchStatus === MATCH_STATUSES.MATCHED ? 3 : matchStatus === MATCH_STATUSES.PARTIAL ? 1 : 0,
        diminishingFactor: 1.0,
    }));
    return buildSessionBonuses(sessions);
}

function makeWildcard(stat = 'gnd') {
    return {
        stat,
        value: 30,
        description: WILDCARD_DESCRIPTIONS[stat] || 'has a hidden skill',
        counterSession: STAT_COUNTER_SESSION[stat] || 'GAME_PLAN_STUDY',
        fightEffect: 0.15,
    };
}

// ── Simulation runner ───────────────────────────────────────────────────────

function runSimulation(playerStats, opponentStats, sessionBonuses, wildcard, runs) {
    let wins = 0, losses = 0, draws = 0;
    let totalPlayerDmg = 0, totalOppDmg = 0;
    const triggerCounts = {};
    let wildcardFired = 0, wildcardCountered = 0;

    for (const b of sessionBonuses) {
        triggerCounts[b.sessionType] = { triggered: 0, total: 0 };
    }

    for (let i = 0; i < runs; i++) {
        // Reset bonus state for each fight
        for (const b of sessionBonuses) {
            b.triggered = false;
            b.triggerCount = 0;
        }

        const player = makeFighter(playerStats);
        const opponent = makeFighter(opponentStats);
        const bonusCopy = sessionBonuses.map(b => ({ ...b, triggered: false, triggerCount: 0 }));

        const result = resolveFight(player, opponent, {
            sessionBonuses: bonusCopy,
            wildcard: wildcard ? { ...wildcard } : null,
            playerName: "Player",
            opponentName: "Opponent",
        });

        if (result.winner === "player") wins++;
        else if (result.winner === "opponent") losses++;
        else draws++;

        // Aggregate damage
        for (const r of result.rounds) {
            totalPlayerDmg += r.playerDamage;
            totalOppDmg += r.opponentDamage;
        }

        // Track trigger counts
        for (const b of bonusCopy) {
            if (triggerCounts[b.sessionType]) {
                triggerCounts[b.sessionType].total++;
                if (b.triggered) triggerCounts[b.sessionType].triggered++;
            }
        }

        // Track wildcard
        if (result.wildcard) {
            wildcardFired++;
            if (result.wildcard.countered) wildcardCountered++;
        }
    }

    return {
        wins, losses, draws, runs,
        winRate: ((wins / runs) * 100).toFixed(1),
        lossRate: ((losses / runs) * 100).toFixed(1),
        avgPlayerDmg: (totalPlayerDmg / runs).toFixed(1),
        avgOppDmg: (totalOppDmg / runs).toFixed(1),
        triggerCounts,
        wildcardFired,
        wildcardCountered,
    };
}

// ── Scenarios ───────────────────────────────────────────────────────────────

function runAllScenarios(tier, stats) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  TIER: ${tier} (stats: STR=${stats.str} SPD=${stats.spd} WRE=${stats.wre} ...)`);
    console.log(`  Runs per scenario: ${RUNS}`);
    console.log(`${"=".repeat(70)}`);

    // Scenario 1: Perfect camp (matched + sparring for Wrestler opponent)
    const perfectBonuses = makeSessionBonuses(
        ['SPARRING_GENERAL', 'TAKEDOWN_DEFENCE', 'CARDIO_PUSH'],
        MATCH_STATUSES.MATCHED
    );
    const wc1 = makeWildcard('spd');
    const s1 = runSimulation(stats, stats, perfectBonuses, wc1, RUNS);
    printResult("1. Perfect camp (Spar+TD+Cardio) vs equal", s1);

    // Scenario 2: No camp
    const s2 = runSimulation(stats, stats, [], null, RUNS);
    printResult("2. No camp vs equal", s2);

    // Scenario 3: Mismatched camp (all UNMATCHED)
    const mismatchBonuses = makeSessionBonuses(
        ['BODY_SHOT_FOCUS', 'CLINCH_CONTROL', 'STRIKING_ACCURACY'],
        MATCH_STATUSES.UNMATCHED
    );
    const s3 = runSimulation(stats, stats, mismatchBonuses, null, RUNS);
    printResult("3. Mismatched camp (UNMATCHED) vs equal", s3);

    // Scenario 4: Partial-only (all Game Plan Study)
    const partialBonuses = makeSessionBonuses(
        ['GAME_PLAN_STUDY', 'GAME_PLAN_STUDY', 'GAME_PLAN_STUDY'],
        MATCH_STATUSES.PARTIAL
    );
    const s4 = runSimulation(stats, stats, partialBonuses, null, RUNS);
    printResult("4. Partial-only (Game Plan Study x3) vs equal", s4);

    // Scenario 5: Mixed camp with sparring
    const mixedBonuses = makeSessionBonuses(
        ['SPARRING_GENERAL', 'TAKEDOWN_DEFENCE', 'GAME_PLAN_STUDY'],
        MATCH_STATUSES.MATCHED
    );
    // Override Game Plan Study to PARTIAL
    const gpsBonus = mixedBonuses.find(b => b.sessionType === 'GAME_PLAN_STUDY');
    if (gpsBonus) {
        gpsBonus.matchStatus = MATCH_STATUSES.PARTIAL;
        gpsBonus.effectiveValue = gpsBonus.bonusValue * 0.5;
    }
    const wc5 = makeWildcard('leg');
    const s5 = runSimulation(stats, stats, mixedBonuses, wc5, RUNS);
    printResult("5. Mixed camp (Spar+TD_Def+GPS) vs equal", s5);

    // Balance checks
    console.log("\n  BALANCE CHECKS:");
    const checks = [
        { name: "Perfect camp win rate < 70%", pass: parseFloat(s1.winRate) < 70, actual: s1.winRate + "%" },
        { name: "No camp win rate 35-55%", pass: parseFloat(s2.winRate) >= 35 && parseFloat(s2.winRate) <= 55, actual: s2.winRate + "%" },
        { name: "Mismatched ≈ no camp (±10%)", pass: Math.abs(parseFloat(s3.winRate) - parseFloat(s2.winRate)) < 10, actual: `${s3.winRate}% vs ${s2.winRate}%` },
        { name: "Partial < Perfect", pass: parseFloat(s4.winRate) < parseFloat(s1.winRate), actual: `${s4.winRate}% vs ${s1.winRate}%` },
    ];

    for (const c of checks) {
        const icon = c.pass ? "PASS" : "FAIL";
        console.log(`    [${icon}] ${c.name} → ${c.actual}`);
    }
}

function printResult(label, result) {
    console.log(`\n  ${label}:`);
    console.log(`    Win: ${result.winRate}%  Loss: ${result.lossRate}%  Draw: ${result.draws}/${result.runs}`);
    console.log(`    Avg damage taken: ${result.avgPlayerDmg}  Avg damage dealt: ${result.avgOppDmg}`);

    const triggerKeys = Object.keys(result.triggerCounts);
    if (triggerKeys.length > 0) {
        console.log(`    Session triggers:`);
        for (const key of triggerKeys) {
            const t = result.triggerCounts[key];
            const rate = t.total > 0 ? ((t.triggered / t.total) * 100).toFixed(0) : "0";
            console.log(`      ${key}: ${t.triggered}/${t.total} fights (${rate}%)`);
        }
    }
    if (result.wildcardFired > 0) {
        console.log(`    Wildcard: fired=${result.wildcardFired} countered=${result.wildcardCountered}`);
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log("Camp v2 Balance Simulation");
console.log("─".repeat(70));

for (const [tier, stats] of Object.entries(STAT_LEVELS)) {
    runAllScenarios(tier, stats);
}

console.log(`\n${"=".repeat(70)}`);
console.log("  Simulation complete.");
console.log(`${"=".repeat(70)}\n`);
