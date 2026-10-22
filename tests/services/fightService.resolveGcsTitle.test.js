/**
 * End-to-end drive of fightService.resolveFightAndApply for TitleShot fights, with every
 * DB-touching collaborator stubbed. Audits the post-save path (describeTitleWin, drinks,
 * badges, summary) that threw on promoted.from at GCS before the contender change.
 *
 *   - GCS title WIN (first), GCS title defense (second), GCS title LOSS
 *   - National title WIN (lower-tier regression: promotes, resets, drinks, same TITLE_WON text)
 *
 * No Mongo: models are real (for defaults/toObject) but never saved; statics and the
 * stateful services are replaced on the module objects before fightService runs them.
 * fightResolution.resolveFight is replaced BEFORE fightService is required (it destructures
 * the export at load), so the outcome is deterministic.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const fightResolution = require("../../utils/fightResolution");
let NEXT_OUTCOME = "KO/TKO";
const realResolve = fightResolution.resolveFight;
fightResolution.resolveFight = () => ({
    outcome: NEXT_OUTCOME,
    rounds: [{ round: 1, event: "x", playerHealth: 80, opponentHealth: 0 }],
    commentary: [],
    playerHealthAfter: 80,
    playerStaminaAfter: 50,
    sessionBonuses: [],
    moveBonuses: [],
    wildcard: null,
    log: [],
});

const Fighter = require("../../models/fighterModel");
const Fight = require("../../models/fightModel");
const FightCamp = require("../../models/fightCampModel");
const FameEvent = require("../../models/fameEventModel");
const fightService = require("../../services/fightService");
const questService = require("../../services/questService");
const activityLogService = require("../../services/activityLogService");
const analyticsService = require("../../services/analyticsService");

const restores = [];
function stub(obj, key, val) {
    const orig = obj[key];
    obj[key] = val;
    restores.push(() => { obj[key] = orig; });
}

const logs = [];
const fameRows = [];
let currentFighter = null;
let currentFight = null;

before(() => {
    stub(Fighter, "findById", () => { const p = Promise.resolve(currentFighter); p.select = () => ({ lean: async () => null }); return p; });
    stub(Fight, "findById", () => ({
        populate: async () => currentFight,
        select() { return this; },
        lean: async () => null,
    }));
    // Resolve claim (accepted -> resolving): always won here, so nothing touches Mongo.
    stub(Fight, "updateOne", async () => ({ modifiedCount: 1, matchedCount: 1 }));
    stub(FightCamp, "findOne", async () => null);
    stub(FameEvent, "create", async (row) => { fameRows.push(row); return row; });
    stub(questService, "onFight", async () => []);
    stub(activityLogService, "log", (...a) => { logs.push(a); });
    stub(analyticsService, "track", () => {});
    stub(require("../../services/gymRankService"), "onFightWin", async () => []);
    stub(require("../../services/homeCampCoachService"), "onFightResolved", async () => ({ credited: 0, conditionGained: 0 }));
    const mediaHub = require("../../services/mediaHubService");
    stub(mediaHub, "resolveDocumentaryOnFight", async () => {});
    stub(mediaHub, "armUndercardOnFight", async () => {});
    stub(require("../../services/sponsorshipService"), "resolveAfterFight", async () => ({ events: [], ironDelta: 0 }));
});

after(() => {
    fightResolution.resolveFight = realResolve;
    while (restores.length) restores.pop()();
});

function makeFighter(over = {}) {
    const f = new Fighter({
        firstName: "Test", lastName: "Fighter", weightClass: "Lightweight",
        promotionTier: "GCS", overallRating: 80,
        ranking: { rank: 3, fightsInTier: 12 },
        winsInCurrentTier: 9, topFiveWinsInTier: 3, titleShotCooldown: 0,
        record: { wins: 20, losses: 2, draws: 0 },
        ...over,
    });
    f.save = async () => f;
    f.acceptedFightId = "507f1f77bcf86cd799439011";
    return f;
}

function makeFight(fighter, offerType = "TitleShot") {
    const opponent = {
        _id: "507f1f77bcf86cd799439022", name: "Champ", style: "Boxing", overallRating: 85,
        fixedRank: 1, isChampion: true, fightHistory: [],
        save: async () => {},
        toObject() { const { save, toObject, ...rest } = this; return rest; },
    };
    return {
        _id: "507f1f77bcf86cd799439033", fighterId: fighter._id, status: "accepted", offerType,
        promotionTier: fighter.promotionTier, opponentId: opponent, purse: 1000,
        save: async () => {}, weightCut: "easy",
    };
}

async function run(fighter, outcome, offerType = "TitleShot") {
    logs.length = 0; fameRows.length = 0;
    NEXT_OUTCOME = outcome;
    currentFighter = fighter;
    currentFight = makeFight(fighter, offerType);
    return fightService.resolveFightAndApply(String(fighter._id), "user1");
}

const titleWonLogs = () => logs.filter((l) => l[1] === "TITLE_WON");
const types = () => logs.map((l) => l[1]);

test("GCS first title win: no throw, no promotion, drinks once, fame 200, badge, summary", async () => {
    const f = makeFighter();
    f.notoriety = { score: 0, peakTier: "UNKNOWN" };
    const startDrinks = f.inventory?.energyDrinks ?? 0;
    const out = await run(f, "KO/TKO");
    const s = out.summary;

    assert.equal(s.beltWon, true);
    assert.equal(s.promoted, null);
    assert.equal(s.titleDefense, false);
    assert.equal(s.beltTier, "GCS");
    assert.equal(s.gcsTitleWins, 1);
    assert.equal(s.drinksGranted.promotion, 3);
    assert.equal(f.inventory.energyDrinks, startDrinks + 3);

    assert.equal(f.promotionTier, "GCS");
    assert.equal(f.pendingPromotion, null);
    assert.equal(f.ranking.fightsInTier >= 12, true, "ranking not reset");
    assert.notEqual(f.ranking.rank, null, "ranking not reset to unranked");
    assert.equal(f.topFiveWinsInTier, 0);
    assert.equal(f.titleShotCooldown, 0);
    assert.equal(f.gcsTitleWins, 1);
    assert.ok(f.badges.includes("Champion"));

    assert.ok(!types().includes("TIER_PROMOTION"));
    const tw = titleWonLogs();
    assert.equal(tw.length, 1);
    assert.equal(tw[0][2], "Won the GCS Lightweight Title");
    assert.equal(tw[0][3].defense, false);
    assert.equal(tw[0][3].gcsTitleWins, 1);
    assert.equal(tw[0][3].drinksGranted, 3);

    // belt fame ledger: exactly one BELT_WON of +200, and no TITLE_DEF +300
    const belt = fameRows.filter((r) => r.code === "BELT_WON");
    assert.equal(belt.length, 1);
    assert.equal(belt[0].delta, 200);
    assert.ok(!fameRows.some((r) => /TITLE_DEF/.test(r.code)));
    assert.ok(!s.notorietyBreakdown.some((b) => /TITLE_DEF|TITLE_FIGHT/.test(b.code)));

    // champ_gcs awarded exactly once
    const champ = (f.badgesEarned || []).filter((b) => b.badgeId === "champ_gcs");
    assert.equal(champ.length, 1);
    assert.ok(s.newBadges.includes("Champion"));

    // public payload carries the new owner fields
    assert.equal(out.fighter.titleContender, true);
    assert.equal(out.fighter.gcsTitleWins, 1);
});

test("GCS second title win (defense): +100 fame, no drinks, no new badge, defense log", async () => {
    const f = makeFighter({ gcsTitleWins: 1, badges: ["Champion"] });
    f.notoriety = { score: 5000, peakTier: "UNKNOWN" };
    const startDrinks = f.inventory?.energyDrinks ?? 0;
    const out = await run(f, "Submission");
    const s = out.summary;

    assert.equal(s.beltWon, true);
    assert.equal(s.promoted, null);
    assert.equal(s.titleDefense, true);
    assert.equal(s.beltTier, "GCS");
    assert.equal(s.gcsTitleWins, 2);
    assert.equal(s.drinksGranted.promotion, 0);
    assert.equal(f.inventory.energyDrinks, startDrinks);
    assert.equal(f.badges.filter((b) => b === "Champion").length, 1);
    assert.ok(!s.newBadges.includes("Champion"));

    const tw = titleWonLogs();
    assert.equal(tw.length, 1);
    assert.equal(tw[0][2], "Defended the GCS Lightweight Title (x1)");
    assert.equal(tw[0][3].defense, true);

    const belt = fameRows.filter((r) => r.code === "BELT_WON");
    assert.equal(belt.length, 1);
    assert.equal(belt[0].delta, 100);
    assert.ok(!fameRows.some((r) => /TITLE_DEF/.test(r.code)));
});

test("GCS title loss: cooldown 2, no belt, no counters moved, no throw", async () => {
    const f = makeFighter({ gcsTitleWins: 1 });
    f.notoriety = { score: 5000, peakTier: "UNKNOWN" };
    const out = await run(f, "Loss (KO/TKO)");
    const s = out.summary;

    assert.equal(s.beltWon, false);
    assert.equal(s.promoted, null);
    assert.equal(s.titleDefense, false);
    assert.equal(s.beltTier, null);
    assert.equal(s.titleShotLost, true);
    assert.equal(f.titleShotCooldown, 2);
    assert.equal(f.gcsTitleWins, 1);
    assert.equal(titleWonLogs().length, 0);
    assert.equal(f.pendingPromotion, null);
    assert.equal(out.fighter.titleContender, true);
});

test("National title win (regression): promotes, resets ranking and counters, drinks, same TITLE_WON text", async () => {
    const f = makeFighter({ promotionTier: "National", pendingPromotion: "GCS Contender" });
    f.notoriety = { score: 0, peakTier: "UNKNOWN" };
    const startDrinks = f.inventory?.energyDrinks ?? 0;
    const out = await run(f, "KO/TKO");
    const s = out.summary;

    assert.equal(s.beltWon, true);
    assert.deepEqual(s.promoted, { from: "National", to: "GCS Contender", viaTitleShot: true });
    assert.equal(s.beltTier, "National");
    assert.equal(s.titleDefense, false);
    assert.equal(s.gcsTitleWins, 0);
    assert.equal(s.drinksGranted.promotion, 3);
    assert.equal(f.inventory.energyDrinks, startDrinks + 3);

    assert.equal(f.promotionTier, "GCS Contender");
    assert.equal(f.pendingPromotion, null);
    assert.equal(f.winsInCurrentTier, 0);
    assert.equal(f.topFiveWinsInTier, 0);
    assert.equal(f.titleShotCooldown, 0);
    assert.equal(f.ranking.rank, null);
    assert.equal(f.ranking.fightsInTier, 0);
    assert.ok(f.badges.includes("Champion"));

    const tw = titleWonLogs();
    assert.equal(tw.length, 1);
    const dash = String.fromCharCode(0x2014);
    assert.equal(tw[0][2], "Won National Lightweight Title " + dash + " promoted to GCS Contender");
    assert.deepEqual(tw[0][3], { from: "National", to: "GCS Contender", weightClass: "Lightweight", tier: "National", drinksGranted: 3 });
    assert.ok(!types().includes("TIER_PROMOTION"));
    assert.equal(fameRows.filter((r) => r.code === "BELT_WON")[0].delta, 200);
    assert.equal(out.fighter.titleContender, false);
});

test("GCS non-title win: no belt fields set, still a contender, no drinks", async () => {
    const f = makeFighter({ topFiveWinsInTier: 1, gcsTitleWins: 2 });
    f.notoriety = { score: 5000, peakTier: "UNKNOWN" };
    const out = await run(f, "KO/TKO", "Even");
    assert.equal(out.summary.beltWon, false);
    assert.equal(out.summary.beltTier, null);
    assert.equal(out.summary.titleDefense, false);
    assert.equal(out.summary.drinksGranted.promotion, 0);
    assert.equal(f.gcsTitleWins, 2);
    assert.equal(titleWonLogs().length, 0);
});
