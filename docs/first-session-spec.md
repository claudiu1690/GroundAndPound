# First session: "Carry them to the bell"

Design spec (game-designer step), 2026-11-04. Owner request: "spec everything you said. Make the
tutorial carry the player to the first fight. After that, make the tutorial per section: when the
player clicks Hospital there is a Hospital tutorial, when they click Events there is the Events
tutorial."

Why this exists: new players leave after one fight. The Reddit ads 01 players since v2.3.1 (3 sign-ups)
all left after a single 2 to 7 minute session; the 2026-10-30 production pull showed only 60% of
sign-ups ever resolve a first fight. Diagnosis (code read, filed in the game dev wiki hub, Results,
2026-11-04):

1. The fight, the payoff of the whole loop, renders as a finished report. Every round appears at once
   and the result is known before a line is read (`FightDescription.jsx`, `App.jsx` result screen).
2. About 20 tutorial tooltips come before the first punch (`frontend/src/constants/tutorialSteps.js`):
   five bar explainers, My Camp, a training drill, offer reading, Fighter Report, wildcard, camp
   sessions, weight cut.
3. The debut is a real roll on the normal board. At the bottom of Amateur the Easy window collapses to
   OVR 12 (`fightService.pickOfferSlots`: Easy `[max(12, O-6), O-2]`), so a new fighter's "Easy" bout is
   only about 2 OVR softer.
4. After the fight the tutorial tours Rankings (no rank until 3 fights), Events betting and the
   Hospital. Every carrot (rank, title shot, Proving Ground at 3 wins) is 3+ fights away and none is
   on the result screen.
5. Camp choices do fire in the commentary (`camp_*_fired` templates exist) but they are buried in a
   static wall of text, so the player never sees "my choice did that".

Wiki pages applied (`E:/Projects/Game-development-wiki/wiki/`): Onboarding and FTUE (first-session
timeline, safe first encounter, teach one thing at a time, "teaching everything" and "front-loaded text"
pitfalls), Core Loops (model, action, system, feedback; a fight with no visible feedback breaks the
loop), Retention Design (unfinished-goal lever, small cohorts are noise), Session Design for Browser
Games (exit screen with an unfinished goal), Game Feel and Juice, Feedback and Microinteractions
(timing limits), Playtesting, Game Analytics and KPIs, Ethical Monetization and Regulation (no sales
pushes inside onboarding). Where the wiki and the GDD disagree, the GDD wins and it is said below.

House rules respected: nothing sold alters a fight result; no daily rewards, streaks or countdowns;
the Hospital and the tutorial never sell; no em or en dashes in any player string.

---

## 1. Goal

1. **The bell rings within about 90 seconds of finishing fighter creation**, on desktop and on a
   portrait phone, with at most 4 tooltips on the way.
2. **The fight is a show, not a report.** It plays out beat by beat with a skip, and the player's camp
   pick visibly pays off inside it.
3. **The debut is winnable**, honestly labelled as a debut bout, not a hidden rig.
4. **The first result screen points at fight two.** A visible unfinished goal ("Fight 1 of 3 to earn
   your ranking") and a Next fight button.
5. **Everything else is taught where it lives.** The first visit to each section opens a short tip
   sequence for that section, once. Mechanics with no screen (energy running low, first injury, first
   loss) get one just-in-time tip when they first happen.
6. **Measure it.** Every step of the first session is an analytics event, so the next ad cohort can be
   judged on numbers, not guesses.

Out of scope: fight engine maths, economy numbers (except the debut purse), the shop, PvP rules.

---

## 2. Mechanics

### 2.1 The new first session (the "debut flow")

Starts when fighter creation completes. Ends when the player leaves the first result screen. This
replaces tutorial steps 1 to 9 for new fighters.

| # | Screen | What the player sees | Tooltips | Advances on |
|---|---|---|---|---|
| 1 | Home | Hero card becomes **Your debut is booked**: opponent name, style, record, OVR, purse, one button **See your opponent**. Rest of Home renders as today but quiet. | 1: "Your promoter booked your first pro fight. Tap to meet your opponent." | Tap the hero button (or the Fight tab) |
| 2 | Fight tab (offer board) | **Only the debut bout** is on the board, labelled **Debut**. Below it a muted line: "More offers open after your debut." | 1, on Accept: "Accepting costs 10 energy and books the fight. Tap Accept." | `fight_accepted` |
| 3 | Face-off, then Fighter Report | Unchanged face-off. The report gains a **Coach's pick** chip on one recommended camp session (see 2.4). | 1: "This is your opponent. Your coach has marked the camp session that counters their style." | `fighter_report_closed` |
| 4 | Fight Camp + weight cut | Camp as today (2 slots at Amateur). Weight cut defaults to **Easy** for the debut (the player can still change it). | 1, on the finalise button: "Pick your sessions, then Begin Fight." | `fight_resolve_started` |
| 5 | **Fight reveal** (new, 2.2) | The fight plays out round by round. Skip is always visible. | 0 (the reveal teaches itself) | Reveal ends or is skipped |
| 6 | Result (2.3) | Outcome, purse, signing bonus, fame, stat gains with OVR delta, **Next goal** card, buttons **Next fight** (primary) and **Train in My Camp** (secondary). Post-fight interview after a win, as today. | 0 | Player taps either button, or leaves the screen |

The debut flow ends at step 6. The $500 signing bonus moves from the end-of-tour modal onto the debut
result screen as its own line ("Signing bonus +$500"), so the first payday is one moment. The
completion modal ("YOU'RE READY.") is removed.

What is no longer taught up front, and where it moved (section tips, 2.5; or moment tips, 2.6):

| Old tutorial beat | Now |
|---|---|
| Energy, Health, Cash & Fame, Career, Stats (5 profile tips) | Moment tips: energy on first time energy drops below a fight's cost; health on first fight with health under 60; cash and fame are shown on the result screen with labels |
| My Camp intro + first training drill | My Camp section tip; the result screen's secondary button sends the player there |
| Reading an offer (Easy, Even, Hard, purse) | Fight section tip on the first visit after the debut, when the full board appears |
| Wildcard, match status, weight-cut options | Fight Camp section tip on the second camp (first camp with a normal board) |
| Cash and Fame on the result | Result screen labels (no tooltip) |
| Press interview | The interview card explains itself; no tip |
| Rankings, Events, Hospital tours | Section tips on first visit |

### 2.2 The fight reveal

Pure presentation of the already-resolved fight. The server resolves exactly as today; the client
receives the same summary and breakdown and plays it back. Applies to every PvE fight, not just the
debut. PvP keeps its result screen for now; the component is built so PvP can adopt it later.

**Layout (phone first, one column):**

- Top: both fighters' names, a **damage bar** each (from `roundStats.damagePlayer / damageOpponent`,
  cumulative per round, interpolated across the round's beats), and the round + clock (`R2 3:14`, from
  the event `timestamp`).
- Middle: the **beat feed**. One beat at a time slides in at the top; the previous 2 to 3 stay visible
  and fade. Each beat is one rendered event line from the existing template engine (`renderEvent`).
- Bottom: **Skip to result** (always), **2x** speed toggle.

**Which beats play.** Not every event in `eventLog`. Per round, in order:

1. Always: every event of type `knockdown`, `submission`, `takedown`, `camp`, `finish`.
2. Then the strike events with the highest impact until the round has **4 to 6 beats** in total.
3. If a round has fewer than 4 events in total, play them all.

**Timing (base speed):** 1.6 s per beat, 2.5 s for a knockdown or camp beat, a 1.5 s **round card**
between rounds ("Round 1 to You, 10 to 9", from `roundWinner` and `dominant`), and a 3 s **finish
card** (KO, TKO, SUBMISSION, or the judges' decision with the round scores). A 3-round decision lands
around 40 s; finishes are shorter. 2x halves every duration. Target from Feedback and
Microinteractions: nothing waits more than 2.5 s without something moving.

**The camp payoff beat.** Every `camp_*_fired` event plays with a gold **CAMP** chip naming the session
the player picked ("Takedown Defence"), plus a short pulse on the player's damage bar. The wildcard
event (`wildcard_fired`) plays with a red **WILDCARD** chip. This closes the loop the wiki calls model,
action, feedback: the player chose a session, then sees it fire.

**Spoilers.** Nothing may reveal the outcome before the finish card:
- The message bar line set in `App.jsx` after resolve ("Win, +$500, Record...") and badge toasts wait
  until the reveal ends or is skipped.
- The sidebar or header record, cash and health must not update visibly during the reveal. The fighter
  reload after resolve is deferred until the reveal ends (or the visible values are frozen during it;
  architect's call).
- The `fight_resolved` tutorial event and analytics event fire as today (server truth), but the
  client's own "reveal finished" event (2.7) drives the debut flow.

**Reduced motion** (`prefers-reduced-motion`): no slides or pulses; beats still appear one at a time
at the same pace, and Skip still works. A player can also turn the reveal off for good in Account
settings ("Play fights out: On / Off"); default On.

**Leaving mid-reveal** (tab change, reload): the fight is already resolved. On return, the player lands
on the result screen, never a half-played reveal.

**After the reveal** the result screen keeps the existing full report one tap away ("Full fight
report"), collapsed by default.

### 2.3 Result screen: the next goal

Added to the existing result screen, above the stat tiles' fold on a phone.

**Next goal card.** Shows the nearest unfinished goal, picked by this priority (first that applies):

| Condition | Line | Progress |
|---|---|---|
| Fewer than 3 fights in the current tier (no rank yet) | "Earn your ranking: fight {n} of 3 done" | n / 3 |
| Proving Ground locked | "Proving Ground: {w} of 3 wins" | w / 3 |
| Pending promotion, not yet top 5 | "Climb into the top 5 for a title shot" | current rank |
| Top 5, title wins banked under 3 | "Title shot: {k} of 3 wins in the top 5" | k / 3 |
| Otherwise | "Next: {next tier} needs OVR {threshold}" | OVR / threshold |

A second, smaller line shows the Proving Ground progress whenever it is still locked and not already
the main line.

**Stat gains.** The stat XP block already exists; it gains an **OVR before to after** line when OVR
moved, and stat level-ups (`statLevelUps`) are listed first.

**Buttons.** **Next fight** (primary) opens the offer board. **Train in My Camp** (secondary) opens My
Camp. The existing Continue button becomes Next fight; it still emits `result_dismissed`.

### 2.4 The debut bout

Applies to the fighter's first PvE fight only (zero resolved PvE fights).

- **Board:** while the fighter has zero resolved PvE fights, the board holds one slot, offer type
  **Debut**. No Even, Hard, callout or title slot. The board fingerprint already changes when a fight
  resolves, so the normal three-slot board appears after the debut.
- **Opponent pool:** new seeded opponents, flagged `isDebut`, 4 per weight class, OVR well below a new
  fighter's starting OVR (starting OVR is about 14; the regular Amateur floor is 12), records 0-0 to
  1-2, local-show style names. Never offered to anyone else and never ranked.
- **Win rate target: about 90%**, not 100%. Set the debut OVR by a Monte-Carlo run on the real engine
  across all 8 styles and all 6 backstories, Easy weight cut, no camp and with a matched camp, before
  ship (`gamedev-balance`). A loss stays possible so the result is honest.
- **Purse:** 1.00x the Amateur signing fee ($500), not the 0.70x Easy multiplier. With the $500
  signing bonus on the same screen the first payday is $1,000 on a win.
- **Labelling:** the card says "Debut" and the line "Your promoter booked a winnable first fight."
  Nothing is hidden; the Library's offers article says how debut bouts work.
- **Coach's pick:** on the debut Fighter Report only, one camp session that scores Matched against
  this opponent carries a **Coach's pick** chip. From fight two the player reads the report alone.
- Injury grace (GDD §17.2, first 3 fights) is unchanged.

### 2.5 Section tips (first visit)

The first time the player opens a section after the debut flow, a short tip sequence runs there,
using the existing ring + tooltip engine (non-blocking, pauses off-screen, as in GDD §21 since v2.3).
Each sequence is 1 to 3 tips, then it never shows again. Every tip card has **Got it** and
**Hide tips** (turns off all section tips; re-enable in Account settings).

| Section | Trigger | Tips (titles; copy in section 5) |
|---|---|---|
| My Camp | first visit | Your coach and drills; Train raises stats and OVR; energy cost |
| Fight (offer board) | first visit with a normal board (after the debut) | Easy, Even, Hard and the purse; the board refreshes after every fight and every 24 h |
| Fight Camp | second camp (first one with a normal board) | Match status (Matched, Partial, Unmatched); wildcard; weight-cut options |
| Rankings | first visit | Rank after 3 fights in a tier; top 5 and the title shot |
| Events | first visit | Bet on NPC cards; winner vs exact bets; stake limit and the house edge |
| Hospital | first visit | Health and fighting hurt; injuries heal free over time; paying only buys back the wait |
| Proving Ground | first visit after unlock (3 wins) | Gameplans and defense; Division Points; placement fights |
| Special Moves | first visit | Equip up to your slots; how moves drop |
| Contracts (sponsors) | first visit | Sponsor goals and payouts |
| Media | first visit | Podcast once a day; appearances and fame |
| Career, Library, Account, Shop, Home | none | Self-explanatory or reference. **Shop gets no tip** (no selling inside onboarding, Ethical Monetization and Regulation). |

The Proving Ground already has its own onboarding (GDD §22.9: unlock gate, placement); its section
tip only explains the screen.

### 2.6 Moment tips (no screen of their own)

One tip each, the first time the condition happens, anchored where the player is:

| Moment | Tip |
|---|---|
| Energy below the cost of the cheapest fight offer, first time | "Energy refills by 1 a minute, about 100 in under 2 hours. Training and fights both spend it." |
| Accepting a fight with health under 60, first time | "You're carrying damage. Fighting hurt makes you worse in the cage. Health refills over time, or the Hospital can patch you up." |
| First loss | "Losses happen. Your next fight is in Comeback Mode: 1.5x XP and +30% cash." |
| First rank earned (3rd fight in tier) | Result screen line, not a tooltip: "You're ranked #{rank}. Top 5 opens the title shot." |
| First injury | "You picked up a {injury}. It heals on its own in {hours} h. Details in the Hospital." |

The out-of-energy offer (GDD §15.4) does not show during the debut flow. After it, it follows its
existing rules (wait first, nothing on login).

### 2.7 Measurement

New analytics event types (server-side where the server knows, else through the existing whitelisted
client beacon, `analyticsService.trackClientEvent`):

| Event | When | meta |
|---|---|---|
| `fighter_created` | creation completes | style, weightClass, guest |
| `debut_step` | each debut-flow step completes (1 to 6) | step, msSinceFighterCreated, device (phone/desktop) |
| `fight_reveal` | reveal ends | `watched` or `skipped`, beat index at skip, speed |
| `next_goal_click` | result screen button | `next_fight` or `train`, fightNumber |
| `section_tip` | a section sequence ends | section, `done` or `hidden` |

Existing `fight_accepted` and `fight_resolved` stay; add `fightNumber` (lifetime PvE count) to their
meta so the funnel reads fight 1, 2, 3 without a join.

The admin retention endpoint (`GET /admin/analytics/retention`) gains a **first-session funnel**:
fighter created, debut accepted, reveal watched or skipped, debut result, fight 2 accepted, fight 3
resolved, returned day 1. Split by device and by acquisition tag (`src` / `c`).

**Session replay is a separate owner decision** and not part of this build: a free tool (PostHog or
Microsoft Clarity) would let the owner watch real sessions, but it must sit behind the cookie consent,
mask all typed fields, and consider that players can be 13+. See open question 4.

---

## 3. Numbers

| Value | Number | Note |
|---|---|---|
| Time from creation complete to the bell | median 90 s or less, phone and desktop | measured by `debut_step` 1 to 5 |
| Tooltips before the bell | 4 | was about 20 |
| Debut win rate | about 90% | set the debut OVR by simulation, never by hand |
| Debut purse | $500 (1.00x Amateur) | plus the $500 signing bonus, unchanged amount |
| Debut energy | accept 10 + 2 camp sessions (4 to 8 each) = about 20 to 26 | leaves about 75 of 100: enough for fights 2 and 3 in the same session |
| Reveal beats per round | 4 to 6 | |
| Beat time | 1.6 s; 2.5 s for knockdown and camp beats | 2x halves it |
| Round card / finish card | 1.5 s / 3 s | |
| Section tip length | 1 to 3 tips | |

**Success targets for the next 100 to 200 new players** (inference, from the wiki's portal benchmarks
and today's baseline):

| Metric | Baseline (2026-10-30) | Target |
|---|---|---|
| Sign-ups who resolve fight 1 | 60% | 80%+ |
| Start fight 2 in the first session | unknown | 50%+ |
| Reach fight 3 (their ranking) in the first session | unknown | 35%+ |
| Day-1 return, ad cohorts | 0 of 3 (noise) | 15%+ (CrazyGames: strong web games 10 to 15%) |

**Kill test.** If after this build and one follow-up iteration the next-day return stays under about
10% and fewer than a quarter reach fight 3, the core fight loop is not hooking, and shelving or
reworking the concept is the honest call (owner decision).

---

## 4. Gating and eligibility

- **New fighters** (created after release) get the debut flow and section tips.
- **Fighters mid-tutorial at release** (any old step): moved straight to "debut flow done" if they have
  a resolved PvE fight, otherwise into the debut flow at step 1. Old step ids stay valid on the server
  so nobody is stranded (the `STEP_ORDER` rename rule in `consts/tutorialConfig.js`).
- **Existing players with a completed tutorial**: no debut flow, no debut bout. Section tips are
  **off** for them by default (they know the screens), and they can switch them on in Account settings.
- Guests and registered accounts behave the same.

---

## 5. Copy (new or changed strings)

No em or en dashes. "Tap" on touch, "Click" on mouse, as today (`bodyBottomNav` pattern).

Debut flow:
- Home hero title: "Your debut is booked"
- Home hero button: "See your opponent"
- Tip 1: "Your promoter booked your first pro fight. Tap to meet your opponent."
- Board debut label: "Debut". Line: "Your promoter booked a winnable first fight."
- Board muted line: "More offers open after your debut."
- Tip 2 (Accept): "Accepting costs 10 energy and books the fight. Tap Accept."
- Coach's pick chip: "Coach's pick"
- Tip 3 (Fighter Report): "This is your opponent. Your coach has marked the camp session that counters their style."
- Tip 4 (finalise): "Pick your sessions, then Begin Fight."

Reveal:
- "Skip to result", "2x", "Round {n}", "Round {n} to {name}, 10 to 9" (10 to 8 when dominant),
  "Even round", chips "CAMP: {session}" and "WILDCARD", finish card "KO", "TKO", "SUBMISSION",
  "DECISION", "SPLIT DECISION", "DRAW".
- Result link: "Full fight report"
- Account setting: "Play fights out" On / Off.

Result screen:
- "Signing bonus +$500"
- Next goal lines as in 2.3.
- Buttons: "Next fight", "Train in My Camp".

Section tips (titles, then body):
- My Camp. "Your Camp": "Your head coach runs drills here. Each drill trains certain stats and costs energy. Train to raise your OVR." "Drills and stats": "Pick drills that build your style's main stats. Stats grow faster when they're low."
- Fight. "Your Offers": "Easy pays less and is safer. Hard pays more and is riskier. Even is in between. Pick the fight you think you can win." "Fresh Offers": "A new set arrives after every fight and every 24 hours."
- Fight Camp. "Match Status": "A session scores Matched when it counters how your opponent actually fights, Partial when it half fits, Unmatched when it doesn't. The Fighter Report is your clue." "Wildcard": "Every opponent hides one tendency. The right session cancels it; otherwise it can fire in the fight." "Weight Cut": "Easy is safe. Moderate and Aggressive can add stamina, or cost it, and might miss weight."
- Rankings. "Your Division": "After 3 fights in a tier you get a rank. Win to climb. Top 5 puts a title shot in reach."
- Events. "Fight Cards": "Weekly NPC cards you can bet on. Pick a winner, or winner plus method for a bigger payout." "Your Stake": "Cash leaves when you bet. Limits grow with your tier. The house keeps an edge, so read the matchups."
- Hospital. "Your Health": "Fights cost health and it refills over time. Fighting hurt makes you worse." "Injuries": "Every injury heals on its own. Paying here only buys back the wait."
- Proving Ground. "Player Ladder": "Fight other players' fighters. Pick a gameplan; your defense plan fights for you while you're away." "Division Points": "Wins earn points, losses cost some. Your first 3 fights place you."
- Special Moves. "Your Moves": "Equip moves into your slots. They fire in fights under the right conditions. New moves drop from camp drills and coaches."
- Contracts. "Sponsors": "Sponsors pay when you hit their goals. Read the terms before you sign."
- Media. "The Media": "One podcast a day and appearances build fame. Fame unlocks callouts and sponsors."
- Tip buttons: "Got it", "Hide tips". Account setting: "Section tips" On / Off.

Moment tips: as in 2.6.

---

## 6. Edge cases

- **Player skips everything** (goes to another tab at step 1): the debut flow pauses with the existing
  "Tutorial paused" bar; the debut bout is still the only offer on the board, so any route leads back.
- **Player ends the tutorial early** ("End tutorial"): the debut flow ends, the board keeps the single
  debut bout until the first fight resolves (the debut is a board rule, not a tutorial rule), the
  signing bonus is paid on the result screen of fight 1.
- **Debut lost** (about 1 in 10): result screen still shows the signing bonus, the comeback moment tip,
  and the next goal; the Next fight button leads to the normal board.
- **Reload during the reveal:** lands on the result screen (2.2).
- **Energy offer during the debut flow:** suppressed (2.6). The debut costs at most about 26 of 100.
- **Injury from the debut:** injury grace means no blocking injury; the moment tip explains any
  non-blocking one.
- **Phone portrait:** every anchor must exist in the phone layout (hotfix 2.2.6 lesson). Walk the whole
  flow at phone width before release; the e2e suite needs a phone-width debut test.
- **Fights 2 and 3 back to back at low health:** see open question 2.
- **Legacy fighters with zero PvE fights** (created, never fought): treated as new for the debut bout
  and flow.

---

## 7. Data needs (design level; the architect owns the contract)

- Fighter: debut-flow state (step, done), section tips seen (set of section keys), tips enabled flag,
  reveal enabled flag. Reuse the `tutorial` subdoc where possible; old step ids must stay valid.
- Opponent: `isDebut` flag; a new seed script for debut opponents (never run scripts against
  production without the owner's explicit yes; seed staging first).
- Offer board: a Debut offer type and single-slot board while PvE fights = 0; purse multiplier 1.00.
- Fight Report payload: `coachPick` session id on the debut only.
- Result payload: next-goal inputs (fights in tier, PvP wins toward unlock, rank, title-shot progress,
  OVR before and after). Much of this is already on the fighter payload; the architect decides whether
  the summary carries it.
- Analytics: new event types (2.7) in the `analyticsEventModel` enum and the client beacon whitelist;
  `fightNumber` in fight event meta; funnel in the admin retention read.

---

## 8. Build order (smallest first, each shippable)

1. **Fight reveal + result Next goal card + analytics events.** Frontend-heavy, no balance risk, and it
   helps every player, not only new ones. Biggest expected effect.
2. **Debut flow + debut bout** (tutorial rewrite, seed, board rule, coach's pick, simulation for the
   debut OVR).
3. **Section tips + moment tips.**
4. **First-session funnel in the admin read.**

Then: watch 5 new players play (Playtesting page; the owner can use strangers from r/playmygame or the
paused ad campaign once restarted, or session replay if approved), and restart Reddit ads 01 with the
same tag (`c=launch-01`) so the before and after cohorts compare.

When built, the documentation upkeep applies: GDD §21 (rewrite), §7 (debut slot), §10 (reveal), §15.4
(energy offer suppressed in the debut), the Library (getting started, offers, fight article), and a
changelog entry. Version suggestion: **2.4.0** (a feature release inside Season 2, before Season 3's
v3.0.0 on 2026-12-04); owner decides.

---

## 9. Open questions

1. **Debut board: single slot (recommended) or the normal three with Debut in the Easy slot?** Single
   slot removes a decision the player cannot make yet; three keeps agency. Recommended: single.
2. **Fights 2 and 3 back to back:** health refills 1 per 5 minutes, so a player chaining fights in the
   first session fights hurt. Measure average health after the debut by simulation; if fight 2 win
   rates fall below the normal Easy rate, consider a free debut-week health top-up after each of the
   first 3 fights. Needs a balance pass (`gamedev-balance`).
3. **Reveal for PvP:** adopt in the same build or later? Recommended: later, after PvE results.
4. **Session replay** (PostHog or Microsoft Clarity): owner decision on privacy (consent, masking,
   13+ players) and tool. Not part of this build.
5. **Existing players' section tips:** off by default (recommended) or on once at release?
6. **Version:** ship as 2.4.0 before Season 3, or fold into v3.0.0?
