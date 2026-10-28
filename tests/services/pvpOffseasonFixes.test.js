/**
 * Two behaviours the 5-day off-season made visible (QA 2026-10-28):
 *  1. A defense gameplan set during the off-season must reach the soft-reset record that
 *     already exists for the upcoming season (fights read the record, not the fighter).
 *  2. Career history must not list that upcoming-season record as a past season.
 * Models are stubbed in memory; no database.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fighter = require("../../models/fighterModel");
const Season = require("../../models/seasonModel");
const PVPRecord = require("../../models/pvpRecordModel");
const HallOfFame = require("../../models/hallOfFameModel");
const pvpSeasonService = require("../../services/pvpSeasonService");
const pvpFightService = require("../../services/pvpFightService");
const pvpRecordService = require("../../services/pvpRecordService");

function stub(obj, key, value) {
    const real = obj[key];
    obj[key] = value;
    return () => { obj[key] = real; };
}

function fakeFighter() {
    return {
        weightClass: "Lightweight",
        pvpDefenseGameplan: "balanced",
        async save() { this.saved = true; },
    };
}

test("setDefenseGameplan in the off-season updates the upcoming season's existing record", async () => {
    const fighter = fakeFighter();
    const calls = [];
    const undo = [
        stub(Fighter, "findById", () => ({ select: async () => fighter })),
        stub(pvpSeasonService, "getCurrentSeasonForFighter", async () => ({ _id: "s3", status: "upcoming" })),
        stub(PVPRecord, "updateOne", async (filter, update) => { calls.push({ filter, update }); return { matchedCount: 1 }; }),
    ];
    try {
        const res = await pvpFightService.setDefenseGameplan("f1", "counter");
        assert.deepEqual(res, { defenseGameplan: "counter", scope: "fighter" });
        assert.equal(fighter.pvpDefenseGameplan, "counter");
        assert.deepEqual(calls, [{ filter: { playerId: "f1", seasonId: "s3" }, update: { $set: { defenseGameplan: "counter" } } }]);
    } finally {
        undo.forEach((u) => u());
    }
});

test("setDefenseGameplan with no season at all touches no record", async () => {
    const fighter = fakeFighter();
    let touched = false;
    const undo = [
        stub(Fighter, "findById", () => ({ select: async () => fighter })),
        stub(pvpSeasonService, "getCurrentSeasonForFighter", async () => null),
        stub(PVPRecord, "updateOne", async () => { touched = true; }),
    ];
    try {
        await pvpFightService.setDefenseGameplan("f1", "counter");
        assert.equal(fighter.pvpDefenseGameplan, "counter");
        assert.equal(touched, false);
    } finally {
        undo.forEach((u) => u());
    }
});

const lean = (rows) => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) });

test("career history leaves out the upcoming season's soft-reset record", async () => {
    const records = [
        { seasonId: "s3", weightClass: "Open", division: "contender", dp: 400 },
        { seasonId: "s2", weightClass: "Open", division: "elite", dp: 1900 },
        { seasonId: "s1", weightClass: "Open", division: "challenger", dp: 1200 },
    ];
    const seasons = [
        { _id: "s3", seasonNumber: 3, name: "Frostbite", status: "upcoming" },
        { _id: "s2", seasonNumber: 2, name: "Blood Sport", status: "ended" },
        { _id: "s1", seasonNumber: 1, name: "Iron Circuit", status: "ended" },
    ];
    const undo = [
        stub(PVPRecord, "find", () => lean(records)),
        stub(PVPRecord, "countDocuments", async () => 0),
        stub(Season, "find", () => ({ lean: async () => seasons })),
        stub(HallOfFame, "find", () => ({ lean: async () => [] })),
    ];
    try {
        const rows = await pvpRecordService.getHistoryForCareer("f1");
        assert.deepEqual(rows.map((r) => r.seasonNumber), [2, 1]);
        assert.ok(rows.every((r) => r.isActive === false));
    } finally {
        undo.forEach((u) => u());
    }
});
