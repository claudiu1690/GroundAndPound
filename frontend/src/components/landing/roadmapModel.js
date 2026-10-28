/**
 * Roadmap page (`/?page=roadmap`): what shipped, what is live, what is being built next.
 *
 * Plain ESM, no JSX, so tests/frontend/roadmapModel.test.js can load it directly.
 *
 * SHIPPED: titles, points and art live here. The date comes from the changelog
 * entry with the same version, and a milestone whose version is not in the
 * changelog yet is dropped, so the page can never claim a release that has not
 * been written up in What's New.
 *
 * NEXT: the next season's number and theme only, no features. The only future
 * date the roadmap shows is that season's opening, read live from the ladder.
 * LATER: undated work not tied to a season.
 *
 * ART: `{ img }` is a path under frontend/public, always existing game art or a
 * crop of a real screen (no art is generated for this page). `{ css }` names a
 * composition drawn in landing.css (`rm-art--<name>`), optionally over `img`.
 */
import { CHANGELOG_ENTRIES } from "../changelog/changelogContent.js";

export const ROADMAP_SHIPPED = [
  {
    version: "1.0",
    title: "Doors open",
    art: { css: "brand" },
    points: [
      "Start a career as a guest. No email needed.",
      "Save a one-time recovery code to keep your fighter safe.",
      "Add an email and password whenever you want to claim the account.",
    ],
  },
  {
    version: "1.1",
    title: "Painted sponsors",
    art: { img: "/assets/sponsors/titan-gloves.webp" },
    points: [
      "Every sponsor deal comes with its own painted card.",
      "A warning before you take a fight while injured.",
      "A Library guide to what each of the eight stats does.",
    ],
  },
  {
    version: "1.2",
    title: "Special Moves",
    art: { img: "/assets/moves/the-finisher.webp" },
    points: [
      "Collectible techniques on painted cards, pulled from sparring.",
      "Equip up to 3 as your career climbs.",
      "Four rarities, Common to Legendary. Pull a better copy and yours upgrades.",
    ],
  },
  {
    version: "1.3",
    title: "Fight night broadcast",
    art: { css: "screen", img: "/assets/roadmap/fight-summary.webp", pos: "left top" },
    points: [
      "Rankings rebuilt around the champion and the title-shot zone.",
      "The post-fight summary became a broadcast package with a round-by-round scorecard.",
      "A fight-poster nameplate for your profile banner.",
    ],
  },
  {
    version: "1.4",
    title: "Banner unlocks",
    // Real banner backgrounds from the customizer, scattered like cards on a table.
    // Names are made up for the picture, the way a real banner carries a fighter's name.
    art: {
      css: "banner-pile",
      banners: [
        { id: "BG_SCORCHED", first: "Dante", last: "Reyes" },
        { id: "BG_NEON", first: "Kai", last: "Solano" },
        { id: "BG_GOLD_LEAF", first: "Marcus", last: "Kane" },
        { id: "BG_THRONE", first: "Luca", last: "Draven" },
      ],
    },
    points: [
      "10 new banner pieces to chase.",
      "Earned with badges: 10 KO wins, a perfect camp, a giant-killer upset and more.",
      "A Banner Unlocked card the moment a fight earns one.",
    ],
  },
  {
    version: "1.5",
    title: "Persona",
    art: { img: "/assets/persona/octagon-map.webp" },
    points: [
      "Your media choices build a public character the fight world reacts to.",
      "Four archetypes: The Villain, The People's Champ, The Boogeyman, The Role Model.",
      "Stay in character to unlock a Signature perk, or break it for double fame.",
    ],
  },
  {
    version: "2.0",
    title: "My Camp",
    // Tilted crop of the real My Camp coach roster (same capture the landing page uses).
    art: { css: "screen", img: "/assets/landing/s2/crop-staff.jpg", pos: "left center" },
    points: [
      "Your own camp, with a free head coach on day one.",
      "A Monday Trainer Market: hire coaches, pay their wages, rank them up.",
      "Coaches teach Special Moves you can read on their card before you sign them.",
    ],
  },
  {
    version: "2.1",
    title: "Fight Night",
    // Tilted crop of the real Home tab: athlete header and the booked next fight.
    art: { css: "screen", img: "/assets/roadmap/home-fight-night.webp", pos: "left center" },
    points: [
      "Home became your athlete page: record, rank, Overall and your next fight up top.",
      "The matchmaker books three bouts for you. The board turns over every 24 hours.",
      "Every bout prints its own purse. Hard pays 140% of the fee, a title shot 175%.",
    ],
  },
  {
    version: "2.2",
    title: "24 moves and the Shop",
    // A fan of three of the new 2.2 cards plus the painted Energy Drink can from the Shop.
    art: {
      css: "moves-shop",
      cards: ["/assets/moves/blast-double.webp", "/assets/moves/superman-punch.webp", "/assets/moves/arm-triangle.webp"],
      can: "/assets/shop/energy-drink.webp",
    },
    points: [
      "12 new Special Moves, 24 in all across four disciplines.",
      "Three new Signatures: Superman Punch, Blast Double and Arm Triangle.",
      "The Catalog: every move, its value at each rarity and how to get it.",
      "Energy Drink bundles in the Shop.",
    ],
  },
  {
    version: "2.3",
    title: "The new Shop",
    // Painted Shop products laid out like a shelf.
    art: {
      css: "shop-shelf",
      shelf: [
        "/assets/shop/pre-workout.webp",
        "/assets/shop/energy-shot.webp",
        "/assets/shop/whey-protein-shake.webp",
      ],
    },
    points: [
      "The Shop got a new look: every item has its own painted art.",
      "Out of energy? The game tells you how long to wait, or lets you use a Shot or a drink right there.",
      "Five days of off-season between seasons to see where you finished before the ladder resets.",
      "This Roadmap, and Ground & Pound on Instagram, Facebook and TikTok.",
    ],
  },
];

/**
 * Seasons are the landmarks of the history. Each one opens with the release
 * named in `fromVersion`, and that release's changelog date is the season's
 * opening date. Season 1's start is not recorded anywhere, so it has no
 * `fromVersion`: its banner only says when it ended (the day Season 2 opened).
 * Every shipped release is listed under the season it shipped in.
 */
export const ROADMAP_SEASONS = [
  {
    number: 1,
    name: "Iron Circuit",
    art: { css: "season-1", img: "/assets/landing/arena.jpg" },
    points: [
      "Ranked PvP opens: the Proving Ground.",
      "One Open ladder for every weight class.",
      "No twist. A straight fight for the first belt.",
    ],
  },
  {
    number: 2,
    name: "Blood Sport",
    fromVersion: "2.0",
    // Painted Heavy Hands card: a red fist for the KO and submission season.
    art: { css: "season-2", img: "/assets/moves/heavy-hands.webp", paint: true },
    points: [
      "+25% Division Points on every KO and submission win.",
      "My Camp replaces the gyms: coaches, wages, drills.",
      "The ladder reset to a clean slate.",
    ],
  },
];

// The next season, shown as a banner at the top of the page (no feature list).
// Its opening date is shown only while the ladder's own next season has this
// number, so a stale entry never borrows the date of a different season.
// Season 3 is "Black Ice" (owner, 2026-10-28). The 3.0 twist must carry the same name,
// since in-game and on the landing countdown a season is named after its twist.
export const ROADMAP_NEXT = { seasonNumber: 3, theme: "Black Ice" };

// Later: planned work with no date and no season attached. Hand-maintained;
// move an item out the day it ships. Nothing here may describe a feature that
// is not decided.
export const ROADMAP_LATER = [
  {
    title: "A face for your fighter",
    art: { css: "faces", faces: ["/assets/roadmap/face-09.webp", "/assets/roadmap/face-17.webp", "/assets/roadmap/face-21.webp"] },
    points: [
      "Pick a portrait for your fighter.",
      "It shows on your profile, the ladder and fight night.",
    ],
  },
  {
    title: "Fight Camp, rebuilt",
    art: { css: "wip", img: "/assets/roadmap/fight-camp-today.webp", pos: "left top" },
    points: [
      "The camp you run before every fight gets a full redesign.",
    ],
  },
  {
    title: "A face for every opponent",
    art: { css: "silhouette", img: "/assets/roadmap/face-17.webp" },
    points: [
      "Every opponent gets a face of their own.",
      "The same face every time you meet them, so a rematch feels like one.",
    ],
  },
  {
    title: "A holiday fight card",
    art: { css: "holiday-card" },
    points: [
      "A special card on the Events tab over the holidays.",
      "Call the results right for bigger payouts.",
    ],
  },
];

/** Shipped milestones with their changelog dates, newest first. */
export function shippedMilestones(entries = CHANGELOG_ENTRIES) {
  const dateByVersion = new Map(entries.map((e) => [e.version, e.date]));
  return ROADMAP_SHIPPED
    .filter((m) => dateByVersion.has(m.version))
    .map((m) => ({ ...m, date: dateByVersion.get(m.version) }))
    .reverse();
}

const versionParts = (v) => String(v).split(".").map(Number);
function compareVersions(a, b) {
  const pa = versionParts(a), pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The history as season eras, newest season first. The page reads upward from
 * the bottom like a timeline: a season's banner sits under its releases, and
 * those releases run newest at the top. Each era carries its
 * opening date (changelog date of `fromVersion`, or null), its end date (the
 * next season's opening date, or null while it is the latest), and the shipped
 * releases from its opening up to the next season, newest first.
 */
export function seasonEras(entries = CHANGELOG_ENTRIES, seasons = ROADMAP_SEASONS) {
  const dateByVersion = new Map(entries.map((e) => [e.version, e.date]));
  const releases = shippedMilestones(entries);
  const eras = seasons.map((s, i) => {
    const nextSeason = seasons[i + 1];
    const startDate = s.fromVersion ? dateByVersion.get(s.fromVersion) || null : null;
    const endDate = nextSeason?.fromVersion ? dateByVersion.get(nextSeason.fromVersion) || null : null;
    const inEra = releases.filter((r) =>
      (!s.fromVersion || compareVersions(r.version, s.fromVersion) >= 0) &&
      (!nextSeason?.fromVersion || compareVersions(r.version, nextSeason.fromVersion) < 0));
    return { ...s, startDate, endDate, releases: inEra };
  });
  return eras.reverse();
}

/**
 * "2026-07-04" -> "Jul 4, 2026". Built from the parts, not `new Date(str)`: a
 * bare ISO date parses as UTC midnight and shows the day before west of London.
 */
export function formatMilestoneDate(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The "Now" and "Next" headers. `now` comes only from the public season DTO
 * (GET /pvp/season/public) and is null unless a season is actually live. `next`
 * is the hand-maintained plan; it borrows the DTO's opening date only when the
 * DTO's next season is the same season number. Nothing is guessed when the
 * fetch failed or is loading.
 */
export function seasonNodes(season, plan = ROADMAP_NEXT) {
  const live = season?.status === "active" ? season : null;
  const upcoming = season?.status === "upcoming" ? season : season?.next || null;

  const now = live
    ? {
        seasonNumber: live.seasonNumber,
        name: live.name || null,
        endDate: live.endDate || null,
        twistEffect: live.twistEffect || null,
        weightClassLabel: live.weightClassLabel || null,
      }
    : null;

  const startDate = upcoming && upcoming.seasonNumber === plan.seasonNumber ? upcoming.startDate || null : null;
  const next = { seasonNumber: plan.seasonNumber, theme: plan.theme, startDate };

  return { now, next };
}
