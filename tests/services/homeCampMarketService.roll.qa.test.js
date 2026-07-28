/**
 * Your Camp PHASE 1 — market roll determinism, composition, gates, and the familiarity bank.
 *
 * Pure functions only (no DB): rollCandidates takes the camp/fighter as plain objects, so the
 * whole generation contract is testable without Mongo.
 *
 * Run with: node --test tests/services/homeCampMarketService.roll.qa.test.js
 */
const assert = require("node:assert");
const { test } = require("node:test");
const market = require("../../services/homeCampMarketService");
const {
    COACH_RANKS,
    COACH_TRAITS,
    MARKET_CANDIDATES,
    MARKET_MAX_PER_DOMAIN,
    MARKET_RARITY_ODDS,
    RARITY_ECONOMICS,
    TEACH_BREADTH_BY_RARITY,
    DOMAIN_TEACH_POOLS,
    LEGENDARY_EXCLUSIVE_SESSIONS,
    homeCampWeekIndex,
    homeCampWeekStart,
    homeCampWeekEnd,
    traitDef,
} = require("../../consts/homeCampConfig");

const camp = (over = {}) => ({
    _id: "65f000000000000000000001",
    coaches: [],
    disciplineFamiliarity: {},
    markModified() { this._marked = (this._marked || 0) + 1; },
    ...over,
});

const fighter = (peakTier = "UNKNOWN") => ({ notoriety: { peakTier } });

const wrestlingCoach = (over = {}) => ({
    _id: "c1", archetype: "WRESTLING", name: "Viktor Petrov", traitKey: null, rank: 1, ...over,
});

// ── Determinism ──────────────────────────────────────────────────────────────

test("the same (campId, week) always rolls the identical market", () => {
    const a = market.rollCandidates(camp(), fighter(), 2951, 2);
    const b = market.rollCandidates(camp(), fighter(), 2951, 2);
    const strip = (list) => list.map((c) => `${c.archetype}|${c.rarity}|${c.name}|${c.traitKey}|${c.wage}|${c.hireFee}`);
    assert.deepEqual(strip(a), strip(b));
});

test("a different week — or a different camp — rolls a different market", () => {
    const week1 = market.rollCandidates(camp(), fighter(), 2951, 2).map((c) => c.name).join();
    const week2 = market.rollCandidates(camp(), fighter(), 2952, 2).map((c) => c.name).join();
    const other = market.rollCandidates(camp({ _id: "65f000000000000000000002" }), fighter(), 2951, 2)
        .map((c) => c.name).join();
    assert.notEqual(week1, week2);
    assert.notEqual(week1, other);
});

// ── Composition ──────────────────────────────────────────────────────────────

test("rolls 3 candidates, or 4 while a Well-Connected coach is employed", () => {
    const plain = market.rollCandidates(camp({ coaches: [wrestlingCoach()] }), fighter(), 2951, 2);
    assert.equal(plain.length, MARKET_CANDIDATES);
    const connected = market.rollCandidates(
        camp({ coaches: [wrestlingCoach({ traitKey: "WELL_CONNECTED" })] }), fighter(), 2951, 2);
    assert.equal(connected.length, MARKET_CANDIDATES + 1);
});

test("the first candidate is always a discipline the player does NOT already employ", () => {
    for (let wk = 2900; wk < 2960; wk++) {
        const c = camp({ coaches: [wrestlingCoach()] });
        const out = market.rollCandidates(c, fighter(), wk, 2);
        assert.notEqual(out[0].archetype, "WRESTLING", `week ${wk} offered a duplicate discipline first`);
    }
});

test("never more than 2 candidates from one discipline", () => {
    for (let wk = 2900; wk < 2980; wk++) {
        const out = market.rollCandidates(camp({ coaches: [wrestlingCoach({ traitKey: "WELL_CONNECTED" })] }), fighter(), wk, 4);
        const counts = {};
        for (const c of out) counts[c.archetype] = (counts[c.archetype] || 0) + 1;
        for (const [d, n] of Object.entries(counts)) {
            assert.ok(n <= MARKET_MAX_PER_DOMAIN, `week ${wk}: ${n} × ${d}`);
        }
    }
});

test("Conditioning coaches only exist from Tier 2 (minCampTier)", () => {
    for (let wk = 2900; wk < 2960; wk++) {
        const t1 = market.rollCandidates(camp(), fighter(), wk, 1);
        assert.ok(!t1.some((c) => c.archetype === "CONDITIONING"), `week ${wk} offered Conditioning at Tier 1`);
    }
    let seen = false;
    for (let wk = 2900; wk < 2960 && !seen; wk++) {
        seen = market.rollCandidates(camp(), fighter(), wk, 2).some((c) => c.archetype === "CONDITIONING");
    }
    assert.ok(seen, "Conditioning should appear at Tier 2");
});

// ── Rarity gates + renormalisation ───────────────────────────────────────────

test("rarity gates: Rare needs Tier 2, Legendary needs Tier 4 AND Rising Star fame", () => {
    assert.deepEqual(market.eligibleRarities(1, fighter()), ["COMMON", "UNCOMMON"]);
    assert.deepEqual(market.eligibleRarities(2, fighter()), ["COMMON", "UNCOMMON", "RARE"]);
    assert.deepEqual(market.eligibleRarities(4, fighter()), ["COMMON", "UNCOMMON", "RARE"]);
    assert.deepEqual(market.eligibleRarities(4, fighter("RISING_STAR")),
        ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]);
    assert.deepEqual(market.eligibleRarities(3, fighter("LEGEND")), ["COMMON", "UNCOMMON", "RARE"]);
});

test("the gate reads peakTier, so a decayed fame score never removes an earned rarity", () => {
    const faded = { notoriety: { score: 0, peakTier: "RISING_STAR" } };
    assert.ok(market.eligibleRarities(4, faded).includes("LEGENDARY"));
});

test("ineligible rarity weight is RENORMALISED, never folded into Common", () => {
    // Tier 1 removes Rare (12) + Legendary (3): 55/30 of 85 → ~64.7% / ~35.3%.
    const rng = (() => { let i = 0; const seq = [0.0, 0.646, 0.648, 0.999]; return () => seq[i++]; })();
    const pool = ["COMMON", "UNCOMMON"];
    assert.equal(market.pickRarity(rng, pool), "COMMON");   // 0.000 → Common
    assert.equal(market.pickRarity(rng, pool), "COMMON");   // 0.646 → still Common (<0.647)
    assert.equal(market.pickRarity(rng, pool), "UNCOMMON"); // 0.648 → Uncommon
    assert.equal(market.pickRarity(rng, pool), "UNCOMMON"); // 0.999 → Uncommon
    // If the odds had been folded into Common, 0.648 would still be Common.
    assert.equal(MARKET_RARITY_ODDS.COMMON + MARKET_RARITY_ODDS.UNCOMMON, 85);
});

// ── Pricing + payload shape of a generated candidate ─────────────────────────

test("wage and fee are pure functions of rarity × trait — no jitter, ever", () => {
    for (let wk = 2900; wk < 2960; wk++) {
        for (const c of market.rollCandidates(camp(), fighter("LEGEND"), wk, 4)) {
            const econ = RARITY_ECONOMICS[c.rarity];
            const t = traitDef(c.traitKey);
            assert.equal(c.wage, Math.round(econ.wage * (t && t.wageMult ? t.wageMult : 1)));
            assert.equal(c.hireFee, Math.round(econ.hireFee * (t && t.hireMult ? t.hireMult : 1)));
        }
    }
});

test("Journeyman halves the fee and Grizzled Vet/Loyal move the wage — nothing else does", () => {
    const base = RARITY_ECONOMICS.RARE;
    const priced = (traitKey) => {
        const t = traitDef(traitKey);
        return {
            fee: Math.round(base.hireFee * (t && t.hireMult ? t.hireMult : 1)),
            wage: Math.round(base.wage * (t && t.wageMult ? t.wageMult : 1)),
        };
    };
    assert.deepEqual(priced("JOURNEYMAN"), { fee: 1500, wage: 750 });
    assert.deepEqual(priced("GRIZZLED_VET"), { fee: 3000, wage: 675 });
    assert.deepEqual(priced("LOYAL"), { fee: 3000, wage: 825 });
    assert.deepEqual(priced("PRODIGY"), { fee: 3000, wage: 750 });
});

test("a candidate is a complete coach subdoc: teach pool sliced to rarity, morale 100, rank 1", () => {
    for (let wk = 2900; wk < 2930; wk++) {
        for (const c of market.rollCandidates(camp(), fighter("LEGEND"), wk, 4)) {
            assert.equal(c.rank, 1);
            assert.equal(c.morale, 100);
            assert.equal(c.isStarter, false);
            assert.equal(c.lastSessionAt, null);
            assert.deepEqual(c.taughtMoveIds, []);
            assert.ok(COACH_TRAITS[c.traitKey], "every candidate carries a real trait");
            const expected = (DOMAIN_TEACH_POOLS[c.archetype] || []).slice(0, TEACH_BREADTH_BY_RARITY[c.rarity]);
            assert.deepEqual(c.teachPoolMoveIds, expected);
            // Only a Legendary reserves an exclusive session, and it's the right one.
            assert.equal(c.exclusiveSessionKey,
                c.rarity === "LEGENDARY" ? LEGENDARY_EXCLUSIVE_SESSIONS[c.archetype] : null);
        }
    }
});

test("candidate names avoid the names already in the camp", () => {
    const roster = [wrestlingCoach({ name: "Viktor Petrov" })];
    for (let wk = 2900; wk < 2960; wk++) {
        const out = market.rollCandidates(camp({ coaches: roster }), fighter(), wk, 2);
        const names = out.map((c) => c.name);
        assert.ok(!names.includes("Viktor Petrov"), `week ${wk} cloned an employed coach`);
        assert.equal(new Set(names).size, names.length, `week ${wk} produced duplicate names`);
    }
});

// ── Week index ───────────────────────────────────────────────────────────────

test("weeks are Monday-aligned 00:00 UTC and contiguous", () => {
    const wk = homeCampWeekIndex(Date.UTC(2026, 6, 29, 13, 0, 0)); // a Wednesday
    const start = homeCampWeekStart(wk);
    assert.equal(start.getUTCDay(), 1, "week must start on a Monday");
    assert.equal(start.toISOString(), "2026-07-27T00:00:00.000Z");
    assert.equal(homeCampWeekEnd(wk).toISOString(), "2026-08-03T00:00:00.000Z");
    assert.equal(homeCampWeekIndex(start.getTime()), wk);
    assert.equal(homeCampWeekIndex(start.getTime() - 1), wk - 1);
    assert.equal(homeCampWeekIndex(homeCampWeekEnd(wk).getTime()), wk + 1);
});

// ── Discipline familiarity bank ──────────────────────────────────────────────

test("familiarity is capped at ONE free rank (rank 2's requirements), never more", () => {
    const c = camp({ disciplineFamiliarity: { BJJ: { bankedSessions: 9999, bankedWins: 9999 } } });
    assert.deepEqual(market.previewDisciplineFamiliarity(c, "BJJ"),
        { sessions: COACH_RANKS[2].sessions, wins: COACH_RANKS[2].wins });
});

test("preview is pure; consume clears the bank AND flags the Mixed field as modified", () => {
    const c = camp({ disciplineFamiliarity: { BJJ: { bankedSessions: 5, bankedWins: 1 } } });
    assert.deepEqual(market.previewDisciplineFamiliarity(c, "BJJ"), { sessions: 5, wins: 1 });
    assert.deepEqual(c.disciplineFamiliarity.BJJ, { bankedSessions: 5, bankedWins: 1 }, "preview must not spend");

    const applied = market.consumeDisciplineFamiliarity(c, "BJJ");
    assert.deepEqual(applied, { sessions: 5, wins: 1 });
    assert.equal(c.disciplineFamiliarity.BJJ, undefined);
    assert.ok(c._marked > 0, "markModified is mandatory — a Mixed field silently no-ops without it");
    assert.equal(market.previewDisciplineFamiliarity(c, "BJJ"), null);
});

test("an empty or missing bank previews as null (no free rank out of nowhere)", () => {
    assert.equal(market.previewDisciplineFamiliarity(camp(), "BJJ"), null);
    assert.equal(market.previewDisciplineFamiliarity(camp({ disciplineFamiliarity: null }), "BJJ"), null);
    const zero = camp({ disciplineFamiliarity: { BJJ: { bankedSessions: 0, bankedWins: 0 } } });
    assert.equal(market.previewDisciplineFamiliarity(zero, "BJJ"), null);
});

test("prototype keys never resolve through Object.prototype", () => {
    for (const key of ["constructor", "toString", "__proto__"]) {
        assert.equal(market.previewDisciplineFamiliarity(camp(), key), null);
    }
});

test("banking NEVER lowers an existing deposit and always marks the field modified", () => {
    const c = camp({ disciplineFamiliarity: { BJJ: { bankedSessions: 50, bankedWins: 9 } } });
    market.bankDisciplineFamiliarity(c, "BJJ");
    assert.deepEqual(c.disciplineFamiliarity.BJJ, { bankedSessions: 50, bankedWins: 9 });

    const empty = camp();
    market.bankDisciplineFamiliarity(empty, "STRIKING");
    assert.deepEqual(empty.disciplineFamiliarity.STRIKING,
        { bankedSessions: COACH_RANKS[2].sessions, bankedWins: COACH_RANKS[2].wins });
    assert.ok(empty._marked > 0);
});

// ── Candidate teach list: must match what the coach panel shows after the hire ───

test("a generated candidate's teach list is priced at HIS rarity, never the move's floor", () => {
    const coachService = require("../../services/homeCampCoachService");
    for (let wk = 2900; wk < 2960; wk++) {
        for (const c of market.rollCandidates(camp(), fighter("LEGEND"), wk, 4)) {
            for (const t of coachService.buildTeachList(c)) {
                // Equal to the candidate's rarity, or the move's floor when that floor is higher.
                const expected = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"];
                assert.ok(expected.indexOf(t.rarity) >= expected.indexOf(c.rarity)
                    || expected.indexOf(t.rarity) >= 0);
                if (c.rarity !== "COMMON") {
                    assert.notEqual(
                        `${t.rarity}`, "COMMON",
                        `a ${c.rarity} candidate must not advertise COMMON teaching (${t.moveId})`
                    );
                }
            }
        }
    }
});

test("a rank-1 candidate's first move is 'next' at Rank 2 — the hire card can't say 'reach Rank 1'", () => {
    const coachService = require("../../services/homeCampCoachService");
    for (let wk = 2900; wk < 2940; wk++) {
        for (const c of market.rollCandidates(camp(), fighter("LEGEND"), wk, 4)) {
            const list = coachService.buildTeachList(c);
            assert.ok(list.length > 0);
            assert.equal(list[0].state, "next");
            assert.ok(list[0].rankReq > c.rank, "a pool move may never unlock at or below the coach's current rank");
            for (const t of list.slice(1)) assert.equal(t.state, "locked");
        }
    }
});

test("the label a candidate carries names his rarity, matching the breadth he was given", () => {
    const coachService = require("../../services/homeCampCoachService");
    const byRarity = {};
    for (let wk = 2900; wk < 2990; wk++) {
        for (const c of market.rollCandidates(camp(), fighter("LEGEND"), wk, 4)) {
            byRarity[c.rarity] = market.teachBreadthLabel(coachService.buildTeachList(c));
        }
    }
    for (const [rarity, label] of Object.entries(byRarity)) {
        const word = rarity[0] + rarity.slice(1).toLowerCase();
        assert.match(label, new RegExp(word, "i"), `${rarity} candidate labelled "${label}"`);
    }
    assert.ok(Object.keys(byRarity).length >= 3, "sample should cover several rarities");
});

test("teachBreadthLabel reads honestly for every breadth", () => {
    assert.equal(market.teachBreadthLabel([]), "Teaches no moves");
    assert.equal(market.teachBreadthLabel([{ rarity: "COMMON" }]), "Teaches 1 move (Common)");
    assert.equal(market.teachBreadthLabel([{ rarity: "RARE" }, { rarity: "RARE" }, { rarity: "RARE" }]),
        "Teaches 3 moves, all at Rare");
    assert.equal(market.teachBreadthLabel([{ rarity: "COMMON" }, { rarity: "RARE" }]),
        "Teaches 2 moves (Common / Rare)");
});
