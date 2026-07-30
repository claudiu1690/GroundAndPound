/**
 * Badge profile AFTER the gym cutover (GYMS_RETIRED=true).
 *
 * ⚠️ THE ENV VAR MUST BE SET BEFORE THE FIRST require OF config/badgeService. `config.js`
 * snapshots `process.env.GYMS_RETIRED` into `features` at module-evaluation time, so flipping it
 * later in the file would have no effect and this suite would silently re-test the gyms-open
 * path. It lives in its own FILE for the same reason: `node --test` gives each file its own
 * process, which is the only way both flag states can be covered in one run.
 */
process.env.GYMS_RETIRED = "true";
process.env.LOCAL_MODE = "true";

const test = require("node:test");
const assert = require("node:assert");

const badgeService = require("../../services/badgeService");
const { BADGES, GYM_BADGE_TO_ARCHETYPE } = require("../../consts/badgeCatalog");
const { features } = require("../../config");

const ALL_GYM_RANK4 = BADGES.filter((b) => b.category === "gym" && b.id.endsWith("_rank4")).map((b) => b.id);
const REMAPPED = Object.keys(GYM_BADGE_TO_ARCHETYPE);
const LEGACY = ALL_GYM_RANK4.filter((id) => !REMAPPED.includes(id));

function fighter(over) {
    return Object.assign({
        badgesEarned: [],
        record: { wins: 0, losses: 0, draws: 0, koWins: 0, subWins: 0, decisionWins: 0 },
        campStats: {},
        campRank4Archetypes: [],
    }, over || {});
}
const earned = (ids) => ids.map((id) => ({ badgeId: id, earnedAt: new Date(), context: null, seen: true }));
const idsIn = (prof, cat) => (prof.categories.find((c) => c.key === cat) || { badges: [] }).badges.map((b) => b.id);
const tileCount = (prof) => prof.categories.reduce((n, c) => n + c.badges.length, 0);

test("the flag is actually on — otherwise every assertion below is vacuous", () => {
    assert.equal(features.gymsRetired, true);
    assert.equal(LEGACY.length, 6);
    assert.equal(REMAPPED.length, 4);
});

test("R1 an unearned RETIRED badge is hidden from the profile", () => {
    const shown = idsIn(badgeService.buildBadgeProfile(fighter()), "gym");
    for (const id of LEGACY) {
        assert.ok(!shown.includes(id), `${id} is unobtainable and unearned — it must not be shown`);
    }
});

test("R2 an EARNED retired badge is still shown, flagged legacy, and still counts", () => {
    const prof = badgeService.buildBadgeProfile(fighter({ badgesEarned: earned(["submission_rank4"]) }));
    const gym = (prof.categories.find((c) => c.key === "gym") || {}).badges || [];
    const badge = gym.find((b) => b.id === "submission_rank4");
    assert.ok(badge, "a veteran must never lose a badge they earned");
    assert.equal(badge.earned, true);
    assert.equal(badge.legacy, true, "drives the Retired chip in the UI");
    assert.equal(prof.earnedCount, 1);
    // The other five, still unearned, stay hidden.
    const shown = gym.map((b) => b.id);
    for (const id of LEGACY.filter((i) => i !== "submission_rank4")) {
        assert.ok(!shown.includes(id));
    }
});

test("R3 the four re-pointed badges are NEVER hidden — they are still chaseable via the camp", () => {
    const shown = idsIn(badgeService.buildBadgeProfile(fighter()), "gym");
    for (const id of REMAPPED) {
        assert.ok(shown.includes(id), `${id} has a camp route and must stay visible`);
    }
});

test("R4 the header count matches the tiles actually rendered", () => {
    // This is the bug the filter exists to kill: locked legacy badges were excluded from
    // lockedCount but still rendered, so the header disagreed with the grid by six.
    for (const f of [fighter(), fighter({ badgesEarned: earned(LEGACY) }), fighter({ badgesEarned: earned(REMAPPED) })]) {
        const prof = badgeService.buildBadgeProfile(f);
        assert.equal(prof.earnedCount + prof.lockedCount, tileCount(prof));
    }
});

test("R5 a retired badge stays in the CATALOG even though it is hidden from the view", () => {
    // The filter is render-time only. Deleting a def would make it vanish from the Career Page
    // of every veteran who earned it — the sharpest edge in the whole gym retirement.
    for (const id of LEGACY) {
        assert.ok(BADGES.some((b) => b.id === id), `${id} must remain in the catalog forever`);
    }
});

test("R6 camp coach badges are unaffected by the cutover", () => {
    const shown = idsIn(badgeService.buildBadgeProfile(fighter()), "camp");
    assert.deepEqual(shown.sort(), [
        "coach_all_rank4", "coach_first_hire", "coach_full_staff",
        "coach_legendary_hire", "coach_taught_five", "coach_taught_move",
    ]);
});
