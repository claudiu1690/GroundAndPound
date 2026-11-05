/**
 * First-session ("debut flow") tutorial: client-side step / phase / tooltip configuration.
 *
 * Four steps carry a new fighter to the bell: see the debut on Home, accept it, read the
 * Fighter Report, pick a camp and begin. Everything else is taught where it lives, by the
 * section tips (constants/sectionTips.js). Each STEP corresponds to a server step id (see
 * consts/tutorialConfig.js). A step is made of one or more PHASES; each phase rings one focal
 * element and shows a sequence of tooltips before advancing. Nothing is blocked: the player can
 * use the whole game while the tutorial runs.
 *
 * Phase shape:
 *   focus              data-tut id (or array, first present in the DOM wins) of the element
 *                      the highlight ring sits on.
 *   tab                screen id(s) the phase lives on (App's activeTab). On any other screen
 *                      the tutorial pauses and shows a bar with Back to tutorial / End tutorial.
 *   doneOnTab          for "go to X" phases: the phase completes as soon as the player is on
 *                      that screen, however they got there.
 *   tooltips           ordered tooltip cards. Non-final tooltips show "Got it"; the final
 *                      tooltip's button is derived from `advance`.
 *   advance            how the phase completes:
 *                        { type: "clickFocus" }            the player clicks the focus element
 *                        { type: "event", name }           a tutorialBus event fires
 *                        { type: "tooltipButton", label }  the final tooltip button advances
 *   skipIfAbsent       auto-advance the phase when the focus element never appears on its
 *                      screen (mid-step refresh resume, or the action was done out of order).
 *
 * Step shape:
 *   next               the following step id, or null for the last one.
 *   completeLocally    the last step: finishing it does not call the advance endpoint. The
 *                      server marks the tutorial complete when the first fight resolves, and the
 *                      refreshed fighter unmounts the overlay.
 *
 * Tooltip shape:
 *   anchor          data-tut id the tooltip card points at (defaults to focus).
 *   title, body     copy. "Tap" is swapped for "Click" on mouse devices by the overlay.
 *   bodyBottomNav   alternative body when the anchor is a button in the phone's bottom nav.
 *
 * Every anchor below exists on desktop AND on a portrait phone (the nav entries live in the
 * sidebar and in the bottom nav; the rest are inside screens shared by both layouts).
 */
import { t } from "../lib/i18n";

export const TUTORIAL_STEPS = {
    // ── 1. Home: the debut is booked ─────────────────────────
    debut_home: {
        next: "debut_offer",
        phases: [
            {
                // The Home hero button, or the Fight tab if the hero is not on screen.
                focus: ["debut-hero-cta", "nav-fights"],
                doneOnTab: "fights",
                advance: { type: "clickFocus" },
                tooltips: [
                    {
                        anchor: ["debut-hero-cta", "nav-fights"],
                        title: t("tutorial.debut.homeTitle"),
                        body: t("tutorial.debut.homeBody"),
                        bodyBottomNav: t("tutorial.debut.homeBodyBottomNav"),
                    },
                ],
            },
        ],
    },

    // ── 2. Fight tab: accept the debut bout ──────────────────
    debut_offer: {
        next: "debut_report",
        phases: [
            {
                focus: "offer-accept",
                tab: "fights",
                advance: { type: "event", name: "fight_accepted" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "offer-accept",
                        title: t("tutorial.debut.offerTitle"),
                        body: t("tutorial.debut.offerBody"),
                    },
                ],
            },
        ],
    },

    // ── 3. Face-off, then the Fighter Report ─────────────────
    debut_report: {
        next: "debut_camp",
        phases: [
            {
                focus: "fighter-report",
                tab: "fights",
                advance: { type: "event", name: "fighter_report_closed" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: "fighter-report",
                        title: t("tutorial.debut.reportTitle"),
                        body: t("tutorial.debut.reportBody"),
                    },
                ],
            },
        ],
    },

    // ── 4. Fight camp and weight cut, then the bell ──────────
    debut_camp: {
        next: null,
        completeLocally: true,
        phases: [
            {
                // The camp panel, or the camp summary once it is finalised.
                // Ring the coach's pick first (the lesson), then move to Finalise once the
                // tip is dismissed. Pointing straight at Finalise scrolled past the sessions
                // and parked the player on the supplements list.
                focus: ["camp-coach-pick", "camp-sessions", "camp-finalise", "camp-finalise-row", "camp-summary"],
                focusAfterTooltips: ["camp-finalise", "camp-finalise-row", "camp-summary"],
                tab: "fights",
                advance: { type: "event", name: "fight_resolve_started" },
                skipIfAbsent: true,
                tooltips: [
                    {
                        anchor: ["camp-coach-pick", "camp-sessions", "camp-finalise", "camp-finalise-row"],
                        title: t("tutorial.debut.campTitle"),
                        body: t("tutorial.debut.campBody"),
                    },
                ],
            },
        ],
    },
};

/** Ordered step ids, kept in sync with the server's STEP_ORDER (consts/tutorialConfig.js). */
export const STEP_ORDER = [
    "debut_home",
    "debut_offer",
    "debut_report",
    "debut_camp",
    "complete",
];

/** The step a fighter on an unknown or legacy step id starts from. */
export const DEFAULT_STEP = "debut_home";

/** Map any server step id to one this client can render. */
export function normaliseStep(id) {
    if (id === "complete") return "complete";
    return TUTORIAL_STEPS[id] ? id : DEFAULT_STEP;
}
