import { memo, useCallback, useState } from "react";
import { Zap } from "lucide-react";
import { t } from "@/lib/i18n";
import {
    CAMP_SESSIONS,
    CAMP_SESSION_KEYS,
    MATCH_STATUS_LABELS,
    MATCH_STATUS_COLORS,
} from "../../constants/campConfig";
import { CampInjury } from "./CampInjury";
import { CampSupplements } from "../shop/CampSupplements";

const CAMP_SESSION_COLOR = {
    TAKEDOWN_DEFENCE: "blue",
    SUBMISSION_ESCAPES: "purple",
    STRIKING_ACCURACY: "red",
    CARDIO_PUSH: "green",
    GAME_PLAN_STUDY: "teal",
    BODY_SHOT_FOCUS: "amber",
    CLINCH_CONTROL: "purple",
    GROUND_AND_POUND_POSTURE: "red",
    SPARRING_GENERAL: "amber",
};

function CampSlotDots({ maxSlots, slotsUsed, canRemove, onRemove }) {
    return (
        <div className="camp-slot-indicators">
            {Array.from({ length: maxSlots }, (_, i) => {
                const filled = i < slotsUsed;
                const clickable = filled && canRemove;
                return (
                    <div
                        key={i}
                        className={`camp-slot-dot ${filled ? "camp-slot-filled" : ""} ${clickable ? "camp-slot-removable" : ""}`}
                        title={clickable ? `Click to remove session ${i + 1}` : filled ? `Slot ${i + 1} used` : `Slot ${i + 1} available`}
                        onClick={clickable ? () => onRemove(i) : undefined}
                    />
                );
            })}
        </div>
    );
}

function CampSessionCard({ sessionKey, energyAvailable, isInjuredPending, alreadyLogged, onAddSession, loading }) {
    const session = CAMP_SESSIONS[sessionKey];
    if (!session) return null;
    const color = CAMP_SESSION_COLOR[sessionKey] ?? "blue";
    const notEnoughEnergy = (energyAvailable ?? 0) < session.energy;
    const blocked = notEnoughEnergy || isInjuredPending || loading;

    let tooltip = "";
    if (isInjuredPending) tooltip = t("fights.camp.sessionResolveInjury");
    else if (notEnoughEnergy) tooltip = t("fights.camp.sessionNeedEnergy", { need: session.energy, have: energyAvailable ?? 0 });

    return (
        <div className={`camp-session-card${blocked ? " camp-session-card--disabled" : ""}`}>
            <div className={`camp-session-stripe camp-stripe-${color}`} />
            <div className="camp-session-body">
                <div className="camp-session-top">
                    <span className="camp-session-name">{session.label}</span>
                    <span className="camp-session-energy"><Zap size={11} /> {session.energy}E</span>
                </div>
                <div className={`camp-session-effect camp-effect-${color}`}>{session.effectLabel}</div>
                <div className="camp-session-targets">{session.recommendedAgainst}</div>
                {session.injuryRisk && <div className="camp-session-risk">{t("fights.camp.sessionInjuryRisk")}</div>}
                {alreadyLogged && <span className="camp-session-added">{t("fights.camp.sessionAdded")}</span>}
                <button
                    type="button"
                    className="camp-add-btn"
                    disabled={blocked}
                    title={tooltip || undefined}
                    onClick={() => !blocked && onAddSession(sessionKey)}
                >
                    {loading ? t("fights.camp.sessionAdding") : t("fights.camp.sessionAddBtn")}
                </button>
            </div>
        </div>
    );
}

export const FightCamp = memo(function FightCamp({
    fighter,
    campState,
    campReport,
    onAddSession,
    onRemoveSession,
    onResolveInjury,
    onFinalise,
    onProceedToFight,
    onViewReport,
    addingSession,
    finalising,
    onMessage,
    onNavigateShop,
    onRefreshFighter,
    onSelectBuff,
}) {
    if (!fighter?.acceptedFightId || !campState) return null;

    const {
        maxSlots = 0,
        slotsUsed = 0,
        slotsRemaining = 0,
        previewRating,
        campRating,
        isInjured,
        injuryChoice,
        injuryType,
        injuryPenalty,
        finalisedAt,
        sessions = [],
        isTitleFight = false,
        selectedBuffId = null,
    } = campState;

    const isInjuredPending = isInjured && !injuryChoice;
    const isFinalised = !!finalisedAt;
    const canFinalise = !isFinalised && !isInjuredPending;
    const canRemove = !isFinalised && !isInjuredPending;
    const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);

    const handleFinaliseClick = useCallback(() => {
        if (slotsUsed === 0) {
            setShowEmptyConfirm(true);
        } else {
            onFinalise();
        }
    }, [slotsUsed, onFinalise]);

    const energyAvailable = fighter.energy?.current ?? fighter.energy ?? 0;

    return (
        <div className={`fight-camp${isTitleFight ? " fight-camp--title" : ""}`} data-tut="fight-camp">
            <div className="camp-header">
                <button type="button" className="camp-tab camp-tab--active">
                    {isTitleFight ? t("fights.camp.titleFightTab") : t("fights.camp.regularTab")}
                </button>
                {campReport && (
                    <button type="button" className="camp-tab" onClick={onViewReport}>
                        {t("fights.camp.viewReport")}
                    </button>
                )}
            </div>

            <div className="camp-status">
                <CampSlotDots maxSlots={maxSlots} slotsUsed={slotsUsed} canRemove={canRemove} onRemove={onRemoveSession} />
                <span className="camp-slot-text">
                    <strong>{t("fights.camp.slotsUsed", { used: slotsUsed, max: maxSlots })}</strong>
                    {slotsRemaining > 0 && !isFinalised ? <> &middot; <strong>{slotsRemaining}</strong> {t("fights.camp.slotsRemaining", { n: slotsRemaining })}</> : null}
                </span>
                <span className="camp-energy-pill">
                    <span className="lbl">{t("fights.camp.energy")}</span>
                    <Zap size={13} /> {energyAvailable}
                </span>
            </div>

            <div className="camp-sessions-area">
                {isInjuredPending && (
                    <CampInjury
                        injuryType={injuryType}
                        slotsRemaining={slotsRemaining}
                        previewRating={previewRating}
                        onStop={() => onResolveInjury("STOP")}
                        onPushThrough={() => onResolveInjury("PUSH_THROUGH")}
                    />
                )}

                {injuryChoice === "PUSH_THROUGH" && injuryPenalty && (
                    <div className="camp-injury-pushed">
                        {t("fights.camp.injuryPushed", { penalties: Object.entries(injuryPenalty).map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`).join(", ") })}
                    </div>
                )}

                {!isFinalised && !isInjuredPending && slotsRemaining > 0 && (
                    <div className="camp-sessions-grid" data-tut="camp-sessions">
                        {CAMP_SESSION_KEYS.map((key) => (
                            <CampSessionCard
                                key={key}
                                sessionKey={key}
                                energyAvailable={energyAvailable}
                                isInjuredPending={isInjuredPending}
                                alreadyLogged={sessions.some((s) => s.sessionType === key)}
                                onAddSession={onAddSession}
                                loading={addingSession === key}
                            />
                        ))}
                    </div>
                )}

                <div className="camp-logged-section">
                    <div className="camp-logged-label">{t("fights.camp.campLoggedLabel")}</div>
                    {!isFinalised && (
                        <div className="camp-logged-hint">
                            {t("fights.camp.campLoggedHint")}
                        </div>
                    )}
                    <div className="camp-logged-slots">
                        {Array.from({ length: maxSlots }, (_, i) => {
                            const s = sessions[i];
                            if (!s) {
                                return (
                                    <div key={i} className="camp-logged-slot camp-empty-slot">
                                        {t("fights.camp.emptySlot")}
                                    </div>
                                );
                            }
                            const cfg = CAMP_SESSIONS[s.sessionType];
                            const statusColor = MATCH_STATUS_COLORS[s.matchStatus] ?? "#94a3b8";
                            return (
                                <div key={i} className="camp-logged-slot">
                                    <span className="camp-logged-slot-num">{i + 1}</span>
                                    <span className="camp-logged-slot-name">{cfg?.label ?? s.sessionType}</span>
                                    {s.diminishingFactor < 1 && (
                                        <span className="camp-logged-repeat">repeat &times;{s.diminishingFactor}</span>
                                    )}
                                    {/* Match outcome is hidden while building — revealed only in the
                                        finalise summary so the camp can't be probed. */}
                                    {s.matchStatus ? (
                                        <span className="camp-matched-badge" style={{ color: statusColor }}>
                                            {MATCH_STATUS_LABELS[s.matchStatus] ?? s.matchStatus}
                                        </span>
                                    ) : (
                                        <span className="camp-matched-badge camp-matched-badge--pending">{t("fights.camp.logged")}</span>
                                    )}
                                    {canRemove && (
                                        <button
                                            type="button"
                                            className="camp-logged-remove"
                                            title={t("fights.camp.removeSession")}
                                            onClick={() => onRemoveSession(i)}
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <CampSupplements
                    fighter={fighter}
                    fightId={fighter.acceptedFightId}
                    selectedBuffId={selectedBuffId}
                    onSelected={onSelectBuff}
                    onNavigateShop={onNavigateShop}
                    onMessage={onMessage}
                    disabled={isFinalised || isInjuredPending}
                />

                {!isFinalised && (
                    <div className="camp-finalise-row" data-tut="camp-finalise">
                        {showEmptyConfirm ? (
                            <div className="camp-empty-confirm">
                                <span className="camp-empty-confirm-msg">
                                    {t("fights.camp.emptyConfirmMsg")}
                                </span>
                                <div className="camp-empty-confirm-btns">
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => { setShowEmptyConfirm(false); onFinalise(); }}
                                        disabled={finalising}
                                    >
                                        {finalising ? t("fights.camp.finalising") : t("fights.camp.emptyFinalise")}
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowEmptyConfirm(false)}
                                    >
                                        {t("common.cancel")}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="camp-finalise-btn"
                                    onClick={handleFinaliseClick}
                                    disabled={!canFinalise || finalising}
                                >
                                    {finalising ? t("fights.camp.finalising") : t("fights.camp.finalise")}
                                </button>
                                {slotsRemaining > 0 && (
                                    <span className="camp-finalise-hint">
                                        {t("fights.camp.addMoreHint", { n: slotsRemaining, plural: slotsRemaining !== 1 ? "s" : "" })}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                )}

                {isFinalised && (
                    <div className="camp-finalised-notice">
                        <span>{t("fights.camp.finalisedNotice")}</span>
                        {onProceedToFight && (
                            <button
                                type="button"
                                className="camp-finalise-btn"
                                onClick={onProceedToFight}
                            >
                                {t("fights.camp.proceedToFight")}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});
