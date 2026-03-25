import { memo } from "react";
import { CAMP_SESSIONS, CAMP_SESSION_KEYS, getRatingConfig, modifierToGradeLabel } from "../constants/campConfig";
import { CampInjury } from "./CampInjury";

const MATCH_STATUS_CLASS = {
    matched:     "session-matched",
    not_a_match: "session-unmatched",
};

const MATCH_STATUS_LABEL = {
    matched:     "Recommended",
    not_a_match: "Not a match",
};

function SlotGrid({ maxSlots, slotsUsed }) {
    return (
        <div className="camp-slot-grid">
            {Array.from({ length: maxSlots }, (_, i) => (
                <div
                    key={i}
                    className={`camp-slot-dot ${i < slotsUsed ? "camp-slot-filled" : "camp-slot-empty"}`}
                    title={i < slotsUsed ? `Slot ${i + 1} used` : `Slot ${i + 1} available`}
                />
            ))}
        </div>
    );
}

function RatingBadge({ grade, modifier }) {
    if (!grade) return null;
    const cfg = getRatingConfig(grade);
    return (
        <div className="camp-rating-badge" style={{ borderColor: cfg.color, color: cfg.color }}>
            <span className="camp-rating-grade">{grade}</span>
            {modifier != null && (
                <span className="camp-rating-mod" style={{ color: modifier >= 0 ? "var(--green-bright)" : "var(--red-bright)" }}>
                    {modifierToGradeLabel(modifier)}
                </span>
            )}
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
                    <span className="camp-session-risk">⚠ Injury risk</span>
                )}
            </div>
            <button
                className="btn btn-secondary btn-sm camp-session-btn"
                disabled={blocked}
                title={tooltip || undefined}
                onClick={() => !blocked && onAddSession(sessionKey)}
            >
                {loading ? "Adding…" : "Add to camp"}
            </button>
        </div>
    );
}

export const FightCamp = memo(function FightCamp({
    fighter,
    campState,
    campReport,
    onAddSession,
    onResolveInjury,
    onFinalise,
    onSkip,
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
        campModifier,
        isInjured,
        injuryChoice,
        injuryType,
        injuryPenalty,
        finalisedAt,
        sessions = [],
    } = campState;

    const isInjuredPending = isInjured && !injuryChoice;
    const isFinalised = !!finalisedAt;
    const displayGrade = isFinalised ? campRating : previewRating?.grade;
    const displayModifier = isFinalised ? campModifier : previewRating?.campModifier;
    const canFinalise = !isFinalised && slotsUsed >= 1 && !isInjuredPending;
    const energyAvailable = fighter.energy?.current ?? fighter.energy ?? 0;

    return (
        <section className="panel fight-camp">
            <div className="camp-v2-header">
                <div className="camp-v2-header-left">
                    <h2 className="panel-title">Fight Camp</h2>
                    {campReport && (
                        <button className="btn btn-ghost btn-sm camp-view-report" onClick={onViewReport}>
                            View Report
                        </button>
                    )}
                </div>
                <div className="camp-v2-header-right">
                    {(displayGrade || slotsUsed > 0) && (
                        <RatingBadge grade={displayGrade} modifier={displayModifier} />
                    )}
                </div>
            </div>

            <div className="panel-body">
                <div className="camp-slots-row">
                    <SlotGrid maxSlots={maxSlots} slotsUsed={slotsUsed} />
                    <span className="camp-slots-label">
                        {slotsUsed}/{maxSlots} slots used
                        {slotsRemaining > 0 && !isFinalised && (
                            <span className="camp-slots-remaining"> · {slotsRemaining} remaining</span>
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
                        ⚠ Pushing through injury — fight penalties active:{" "}
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
                            return (
                                <div key={i} className={`camp-session-row ${MATCH_STATUS_CLASS[s.matchStatus] ?? ""}`}>
                                    <span className="csr-name">{cfg?.label ?? s.sessionType}</span>
                                    <span className="csr-status">
                                        {MATCH_STATUS_LABEL[s.matchStatus]}
                                        {s.diminishingFactor < 1 && (
                                            <span className="csr-dr"> · repeat ×{s.diminishingFactor}</span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!isFinalised && (
                    <div className="camp-v2-actions">
                        <button
                            className="btn btn-primary"
                            onClick={onFinalise}
                            disabled={!canFinalise || finalising}
                            title={!canFinalise ? "Add at least one session before finalising" : undefined}
                        >
                            {finalising ? "Finalising…" : "Finalise Camp"}
                        </button>
                        <button
                            className="btn btn-ghost camp-skip-btn"
                            onClick={onSkip}
                            disabled={finalising}
                        >
                            Fight Now (skip camp)
                        </button>
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
