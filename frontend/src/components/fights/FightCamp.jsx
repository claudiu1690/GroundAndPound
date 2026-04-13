import { memo, useCallback, useState } from "react";
import {
    CAMP_SESSIONS,
    CAMP_SESSION_KEYS,
    getRatingConfig,
    MATCH_STATUS_LABELS,
    MATCH_STATUS_COLORS,
} from "../../constants/campConfig";
import { CampInjury } from "./CampInjury";

function SlotGrid({ maxSlots, slotsUsed, canRemove, onRemove }) {
    return (
        <div className="camp-slot-grid">
            {Array.from({ length: maxSlots }, (_, i) => {
                const filled = i < slotsUsed;
                const clickable = filled && canRemove;
                return (
                    <div
                        key={i}
                        className={`camp-slot-dot ${filled ? "camp-slot-filled" : "camp-slot-empty"} ${clickable ? "camp-slot-removable" : ""}`}
                        title={clickable ? `Click to remove session ${i + 1}` : filled ? `Slot ${i + 1} used` : `Slot ${i + 1} available`}
                        onClick={clickable ? () => onRemove(i) : undefined}
                    />
                );
            })}
        </div>
    );
}

function RatingBadge({ grade }) {
    if (!grade) return null;
    const cfg = getRatingConfig(grade);
    return (
        <div className="camp-rating-badge" style={{ borderColor: cfg.color, color: cfg.color }}>
            <span className="camp-rating-grade">{grade}</span>
        </div>
    );
}

function SessionCard({ sessionKey, energyAvailable, isInjuredPending, onAddSession, loading }) {
    const session = CAMP_SESSIONS[sessionKey];
    if (!session) return null;

    const notEnoughEnergy = (energyAvailable ?? 0) < session.energy;
    const blocked = notEnoughEnergy || isInjuredPending || loading;

    let tooltip = "";
    if (isInjuredPending) tooltip = "Resolve camp injury first";
    else if (notEnoughEnergy) tooltip = `Need ${session.energy}E (have ${energyAvailable ?? 0}E)`;

    return (
        <div className={`camp-session-card ${blocked ? "camp-session-disabled" : ""}`}>
            <div className="camp-session-header">
                <span className="camp-session-name">{session.label}</span>
                <span className="camp-session-energy">{session.energy}E</span>
            </div>
            <div className="camp-session-effect">{session.effectLabel}</div>
            <div className="camp-session-footer">
                <span className="camp-session-hint">{session.recommendedAgainst}</span>
                {session.injuryRisk && (
                    <span className="camp-session-risk">{"\u26A0"} Injury risk</span>
                )}
            </div>
            <button
                className="btn btn-secondary btn-sm camp-session-btn"
                disabled={blocked}
                title={tooltip || undefined}
                onClick={() => !blocked && onAddSession(sessionKey)}
            >
                {loading ? "Adding\u2026" : "Add to camp"}
            </button>
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
    } = campState;

    const isInjuredPending = isInjured && !injuryChoice;
    const isFinalised = !!finalisedAt;
    const displayGrade = isFinalised ? campRating : null;
    const canFinalise = !isFinalised && !isInjuredPending;
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
        <section className={`panel fight-camp${isTitleFight ? " fight-camp--title" : ""}`}>
            <div className="camp-v2-header">
                <div className="camp-v2-header-left">
                    <h2 className="panel-title">{isTitleFight ? "Title Fight Camp" : "Fight Camp"}</h2>
                    {campReport && (
                        <button className="btn btn-ghost btn-sm camp-view-report" onClick={onViewReport}>
                            View Report
                        </button>
                    )}
                </div>
                <div className="camp-v2-header-right">
                    {(displayGrade || slotsUsed > 0) && (
                        <RatingBadge grade={displayGrade} />
                    )}
                </div>
            </div>

            <div className="panel-body">
                <div className="camp-slots-row">
                    <SlotGrid maxSlots={maxSlots} slotsUsed={slotsUsed} canRemove={!isFinalised && !isInjuredPending} onRemove={onRemoveSession} />
                    <span className="camp-slots-label">
                        {slotsUsed}/{maxSlots} slots used
                        {slotsRemaining > 0 && !isFinalised && (
                            <span className="camp-slots-remaining"> &middot; {slotsRemaining} remaining</span>
                        )}
                    </span>
                    <span className="camp-energy-badge">{energyAvailable}E available</span>
                </div>

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
                        {"\u26A0"} Pushing through injury — fight penalties active:{" "}
                        {Object.entries(injuryPenalty)
                            .map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`)
                            .join(", ")}
                    </div>
                )}

                {!isFinalised && !isInjuredPending && slotsRemaining > 0 && (
                    <div className="camp-sessions-grid">
                        {CAMP_SESSION_KEYS.map((key) => (
                            <SessionCard
                                key={key}
                                sessionKey={key}
                                energyAvailable={energyAvailable}
                                isInjuredPending={isInjuredPending}
                                onAddSession={onAddSession}
                                loading={addingSession === key}
                            />
                        ))}
                    </div>
                )}

                {sessions.length > 0 && (
                    <div className="camp-sessions-taken">
                        <div className="camp-sessions-taken-title">Sessions logged</div>
                        {sessions.map((s, i) => {
                            const cfg = CAMP_SESSIONS[s.sessionType];
                            const statusColor = MATCH_STATUS_COLORS[s.matchStatus] ?? "#94a3b8";
                            return (
                                <div key={i} className="camp-session-row" style={{ borderLeftColor: statusColor }}>
                                    <span className="csr-name">{cfg?.label ?? s.sessionType}</span>
                                    <span className="csr-status" style={{ color: statusColor }}>
                                        {MATCH_STATUS_LABELS[s.matchStatus] ?? s.matchStatus}
                                        {s.diminishingFactor < 1 && (
                                            <span className="csr-dr"> &middot; repeat &times;{s.diminishingFactor}</span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!isFinalised && (
                    <div className="camp-v2-actions">
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
                                        {finalising ? "Finalising\u2026" : "Yes, finalise empty"}
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
                            <button
                                className="btn btn-primary"
                                onClick={handleFinaliseClick}
                                disabled={!canFinalise || finalising}
                            >
                                {finalising ? "Finalising\u2026" : "Finalise Camp"}
                            </button>
                        )}
                    </div>
                )}

                {isFinalised && (
                    <div className="camp-finalised-notice">
                        Camp finalised — camp summary shown before fight.
                    </div>
                )}
            </div>
        </section>
    );
});
