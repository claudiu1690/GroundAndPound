/**
 * campService.debutCoachPick and its use in getFighterReport / getCampState
 * (first-session contract B.4). The Coach's pick is only on a Debut fight and always scores
 * MATCHED against the opponent's style. No DB: Fight.findById / FightCamp.findOne stubbed.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const Fight = require("../../models/fightModel");
const FightCamp = require("../../models/fightCampModel");
const campService = require("../../services/campService");
const { STYLES } = require("../../consts/gameConstants");
const { STYLE_SESSION_MAP, CAMP_SESSIONS, MATCH_STATUSES } = require("../../consts/campConfig");

const { debutCoachPick, getMatchStatus } = campService;

test("debutCoachPick: first STYLE_SESSION_MAP entry on a Debut fight, MATCHED for every style", () => {
    for (const style of Object.keys(STYLES)) {
        const pick = debutCoachPick({ offerType: "Debut" }, style);
        assert.equal(pick, STYLE_SESSION_MAP[style][0], style);
        assert.ok(CAMP_SESSIONS[pick], `${pick} is a real session`);
        if (typeof getMatchStatus === "function") {
            assert.equal(getMatchStatus(pick, style, []), MATCH_STATUSES.MATCHED, style);
        }
    }
});

test("debutCoachPick: null off the debut and for unknown / hostile styles", () => {
    for (const t of ["Easy", "Even", "Hard", "TitleShot", undefined]) {
        assert.equal(debutCoachPick({ offerType: t }, "Boxer"), null, String(t));
    }
    assert.equal(debutCoachPick(null, "Boxer"), null);
    for (const s of [undefined, null, "Karate", "constructor", "__proto__"]) {
        assert.equal(debutCoachPick({ offerType: "Debut" }, s), null, String(s));
    }
});

function fightDoc(offerType, style = "Wrestler") {
    return {
        _id: "fight1", offerType, isCallout: false,
        opponentId: {
            _id: "o1", name: "Gareth Pryce", style, overallRating: 9, isChampion: false,
            str: 7, spd: 7, leg: 7, wre: 11, gnd: 11, sub: 9, chn: 9, fiq: 9,
            record: { wins: 0, losses: 0, draws: 0 }, fightHistory: [],
        },
    };
}

async function withFight(doc, body) {
    const orig = Fight.findById;
    Fight.findById = () => {
        const chain = { populate() { return chain; }, lean: async () => doc, then: (r, j) => Promise.resolve(doc).then(r, j) };
        return chain;
    };
    try { return await body(); } finally { Fight.findById = orig; }
}

test("getFighterReport: isDebut + coachPick on a Debut fight; false / null otherwise", async () => {
    await withFight(fightDoc("Debut"), async () => {
        const r = await campService.getFighterReport("fight1");
        assert.equal(r.isDebut, true);
        assert.equal(r.coachPick, "TAKEDOWN_DEFENCE");
    });
    await withFight(fightDoc("Even"), async () => {
        const r = await campService.getFighterReport("fight1");
        assert.equal(r.isDebut, false);
        assert.equal(r.coachPick, null);
    });
});

test("getCampState: carries the same isDebut + coachPick", async () => {
    const camp = {
        fighterId: "f1", sessions: [], maxSlots: 2, finalisedAt: null, isInjured: false,
        toObject() { return { fighterId: "f1", sessions: [], maxSlots: 2 }; },
    };
    const origFind = FightCamp.findOne;
    FightCamp.findOne = async () => camp;
    try {
        await withFight(fightDoc("Debut", "Boxer"), async () => {
            const s = await campService.getCampState("fight1", "f1");
            assert.equal(s.isDebut, true);
            assert.equal(s.coachPick, "STRIKING_ACCURACY");
            assert.equal(s.isTitleFight, false);
        });
        await withFight(fightDoc("Hard", "Boxer"), async () => {
            const s = await campService.getCampState("fight1", "f1");
            assert.equal(s.isDebut, false);
            assert.equal(s.coachPick, null);
        });
    } finally {
        FightCamp.findOne = origFind;
    }
});
