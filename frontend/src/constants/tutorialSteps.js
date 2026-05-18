/**
 * Onboarding tutorial — client-side step / phase / tooltip configuration.
 *
 * Each STEP corresponds to a server step id (see consts/tutorialConfig.js).
 * A step is made of one or more PHASES; each phase reveals one focal element
 * through the scrim and shows a sequence of tooltips before advancing.
 *
 * Phase shape:
 *   focus              data-tut id (or array — first present in the DOM wins)
 *                      of the element revealed through the scrim cut-out.
 *   focusAfterTooltips optional data-tut id the cut-out switches to once every
 *                      tooltip has been dismissed (used when the player must
 *                      act on a different element than the one being taught).
 *   tooltips           ordered tooltip cards. Non-final tooltips show "Got it";
 *                      the final tooltip's button is derived from `advance`.
 *   advance            how the phase completes:
 *                        { type: "clickFocus" }            — player clicks the focus element
 *                        { type: "event", name }           — tutorialBus event fires
 *                        { type: "tooltipButton", label }  — final tooltip button itself advances
 *   skipIfAbsent       if true, auto-advance the phase when the focus element
 *                      never appears (covers mid-step browser-refresh resume).
 *
 * Tooltip shape:
 *   anchor          data-tut id the tooltip card points at (defaults to focus).
 *   title, body     copy (verbatim from Onboarding Spec v1.0 section 4).
 *   variantSuffix   optional { win, loss } string appended to `body` based on
 *                   the player's last fight outcome.
 */

export const TUTORIAL_STEPS = {
    // ── STEP 1 — Gym Introduction ────────────────────────────
    gym_intro: {
        next: "training_session",
        phases: [
            {
                focus: "nav-gym",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: "nav-gym",
                        title: "Welcome to the Gym",
                        body: "This is where your career starts. Every day you have energy to spend on training sessions. The more you train, the stronger you get. Tap the Gym tab to begin.",
                    },
                ],
            },
        ],
    },

    // ── STEP 2 — First Training Session ──────────────────────
    training_session: {
        next: "fight_offer",
        phases: [
            {
                focus: "gym-sessions",
                advance: { type: "event", name: "training_complete" },
                tooltips: [
                    {
                        anchor: "energy",
                        title: "Your Energy",
                        body: "Energy is your daily resource. Each training session costs energy. It refills every day. Spend it wisely — you can't train if you're out of energy.",
                    },
                    {
                        anchor: "gym-sessions",
                        title: "Choose What to Train",
                        body: "Each session improves a specific stat — striking, grappling, footwork, and more. Your overall rating (OVR) is a reflection of all your stats combined. Higher OVR, better fighter.",
                    },
                    {
                        anchor: "gym-info",
                        title: "Your Gym",
                        body: "You're training at the common gym. As you earn iron from fights you can upgrade to better gyms with stronger training bonuses and perks.",
                    },
                ],
            },
        ],
    },

    // ── STEP 3 — Fight Offer ─────────────────────────────────
    fight_offer: {
        next: "fight_camp",
        phases: [
            {
                focus: "nav-fights",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: "nav-fights",
                        title: "Time to Fight",
                        body: "Fight offers appear here. Promoters want to book you — your job is to pick the right fights and climb the rankings. Tap the Fight tab.",
                    },
                ],
            },
            {
                focus: "request-offers",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: "request-offers",
                        title: "See Who Wants You",
                        body: "Promoters are lining up to book you. Tap Request Offers to see the fights on the table.",
                    },
                ],
            },
            {
                focus: "offer-card",
                advance: { type: "event", name: "fight_accepted" },
                tooltips: [
                    {
                        anchor: "offer-card",
                        title: "Reading a Fight Offer",
                        body: "Each offer shows your opponent's OVR (overall rating), their fighting style, and their record. OVR is the most important number — it tells you how tough this fight will be relative to your own rating.",
                    },
                    {
                        anchor: "offer-accept",
                        title: "Accept the Fight",
                        body: "When you accept a fight, you enter Fight Camp — a preparation phase where you study your opponent and choose your training sessions. Accept this offer to continue.",
                    },
                ],
            },
        ],
    },

    // ── STEP 4 — Fight Camp ──────────────────────────────────
    fight_camp: {
        next: "fight_result",
        phases: [
            {
                focus: "fighter-report",
                advance: { type: "event", name: "fighter_report_closed" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "fighter-report",
                        title: "Know Your Opponent",
                        body: "This is your Fighter Report — intel on your opponent's strengths and weaknesses. Study it carefully. It tells you what style they favour and where they're vulnerable.",
                    },
                ],
            },
            {
                focus: "camp-sessions",
                advance: { type: "tooltipButton", label: "Got it" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "camp-sessions",
                        title: "Prepare for the Fight",
                        body: "Choose your camp sessions based on what you learned from the Fighter Report. Pick sessions that counter your opponent's style. The better your preparation, the better your bonuses during the fight.",
                    },
                ],
            },
            {
                focus: "camp-sessions",
                advance: { type: "tooltipButton", label: "Got it" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "camp-sessions",
                        title: "Your Wildcard",
                        body: "Every fighter has a wildcard — a hidden ace that can fire during the fight under the right conditions. You can't control when it fires, but it can turn the tide.",
                    },
                ],
            },
            {
                focus: ["camp-summary", "camp-finalise"],
                advance: { type: "event", name: "fight_resolved" },
                tooltips: [
                    {
                        anchor: ["camp-finalise", "camp-summary"],
                        title: "You're Ready",
                        body: "Camp is done. The fight simulation runs instantly — no decisions to make inside the cage. Everything you've prepared fires automatically. Trust your camp and hit Fight.",
                    },
                ],
            },
        ],
    },

    // ── STEP 5 — Fight Result & Fame ─────────────────────────
    fight_result: {
        next: "events_intro",
        phases: [
            {
                focus: "result",
                focusAfterTooltips: "result-continue",
                advance: { type: "event", name: "result_dismissed" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "result-iron",
                        title: "Iron — Your Currency",
                        body: "Iron is the currency of your career. You earn it from every fight. Use it to upgrade your gym, manage sponsorships, and eventually call out opponents. The better you perform, the more you earn.",
                    },
                    {
                        anchor: "result-fame",
                        title: "Fame Matters",
                        body: "Every fight earns you notoriety — your fame in the division. Notoriety determines your standing in the scene, unlocks callouts, and attracts sponsors. Win or lose, you're building a reputation",
                        variantSuffix: {
                            win: " — and a win always pays more.",
                            loss: " — even a loss puts you on the map. Get back in the gym.",
                        },
                    },
                ],
            },
        ],
    },

    // ── STEP 6 — Events Introduction ─────────────────────────
    events_intro: {
        next: "hospital_intro",
        phases: [
            {
                focus: "nav-events",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: "nav-events",
                        title: "The Big Stage",
                        body: "Events are major fight cards featuring NPC fighters competing at the highest level. You can't fight on these cards yet — but you can bet on them. Tap the Events tab.",
                    },
                ],
            },
            {
                focus: "event-headliner",
                advance: { type: "tooltipButton", label: "Continue" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "event-headliner",
                        title: "Place Your Bets",
                        body: "Study the fighters, check the odds, and place your iron on who you think wins. Get it right and you multiply your stake. Events run on a schedule — check back to see results.",
                    },
                    {
                        anchor: ["event-potential", "event-headliner"],
                        title: "Reading the Odds",
                        body: "The odds tell you how much you win per iron bet. Higher odds mean a bigger payout — but also means that fighter is less likely to win according to the market. Use your knowledge of styles and stats to find value.",
                    },
                ],
            },
        ],
    },

    // ── STEP 7 — Hospital Introduction ───────────────────────
    hospital_intro: {
        next: "complete",
        phases: [
            {
                focus: "nav-hospital",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: "nav-hospital",
                        title: "Your Health",
                        body: "Every fight takes a toll. The Hospital tracks your health and any injuries you're carrying. Tap the Hospital tab.",
                    },
                ],
            },
            {
                focus: "hospital-health",
                advance: { type: "tooltipButton", label: "Continue" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "hospital-health",
                        title: "Health Matters",
                        body: "Your health affects your performance in the cage. Fighting at low health increases your risk of injury and reduces your effectiveness. Keep an eye on this bar between fights.",
                    },
                    {
                        anchor: ["hospital-injuries", "hospital-health"],
                        title: "Injuries",
                        body: "Hard fights can leave you injured. Injuries take time to heal and can affect specific stats until they clear. You can speed up recovery — but it costs iron. Sometimes rest is the right call.",
                    },
                    {
                        anchor: ["hospital-restore", "hospital-health"],
                        title: "Restoring Health",
                        body: "You can spend iron to restore health between fights. Don't show up to a title shot at 60%. Manage your health like you manage your training — it's part of the strategy.",
                    },
                ],
            },
        ],
    },
};

/** Step 8 — completion modal content (Onboarding Spec v1.0 section 4, Step 8). */
export const TUTORIAL_COMPLETE = {
    headline: "YOU'RE READY.",
    subheadline: "The cage is waiting. The rankings are open. Your career starts now.",
    rewardLabel: "Signing Bonus",
    rewardIron: 500,
    body: "Train hard. Pick smart fights. Climb the rankings. Reach the top 5 and challenge for the title. Everything else you'll figure out along the way.",
    cta: "Enter the Game",
};

/** Ordered step ids — kept in sync with the server's STEP_ORDER. */
export const STEP_ORDER = [
    "gym_intro",
    "training_session",
    "fight_offer",
    "fight_camp",
    "fight_result",
    "events_intro",
    "hospital_intro",
    "complete",
];
