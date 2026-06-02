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
    // ── STEP 1 — Fighter Profile Introduction ────────────────
    profile_intro: {
        next: "gym_intro",
        phases: [
            // One phase, five tooltips — each carries its own `focus`, so the
            // scrim cut-out walks down the sidebar profile panel section by
            // section as the player taps through.
            {
                focus: "fighter-profile",
                advance: { type: "tooltipButton", label: "Got it" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        focus: "profile-energy",
                        anchor: "profile-energy",
                        title: "Your Energy",
                        body: "Energy is your daily fuel — training sessions and fights both spend it, and it refills over time. When this bar runs low, rest before you push on.",
                    },
                    {
                        focus: "profile-health",
                        anchor: "profile-health",
                        title: "Your Health",
                        body: "Health is how much punishment you're carrying. Fights drain it and it slowly regenerates between them. Stepping into the cage hurt makes you fight worse and get injured more easily.",
                    },
                    {
                        focus: "profile-resources",
                        anchor: "profile-resources",
                        title: "Cash & Fame",
                        body: "Cash is your money — earned from fights, spent on gyms, healing and more. Fame is your reputation in the division; it grows as you win and perform.",
                    },
                    {
                        focus: "profile-career",
                        anchor: "profile-career",
                        title: "Your Career",
                        body: "Your rank shows where you stand in your weight class. Win fights to climb — break into the top 5 and a title shot comes into reach.",
                    },
                    {
                        focus: "profile-stats",
                        anchor: "profile-stats",
                        title: "Your Stats",
                        body: "These eight stats define your fighter. Training raises them, and together they set your overall rating (OVR) — the single number that sums up how good you are.",
                    },
                ],
            },
        ],
    },

    // ── STEP 2 — Gym Introduction ────────────────────────────
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

    // ── STEP 3 — First Training Session ──────────────────────
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
                        body: "You're training at the common gym. As you earn cash from fights you can upgrade to better gyms with stronger training bonuses and perks.",
                    },
                ],
            },
        ],
    },

    // ── STEP 4 — Fight Offer ─────────────────────────────────
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

    // ── STEP 5 — Fight Camp ──────────────────────────────────
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
            // Tooltips 4b–4d fire in sequence, then the whole camp panel stays
            // open and interactive so the player can pick sessions AND finalise.
            {
                focus: ["camp-summary", "fight-camp"],
                advance: { type: "event", name: "camp_finalised" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: ["camp-sessions", "fight-camp"],
                        title: "Prepare for the Fight",
                        body: "Choose your camp sessions based on what you learned from the Fighter Report. Pick sessions that counter your opponent's style. The better your preparation, the better your bonuses during the fight.",
                    },
                    {
                        anchor: ["camp-sessions", "fight-camp"],
                        title: "Your Wildcard",
                        body: "Every fighter has a wildcard — a hidden ace that can fire during the fight under the right conditions. You can't control when it fires, but it can turn the tide.",
                    },
                    {
                        anchor: ["camp-finalise", "fight-camp", "camp-summary"],
                        title: "You're Ready",
                        body: "Pick the camp sessions you want, then finalise camp. One last call waits before the cage.",
                    },
                ],
            },
            // Pre-fight camp summary — explains the weight cut strategy choice.
            {
                focus: "camp-summary",
                advance: { type: "event", name: "fight_resolved" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: ["weight-cut", "camp-summary"],
                        title: "Weight Cut Strategy",
                        body: "One last call before the cage. Cutting weight makes you bigger on fight night but gambles your stamina — Easy is safe, Aggressive swings hardest. Pick a strategy, then hit Begin Fight. The simulation runs instantly — everything you prepared fires automatically.",
                    },
                ],
            },
        ],
    },

    // ── STEP 6 — Fight Result & Fame ─────────────────────────
    fight_result: {
        next: "rankings_intro",
        phases: [
            {
                focus: "result",
                advance: { type: "tooltipButton", label: "Got it" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "result-iron",
                        title: "Cash — Your Currency",
                        body: "Cash is the currency of your career. You earn it from every fight. Use it to upgrade your gym, manage sponsorships, and eventually call out opponents. The better you perform, the more you earn.",
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
            {
                focus: "post-fight-interview",
                advance: { type: "event", name: "interview_done" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "post-fight-interview",
                        title: "Press Time",
                        body: "The media catches you after every fight. Your tone earns fame — and can plant a flag on a rival. Humble shows respect, Confident plays it safe, Trash Talk starts beef for a bigger payday. Pick a tone, or skip it.",
                    },
                ],
            },
            {
                focus: "result-continue",
                advance: { type: "event", name: "result_dismissed" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "result-continue",
                        title: "Onto the Next",
                        body: "That's your first pro fight on the record. Tap Continue when you're ready to move on.",
                    },
                ],
            },
        ],
    },

    // ── STEP 7 — Rankings Introduction ───────────────────────
    rankings_intro: {
        next: "events_intro",
        phases: [
            {
                focus: "nav-rankings",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: "nav-rankings",
                        title: "The Rankings",
                        body: "Time to see where you stand. Every fighter in your division sits on a ranked ladder — climbing it is your path to a title. Tap the Rankings tab.",
                    },
                ],
            },
            {
                focus: "rankings-tab",
                advance: { type: "tooltipButton", label: "Continue" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: ["rankings-table", "rankings-tab"],
                        title: "Your Standing",
                        body: "This is your weight class leaderboard. After three fights in a tier you earn a rank; win to climb it. Reach the top 5 to enter the title shot zone — beat the champion and you move up a tier.",
                    },
                ],
            },
        ],
    },

    // ── STEP 8 — Events Introduction ─────────────────────────
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
                        body: "Events are weekly NPC fight cards. You can't fight on them — but you can bet cash on the outcomes. Tap the Events tab.",
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
                        title: "Place a Bet",
                        body: "Click any fight to open the betting slip. You pick a side, optionally a method, and a stake amount. The card resolves automatically after 7 days — winning bets pay out at the locked odds straight to your cash balance.",
                    },
                    {
                        anchor: "event-headliner",
                        title: "Two Bet Types",
                        body: "Winner bets are just on who wins — A, Draw, or B. Lower odds, lower risk. Exact bets are winner plus method (KO/TKO, Submission, Decision). Harder to hit, much bigger payout. The slip shows both options at the top.",
                    },
                    {
                        anchor: ["event-potential", "event-headliner"],
                        title: "Stake & Returns",
                        body: "Cash is debited the moment you place the bet, so spend within your means. Stake limits scale with your tier — Amateur caps out at $1,000 per fight, GCS at $10,000. Returns = stake × locked odds. There's a 15% house edge, so the long-run only pays off if you actually read the matchups.",
                    },
                ],
            },
        ],
    },

    // ── STEP 9 — Hospital Introduction ───────────────────────
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
                        body: "Hard fights can leave you injured. Injuries take time to heal and can affect specific stats until they clear. You can speed up recovery — but it costs cash. Sometimes rest is the right call.",
                    },
                    {
                        anchor: ["hospital-restore", "hospital-health"],
                        title: "Restoring Health",
                        body: "You can spend cash to restore health between fights. Don't show up to a title shot at 60%. Manage your health like you manage your training — it's part of the strategy.",
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
    "profile_intro",
    "gym_intro",
    "training_session",
    "fight_offer",
    "fight_camp",
    "fight_result",
    "rankings_intro",
    "events_intro",
    "hospital_intro",
    "complete",
];
