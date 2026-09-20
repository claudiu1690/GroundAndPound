// QA unit tests — season rollover FORMAT CONTINUITY (pvpRewardService.finalizeSeason).
//
// Owner decision: seasons stay Open (one cross-weight-class ladder, one belt). The
// four-per-weight-class fan-out is DEFERRED, not deleted, and stays reachable through
// the single OPEN_SPLIT_AT_SEASON switch in consts/pvpConfig.js.
//
// These tests exist because the transition sweep calls finalizeSeason unattended every
// 10 minutes: whatever this function does on the ending season's endDate is what
// production does, with nobody watching. So they assert the SHAPE of what rollover
// creates (how many seasons, which format, which target each record lands in) rather
// than any single helper in isolation.
//
// No DB: model methods are stubbed with an in-memory store, matching the convention of
// tests/services/pvpSeasonTease.qa.test.js (tests/services/*.test.js never spin up
// Mongo/Redis). The fake PVPRecord.create deliberately re-implements the two schema
// constraints that matter here — the {playerId,seasonId} unique index and the
// realWeightClass enum (models/pvpRecordModel.js:16) — because both are load-bearing:
// the index is what makes re-finalize safe, and the enum is what silently ate legacy
// records whose realWeightClass was null.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Season = require("../../models/seasonModel");
const PVPRecord = require("../../models/pvpRecordModel");
const HallOfFame = require("../../models/hallOfFameModel");
const Fighter = require("../../models/fighterModel");
const notorietyService = require("../../services/notorietyService");
const shopService = require("../../services/shopService");
const activityLogService = require("../../services/activityLogService");
const pvpConfig = require("../../consts/pvpConfig");
const pvpSeasonService = require("../../services/pvpSeasonService");
const pvpRewardService = require("../../services/pvpRewardService");

const {
    WEIGHT_CLASSES_PVP,
    SEASON_WEIGHT_CLASSES,
    OPEN_WEIGHT_CLASS,
    SOFT_RESET,
    REWARDS,
    divisionFloor,
} = pvpConfig;

// ── Side-effect services stubbed to pure mutation ───────────────────────────
// applyNotorietyDelta writes a fame-event row, activityLogService.log writes a feed
// row, and both would hit a Mongo connection that does not exist here. Rewards
// themselves are still observable through fighter.iron / fighter.fameApplied.
notorietyService.applyNotorietyDelta = (fighter, delta) => {
    fighter.fameApplied = (fighter.fameApplied || 0) + delta;
    return { applied: delta, blocked: false };
};
shopService.grantEnergyDrinks = (fighter, amount) => {
    fighter.drinksGranted = (fighter.drinksGranted || 0) + (Number(amount) || 0);
    return amount;
};
activityLogService.log = async () => {};

// ── In-memory model store ───────────────────────────────────────────────────
const db = { seasons: [], records: [], hof: [], fighters: new Map(), seq: 0 };

function resetDb() {
    db.seasons = [];
    db.records = [];
    db.hof = [];
    db.fighters = new Map();
    db.seq = 0;
}

function oid(prefix) {
    db.seq += 1;
    return `${prefix}-${db.seq}`;
}

function dupKey(what) {
    const err = new Error(`E11000 duplicate key error: ${what}`);
    err.code = 11000;
    return err;
}

Season.create = async (doc) => {
    if (db.seasons.some((s) => s.weightClass === doc.weightClass && s.seasonNumber === doc.seasonNumber)) {
        throw dupKey("season {weightClass,seasonNumber}");
    }
    if (!SEASON_WEIGHT_CLASSES.includes(doc.weightClass)) {
        throw new Error(`Season validation failed: weightClass: "${doc.weightClass}" is not a valid enum value`);
    }
    const saved = {
        ...doc,
        _id: oid("season"),
        config: { crossWeightClass: !!(doc.config && doc.config.crossWeightClass) },
        save: async () => {},
    };
    db.seasons.push(saved);
    return saved;
};

Season.findOne = async (filter = {}) =>
    db.seasons.find((s) => Object.entries(filter).every(([k, v]) => String(s[k]) === String(v))) || null;

function queryOf(rows) {
    const p = Promise.resolve(rows);
    p.sort = () => Promise.resolve(rows.slice().sort((a, b) => b.dp - a.dp));
    return p;
}

PVPRecord.find = (filter = {}) =>
    queryOf(db.records.filter((r) => Object.entries(filter).every(([k, v]) => String(r[k]) === String(v))));

PVPRecord.create = async (doc) => {
    if (db.records.some((r) => String(r.playerId) === String(doc.playerId) && String(r.seasonId) === String(doc.seasonId))) {
        throw dupKey("pvpRecord {playerId,seasonId}");
    }
    // models/pvpRecordModel.js:16 — realWeightClass enum is WEIGHT_CLASSES_PVP, which
    // does NOT include the "Open" sentinel. Writing "Open" here throws the whole row.
    if (doc.realWeightClass != null && !WEIGHT_CLASSES_PVP.includes(doc.realWeightClass)) {
        throw new Error(
            `PVPRecord validation failed: realWeightClass: \`${doc.realWeightClass}\` is not a valid enum value for path \`realWeightClass\`.`
        );
    }
    if (!SEASON_WEIGHT_CLASSES.includes(doc.weightClass)) {
        throw new Error(`PVPRecord validation failed: weightClass: \`${doc.weightClass}\` is not a valid enum value.`);
    }
    const saved = { ...doc, _id: oid("rec"), save: async () => {} };
    db.records.push(saved);
    return saved;
};

HallOfFame.create = async (doc) => {
    if (db.hof.some((h) => String(h.seasonId) === String(doc.seasonId))) throw dupKey("hof {seasonId}");
    const saved = { ...doc, _id: oid("hof") };
    db.hof.push(saved);
    return saved;
};

Fighter.findById = (id) => {
    const f = db.fighters.get(String(id)) || null;
    const p = Promise.resolve(f);
    // softResetOpen's legacy path: Fighter.findById(id).select("weightClass").lean()
    p.select = () => ({ lean: async () => (f ? { _id: f._id, weightClass: f.weightClass } : null) });
    return p;
};

// ── Builders ────────────────────────────────────────────────────────────────
const S1_START = new Date("2026-07-12T00:00:00.000Z");
// Deliberately non-round: season N+1 must inherit this to the millisecond.
const S1_END = new Date("2026-09-20T18:31:07.045Z");

function makeFighter(over = {}) {
    const _id = over._id || oid("fighter");
    const f = {
        _id,
        weightClass: "Lightweight",
        isPvpBot: false,
        iron: 0,
        badgesEarned: [],
        inventory: { energyDrinks: 0 },
        // firstSeasonComplete true by default so the welcome bonus does not muddy the
        // payout arithmetic; one test flips it on purpose.
        pvpOnboarding: { firstSeasonComplete: true },
        notoriety: { score: 0 },
        saves: 0,
        markModified() {},
        ...over,
    };
    f.save = async () => { f.saves += 1; };
    db.fighters.set(String(_id), f);
    return f;
}

function makeRecord(season, over = {}) {
    const rec = {
        _id: oid("rec"),
        seasonId: season._id,
        weightClass: season.weightClass,
        realWeightClass: "Lightweight",
        division: "prospect",
        dp: 0,
        peakDp: 0,
        overallRating: 24,
        wins: 1,
        losses: 0,
        winStreak: 0,
        longestStreak: 0,
        defenseGameplan: "balanced",
        lastFightAt: null,
        rewardedAt: null,
        firstSeasonBonusPaid: false,
        ...over,
    };
    rec.save = async () => {};
    db.records.push(rec);
    return rec;
}

/** An ending Open season doc (the thing the sweep hands to finalizeSeason). */
function endingOpenSeason(over = {}) {
    const s = {
        _id: "season-s1-open",
        seasonNumber: 1,
        name: "Iron Circuit",
        twist: "iron_circuit",
        weightClass: OPEN_WEIGHT_CLASS,
        startDate: S1_START,
        endDate: S1_END,
        status: "active",
        beltHolderId: null,
        redistributedAt: null,
        config: { crossWeightClass: true },
        ...over,
    };
    s.save = async () => {};
    return s;
}

/** Seed a full Open S1: one fighter + one record per spec entry. */
function seedOpenLadder(season, specs) {
    return specs.map((spec) => {
        const fighter = makeFighter({ weightClass: spec.realWeightClass || "Lightweight", isPvpBot: !!spec.isPvpBot });
        return makeRecord(season, {
            playerId: fighter._id,
            division: spec.division || "prospect",
            dp: spec.dp != null ? spec.dp : divisionFloor(spec.division || "prospect"),
            wins: spec.wins != null ? spec.wins : 1,
            losses: spec.losses != null ? spec.losses : 0,
            realWeightClass: "realWeightClass" in spec ? spec.realWeightClass : "Lightweight",
        });
    });
}

function seasonsOf(seasonNumber) {
    return db.seasons.filter((s) => s.seasonNumber === seasonNumber);
}

function recordsFor(seasonId) {
    return db.records.filter((r) => String(r.seasonId) === String(seasonId));
}

// OPEN_SPLIT_AT_SEASON is a process-wide config value. Every test that changes it goes
// through withSplitAt, which restores in a `finally` so a failed assertion cannot leak
// the switch into the next test.
const SPLIT_DEFAULT = pvpConfig.OPEN_SPLIT_AT_SEASON;

async function withSplitAt(value, fn) {
    pvpConfig.OPEN_SPLIT_AT_SEASON = value;
    try {
        return await fn();
    } finally {
        pvpConfig.OPEN_SPLIT_AT_SEASON = SPLIT_DEFAULT;
    }
}

// finalizeSeason is best-effort: seeding/soft-reset failures are swallowed to
// console.error. A silent console.error therefore IS a failure signal here.
async function captureErrors(fn) {
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.map(String).join(" "));
    try {
        const value = await fn();
        return { value, logged };
    } finally {
        console.error = original;
    }
}

// ── 1. An ending Open season rolls into ANOTHER Open season ─────────────────

test("finalize Open S1: creates exactly ONE next season, and it is Open", async () => {
    resetDb();
    const s1 = endingOpenSeason();
    seedOpenLadder(s1, [
        { division: "contender", realWeightClass: "Featherweight" },
        { division: "elite", realWeightClass: "Heavyweight" },
    ]);

    const { logged } = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    assert.deepEqual(logged, [], "rollover must not swallow any error");

    assert.equal(db.seasons.length, 1, "exactly one season doc created by the rollover");
    const next = db.seasons[0];
    assert.equal(next.seasonNumber, 2);
    assert.equal(next.weightClass, OPEN_WEIGHT_CLASS);
    assert.equal(next.config.crossWeightClass, true, "a half-Open season (crossWeightClass false at weightClass Open) silently partitions the ladder");
    assert.equal(next.status, "upcoming");
    assert.equal(
        new Date(next.startDate).getTime(),
        s1.endDate.getTime(),
        "season N+1 starts exactly when N ended — the public tease derives the same value"
    );
    assert.equal(next.twist, pvpSeasonService.pickTwistForSeason(2), "the SAME deterministic pick the tease makes");
    assert.equal(next.name, pvpSeasonService.seasonNameFor(pvpSeasonService.pickTwistForSeason(2)));

    for (const wc of WEIGHT_CLASSES_PVP) {
        assert.equal(
            db.seasons.filter((s) => s.weightClass === wc).length,
            0,
            `no per-weight-class season may be created for ${wc} — the split is deferred`
        );
    }
    assert.equal(s1.status, "ended");
    assert.ok(s1.redistributedAt instanceof Date, "completion marker set");
});

// ── 2. Soft reset lands everyone in the new Open ladder ─────────────────────

test("finalize Open S1: every record soft-resets into the Open S2 ladder", async () => {
    resetDb();
    const s1 = endingOpenSeason();
    const specs = [
        { division: "prospect", realWeightClass: "Featherweight" },
        { division: "contender", realWeightClass: "Lightweight" },
        { division: "challenger", realWeightClass: "Middleweight" },
        { division: "elite", realWeightClass: "Heavyweight" },
        { division: "champion", realWeightClass: "Middleweight", wins: 6, losses: 1 },
    ];
    const before = seedOpenLadder(s1, specs);

    const { logged } = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    assert.deepEqual(logged, [], "no soft-reset row may fail quietly");

    const s2 = seasonsOf(2)[0];
    const after = recordsFor(s2._id);
    assert.equal(after.length, before.length, "count in == count out — nobody is dropped by the rollover");

    for (const old of before) {
        const fresh = after.find((r) => String(r.playerId) === String(old.playerId));
        assert.ok(fresh, `player ${old.playerId} must carry into S2`);
        const target = SOFT_RESET[old.division];
        assert.equal(fresh.weightClass, OPEN_WEIGHT_CLASS, "S2 is one merged ladder — every record is stamped Open");
        assert.equal(fresh.division, target, `${old.division} soft-resets to ${target}`);
        assert.equal(fresh.dp, divisionFloor(target), "dp is the target division's floor");
        assert.equal(fresh.realWeightClass, old.realWeightClass, "the fighter's real class carries forward untouched");
        assert.equal(fresh.wins, 0);
        assert.equal(fresh.losses, 0);
        assert.equal(fresh.peakDp, 0);
        assert.equal(fresh.defenseGameplan, old.defenseGameplan);
    }
});

// ── 3. Regression: a legacy null realWeightClass must not be stamped "Open" ──

test("finalize Open S1: a null realWeightClass survives and is never written as 'Open'", async () => {
    resetDb();
    const s1 = endingOpenSeason();
    seedOpenLadder(s1, [{ division: "contender", realWeightClass: "Lightweight" }]);
    // Legacy record predating realWeightClass — the enum on that field is
    // WEIGHT_CLASSES_PVP, so writing the Open sentinel into it throws the whole row.
    const legacyFighter = makeFighter({ weightClass: "Heavyweight" });
    makeRecord(s1, { playerId: legacyFighter._id, division: "elite", realWeightClass: null });

    const { logged } = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    assert.deepEqual(logged, [], "a legacy record must not blow up (or quietly log) the soft reset");

    const s2 = seasonsOf(2)[0];
    const fresh = recordsFor(s2._id).find((r) => String(r.playerId) === String(legacyFighter._id));
    assert.ok(fresh, "the legacy record must still make it into S2");
    assert.notEqual(fresh.realWeightClass, OPEN_WEIGHT_CLASS, "'Open' is not a valid realWeightClass");
    assert.equal(fresh.realWeightClass, null, "unknown real class stays null on an Open→Open roll");
    assert.equal(fresh.weightClass, OPEN_WEIGHT_CLASS);
    assert.equal(fresh.division, SOFT_RESET.elite);
});

// ── 4. The deferred per-weight-class split is still reachable ───────────────

test("OPEN_SPLIT_AT_SEASON = 2: the same Open S1 fans out into 4 per-WC seasons", async () => {
    await withSplitAt(2, async () => {
        resetDb();
        const s1 = endingOpenSeason();
        const before = seedOpenLadder(s1, [
            { division: "contender", realWeightClass: "Featherweight" },
            { division: "elite", realWeightClass: "Lightweight" },
            { division: "champion", realWeightClass: "Middleweight", wins: 7, losses: 0 },
            { division: "prospect", realWeightClass: "Heavyweight" },
        ]);

        const { logged } = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
        assert.deepEqual(logged, [], "the deferred path must still run clean");

        const created = seasonsOf(2);
        assert.equal(created.length, 4, "one season per PVP weight class");
        assert.deepEqual(
            created.map((s) => s.weightClass).sort(),
            [...WEIGHT_CLASSES_PVP].sort(),
            "exactly the 4 real classes"
        );
        assert.equal(created.filter((s) => s.weightClass === OPEN_WEIGHT_CLASS).length, 0, "no Open season when splitting");
        for (const s of created) {
            assert.equal(s.config.crossWeightClass, false);
            assert.equal(new Date(s.startDate).getTime(), s1.endDate.getTime());
        }

        for (const old of before) {
            const target = created.find((s) => s.weightClass === old.realWeightClass);
            const fresh = recordsFor(target._id).find((r) => String(r.playerId) === String(old.playerId));
            assert.ok(fresh, `player ${old.playerId} must land in the ${old.realWeightClass} ladder`);
            assert.equal(fresh.weightClass, old.realWeightClass, "redistributed by REAL weight class");
            assert.equal(fresh.realWeightClass, old.realWeightClass);
            assert.equal(fresh.division, SOFT_RESET[old.division]);
            assert.equal(fresh.dp, divisionFloor(SOFT_RESET[old.division]));
        }
    });
});

test("OPEN_SPLIT_AT_SEASON = null is the shipped default: Open rolls into Open forever", () => {
    assert.equal(SPLIT_DEFAULT, null, "seasons stay Open until an owner flips this ONE switch");
    assert.equal(pvpConfig.OPEN_SPLIT_AT_SEASON, null, "and the withSplitAt helper restored it");
});

// ── 5. Idempotency — the sweep holds no lock and re-runs after a crash ──────

test("finalizeSeason is idempotent: twice → one S2, no duplicate records, no second payout", async () => {
    resetDb();
    const s1 = endingOpenSeason();
    const [championRec] = seedOpenLadder(s1, [
        { division: "champion", realWeightClass: "Middleweight", wins: 8, losses: 0 },
        { division: "contender", realWeightClass: "Lightweight" },
        { division: "prospect", realWeightClass: "Featherweight", wins: 0, losses: 0 },
    ]);
    const beltFighter = db.fighters.get(String(championRec.playerId));

    const first = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    assert.deepEqual(first.logged, []);
    assert.equal(first.value.ended, true);
    assert.equal(first.value.beltHolderId, String(beltFighter._id), "the champion-division leader takes the single Open belt");

    const ironAfterFirst = beltFighter.iron;
    const seasonsAfterFirst = db.seasons.length;
    const recordsAfterFirst = db.records.length;
    assert.equal(ironAfterFirst, REWARDS.beltHolder.iron, "belt REPLACES champion rewards (no stack)");
    assert.equal(db.hof.length, 1, "one Hall of Fame entry for the ended season");

    // (a) Straight re-run — the redistributedAt completion marker short-circuits.
    const second = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    assert.deepEqual(second.logged, []);
    assert.equal(second.value.ended, false, "a fully completed season is not re-finalized");
    assert.equal(db.seasons.length, seasonsAfterFirst);
    assert.equal(db.records.length, recordsAfterFirst);
    assert.equal(beltFighter.iron, ironAfterFirst, "no second payout");

    // (b) Crash recovery — status ended but the marker never got written. The sweep
    // re-picks this season, so every step below it must be dup-key/rewardedAt safe.
    s1.redistributedAt = null;
    const third = await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    assert.deepEqual(third.logged, [], "dup-key on the re-run is expected and must be swallowed silently");
    assert.equal(seasonsOf(2).length, 1, "the S2 create is idempotent");
    assert.equal(db.seasons.length, seasonsAfterFirst);
    assert.equal(db.records.length, recordsAfterFirst, "no duplicate soft-reset records");
    assert.equal(db.hof.length, 1, "no duplicate Hall of Fame entry");
    assert.equal(beltFighter.iron, ironAfterFirst, "rewardedAt still guards the payout");
    assert.ok(s1.redistributedAt instanceof Date, "recovery re-stamps the completion marker");
});

// ── Belt identity across consecutive Open seasons ───────────────────────────

test("consecutive Open seasons mint distinct belt ids (no S1/S2 collision)", async () => {
    resetDb();
    const s1 = endingOpenSeason();
    const [beltRec] = seedOpenLadder(s1, [{ division: "champion", realWeightClass: "Middleweight", wins: 9, losses: 0 }]);
    const champ = db.fighters.get(String(beltRec.playerId));

    await captureErrors(() => pvpRewardService.finalizeSeason(s1));
    const s1BeltIds = champ.badgesEarned.map((b) => b.badgeId);
    assert.ok(s1BeltIds.includes("pvp_belt_s1_open"), "Season 1 Open belt id");

    // Now roll the Open S2 the first finalize created, with the same fighter on top.
    const s2Doc = seasonsOf(2)[0];
    const s2 = { ...s2Doc, status: "active", redistributedAt: null, save: async () => {} };
    const s2Rec = recordsFor(s2._id).find((r) => String(r.playerId) === String(champ._id));
    s2Rec.division = "champion";
    s2Rec.dp = 5200;
    s2Rec.wins = 11;
    s2Rec.losses = 0;
    s2Rec.rewardedAt = null;

    await captureErrors(() => pvpRewardService.finalizeSeason(s2));
    const after = champ.badgesEarned.map((b) => b.badgeId);
    assert.ok(after.includes("pvp_belt_s2_open"), "Season 2 Open belt gets its OWN id");
    assert.equal(new Set(after).size, after.length, "no duplicate badge entries");
    assert.ok(after.includes("pvp_belt_2"), "two belt seasons → the multi-belt badge");
    assert.ok(after.includes("pvp_belt_b2b"), "S1 + S2 are consecutive → back-to-back");
});
