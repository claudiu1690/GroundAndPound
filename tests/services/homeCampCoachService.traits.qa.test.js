/**
 * Your Camp PHASE 1 — trait math parity (the feature's #1 risk).
 *
 * The camp advertises trait-adjusted numbers on the coach card and then charges/rolls them in
 * the resolver. Both paths are supposed to go through ONE function, `applyTraitToDrill`. These
 * tests assert that:
 *   · every one of the 12 traits changes exactly what its chip text says and nothing else;
 *   · the numbers on the card (`buildCoachView().drills`) equal the numbers the resolver would
 *     use (`applyTraitToDrill` on the same raw kit) — for ALL traits, ALL archetypes;
 *   · the XP multiplier is one chain, with Phase-0 parity preserved;
 *   · Prodigy lives only in rankProgress;
 *   · nothing leaks between calls (fresh objects, copied arrays).
 *
 * Pure functions only — no DB, no Redis.
 * Run with: node --test tests/services/homeCampCoachService.traits.qa.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const coachService = require("../../services/homeCampCoachService");
const {
    CAMP_TIERS,
    COACH_DRILLS,
    COACH_TRAITS,
    TRAIT_KEYS,
    COACH_RANKS,
    ARCHETYPE_KEYS,
    DOMAIN_TEACH_POOLS,
    TEACH_BREADTH_BY_RARITY,
    drillsForArchetype,
} = require("../../consts/homeCampConfig");

const NO_BLOCKS = { spar: null, bag: null, none: null };

const coach = (over = {}) => ({
    _id: "c1",
    archetype: "STRIKING",
    name: "Tommy Vasquez",
    initials: "TV",
    rarity: "COMMON",
    traitKey: null,
    wage: 0,
    hireFee: 0,
    isStarter: true,
    hiredAt: new Date(),
    rank: 4,                 // rank 4 so every drill in the kit is unlocked and comparable
    sessionsCompleted: 0,
    relevantWins: 0,
    morale: 100,
    teachPoolMoveIds: [],
    taughtMoveIds: [],
    ...over,
});

const fighter = (over = {}) => ({ iron: 100000, gymPerks: [], injuries: [], ...over });

// ── applyTraitToDrill: one rule, one home ────────────────────────────────────

test("no trait → an unchanged COPY of the drill (never the frozen config object)", () => {
    const raw = drillsForArchetype("STRIKING")[2];
    const out = coachService.applyTraitToDrill(raw, null);
    assert.deepEqual(out, raw);
    assert.notEqual(out, raw, "must be a new object");
    assert.notEqual(out.stats, raw.stats, "stats array must be copied");
});

test("an unknown / prototype-polluting traitKey is inert, not a crash", () => {
    const raw = drillsForArchetype("BJJ")[0];
    for (const key of ["constructor", "__proto__", "toString", "NOPE", 42, null, undefined]) {
        const out = coachService.applyTraitToDrill(raw, key);
        assert.deepEqual(out, raw, `traitKey ${String(key)} must change nothing`);
    }
});

test("Night Owl discounts ONLY the flagship, and never below 1 energy", () => {
    const kit = drillsForArchetype("STRIKING");
    for (const d of kit) {
        const out = coachService.applyTraitToDrill(d, "NIGHT_OWL");
        assert.equal(out.energy, d.isFlagship ? d.energy - 1 : d.energy);
    }
    const tiny = { ...kit[0], energy: 1, isFlagship: true, stats: [] };
    assert.equal(coachService.applyTraitToDrill(tiny, "NIGHT_OWL").energy, 1);
});

test("Perfectionist raises real risk but NEVER invents it on a 0% drill", () => {
    for (const d of drillsForArchetype("BJJ")) {
        const out = coachService.applyTraitToDrill(d, "PERFECTIONIST");
        assert.equal(out.injuryPct, d.injuryPct > 0 ? d.injuryPct + 1 : 0);
        assert.equal(out.dropPct, d.dropPct > 0 ? d.dropPct + 1 : 0);
        assert.equal(out.energy, d.energy, "Perfectionist must not touch energy");
        assert.equal(out.condDelta, d.condDelta, "Perfectionist must not touch condition");
    }
});

test("Safety-First lowers risk, clamps at 0, and closes no channel that never existed", () => {
    for (const d of drillsForArchetype("WRESTLING")) {
        const out = coachService.applyTraitToDrill(d, "SAFETY_FIRST");
        assert.equal(out.injuryPct, d.injuryPct > 0 ? Math.max(0, d.injuryPct - 2) : 0);
        assert.equal(out.dropPct, d.dropPct > 0 ? Math.max(0, d.dropPct - 1) : 0);
        assert.ok(out.injuryPct >= 0 && out.dropPct >= 0);
    }
});

test("Handyman adds +1 condition to EVERY drill, including the negative flagship", () => {
    for (const a of ARCHETYPE_KEYS) {
        for (const d of drillsForArchetype(a)) {
            assert.equal(coachService.applyTraitToDrill(d, "HANDYMAN").condDelta, d.condDelta + 1);
        }
    }
});

test("traits with no drill effect leave every drill number untouched", () => {
    const noDrillEffect = TRAIT_KEYS.filter((k) => {
        const t = COACH_TRAITS[k];
        return !t.energyDelta && !t.injuryDelta && !t.dropDelta && !t.condDeltaBonus;
    });
    assert.ok(noDrillEffect.length > 0);
    for (const key of noDrillEffect) {
        for (const a of ARCHETYPE_KEYS) {
            for (const d of drillsForArchetype(a)) {
                assert.deepEqual(coachService.applyTraitToDrill(d, key), d, `${key} must not touch ${d.key}`);
            }
        }
    }
});

// ── THE parity test: what the card shows === what the resolver uses ──────────

test("PARITY: displayed drill numbers === applyTraitToDrill output, for all 12 traits × all archetypes", () => {
    for (const archetype of ARCHETYPE_KEYS) {
        for (const traitKey of [null, ...TRAIT_KEYS]) {
            const c = coach({ archetype, traitKey, rank: 4 });
            const shown = coachService.buildCoachView(c, fighter(), NO_BLOCKS).drills;
            // What runDrill computes for the same coach: raw kit → the SAME single home.
            const charged = COACH_DRILLS[archetype].map((raw) =>
                coachService.applyTraitToDrill({ ...raw, stats: [...raw.stats] }, traitKey));

            assert.equal(shown.length, charged.length);
            for (let i = 0; i < shown.length; i++) {
                assert.equal(shown[i].key, charged[i].key);
                for (const field of ["energy", "injuryPct", "dropPct", "condDelta"]) {
                    assert.equal(
                        shown[i][field], charged[i][field],
                        `${archetype}/${traitKey}/${shown[i].key}: card ${field}=${shown[i][field]} but resolver would use ${charged[i][field]}`
                    );
                }
            }
        }
    }
});

test("state isolation: two calls never share objects, and the shared config is never mutated", () => {
    const c = coach({ traitKey: "HANDYMAN" });
    const a = coachService.buildCoachView(c, fighter(), NO_BLOCKS).drills;
    a[0].condDelta = 999;
    a[0].stats.push("HACKED");
    const b = coachService.buildCoachView(c, fighter(), NO_BLOCKS).drills;
    assert.notEqual(b[0].condDelta, 999);
    assert.ok(!b[0].stats.includes("HACKED"));
    // And the frozen config behind them is untouched.
    assert.equal(COACH_DRILLS.STRIKING[0].condDelta, 2);
});

// ── coachXpMultiplier: one chain ─────────────────────────────────────────────

test("Phase-0 parity: rank 1 no trait = tier multiplier exactly; rank 3 adds 5%", () => {
    const t1 = CAMP_TIERS[1];
    assert.equal(coachService.coachXpMultiplier(coach({ rank: 1 }), t1), 1.25);
    assert.equal(coachService.coachXpMultiplier(coach({ rank: 3 }), t1), 1.25 * 1.05);
    assert.equal(coachService.coachXpMultiplier(coach({ rank: 4 }), t1), 1.25 * 1.05);
});

test("Taskmaster's +10% compounds into the chain and is the only XP trait", () => {
    const t2 = CAMP_TIERS[2];
    assert.equal(coachService.coachXpMultiplier(coach({ rank: 1, traitKey: "TASKMASTER" }), t2), 1.30 * 1.10);
    for (const key of TRAIT_KEYS.filter((k) => !COACH_TRAITS[k].xpBonus)) {
        assert.equal(
            coachService.coachXpMultiplier(coach({ rank: 1, traitKey: key }), t2),
            1.30,
            `${key} must not change the XP multiplier`
        );
    }
});

test("low morale halves the BONUS, never the base — a miserable coach is never worse than none", () => {
    const t2 = CAMP_TIERS[2];
    const happy = coachService.coachXpMultiplier(coach({ rank: 1, morale: 30 }), t2);
    const sad = coachService.coachXpMultiplier(coach({ rank: 1, morale: 29 }), t2);
    assert.equal(happy, 1.30);
    assert.equal(sad, 1.15);
    assert.ok(sad > 1, "must never fall to or below 1.0");
    // At morale 0 it is still the halved bonus, not a penalty.
    assert.equal(coachService.coachXpMultiplier(coach({ rank: 1, morale: 0 }), t2), 1.15);
    // The halving applies to the WHOLE bonus, rank-3 and trait included.
    const rank3 = coachService.coachXpMultiplier(coach({ rank: 3, morale: 10 }), t2);
    assert.ok(Math.abs(rank3 - (1 + (1.30 * 1.05 - 1) / 2)) < 1e-9);
});

test("xpMultiplierNote explains every component that is actually applied", () => {
    assert.equal(coachService.xpMultiplierNote(coach({ rank: 1 })), "");
    assert.equal(coachService.xpMultiplierNote(coach({ rank: 3 })), "Rank 3 +5%");
    assert.equal(
        coachService.xpMultiplierNote(coach({ rank: 3, traitKey: "TASKMASTER" })),
        "Rank 3 +5% · Taskmaster +10%"
    );
    assert.ok(coachService.xpMultiplierNote(coach({ rank: 1, morale: 10 })).includes("Low morale"));
});

// ── Prodigy: only inside rankProgress ────────────────────────────────────────

test("Prodigy cuts rank requirements by 15%, rounding UP so nothing rounds away", () => {
    for (const rank of [1, 2, 3]) {
        const def = COACH_RANKS[rank + 1];
        const plain = coachService.rankProgress(coach({ rank }));
        const prodigy = coachService.rankProgress(coach({ rank, traitKey: "PRODIGY" }));
        assert.equal(plain.reqs[0].tgt, def.sessions);
        assert.equal(prodigy.reqs[0].tgt, Math.ceil(def.sessions * 0.85));
        assert.equal(prodigy.reqs[1].tgt, Math.ceil(def.wins * 0.85));
        assert.ok(prodigy.reqs[0].tgt > 0 && prodigy.reqs[1].tgt > 0);
    }
});

test("Prodigy's reqsMet uses the SAME discounted targets the payload shows", () => {
    // 11 sessions / 2 wins is short of rank 2 (12/2) but meets Prodigy's 11/2.
    const c = coach({ rank: 1, traitKey: "PRODIGY", sessionsCompleted: 11, relevantWins: 2 });
    const p = coachService.rankProgress(c);
    assert.equal(p.reqsMet, true);
    const view = coachService.buildCoachView(c, fighter(), NO_BLOCKS);
    assert.equal(view.nextRank.reqsMet, true);
    assert.equal(view.nextRank.reqs[0].tgt, 11);
    assert.equal(coachService.rankProgress(coach({ rank: 1, sessionsCompleted: 11, relevantWins: 2 })).reqsMet, false);
});

// ── Coach view: the Phase-1 fields ───────────────────────────────────────────

test("the coach view exposes the trait chip, wage/fee, and a fire guard for the last coach", () => {
    const c = coach({ traitKey: "LOYAL", wage: 165, hireFee: 500, isStarter: false });
    const alone = coachService.buildCoachView(c, fighter(), NO_BLOCKS, { coachCount: 1 });
    assert.deepEqual(alone.trait, { key: "LOYAL", name: "Loyal", desc: COACH_TRAITS.LOYAL.desc, caution: true });
    assert.equal(alone.wage, 165);
    assert.equal(alone.hireFee, 500);
    assert.equal(alone.canFire, false);
    assert.equal(alone.fireBlockedReason, "last_coach");

    const withPeers = coachService.buildCoachView(c, fighter(), NO_BLOCKS, { coachCount: 2 });
    assert.equal(withPeers.canFire, true);
    assert.equal(withPeers.fireBlockedReason, null);
});

test("morale bands are cut at the thresholds that actually DO something", () => {
    const { MORALE_NEED_THRESHOLD, MORALE_XP_HALVED_BELOW } = require("../../consts/homeCampConfig");

    assert.equal(coachService.moraleView(coach({ morale: 100 })).label, "Thriving");
    assert.equal(coachService.moraleView(coach({ morale: MORALE_NEED_THRESHOLD })).label, "Thriving");

    // Between the nag threshold and the halving threshold NOTHING has been lost yet. The old
    // copy called 39 "Ready to walk" and said "one bad week from quitting" — at −3 to −8 a
    // week that was 5–13 weeks out, and it never mentioned the one number that matters.
    assert.equal(coachService.moraleView(coach({ morale: MORALE_NEED_THRESHOLD - 1 })).label, "Restless");
    assert.equal(coachService.moraleView(coach({ morale: MORALE_XP_HALVED_BELOW })).label, "Restless");

    // Below the halving threshold the penalty is LIVE — a different band, and it says so.
    const struggling = coachService.moraleView(coach({ morale: MORALE_XP_HALVED_BELOW - 1 }));
    assert.equal(struggling.label, "Struggling");
    assert.equal(struggling.tone, "bad");
    assert.match(struggling.note, /halved right now/);

    assert.equal(coachService.moraleView(coach({ morale: 0 })).label, "Ready to walk");
});

test("every morale note names a real consequence, never mood flavour", () => {
    // "Happy in the room." told the player nothing. Each band must reference the training
    // bonus or walking out — the only two things morale actually controls.
    for (const m of [100, 70, 55, 30, 29, 10, 0]) {
        const note = coachService.moraleView(coach({ morale: m })).note;
        assert.match(note, /training|bonus|walk/i, `morale ${m}: "${note}"`);
    }
});

test("a Loyal coach can never reach either consequence, and is told so", () => {
    const { MORALE_XP_HALVED_BELOW, COACH_TRAITS } = require("../../consts/homeCampConfig");
    const floor = COACH_TRAITS.LOYAL.moraleFloor;
    assert.ok(floor > MORALE_XP_HALVED_BELOW,
        "LOYAL's floor must sit above the halving threshold or the trait is mis-sold");
    for (const m of [100, 60, 40]) {
        const v = coachService.moraleView(coach({ morale: m, traitKey: "LOYAL" }));
        assert.notEqual(v.label, "Struggling");
        assert.notEqual(v.label, "Ready to walk");
        assert.match(v.note, /never walk/);
    }
});

// ── Teach list: rarity is the COACH's, and the states must make sense at rank 1 ──

const teachCoach = (rarity, over = {}) => coach({
    rarity,
    archetype: "WRESTLING",
    rank: 1,
    taughtMoveIds: [],
    teachPoolMoveIds: DOMAIN_TEACH_POOLS.WRESTLING.slice(0, TEACH_BREADTH_BY_RARITY[rarity]),
    ...over,
});

test("a coach teaches at HIS OWN rarity, not the move's catalog minRarity", () => {
    // Every WRESTLING pool move in the first two slots has minRarity COMMON, so before the fix
    // an Uncommon/Rare/Legendary coach advertised Common copies and looked worthless.
    for (const rarity of ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]) {
        for (const t of coachService.buildTeachList(teachCoach(rarity))) {
            assert.equal(t.rarity, rarity, `${rarity} coach advertised ${t.rarity} for ${t.moveId}`);
        }
    }
});

test("breadth still comes from rarity, so rarity and count agree on the card", () => {
    assert.equal(coachService.buildTeachList(teachCoach("COMMON")).length, 1);
    assert.equal(coachService.buildTeachList(teachCoach("UNCOMMON")).length, 2);
    assert.equal(coachService.buildTeachList(teachCoach("RARE")).length, 3);
});

test("the move's minRarity is a FLOOR — a low-rarity coach never advertises an impossible copy", () => {
    // THE_FINISHER exists only from RARE upward; a Common coach must report RARE, not COMMON.
    const c = coach({ rarity: "COMMON", archetype: "STRIKING", teachPoolMoveIds: ["THE_FINISHER"], taughtMoveIds: [] });
    assert.equal(coachService.buildTeachList(c)[0].rarity, "RARE");
});

test("at rank 1 the first pool move is 'next' at rankReq 2 — never 'locked at rank 1'", () => {
    const list = coachService.buildTeachList(teachCoach("RARE"));
    assert.equal(list[0].state, "next");
    assert.equal(list[0].rankReq, 2, "slot 0 unlocks at Rank 2 (TEACH_RANK_BY_SLOT)");
    assert.ok(list[0].rankReq > 1, "a rank-1 coach can never be told to 'reach Rank 1 first'");
    for (const t of list.slice(1)) {
        assert.equal(t.state, "locked");
        assert.equal(t.rankReq, 4);
    }
});

// State comes from the coach's RANK against each slot's requirement, never from pool
// position. Slot 0 unlocks at Rank 2; slots 1+ ALL unlock at Rank 4 together (Rank 3 is
// the +5% XP node and teaches nothing) — so the same taught move reads differently
// depending on how far the coach has climbed.
const wrestlingPool = () => DOMAIN_TEACH_POOLS.WRESTLING.slice(0, 3);
/** `joinedAt` defaults to 1 — the shape of a coach hired at rank 1 and promoted since. */
const statesAtRank = (rank, taught, joinedAt = 1) =>
    coachService
        .buildTeachList(coach({
            rarity: "RARE", archetype: "WRESTLING", rank, joinedAtRank: joinedAt,
            teachPoolMoveIds: wrestlingPool(), taughtMoveIds: taught,
        }))
        .map((t) => t.state);

test("a taught move reads 'taught'; the ones behind it track the rank that grants them", () => {
    const pool = wrestlingPool();
    // Rank 2: the Rank-4 slots are real but still two promotions out.
    assert.deepEqual(statesAtRank(2, [pool[0]]), ["taught", "locked", "locked"]);
    // Rank 3: the very next promotion hands over BOTH — neither is "behind" the other.
    assert.deepEqual(statesAtRank(3, [pool[0]]), ["taught", "next", "next"]);
});

test("a coach who ARRIVED at max rank can never be taught — 'unavailable', not claimable", () => {
    const pool = wrestlingPool();
    // The migrated-veteran shape: joined AT rank 4 via the gym conversion, so he never
    // promoted through a single teach slot and the player paid for none of them. Marking
    // these claimable would hand a converted veteran a full pool for $0 — the exact thing
    // deriveInitialCampState's "never retro-grant on migration" rule exists to prevent.
    assert.deepEqual(statesAtRank(4, [], 4), ["unavailable", "unavailable", "unavailable"]);
    assert.deepEqual(statesAtRank(4, [pool[0]], 4), ["taught", "unavailable", "unavailable"]);
});

test("a coach PROMOTED to max rank is owed his untaught moves — 'claimable'", () => {
    const pool = wrestlingPool();
    // Joined at 1 and was promoted all the way: every slot was bought. This is every coach
    // anyone promoted during v1.6, before the teach channel existed — they paid full price
    // and the move silently never happened.
    assert.deepEqual(statesAtRank(4, [], 1), ["claimable", "claimable", "claimable"]);
    // Rank 2 only: slot 0 was paid for; the Rank-4 slots are still ahead of him.
    assert.deepEqual(statesAtRank(2, [], 1), ["claimable", "locked", "locked"]);
});

test("the claimable/unavailable split is decided by joinedAtRank alone", () => {
    // Same rank, same empty teach record — only the arrival rank differs.
    assert.equal(statesAtRank(2, [], 1)[0], "claimable", "promoted through Rank 2 → owed");
    assert.equal(statesAtRank(2, [], 2)[0], "unavailable", "arrived at Rank 2 → never earned");
});

test("a slot whose granting rank is still ahead is NEVER 'unavailable'", () => {
    // Guards the inverse mistake: gating on rank must not swallow a legitimately pending
    // move. Only a slot the coach has already climbed past may read as dead.
    for (const rank of [1, 2, 3, 4]) {
        const list = coachService.buildTeachList(coach({
            rarity: "RARE", archetype: "WRESTLING", rank, joinedAtRank: 1,
            teachPoolMoveIds: wrestlingPool(), taughtMoveIds: [],
        }));
        for (const slot of list) {
            if (slot.rankReq > rank) {
                assert.ok(!["unavailable", "claimable"].includes(slot.state),
                    `rank ${rank}: Rank-${slot.rankReq} slot is still reachable, not settled`);
            }
        }
    }
});

test("incrementSessions stamps lastSessionAt — the weekly 'unused coach' check depends on it", () => {
    const c = coach({ sessionsCompleted: 4, lastSessionAt: null });
    coachService.incrementSessions(c, 3);
    assert.equal(c.sessionsCompleted, 7);
    assert.ok(c.lastSessionAt instanceof Date);

    const untouched = coach({ lastSessionAt: null });
    coachService.incrementSessions(untouched, 0);
    assert.equal(untouched.lastSessionAt, null, "a zero-session call must not fake activity");
});

// ── Requirement display never overshoots its target ─────────────────────────

test("rankProgress clamps `cur` to `tgt` — a met requirement reads 12/12, never 34/12", () => {
    const c = coach({ archetype: "WRESTLING", rank: 1, sessionsCompleted: 34, relevantWins: 0, traitKey: null });
    const { reqs, reqsMet } = coachService.rankProgress(c);
    const sessions = reqs.find((r) => r.key === "sessions");
    assert.equal(sessions.cur, sessions.tgt, "a long-since-met requirement must display as complete");
    assert.ok(sessions.cur <= sessions.tgt, "cur can never exceed tgt");
    assert.equal(reqsMet, false, "clamping is DISPLAY only — the wins requirement is still unmet");
});

test("clamping never lets an unmet requirement look met, and never gates a real promotion", () => {
    const under = coachService.rankProgress(coach({ archetype: "WRESTLING", rank: 1, sessionsCompleted: 5, relevantWins: 1, traitKey: null }));
    assert.equal(under.reqs.find((r) => r.key === "sessions").cur, 5, "below target passes through untouched");
    assert.equal(under.reqsMet, false);

    // Wildly over on BOTH counts still promotes — reqsMet reads the raw totals.
    const over = coachService.rankProgress(coach({ archetype: "WRESTLING", rank: 1, sessionsCompleted: 999, relevantWins: 999, traitKey: null }));
    assert.equal(over.reqsMet, true, "clamping must not starve the promotion check");
    for (const r of over.reqs) assert.equal(r.cur, r.tgt);
});
