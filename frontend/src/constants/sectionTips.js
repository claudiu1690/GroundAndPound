/**
 * Section tips and moment tips: what each one is, where it shows, and when it is due.
 *
 * Section tips run the first time a player opens a screen after the debut flow. Moment tips cover
 * mechanics with no screen of their own (low energy, low health, a first loss, a first injury).
 * The keys mirror the server's TIP_KEYS (consts/tutorialConfig.js); copy lives in locales/en.json
 * under `tips.*`.
 *
 * Every anchor (data-tut id) must exist on a portrait phone as well as on desktop. All of these
 * sit inside screens that both layouts render; none points at the desktop sidebar. An id given as
 * an array resolves to the first one on screen.
 *
 * `ctx` is built by hooks/useTips.js:
 *   tab            App's activeTab
 *   pve            resolved PvE fights, wins   record wins
 *   accepted       a fight is booked (Fight Camp is the Fights screen)
 *   showCampSummary, showResult
 *   normalBoard    the offer board holds more than the Debut bout
 *   offers         the loaded board offers
 *   energy, energyCost, health
 *   recordChange   "W" | "L" | "D" of the result on screen
 *   injuries       [{ label, hours }] sustained in the result on screen
 */
import { t } from "../lib/i18n";

/** Section keys, in the order the server lists them. Beacons are only sent for these. */
export const SECTION_TIP_KEYS = Object.freeze([
  "camp", "fight", "fightcamp", "weightcut", "rankings", "events", "hospital", "pvp", "moves", "sponsors", "media",
]);

export const MOMENT_TIP_KEYS = Object.freeze([
  "moment_energy_low", "moment_health_low", "moment_first_loss", "moment_first_injury",
]);

/** How low health must be before the "carrying damage" tip is due. */
export const LOW_HEALTH = 60;

export const SECTION_TIPS = {
  camp: {
    tab: "camp",
    when: () => true,
    cards: [{ anchor: ["camp-info"] }, { anchor: ["gym-sessions"] }],
  },
  fight: {
    tab: "fights",
    when: (c) => c.pve >= 1 && !c.accepted && !c.showResult && c.normalBoard,
    cards: [{ anchor: ["offer-card"] }, { anchor: ["offers-footer"] }],
  },
  fightcamp: {
    tab: "fights",
    when: (c) => c.pve >= 1 && c.accepted && !c.showCampSummary,
    cards: [{ anchor: ["camp-sessions", "fight-camp"] }, { anchor: ["fight-camp"] }],
  },
  weightcut: {
    tab: "fights",
    when: (c) => c.pve >= 1 && c.accepted && c.showCampSummary,
    cards: [{ anchor: ["weight-cut", "camp-summary"] }],
  },
  rankings: {
    tab: "rankings",
    when: () => true,
    cards: [{ anchor: ["rankings-table", "rankings-tab"] }],
  },
  events: {
    tab: "events",
    when: () => true,
    cards: [{ anchor: ["event-headliner"] }, { anchor: ["event-potential", "event-headliner"] }],
  },
  hospital: {
    tab: "hospital",
    when: () => true,
    cards: [{ anchor: ["hospital-health"] }, { anchor: ["hospital-injuries", "hospital-health"] }],
  },
  pvp: {
    tab: "pvp",
    // The Proving Ground opens at 3 career wins; before that its screen is the locked card.
    when: (c) => c.wins >= 3,
    cards: [{ anchor: ["pvp-hub"] }, { anchor: ["pvp-hub"] }],
  },
  moves: {
    tab: "moves",
    when: () => true,
    cards: [{ anchor: ["equipped-slots"] }],
  },
  sponsors: {
    tab: "contracts",
    when: () => true,
    cards: [{ anchor: ["sponsors-root"] }],
  },
  media: {
    tab: "media",
    when: () => true,
    cards: [{ anchor: ["media-root"] }],
  },
};

const onBoard = (c) => c.tab === "fights" && !c.accepted && !c.showResult;

export const MOMENT_TIPS = {
  moment_first_loss: {
    tab: "fights",
    when: (c) => c.showResult && c.recordChange === "L",
    cards: [{ anchor: ["result-continue"] }],
    title: () => t("tips.moment.firstLossTitle"),
    body: () => t("tips.moment.firstLoss"),
  },
  moment_first_injury: {
    tab: "fights",
    when: (c) => c.showResult && c.injuries.length > 0,
    cards: [{ anchor: ["result"] }],
    title: () => t("tips.moment.firstInjuryTitle"),
    body: (c) => {
      const inj = c.injuries[0];
      return Number.isFinite(inj?.hours) && inj.hours > 0
        ? t("tips.moment.firstInjury", { injury: inj.label, hours: Math.round(inj.hours) })
        : t("tips.moment.firstInjuryNoHours", { injury: inj?.label ?? "" });
    },
  },
  moment_energy_low: {
    tab: "fights",
    when: (c) => onBoard(c) && c.offers.length > 0 && c.energy < c.energyCost,
    cards: [{ anchor: ["profile-energy", "m-vitals"] }],
    title: () => t("tips.moment.energyLowTitle"),
    body: () => t("tips.moment.energyLow"),
  },
  moment_health_low: {
    tab: "fights",
    // Decided when the board is shown, not on the Accept tap: the card unmounts on accept.
    when: (c) => onBoard(c) && c.health < LOW_HEALTH && c.offers.some((o) => o.acceptable !== false && !o.locked),
    cards: [{ anchor: ["profile-health", "m-vitals"] }],
    title: () => t("tips.moment.healthLowTitle"),
    body: () => t("tips.moment.healthLow"),
  },
};

/** The sections that can be due on each screen, in priority order. */
const SECTIONS_BY_TAB = {
  camp: ["camp"],
  fights: ["fight", "fightcamp", "weightcut"],
  rankings: ["rankings"],
  events: ["events"],
  hospital: ["hospital"],
  pvp: ["pvp"],
  moves: ["moves"],
  contracts: ["sponsors"],
  media: ["media"],
};

/** Definition (section or moment) for a key, or null. */
export function tipDef(key) {
  return SECTION_TIPS[key] ?? MOMENT_TIPS[key] ?? null;
}

export function isMomentKey(key) {
  return Object.prototype.hasOwnProperty.call(MOMENT_TIPS, key);
}

/** True while `key`'s screen and conditions hold (the tip shows only then). */
export function tipVisible(key, ctx) {
  const def = tipDef(key);
  return !!def && ctx.tab === def.tab && !!def.when(ctx);
}

/**
 * The cards (anchor, title, body) of a tip for the current context.
 * Section copy is `tips.<key>.<n>.title|body`; moment copy comes from the definition.
 */
export function tipCards(key, ctx) {
  const def = tipDef(key);
  if (!def) return [];
  if (isMomentKey(key)) {
    return def.cards.map((c) => ({ anchor: c.anchor, title: def.title(ctx), body: def.body(ctx) }));
  }
  return def.cards.map((c, i) => ({
    anchor: c.anchor,
    title: t(`tips.${key}.${i + 1}.title`),
    body: t(`tips.${key}.${i + 1}.body`),
  }));
}

/**
 * The next tip that is due, or null. Result-screen moments come first, then the screen's own
 * section tips, then the board moments.
 * @param {object} ctx
 * @param {Set<string>|string[]} seen     keys already shown (server + this session)
 * @param {Set<string>|string[]} skipped  keys to leave alone (anchor never showed, paused)
 */
export function pickTip(ctx, seen, skipped = []) {
  const done = new Set(seen);
  const off = new Set(skipped);
  const order = [
    "moment_first_loss",
    "moment_first_injury",
    ...(SECTIONS_BY_TAB[ctx.tab] ?? []),
    "moment_energy_low",
    "moment_health_low",
  ];
  return order.find((key) => !done.has(key) && !off.has(key) && tipVisible(key, ctx)) ?? null;
}
