/**
 * Fight replay highlights (contract B.2): move_fired / wildcard_fired / takedown_stuffed
 * derivation. Hand-built engine results per anchor row, plus a seeded real-engine sweep that
 * checks the accuracy rules (spec §7): times real or null, outcomes the round proves, counts
 * identical to the engine's triggerCount.
 */
const assert = require("node:assert");
const { test } = require("node:test");

const { deriveFightDetails } = require("../../utils/fightBreakdown");
const { buildBreakdownResponse } = require("../../utils/fightBreakdownView");
const { buildLoadoutSnapshot } = require("../../utils/fightLoadoutSnapshot");
const { resolveFight } = require("../../utils/fightResolution");
const specialMovesService = require("../../services/specialMovesService");
const { SPECIAL_MOVES } = require("../../consts/specialMovesCatalog");

const ctx = {
    playerStyle: "Wrestler",
    opponentStyle: "Boxer",
    isTitle: false, isGrudge: false, comeback: false, isCallout: false,
    playerOvr: 30, opponentOvr: 30, playerName: "P", opponentName: "O", maxRounds: 3,
};

const rec = (moveId, bonusType, effectType, site, siteOutcome, count = 1, moveIds) => ({
    moveId, moveIds: moveIds || [moveId], bonusType, effectType, site, siteOutcome, count,
});

function result(rounds, extra = {}) {
    return {
        outcome: "Decision (unanimous)", winner: "player", finishCause: null,
        sessionBonuses: [], wildcard: null,
        ...extra,
        rounds: rounds.map((r, i) => ({
            round: i + 1, grapplingControl: 0, playerDamage: 6, opponentDamage: 8,
            playerHealth: 94 - i * 6, opponentHealth: 92 - i * 8, campCommentary: [], moveFired: [],
            ...r,
        })),
    };
}

const STRIKE = "Striking exchange.";
const TD_P = "Takedown; ground and pound.";
const TD_O = "Opponent took you down.";
const GR_P = "Holding top control; ground and pound.";
const GR_O = "Stuck on bottom; opponent grinds.";

function moves(eventLog, round) {
    return eventLog.filter((e) => e.type === "move" && (round == null || e.round === round));
}
function roundEvents(eventLog, round) {
    return eventLog.filter((e) => e.round === round);
}
function anchorOf(eventLog, mv) {
    // The anchor is the closest non-move, non-camp event before it with the same timestamp.
    const idx = eventLog.indexOf(mv);
    for (let i = idx - 1; i >= 0; i--) {
        const e = eventLog[i];
        if (e.round !== mv.round) break;
        if (e.type === "move" || e.type === "camp") continue;
        if (e.timestamp === mv.timestamp) return e;
        break;
    }
    // finish-anchored combos sit right BEFORE the finish
    const fin = eventLog.find((e) => e.round === mv.round && e.type === "finish");
    if (fin && fin.timestamp === mv.timestamp) return fin;
    return null;
}

// ── Anchor rows ────────────────────────────────────────────────────────────────

test("takedown_opponent stuffed: emits takedown_stuffed (opp) and anchors the move to it", () => {
    const r = result([{ event: STRIKE, moveFired: [rec("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "takedown_opponent", "stuffed")] }]);
    const { eventLog } = deriveFightDetails(r, ctx, "f-stuff");
    const stuffed = eventLog.find((e) => e.templateKey === "takedown_stuffed");
    assert.ok(stuffed, "takedown_stuffed emitted");
    assert.equal(stuffed.actorIsPlayer, false);
    assert.equal(stuffed.type, "takedown");
    assert.ok(stuffed.vars.strike, "carries the shot name");
    const [mv] = moves(eventLog);
    assert.equal(mv.vars.outcome, "stuffed");
    assert.equal(mv.timestamp, stuffed.timestamp);
    assert.ok(mv.timestamp, "anchored, so timed");
    assert.equal(eventLog.indexOf(mv), eventLog.indexOf(stuffed) + 1, "placed right after its anchor");
    assert.deepStrictEqual(mv.vars.moveIds, ["SPRAWL_INSTINCT"]);
    assert.equal(mv.vars.effectType, "PROC");
    assert.equal(mv.vars.count, 1);
    assert.equal(mv.actorIsPlayer, true);
});

test("takedown_opponent stuffed with a camp Takedown Defence fire: camp then move, same time (combo)", () => {
    const r = result([{
        event: STRIKE,
        campCommentary: ["campTakedownDefence"],
        moveFired: [rec("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "takedown_opponent", "stuffed")],
    }], { sessionBonuses: [{ bonusType: "SPRAWL_SUCCESS", matchStatus: "MATCHED" }] });
    const { eventLog } = deriveFightDetails(r, ctx, "f-combo");
    const stuffed = eventLog.find((e) => e.templateKey === "takedown_stuffed");
    const i = eventLog.indexOf(stuffed);
    assert.equal(eventLog[i + 1].templateKey, "camp_takedown_defence_fired");
    assert.equal(eventLog[i + 2].templateKey, "move_fired");
    assert.equal(eventLog[i + 1].timestamp, stuffed.timestamp);
    assert.equal(eventLog[i + 2].timestamp, stuffed.timestamp);
});

test("takedown_opponent landed: anchors to the opponent's takedown_secured", () => {
    const r = result([{ event: TD_O, grapplingControl: -1, playerDamage: 12, moveFired: [rec("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "takedown_opponent", "landed")] }]);
    const { eventLog } = deriveFightDetails(r, ctx, "f-tdland");
    const [mv] = moves(eventLog);
    assert.equal(mv.vars.outcome, "takedown_landed");
    const a = anchorOf(eventLog, mv);
    assert.equal(a.templateKey, "takedown_secured");
    assert.equal(a.actorIsPlayer, false);
    assert.ok(!eventLog.some((e) => e.templateKey === "takedown_stuffed"), "no stuffed event for a landed shot");
});

test("takedown_player landed: ground_pound anchor when present, finish when the TD round is a ground TKO", () => {
    const blitz = rec("BLAST_DOUBLE", "SIG_TAKEDOWN_BLITZ", "SIGNATURE", "takedown_player", "landed");
    const a = deriveFightDetails(result([{ event: TD_P, grapplingControl: 1, opponentDamage: 18, moveFired: [blitz] }]), ctx, "f-tdp");
    const [mv] = moves(a.eventLog);
    assert.equal(mv.vars.outcome, "ground_pound");
    assert.equal(anchorOf(a.eventLog, mv).templateKey, "ground_pound");

    const fin = result(
        [{ event: STRIKE }, { event: TD_P, grapplingControl: 1, opponentDamage: 40, opponentHealth: 0, moveFired: [blitz] }],
        { outcome: "KO/TKO", winner: "player", finishCause: "tko" }
    );
    const b = deriveFightDetails(fin, ctx, "f-tdp-fin");
    const [mv2] = moves(b.eventLog);
    assert.equal(mv2.vars.outcome, "finish");
    const last = b.eventLog.at(-1);
    assert.equal(last.type, "finish", "finish stays last in its round");
    assert.equal(mv2.timestamp, last.timestamp, "finish-anchored move shares the finish time");
});

test("ground_top held → ground_pound; escaped → round-only with outcome escaped", () => {
    const held = deriveFightDetails(result([
        { event: TD_P, grapplingControl: 1 },
        { event: GR_P, grapplingControl: 1, opponentDamage: 16, moveFired: [rec("MOUNT_REAPER", "GNP_DAMAGE", "PROC", "ground_top", "held", 1, ["MOUNT_REAPER", "TOP_CONTROL"])] },
    ]), ctx, "f-gt");
    const [mv] = moves(held.eventLog, 2);
    assert.equal(mv.vars.outcome, "ground_pound");
    assert.deepStrictEqual(mv.vars.moveIds, ["MOUNT_REAPER", "TOP_CONTROL"], "merged entry carries both ids");
    assert.ok(mv.timestamp);

    const esc = deriveFightDetails(result([
        { event: TD_P, grapplingControl: 1 },
        { event: STRIKE, moveFired: [rec("KILLER_INSTINCT", "SIG_KILLER_INSTINCT", "SIGNATURE", "ground_top", "escaped")] },
    ]), ctx, "f-gte");
    const [mv2] = moves(esc.eventLog, 2);
    assert.equal(mv2.vars.outcome, "escaped");
    assert.equal(mv2.timestamp, null, "no logged exchange: round-only, never an invented time");
});

test("ground_bottom → absorbed on the opponent's ground_pound; null outcome if the player was finished that round", () => {
    const ok = deriveFightDetails(result([{ event: GR_O, grapplingControl: -1, playerDamage: 14, moveFired: [rec("IRON_RECOVERY", "SIG_IRON_RECOVERY", "SIGNATURE", "ground_bottom", "held")] }]), ctx, "f-gb");
    const [mv] = moves(ok.eventLog);
    assert.equal(mv.vars.outcome, "absorbed");
    assert.equal(anchorOf(ok.eventLog, mv).templateKey, "ground_pound");

    const lost = deriveFightDetails(result(
        [{ event: GR_O, grapplingControl: -1, playerDamage: 40, playerHealth: 0, moveFired: [rec("IRON_RECOVERY", "SIG_IRON_RECOVERY", "SIGNATURE", "ground_bottom", "held")] }],
        { outcome: "Loss (KO/TKO)", winner: "opponent", finishCause: "tko" }
    ), ctx, "f-gb-lost");
    const [mv2] = moves(lost.eventLog);
    assert.equal(mv2.vars.outcome, null, "never claims it absorbed a beating that finished the player");
});

test("submission_player defended forces a logged attempt; finished anchors to submission_finish", () => {
    // fightId chosen so the 0.30 display roll alone would NOT show an attempt; the record forces it.
    let fid = null;
    for (let i = 0; i < 200 && !fid; i++) {
        const plain = deriveFightDetails(result([{ event: TD_P, grapplingControl: 1 }]), ctx, `f-sp-${i}`);
        if (plain.roundStats[0].subAttemptsPlayer === 0) fid = `f-sp-${i}`;
    }
    assert.ok(fid, "fixture: found a seed with no display sub attempt");
    const forced = deriveFightDetails(result([{ event: TD_P, grapplingControl: 1, moveFired: [rec("GUILLOTINE_CHOKE", "SUBMISSION_SUCCESS", "PROC", "submission_player", "defended")] }]), ctx, fid);
    assert.equal(forced.roundStats[0].subAttemptsPlayer, 1, "roundStats agrees with the forced attempt");
    const [mv] = moves(forced.eventLog);
    assert.equal(mv.vars.outcome, "sub_attempt");
    const a = anchorOf(forced.eventLog, mv);
    assert.equal(a.templateKey, "submission_attempt");
    assert.equal(a.actorIsPlayer, true);

    const fin = deriveFightDetails(result(
        [{ event: TD_P, grapplingControl: 1, moveFired: [rec("ARM_TRIANGLE", "SIG_SUBMISSION_HUNT", "SIGNATURE", "submission_player", "finished")] }],
        { outcome: "Submission", winner: "player", finishCause: "submission" }
    ), ctx, "f-spf");
    const [mv2] = moves(fin.eventLog);
    assert.equal(mv2.vars.outcome, "sub_finished");
    assert.equal(fin.eventLog.at(-1).templateKey, "submission_finish");
    assert.equal(mv2.timestamp, fin.eventLog.at(-1).timestamp);
});

test("submission_opponent: defended → escaped on their attempt; finished → tapped", () => {
    const d = deriveFightDetails(result([{ event: TD_O, grapplingControl: -1, playerDamage: 10, moveFired: [rec("NEVER_TAP", "ESCAPE_PROBABILITY", "PROC", "submission_opponent", "defended")] }]), ctx, "f-so");
    assert.ok(d.roundStats[0].subAttemptsOpponent >= 1);
    const [mv] = moves(d.eventLog);
    assert.equal(mv.vars.outcome, "escaped");
    const a = anchorOf(d.eventLog, mv);
    assert.equal(a.templateKey, "submission_attempt");
    assert.equal(a.actorIsPlayer, false);

    const t = deriveFightDetails(result(
        [{ event: TD_O, grapplingControl: -1, playerDamage: 10, moveFired: [rec("NEVER_TAP", "ESCAPE_PROBABILITY", "PROC", "submission_opponent", "finished")] }],
        { outcome: "Loss (submission)", winner: "opponent", finishCause: "submission" }
    ), ctx, "f-sot");
    assert.equal(moves(t.eventLog)[0].vars.outcome, "tapped");
});

test("striking: knockdown > hurt > landed by the player's strongest logged strike", () => {
    // opp crosses below 35 with ≥12 dealt → knockdown by the player
    const kd = deriveFightDetails(result([
        { event: STRIKE, opponentDamage: 20, opponentHealth: 50 },
        { event: STRIKE, opponentDamage: 20, opponentHealth: 30, moveFired: [rec("THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "striking", null)] },
    ]), ctx, "f-kd");
    const [mv] = moves(kd.eventLog);
    assert.equal(mv.vars.outcome, "knockdown");
    assert.equal(anchorOf(kd.eventLog, mv).templateKey, "knockdown");

    const hurt = deriveFightDetails(result([{ event: STRIKE, opponentDamage: 12, moveFired: [rec("SECOND_GEAR", "STRIKE_DAMAGE", "PROC", "striking", null)] }]), ctx, "f-hurt");
    assert.equal(moves(hurt.eventLog)[0].vars.outcome, "hurt");

    const landed = deriveFightDetails(result([{ event: STRIKE, opponentDamage: 6, playerDamage: 2, moveFired: [rec("SUPERMAN_PUNCH", "SIG_FAST_START", "SIGNATURE", "striking", null)] }]), ctx, "f-land");
    assert.equal(moves(landed.eventLog)[0].vars.outcome, "landed");

    const ko = deriveFightDetails(result(
        [{ event: STRIKE, opponentDamage: 45, opponentHealth: 0, moveFired: [rec("THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "striking", null)] }],
        { outcome: "KO/TKO", winner: "player", finishCause: "ko" }
    ), ctx, "f-ko");
    const [mvk] = moves(ko.eventLog);
    assert.equal(mvk.vars.outcome, "finish");
    assert.equal(ko.eventLog.at(-1).templateKey, "ko_finish");
});

test("defence (Fighting Spirit) and round_start (Second Wind)", () => {
    const d = deriveFightDetails(result([{ event: STRIKE, playerDamage: 14, opponentDamage: 4, moveFired: [
        rec("SECOND_WIND", "STAMINA_DRAIN", "PROC", "round_start", null),
        rec("FIGHTING_SPIRIT", "FLASH_KO_RESISTANCE", "PROC", "defence", null),
    ] }]), ctx, "f-def");
    const ms = moves(d.eventLog);
    const sw = ms.find((m) => m.vars.bonusType === "STAMINA_DRAIN");
    const fs = ms.find((m) => m.vars.bonusType === "FLASH_KO_RESISTANCE");
    assert.equal(sw.timestamp, null);
    assert.equal(sw.vars.outcome, null);
    assert.equal(roundEvents(d.eventLog, 1)[0], sw, "round_start moves open the round");
    assert.equal(fs.vars.outcome, "absorbed");
    const a = anchorOf(d.eventLog, fs);
    assert.equal(a.actorIsPlayer, false);
});

// ── Wildcard ─────────────────────────────────────────────────────────────────

test("wildcard_fired: round-only, first in its round, carries the stat; none when countered", () => {
    const wc = { stat: "leg", countered: false, round: 2, description: "x" };
    const d = deriveFightDetails(result([{ event: STRIKE }, { event: STRIKE }, { event: STRIKE }], { wildcard: wc }), ctx, "f-wc");
    const evs = d.eventLog.filter((e) => e.templateKey === "wildcard_fired");
    assert.equal(evs.length, 1);
    assert.equal(evs[0].round, 2);
    assert.equal(evs[0].timestamp, null);
    assert.equal(evs[0].vars.stat, "leg");
    assert.equal(evs[0].actorIsPlayer, false);
    assert.equal(evs[0].type, "wildcard");
    assert.equal(roundEvents(d.eventLog, 2)[0], evs[0]);

    const c = deriveFightDetails(result([{ event: STRIKE }, { event: STRIKE }], { wildcard: { ...wc, countered: true } }), ctx, "f-wcc");
    assert.ok(!c.eventLog.some((e) => e.templateKey === "wildcard_fired"), "countered wildcard is a summary fact, not a moment");
    const none = deriveFightDetails(result([{ event: STRIKE }], { wildcard: { ...wc, round: 4 } }), ctx, "f-wcn");
    assert.ok(!none.eventLog.some((e) => e.templateKey === "wildcard_fired"), "fight ended before the wildcard round");
});

// ── Keep rule / passives / legacy ──────────────────────────────────────────────

test("PASSIVE or untyped records never become events", () => {
    const d = deriveFightDetails(result([{ event: STRIKE, opponentDamage: 12, moveFired: [
        rec("HEAVY_HANDS", "STRIKE_DAMAGE", "PASSIVE", "striking", null),
        { moveId: "OLD", bonusType: "STRIKE_DAMAGE", site: "striking", count: 1 },
    ] }]), ctx, "f-pass");
    assert.equal(moves(d.eventLog).length, 0);
});

test("moves never get trimmed and keep their anchors; rounds without moves keep 3 to 6 events", () => {
    const many = [
        rec("SECOND_WIND", "STAMINA_DRAIN", "PROC", "round_start", null),
        rec("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "takedown_opponent", "stuffed"),
        rec("SECOND_GEAR", "STRIKE_DAMAGE", "PROC", "striking", null),
        rec("CLINCH_KILLER", "CLINCH_DAMAGE", "PROC", "striking", null),
        rec("FIGHTING_SPIRIT", "FLASH_KO_RESISTANCE", "PROC", "defence", null),
    ];
    const r = result([{
        event: STRIKE, opponentDamage: 30, playerDamage: 25, opponentHealth: 30, playerHealth: 40,
        campCommentary: ["campStrikingAccuracy", "campClinchControl", "campCardio", "campTakedownDefence", "campBodyShot"],
        moveFired: many,
    }, { event: STRIKE }]);
    const d = deriveFightDetails(r, ctx, "f-keep");
    const r1 = roundEvents(d.eventLog, 1);
    assert.equal(moves(d.eventLog, 1).length, many.length, "every firing is logged");
    const extras = r1.filter((e) => ["move", "wildcard"].includes(e.type) || e.templateKey === "takedown_stuffed").length;
    assert.ok(r1.length <= 6 + extras, `cap 6 + extras, got ${r1.length}`);
    for (const mv of moves(d.eventLog, 1)) {
        if (mv.timestamp == null) continue;
        assert.ok(
            r1.some((e) => e.type !== "move" && e.timestamp === mv.timestamp),
            `timed move ${mv.vars.bonusType} shares a logged exchange's time`
        );
    }
    const r2 = roundEvents(d.eventLog, 2);
    assert.ok(r2.length >= 3 && r2.length <= 6);
});

test("short finish round: anchors survive the slot window and the finish stays last", () => {
    for (let i = 0; i < 40; i++) {
        const r = result(
            [{
                event: STRIKE, opponentDamage: 45, playerDamage: 18, opponentHealth: 0, playerHealth: 60,
                campCommentary: ["campStrikingAccuracy", "campClinchControl", "campCardio"],
                moveFired: [
                    rec("SPRAWL_INSTINCT", "SPRAWL_SUCCESS", "PROC", "takedown_opponent", "stuffed"),
                    rec("THE_FINISHER", "SIG_FINISHER_STRIKE", "SIGNATURE", "striking", null),
                    rec("FIGHTING_SPIRIT", "FLASH_KO_RESISTANCE", "PROC", "defence", null),
                ],
            }],
            { outcome: "KO/TKO", winner: "player", finishCause: "ko" }
        );
        const d = deriveFightDetails(r, ctx, `f-short-${i}`);
        const evs = d.eventLog;
        assert.equal(evs.at(-1).type, "finish", "finish last");
        assert.equal(moves(evs).length, 3);
        for (const mv of moves(evs)) {
            if (mv.timestamp == null) continue;
            assert.ok(evs.some((e) => e.type !== "move" && e.timestamp === mv.timestamp), "anchor survived");
        }
        assert.ok(evs.some((e) => e.templateKey === "takedown_stuffed"), "takedown_stuffed survived");
        const timed = evs.filter((e) => e.timestamp != null).map((e) => {
            const [m, s] = e.timestamp.split(":").map(Number);
            return m * 60 + s;
        });
        for (let k = 1; k < timed.length; k++) assert.ok(timed[k] >= timed[k - 1], "timed events non-decreasing");
    }
});

// ── View passthrough ────────────────────────────────────────────────────────────

test("view: move vars and null timestamps pass through; loadout shaped, null when absent", () => {
    const r = result([{ event: STRIKE, moveFired: [rec("SECOND_WIND", "STAMINA_DRAIN", "PROC", "round_start", null, 2)] }], {
        wildcard: { stat: "wre", countered: false, round: 1 },
    });
    const bd = deriveFightDetails(r, ctx, "f-view");
    const loadout = buildLoadoutSnapshot({
        moveBonuses: [{ moveId: "SECOND_WIND", effectType: "PROC", bonusType: "STAMINA_DRAIN", triggered: true, triggerCount: 2 }],
        sessionBonuses: [],
        equippedOrder: ["SECOND_WIND"],
    });
    const args = { kind: "pve", fightId: "f-view", outcome: r.outcome, youWon: true, perspective: "player", header: {}, campOutcomes: [], wildcardText: null };
    const v = buildBreakdownResponse({ ...args, breakdown: { version: 2, ...bd, loadout } });
    const mv = v.eventLog.find((e) => e.type === "move");
    assert.equal(mv.timestamp, null);
    assert.deepStrictEqual(mv.vars, {
        strike: null, sub: null, position: null, bodyPart: null,
        moveIds: ["SECOND_WIND"], bonusType: "STAMINA_DRAIN", effectType: "PROC", outcome: null, stat: null, count: 2,
    });
    const wc = v.eventLog.find((e) => e.type === "wildcard");
    assert.equal(wc.vars.stat, "wre");
    assert.deepStrictEqual(wc.vars.moveIds, []);
    const plain = v.eventLog.find((e) => e.type === "strike");
    assert.deepStrictEqual(plain.vars.moveIds, []);
    assert.equal(plain.vars.count, null);
    assert.deepStrictEqual(v.loadout.moves.map((m) => [m.moveId, m.firedCount]), [["SECOND_WIND", 2]]);
    assert.deepStrictEqual(v.loadout.camp, []);

    const v1 = buildBreakdownResponse({ ...args, breakdown: { version: 1, ...bd } });
    assert.equal(v1.loadout, null, "version-1 fights (and PvP) return loadout null");
});

// ── Seeded real-engine sweep: accuracy rules end to end ─────────────────────────

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const fighterStats = (o = {}) => ({ health: 100, stamina: 100, str: 40, spd: 40, leg: 30, wre: 25, gnd: 25, sub: 20, chn: 45, fiq: 30, ...o });

test("seeded fights: every move_fired is real (timed only on a logged exchange), outcome-accurate, and counts match triggerCount", () => {
    const nonPassive = SPECIAL_MOVES.filter((m) => m.effectType !== "PASSIVE").map((m) => m.id);
    const loadouts = [SPECIAL_MOVES.map((m) => m.id)];
    for (let i = 0; i < nonPassive.length; i += 3) loadouts.push(nonPassive.slice(i, i + 3));
    const matchups = [
        [{ wre: 70, gnd: 65, sub: 70 }, { str: 55, spd: 50, chn: 35 }, "Ground & Pound", "Takedown Heavy"],
        [{ str: 70, spd: 60, leg: 55, chn: 60 }, { wre: 60, gnd: 55, sub: 60 }, "Pressure Fighter", "Submission Hunter"],
        [{}, {}, null, null],
    ];
    let moveEvents = 0;
    const outcomesSeen = new Set();
    for (const [li, ids] of loadouts.entries()) {
        for (const [mi, [p, o, ps, os]] of matchups.entries()) {
            for (const seed of [5, 77, 913]) {
                const fid = `sweep-${li}-${mi}-${seed}`;
                const mb = specialMovesService.buildMoveBonuses({
                    specialMovesOwned: ids.map((id) => ({ moveId: id, rarity: "LEGENDARY" })),
                    specialMovesEquipped: ids,
                });
                const orig = Math.random;
                Math.random = mulberry32(seed + li * 101 + mi);
                let res;
                try {
                    res = resolveFight(fighterStats(p), fighterStats(o), {
                        maxRounds: 5, playerStrategy: ps, opponentStrategy: os, moveBonuses: mb,
                        wildcard: { stat: "wre", counterSession: "NONE", fightEffect: 0.15, description: "d" },
                    });
                } finally {
                    Math.random = orig;
                }
                const bd = deriveFightDetails(res, { ...ctx, maxRounds: 5 }, fid);
                const log = bd.eventLog;
                const finishEvt = log.find((e) => e.type === "finish") || null;
                for (const mv of moves(log)) {
                    moveEvents++;
                    outcomesSeen.add(mv.vars.outcome);
                    const same = log.filter((e) => e.round === mv.round);
                    if (mv.timestamp != null) {
                        assert.ok(same.some((e) => e.type !== "move" && e.timestamp === mv.timestamp), `${fid}: timed move without a logged exchange`);
                    }
                    const rs = bd.roundStats.find((x) => x.round === mv.round);
                    const out = mv.vars.outcome;
                    if (out === "stuffed") assert.equal(rs.takedownsOpponent, 0, `${fid}: stuffed in a round the opponent landed a TD`);
                    if (out === "takedown_landed" && mv.vars.bonusType === "SPRAWL_SUCCESS") assert.equal(rs.takedownsOpponent, 1, `${fid}`);
                    if (out === "knockdown") assert.ok(same.some((e) => e.type === "knockdown" && e.actorIsPlayer), `${fid}: knockdown claim`);
                    if (out === "finish") assert.ok(finishEvt && finishEvt.round === mv.round && finishEvt.actorIsPlayer, `${fid}: finish claim`);
                    if (out === "sub_finished") assert.ok(finishEvt && finishEvt.templateKey === "submission_finish" && finishEvt.actorIsPlayer, `${fid}`);
                    if (out === "tapped") assert.ok(finishEvt && finishEvt.templateKey === "submission_finish" && !finishEvt.actorIsPlayer, `${fid}`);
                    if (out === "absorbed") assert.ok(!(finishEvt && finishEvt.round === mv.round && !finishEvt.actorIsPlayer), `${fid}: absorbed in a round the player was finished`);
                }
                for (const wc of log.filter((e) => e.type === "wildcard")) assert.equal(wc.timestamp, null);
                const loadout = buildLoadoutSnapshot({ moveBonuses: res.moveBonuses, sessionBonuses: res.sessionBonuses, equippedOrder: ids });
                for (const row of loadout.moves) {
                    if (row.effectType === "PASSIVE") continue;
                    const sum = moves(log).filter((e) => e.vars.moveIds.includes(row.moveId)).reduce((s, e) => s + e.vars.count, 0);
                    const entry = res.moveBonuses.find((b) => (b.moveIds || [b.moveId]).includes(row.moveId));
                    assert.equal(sum, row.firedCount, `${fid}: ${row.moveId} events ${sum} vs firedCount ${row.firedCount}`);
                    assert.equal(row.firedCount, entry.triggerCount || 0);
                }
            }
        }
    }
    assert.ok(moveEvents > 20, `fixture sanity: move events produced (${moveEvents})`);
    assert.ok(outcomesSeen.size >= 4, `fixture sanity: several outcomes covered (${[...outcomesSeen].join(",")})`);
});
