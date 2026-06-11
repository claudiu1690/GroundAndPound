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
 * @param {string} id e.g. "pvp_challenger_s3" or "pvp_belt_s3_featherweight"
 * @returns {{ id, name, icon, color, description, category, season, weightClass? } | null}
 */
function resolvePvpBadge(id) {
    if (typeof id !== "string" || !id.startsWith("pvp_")) return null;

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

module.exports = { resolvePvpBadge };
