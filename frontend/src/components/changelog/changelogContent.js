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
 *   version: string,      // "1.0" MAJOR.MINOR — or "1.4.1" MAJOR.MINOR.PATCH for a fixes-only release
 *   date: string,         // "YYYY-MM-DD"
 *   major: boolean,       // true -> auto-open once for returning players
 *   highlights: string[], // 3-5 short lines — new features live here
 *   sections: { changed: string[], fixed: string[], balance: string[] } // render only non-empty; balance lines include a short "why"
 * }
 */

export const CHANGELOG_ENTRIES = [
  {
    version: "2.0",
    date: "2026-09-20",
    major: true,
    highlights: [
      "Season 2 opens on 20 September and it is called Blood Sport. Every KO and every submission win banks +25% Division Points for the whole season, and the ladder resets to a clean slate when it opens. Decisions still count, they just do not pay like a finish does.",
      "You have your own camp now. My Camp sits right under Home in the menu, where Training used to be. Your name on the door, your coaches, your drills, and a building that only stays sharp if you show up. It's already built and already staffed: a free head coach who matches how you fight walks in on day one, and never charges a cent to keep.",
      "Rank your coaches up with sessions, style wins and cash. Rank 3 is a permanent +5% XP with him. Rank 4 hands you his discipline's perk for good. Every coach runs a kit of four drills that open as he ranks up: everyday work, hard flagship rounds, and a cheap recovery drill. Open Mat Sparring is always on the board too.",
      "Your coaches teach. Every one of them knows a short list of Special Moves outright, visible on his card before you ever hire him, and promoting him hands them over. No roll, no luck. This is the first place in the game where you choose which Special Moves you own, and a Legendary coach teaches Legendary copies. Every Legendary also hides a fifth drill, his masterclass, locked until Rank 4: the widest session in the game and the best move chance on the board.",
      "The Home screen is rebuilt. It opens on your next fight: you and your opponent on your banners, the purse, and one button to take it. The rest of the offers sit underneath as an undercard you can swipe through on a phone. Everything else you had is still there, grouped into four bands so the screen tells you what needs answering today instead of showing you twelve identical grey boxes. Your camp, your coach's morale and the wages due now appear on Home for the first time, as does the report waiting for you when somebody attacks you while you are offline.",
      "When Season 1 closes and Season 2 opens, the Proving Ground hands you a results poster instead of two stacked dialogs. It stamps the old season CLOSED, shows the division you finished in, your final rank, your record and every reward you were paid on tear-off stubs, then announces Blood Sport and the position you restart from. You get it once, the first time you open the Proving Ground after the rollover, and never again. Sit the season out and you will not see it, because there is nothing to pay you.",
      "The Trainer Market opens at Camp Tier 2. Every Monday a fresh slate of coaches comes looking for work, each with his own face, name and rarity from Common to Legendary, plus one of twelve personality traits. They're employees, not furniture. Every hire draws a weekly wage debited each Monday, and every coach has morale. Bench him or miss payroll and it slides. Let it reach zero and he walks, taking his rank with him. There are no rerolls: when Monday's slate is gone, it's gone.",
      "Heads up, and read this one properly. The gyms are closing. All ten specialty gyms and the free gym are retired, and My Camp is now the only place you train. Gym Side Quests end with them. Your gym ranks, gym perks and the ten gym rank-4 badges are being cleared rather than carried across, so a Rank 4 you earned at a gym will not become a Rank 4 coach in your camp. We know that stings and we're not pretending otherwise: everyone affected will be compensated directly, and we'll announce exactly how. Anything you earned in your camp is untouched.",
    ],
    sections: {
      changed: [
        "The front page now runs on the season. Whichever season is live, and whichever one is queued behind it, the landing page reads it straight from the ladder: the name, the scoring rule, and a live countdown to the next one opening.",
        "The front page shows the camp. Seven cropped shots straight out of the live game: your staff, the Monday market with a coach's teach list, camp condition, the development track, his drills, and the nudge you get when someone's morale is slipping.",
        "The landing page hero switches itself: an evergreen pitch when there is no season to promote, the live season when there is one, and a countdown once the next season is queued.",
        "Section rules on the landing page are now coloured to their section and animate in as you scroll.",
        "Special Move drops now live on the individual drill rather than one flat rate everywhere. A coach's flagship rounds carry the best chance in the game and tend to shake loose moves from his own specialty. Open Mat rolls at a lower rate and draws from the whole catalogue. The cheap, safe drills don't roll at all.",
        "Your Career page has a new Camp badge section: sign your first coach, fill all four slots, sign a Legendary, get taught your first move, get taught five, and the one worth chasing, take a coach in all four disciplines to Rank 4. None of them can be lost. Firing a coach never takes a camp badge back.",
        "Four discipline-mastery badges are now earned in your camp instead of at a gym: Champion Boxer from a Striking coach, Olympic Wrestler from Wrestling, BJJ Black Belt from a BJJ Professor, and Grand Kru from Conditioning. The other six gym badges have no camp route, so they can no longer be earned. They're hidden from your collection unless you already hold one, and any you did earn stay on your profile permanently with a \"Retired\" mark. Your completion total is never short because of a badge nobody can get.",
        "Perks are one shared collection, so there's no way to hold the same one twice, and firing the coach who earned it never takes it back.",
        "Firing a coach is allowed, and priced: his rank is gone for good, the rest of the room takes a morale hit (a Locker-Room Leader prevents it), and the building takes 15 Facility Condition of damage. The week's slate can't be rerolled, so churning gains you nothing. A Head Coach or better at least leaves his experience banked for his replacement, and you can never be left with an empty camp.",
        "Renovate for $2,000 and 3 career wins to open the second coach slot and the market itself. A $300 Deep Clean is there when the building needs rescue money can fix.",
      ],
      fixed: [
        "You can finally see the perks you own. There was nowhere in the game that listed them, so if you'd earned one you had no way to check what it did. Your profile now has a Perks Held card.",
        "Badge notifications use the badge's real name. A rank-4 award announced itself as \"Boxer Rank4\" in one place and \"Champion Boxer\" in another. It's the proper name everywhere now.",
      ],
      balance: [
        "Camp coaches train at the same multipliers the equivalent gym did, so moving your sessions here is never a downgrade. The point is to replace what you had, not to quietly tax it.",
        "The flagship rounds cost 9 energy for slightly less XP per point of energy than your cheap drills, and they wear the building down. That's deliberate: the hard session should be a choice you make for the breadth and the drop chance, not the only button worth clicking. The masterclass goes further still, with the most energy, the most injury risk and the fastest wear.",
        "A Common coach's Rank 4 teaches no move at all. His one move already arrived at Rank 2, so Rank 4 pays out in his discipline's permanent perk instead. Rarity decides how much a coach can teach you, and the cheapest coach teaching as much as the most expensive would make rarity cosmetic. Rank 3 teaches nothing either: it's the permanent +5% XP node, and giving it a move too would leave Rank 4 with nothing but a perk.",
        "A Legendary coach is cheap to sign ($5,000 once) and expensive to keep ($2,250 a week). The wage, not the fee, is the real question, so hiring the best is an ongoing commitment rather than a one-time savings goal.",
        "Coach morale recovers. A clean week, meaning wages paid and at least one session run with him, gives +2 back. Recovery is slower than the damage on purpose, so a bad month still costs you, it just isn't forever. Neglect is slow too: an actively-run camp takes zero decay, and even total abandonment takes around two months to cost you a coach.",
        "The Conditioning Coach makes your whole camp safer just by being on staff: -15% injury risk on every session at Rank 1, rising to -30% at Rank 4, and it applies to sessions with your other coaches too. His own two sessions both stop paying out eventually (Max Stamina caps at 120, Facility Condition at 100), which would have left him with half a kit and no reason to keep a slot. He's insurance, and insurance never caps.",
        "Iron Conditioning, his Rank 4 perk, regenerates your health about 30% faster, permanently. A full heal drops from roughly eight hours to under six. It's the widest-reaching perk in the game: faster healing means more fights across a whole career.",
      ],
    },
  },
  {
    version: "1.5.1",
    date: "2026-09-01",
    major: false,
    highlights: [
      "Season 2 opens on 20 September, and it is called Blood Sport. Every KO and every submission win banks +25% Division Points for the whole season, and the ladder resets to a clean slate when it opens. Decisions still count, they just do not pay like a finish does.",
      "Season 2 also brings the Training Camp. Gyms retire, and you run a camp instead: coaches you hire, pay a weekly wage, keep happy, and rank up, each one teaching Special Moves you can read on his card before you sign him.",
      "Go and have a look at the front page. It has the countdown to Season 2 and a first look at the camp, with real shots of the coach roster, the Monday trainer market and the drills. It is the page you land on when you are signed out, so open it in a private window if you want to see it without logging out.",
    ],
    sections: { changed: [], fixed: [], balance: [] },
  },
  {
    version: "1.5",
    date: "2026-07-15",
    major: true,
    highlights: [
      "Your fighter now has a Persona — the media choices you make build a public character the whole fight world reacts to.",
      "Commit to a corner and the press crowns you: The Villain, The People's Champ, The Boogeyman, or The Role Model — each with real rewards and real costs.",
      "The Media Hub gets a persona strip: an octagon tracking how Hated/Loved and Loud/Quiet you are, your live modifiers, and a \"this moves you\" preview on every mic and post-fight interview.",
      "Build Storyline Heat by staying in character to unlock your Signature perk at 70% — but heat fades if you stop feeding it, so a persona takes upkeep.",
      "Nothing is ever locked: go off-brand at high heat for a \"Breaking Character\" turn — double fame, but it shatters your persona for a fight. Heel turns and redemption arcs are yours to write.",
      "The big persona moments get celebrated: the first time the press crowns you, and the moment your Signature perk unlocks — each with a rundown of exactly what just switched on.",
    ],
    sections: {
      changed: [
        "The landing page now shows off the game's painted card art — a fanned hand of Special Move cards and the Persona compass — instead of plain screenshots.",
      ],
      fixed: [
        "Tightened account safety on the Media and post-fight interview screens so only you can act on your own fighter.",
        "Sponsor contracts, gym rank-ups, and hospital bills now display the price your persona actually pays — with the old price struck through and a tag like \"The Role Model −10%\" showing why. Previously the screens showed the unmodified price while you were silently charged (or paid) a different number.",
        "Fixed the login screen's footer text invisibly blocking the \"Create Fighter & Play\" button on shorter screens — clicks went nowhere and signup looked broken.",
      ],
      balance: [
        "Persona modifiers now start at half strength the moment you claim an archetype (25% heat) and grow to full at 100% heat — under the old curve a fresh persona's bonuses rounded to ~1% and didn't feel like anything.",
      ],
    },
  },
  {
    version: "1.4.1",
    date: "2026-07-14",
    major: false,
    highlights: [],
    sections: {
      changed: [],
      fixed: [
        "Badges you earn during a fight — like reaching a new fame tier or maxing out a gym — now celebrate the moment you unlock them, instead of quietly showing up as earned on your profile later.",
        "Maxing out a gym's rank now shows a green check on the top rank instead of a red \"4\", so it reads as completed.",
      ],
      balance: [],
    },
  },
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
      fixed: [],
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
