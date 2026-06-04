import { memo } from "react";
import { Crown, Flame, Swords, Target, CalendarClock } from "lucide-react";
import { PvpSeasonBadge } from "./PvpSeasonBadge";
import { seasonHeaderLabel } from "./pvpSeasonUtil";

/**
 * "Your Fight Card" — the persistent PvP identity header (contract §3.1 hub.identity).
 *
 * Every field is guarded so the header renders a graceful blank / muted state
 * before the backend lands. Reuses the `fr-ovr-block` treatment for the OVR-style
 * record block and `STYLE_COLORS` conventions from the rest of the hub.
 *
 * v1.2: the division pill is LIT from identity.division (or the season's
 * my_division), a season countdown rides next to the eyebrow from getPvpSeason(),
 * and the bounty-on-head chip LIGHTS when identity.bounty_on_head > 0.
 *
 * Props:
 *   identity (hub.identity | null)
 *   loading  (bool)
 *   season   (getPvpSeason() result | null) — drives the countdown + division fallback
 */

/** cold → warm → hot heat dot driven by the signed current streak. */
function streakHeat(streak) {
    if (streak == null) return { cls: "cold", title: "No streak" };
    if (streak <= -3) return { cls: "frozen", title: `On a ${Math.abs(streak)}-fight skid` };
    if (streak < 0) return { cls: "cold", title: `${Math.abs(streak)} losses in a row` };
    if (streak === 0) return { cls: "cold", title: "No streak" };
    if (streak >= 10) return { cls: "blaze", title: `${streak}-fight win streak` };
    if (streak >= 5) return { cls: "hot", title: `${streak}-fight win streak` };
    if (streak >= 3) return { cls: "warm", title: `${streak}-fight win streak` };
    return { cls: "lit", title: `${streak}-fight win streak` };
}

function fmtPct(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    // Accept either a 0–1 fraction or an already-percentaged 0–100 number.
    const n = Number(v);
    const pct = n <= 1 ? n * 100 : n;
    return `${Math.round(pct)}%`;
}

function Stat({ label, children, tone }) {
    return (
        <div className={`pvp-identity-stat${tone ? ` pvp-identity-stat--${tone}` : ""}`}>
            <div className="pvp-identity-stat-val">{children}</div>
            <div className="pvp-identity-stat-label">{label}</div>
        </div>
    );
}

export const PvpIdentityHeader = memo(function PvpIdentityHeader({ identity, loading, season }) {
    if (loading && !identity) {
        return (
            <div className="pvp-identity pvp-identity--skeleton" aria-busy="true">
                <div className="pvp-identity-main">
                    <div className="pvp-identity-skel-block" />
                    <div className="pvp-identity-skel-stats" />
                </div>
            </div>
        );
    }

    const id = identity || {};
    const name = id.name || "—";
    const activeTitle = id.active_title || null;

    const record = id.record || "—";
    const winPct = fmtPct(id.win_pct);
    const koRate = fmtPct(id.ko_rate);
    const finishRate = fmtPct(id.finish_rate);

    const rank = id.ladder_rank;
    const isChampion = !!id.is_champion;
    const beltDefenses = id.belt_defenses;
    const ranksFromZone = id.ranks_from_challenge_zone;

    const currentStreak = id.current_streak;
    const bestStreak = id.best_streak;
    const heat = streakHeat(currentStreak);

    const fameLifetime = id.pvp_fame_lifetime;
    const rivalsActive = id.rivals_active;
    const bountyOnHead = id.bounty_on_head ?? 0; // lit when > 0 (real bounties, v1.2)

    // Division: prefer the identity field, fall back to the season's my_division.
    const division = id.division || season?.my_division || null;
    // Season countdown chip ("Season 3 · ends in 5d"). Graceful blank if absent.
    const seasonLabel = seasonHeaderLabel(season);

    // Belt status line — CHAMPION + defenses, or "N ranks from the challenge zone".
    let beltLine = null;
    if (isChampion) {
        beltLine = (
            <span className="pvp-identity-belt pvp-identity-belt--champ">
                <Crown size={12} /> CHAMPION
                {beltDefenses != null && <span className="pvp-identity-belt-sub">{beltDefenses} {beltDefenses === 1 ? "defense" : "defenses"}</span>}
            </span>
        );
    } else if (ranksFromZone != null) {
        beltLine = (
            <span className="pvp-identity-belt">
                {ranksFromZone <= 0
                    ? "In the challenge zone"
                    : `${ranksFromZone} ${ranksFromZone === 1 ? "rank" : "ranks"} from the challenge zone`}
            </span>
        );
    }

    const streakDisplay = currentStreak == null
        ? "—"
        : currentStreak > 0 ? `W${currentStreak}`
            : currentStreak < 0 ? `L${Math.abs(currentStreak)}`
                : "—";

    return (
        <div className="pvp-identity">
            <div className="pvp-identity-head">
                <div className="pvp-identity-namewrap">
                    <div className="pvp-identity-eyebrow-row">
                        <span className="pvp-identity-eyebrow">YOUR FIGHT CARD</span>
                        {seasonLabel && (
                            <span className="pvp-season-countdown" title="Current season">
                                <CalendarClock size={9} /> {seasonLabel}
                            </span>
                        )}
                    </div>
                    <div className="pvp-identity-name">
                        {name}
                        {isChampion && <Crown size={15} className="pvp-identity-crown" aria-label="Champion" />}
                    </div>
                    {activeTitle && <div className="pvp-identity-title">&ldquo;{activeTitle}&rdquo;</div>}
                    {/* Division pill LIT in v1.2 from identity.division / season.my_division. */}
                    {division && (
                        <span className="pvp-identity-division-wrap">
                            <PvpSeasonBadge division={division} size="md" />
                        </span>
                    )}
                </div>

                <div className="fr-ovr-block pvp-identity-rank">
                    <div className="fr-ovr-val">
                        {isChampion ? "👑" : rank != null ? `#${rank}` : "—"}
                    </div>
                    <div className="fr-ovr-label">Ladder Rank</div>
                </div>
            </div>

            {beltLine && <div className="pvp-identity-beltrow">{beltLine}</div>}

            <div className="pvp-identity-stats">
                <Stat label="Record">{record}</Stat>
                <Stat label="Win %">{winPct}</Stat>
                <Stat label="KO %">{koRate}</Stat>
                <Stat label="Finish %">{finishRate}</Stat>

                <Stat label="Streak" tone={heat.cls}>
                    <span className="pvp-identity-streak" title={heat.title}>
                        <span className={`pvp-identity-heatdot pvp-identity-heatdot--${heat.cls}`} aria-hidden="true" />
                        {streakDisplay}
                        {bestStreak != null && bestStreak > 0 && (
                            <span className="pvp-identity-best" title={`Best streak: ${bestStreak}`}>best {bestStreak}</span>
                        )}
                    </span>
                </Stat>

                <Stat label="PvP Fame">
                    <span className="pvp-identity-fame"><Flame size={11} /> {fameLifetime != null ? fameLifetime : "—"}</span>
                </Stat>

                <Stat label="Rivals">
                    <span className="pvp-identity-rivals"><Swords size={11} /> {rivalsActive != null ? rivalsActive : 0}</span>
                </Stat>

                {/* Bounty-on-head — LIT (red) when iron is posted against you, else dark. */}
                <Stat label="Bounty on you" tone={bountyOnHead > 0 ? "blaze" : undefined}>
                    <span
                        className={`pvp-identity-bounty ${bountyOnHead > 0 ? "pvp-identity-bounty--lit" : "pvp-identity-bounty--dark"}`}
                        title={bountyOnHead > 0
                            ? `${bountyOnHead.toLocaleString()} iron posted against you — win to make it disappear.`
                            : "No bounty on your head."}
                    >
                        <Target size={11} /> {bountyOnHead > 0 ? bountyOnHead.toLocaleString() : 0}
                    </span>
                </Stat>
            </div>
        </div>
    );
});

export default PvpIdentityHeader;
