const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const bannerService = require("../../services/bannerService");
const { BANNER_PIECES } = require("../../consts/bannerCatalog");
const { getBadge } = require("../../consts/badgeCatalog");
const { resolvePvpBadge } = require("../../consts/pvpBadges");

// frontend/ is a separate ESM package ("type": "module" in frontend/package.json),
// so it must be loaded via dynamic import() rather than require().
const FRONTEND_CATALOG_PATH = pathToFileURL(
    path.resolve(__dirname, "../../frontend/src/components/banner/bannerCatalog.js")
).href;

function bf(o) {
    o = o || {};
    return Object.assign({
        record: { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decisionWins: 0 },
        notoriety: { score: 0, peakTier: "UNKNOWN", milestones: {} },
        promotionTier: "Amateur",
        badges: [],
        badgesEarned: [],
    }, o);
}

// Same resolver logic fightService.js inlines for the unlock-diff badgeName/description.
function badgeMeta(id) {
    if (!id) return { name: null, description: null };
    const def = getBadge(id) || resolvePvpBadge(id) || null;
    return { name: def?.name ?? null, description: def?.description ?? null };
}

const NEW_BADGE_IDS = [
    "ko_artist", "titan_rank4", "champ_gcs", "pvp_belt_first", // backgrounds
    "giant_killer", "documentary",                              // frames
    "perfect_camp", "nemesis_slayer", "veteran", "sub_hunter",  // accents
];
const NEW_PIECE_IDS = [
    "BG_SCORCHED", "BG_TITANIUM", "BG_GOLD_LEAF", "BG_THRONE",
    "FRAME_WARPATH", "FRAME_SPOTLIGHT",
    "ACC_CHAMPAGNE", "ACC_BLOOD_RIVAL", "ACC_PLATINUM", "ACC_TEAL_ICE",
];

test("QA-1: all 10 new pieces exist in backend catalog with badge unlockAt", () => {
    assert.equal(NEW_PIECE_IDS.length, 10);
    for (const id of NEW_PIECE_IDS) {
        const p = BANNER_PIECES.find((x) => x.id === id);
        assert.ok(p, `missing backend piece ${id}`);
        assert.ok(p.unlockAt && typeof p.unlockAt.badge === "string", `${id} not badge-gated`);
    }
});

test("QA-2: catalog parity — every new backend piece id+kind exists in frontend mirror", async () => {
    const mod = await import(FRONTEND_CATALOG_PATH);
    const frontendPieces = mod.BANNER_PIECES;
    for (const id of NEW_PIECE_IDS) {
        const backend = BANNER_PIECES.find((x) => x.id === id);
        const frontend = frontendPieces.find((x) => x.id === id);
        assert.ok(frontend, `missing frontend mirror piece ${id}`);
        assert.equal(frontend.kind, backend.kind, `kind mismatch for ${id}`);
    }
});

test("QA-3: badgeMeta resolves name+description for all 10 unlock badge ids (incl. pvp + gym-rank)", () => {
    assert.equal(NEW_BADGE_IDS.length, 10);
    for (const id of NEW_BADGE_IDS) {
        const meta = badgeMeta(id);
        assert.ok(meta.name, `no name resolved for badge id ${id}`);
        assert.ok(meta.description, `no description resolved for badge id ${id}`);
    }
});

test("QA-4: isUnlocked — legacy fighter.badges namespace alone unlocks a badge-gated piece", () => {
    const piece = BANNER_PIECES.find((p) => p.id === "BG_SCORCHED"); // unlockAt.badge = ko_artist
    const locked = bf();
    assert.equal(bannerService.isUnlocked(locked, piece), false);
    const unlockedLegacy = bf({ badges: ["ko_artist"] });
    assert.equal(bannerService.isUnlocked(unlockedLegacy, piece), true);
});

test("QA-5: isUnlocked — badgesEarned[].badgeId namespace alone unlocks a badge-gated piece", () => {
    const piece = BANNER_PIECES.find((p) => p.id === "BG_TITANIUM"); // unlockAt.badge = titan_rank4
    const unlockedEarned = bf({ badgesEarned: [{ badgeId: "titan_rank4", earnedAt: new Date() }] });
    assert.equal(bannerService.isUnlocked(unlockedEarned, piece), true);
});

test("QA-6: isUnlocked — no crash when badges/badgesEarned are missing entirely", () => {
    const piece = BANNER_PIECES.find((p) => p.id === "BG_GOLD_LEAF");
    const bareFighter = {}; // no badges, no badgesEarned, no record/notoriety at all
    assert.doesNotThrow(() => bannerService.isUnlocked(bareFighter, piece));
    assert.equal(bannerService.isUnlocked(bareFighter, piece), false);
});

test("QA-7: isUnlocked — pre-existing (non-badge) pieces still resolve correctly (regression)", () => {
    const acGreen = BANNER_PIECES.find((p) => p.id === "ACC_GREEN"); // notorietyTier: RISING_STAR
    assert.equal(bannerService.isUnlocked(bf({ notoriety: { peakTier: "UNKNOWN" } }), acGreen), false);
    assert.equal(bannerService.isUnlocked(bf({ notoriety: { peakTier: "RISING_STAR" } }), acGreen), true);
});

test("QA-8: diff-style before/after — a piece already unlocked pre-fight is never a false positive", () => {
    // Simulates the exact pattern fightService.js uses: snapshot before, snapshot after
    // a mutation that ALREADY included this badge beforehand — piece must not appear
    // in the "newly unlocked" diff twice / falsely.
    const piece = BANNER_PIECES.find((p) => p.id === "BG_SCORCHED");
    const fighter = bf({ badges: ["ko_artist"] }); // already unlocked before any mutation
    const before = new Set(BANNER_PIECES.filter((p) => bannerService.isUnlocked(fighter, p)).map((p) => p.id));
    // no mutation happens (e.g. this fight didn't touch ko_artist at all)
    const after = new Set(BANNER_PIECES.filter((p) => bannerService.isUnlocked(fighter, p)).map((p) => p.id));
    const newlyUnlocked = BANNER_PIECES.filter((p) => after.has(p.id) && !before.has(p.id));
    assert.ok(!newlyUnlocked.some((p) => p.id === piece.id), "already-unlocked piece leaked into diff");
});

test("QA-9: diff-style before/after — a piece unlocked BY this fight's mutation correctly appears once", () => {
    const piece = BANNER_PIECES.find((p) => p.id === "BG_TITANIUM"); // titan_rank4
    const fighter = bf({ badgesEarned: [] });
    const before = new Set(BANNER_PIECES.filter((p) => bannerService.isUnlocked(fighter, p)).map((p) => p.id));
    // mutation: fight resolve awards the gym-rank badge mid-flow
    fighter.badgesEarned.push({ badgeId: "titan_rank4", earnedAt: new Date() });
    const after = new Set(BANNER_PIECES.filter((p) => bannerService.isUnlocked(fighter, p)).map((p) => p.id));
    const newlyUnlocked = BANNER_PIECES.filter((p) => after.has(p.id) && !before.has(p.id));
    assert.equal(newlyUnlocked.filter((p) => p.id === piece.id).length, 1);
});
