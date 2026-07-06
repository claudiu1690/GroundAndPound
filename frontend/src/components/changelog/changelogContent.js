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
