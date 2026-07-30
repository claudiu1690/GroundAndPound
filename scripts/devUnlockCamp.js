/**
 * DEV/QA SETUP — put a fighter's camp into a fully-unlocked state for testing.
 *
 * Fills all four coach slots with max-rank coaches so every Phase-2 surface is reachable in
 * one sitting: the teach channel, the Legendary masterclass drill, the Rank-4 archetype
 * perks, the claim-teach flow, and the Conditioning coach's camp-wide injury passive.
 *
 * ⚠️ THIS IS A TEST FIXTURE, NOT A GAMEPLAY FEATURE. It hands out progress no player could
 * earn in the time it takes to run. Point it at a test account.
 *
 * What it sets:
 *   · camp tier 4 (four coach slots) and condition 100
 *   · one coach per archetype — STRIKING / WRESTLING / BJJ / CONDITIONING — at rank 4
 *   · `joinedAtRank: 1` on each, so every teach slot reads CLAIMABLE rather than
 *     "unavailable". That is the interesting state: it exercises the claim flow AND then
 *     leaves you holding the moves. Pass --taught to skip the claim step and be given them
 *     outright instead.
 *   · rarity LEGENDARY by default — the widest test surface (full teach pool + the
 *     masterclass drill). --rarity=RARE/UNCOMMON/COMMON to narrow it.
 *
 * ⚠️ Camp tier is floored by the fighter's promotion tier at read time
 * (homeCampConfig.effectiveTier), so a low-tier fighter will still show fewer slots than the
 * stored 4. --tier=<label> raises promotionTier too; the script warns when it would matter.
 *
 * Usage:
 *   node scripts/devUnlockCamp.js --name="Max Holes"                    # DRY RUN
 *   node scripts/devUnlockCamp.js --name="Max Holes" --commit
 *   node scripts/devUnlockCamp.js --id=<fighterId> --commit --rarity=RARE
 *   LOCAL_MODE=true node scripts/devUnlockCamp.js --name="Max Holes" --commit
 *
 * Connects via ../config, so it honours the same LOCAL_MODE / USE_ATLAS switch as the app.
 * The resolved target is printed before anything happens — READ IT.
 */
const mongoose = require("mongoose");
const config = require("../config");

const Fighter = require("../models/fighterModel");
const HomeCamp = require("../models/homeCampModel");
const coachService = require("../services/homeCampCoachService");
const {
    ARCHETYPE_KEYS,
    COACH_ARCHETYPES,
    COACH_MAX_RANK,
    COACH_RANKS,
    COACH_RARITIES,
    CONDITION_MAX,
    DOMAIN_TEACH_POOLS,
    TEACH_BREADTH_BY_RARITY,
    LEGENDARY_EXCLUSIVE_DRILLS,
    MAX_CAMP_TIER,
    CAMP_TIERS,
} = require("../consts/homeCampConfig");

function parseArgs(argv) {
    const args = { commit: false, name: null, id: null, rarity: "LEGENDARY", taught: false, tier: null, resetMarket: false, nonce: null };
    for (const raw of argv.slice(2)) {
        if (raw === "--commit") { args.commit = true; continue; }
        if (raw === "--taught") { args.taught = true; continue; }
        if (raw === "--reset-market") { args.resetMarket = true; continue; }
        const m = /^--([a-z]+)=(.*)$/.exec(raw);
        if (!m) { console.error(`Unknown argument "${raw}"`); process.exit(2); }
        const [, k, v] = m;
        if (k === "name") args.name = v;
        else if (k === "id") args.id = v;
        else if (k === "tier") args.tier = v;
        else if (k === "nonce") args.nonce = Number(v) || 0;
        else if (k === "rarity") {
            args.rarity = String(v).toUpperCase();
            if (!COACH_RARITIES.includes(args.rarity)) {
                console.error(`--rarity must be one of ${COACH_RARITIES.join(", ")}`); process.exit(2);
            }
        } else { console.error(`Unknown argument "--${k}"`); process.exit(2); }
    }
    if (!args.name && !args.id) { console.error("\n  ✖ --name=\"First Last\" or --id=<fighterId> is required.\n"); process.exit(2); }
    return args;
}

/** Names are cosmetic here; fixed so re-running is idempotent rather than reshuffling staff. */
const FIXTURE_NAMES = {
    STRIKING: "Dev Strikewell",
    WRESTLING: "Dev Matson",
    BJJ: "Dev Guardia",
    CONDITIONING: "Dev Ironside",
};

function buildCoach(archetype, rarity, taught) {
    const breadth = TEACH_BREADTH_BY_RARITY[rarity] || 1;
    const pool = (DOMAIN_TEACH_POOLS[archetype] || []).slice(0, breadth);
    const name = FIXTURE_NAMES[archetype] || `Dev ${archetype}`;
    const ex = rarity === "LEGENDARY" ? (LEGENDARY_EXCLUSIVE_DRILLS[archetype] || null) : null;
    const maxDef = COACH_RANKS[COACH_MAX_RANK];
    return {
        archetype,
        name,
        initials: name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
        rarity,
        traitKey: null,
        wage: 0,                       // free, so a test account can't be bankrupted by payroll
        isStarter: archetype === "STRIKING",
        hiredAt: new Date(),
        rank: COACH_MAX_RANK,
        // 1, so every teach slot reads CLAIMABLE — the claim flow is the thing worth testing.
        joinedAtRank: 1,
        sessionsCompleted: maxDef ? maxDef.sessions : 60,
        relevantWins: maxDef ? maxDef.wins : 10,
        morale: 100,
        hireFee: 0,
        lastSessionAt: null,
        exclusiveSessionKey: ex ? ex.key : null,
        teachPoolMoveIds: pool,
        taughtMoveIds: taught ? [...pool] : [],
    };
}

async function main() {
    const args = parseArgs(process.argv);
    const isAtlas = config.database.url.includes("mongodb+srv");

    console.log("");
    console.log("═".repeat(74));
    console.log(args.commit ? "  DEV CAMP UNLOCK — ⚠️  COMMIT MODE" : "  DEV CAMP UNLOCK — DRY RUN (default)");
    console.log(`  TARGET: ${isAtlas ? "⚠️  REMOTE / ATLAS" : "local"} — ${config.database.url.replace(/\/\/[^@]*@/, "//<redacted>@")}`);
    console.log("═".repeat(74));

    await mongoose.connect(config.database.url, config.database.options);

    let fighter;
    if (args.id) {
        fighter = await Fighter.findById(args.id);
    } else {
        const parts = args.name.trim().split(/\s+/);
        const first = parts.shift();
        const last = parts.join(" ");
        const q = last
            ? { firstName: new RegExp(`^${first}$`, "i"), lastName: new RegExp(`^${last}$`, "i") }
            : { firstName: new RegExp(`^${first}$`, "i") };
        const hits = await Fighter.find(q).limit(5);
        if (hits.length > 1) {
            console.error(`\n  ✖ "${args.name}" matches ${hits.length} fighters — re-run with --id=<one of>:`);
            for (const h of hits) console.error(`      ${h._id}  ${h.firstName} ${h.lastName}`);
            await mongoose.disconnect();
            process.exit(2);
        }
        fighter = hits[0];
    }

    if (!fighter) {
        console.error(`\n  ✖ No fighter matched ${args.id ? `id ${args.id}` : `"${args.name}"`} in this database.\n`);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`\n  fighter : ${fighter.firstName} ${fighter.lastName}  (${fighter._id})`);
    console.log(`  tier    : ${fighter.promotionTier}`);

    const coaches = ARCHETYPE_KEYS.map((a) => buildCoach(a, args.rarity, args.taught));
    console.log(`\n  will set camp tier ${MAX_CAMP_TIER} (${CAMP_TIERS[MAX_CAMP_TIER].slots} slots), condition ${CONDITION_MAX}, and:`);
    for (const c of coaches) {
        console.log(`    ${c.archetype.padEnd(13)} ${c.name.padEnd(16)} ${c.rarity.padEnd(10)} rank ${c.rank}` +
            `  teaches ${c.teachPoolMoveIds.length}${c.taughtMoveIds.length ? " (pre-taught)" : " (claimable)"}` +
            `${c.exclusiveSessionKey ? "  + masterclass" : ""}` +
            `  perk: ${COACH_ARCHETYPES[c.archetype].perkKey}`);
    }

    // effectiveTier floors the stored tier by promotion tier, so warn when 4 slots won't show.
    const tierFloorNote = CAMP_TIERS[MAX_CAMP_TIER].dropKey;
    console.log(`\n  NOTE: camp tier is floored by promotion tier at read time. Tier ${MAX_CAMP_TIER}` +
        ` expects roughly "${tierFloorNote}" or above; this fighter is "${fighter.promotionTier}".` +
        (args.tier ? `  --tier will set promotionTier to "${args.tier}".` : "  Pass --tier=<label> if slots look short."));

    if (!args.commit) {
        console.log("\n  DRY RUN — re-run with --commit to apply.\n");
        await mongoose.disconnect();
        process.exit(0);
    }

    if (args.tier) {
        fighter.promotionTier = args.tier;
        await fighter.save();
    }

    // ── --reset-market ──────────────────────────────────────────────────────────────────
    // The slate is seeded from `${camp._id}:${weekIndex}` and is therefore DETERMINISTIC:
    // simply clearing `market.weekIndex` re-rolls to the byte-identical cards. To actually
    // see a different board, the candidates are generated against an OFFSET week and then
    // stored under the CURRENT week, so getMarketState treats them as this week's slate and
    // keeps them. Dev only — a player can never reroll.
    if (args.resetMarket) {
        const marketService = require("../services/homeCampMarketService");
        const camp0 = await HomeCamp.findOne({ fighterId: fighter._id });
        const wk = marketService.homeCampWeekIndex();
        const nonce = args.nonce != null ? args.nonce : (camp0.market?.candidates?.length || 0) + 1;
        const tier = Math.max(1, Math.min(MAX_CAMP_TIER, Number(camp0.tier) || 1));
        const fresh = marketService.rollCandidates(camp0, fighter, wk + nonce, tier);
        await HomeCamp.updateOne(
            { _id: camp0._id },
            { $set: { "market.weekIndex": wk, "market.candidates": fresh } }
        );
        console.log(`\n  market reset — ${fresh.length} candidate(s) (seed offset +${nonce}):`);
        for (const c of fresh) console.log(`    ${c.archetype.padEnd(13)} ${c.name.padEnd(20)} ${c.rarity.padEnd(10)} trait ${c.traitKey || "—"}  fee $${c.hireFee}  wage $${c.wage}/wk`);
        console.log("\n  Re-run with a different --nonce=N for another board.\n");
        await mongoose.disconnect();
        process.exit(0);
    }

    await HomeCamp.updateOne(
        { fighterId: fighter._id },
        {
            $set: {
                fighterId: fighter._id,
                focusDomain: "STRIKING",
                tier: MAX_CAMP_TIER,
                coaches,
                "condition.value": CONDITION_MAX,
                "condition.lastNeglectAt": new Date(),
                "condition.lastNeglectDayKey": null,
                "condition.lastSessionDayKey": null,
                consecutiveUnpaidWeeks: 0,
            },
            $setOnInsert: {
                name: `${fighter.lastName} Camp`,
                market: { weekIndex: -1, candidates: [], slotCooldownUntil: null },
                disciplineFamiliarity: {},
                lastWeeklyTickIndex: -1,
                origin: { source: "NEW", sourceGymSlug: null, convertedAt: new Date(), conversionVersion: 1 },
            },
        },
        { upsert: true }
    );

    const camp = await HomeCamp.findOne({ fighterId: fighter._id }).lean();
    console.log("\n" + "─".repeat(74));
    console.log("  RESULT (COMMITTED)");
    console.log("─".repeat(74));
    console.log(`  camp tier ${camp.tier} · condition ${camp.condition.value} · ${camp.coaches.length} coach(es)`);
    for (const c of camp.coaches) {
        console.log(`    ${c.archetype.padEnd(13)} ${c.name.padEnd(16)} rank ${c.rank}  joinedAt ${c.joinedAtRank}  taught ${c.taughtMoveIds.length}/${c.teachPoolMoveIds.length}`);
    }
    console.log("");

    await mongoose.disconnect();
    process.exit(0);
}

if (require.main === module) {
    main().catch(async (err) => {
        console.error("\n[devUnlockCamp] FAILED:", err);
        try { await mongoose.disconnect(); } catch (_) { /* already down */ }
        process.exit(1);
    });
}
