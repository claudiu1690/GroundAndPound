/**
 * GYM DATA WIPE — removes the retired gym system's per-fighter data.
 *
 * ⚠️ THIS SCRIPT WRITES FIGHTER DOCUMENTS AND IS NOT REVERSIBLE WITHOUT THE BACKUP IT
 * WRITES. It is the deliberate counterpart to migrateFightersToHomeCamp.js, which never
 * touches a fighter: the owner chose to retire the gyms WITHOUT converting progress
 * (compensation is handled separately, out of band).
 *
 * WHAT IT CLEARS, per non-bot fighter:
 *   · gymRanks            → {}          (all gym rank/session/win progress)
 *   · activeGymId         → null
 *   · activeGymPaidUntil  → null
 *   · gymPerks            → gym-earned perks removed (see the SHARED-KEY rule below)
 *   · badgesEarned        → gym badges removed (same rule)
 *
 * ⚠️ THE SHARED-KEY RULE — THE ONLY SUBTLE PART. Gym perks and CAMP perks are the same
 * keys, because the camp deliberately grants into the same `gymPerks` array rather than
 * inventing a parallel perk system. Four of the ten gym perks are also reachable through a
 * camp coach's Rank 4:
 *      STRIKING → corner_confidence   WRESTLING → mat_returns
 *      BJJ      → submission_awareness CONDITIONING → iron_conditioning
 * The same is true of four of the ten gym badges (boxer/wrestling/bjj/muaythai _rank4).
 * Blindly clearing `gymPerks` would therefore delete perks the player earned in their CAMP,
 * which this wipe has no business touching.
 *
 * The discriminator is `fighter.campRank4Archetypes` — written only by the camp. A perk or
 * badge whose archetype appears there was earned in the camp and is KEPT; everything else
 * came from a gym and goes. The six gym-only perks and six gym-only badges always go.
 *
 * Usage:
 *   node scripts/wipeGymData.js                                  # DRY RUN (default)
 *   node scripts/wipeGymData.js --backup=./out/gym-backup.json   # dry run + write backup
 *   node scripts/wipeGymData.js --commit --backup=./out/gym-backup.json
 *
 * `--commit` REQUIRES `--backup=<path>`; the backup is written and fsync'd BEFORE the first
 * write, and contains everything needed by restoreGymData to put it all back.
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch as the app.
 * The resolved target is printed in full before anything happens — READ IT.
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const mongoose = require("mongoose");
const config = require("../config");

const Fighter = require("../models/fighterModel");
const { GYM_PERK_CATALOG, COACH_ARCHETYPES } = require("../consts/homeCampConfig");
const { GYM_BADGE_SLUGS, GYM_BADGE_TO_ARCHETYPE } = require("../consts/badgeCatalog");

// ── what counts as gym data ──────────────────────────────────────────────────

/** perkKey → archetype, for the four perks a camp coach can also grant. */
const PERK_TO_ARCHETYPE = Object.freeze(
    Object.fromEntries(
        Object.entries(COACH_ARCHETYPES)
            .filter(([, a]) => a && a.perkKey)
            .map(([archetype, a]) => [a.perkKey, archetype])
    )
);

const ALL_GYM_PERKS = new Set(Object.keys(GYM_PERK_CATALOG));
const ALL_GYM_BADGES = new Set(Object.keys(GYM_BADGE_SLUGS));

/**
 * True when this perk/badge survives the wipe because the CAMP granted it.
 * `campRank4Archetypes` is written only by homeCampCoachService, never by a gym.
 */
function earnedInCamp(archetype, campArchetypes) {
    return !!archetype && campArchetypes.has(archetype);
}

function planFor(fighter) {
    const campArchetypes = new Set(fighter.campRank4Archetypes || []);

    const perks = Array.isArray(fighter.gymPerks) ? fighter.gymPerks : [];
    const keptPerks = perks.filter((k) => !ALL_GYM_PERKS.has(k) || earnedInCamp(PERK_TO_ARCHETYPE[k], campArchetypes));
    const removedPerks = perks.filter((k) => !keptPerks.includes(k));

    const badges = Array.isArray(fighter.badgesEarned) ? fighter.badgesEarned : [];
    const keptBadges = badges.filter(
        (b) => !ALL_GYM_BADGES.has(b.badgeId) || earnedInCamp(GYM_BADGE_TO_ARCHETYPE[b.badgeId], campArchetypes)
    );
    const removedBadges = badges.filter((b) => !keptBadges.includes(b)).map((b) => b.badgeId);

    const gymRankCount = Object.keys(fighter.gymRanks || {}).length;

    const touched =
        gymRankCount > 0 ||
        removedPerks.length > 0 ||
        removedBadges.length > 0 ||
        fighter.activeGymId != null ||
        fighter.activeGymPaidUntil != null;

    return { keptPerks, removedPerks, keptBadges, removedBadges, gymRankCount, touched };
}

// ── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { commit: false, backup: null, yes: false, verbose: false };
    for (const raw of argv.slice(2)) {
        if (raw === "--commit") { args.commit = true; continue; }
        if (raw === "--verbose") { args.verbose = true; continue; }
        if (raw === "--yes") { args.yes = true; continue; }
        const m = /^--([a-z]+)=(.*)$/.exec(raw);
        if (!m) { console.error(`Unknown argument "${raw}"`); process.exit(2); }
        if (m[1] === "backup") { args.backup = m[2]; continue; }
        console.error(`Unknown argument "--${m[1]}"`); process.exit(2);
    }
    if (args.commit && !args.backup) {
        console.error("\n  ✖ --commit REQUIRES --backup=<path>. This wipe is not reversible without it.\n");
        process.exit(2);
    }
    return args;
}

function confirm(question) {
    if (!process.stdin.isTTY) return Promise.resolve(false);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim() === "WIPE"); }));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv);
    const isAtlas = config.database.url.includes("mongodb+srv");

    console.log("");
    console.log("═".repeat(74));
    console.log(args.commit
        ? "  GYM DATA WIPE — ⚠️  COMMIT MODE: fighter documents WILL be modified."
        : "  GYM DATA WIPE — DRY RUN (default). Nothing will be written.");
    console.log(`  TARGET: ${isAtlas ? "⚠️  REMOTE / ATLAS" : "local"} — ${config.database.url.replace(/\/\/[^@]*@/, "//<redacted>@")}`);
    console.log("═".repeat(74));

    await mongoose.connect(config.database.url, config.database.options);

    // ── PASS 1 — read-only plan for every fighter ──
    const rows = [];
    const totals = { scanned: 0, touched: 0, gymRanksCleared: 0, perksRemoved: 0, badgesRemoved: 0, perksKeptFromCamp: 0, badgesKeptFromCamp: 0 };
    const removedPerkHist = {};
    const removedBadgeHist = {};

    const cursor = Fighter.find({ isPvpBot: { $ne: true } }).sort({ _id: 1 }).lean().cursor({ batchSize: 500 });
    for await (const f of cursor) {
        totals.scanned += 1;
        const plan = planFor(f);
        if (!plan.touched) continue;
        totals.touched += 1;
        if (plan.gymRankCount > 0) totals.gymRanksCleared += 1;
        totals.perksRemoved += plan.removedPerks.length;
        totals.badgesRemoved += plan.removedBadges.length;
        for (const k of plan.removedPerks) removedPerkHist[k] = (removedPerkHist[k] || 0) + 1;
        for (const b of plan.removedBadges) removedBadgeHist[b] = (removedBadgeHist[b] || 0) + 1;
        const campKeptPerks = plan.keptPerks.filter((k) => ALL_GYM_PERKS.has(k));
        const campKeptBadges = plan.keptBadges.filter((b) => ALL_GYM_BADGES.has(b.badgeId));
        totals.perksKeptFromCamp += campKeptPerks.length;
        totals.badgesKeptFromCamp += campKeptBadges.length;

        rows.push({
            _id: String(f._id),
            // Everything needed to restore, verbatim.
            gymRanks: f.gymRanks || {},
            gymPerks: [...(f.gymPerks || [])],
            badgesEarned: (f.badgesEarned || []).map((b) => ({ ...b, _id: b._id ? String(b._id) : undefined })),
            activeGymId: f.activeGymId ? String(f.activeGymId) : null,
            activeGymPaidUntil: f.activeGymPaidUntil || null,
            // The computed post-wipe state, so a restore can tell what this run changed.
            after: { gymPerks: plan.keptPerks, badgeIds: plan.keptBadges.map((b) => b.badgeId) },
        });
        if (args.verbose) {
            console.log(`  ${f._id}  gyms=${plan.gymRankCount} -perks=[${plan.removedPerks.join(",")}] -badges=[${plan.removedBadges.join(",")}]`);
        }
    }

    // ── backup BEFORE any write ──
    if (args.backup) {
        const out = path.resolve(args.backup);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const fd = fs.openSync(out, "w");
        fs.writeSync(fd, JSON.stringify({
            takenAt: new Date().toISOString(),
            target: config.database.url.replace(/\/\/[^@]*@/, "//<redacted>@"),
            committed: args.commit,
            rows,
        }));
        fs.fsyncSync(fd);   // on disk before a single document is touched
        fs.closeSync(fd);
        console.log(`\n  backup written + fsynced: ${out} (${rows.length} fighter(s))`);
    }

    // ── report ──
    console.log("\n" + "─".repeat(74));
    console.log(args.commit ? "  PLAN (about to commit)" : "  PLAN (DRY RUN — nothing written)");
    console.log("─".repeat(74));
    console.log(`  scanned .................. ${totals.scanned}`);
    console.log(`  fighters affected ........ ${totals.touched}`);
    console.log(`  gymRanks cleared ......... ${totals.gymRanksCleared}`);
    console.log(`  gym perks removed ........ ${totals.perksRemoved}`);
    console.log(`  gym badges removed ....... ${totals.badgesRemoved}`);
    console.log(`  KEPT (earned in camp) .... ${totals.perksKeptFromCamp} perk(s), ${totals.badgesKeptFromCamp} badge(s)`);
    const hist = (label, h) => {
        const keys = Object.keys(h).sort();
        console.log(`  ${label}:`);
        if (!keys.length) return console.log("    (none)");
        for (const k of keys) console.log(`    ${k.padEnd(26)} ${h[k]}`);
    };
    hist("perks removed by key", removedPerkHist);
    hist("badges removed by id", removedBadgeHist);

    if (!args.commit) {
        console.log("\n  DRY RUN — re-run with --commit --backup=<path> to apply.\n");
        await mongoose.disconnect();
        process.exit(0);
    }

    // ── confirmation ──
    if (!args.yes) {
        const ok = await confirm(`\n  Type WIPE to modify ${totals.touched} fighter document(s) on ${isAtlas ? "ATLAS" : "local"}: `);
        if (!ok) {
            console.log("  aborted — nothing written.\n");
            await mongoose.disconnect();
            process.exit(1);
        }
    }

    // ── PASS 2 — apply ──
    let updated = 0, failed = 0;
    for (const row of rows) {
        try {
            const res = await Fighter.updateOne(
                { _id: row._id },
                {
                    $set: {
                        gymRanks: {},
                        gymPerks: row.after.gymPerks,
                        activeGymId: null,
                        activeGymPaidUntil: null,
                    },
                    $pull: { badgesEarned: { badgeId: { $in: [...ALL_GYM_BADGES].filter((b) => !row.after.badgeIds.includes(b)) } } },
                }
            );
            if (res.matchedCount === 1) updated += 1;
        } catch (err) {
            failed += 1;
            console.error(`  [ERR] fighter ${row._id}: ${err.message}`);
        }
    }

    console.log("\n" + "─".repeat(74));
    console.log("  RESULT (COMMITTED)");
    console.log("─".repeat(74));
    console.log(`  updated .................. ${updated}`);
    console.log(`  failed ................... ${failed}`);
    console.log(`  restore with ............. node scripts/restoreGymData.js --from=${args.backup}`);
    console.log("");

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
    main().catch(async (err) => {
        console.error("\n[wipeGymData] FAILED:", err);
        try { await mongoose.disconnect(); } catch (_) { /* already down */ }
        process.exit(1);
    });
}

module.exports = { planFor, PERK_TO_ARCHETYPE, ALL_GYM_PERKS, ALL_GYM_BADGES };
