/**
 * Monte Carlo for the debut bout (docs/first-session-contract.md C.3).
 *
 * NO DB. This script never opens a database or Redis connection: it requires ONLY the pure
 * fight engine (utils/fightResolution), utils/overallRating, utils/startingStats,
 * consts/gameConstants, consts/campConfig and data/debutOpponents.json. It must never
 * require config, a model, a service or lib/redis. Safe to run from any folder:
 *
 *   node scripts/simDebutOvr.js [--n=300] [--scale=1.0]
 *
 * Grid: 8 styles x (6 backstories + none) x 16 debut opponents x 2 camp modes x N runs.
 * Player: built exactly as fighterService.createFighter builds a new fighter
 * (buildStartingStats, health 100, stamina = maxStamina = 100 + backstory bonus; Easy
 * weight cut rolls 0). Opponent: the JSON entry as seeded (strategy null).
 * Camp modes:
 *   "none"    = camp skipped: no session bonuses, no wildcard (campService.finaliseCamp skip).
 *   "matched" = the 2 Amateur slots filled with STYLE_SESSION_MAP[opp.style].slice(0, 2),
 *               shaped like campService.buildSessionBonuses (MATCHED, no diminishing), plus
 *               the hidden wildcard a finalised camp always rolls (campService.generateWildcard,
 *               countered when a picked session is its counterSession). The contract sketch
 *               had wildcard null; the real finalise always rolls one, so it is modelled here.
 * Win = KO/TKO, Submission, Decision (unanimous), Decision (split).
 * --scale multiplies every opponent stat (clamped 1..100, OVR recomputed) to explore.
 *
 * Target: about 90% with a matched camp, no style x backstory cell under 80%, no camp not
 * above 95% (a loss must stay possible).
 *
 * Tuning notes (2026-11-04). The committed data/debutOpponents.json is debut OVR 8 to 9:
 * style primaries about 11, other stats about 9, and STR / SPD / LEG capped at 7. The caps are
 * what the sim asked for: a new BJJ fighter starts with SPD 8 / LEG 8 and loses decisions
 * to any debut striker at SPD or LEG 9+ (a cliff: 55% at OVR 10 with uncapped strikers),
 * while softer grappling stats barely move the other styles. Uncapped OVR 9 to 10 boards
 * hit about 91% overall but left BJJ / Sambo cells at 50 to 70%. The engine also floors at
 * about 94 to 95% even against OVR 7 opponents, so "about 90%" is close to the ceiling.
 *
 * RESULT for the committed JSON:
 * Debut Monte Carlo: N=300 per cell, scale=1, 537600 fights, no DB.
 * Overall win rate  no camp: 87.7%   matched camp: 92.0%
 *
 * Win rate by style x backstory, camp: none
 * Style (OVR range)                  (none) Street Fight College Wres Kickboxing C Army Veteran  MMA Prodigy Late Bloomer
 * Boxer (13-15)                       82.7%        83.2%        85.6%        81.5%        83.1%        85.0%        82.3%
 * Kickboxer (13-15)                   83.6%        83.6%        88.0%        82.1%        84.2%        85.2%        84.4%
 * Wrestler (14-16)                    91.0%        92.1%        94.3%        91.4%        91.2%        94.0%        91.6%
 * Brazilian Jiu-Jitsu (13-15)         83.4%        89.0%        87.2%        89.5%        86.5%        90.9%        82.6%
 * Muay Thai (13-15)                   85.2%        85.2%        89.9%        86.5%        86.4%        87.3%        86.2%
 * Judo (13-15)                        92.5%        91.9%        93.9%        91.9%        91.9%        93.8%        92.0%
 * Sambo (13-15)                       91.0%        91.5%        93.3%        90.8%        91.4%        91.4%        89.7%
 * Capoeira (13-15)                    82.0%        83.3%        87.0%        82.8%        83.7%        84.8%        83.3%
 * Worst cell (none): Boxer / Kickboxing Champion 81.5%
 *
 * Win rate by style x backstory, camp: matched
 * Style (OVR range)                  (none) Street Fight College Wres Kickboxing C Army Veteran  MMA Prodigy Late Bloomer
 * Boxer (13-15)                       88.7%        88.8%        91.1%        87.3%        88.5%        89.5%        88.3%
 * Kickboxer (13-15)                   88.8%        88.8%        92.5%        88.6%        89.5%        90.1%        88.5%
 * Wrestler (14-16)                    95.1%        95.1%        96.7%        95.1%        94.8%        95.5%        94.5%
 * Brazilian Jiu-Jitsu (13-15)         89.2%        92.9%        92.2%        93.3%        90.5%        94.1%        88.8%
 * Muay Thai (13-15)                   90.7%        90.3%        93.8%        90.5%        90.3%        91.9%        91.1%
 * Judo (13-15)                        95.4%        95.0%        97.0%        95.1%        95.0%        95.6%        95.3%
 * Sambo (13-15)                       94.2%        94.0%        96.4%        94.3%        94.4%        95.0%        94.0%
 * Capoeira (13-15)                    89.0%        88.8%        92.0%        88.9%        88.5%        90.7%        88.9%
 * Worst cell (matched): Boxer / Kickboxing Champion 87.3%
 *
 * Per opponent (no camp / matched camp):
 *   Featherweight Tommy Reyes-Bell   Boxer                OVR  9    87.2% /  87.5%
 *   Featherweight Jakub Nowicki      Wrestler             OVR  9    87.4% /  94.1%
 *   Featherweight Lewis Ofori        Capoeira             OVR  8    89.6% /  89.5%
 *   Featherweight Arturo Valle       Sambo                OVR  9    85.4% /  93.0%
 *   Lightweight   Dean Hollis        Kickboxer            OVR  8    89.1% /  95.0%
 *   Lightweight   Marek Szabo        Brazilian Jiu-Jitsu  OVR  9    86.0% /  93.3%
 *   Lightweight   Kofi Mensah-Lord   Muay Thai            OVR  8    89.3% /  89.5%
 *   Lightweight   Ricky Dunmore      Judo                 OVR  9    86.6% /  93.5%
 *   Middleweight  Gareth Pryce       Wrestler             OVR  9    87.0% /  93.6%
 *   Middleweight  Nico Albescu       Boxer                OVR  9    89.0% /  89.1%
 *   Middleweight  Sean Callow        Judo                 OVR  9    87.4% /  94.2%
 *   Middleweight  Ibrahim Tarek      Kickboxer            OVR  8    88.7% /  94.9%
 *   Heavyweight   Victor Larsen      Muay Thai            OVR  8    89.3% /  88.9%
 *   Heavyweight   Ollie Brannigan    Sambo                OVR  9    85.7% /  93.3%
 *   Heavyweight   Darius Moldovan    Brazilian Jiu-Jitsu  OVR  9    86.4% /  93.8%
 *   Heavyweight   Hank Pruitt        Capoeira             OVR  9    88.7% /  88.9%
 */
// No DB: process.env.MONGODB_URI and friends are never read here.

const path = require("path");
const fs = require("fs");
const { resolveFight } = require("../utils/fightResolution");
const { calculateOverall } = require("../utils/overallRating");
const { buildStartingStats } = require("../utils/startingStats");
const { STYLES, BACKSTORIES } = require("../consts/gameConstants");
const {
    STYLE_SESSION_MAP, SESSION_BONUSES, MATCH_STATUS_MULTIPLIERS, CAMP_SESSIONS, STAT_COUNTER_SESSION,
} = require("../consts/campConfig");

const STAT_KEYS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];
const WIN_OUTCOMES = new Set(["KO/TKO", "Submission", "Decision (unanimous)", "Decision (split)"]);

function arg(name, fallback) {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    const v = Number(hit.split("=")[1]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

const N = Math.round(arg("n", 300));
const SCALE = arg("scale", 1);

function loadOpponents() {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "debutOpponents.json"), "utf8"));
    return raw.map((o) => {
        const opp = { ...o, strategy: null };
        if (SCALE !== 1) {
            for (const k of STAT_KEYS) opp[k] = Math.max(1, Math.min(100, Math.round(opp[k] * SCALE)));
            opp.overallRating = calculateOverall(opp);
        }
        return opp;
    });
}

function buildPlayer(style, backstory) {
    const built = buildStartingStats(style, backstory);
    const maxStamina = 100 + (built.maxStaminaBonus || 0);
    delete built.maxStaminaBonus;
    const p = { style, ...built, health: 100, maxStamina, stamina: maxStamina };
    p.overallRating = calculateOverall(p);
    return p;
}

/** Same shape as campService.buildSessionBonuses for MATCHED sessions, factor 1. */
function matchedSessionBonuses(oppStyle) {
    return (STYLE_SESSION_MAP[oppStyle] || []).slice(0, 2).map((sessionType) => {
        const cfg = SESSION_BONUSES[sessionType];
        const mult = MATCH_STATUS_MULTIPLIERS.MATCHED;
        return {
            sessionType,
            label: CAMP_SESSIONS[sessionType]?.label ?? sessionType,
            matchStatus: "MATCHED",
            bonusType: cfg.bonusType,
            bonusValue: cfg.bonusValue,
            effectiveValue: cfg.bonusValue * mult,
            triggerCondition: cfg.triggerCondition,
            description: cfg.description,
            triggered: false,
            triggerCount: 0,
            ...(cfg.bodyStaminaDrain != null && { bodyStaminaDrain: cfg.bodyStaminaDrain * mult }),
            ...(cfg.clinchChance != null && { clinchChance: cfg.clinchChance }),
        };
    });
}

/** Same rule as campService.generateWildcard with the report's top-2 + bottom-2 excluded. */
function rollWildcard(opp) {
    const entries = STAT_KEYS.map((k) => [k, opp[k]]).sort(([, a], [, b]) => b - a);
    const reported = new Set([...entries.slice(0, 2), ...entries.slice(-2)].map(([k]) => k));
    const middle = entries.filter(([k]) => !reported.has(k));
    const pool = (middle.length ? middle : entries).slice(0, 3);
    const [stat, value] = pool[Math.floor(Math.random() * pool.length)];
    return { stat, value, counterSession: STAT_COUNTER_SESSION[stat] || "GAME_PLAN_STUDY", fightEffect: 0.15 };
}

function fightOnce(player, opp, mode) {
    const sessionBonuses = mode === "matched" ? matchedSessionBonuses(opp.style) : [];
    const wildcard = mode === "matched" ? rollWildcard(opp) : null;
    const result = resolveFight({ ...player }, { ...opp }, {
        playerStrategy: null,
        playerName: "Player",
        opponentName: opp.name,
        sessionBonuses,
        moveBonuses: [],
        wildcard,
        ctx: { playerStyle: player.style, opponentStyle: opp.style, tier: "Amateur", isTitle: false },
    });
    return WIN_OUTCOMES.has(result.outcome);
}

function pct(w, n) {
    return n ? `${((100 * w) / n).toFixed(1)}%` : "-";
}

function run() {
    const opponents = loadOpponents();
    const styles = Object.keys(STYLES);
    const backstories = [null, ...Object.keys(BACKSTORIES)];
    const modes = ["none", "matched"];

    const total = { none: [0, 0], matched: [0, 0] };
    const cell = {};   // `${mode}|${style}|${backstory}` -> [wins, n]
    const perOpp = {}; // `${mode}|${name}` -> [wins, n]
    const ovrs = {};

    for (const style of styles) {
        for (const backstory of backstories) {
            const player = buildPlayer(style, backstory);
            ovrs[`${style}|${backstory}`] = player.overallRating;
            for (const opp of opponents) {
                for (const mode of modes) {
                    let w = 0;
                    for (let i = 0; i < N; i++) if (fightOnce(player, opp, mode)) w++;
                    total[mode][0] += w; total[mode][1] += N;
                    const ck = `${mode}|${style}|${backstory}`;
                    cell[ck] = cell[ck] || [0, 0]; cell[ck][0] += w; cell[ck][1] += N;
                    const ok = `${mode}|${opp.name}`;
                    perOpp[ok] = perOpp[ok] || [0, 0]; perOpp[ok][0] += w; perOpp[ok][1] += N;
                }
            }
        }
    }

    const fights = total.none[1] + total.matched[1];
    console.log(`Debut Monte Carlo: N=${N} per cell, scale=${SCALE}, ${fights} fights, no DB.`);
    console.log(`Overall win rate  no camp: ${pct(...total.none)}   matched camp: ${pct(...total.matched)}`);
    console.log("");

    const bsLabel = (b) => (b === null ? "(none)" : b);
    const header = ["Style (OVR range)".padEnd(28), ...backstories.map((b) => bsLabel(b).slice(0, 12).padStart(13))].join("");
    for (const mode of modes) {
        console.log(`Win rate by style x backstory, camp: ${mode}`);
        console.log(header);
        let worst = null;
        for (const style of styles) {
            const ovrList = backstories.map((b) => ovrs[`${style}|${b}`]);
            const label = `${style} (${Math.min(...ovrList)}-${Math.max(...ovrList)})`;
            const row = [label.padEnd(28)];
            for (const b of backstories) {
                const [w, n] = cell[`${mode}|${style}|${b}`];
                row.push(pct(w, n).padStart(13));
                if (!worst || w / n < worst.rate) worst = { rate: w / n, style, backstory: bsLabel(b) };
            }
            console.log(row.join(""));
        }
        console.log(`Worst cell (${mode}): ${worst.style} / ${worst.backstory} ${(100 * worst.rate).toFixed(1)}%`);
        console.log("");
    }

    console.log("Per opponent (no camp / matched camp):");
    for (const opp of opponents) {
        const a = perOpp[`none|${opp.name}`];
        const b = perOpp[`matched|${opp.name}`];
        console.log(`  ${opp.weightClass.padEnd(13)} ${opp.name.padEnd(18)} ${opp.style.padEnd(20)} OVR ${String(opp.overallRating).padStart(2)}   ${pct(...a).padStart(6)} / ${pct(...b).padStart(6)}`);
    }
}

run();
