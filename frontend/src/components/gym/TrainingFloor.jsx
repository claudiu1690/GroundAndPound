import { useState } from "react";
import { Zap, Lock, TrendingUp } from "lucide-react";
import { SESSION_META, STAT_COLOR, GOLD } from "./sessionMeta";
import { SessionTrainControl } from "./SessionTrainControl";
import { boosterAffectsStat, pctLabel } from "../shop/shopConstants";
import { t } from "@/lib/i18n";

const CATEGORY_TABS = [
    { key: "all", labelKey: "gym.floor.tabAll" },
    { key: "striking", labelKey: "gym.floor.tabStriking" },
    { key: "grappling", labelKey: "gym.floor.tabGrappling" },
    { key: "mindbody", labelKey: "gym.floor.tabMindBody" },
];

function floorCategory(cat) {
    if (cat === "striking") return "striking";
    if (cat === "grappling") return "grappling";
    return "mindbody"; // mental + physical
}

function accentStyle(stats) {
    if (stats.length > 2) return { background: GOLD };
    if (stats.length === 2) {
        const c0 = STAT_COLOR[stats[0]];
        const c1 = STAT_COLOR[stats[1]];
        return { background: `linear-gradient(180deg, ${c0} 0%, ${c0} 50%, ${c1} 50%, ${c1} 100%)` };
    }
    if (stats.length === 1) return { background: STAT_COLOR[stats[0]] };
    return { background: GOLD };
}

/**
 * All non-sparring sessions as compact rows, with a category filter.
 * Always carries data-tut="gym-sessions" (regardless of the active tab) —
 * the tutorial anchor must resolve even before the player has trained.
 */
export function TrainingFloor({
    floorKeys,
    canTrain,
    injuryLocked,
    rank2SessionKey,
    rank2Unlocked,
    energy,
    fighter,
    activeBooster,
    training,
    onTrain,
    flashSessionKey,
}) {
    const [tab, setTab] = useState("all");

    const filteredKeys = floorKeys.filter((key) => {
        if (tab === "all") return true;
        const m = SESSION_META[key];
        return floorCategory(m.category) === tab;
    });

    return (
        <div className="floor">
            <div className="floor-head">
                <span className="floor-title">{t("gym.floor.title")}</span>
                <div className="cat-tabs">
                    {CATEGORY_TABS.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            className={`cat-tab${tab === c.key ? " on" : ""}`}
                            onClick={() => setTab(c.key)}
                        >
                            {t(c.labelKey)}
                        </button>
                    ))}
                </div>
            </div>
            <div className="floor-rows" data-tut="gym-sessions">
                {filteredKeys.map((key) => {
                    const m = SESSION_META[key];
                    if (!m) return null;
                    const stats = m.stats || [];
                    const isRank2Locked = !!m.rank2 && !rank2Unlocked && key === rank2SessionKey;
                    const isLocked = stats.some((s) => injuryLocked.has(s));
                    const notEnoughEnergy = energy < m.cost;
                    const isStaminaMaxed = key === "strength_conditioning" && (fighter.maxStamina ?? 100) >= 120;
                    const showQtyControl = !isRank2Locked && canTrain && !isLocked && !notEnoughEnergy && !isStaminaMaxed;
                    const rowLocked = isRank2Locked || isLocked || isStaminaMaxed || !canTrain;
                    const cardMax = Math.min(Math.floor(energy / m.cost), 25);
                    const boostedHere = !!activeBooster && stats.some((s) => boosterAffectsStat(activeBooster, s));

                    return (
                        <div key={key} className={`srow${rowLocked ? " srow--locked" : ""}${flashSessionKey === key ? " session-card--flash" : ""}`}>
                            <div className="saccent" style={isRank2Locked ? { background: "var(--c-border)" } : accentStyle(stats)} />
                            <div className="sname">
                                <b>
                                    {m.label}
                                    {isRank2Locked && <span className="rank-badge">{t("gym.sessions.rank2Locked")}</span>}
                                    {boostedHere && (
                                        <span
                                            className="boost-pill"
                                            title={`${activeBooster.name}: +${pctLabel(activeBooster.pct)}% XP`}
                                        >
                                            <TrendingUp size={9} /> {t("gym.floor.boosterBadge", { pct: pctLabel(activeBooster.pct), name: activeBooster.name })}
                                        </span>
                                    )}
                                </b>
                                <span>
                                    {stats.length
                                        ? stats.map((s) => (
                                            <span key={s} className={`s-tag gym-tag gym-tag-${s.toLowerCase()}`}>{s}</span>
                                        ))
                                        : m.special
                                        ? <span className="s-tag gym-tag gym-tag-all">{m.special}</span>
                                        : null}
                                </span>
                            </div>
                            <div className="sdesc">{m.desc}</div>
                            <div className="scost"><Zap size={11} /> {m.cost}E</div>
                            <div className="sctl">
                                {isRank2Locked ? (
                                    <button type="button" className="train-sm train-sm--inactive" disabled>
                                        <Lock size={10} /> {t("gym.sessions.rank2Locked")}
                                    </button>
                                ) : !canTrain ? (
                                    <button type="button" className="train-sm train-sm--inactive" disabled>
                                        {t("gym.sessions.joinToTrain")}
                                    </button>
                                ) : isLocked ? (
                                    <button type="button" className="train-sm train-sm--inactive" disabled>
                                        {t("gym.sessions.injuryLocked")}
                                    </button>
                                ) : isStaminaMaxed ? (
                                    <button type="button" className="train-sm train-sm--inactive" disabled>
                                        <Lock size={10} /> {t("gym.sessions.staminaMaxed")}
                                    </button>
                                ) : notEnoughEnergy ? (
                                    <button type="button" className="train-sm train-sm--inactive" disabled>
                                        {t("gym.sessions.needEnergy", { cost: m.cost })}
                                    </button>
                                ) : showQtyControl ? (
                                    <SessionTrainControl
                                        sessionKey={key}
                                        cost={m.cost}
                                        energy={energy}
                                        cardMax={cardMax}
                                        busy={!!training}
                                        onTrain={onTrain}
                                    />
                                ) : null}
                            </div>
                        </div>
                    );
                })}
                {filteredKeys.length === 0 && (
                    <div className="floor-empty">{t("gym.floor.emptyCategory")}</div>
                )}
            </div>
        </div>
    );
}
