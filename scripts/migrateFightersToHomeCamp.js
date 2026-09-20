/**
 * Home Camp BACKFILL SWEEP — creates a HomeCamp for every non-bot fighter that doesn't have one.
 *
 * ⚠️ THIS SCRIPT NEVER WRITES A FIGHTER DOCUMENT. Not one field, not once. That is the whole
 * safety story of the Home Camp rollout: `gymRanks` / `gymPerks` / `activeGymId` survive
 * untouched, so no badge evaluator changes its answer and no live perk is affected. It creates
 * documents in ONE collection (`homecamps`) and reads everything else. The QA suite spies on
 * `Fighter.updateOne` / `Fighter.bulkWrite` / `Fighter.prototype.save` to prove it.
 *
 * WHY IT EXISTS AT ALL: the conversion is normally lazy — `homeCampService.ensureCamp` runs on
 * the player's first camp read. This sweep is only for players who never opened the screen, so
 * the cutover doesn't leave them staring at an empty camp built from nothing.
 *
 * TWO PASSES, AND THE SCAN COMPLETES BEFORE ANY WRITE:
 *   Pass 1 (always, read-only) collects every `gymRanks` key across the selection. Any key with
 *   no `GYM_SLUG_TO_DOMAIN` entry is UNMAPPED, and an unmapped slug means the conversion would
 *   silently drop that gym's history — a Rank-4 veteran converted as a blank NEW camp. So the
 *   script prints every unmapped slug with an example `_id` and EXITS 1 BEFORE CREATING
 *   ANYTHING. Aborting halfway through a live population is worse than never starting.
 *   Pass 2 runs only with `--commit`, and only if pass 1 was clean.
 *
 * ⚠️ DOES NOT CALL `ensureCamp`. That is the REQUEST-PATH function: it applies
 * `applyIdleNeglect` and SAVES. Here we call the pure constructor `deriveInitialCampState` and
 * `HomeCamp.create` directly, so a backfilled camp is created in exactly the state a first read
 * would have produced — condition 100, no retro-decay, no retro-wages.
 *
 * Usage:
 *   node scripts/migrateFightersToHomeCamp.js                      # DRY RUN (the default)
 *   node scripts/migrateFightersToHomeCamp.js --snapshot=./out/pre.json
 *   node scripts/migrateFightersToHomeCamp.js --commit
 *   node scripts/migrateFightersToHomeCamp.js --commit --limit=500 --after=<ObjectId>
 *
 * Flags:
 *   --commit            actually create camps (WITHOUT THIS NOTHING IS WRITTEN)
 *   --limit=N           stop after N scanned fighters
 *   --after=<ObjectId>  resume from just after this _id (gapless — selection is _id-sorted)
 *   --batch=500         cursor batch size
 *   --snapshot=<path>   write a per-fighter digest for the verifier's A10 "fighter untouched" check
 *   --verbose           print every created camp
 *
 * RE-RUNNABLE: fighters that already have a camp are skipped (`skipped_existing`), and a camp
 * created by a live request mid-sweep surfaces as E11000 → `skipped_raced`, which is not an
 * error. Run it twice; the second run creates nothing.
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch as the app.
 */
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const config = require("../config");

const Fighter = require("../models/fighterModel");
const HomeCamp = require("../models/homeCampModel");
const Gym = require("../models/gymModel");
const homeCampService = require("../services/homeCampService");
const { GYM_SLUG_TO_DOMAIN } = require("../consts/homeCampConfig");

// ── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {
        commit: false, limit: Infinity, after: null, batch: 500,
        snapshot: null, verbose: false,
    };
    for (const raw of argv.slice(2)) {
        if (raw === "--commit") { args.commit = true; continue; }
        if (raw === "--verbose") { args.verbose = true; continue; }
        const m = /^--([a-z]+)=(.*)$/.exec(raw);
        if (!m) { console.error(`Unknown argument "${raw}"`); process.exit(2); }
        const [, key, value] = m;
        if (key === "limit") {
            args.limit = Number(value);
            if (!Number.isInteger(args.limit) || args.limit < 1) { console.error("--limit must be a positive integer"); process.exit(2); }
        } else if (key === "batch") {
            args.batch = Number(value);
            if (!Number.isInteger(args.batch) || args.batch < 1) { console.error("--batch must be a positive integer"); process.exit(2); }
        } else if (key === "after") {
            if (!mongoose.isValidObjectId(value)) { console.error(`--after "${value}" is not a valid ObjectId`); process.exit(2); }
            args.after = new mongoose.Types.ObjectId(value);
        } else if (key === "snapshot") {
            args.snapshot = value;
        } else {
            console.error(`Unknown argument "--${key}"`); process.exit(2);
        }
    }
    return args;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const hasOwn = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

/** Selection: every real player, _id-ordered so --after/--limit resume is gapless. */
function selection(after) {
    const q = { isPvpBot: { $ne: true } };
    if (after) q._id = { $gt: after };
    return q;
}

/**
 * A stable digest of everything the migration is FORBIDDEN to touch. The verifier (A10)
 * re-derives it after the commit and compares byte-for-byte. Run it, or "purely additive" is an
 * assertion nobody checked.
 */
function fighterDigest(f) {
    const gr = f.gymRanks || {};
    const gymRanksDigest = Object.keys(gr).sort().map((slug) => {
        const p = gr[slug] || {};
        return `${slug}:${p.rank ?? 0}/${p.trainingSessions ?? 0}/${p.relevantWins ?? 0}`;
    }).join("|");
    return {
        _id: String(f._id),
        gymRanksDigest,
        gymPerks: [...(f.gymPerks || [])].sort(),
        badgesEarnedCount: (f.badgesEarned || []).length,
        campRank4Count: (f.campRank4Archetypes || []).length,
        specialMovesOwnedCount: (f.specialMovesOwned || []).length,
        iron: f.iron ?? 0,
        activeGymId: f.activeGymId ? String(f.activeGymId) : null,
    };
}

const bump = (hist, key) => { hist[key] = (hist[key] || 0) + 1; };

function printHistogram(label, hist) {
    const keys = Object.keys(hist).sort();
    if (keys.length === 0) { console.log(`  ${label}: (none)`); return; }
    console.log(`  ${label}:`);
    for (const k of keys) console.log(`    ${String(k).padEnd(16, " ")} ${hist[k]}`);
}

// ── PASS 1 — read-only scan. Aborts on any unmapped slug BEFORE any create. ──

async function scanPass(args) {
    const unmapped = new Map();   // slug → example fighter _id
    let scanned = 0;
    let bots = 0;

    const cursor = Fighter.find(selection(args.after))
        .select("_id gymRanks isPvpBot")
        .sort({ _id: 1 })
        .lean()
        .cursor({ batchSize: args.batch });

    for await (const f of cursor) {
        if (scanned >= args.limit) break;
        scanned += 1;
        for (const slug of Object.keys(f.gymRanks || {})) {
            // `hasOwnProperty`, never `in` — gymRanks is a Mixed field, so a key of
            // "constructor" or "toString" would resolve THROUGH Object.prototype and be
            // silently treated as mapped.
            if (!hasOwn(GYM_SLUG_TO_DOMAIN, slug) && !unmapped.has(slug)) {
                unmapped.set(slug, String(f._id));
            }
        }
    }
    return { scanned, bots, unmapped };
}

// ── PASS 2 — create the camps. Only reached with --commit and a clean scan. ──

async function createPass(args, gymSlugById, report) {
    // PvP bots are excluded by the SELECTION QUERY, not by a per-document check, so they never
    // reach the loop below. Counted separately here so the report still says out loud how many
    // were left alone — a silent zero would look like "there are no bots" rather than
    // "bots were correctly skipped". The in-loop guard stays as defence if the query changes.
    report.skipped_bot = await Fighter.countDocuments(
        args.after ? { isPvpBot: true, _id: { $gt: args.after } } : { isPvpBot: true }
    );

    const cursor = Fighter.find(selection(args.after))
        .sort({ _id: 1 })
        .cursor({ batchSize: args.batch });

    let seen = 0;
    for await (const fighter of cursor) {
        if (seen >= args.limit) break;
        seen += 1;
        report.scanned += 1;

        if (fighter.isPvpBot) { continue; }

        const existing = await HomeCamp.exists({ fighterId: fighter._id });
        if (existing) { report.skipped_existing += 1; continue; }

        // The PURE constructor. NOT ensureCamp — that one saves and applies idle neglect.
        const state = homeCampService.deriveInitialCampState(fighter, gymSlugById);

        if (!args.commit) {
            report.would_create += 1;
            tally(report, state);
            if (args.verbose) console.log(`  [dry] ${fighter._id} → ${state.origin.source} ${state.focusDomain} rank ${state.coaches[0].rank}`);
            continue;
        }

        try {
            await HomeCamp.create(state);
            report.created += 1;
            tally(report, state);
            if (args.verbose) console.log(`  [new] ${fighter._id} → ${state.origin.source} ${state.focusDomain} rank ${state.coaches[0].rank}`);
        } catch (err) {
            if (err && err.code === 11000) {
                // A live request created the camp between our exists() and our create(). Not an
                // error — the player got the identical document from ensureCamp.
                report.skipped_raced += 1;
                continue;
            }
            report.failed += 1;
            console.error(`  [ERR] fighter ${fighter._id}: ${err.message}`);
        }
        report.lastId = String(fighter._id);
    }
}

function tally(report, state) {
    bump(report.bySource, state.origin.source);
    bump(report.byFocusDomain, state.focusDomain);
    bump(report.byHeadCoachRank, `rank ${state.coaches[0].rank}`);
    for (const domain of Object.keys(state.disciplineFamiliarity || {})) bump(report.byFamiliarityDomain, domain);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv);

    console.log("");
    console.log("═".repeat(72));
    console.log(args.commit
        ? "  Home Camp backfill — ⚠️  COMMIT MODE: camps WILL be created."
        : "  Home Camp backfill — DRY RUN (default). Nothing will be written.");
    console.log("  This script NEVER writes a Fighter document.");
    console.log("═".repeat(72));

    await mongoose.connect(config.database.url, config.database.options);

    // ── PASS 1 ──
    console.log("\n[pass 1/2] scanning gym slugs (read-only)…");
    const scan = await scanPass(args);
    console.log(`  scanned ${scan.scanned} fighter(s)`);

    if (scan.unmapped.size > 0) {
        console.error("\n  ✖ UNMAPPED GYM SLUGS FOUND — ABORTING BEFORE ANY WRITE.");
        console.error("    Each of these would be silently dropped from the conversion, which can");
        console.error("    turn a Rank-4 veteran into a blank NEW camp. Add an entry to");
        console.error("    consts/homeCampConfig.js#GYM_SLUG_TO_DOMAIN (the value may be null) and re-run.\n");
        for (const [slug, exampleId] of scan.unmapped) {
            console.error(`      "${slug}"  (e.g. fighter ${exampleId})`);
        }
        console.error("");
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log("  UNMAPPED SLUGS SEEN: []  ✔");

    // ── PASS 2 ──
    console.log(`\n[pass 2/2] ${args.commit ? "creating camps" : "simulating"}…`);
    const gymSlugById = {};
    for (const g of await Gym.find({}).select("_id slug").lean()) gymSlugById[String(g._id)] = g.slug;
    console.log(`  gym slug map built once: ${Object.keys(gymSlugById).length} gym(s)`);

    const report = {
        scanned: 0, skipped_bot: 0, skipped_existing: 0, skipped_raced: 0,
        created: 0, would_create: 0, failed: 0, lastId: null,
        bySource: {}, byFocusDomain: {}, byHeadCoachRank: {}, byFamiliarityDomain: {},
    };
    await createPass(args, gymSlugById, report);

    // ── --snapshot (the verifier's A10 baseline) ──
    if (args.snapshot) {
        const rows = [];
        const cursor = Fighter.find(selection(args.after)).sort({ _id: 1 }).lean().cursor({ batchSize: args.batch });
        let n = 0;
        for await (const f of cursor) {
            if (n >= args.limit) break;
            n += 1;
            if (f.isPvpBot) continue;
            rows.push(fighterDigest(f));
        }
        const out = path.resolve(args.snapshot);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), commit: args.commit, rows }, null, 0));
        console.log(`  snapshot written: ${out} (${rows.length} fighter digests)`);
    }

    // ── report ──
    console.log("\n" + "─".repeat(72));
    console.log(args.commit ? "  RESULT (COMMITTED)" : "  RESULT (DRY RUN — nothing was written)");
    console.log("─".repeat(72));
    console.log(`  scanned ............ ${report.scanned}`);
    console.log(`  skipped_bot ........ ${report.skipped_bot}`);
    console.log(`  skipped_existing ... ${report.skipped_existing}`);
    console.log(`  skipped_raced ...... ${report.skipped_raced}`);
    console.log(`  ${args.commit ? "created ............" : "would create ......."} ${args.commit ? report.created : report.would_create}`);
    console.log(`  failed ............. ${report.failed}`);
    printHistogram("by origin", report.bySource);
    // ⚠️ READ THIS LINE BEFORE COMMITTING ON PROD. If the population has ~40 Rank-4 gym players
    // and this shows 3, the conversion is dropping veterans — STOP and investigate.
    printHistogram("HEAD-COACH RANK (read this one)", report.byHeadCoachRank);
    printHistogram("by focusDomain", report.byFocusDomain);
    printHistogram("familiarity domains banked", report.byFamiliarityDomain);
    console.log(`  UNMAPPED SLUGS SEEN: []`);
    if (report.lastId) console.log(`  resume with: --after=${report.lastId}`);
    if (!args.commit) console.log("\n  DRY RUN — re-run with --commit to actually create these camps.");
    console.log("");

    await mongoose.disconnect();
    process.exit(report.failed > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(async (err) => {
        console.error("\n[migrateFightersToHomeCamp] FAILED:", err);
        try { await mongoose.disconnect(); } catch (_) { /* already down */ }
        process.exit(1);
    });
}

module.exports = { parseArgs, fighterDigest, scanPass, createPass, selection };
