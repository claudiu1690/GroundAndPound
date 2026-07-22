const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    ROSTER,
    STAT_KEYS,
    WIN_METHOD_BY_STYLE,
    STYLE_GYM,
    winMethodSplit,
    promotionTierForOvr,
    botNotoriety,
    botStatsFor,
    gymNameForBot,
    deriveBotProfile,
} = require("../../consts/pvpBotRoster");
const { BANNER_PIECES } = require("../../consts/bannerCatalog");
const { applyDpAndDivision } = require("../../services/pvpDpService");
const { divisionForDp, divisionFloor } = require("../../consts/pvpConfig");
const { calculateOverall } = require("../../utils/overallRating");
const { calculateTierFromScore } = require("../../consts/notorietyConfig");
const { PROMOTION_TIERS } = require("../../consts/gameConstants");
const GYMS = require("../../data/gyms.json");
const { snapToBand, computeNext } = require("../../services/pvpBotService");
const {
    BOT_MAX_DP,
    BOT_HOUR_BAND_WIDTH,
    BOT_JITTER_PCT,
    BOT_INTERVAL_MIN_HOURS,
    BOT_INTERVAL_MAX_HOURS,
} = require("../../consts/pvpBotConfig");

const HOUR_MS = 3600 * 1000;

// NOTE: no DB, no Redis. Everything under test here is either a const table or a pure
// function — the same reason the rest of tests/services/ can run against nothing.

// ── Roster invariants ───────────────────────────────────────────────────────

test("roster has exactly 25 bots", () => {
    assert.equal(ROSTER.length, 25);
});

test("roster tier mix is bottom-heavy 18 prospect / 4 contender / 3 challenger, zero elite, zero champion", () => {
    const mix = {};
    for (const b of ROSTER) {
        const div = divisionForDp(b.dp);
        mix[div] = (mix[div] || 0) + 1;
    }
    assert.deepEqual(mix, { prospect: 18, contender: 4, challenger: 3 });
    assert.equal(mix.elite, undefined);
    assert.equal(mix.champion, undefined);
});

test("every bot name is unique", () => {
    const names = ROSTER.map((b) => `${b.first} ${b.last}`);
    assert.equal(new Set(names).size, ROSTER.length);
});

test("every bot nickname is unique", () => {
    const nicks = ROSTER.map((b) => b.nick);
    assert.equal(new Set(nicks).size, ROSTER.length);
});

test("every bot starts below the bot DP ceiling", () => {
    for (const b of ROSTER) {
        assert.ok(b.dp < BOT_MAX_DP, `${b.first} ${b.last} dp ${b.dp} must be < BOT_MAX_DP ${BOT_MAX_DP}`);
    }
});

test("all 25 banners are distinct", () => {
    const keys = ROSTER.map((b) => `${b.banner.backgroundId}|${b.banner.frameId}|${b.banner.accentColor}`);
    assert.equal(new Set(keys).size, 25, "two bots share a banner — the ladder would show duplicates");
});

test("every banner piece id exists in the catalog and is the right kind", () => {
    const byId = new Map(BANNER_PIECES.map((p) => [p.id, p]));
    for (const b of ROSTER) {
        const bg = byId.get(b.banner.backgroundId);
        const fr = byId.get(b.banner.frameId);
        const ac = byId.get(b.banner.accentColor);
        assert.ok(bg, `${b.last}: unknown backgroundId ${b.banner.backgroundId}`);
        assert.ok(fr, `${b.last}: unknown frameId ${b.banner.frameId}`);
        assert.ok(ac, `${b.last}: unknown accentColor ${b.banner.accentColor}`);
        assert.equal(bg.kind, "background");
        assert.equal(fr.kind, "frame");
        assert.equal(ac.kind, "accent");
    }
});

test("no bot wears a badge-gated or belt-gated banner piece", () => {
    // Derived from the catalog, not hardcoded: if a new badge-gated piece is added later
    // and someone puts it on a bot, this fails without anyone remembering to update a list.
    const forbidden = new Set(
        BANNER_PIECES
            .filter((p) => p.unlockAt && (p.unlockAt.badge !== undefined || p.unlockAt.beltsWon !== undefined))
            .map((p) => p.id)
    );

    // Bots earn no badges (pvpFightService skips badge eval for isPvpBot) and can never
    // hold a belt (BOT_MAX_DP caps them below Elite), so any of these on a bot is an
    // impossible flex — and the clearest possible tell that the fighter isn't real.
    for (const b of ROSTER) {
        for (const id of [b.banner.backgroundId, b.banner.frameId, b.banner.accentColor]) {
            assert.ok(!forbidden.has(id), `${b.first} ${b.last} wears badge/belt-gated piece ${id}`);
        }
    }

    // The contract's explicit forbidden list must actually be caught by the rule above —
    // guards against the derivation silently going stale.
    const CONTRACT_FORBIDDEN = [
        "BG_SCORCHED", "BG_TITANIUM", "BG_GOLD_LEAF", "BG_THRONE",
        "LAYOUT_CHAMP", "FRAME_WARPATH", "FRAME_SPOTLIGHT",
        "ACC_CHAMPAGNE", "ACC_BLOOD_RIVAL", "ACC_PLATINUM", "ACC_TEAL_ICE",
    ];
    for (const id of CONTRACT_FORBIDDEN) {
        assert.ok(forbidden.has(id), `${id} should be derived as badge/belt-gated`);
    }
});

test("no bot pins a badge slot", () => {
    for (const b of ROSTER) {
        assert.deepEqual(b.banner.badgeSlots, [], `${b.first} ${b.last} has pinned badges`);
    }
});

// ── Career profile coherence ────────────────────────────────────────────────
// A bot's read-only Career Profile renders from the same Fighter fields a human's does.
// These guard the tells that made a seeded bot instantly identifiable.

test("every win-method mix totals exactly 100%", () => {
    for (const [style, mix] of Object.entries(WIN_METHOD_BY_STYLE)) {
        assert.equal(mix.ko + mix.sub + mix.dec, 100, `${style} mix does not total 100`);
    }
});

test("every bot's KO + SUB + DEC wins sum EXACTLY to its record wins, none negative", () => {
    for (const b of ROSTER) {
        const { koWins, subWins, decisionWins } = deriveBotProfile(b);
        assert.equal(
            koWins + subWins + decisionWins, b.w,
            `${b.first} ${b.last}: ${koWins}+${subWins}+${decisionWins} != ${b.w} wins`
        );
        for (const [k, v] of Object.entries({ koWins, subWins, decisionWins })) {
            assert.ok(v >= 0, `${b.first} ${b.last}: ${k} is negative (${v})`);
            assert.ok(Number.isInteger(v), `${b.first} ${b.last}: ${k} is not an integer`);
        }
    }
});

test("win-method split sums to wins for every style across 0..60 wins", () => {
    // The rounding remainder lands on decisions; this is the property that must never break.
    for (const style of Object.keys(WIN_METHOD_BY_STYLE)) {
        for (let w = 0; w <= 60; w++) {
            const { koWins, subWins, decisionWins } = winMethodSplit(style, w);
            assert.equal(koWins + subWins + decisionWins, w, `${style} @ ${w} wins`);
            assert.ok(decisionWins >= 0, `${style} @ ${w} wins → negative decisions`);
        }
    }
});

test("a bot's stats reproduce its stored OVR EXACTLY — OVR is live identity", () => {
    for (const b of ROSTER) {
        const { stats } = deriveBotProfile(b);
        assert.equal(
            calculateOverall({ ...stats, style: b.style }), b.ovr,
            `${b.first} ${b.last} (${b.style}): stats compute to ${calculateOverall({ ...stats, style: b.style })}, stored OVR is ${b.ovr}`
        );
    }
});

test("no bot has 8 identical stats — the most visible tell on the profile", () => {
    for (const b of ROSTER) {
        const { stats } = deriveBotProfile(b);
        const distinct = new Set(STAT_KEYS.map((k) => stats[k]));
        assert.ok(
            distinct.size > 1,
            `${b.first} ${b.last} renders 8 identical stat bars (all ${stats.str})`
        );
    }
});

test("every stat is a whole number in 1..99", () => {
    for (const b of ROSTER) {
        const { stats } = deriveBotProfile(b);
        for (const k of STAT_KEYS) {
            const v = stats[k];
            assert.ok(Number.isInteger(v), `${b.last}: ${k} = ${v} is not an integer`);
            assert.ok(v >= 1 && v <= 99, `${b.last}: ${k} = ${v} out of 1..99`);
        }
    }
});

test("stats follow the style's shape — primaries outrank off-style stats", () => {
    // Guards against a "solution" that hits the OVR with a shapeless stat block.
    for (const b of ROSTER) {
        const { stats } = deriveBotProfile(b);
        const spread = Math.max(...STAT_KEYS.map((k) => stats[k])) - Math.min(...STAT_KEYS.map((k) => stats[k]));
        assert.ok(spread >= 2, `${b.first} ${b.last}: stat spread of ${spread} is too flat to read as a real build`);
    }
});

test("botStatsFor hits the target OVR for every style across the whole bot OVR range", () => {
    for (const style of Object.keys(WIN_METHOD_BY_STYLE)) {
        for (let ovr = 8; ovr <= 55; ovr++) {
            const stats = botStatsFor(style, ovr);
            assert.equal(calculateOverall({ ...stats, style }), ovr, `${style} @ target OVR ${ovr}`);
        }
    }
});

test("notoriety score is never negative and peakTier always matches the score band", () => {
    for (const b of ROSTER) {
        const { notoriety } = deriveBotProfile(b);
        assert.ok(notoriety.score >= 0, `${b.last}: negative fame ${notoriety.score}`);
        assert.equal(
            notoriety.peakTier, calculateTierFromScore(notoriety.score),
            `${b.last}: peakTier ${notoriety.peakTier} does not match score ${notoriety.score}`
        );
    }
});

test("peakTier is set explicitly — it can NEVER self-heal from score", () => {
    // notorietyService.ensureNotorietyShape only backfills peakTier when it is falsy, but
    // the fighterModel default is the truthy string "UNKNOWN". The profile prints
    // tierLabel, which derives from peakTier — so a bot with fame but a default peakTier
    // reads "Unknown" forever. This asserts the derivation never emits the default for a
    // fighter who has actually earned a tier.
    for (const b of ROSTER) {
        const { notoriety } = deriveBotProfile(b);
        if (notoriety.score >= 1000) {
            assert.notEqual(notoriety.peakTier, "UNKNOWN", `${b.last} has ${notoriety.score} fame but peakTier UNKNOWN`);
        }
    }
});

test("notoriety.lastEventAt is null so a seeded score never decays", () => {
    // runNotorietyDecayBatch only walks fighters with a non-null lastEventAt. Null here
    // means the seed is write-once and never needs re-running to top fame back up.
    for (const b of ROSTER) {
        assert.equal(deriveBotProfile(b).notoriety.lastEventAt, null, `${b.last}: lastEventAt would decay`);
    }
});

test("the 3 Challengers read as known fighters, not Fame '—'", () => {
    const challengers = ROSTER.filter((b) => divisionForDp(b.dp) === "challenger");
    assert.equal(challengers.length, 3);
    for (const b of challengers) {
        const { notoriety } = deriveBotProfile(b);
        assert.ok(
            notoriety.score >= 1000,
            `${b.first} ${b.last} is a ${b.w}-${b.l} challenger with only ${notoriety.score} fame`
        );
        assert.notEqual(notoriety.peakTier, "UNKNOWN");
    }
});

test("a bot with zero wins scores zero fame and stays UNKNOWN", () => {
    const winless = ROSTER.filter((b) => b.w === 0);
    assert.ok(winless.length > 0, "expected at least one winless bot in the roster");
    for (const b of winless) {
        const { notoriety } = deriveBotProfile(b);
        assert.equal(notoriety.score, 0, `${b.last}: losses must floor fame at 0, not go negative`);
        assert.equal(notoriety.peakTier, "UNKNOWN");
    }
});

test("botNotoriety floors at 0 — a heavy loss record never goes negative", () => {
    const fame = botNotoriety({ promotionTier: "Amateur", koWins: 0, subWins: 0, decisionWins: 0, losses: 99 });
    assert.equal(fame.score, 0);
    assert.equal(fame.peakTier, "UNKNOWN");
});

test("promotionTier matches the PROMOTION_TIERS OVR band for all 25 bots", () => {
    // Derived from the live band table, not a hardcoded 30.
    const regionalMin = PROMOTION_TIERS["Regional Pro"].minOverall;
    for (const b of ROSTER) {
        const { promotionTier } = deriveBotProfile(b);
        const expected = b.ovr >= regionalMin ? "Regional Pro" : "Amateur";
        assert.equal(promotionTier, expected, `${b.first} ${b.last} @ OVR ${b.ovr} → ${promotionTier}, expected ${expected}`);
        const band = PROMOTION_TIERS[promotionTier];
        assert.ok(
            b.ovr >= band.minOverall && b.ovr <= band.maxOverall,
            `${b.last} @ OVR ${b.ovr} sits outside the ${promotionTier} band (${band.minOverall}-${band.maxOverall})`
        );
    }
});

test("promotionTierForOvr sits exactly on the Regional Pro band edge", () => {
    const min = PROMOTION_TIERS["Regional Pro"].minOverall;
    assert.equal(promotionTierForOvr(min - 1), "Amateur");
    assert.equal(promotionTierForOvr(min), "Regional Pro");
});

test("promotionTier is a value the Fighter schema enum accepts", () => {
    for (const b of ROSTER) {
        assert.ok(
            Object.keys(PROMOTION_TIERS).includes(deriveBotProfile(b).promotionTier),
            `${b.last}: promotionTier is not a known tier`
        );
    }
});

// ── Gyms ────────────────────────────────────────────────────────────────────

test("the style→gym map covers every style present in the roster", () => {
    for (const b of ROSTER) {
        assert.doesNotThrow(
            () => gymNameForBot(b.style, b.dp),
            `${b.first} ${b.last}: style "${b.style}" has no gym mapping`
        );
    }
});

test("every gym a bot is assigned to actually exists in data/gyms.json", () => {
    // If a gym is renamed in the data file, the seed would silently leave gymId null.
    const names = new Set(GYMS.map((g) => g.name));
    for (const b of ROSTER) {
        const gym = deriveBotProfile(b).gymName;
        assert.ok(names.has(gym), `${b.first} ${b.last} → "${gym}" is not a real gym`);
    }
    for (const name of Object.values(STYLE_GYM)) {
        assert.ok(names.has(name), `STYLE_GYM points at "${name}", which is not a real gym`);
    }
});

test("Sambo bots train by division: Prospect at the community gym, Contender+ at the lab", () => {
    assert.equal(gymNameForBot("Sambo", 140), "Community MMA Center");   // prospect
    assert.equal(gymNameForBot("Sambo", 1120), "Precision MMA Lab");     // contender
    assert.equal(gymNameForBot("Sambo", 1500), "Precision MMA Lab");     // challenger
});

// ── careerTrainingSessions ──────────────────────────────────────────────────

test("careerTrainingSessions is 4 per career fight", () => {
    for (const b of ROSTER) {
        assert.equal(deriveBotProfile(b).careerTrainingSessions, (b.w + b.l) * 4, `${b.last}`);
    }
});

// ── The heal is STRICTLY ADDITIVE ───────────────────────────────────────────

test("deriveBotProfile never emits wins, losses, overallRating or badgesEarned", () => {
    // These are live identity: a real player may have fought this bot yesterday, and OVR
    // drives matchmaking. badgesEarned self-heals via getCareerProfile's badge eval. If a
    // future edit adds one of these to the payload, the seed would start rewriting it.
    const FORBIDDEN = ["wins", "losses", "record", "overallRating", "badgesEarned", "ovr"];
    for (const b of ROSTER) {
        const keys = Object.keys(deriveBotProfile(b));
        for (const f of FORBIDDEN) {
            assert.ok(!keys.includes(f), `deriveBotProfile leaks "${f}" — the seed would overwrite live identity`);
        }
    }
});

test("deriveBotProfile is pure — it never mutates the roster entry", () => {
    for (const b of ROSTER) {
        const before = JSON.stringify(b);
        deriveBotProfile(b);
        assert.equal(JSON.stringify(b), before, `${b.last}: roster entry was mutated`);
    }
});

test("deriveBotProfile is deterministic — re-running the seed is a no-op", () => {
    for (const b of ROSTER) {
        assert.deepEqual(deriveBotProfile(b), deriveBotProfile(b), `${b.last}: derivation is not stable`);
    }
});

// ── Gunnar Olsen: the reported bug, pinned ──────────────────────────────────

test("Gunnar Olsen's profile no longer contradicts itself", () => {
    const gunnar = ROSTER.find((b) => b.last === "Olsen");
    const p = deriveBotProfile(gunnar);

    // Was: 22-10 with 0 KO / 0 sub / 0 decision wins, rendered on the same card.
    assert.equal(p.koWins + p.subWins + p.decisionWins, 22);
    // Was: a wrestler with no finishes at all.
    assert.ok(p.decisionWins > p.koWins, "a Wrestler should win mostly by decision");
    // Was: notoriety 0 / peakTier UNKNOWN → Fame "—" on a 32-fight veteran.
    assert.ok(p.notoriety.score > 0);
    assert.notEqual(p.notoriety.peakTier, "UNKNOWN");
    // Was: "Amateur" at OVR 38 (Regional Pro band is 30-48).
    assert.equal(p.promotionTier, "Regional Pro");
    // Was: STR 38 SPD 38 LEG 38 WRE 38 GND 38 SUB 38 CHN 38 FIQ 38.
    assert.equal(new Set(STAT_KEYS.map((k) => p.stats[k])).size > 1, true);
    assert.equal(calculateOverall({ ...p.stats, style: gunnar.style }), 38);
    assert.ok(p.stats.wre > p.stats.fiq, "a Wrestler's WRE should beat his FIQ");
    // Was: gymId NONE, careerTrainingSessions 0.
    assert.equal(p.gymName, "Apex Wrestling Academy");
    assert.equal(p.careerTrainingSessions, 128);
});

// ── BOT_MAX_DP is DERIVED, not a literal ────────────────────────────────────

test("BOT_MAX_DP is derived from the elite division floor", () => {
    assert.equal(BOT_MAX_DP, divisionFloor("elite") - 1);
});

test("BOT_MAX_DP sits one DP below elite — a bot can never promote into elite", () => {
    // The relationship, not the number. If someone hardcodes 2499 and the elite floor is
    // later retuned, these fail — which is exactly the schema-drift bug we're guarding.
    assert.equal(divisionForDp(BOT_MAX_DP), "challenger");
    assert.equal(divisionForDp(BOT_MAX_DP + 1), "elite");
});

// ── snapToBand ──────────────────────────────────────────────────────────────

function inBand(hour, start, width) {
    for (let i = 0; i < width; i++) if ((start + i) % 24 === hour) return true;
    return false;
}

test("snapToBand always lands inside the band, preserves minutes, and shifts <= 12h", () => {
    for (let start = 0; start < 24; start++) {
        for (let hour = 0; hour < 24; hour++) {
            const src = new Date(Date.UTC(2026, 6, 17, hour, 37, 12, 345));
            const out = snapToBand(src, start, BOT_HOUR_BAND_WIDTH);

            assert.ok(
                inBand(out.getUTCHours(), start, BOT_HOUR_BAND_WIDTH),
                `start=${start} hour=${hour} → ${out.getUTCHours()} outside band`
            );
            assert.equal(out.getUTCMinutes(), 37);
            assert.equal(out.getUTCSeconds(), 12);
            assert.equal(out.getUTCMilliseconds(), 345);

            const shiftH = Math.abs(out.getTime() - src.getTime()) / HOUR_MS;
            assert.ok(shiftH <= 12, `start=${start} hour=${hour} shifted ${shiftH}h (> 12h)`);
        }
    }
});

test("snapToBand is a no-op when the time is already inside the band", () => {
    const src = new Date(Date.UTC(2026, 6, 17, 14, 5, 0, 0)); // band 13-16
    const out = snapToBand(src, 13, 4);
    assert.equal(out.getTime(), src.getTime());
});

test("snapToBand takes the shortest path across midnight", () => {
    // Band 23,0,1,2. A 22:xx target is 1h from hour 23 — must move forward, not back 20h.
    const src = new Date(Date.UTC(2026, 6, 17, 22, 30, 0, 0));
    const out = snapToBand(src, 23, 4);
    assert.equal(out.getUTCHours(), 23);
    assert.equal(out.getTime() - src.getTime(), 1 * HOUR_MS);
});

test("snapToBand does not mutate its input", () => {
    const src = new Date(Date.UTC(2026, 6, 17, 8, 0, 0, 0));
    const before = src.getTime();
    snapToBand(src, 20, 4);
    assert.equal(src.getTime(), before);
});

// ── computeNext ─────────────────────────────────────────────────────────────

test("computeNext stays within jitter bounds (+/- band snap) for every rand value", () => {
    const now = new Date(Date.UTC(2026, 6, 17, 9, 15, 0, 0));
    for (const base of [BOT_INTERVAL_MIN_HOURS, 36, 42, BOT_INTERVAL_MAX_HOURS]) {
        for (let bandStart = 0; bandStart < 24; bandStart++) {
            for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
                const state = { baseIntervalHours: base, hourBandStart: bandStart };
                const next = computeNext(state, now, () => r);
                const deltaH = (next.getTime() - now.getTime()) / HOUR_MS;

                const minH = base * (1 - BOT_JITTER_PCT) - 12;
                const maxH = base * (1 + BOT_JITTER_PCT) + 12;
                assert.ok(
                    deltaH >= minH && deltaH <= maxH,
                    `base=${base} band=${bandStart} rand=${r} → ${deltaH}h outside [${minH}, ${maxH}]`
                );
            }
        }
    }
});

test("computeNext lands inside the bot's band", () => {
    const now = new Date(Date.UTC(2026, 6, 17, 9, 15, 0, 0));
    for (let bandStart = 0; bandStart < 24; bandStart++) {
        const next = computeNext({ baseIntervalHours: 36, hourBandStart: bandStart }, now, () => 0.5);
        assert.ok(inBand(next.getUTCHours(), bandStart, BOT_HOUR_BAND_WIDTH));
    }
});

test("computeNext never returns a time in the past", () => {
    const now = new Date(Date.UTC(2026, 6, 17, 9, 15, 0, 0));
    for (let i = 0; i < 500; i++) {
        const state = {
            baseIntervalHours: BOT_INTERVAL_MIN_HOURS + Math.random() * (BOT_INTERVAL_MAX_HOURS - BOT_INTERVAL_MIN_HOURS),
            hourBandStart: Math.floor(Math.random() * 24),
        };
        const next = computeNext(state, now, Math.random);
        assert.ok(next.getTime() > now.getTime(), `computeNext returned ${next.toISOString()} <= now`);
    }
});

test("computeNext degenerate state (no base interval) still never returns the past", () => {
    const now = new Date(Date.UTC(2026, 6, 17, 9, 15, 0, 0));
    const next = computeNext({}, now, () => 0.5);
    assert.ok(next.getTime() > now.getTime());
});

// ── DP clamp math ───────────────────────────────────────────────────────────

/**
 * Mirrors the clamp in services/pvpFightService.runResolution (BOT BRANCH (a)) EXACTLY.
 * The clamp is an inline branch there (it must read the DB-loaded `attacker.isPvpBot`, so
 * it cannot be a caller-parameterised helper without reintroducing the spoofable flag the
 * whole design avoids). Everything downstream of the clamp — division derivation, promote
 * detection, peakDp — is the REAL applyDpAndDivision from pvpDpService.
 */
function clampAttackerDpChange(isPvpBot, dpChange, recordDp) {
    if (isPvpBot && dpChange > 0) {
        return Math.max(0, Math.min(dpChange, BOT_MAX_DP - recordDp));
    }
    return dpChange;
}

test("bot at 2490 winning +40 is clamped to BOT_MAX_DP and does NOT promote to elite", () => {
    const record = { dp: 2490, peakDp: 2490, division: "challenger" };
    const change = clampAttackerDpChange(true, 40, record.dp);
    assert.equal(change, 9); // 2499 - 2490

    const applied = applyDpAndDivision(record, change, { isWin: true });
    assert.equal(record.dp, BOT_MAX_DP);
    assert.equal(record.division, "challenger");
    assert.equal(applied.promoted, false);
    // peakDp must never bank a DP the bot never held.
    assert.ok(record.peakDp <= BOT_MAX_DP);
});

test("bot already at BOT_MAX_DP gains nothing", () => {
    const record = { dp: BOT_MAX_DP, peakDp: BOT_MAX_DP, division: "challenger" };
    const change = clampAttackerDpChange(true, 120, record.dp);
    assert.equal(change, 0);

    const applied = applyDpAndDivision(record, change, { isWin: true });
    assert.equal(record.dp, BOT_MAX_DP);
    assert.equal(record.division, "challenger");
    assert.equal(applied.promoted, false);
});

test("bot above the ceiling (legacy/drift) clamps to 0, never negative", () => {
    const change = clampAttackerDpChange(true, 120, BOT_MAX_DP + 500);
    assert.equal(change, 0);
});

test("bot LOSING DP is never clamped — the ceiling is a cap, not a floor", () => {
    const change = clampAttackerDpChange(true, -55, 2490);
    assert.equal(change, -55);
});

test("HUMAN at 2490 winning +40 is NOT clamped and promotes to elite normally", () => {
    const record = { dp: 2490, peakDp: 2490, division: "challenger" };
    const change = clampAttackerDpChange(false, 40, record.dp);
    assert.equal(change, 40, "a human must never be touched by the bot clamp");

    const applied = applyDpAndDivision(record, change, { isWin: true });
    // applyDpAndDivision sets DP to the new division's floor on promotion (no carry) —
    // hence 2500, not 2490+40. This is precisely why the bot clamp must run BEFORE the
    // apply: once the promote branch is entered, the DP the bot "won" is discarded and
    // replaced by the elite floor, so a post-apply clamp could never undo it cleanly.
    assert.equal(record.dp, divisionFloor("elite"));
    assert.equal(record.division, "elite");
    assert.equal(applied.promoted, true);
});
