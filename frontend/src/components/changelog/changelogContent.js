/**
 * Changelog — hardcoded "What's New" content (libraryContent.js philosophy).
 *
 * INVARIANT: The first entry's `version` IS the app version — bump it for
 * every player-facing release; never edit an entry's content without
 * bumping its version (the What's New badge keys off version equality).
 * Entries are ordered NEWEST FIRST.
 *
 * Entry shape:
 * {
 *   version: string,      // "1.0" MAJOR.MINOR
 *   date: string,         // "YYYY-MM-DD"
 *   major: boolean,       // true -> auto-open once for returning players
 *   highlights: string[], // 3-5 short lines — new features live here
 *   sections: { changed: string[], fixed: string[], balance: string[] } // render only non-empty; balance lines include a short "why"
 * }
 */

export const CHANGELOG_ENTRIES = [
  {
    version: "1.4",
    date: "2026-07-14",
    major: false,
    highlights: [
      "10 new banner customizations to chase — bold new backgrounds, accent colours, and frames for your profile.",
      "These ones aren't tied to fame — you earn them with badges: 10 KO wins, a perfect camp, a giant-killer upset, avenging a rival, and more.",
      "When a fight earns you a new piece, a \"Banner Unlocked\" card celebrates it and drops you straight into the customizer.",
    ],
    sections: {
      changed: [
        "Post-fight celebrations now queue in order — a belt win or tier promotion always shows before a banner unlock, so the big moments land first.",
      ],
      fixed: [
        "Badges you earn during a fight — like reaching a new fame tier or maxing out a gym — now celebrate the moment you unlock them, instead of quietly showing up as earned on your profile later.",
        "Maxing out a gym's rank now shows a green check on the top rank instead of a red \"4\", so it reads as completed.",
      ],
      balance: [],
    },
  },
  {
    version: "1.3",
    date: "2026-07-12",
    major: false,
    highlights: [
      "The Rankings ladder has been redesigned — a champion summit at the top, a clear title-shot zone, and a chip that shows your path to the belt.",
      "The post-fight Summary is now a full broadcast package, with a round-by-round scorecard.",
      "Your profile banner got a fight-poster nameplate redesign.",
    ],
    sections: {
      changed: [
        "Onboarding tutorial polish and fixes.",
      ],
      fixed: [
        "The round-by-round scorecard no longer contradicts the official decision.",
        "Fixed a doubled digit in the fight camp's remaining-slots count.",
      ],
      balance: [],
    },
  },
  {
    version: "1.2",
    date: "2026-07-08",
    major: true,
    highlights: [
      "Special Moves have arrived — collectible signature techniques with full painted trading cards, earned from Sparring.",
      "Equip up to 3 moves as your career climbs: 1 slot at Amateur, a 2nd at Regional Pro, a 3rd at National.",
      "Moves come in four rarities, Common to Legendary — pull a better copy of one you own and it upgrades automatically.",
      "Mix and match freely: up to 2 always-on passives, plus a slot for a proc or a big one-shot signature move.",
      "Better gyms don't drop moves more often — they shift the odds toward rarer pulls, so a top-tier gym is your best shot at Legendary.",
    ],
    sections: {
      changed: [
        "The gym screen has been redesigned around a featured Sparring Ring, a compact training floor, and a clearer gym-standing sidebar.",
        "New move drops arrive as a face-down card — tap it to flip and reveal what you pulled.",
        "Move effects now read as Ratings (\"+30 Defense Rating\") with magnitude pips instead of tiny percentages — same math underneath, the exact numbers stay in the fine print.",
        "Accepting a fight now opens with a face-off — you and your opponent square up with a tale-of-the-tape before the Fighter Report.",
      ],
      fixed: [],
      balance: [],
    },
  },
  {
    version: "1.1",
    date: "2026-07-06",
    major: false,
    highlights: [
      "Sponsor contracts now have artwork. Every deal shows off its brand with a painted card.",
      "You now get a warning before taking a fight while injured, so a bad injury doesn't catch you off guard.",
      "A new Library guide breaks down what each of your eight stats actually does.",
    ],
    sections: {
      changed: [],
      fixed: [
        "Fixed a problem that could stop new guest accounts from being created.",
      ],
      balance: [],
    },
  },
  {
    version: "1.0",
    date: "2026-07-04",
    major: true,
    highlights: [
      "Play instantly as a guest — no email required to start your career.",
      "Secure your account any time with a one-time recovery code.",
      "Claim a guest account by adding an email and password — inactive unclaimed guests are removed after 30 days.",
      "A versioned What's New changelog now lives in the footer.",
    ],
    sections: {
      changed: [],
      fixed: [],
      balance: [],
    },
  },
];

export const CURRENT_VERSION = CHANGELOG_ENTRIES[0].version;
