/**
 * Admin script: clear all active injuries from a fighter.
 *
 * Removes every injury from the fighter, reversing the stat penalties each one
 * applied so the fighter's STR/SPD/LEG/etc. are restored to their pre-injury values.
 * Also unblocks fighting/sparring/bag-work if any injury was gating those.
 *
 * Usage:
 *   node scripts/clearInjuries.js --email someone@example.com
 *   node scripts/clearInjuries.js --id <fighterMongoId>
 *   node scripts/clearInjuries.js --email me@example.com --dry-run   # preview only
 *
 * Without --dry-run, the change is committed and the fighter is saved.
 */
const mongoose = require("mongoose");
const config = require("../config");
const Fighter = require("../models/fighterModel");
const User = require("../models/userModel");
const { reverseInjuryFromFighter } = require("../utils/injuryUtils");

function parseArgs(argv) {
    const out = { email: null, id: null, dryRun: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--email") out.email = argv[++i];
        else if (a === "--id") out.id = argv[++i];
        else if (a === "--dry-run") out.dryRun = true;
        else if (a === "--help" || a === "-h") {
            console.log(
                "Usage:\n" +
                "  node scripts/clearInjuries.js --email <email>\n" +
                "  node scripts/clearInjuries.js --id <fighterId>\n" +
                "  [--dry-run]   preview only, no DB write"
            );
            process.exit(0);
        }
    }
    return out;
}

async function findFighter({ email, id }) {
    if (id) {
        return Fighter.findById(id);
    }
    if (email) {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) throw new Error(`No user found with email "${email}"`);
        if (!user.fighterId) throw new Error(`User "${email}" has no fighter linked`);
        return Fighter.findById(user.fighterId);
    }
    throw new Error("Provide --email <email> or --id <fighterId>");
}

async function run() {
    const args = parseArgs(process.argv);

    await mongoose.connect(config.database.url, config.database.options);
    console.log("Connected to MongoDB");

    try {
        const fighter = await findFighter(args);
        if (!fighter) {
            console.error("Fighter not found.");
            process.exit(1);
        }

        const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();
        const injuries = fighter.injuries || [];
        console.log(`\nFighter: ${fullName} (${fighter._id})`);
        console.log(`Tier:    ${fighter.promotionTier} · ${fighter.weightClass}`);
        console.log(`Stats:   STR ${fighter.str} SPD ${fighter.spd} LEG ${fighter.leg} WRE ${fighter.wre} GND ${fighter.gnd} SUB ${fighter.sub} CHN ${fighter.chn} FIQ ${fighter.fiq}`);
        console.log(`Active injuries: ${injuries.length}`);

        if (injuries.length === 0) {
            console.log("Nothing to clear.");
            await mongoose.disconnect();
            return;
        }

        for (const inj of injuries) {
            const blocks = [
                inj.cannotFight && "fighting",
                inj.cannotSpar && "sparring",
                inj.cannotBagWork && "bag-work",
            ].filter(Boolean).join(", ") || "—";
            const stat = Object.entries(inj.appliedStatEffects || {})
                .filter(([, v]) => v)
                .map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? "+" : ""}${v}`)
                .join(", ") || "no stat penalty";
            console.log(`  • ${inj.label}  [${stat}]  blocks: ${blocks}`);
        }

        if (args.dryRun) {
            console.log("\n[dry-run] No changes written.");
            await mongoose.disconnect();
            return;
        }

        // Reverse each injury's stat penalty, then clear the array.
        for (const inj of injuries) {
            reverseInjuryFromFighter(fighter, inj);
        }
        fighter.injuries = [];

        await fighter.save();
        console.log(`\nCleared ${injuries.length} injur${injuries.length === 1 ? "y" : "ies"}.`);
        console.log(`Stats after: STR ${fighter.str} SPD ${fighter.spd} LEG ${fighter.leg} WRE ${fighter.wre} GND ${fighter.gnd} SUB ${fighter.sub} CHN ${fighter.chn} FIQ ${fighter.fiq}`);
    } catch (err) {
        console.error("Error:", err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

run();
