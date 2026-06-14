/**
 * Ground & Pound — Proving Ground (PVP) seasonal badge resolver.
 *
 * PVP placement / belt badges are SEASONAL and unbounded over time, so they cannot
 * live in the static `consts/badgeCatalog.js`. They are awarded imperatively by
 * pvpRewardService directly into `fighter.badgesEarned` with deterministic ids:
 *
 *   pvp_challenger_s3            (division placement)
 *   pvp_elite_s7
 *   pvp_champion_s12
 *   pvp_belt_s3_featherweight    (season belt holder, weight class suffix)
 *
 * `resolvePvpBadge(id)` parses that id pattern at READ time and returns the display
 * descriptor. `badgeService.buildBadgeProfile` consults this for any `pvp_`-prefixed
 * earned id that the static catalog doesn't recognise (see §9.2). The frontend badge
 * grid uses the same resolver so it tolerates ids it has never seen.
 */

// Display metadata per division. Colors mirror consts/pvpConfig.DIVISIONS so the
// badge grid matches the ladder. Must include EVERY division a placement badge can
// be minted for — a missing key would make resolvePvpBadge return null and
// buildBadgeProfile would silently drop the badge (H-2). prospect/contender only mint
// a badge when REWARDS[div].badge is non-null, but we cover them defensively anyway.
const DIVISION_DISPLAY = {
    prospect: { name: "Prospect", color: "#888", icon: "Medal" },
    contender: { name: "Contender", color: "#93C5FD", icon: "Medal" },
    challenger: { name: "Challenger", color: "#C4B5FD", icon: "Medal" },
    elite: { name: "Elite", color: "#5EEAD4", icon: "Star" },
    champion: { name: "Champion", color: "#C8102E", icon: "Trophy" },
};

function titleCase(s) {
    return String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Batch 1 "Proving Ground" achievement badges — FIXED-id descriptors (not seasonal,
 * not regex-parsed). These are awarded imperatively by pvpBadgeService via
 * pvpRewardService.awardBadge. resolvePvpBadge consults this map FIRST so a fixed id is
 * never swallowed by the `pvp_<division>_s<N>` / `pvp_belt_s<N>_<wc>` regex branches.
 */
const PVP_BADGE_DEFS = {
    pvp_first_blood: { id: "pvp_first_blood", name: "First Blood", description: "Won your first Proving Ground fight.", icon: "Activity", color: "#C8102E", category: "proving_ground" },
    pvp_first_finish: { id: "pvp_first_finish", name: "First Finish", description: "Won a Proving Ground fight by KO or submission.", icon: "Swords", color: "#C8102E", category: "proving_ground" },
    pvp_first_defense: { id: "pvp_first_defense", name: "Held the Line", description: "Successfully defended your record for the first time.", icon: "Shield", color: "#14B8A6", category: "proving_ground" },
    pvp_reach_contender: { id: "pvp_reach_contender", name: "Contender", description: "Reached the Contender division.", icon: "Medal", color: "#93C5FD", category: "proving_ground" },
    pvp_reach_challenger: { id: "pvp_reach_challenger", name: "Challenger", description: "Reached the Challenger division.", icon: "Medal", color: "#C4B5FD", category: "proving_ground" },
    pvp_reach_elite: { id: "pvp_reach_elite", name: "Elite", description: "Reached the Elite division.", icon: "Star", color: "#5EEAD4", category: "proving_ground" },
    pvp_reach_champion: { id: "pvp_reach_champion", name: "Champion", description: "Reached the Champion division.", icon: "Trophy", color: "#C8102E", category: "proving_ground" },
    pvp_streak_3: { id: "pvp_streak_3", name: "On a Roll", description: "Won 3 Proving Ground fights in a row.", icon: "Flame", color: "#C87A10", category: "proving_ground" },
    pvp_streak_5: { id: "pvp_streak_5", name: "Hot Streak", description: "Won 5 Proving Ground fights in a row.", icon: "Flame", color: "#C8102E", category: "proving_ground" },
    pvp_streak_10: { id: "pvp_streak_10", name: "Unstoppable", description: "Won 10 Proving Ground fights in a row.", icon: "Flame", color: "#D4A820", category: "proving_ground" },
    pvp_giant_killer: { id: "pvp_giant_killer", name: "Giant Killer", description: "Beat an opponent rated 6–10 OVR above you.", icon: "Skull", color: "#8B5CF6", category: "proving_ground" },
    pvp_giant_slayer: { id: "pvp_giant_slayer", name: "Giant Slayer", description: "Beat an opponent rated 11–20 OVR above you.", icon: "Skull", color: "#C8102E", category: "proving_ground" },
    pvp_rival_first: { id: "pvp_rival_first", name: "Settled It", description: "Resolved a rivalry with a third win over a rival.", icon: "Swords", color: "#C8102E", category: "proving_ground" },
    pvp_belt_defense: { id: "pvp_belt_defense", name: "Belt Defender", description: "Defended your record while holding the belt.", icon: "ShieldCheck", color: "#D4A820", category: "proving_ground" },
    pvp_twist_master: { id: "pvp_twist_master", name: "Twist Master", description: "Won a fight under an active season twist.", icon: "Sparkles", color: "#D4A820", category: "proving_ground" },
    pvp_belt_first: { id: "pvp_belt_first", name: "Belt Holder", description: "Held a Proving Ground season belt.", icon: "Crown", color: "#D4A820", category: "proving_ground" },
    pvp_belt_2: { id: "pvp_belt_2", name: "Two-Belt Champ", description: "Held 2 or more Proving Ground season belts.", icon: "Crown", color: "#D4A820", category: "proving_ground" },
    pvp_belt_b2b: { id: "pvp_belt_b2b", name: "Back-to-Back", description: "Held the belt in two consecutive seasons.", icon: "Crown", color: "#C8102E", category: "proving_ground" },
    pvp_open_champion: { id: "pvp_open_champion", name: "Open Champion", description: "Held the Open (all weight classes) Season 1 belt.", icon: "Crown", color: "#FFD700", category: "proving_ground" },
    pvp_undefeated_champ: { id: "pvp_undefeated_champ", name: "Flawless Champion", description: "Won the belt without a single loss that season.", icon: "Crown", color: "#D4A820", category: "proving_ground" },
    pvp_top3: { id: "pvp_top3", name: "Podium", description: "Finished a season in the top 3 of your ladder.", icon: "Medal", color: "#D4A820", category: "proving_ground" },
    pvp_unbeaten_season: { id: "pvp_unbeaten_season", name: "Perfect Season", description: "Ended a season with 10+ wins and zero losses.", icon: "ShieldCheck", color: "#5EEAD4", category: "proving_ground" },
};

/**
 * @param {string} id e.g. "pvp_challenger_s3" or "pvp_belt_s3_featherweight"
 * @returns {{ id, name, icon, color, description, category, season, weightClass? } | null}
 */
function resolvePvpBadge(id) {
    if (typeof id !== "string" || !id.startsWith("pvp_")) return null;

    // Fixed Batch-1 descriptors take precedence over the seasonal regex branches so a
    // fixed id (e.g. pvp_belt_first) is never swallowed by /^pvp_belt_s\d+_.../ etc.
    if (PVP_BADGE_DEFS[id]) return PVP_BADGE_DEFS[id];

    // Belt: pvp_belt_s{N}_{weightClass}
    let m = id.match(/^pvp_belt_s(\d+)_([a-z]+)$/);
    if (m) {
        const season = Number(m[1]);
        const rawWc = m[2];
        const wc = titleCase(rawWc);
        // Open (cross-weight-class) season belt has its own copy.
        if (rawWc === "open") {
            return {
                id,
                name: `Open Proving Ground Belt — Season ${season}`,
                icon: "Crown",
                color: "#FFD700",
                description: `Held the Open (all weight classes) Proving Ground belt at the end of Season ${season}.`,
                category: "proving_ground",
                season,
                weightClass: wc,
            };
        }
        return {
            id,
            name: `${wc} Belt — Season ${season}`,
            icon: "Crown",
            color: "#FFD700",
            description: `Held the ${wc} Proving Ground belt at the end of Season ${season}.`,
            category: "proving_ground",
            season,
            weightClass: wc,
        };
    }

    // Division placement: pvp_{division}_s{N}
    m = id.match(/^pvp_([a-z]+)_s(\d+)$/);
    if (m) {
        const div = m[1];
        const season = Number(m[2]);
        // Safe fallback for any recognized pvp division id we didn't map explicitly —
        // never return null here, or the badge is silently dropped (H-2).
        const meta = DIVISION_DISPLAY[div] || { name: titleCase(div), color: "#888", icon: "Medal" };
        return {
            id,
            name: `${meta.name} — Season ${season}`,
            icon: meta.icon,
            color: meta.color,
            description: `Finished Season ${season} in the ${meta.name} division of the Proving Ground.`,
            category: "proving_ground",
            season,
        };
    }

    return null;
}

module.exports = { resolvePvpBadge, PVP_BADGE_DEFS };
