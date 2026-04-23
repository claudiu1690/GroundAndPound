/**
 * Post-fight interview tones. Each fight generates exactly one interview opportunity,
 * resolved once per fight. Rewards are in fame (notoriety). Iron rewards and sponsor
 * clause side-effects come in later phases.
 *
 * CALLOUT requires a valid targetOpponentId in the same weight class and promotion tier
 * (or one tier above). Writes a Beef flag on the fighter.
 *
 * HUMBLE writes a Respect flag on the just-defeated opponent (if the fight was a win),
 * so you can cash that in later — ties into sponsor clauses that reward sportsmanship.
 *
 * SKIPPED is recorded so the flow can't be re-opened, but carries no reward or cost.
 */

const INTERVIEW_CHOICES = {
    HUMBLE: {
        key: "HUMBLE",
        label: "Humble",
        tagline: "Pay respect, take the high road.",
        fameReward: 100,
        emitRespectFlag: true,
        fameCode: "INTERVIEW",
        reasonTemplate: "Post-fight interview: respectful",
    },
    CONFIDENT: {
        key: "CONFIDENT",
        label: "Confident",
        tagline: "Take credit. Let the division hear you.",
        fameReward: 150,
        fameCode: "INTERVIEW",
        reasonTemplate: "Post-fight interview: confident",
    },
    CALLOUT: {
        key: "CALLOUT",
        label: "Trash Talk",
        tagline: "Name a rival on the mic. Put them on notice.",
        fameReward: 200,
        requiresTarget: true,
        emitBeefFlag: true,
        beefExpiresAfterFights: 4,
        fameCode: "INTERVIEW",
        reasonTemplate: "Trash talked: {name}",
    },
};

const INTERVIEW_CHOICE_KEYS = Object.keys(INTERVIEW_CHOICES);

/** Max roster size shown on the Call-Out picker (keeps UI tidy) */
const CALLOUT_CANDIDATE_LIMIT = 6;

/**
 * OVR window for post-fight interview callouts. We want only opponents the player
 * could realistically face through natural offer generation within the beef-flag
 * window — otherwise every callout becomes a guaranteed fame penalty at lapse.
 * Natural offers roll within ±5 OVR; we use ±6 to give a little drift slack.
 */
const CALLOUT_OVR_WINDOW = 6;

module.exports = {
    INTERVIEW_CHOICES,
    INTERVIEW_CHOICE_KEYS,
    CALLOUT_CANDIDATE_LIMIT,
    CALLOUT_OVR_WINDOW,
};
