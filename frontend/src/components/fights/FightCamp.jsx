import { memo, useCallback, useState } from "react";
import { Zap } from "lucide-react";
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
    if (isInjuredPending) tooltip = "Resolve camp injury first";
    else if (notEnoughEnergy) tooltip = `Need ${session.energy}E (have ${energyAvailable ?? 0}E)`;

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
                {session.injuryRisk && <div className="camp-session-risk">{"⚠"} Injury risk</div>}
                {alreadyLogged && <span className="camp-session-added">{"✓"} Added</span>}
                <button
                    type="button"
                    className="camp-add-btn"
                    disabled={blocked}
                    title={tooltip || undefined}
                    onClick={() => !blocked && onAddSession(sessionKey)}
                >
                    {loading ? "Adding…" : "Add to Camp"}
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
                    {isTitleFight ? "Title Fight Camp" : "Fight Camp"}
                </button>
                {campReport && (
                    <button type="button" className="camp-tab" onClick={onViewReport}>
                        View Report
                    </button>
                )}
            </div>

            <div className="camp-status">
                <CampSlotDots maxSlots={maxSlots} slotsUsed={slotsUsed} canRemove={canRemove} onRemove={onRemoveSession} />
                <span className="camp-slot-text">
                    <strong>{slotsUsed}/{maxSlots}</strong> slots used
                    {slotsRemaining > 0 && !isFinalised ? <> &middot; <strong>{slotsRemaining}</strong> remaining</> : null}
                </span>
                <span className="camp-energy-pill">
                    <span className="lbl">Energy</span>
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
                        {"⚠"} Pushing through injury — fight penalties active:{" "}
                        {Object.entries(injuryPenalty)
                            .map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`)
                            .join(", ")}
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
                    <div className="camp-logged-label">Sessions Logged</div>
                    <div className="camp-logged-slots">
                        {Array.from({ length: maxSlots }, (_, i) => {
                            const s = sessions[i];
                            if (!s) {
                                return (
                                    <div key={i} className="camp-logged-slot camp-empty-slot">
                                        Empty — add a session above
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
                                    <span className="camp-matched-badge" style={{ color: statusColor }}>
                                        {MATCH_STATUS_LABELS[s.matchStatus] ?? s.matchStatus}
                                    </span>
                                    {canRemove && (
                                        <button
                                            type="button"
                                            className="camp-logged-remove"
                                            title="Remove this session"
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
                                    Are you sure you want to finalise camp without any sessions?
                                </span>
                                <div className="camp-empty-confirm-btns">
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={() => { setShowEmptyConfirm(false); onFinalise(); }}
                                        disabled={finalising}
                                    >
                                        {finalising ? "Finalising…" : "Yes, finalise empty"}
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowEmptyConfirm(false)}
                                    >
                                        Cancel
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
                                    {finalising ? "Finalising…" : "Finalise Camp"}
                                </button>
                                {slotsRemaining > 0 && (
                                    <span className="camp-finalise-hint">
                                        You can still add {slotsRemaining} more session{slotsRemaining !== 1 ? "s" : ""} before finalising
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                )}

                {isFinalised && (
                    <div className="camp-finalised-notice">
                        Camp finalised — camp summary shown before fight.
                    </div>
                )}
            </div>
        </div>
    );
});
