/**
 * QA contract test: every fighter field the read-only (rival) profile components read must
 * exist in the non-owner projection served by GET /fighters/:id/profile
 * (fighterService.toPublicProjection / PUBLIC_FIGHTER_KEYS). A field read that the projection
 * lacks renders blank, so adding a read to one of these components without extending the
 * whitelist fails here.
 *
 * Components mounted when ProfilePane is readOnly (ReadOnlyProfile.jsx):
 * ProfileBanner (+ BannerPreview, PinnedBadgeRow), ProfileStatsCard, ProfileCareerCard,
 * MediaCareerCard. PerksCard, EquippedMovesCard and BannerEditor are owner-only.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

const fighterService = require("../../services/fighterService");
const { PUBLIC_FIGHTER_KEYS, toPublicProjection } = fighterService;

const SRC = path.resolve(__dirname, "../../frontend/src/components");
const FILES = [
    "career/ProfileBanner.jsx",
    "career/ProfileStatsCard.jsx",
    "career/ProfileCareerCard.jsx",
    "career/MediaCareerCard.jsx",
    "career/PinnedBadgeRow.jsx",
    "banner/BannerPreview.jsx",
];

// Keys ProfileStatsCard reads through a data-driven table, not `fighter.x`.
const TABLE_READS = ["str", "spd", "leg", "wre", "gnd", "sub", "chn", "fiq"];

function topLevelReads() {
    const found = new Set(TABLE_READS);
    for (const rel of FILES) {
        const src = fs.readFileSync(path.join(SRC, rel), "utf8");
        for (const m of src.matchAll(/\bfighter\??\.([A-Za-z_]\w*)/g)) found.add(m[1]);
    }
    return found;
}

function sparseDoc() {
    return { _id: new mongoose.Types.ObjectId(), firstName: "A", lastName: "B", weightClass: "Lightweight", style: "Boxer" };
}

test("every top-level fighter.* read by the read-only profile components is in PUBLIC_FIGHTER_KEYS", () => {
    const reads = topLevelReads();
    assert.ok(reads.size >= 12, `scan found too few reads: ${[...reads]}`);
    const missing = [...reads].filter((k) => !PUBLIC_FIGHTER_KEYS.includes(k));
    assert.deepEqual(missing, [], `read-only profile reads fields the projection lacks: ${missing}`);
});

test("nested reads (record.*, ranking.rank, gymId.name, notoriety.score/tierLabel, media.*) exist on a sparse doc's projection", () => {
    const p = toPublicProjection(sparseDoc());
    for (const k of ["wins", "losses", "draws", "koWins", "subWins", "decisionWins"]) {
        assert.equal(typeof p.record[k], "number", `record.${k}`);
    }
    assert.ok("rank" in p.ranking, "ranking.rank");
    assert.equal(typeof p.notoriety.score, "number", "notoriety.score");
    assert.equal(typeof p.notoriety.tierLabel, "string", "notoriety.tierLabel");
    for (const k of ["podcastName", "episodeCount", "documentaryStatus", "documentaryRecordedAt"]) {
        assert.ok(k in p.media, `media.${k}`);
    }
    for (const k of ["backgroundId", "frameId", "accentColor", "badgeSlots"]) {
        assert.ok(k in p.banner, `banner.${k}`);
    }
    assert.ok(Array.isArray(p.pinnedBadges));
    // gymId.name only exists when the gym was populated with a name
    const withGym = toPublicProjection({ ...sparseDoc(), gymId: { _id: new mongoose.Types.ObjectId(), name: "Iron Temple" } });
    assert.equal(withGym.gymId.name, "Iron Temple");
});

test("the read-only mount list is still what this test assumes (guard against new unscanned cards)", () => {
    const pane = fs.readFileSync(path.join(SRC, "career/ProfilePane.jsx"), "utf8");
    // Every card that takes the whole `fighter` prop and is NOT behind !readOnly must be scanned above.
    const mounted = [...pane.matchAll(/<(\w+)\s[^>]*\bfighter=\{/g)].map((m) => m[1]);
    const behindOwnerGate = new Set(["PerksCard", "BannerEditor"]);
    const expectScanned = new Set(["ProfileBanner", "ProfileStatsCard", "ProfileCareerCard", "MediaCareerCard"]);
    for (const name of mounted) {
        if (behindOwnerGate.has(name)) continue;
        assert.ok(expectScanned.has(name), `ProfilePane mounts ${name} with fighter=; scan it in FILES`);
    }
});
