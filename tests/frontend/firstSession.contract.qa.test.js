/**
 * QA (first-session build): static client/server contract checks that no unit test covered.
 * Source-text parsing only (the client files import i18n/JSON and are not loadable by plain Node).
 *
 *  1. Every data-tut anchor named by constants/tutorialSteps.js and constants/sectionTips.js exists
 *     in some rendered markup. TEMPLATED lists anchors built from a template literal
 *     (profile-energy / profile-health), checked via the template itself.
 *  2. Client step order / tip keys match the server (consts/tutorialConfig).
 *  3. Every literal t("...") key used by the new components exists in locales/en.json, and the
 *     dynamic key families (reveal.finish.*, reveal.word.*, tips.<section>.<n>.*) resolve.
 *  4. No em or en dashes in any new player copy.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cfg = require("../../consts/tutorialConfig");

const SRC = path.resolve(__dirname, "../../frontend/src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const en = JSON.parse(read("locales/en.json"));

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
    return out;
}
const ALL_TEXT = walk(SRC).map((f) => fs.readFileSync(f, "utf8")).join("\n");

const get = (key) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), en);
function flatten(o, p = "", out = {}) {
    for (const [k, v] of Object.entries(o)) {
        const kk = p ? `${p}.${k}` : k;
        if (v && typeof v === "object") flatten(v, kk, out); else out[kk] = v;
    }
    return out;
}

/** Quoted ids inside anchor / focus / focusAfterTooltips values (string or array). */
function anchorsIn(text) {
    const ids = new Set();
    for (const m of text.matchAll(/\b(?:anchor|focus|focusAfterTooltips)\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
        for (const q of m[1].matchAll(/"([a-z0-9-]+)"/g)) ids.add(q[1]);
    }
    return ids;
}

// Anchors built from a template rather than a literal, so the text scan cannot see them.
// FighterResourceBars renders data-tut={`profile-${key}`} for each resource row (energy, health,
// stamina), visible in the desktop sidebar (checked in the browser 2026-11-04).
const TEMPLATED = new Set(["profile-energy", "profile-health"]);

// \x27 = single quote, \x60 = backtick (data-tut may be a plain attribute or a JSX expression).
const QUOTE = "[\"\x27\x60]";

test("every data-tut anchor used by the debut steps and the tips exists in markup", () => {
    const ids = new Set([...anchorsIn(read("constants/tutorialSteps.js")), ...anchorsIn(read("constants/sectionTips.js"))]);
    assert.ok(ids.size >= 25, `expected to parse the anchors, got ${ids.size}`);
    const missing = [];
    for (const id of ids) {
        const re = new RegExp("data-tut=[^\n]*" + QUOTE + id + QUOTE);
        const found = re.test(ALL_TEXT);
        if (!found && !TEMPLATED.has(id)) missing.push(id);
    }
    assert.deepEqual(missing, [], `anchors with no markup: ${missing.join(", ")}`);
    assert.ok(/data-tut=\{`profile-\$\{key\}`\}/.test(ALL_TEXT), "FighterResourceBars no longer templates profile-<key> anchors");
});

test("client debut STEP_ORDER and tip keys mirror the server", () => {
    const steps = read("constants/tutorialSteps.js");
    const order = /export const STEP_ORDER = \[([^\]]*)\]/.exec(steps)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
    assert.deepEqual(order, [...cfg.STEP_ORDER]);

    const tips = read("constants/sectionTips.js");
    const arr = (name) => new RegExp(String.raw`${name} = Object\.freeze\(\[([^\]]*)\]`).exec(tips)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
    assert.deepEqual(arr("SECTION_TIP_KEYS"), [...cfg.SECTION_TIP_KEYS]);
    assert.deepEqual(arr("MOMENT_TIP_KEYS"), [...cfg.MOMENT_TIP_KEYS]);

    // Every debut step except the last names the server's next step; the last completes locally.
    for (let i = 0; i < 3; i++) {
        const block = new RegExp(String.raw`${cfg.STEP_ORDER[i]}:\s*\{\s*next:\s*"([^"]+)"`).exec(steps);
        assert.ok(block, `step ${cfg.STEP_ORDER[i]} missing`);
        assert.equal(block[1], cfg.STEP_ORDER[i + 1]);
    }
    assert.match(steps, /debut_camp:\s*\{\s*next:\s*null,\s*completeLocally:\s*true/);
});

test("every literal t() key used by the first-session components exists in en.json", () => {
    const files = [
        "App.jsx", "components/fights/NextGoalCard.jsx", "components/fights/FightSummary.jsx",
        "components/fights/FightOffers.jsx", "components/fights/OfferCard.jsx", "components/fights/FighterReport.jsx",
        "components/fights/FightCamp.jsx", "components/fights/reveal/FightReveal.jsx",
        "components/tutorial/TipsOverlay.jsx", "components/tutorial/TutorialOverlay.jsx",
        "components/account/AccountTab.jsx", "components/dashboard/NextFightCard.jsx",
        "constants/sectionTips.js", "constants/tutorialSteps.js", "hooks/useTips.js",
    ];
    const missing = [];
    for (const f of files) {
        for (const m of read(f).matchAll(/\bt\(\s*(["\x27])([A-Za-z0-9_.]+)\1/g)) {
            if (get(m[2]) === undefined) missing.push(`${f}: ${m[2]}`);
        }
    }
    assert.deepEqual(missing, []);
});

test("dynamic i18n key families resolve (reveal.finish.*, reveal.word.*, tips.<section>.<n>, home.next.chipDebut)", () => {
    for (const k of ["ko", "tko", "submission", "decision", "split", "draw"]) assert.ok(get(`reveal.finish.${k}`), `reveal.finish.${k}`);
    for (const k of ["VICTORY", "DEFEAT", "DRAW"]) assert.ok(get(`reveal.word.${k}`), `reveal.word.${k}`);
    assert.ok(get("home.next.chipDebut"));
    // Card counts per section come from sectionTips.js (cards: [ { anchor } ... ] on one line).
    const tips = read("constants/sectionTips.js");
    const sectionBlock = tips.slice(tips.indexOf("export const SECTION_TIPS"), tips.indexOf("const onBoard"));
    const re = /^ {2}(\w+): \{\s*\n[\s\S]*?cards: \[([^\n]*)\]/gm;
    let found = 0;
    for (const m of sectionBlock.matchAll(re)) {
        const n = (m[2].match(/\{ anchor/g) || []).length;
        assert.ok(n >= 1, `${m[1]} has no cards`);
        for (let i = 1; i <= n; i++) {
            assert.ok(get(`tips.${m[1]}.${i}.title`), `tips.${m[1]}.${i}.title`);
            assert.ok(get(`tips.${m[1]}.${i}.body`), `tips.${m[1]}.${i}.body`);
        }
        found++;
    }
    assert.equal(found, cfg.SECTION_TIP_KEYS.length, "parsed every section");
    for (const k of ["firstLossTitle", "firstLoss", "firstInjuryTitle", "firstInjury", "firstInjuryNoHours",
        "energyLowTitle", "energyLow", "healthLowTitle", "healthLow"]) assert.ok(get(`tips.moment.${k}`), k);
});

test("no em or en dashes in new player copy (en.json namespaces and tip/step constants)", () => {
    const NEW_PREFIXES = [
        "tutorial.debut", "tips.", "reveal.", "fights.summary.nextGoal", "fights.summary.signingBonus",
        "fights.summary.rankEarned", "fights.summary.ovrLine", "fights.summary.fullReport", "fights.summary.hideReport",
        "fights.summary.nextFight", "fights.summary.trainCamp", "fights.offerCard.diffDebut",
        "fights.offerCard.specialDebut", "fights.board.debutMore", "fights.camp.coachPick", "fights.report.coachPick",
        "home.next.chipDebut", "home.next.debutEyebrow", "home.next.seeOpponent", "account.gameplay", "app.energyShort",
    ];
    const bad = Object.entries(flatten(en))
        .filter(([k]) => NEW_PREFIXES.some((p) => k === p || k.startsWith(p)))
        .filter(([, v]) => typeof v === "string" && /[–—]/.test(v))
        .map(([k]) => k);
    assert.deepEqual(bad, []);
    for (const f of ["constants/tutorialSteps.js", "constants/sectionTips.js"]) {
        const code = read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
        assert.equal(/[–—]/.test(code), false, `${f} has a dash in code or copy`);
    }
});

test("Tap/Click: debut and tip copy that says Tap is only rendered through adaptInput", () => {
    const tapKeys = Object.entries(flatten({ tutorial: { debut: en.tutorial.debut }, tips: en.tips }))
        .filter(([, v]) => typeof v === "string" && /\b[Tt]ap\b/.test(v)).map(([k]) => k);
    assert.match(read("components/tutorial/TutorialOverlay.jsx"), /adaptInput\(/);
    assert.match(read("components/tutorial/TipsOverlay.jsx"), /adaptInput\(/);
    assert.ok(tapKeys.every((k) => k.startsWith("tutorial.debut.") || k.startsWith("tips.")), tapKeys.join(","));
});
