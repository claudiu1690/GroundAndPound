/**
 * OPPONENT SEED ROLLBACK: removes the opponents an accidental `seedOpponents.js` run
 * inserted on 2026-10-22 (around 16:00 UTC), and reports everything that points at them.
 *
 * WHAT COUNTS AS A ROGUE OPPONENT (all must hold):
 *   · createdAt inside [--since, --until]
 *   · fixedRank null (every ranked roster member has a number; the seed never sets one)
 *   · not a champion
 *   · name is one of data/names.json (the only names seedOpponents can produce)
 * Anything created inside the window that fails a test is LISTED, never touched.
 *
 * REFERENCES CHECKED:
 *   soft (cleared on commit, the board regenerates on next read)
 *     · Fighter.offerBoard.slots.opponentId
 *   hard (an opponent with any of these is KEPT and listed; re-checked right before the delete)
 *     · Fight.opponentId, Fight.interview.targetOpponentId
 *     · Fighter.nemesis / activeCallout / beefFlags / respectFlags
 *     · FightCard.fights.fighterA|fighterB.opponentId
 *     · MediaArchiveEntry.flagCreated.targetId
 *     · PodcastEpisode.targets.opponentId / flagsCreated.targetId
 *
 * Usage:
 *   node scripts/rollbackOpponentSeed.js                                      # DRY RUN (default)
 *   node scripts/rollbackOpponentSeed.js --verbose                            # + every candidate
 *   node scripts/rollbackOpponentSeed.js --commit --backup=./out/opp-rollback.json --yes
 *
 * `--commit` REQUIRES `--backup=<path>` and `--yes`. The backup (full opponent docs + the
 * affected fighters' offer boards) is written and fsync'd before the first write.
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch as the app.
 * The resolved target is printed in full before anything happens. READ IT.
 */
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const config = require("../config");

const Opponent = require("../models/opponentModel");
const Fighter = require("../models/fighterModel");
const Fight = require("../models/fightModel");
const FightCard = require("../models/mainEventModel");
const MediaArchiveEntry = require("../models/mediaArchiveModel");
const PodcastEpisode = require("../models/podcastEpisodeModel");

const NAMES_PATH = path.join(__dirname, "..", "data", "names.json");

// ── args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {
        commit: false,
        yes: false,
        verbose: false,
        backup: null,
        since: "2026-10-22T15:30:00Z",
        until: "2026-10-22T16:15:00Z",
    };
    for (const raw of argv.slice(2)) {
        if (raw === "--commit") { args.commit = true; continue; }
        if (raw === "--yes") { args.yes = true; continue; }
        if (raw === "--verbose") { args.verbose = true; continue; }
        const m = /^--([a-z]+)=(.*)$/.exec(raw);
        if (!m) { console.error(`Unknown argument "${raw}"`); process.exit(2); }
        if (["backup", "since", "until"].includes(m[1])) { args[m[1]] = m[2]; continue; }
        console.error(`Unknown argument "--${m[1]}"`); process.exit(2);
    }
    args.since = new Date(args.since);
    args.until = new Date(args.until);
    if (Number.isNaN(args.since.getTime()) || Number.isNaN(args.until.getTime()) || args.since >= args.until) {
        console.error("\n  ✖ --since/--until must be valid ISO dates with since < until.\n");
        process.exit(2);
    }
    if (args.commit && (!args.backup || !args.yes)) {
        console.error("\n  ✖ --commit REQUIRES --backup=<path> AND --yes.\n");
        process.exit(2);
    }
    return args;
}

const iso = (d) => (d ? new Date(d).toISOString() : "-");

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv);
    const isAtlas = config.database.url.includes("mongodb+srv");

    console.log("");
    console.log("═".repeat(74));
    console.log(args.commit
        ? "  OPPONENT SEED ROLLBACK: ⚠️  COMMIT MODE. Opponents WILL be deleted."
        : "  OPPONENT SEED ROLLBACK: DRY RUN (default). Nothing will be written.");
    console.log(`  TARGET: ${isAtlas ? "⚠️  REMOTE / ATLAS" : "local"} ${config.database.url.replace(/\/\/[^@]*@/, "//<redacted>@")}`);
    console.log(`  WINDOW: ${iso(args.since)}  →  ${iso(args.until)}`);
    console.log("═".repeat(74));

    const seedNames = new Set(
        JSON.parse(fs.readFileSync(NAMES_PATH, "utf8")).map((n) => `${n.firstName} ${n.lastName}`)
    );

    await mongoose.connect(config.database.url, config.database.options);

    // ── context: is the window actually where the burst is? ──
    const total = await Opponent.countDocuments({});
    const weekAgo = new Date(args.until.getTime() - 7 * 24 * 3600 * 1000);
    const recent = await Opponent.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: {
            _id: { $dateToString: { format: "%Y-%m-%d %H:%M", date: { $dateTrunc: { date: "$createdAt", unit: "minute", binSize: 5 } } } },
            n: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
    ]);

    console.log(`\n  opponents in collection ......... ${total}`);
    console.log("  opponents created in the last 7 days, per 5 min (UTC):");
    if (!recent.length) console.log("    (none)");
    for (const r of recent) console.log(`    ${r._id}  ${String(r.n).padStart(4)}`);

    // ── classify everything created inside the window ──
    const inWindow = await Opponent.find({ createdAt: { $gte: args.since, $lte: args.until } })
        .sort({ createdAt: 1 }).lean();
    const candidates = [];
    const excluded = [];
    for (const o of inWindow) {
        const reasons = [];
        if (o.fixedRank != null) reasons.push(`fixedRank=${o.fixedRank}`);
        if (o.isChampion) reasons.push("champion");
        if (!seedNames.has(o.name)) reasons.push("name not in names.json");
        (reasons.length ? excluded : candidates).push({ o, reasons });
    }
    const ids = candidates.map((c) => c.o._id);

    console.log(`\n  created inside window ........... ${inWindow.length}`);
    console.log(`  rollback candidates ............. ${candidates.length}`);
    console.log(`  inside window but EXCLUDED ...... ${excluded.length}`);
    for (const { o, reasons } of excluded) {
        console.log(`    keep ${o._id} ${o.name} (${o.promotionTier} ${o.weightClass}) ${iso(o.createdAt)}: ${reasons.join(", ")}`);
    }
    if (candidates.length) {
        console.log(`  candidate createdAt range ....... ${iso(candidates[0].o.createdAt)} → ${iso(candidates[candidates.length - 1].o.createdAt)}`);
        const byTier = {};
        for (const { o } of candidates) {
            const k = `${o.promotionTier} / ${o.weightClass}`;
            byTier[k] = (byTier[k] || 0) + 1;
        }
        console.log("  candidates per tier / weight class:");
        for (const k of Object.keys(byTier).sort()) console.log(`    ${k.padEnd(34)} ${byTier[k]}`);
    }
    if (args.verbose) {
        for (const { o } of candidates) {
            console.log(`    ${o._id} ${o.name.padEnd(24)} ${o.promotionTier.padEnd(14)} ${o.weightClass.padEnd(13)} OVR ${o.overallRating}`);
        }
    }

    // ── references ──
    const { hard, keepIds, fightsAll, cards } = await findHardReferences(ids);
    const deleteIds = ids.filter((id) => !keepIds.has(String(id)));
    const del$in = { $in: deleteIds };
    const boardFighters = await Fighter.find({ "offerBoard.slots.opponentId": del$in })
        .select("_id isPvpBot offerBoard").lean();

    const fightsByStatus = {};
    for (const f of fightsAll) fightsByStatus[f.status] = (fightsByStatus[f.status] || 0) + 1;
    const boardLive = boardFighters.filter((f) => f.offerBoard && new Date(f.offerBoard.expiresAt) > new Date()).length;

    console.log("\n" + "─".repeat(74));
    console.log("  REFERENCES TO THE CANDIDATES");
    console.log("─".repeat(74));
    for (const [k, v] of Object.entries(hard)) console.log(`  hard · ${k.padEnd(38, ".")} ${v}`);
    if (fightsAll.length) {
        console.log(`         fights by status: ${Object.entries(fightsByStatus).map(([s, n]) => `${s}=${n}`).join(", ")}`);
        for (const f of fightsAll) console.log(`         fight ${f._id} fighter ${f.fighterId} ${f.status} ${iso(f.createdAt)}`);
    }
    for (const c of cards) console.log(`         fight card #${c.cardNumber} ${c._id} (${c.status})`);
    console.log(`  soft · offer boards showing a deletable one . ${boardFighters.length}  (${boardLive} not yet expired, ${boardFighters.filter((f) => f.isPvpBot).length} bots)`);

    const byId = new Map(candidates.map((c) => [String(c.o._id), c.o]));
    console.log("\n" + "─".repeat(74));
    console.log(`  PLAN: KEEP ${keepIds.size} (hard-referenced), DELETE ${deleteIds.length}`);
    console.log("─".repeat(74));
    for (const id of keepIds) {
        const o = byId.get(id);
        console.log(`  keep ${id} ${o.name} (${o.promotionTier} ${o.weightClass}, OVR ${o.overallRating})`);
    }

    if (!args.commit) {
        console.log("\n  DRY RUN complete. Nothing was written.\n");
        return;
    }

    // ── commit ──
    if (!deleteIds.length) {
        console.log("\n  Nothing to delete.\n");
        return;
    }

    const out = path.resolve(args.backup);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const fd = fs.openSync(out, "w");
    fs.writeSync(fd, JSON.stringify({
        takenAt: new Date().toISOString(),
        target: config.database.url.replace(/\/\/[^@]*@/, "//<redacted>@"),
        window: { since: iso(args.since), until: iso(args.until) },
        kept: [...keepIds],
        opponents: deleteIds.map((id) => byId.get(String(id))),
        offerBoards: boardFighters.map((f) => ({ _id: f._id, offerBoard: f.offerBoard })),
    }));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    console.log(`\n  backup written + fsynced: ${out}`);

    // Live traffic: a player can sign one of these between the plan and the delete. Re-check
    // right before deleting and keep anything that picked up a reference in the meantime.
    const late = await findHardReferences(deleteIds);
    const finalIds = deleteIds.filter((id) => !late.keepIds.has(String(id)));
    for (const id of late.keepIds) console.log(`  keep (referenced since the plan) ${id} ${byId.get(id).name}`);
    const final$in = { $in: finalIds };

    // Offer boards are only ever written through a conditional updateOne. Clearing the board
    // makes the next read regenerate it from the (by then cleaned) roster.
    const boards = await Fighter.updateMany(
        { "offerBoard.slots.opponentId": final$in },
        { $set: { offerBoard: null } }
    );
    const del = await Opponent.deleteMany({
        _id: final$in,
        fixedRank: null,
        isDebut: { $ne: true },
        isChampion: { $ne: true },
    });
    console.log(`  offer boards cleared ............ ${boards.modifiedCount}`);
    console.log(`  opponents deleted ............... ${del.deletedCount}`);
    console.log(`  opponents in collection now ..... ${await Opponent.countDocuments({})}`);

    const dangling = await findHardReferences(finalIds);
    const boardsLeft = await Fighter.countDocuments({ "offerBoard.slots.opponentId": final$in });
    console.log(`  dangling hard references ........ ${dangling.keepIds.size}${dangling.keepIds.size ? `  ⚠️  ${[...dangling.keepIds].join(", ")} (restore from the backup)` : ""}`);
    console.log(`  offer boards still pointing ..... ${boardsLeft}\n`);
}

/**
 * Every hard reference to `ids`, as per-source document counts plus the set of opponent ids
 * that are referenced at all (stringified). Those opponents must survive the rollback.
 */
async function findHardReferences(ids) {
    const $in = { $in: ids };
    const wanted = new Set(ids.map(String));
    const keepIds = new Set();
    const mark = (id) => { if (id != null && wanted.has(String(id))) keepIds.add(String(id)); };

    const [fightsAll, fightsInterview, fighters, cards, media, podcasts] = await Promise.all([
        Fight.find({ opponentId: $in }).select("_id fighterId opponentId status createdAt").lean(),
        Fight.find({ "interview.targetOpponentId": $in }).select("interview.targetOpponentId").lean(),
        Fighter.find({ $or: [
            { "nemesis.opponentId": $in },
            { "activeCallout.opponentId": $in },
            { "beefFlags.opponentId": $in },
            { "respectFlags.opponentId": $in },
        ] }).select("nemesis.opponentId activeCallout.opponentId beefFlags.opponentId respectFlags.opponentId").lean(),
        FightCard.find({ $or: [{ "fights.fighterA.opponentId": $in }, { "fights.fighterB.opponentId": $in }] })
            .select("_id cardNumber status fights.fighterA.opponentId fights.fighterB.opponentId").lean(),
        MediaArchiveEntry.find({ "flagCreated.targetId": $in }).select("flagCreated.targetId").lean(),
        PodcastEpisode.find({ $or: [{ "targets.opponentId": $in }, { "flagsCreated.targetId": $in }] })
            .select("targets.opponentId flagsCreated.targetId").lean(),
    ]);

    fightsAll.forEach((f) => mark(f.opponentId));
    fightsInterview.forEach((f) => mark(f.interview?.targetOpponentId));
    let nemesis = 0, callouts = 0, beef = 0, respect = 0;
    for (const f of fighters) {
        if (wanted.has(String(f.nemesis?.opponentId))) { nemesis += 1; mark(f.nemesis.opponentId); }
        if (wanted.has(String(f.activeCallout?.opponentId))) { callouts += 1; mark(f.activeCallout.opponentId); }
        if ((f.beefFlags || []).some((b) => wanted.has(String(b.opponentId)))) beef += 1;
        if ((f.respectFlags || []).some((r) => wanted.has(String(r.opponentId)))) respect += 1;
        (f.beefFlags || []).forEach((b) => mark(b.opponentId));
        (f.respectFlags || []).forEach((r) => mark(r.opponentId));
    }
    cards.forEach((c) => (c.fights || []).forEach((s) => { mark(s.fighterA?.opponentId); mark(s.fighterB?.opponentId); }));
    media.forEach((m) => mark(m.flagCreated?.targetId));
    podcasts.forEach((p) => {
        (p.targets || []).forEach((t) => mark(t.opponentId));
        (p.flagsCreated || []).forEach((t) => mark(t.targetId));
    });

    return {
        hard: {
            "fights (opponentId)": fightsAll.length,
            "fights (interview target)": fightsInterview.length,
            "fighters with nemesis": nemesis,
            "fighters with active callout": callouts,
            "fighters with beef flag": beef,
            "fighters with respect flag": respect,
            "fight cards": cards.length,
            "media archive flags": media.length,
            "podcast episodes": podcasts.length,
        },
        keepIds,
        fightsAll,
        cards,
    };
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
