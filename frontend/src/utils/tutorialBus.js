/**
 * tutorialBus — a tiny synchronous event bus that lets the game UI notify the
 * tutorial orchestrator when a tracked in-game action completes (e.g. a
 * training session resolved, a fight was accepted).
 *
 * The orchestrator subscribes to the events it is waiting on for the current
 * step; game handlers in App.jsx emit them. Decoupling via a bus avoids
 * threading tutorial callbacks through every game handler's props.
 *
 * Events emitted (see constants/tutorialSteps.js `advance.name`):
 *   training_complete      — training-result popup dismissed after a session
 *   fight_accepted         — a fight offer was accepted
 *   fighter_report_closed  — the Fighter Report modal was closed
 *   fight_resolved         — a fight simulation finished
 *   result_dismissed       — the post-fight result screen was dismissed
 */
const listeners = new Map(); // eventName -> Set<fn>

export const tutorialBus = {
    /** Subscribe to an event. Returns an unsubscribe function. */
    on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => {
            const set = listeners.get(event);
            if (set) set.delete(fn);
        };
    },

    /** Emit an event to all current subscribers. */
    emit(event, payload) {
        const set = listeners.get(event);
        if (!set) return;
        for (const fn of [...set]) {
            try { fn(payload); } catch (e) { console.error(`[tutorialBus] listener for "${event}" threw:`, e); }
        }
    },
};

export default tutorialBus;
