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
    version: "1.7",
    date: "2026-07-28",
    major: true,
    highlights: [
      "Your coaches teach now. Every coach carries a short list of Special Moves he personally knows — visible on his card before you hire him — and promoting him hands them over outright. No roll, no luck: this is the first place in the game where you choose which Special Moves you're going to own.",
      "Rank 2 teaches the first move on his list. Rank 3 teaches nothing and buys you his permanent +5% XP instead. Rank 4 teaches everything left, all at once — a Rare coach hands you two moves in one promotion, a Legendary up to three. It's the biggest single payout in the camp, and it's worth saving for.",
      "The copy is his quality: a Rare coach teaches Rare copies. Signing a Legendary is now the most reliable way in the game to get a Legendary version of a move you actually want, instead of hoping one falls out of a sparring session.",
      "Every Legendary coach hides a fifth drill — his masterclass — locked until his Rank 4. It's the widest session in the game: four stats at once including Fight IQ, which almost nothing else trains, plus the best Special Move chance on the board. You can see it greyed out on his card from day one, so you always know what Rank 4 is worth.",
      "Heads up, and read this one properly: the gyms are closing. All ten specialty gyms and the free gym are being retired, and My Camp becomes the only place you train. Gym Side Quests end with them. Your gym ranks, gym perks and the ten gym rank-4 badges are being cleared rather than carried across — a Rank 4 you earned at a gym will not become a Rank 4 coach in your camp. We know that stings, and we're not pretending otherwise: everyone affected will be compensated directly, and we'll announce exactly how before the switch happens. Anything you earned in your camp is untouched, including camp coaches you took to Rank 4 and the perks and badges they gave you.",
    ],
    sections: {
      changed: [
        "A coach's card now tells you the truth about each move on his list: which promotion grants it, or that the promotion has already gone by. Previously every coach advertised his first move as \"unlocks at Rank 2\" even when he was already Rank 4 and had no promotions left — that dangled moves you could never actually get.",
        "Badge notifications use the badge's real name. A rank-4 award announced itself as \"Boxer Rank4\" in one place and \"Champion Boxer\" in another; it's the proper name everywhere now.",
      ],
      fixed: [
        "A coach's rank-up requirements no longer count past what they need. A met requirement read \"34/12\", which looked broken; it now shows 12/12. Display only — nothing about who can be promoted changed.",
        "You can finally see the perks you own. There was nowhere in the game that listed them — the only place a perk appeared was buried inside the selected coach's Development Track, so if you'd claimed one you had no way to check what it did. Your profile now has a Perks Held card.",
        "Strength & Conditioning+ can no longer be trained once your Max Stamina is at its 120 cap. That session raises Max Stamina and nothing else — no stat XP, no move chance — so at the cap it was taking your energy and giving you nothing back. It now says so on the card instead of after the fact.",
        "Three of the four Rank-4 coach perks did nothing at all. Corner Confidence, Mat Returns and Submission Awareness were awarded, announced and badged — and then read by no part of the game. They work now: Corner Confidence gives you a genuine extra fight-camp slot against a striker, Mat Returns stops a Takedown Defence session ever being wasted, and Submission Awareness makes your escape training measurably better. If you took a coach to Rank 4 before today, you have been owed this the whole time.",
        "A coach who came over from a gym conversion arrived at Rank 4 with his teaching already behind him, but the screen still showed his moves as upcoming unlocks. His list now reads as missed, and the Rank 4 perk he's genuinely owed still has its claim button.",
        "Being taught more than one move in a single promotion no longer swallows the extras — each move gets its own reveal, one after another.",
      ],
      balance: [
        "The Conditioning Coach now makes your whole camp safer just by being on staff: -15% injury risk on every session at Rank 1, rising to -30% at Rank 4 — and it applies to sessions with your OTHER coaches too. He was the only coach in the game with two sessions that stopped paying out entirely (Max Stamina caps at 120, Facility Condition at 100), which left him with half a kit and no reason to keep a slot for him once you'd topped both up. He's insurance now, not maintenance, and insurance never caps.",
        "A Common coach's Rank 4 teaches no move at all — his one move already arrived at Rank 2, so Rank 4 pays him out in his discipline's permanent perk instead. Rarity is meant to decide how much a coach can teach you, so the cheapest coach teaching as much as the most expensive one would have made rarity cosmetic.",
        "Rank 3 deliberately teaches nothing. It's the permanent +5% XP node; giving it a move too would leave Rank 4 — the most expensive promotion in the game — with nothing but a perk to show for it.",
        "The masterclass costs more energy than any other session, carries the most injury risk, and wears the building down fastest. It's the widest and most rewarding drill in the game, so it should be a decision you make, not the only button worth clicking.",
      ],
    },
  },
  {
    version: "1.6",
    date: "2026-07-27",
    major: true,
    highlights: [
      "You have your own camp now — My Camp, a new tab under Training. Your name on the door, your coaches, your drills, and a building that only stays sharp if you show up.",
      "It's already built and already staffed: a free head coach who matches how you fight walks in on day one — and if you've ranked up at a gym, he walks in at that rank with your gym work behind him. Rank him up with sessions, style wins and cash: Rank 3 is a permanent +5% XP with him, Rank 4 hands you his discipline's perk for good.",
      "Every coach runs a kit of four drills that open as he ranks up — everyday work, hard flagship rounds, a cheap recovery drill — and Open Mat Sparring is always on the board. Facility Condition tracks the room: skip days and it slides, and a run-down camp trains you slower.",
      "The Trainer Market opens at Camp Tier 2: every Monday a fresh slate of coaches comes looking for work — real individuals with names, rarities from Common to Legendary, and one of twelve personality traits, from the Taskmaster who pushes harder at a cost to the Loyal cornerman who'll never walk out. No rerolls: when Monday's slate is gone, it's gone.",
      "Coaches are employees, not furniture. Every hired coach draws a real weekly wage, debited straight from your cash every Monday — and every coach has morale. Miss payroll or bench a coach all week and it drops; let it hit zero and he quits, taking his rank with him. Pay everyone and train with everyone weekly, and morale never becomes your problem. Your free starter never charges a cent.",
      "Renovate for $2,000 and 3 career wins to open the second coach slot and the market itself, then keep an eye out for the market-only Conditioning Coach — the camp's one source of Max Stamina and Fight IQ training. A $300 Deep Clean is there when the building needs rescue money can fix.",
    ],
    sections: {
      changed: [
        "Special Move drops in the camp are per-drill instead of one flat rate everywhere: the flagship rounds carry the best chance in the game, Open Mat matches gym sparring, and the cheap safe drills don't roll at all. Gym drops are completely unchanged.",
        "A coach's flagship rounds now tend to shake loose moves from his own specialty — your striking coach's hard rounds favor striking moves — while Open Mat keeps drawing from the whole catalog.",
        "Firing a coach is allowed, and priced: his rank is gone for good, the rest of the room takes a morale hit (a Locker-Room Leader prevents it), the building takes damage, and the slot locks for 7 days. A Head Coach or better at least leaves his experience banked for his replacement. You can never be left with an empty camp.",
        "All eleven gyms still work exactly as before and your ranks, perks and badges are untouched — the camp runs alongside them, so train wherever you like.",
      ],
      fixed: [],
      balance: [
        "Camp coaches train at the same multipliers as the equivalent gym, so moving your sessions to the camp is never a downgrade — the point is to give you a second home, not to quietly tax the one you already had.",
        "The flagship rounds cost 9 energy for a bit less XP per point of energy than your cheap drills, and they wear the building down. That's deliberate: the hard session should be a choice you make for the breadth and the drop chance, not the only button worth clicking.",
        "A Legendary coach is cheap to sign ($5,000 once) and expensive to keep ($2,250 a week) — the wage, not the fee, is the real question, so hiring the best is an ongoing commitment instead of a one-time savings goal.",
        "Coach neglect is slow on purpose: an actively-run camp takes zero morale decay, and even total abandonment takes around two months to cost you a coach — the system punishes walking away, never playing normally.",
      ],
    },
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
