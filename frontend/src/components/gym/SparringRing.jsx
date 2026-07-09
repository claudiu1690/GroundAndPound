import { useState } from "react";
import { Zap, AlertTriangle, Lock, Sparkles, TrendingUp } from "lucide-react";
import { SESSION_META, SPARRING_ORDER } from "./sessionMeta";
import { SessionTrainControl } from "./SessionTrainControl";
import { LootOddsBox } from "./LootOddsBox";
import { cumulative } from "@/utils/trainingOdds";
import { boosterAffectsStat, pctLabel } from "../shop/shopConstants";
import { t } from "@/lib/i18n";

const INJURY_P = 0.03;

// Sparring spreads its xpBase budget EVENLY across every stat it trains
// (backend: xp = xpBase * ... / stats.length). So the honest per-session
// figure is xpBase/statCount — sparring's 12 is ~1.5 to each of 8 stats,
// NOT 12 each. We show per-stat, and label the breadth separately.
function perStatXp(m) {
    const count = (m.stats && m.stats.length) || 1;
    const v = m.xpBase / count;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
function perStatFillPct(m) {
    const count = (m.stats && m.stats.length) || 1;
    return Math.min(100, Math.round((m.xpBase / count / 6) * 100));
}
function coverageLabel(stats) {
    if (!stats || stats.length === 0) return "";
    if (stats.length >= 6) return t("gym.sparringRing.trainsAll", { n: stats.length });
    return t("gym.sparringRing.trainsStats", { stats: stats.join(" · ") });
}

/** Full-width gold line under the meters — the drop is qualitative (no bar/number). */
function DropNote() {
    return (
        <div className="rcard-drop-note">
            <Sparkles size={10} /> {t("gym.sparringRing.dropNote")}
        </div>
    );
}

/**
 * One featured Ring card. Always shows the same body (coverage + XP/injury
 * meters + drop note). If `disabledReason` is set, the train control is
 * replaced by a compact status footer instead of stripping the card down.
 */
function RingCard({ sessionKey, m, energy, cardMax, busy, onTrain, flash, activeBooster, disabledReason, disabledIcon }) {
    const [n, setN] = useState(1);
    const injuryPct = Math.round(cumulative(INJURY_P, n) * 100);
    const boostedHere = !!activeBooster && (m.stats || []).some((s) => boosterAffectsStat(activeBooster, s));
    const disabled = !!disabledReason;

    return (
        <div className={`rcard${sessionKey === "sparring" && !disabled ? " hot" : ""}${disabled ? " rcard--dimmed" : ""}${flash ? " session-card--flash" : ""}`}>
            <div className="rcard-top">
                <span className="rcard-name">{m.label}</span>
                <span className="rcard-cost"><Zap size={11} /> {m.cost}E</span>
            </div>
            <div className="rcard-coverage">
                {coverageLabel(m.stats)}
                {boostedHere && (
                    <span className="rcard-coverage-boost" title={`${activeBooster.name}: +${pctLabel(activeBooster.pct)}% XP`}>
                        <TrendingUp size={9} /> {t("gym.floor.boosterBadge", { pct: pctLabel(activeBooster.pct), name: activeBooster.name })}
                    </span>
                )}
            </div>
            <div className="rmeters">
                <div className="rmeter">
                    <i>{t("gym.sparringRing.xpPerStatLabel")}</i>
                    <div className="rtrack"><div className="rfill f-xp" style={{ width: `${perStatFillPct(m)}%` }} /></div>
                    <b>~{perStatXp(m)}</b>
                </div>
                <div className="rmeter">
                    <i>{t("gym.sparringRing.injuryLabel")}</i>
                    <div className="rtrack"><div className="rfill f-inj" style={{ width: `${injuryPct}%` }} /></div>
                    <b className="rc-inj">~{injuryPct}%</b>
                </div>
            </div>
            <DropNote />
            {disabled ? (
                <div className="rcard-status">{disabledIcon} {disabledReason}</div>
            ) : (
                <SessionTrainControl
                    sessionKey={sessionKey}
                    cost={m.cost}
                    energy={energy}
                    cardMax={cardMax}
                    busy={busy}
                    onTrain={onTrain}
                    onNChange={setN}
                />
            )}
        </div>
    );
}

/** Dimmed variant — rank2-locked-here, or not taught at this gym at all. */
function DimmedRingCard({ m, lockLabel, footerText }) {
    return (
        <div className="rcard rcard--dimmed">
            <div className="rcard-top">
                <span className="rcard-name">{m.label}</span>
                <span className="rcard-lock"><Lock size={9} /> {lockLabel}</span>
            </div>
            <div className="rcard-coverage">{coverageLabel(m.stats)}</div>
            <div className="rmeters">
                <div className="rmeter">
                    <i>{t("gym.sparringRing.xpPerStatLabel")}</i>
                    <div className="rtrack"><div className="rfill f-xp" style={{ width: `${perStatFillPct(m)}%` }} /></div>
                    <b>~{perStatXp(m)}</b>
                </div>
            </div>
            <DropNote />
            <div className="rcard-live rcard-live--footer">{footerText}</div>
        </div>
    );
}

/**
 * Gold-framed featured section — the three sparring-family sessions, always
 * shown (dimmed if not taught here), with live XP/injury/move-drop meters.
 */
export function SparringRing({
    gym,
    energy,
    canTrain,
    injuryLocked,
    rank2SessionKey,
    rank2Unlocked,
    findGymForSession,
    training,
    onTrain,
    flashSessionKey,
    dropRarityWeights,
    isFreeGym,
    activeBooster,
}) {
    const taughtCount = SPARRING_ORDER.filter((k) => gym.sessions?.includes(k) || k === rank2SessionKey).length;

    return (
        <div className="ring">
            <div className="ring-head">
                <span className="ring-title"><Sparkles size={14} /> {t("gym.sparringRing.title")}</span>
                <span className="ring-sub">
                    {taughtCount <= 1 ? t("gym.sparringRing.subtitleLimited") : t("gym.sparringRing.subtitleFull")}
                </span>
            </div>

            <LootOddsBox dropRarityWeights={dropRarityWeights} isFreeGym={isFreeGym} />

            <div className="ring-cards">
                {SPARRING_ORDER.map((key) => {
                    const m = SESSION_META[key];
                    if (!m) return null;
                    const isRank2Key = key === rank2SessionKey;
                    const taughtHere = !!gym.sessions?.includes(key) || isRank2Key;
                    const flash = flashSessionKey === key;

                    if (!taughtHere) {
                        const elsewhere = findGymForSession(key);
                        const footerText = elsewhere
                            ? (elsewhere.rank2
                                ? t("gym.sparringRing.taughtAtRank2", { gymName: elsewhere.name })
                                : t("gym.sparringRing.taughtAt", { gymName: elsewhere.name }))
                            : t("gym.sparringRing.specialtyGymsOnly");
                        return (
                            <DimmedRingCard
                                key={key}
                                sessionKey={key}
                                m={m}
                                lockLabel={t("gym.sparringRing.otherGym")}
                                footerText={footerText}
                            />
                        );
                    }

                    const isRank2Locked = isRank2Key && !rank2Unlocked;
                    if (isRank2Locked) {
                        return (
                            <DimmedRingCard
                                key={key}
                                sessionKey={key}
                                m={m}
                                lockLabel={t("gym.sessions.rank2Locked")}
                                footerText={t("gym.sparringRing.unlocksHereRank2")}
                            />
                        );
                    }

                    const isLocked = (m.stats || []).some((s) => injuryLocked.has(s));
                    const notEnoughEnergy = energy < m.cost;
                    const cardMax = Math.min(Math.floor(energy / m.cost), 25);

                    // Disabled variants keep the full card body; only the train
                    // control is swapped for a compact status footer.
                    let disabledReason = null;
                    let disabledIcon = null;
                    if (!canTrain) {
                        disabledReason = t("gym.sessions.joinToTrain");
                    } else if (isLocked) {
                        disabledReason = t("gym.sessions.injuryLocked");
                        disabledIcon = <AlertTriangle size={11} />;
                    } else if (notEnoughEnergy) {
                        disabledReason = t("gym.sessions.needEnergy", { cost: m.cost });
                        disabledIcon = <Zap size={11} />;
                    }

                    return (
                        <RingCard
                            key={key}
                            sessionKey={key}
                            m={m}
                            energy={energy}
                            cardMax={cardMax}
                            busy={!!training}
                            onTrain={onTrain}
                            flash={flash}
                            activeBooster={activeBooster}
                            disabledReason={disabledReason}
                            disabledIcon={disabledIcon}
                        />
                    );
                })}
            </div>
        </div>
    );
}
