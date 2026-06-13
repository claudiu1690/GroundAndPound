# Ground & Pound — Game Design Document

> **Status:** Living document, synced to the implemented game as of 2026-06-10.
> This is the agent-readable canonical GDD (the game-designer and architect agents
> read this before any proposal). It supersedes the Word original
> `Ground-And-Pound-GDD.docx` (kept for reference/authoring) and the retired
> root-level `gdd_text.txt` / `gdd_extract.xml` (old v2.0 design — deleted).
> When a section here disagrees with the code, **the code wins** — fix this doc.

Text-based MMA career simulation. The player creates a fighter, trains them at
specialty gyms, prepares for fights in a training camp, and competes through five
promotion tiers — from unknown amateur to GCS champion.

**Design pillars**
- Every action costs a resource (energy, iron/cash, or fame) and returns something measurable.
- Progression is stat-driven and continuous — no XP levels, no prestige resets, **no retirement / no end state**.
- Fights are deterministic simulations driven by stats, camp preparation, and weight-cut gambles.
- The player is never permanently locked out: injuries always heal over time, and new fighters are protected from fight-blocking injuries.

---

## 1. Application Layout & Navigation

Single-page web client. Top to bottom: a collapsible **Message Bar**, the **App Body**
(left sidebar + content panel), and a fixed **App Footer**.

- **Left sidebar:** Fighter Profile (banner, energy/health bars, meta panel — iron, fame, rank, class, gym, backstory — badges, stat meters, active injuries) and the nav menu: **Home, Training, Fight, Career, Rankings, Contracts, Hospital, Shop, Events, Media, Proving Ground**.
- **Footer:** game wordmark, contextual status badges (injury count → Hospital, camp → Fight, Fame → Fame drawer), Sign Out.
- **Overlays:** Training toast stack, Tier-Up / Belt-Won overlays, Fight-block popup (energy / injury), Fame drawer, Octagon Gazette, Onboarding Tutorial, Fighter Report, Camp Summary, Badge-unlock celebration.

---

## 2. Fighter Creation

Three choices: weight class, fighting style, optional backstory.

### 2.1 Weight Classes (permanent for the career)
| Weight Class | Limit |
|---|---|
| Featherweight | 145 lbs |
| Lightweight | 155 lbs |
| Middleweight | 185 lbs |
| Heavyweight | 265 lbs |

### 2.2 Fighting Styles
Style sets starting stat distribution and Overall weighting (primary 1.2×, secondary 1.0×, off-style 0.85×).

| Style | Primary | Secondary |
|---|---|---|
| Boxer | STR, SPD, CHN | LEG, WRE, GND, SUB |
| Kickboxer | STR, SPD, LEG | WRE, GND, SUB, CHN |
| Wrestler | WRE, GND, STR | SPD, LEG, SUB, CHN |
| Brazilian Jiu-Jitsu | GND, SUB, WRE | STR, SPD, LEG, CHN |
| Muay Thai | STR, LEG, SPD | WRE, GND, SUB, CHN |
| Judo | WRE, GND, STR | SPD, LEG, SUB, CHN |
| Sambo | WRE, SUB, GND | STR, SPD, LEG, CHN |
| Capoeira | SPD, LEG, FIQ | STR, WRE, GND, SUB, CHN |

### 2.3 Backstory Bonuses (optional, one permanent bonus)
| Backstory | Bonus |
|---|---|
| Street Fighter | CHN +5; reduced KO chance against the fighter |
| College Wrestler | WRE +8 |
| Kickboxing Champion | STR +6, LEG +4 |
| Army Veteran | Max Stamina +10 |
| MMA Prodigy | All stats +2 |
| Late Bloomer | +25% XP from all training sessions |

---

## 3. Core Stats & Overall Rating

Eight combat stats rated 1–100: **STR** (Striking Power), **SPD** (Hand Speed),
**LEG** (Kicks), **WRE** (Takedown Offence), **GND** (Ground Control),
**SUB** (Submission Game), **CHN** (Chin), **FIQ** (Fight IQ).

Overall Rating is the style-weighted blend of all eight (primary 1.2× / secondary 1.0× / off-style 0.85×).
There is no stat cap on Overall — every stat can reach 100 — but **training is hard-capped at 95**; points 96–99 come from fight XP only.

---

## 4. Energy System

Energy is the universal action resource. Max **100**, regenerates **+1/min** of real time, automatically.

| Action | Energy Cost |
|---|---|
| Training session | 3–8 (varies by session) |
| Accepting a fight | 10–20 (varies by tier) |
| Podcast (Media) | 5 |
| Hospital doctor visit | 10–20 (varies by injury) |

---

## 5. Promotion Tiers & Progression

Five tiers. A tier's **signing fee is its base fight purse** (no fee is ever paid).

| Tier | Overall Range | Fight Energy Cost | Base Purse (Iron) |
|---|---|---|---|
| Amateur | 0–30 | 10 | 400 |
| Regional Pro | 30–48 | 15 | 2,000 |
| National | 45–65 | 18 | 10,000 |
| GCS Contender | 60–75 | 20 | 25,000 |
| GCS | 62–95 | 20 | 50,000 |

There is **no daily fight cap** — the number of fights per day is limited only by
energy (each fight costs the tier's energy amount above; energy regenerates 1/min).

### 5.1 Promotion Gates
- **Amateur → Regional Pro:** reach OVR 30 (pending promotion), then win **2** Amateur fights to earn the **Amateur title shot** vs. the NPC Amateur champion; winning grants the **Amateur Champion** badge and **+75 fame**.
- **Regional Pro → National:** beat the Regional Pro champion (title shot — OVR threshold + 3 tier wins).
- **National → GCS Contender:** beat the National champion (title shot — OVR threshold + 3 tier wins).
- **GCS Contender → GCS:** auto-promotes at OVR 62. **The GCS Contender belt is not a winnable title** (no champion at this tier).
- **GCS:** final tier — defend the belt indefinitely. Pro title wins (Regional Pro, National, GCS) grant **+200 fame** + a permanent championship badge.

> Championship badges (Amateur / Regional Pro / National / GCS) are derived from
> promotion tier: reaching a tier proves you won every winnable title below it.

---

## 6. Gym & Training System

One free community gym is always available; **ten** specialty gyms require a weekly
iron membership. Only one paid membership is active at a time (paying a new gym
cancels the previous). **Ranks earned at a gym persist permanently**, even after switching.

### 6.1 The Free Gym
**Community MMA Center** — always free. Trains all stats at 0.6× base XP. No ranks. The fallback when a membership is unaffordable.

### 6.2 Specialty Gyms
| Gym | Focus Stats | Unlocks At | Weekly Cost |
|---|---|---|---|
| Iron Fist Boxing | STR, SPD, CHN | Amateur | 300 |
| Dragon Kickboxing | STR, LEG, SPD | Amateur | 300 |
| Warrior Muay Thai | LEG, STR, CHN | Amateur | 350 |
| Apex Wrestling Academy | WRE, STR, GND | Amateur | 400 |
| Gracie Ground Game | GND, SUB | Amateur | 400 |
| Renzo Combat Systems | SUB, WRE, FIQ | Regional Pro | 1,500 |
| Precision MMA Lab | SPD, FIQ, CHN | Regional Pro | 1,500 |
| Titan Performance Center | STR, WRE, CHN | National | 4,000 |
| The War Room | FIQ, GND, SUB | National | 4,000 |
| Elite Fight Academy | All stats | GCS Contender | 10,000 |

### 6.3 XP Multipliers
- Amateur-tier gyms: 1.0× base, 1.25× focus.
- Regional Pro gyms: 1.15× base, 1.4× focus.
- National gyms: 1.3× base, 1.5× focus.
- Elite Fight Academy: 1.5× all stats.

No stat caps from gyms — any gym can train any stat toward the global 95 training cap; the right gym does it faster.

### 6.4 Gym Ranks (four per specialty gym)
| Rank | Unlocks |
|---|---|
| 1 | Access to the gym's training sessions (granted on joining). |
| 2 | A unique advanced session available only at this gym (+10–15% XP). |
| 3 | +5% XP to focus stats, permanently. |
| 4 | A utility perk plus a permanent profile badge. |

Wins count toward ranks only at the **active paid gym**, and only if the win type matches the gym's discipline (KO/TKO for striking gyms, Submission for BJJ, Decision for tactical gyms, etc.). Ranks 3 and 4 require an iron payment on top of the training/win thresholds.

### 6.5 Rank-4 Perks & Badges
| Gym | Badge | Perk Effect |
|---|---|---|
| Iron Fist Boxing | Champion Boxer | Corner Confidence — (see code `gyms.json`) |
| Dragon Kickboxing | Grand Master Kickboxer | Low Kick Instinct |
| Warrior Muay Thai | Grand Kru | Iron Conditioning |
| Apex Wrestling Academy | Olympic Wrestler | Mat Returns |
| Gracie Ground Game | BJJ Black Belt | Submission Awareness |
| Renzo Combat Systems | Submission Master | Fighter Report shows 1 extra fight log |
| Precision MMA Lab | Fight Scientist | Game Plan Study becomes MATCHED instead of PARTIAL |
| Titan Performance Center | Titan | **Strength Reserve** — weight-cut bad-roll floor raised by 3 |
| The War Room | Tactician | 30% chance to reveal the opponent's wildcard |
| Elite Fight Academy | Elite Master | +10% fame from all fights |

> Note: perk *names* (Strength Reserve, Corner Confidence, …) differ from the *badge* names; `data/gyms.json` is the source of truth for exact perk ids/effects.

### 6.6 Training Sessions
Base sessions (specialty gyms only offer sessions for their focus stats + sparring):

| Session | Energy | Stats Trained |
|---|---|---|
| Bag Work | 4 | STR |
| Footwork | 4 | SPD |
| Kick Drills | 4 | LEG |
| Pad Work | 5 | STR, SPD |
| Wrestling | 5 | WRE |
| Clinch Work | 5 | WRE, STR |
| BJJ | 6 | GND, SUB |
| Submissions | 6 | SUB |
| Sparring | 8 | All 8 stats — 3% injury risk |
| Film Study | 3 | FIQ (requires Rank-3 gym or higher) |
| Strength & Conditioning | 4 | Raises Max Stamina (no stat XP) |

Rank 2 unlocks one gym-unique advanced session (Combination Drilling, Chain Wrestling, Championship Rounds, …) with a +10–15% XP bonus.

### 6.7 Stat Progression (XP per point)
| Stat Range | XP per Point |
|---|---|
| 1–10 | 10 |
| 11–20 | 25 |
| 21–30 | 50 |
| 31–40 | 100 |
| 41–50 | 200 |
| 51–60 | 400 |
| 61–70 | 800 |
| 71–80 | 1,500 |
| 81–90 | 2,500 |
| 91–95 | 6,000 |
| 96–99 | 8,000 — **fight XP only, not trainable** |

---

## 7. Fight Offers & Callouts

Requesting offers returns three opponent cards; a fourth **Title Shot** card appears when eligible.

| Offer | Opponent Strength |
|---|---|
| Easy | 3–5 Overall below the player |
| Even | Within 3 Overall |
| Hard | 2–5 Overall above the player |
| Title Shot | The champion of the current tier |

Accepting costs energy (10–20 by tier) and enters the training-camp phase.

### 7.1 Callouts (fame-driven matchmaking)
Spend **fame** to force a specific opponent into the next Hard slot.

| Roster | Base Cost | Per OVR Gap |
|---|---|---|
| Same Tier | 200 fame | +50 each |
| Stretch (+1 Tier) | 800 fame | +75 each |

Cost capped at 3,000 fame, min 100. An active callout can be cancelled for a **full fame refund** before the fight. The called-out opponent appears in the next Hard slot with a gold border and full Fighter Report intel. A callout **win**: +25% iron, +30% fame (grudge), and the **Called It** badge. Losing only burns the spent fame.

---

## 8. Champions & Title Shots

Each pro tier (Regional Pro, National, GCS) has a persistent NPC champion per weight class. You cannot promote past these tiers without beating the champion.

- **Earning a shot:** reach the next tier's OVR threshold → pending promotion set → win 3 tier fights (2 for Amateur) → title card appears as a 4th gold card.
- **The fight:** champion gets +5% all stats; their Fighter Report shows only 2 visible fight logs; wildcard hidden; always a full 5-slot camp; gold theme throughout.
- **Winning:** dethrone the champion, promote, +200 fame (Amateur +75) + permanent Champion badge; a new NPC champion is seeded from the old tier.
- **Losing a title shot:** 2-win cooldown (card greyed until 2 more wins). Two straight title losses → the champion becomes your **Nemesis**. Pending promotion stays set — you can always retry.

---

## 9. Fight Camp

Between accepting and fighting, the player runs a camp. Camp does **not** raise stats permanently — it prepares **conditional bonuses** that fire during the fight when specific situations occur.

### 9.1 Camp Slots
| Tier | Normal | Short Notice |
|---|---|---|
| Amateur | 2 | 1 |
| Regional Pro | 3 | 1 |
| National | 3 | 1 |
| GCS Contender | 5 | 2 |
| GCS | 3 | 1 |
| Title Fight (any tier) | 5 | 2 |

### 9.2 Camp Sessions
| Session | Energy | Bonus When Triggered |
|---|---|---|
| Takedown Defence | 6 | Sprawl success +25% |
| Submission Escapes | 6 | Escape probability +20% |
| Striking Accuracy | 5 | Strike damage +15% |
| Cardio Push | 5 | Stamina drain −20% below 70% |
| Game Plan Study | 4 | Opponent damage −6% (always half-active) |
| Body Shot Focus | 5 | Body damage +30%, opp. stamina drain +15% |
| Clinch Control | 5 | Clinch damage +25% |
| Ground & Pound Posture | 6 | G&P damage +20% from top |
| Sparring (general) | 8 | +3% all stats (always active) — 3% injury risk |

### 9.3 Match Status
Each logged session is rated vs. the opponent's actual game: **Matched** 100%, **Partial** 50%, **Unmatched** 0%, **Wrong** 0% + penalty. Game Plan Study always counts as Partial. Repeating a session diminishes: 2nd use 60%, 3rd 30%.

### 9.4 Camp Rating (S–F, informational, no flat stat modifier)
S 90–100, A 75–89, B 55–74, C 35–54, D 15–34, F 0–14.

### 9.5 The Fighter Report
Pre-camp scouting classifies each opponent stat: **Confirmed**, **Suspected**, **Unverified**, **Unknown**.

### 9.6 Wildcards
Every opponent has a hidden mid-tier stat tendency (never shown). Counter it with the right session and it's neutralised; otherwise the opponent gains a hidden +15% in that area. The Tactician perk has a 30% chance to reveal it.

### 9.7 Camp Injuries
Sparring carries 3% injury risk per session. On injury: stop camp (lose remaining slots, fight healthy, grade drops) or push through (keep slots, carry the penalty). A logged session can be removed by clicking its filled slot; the energy is refunded (see Anti-Probe note in §10.1).

| Camp Injury | Fight Penalty |
|---|---|
| Bruised Knuckle | STR −10% |
| Twisted Knee | LEG −20%, WRE −10% |
| Rib Strain | Max Stamina −15% |
| Minor Concussion | FIQ −15%; forces camp stop; requires doctor visit |
| Eye Cut | SPD −10%, opponent accuracy +5% |

---

## 10. The Fight

### 10.1 Weight Cut
Before every fight the player picks a weight-cut strategy — a stamina gamble with a chance to miss weight.

| Strategy | Stamina Roll | Miss-Weight Chance |
|---|---|---|
| Easy | +0 (guaranteed) | 0% |
| Moderate | −5 to +10 (random) | 5% |
| Aggressive | −12 to +18 (random) | 20% |

**On a missed weight:** the stamina roll is forced **negative-only** (you can never gain stamina *and* miss), the iron purse is cut **−20%**, and you take a **−200 fame penalty**. The Titan **Strength Reserve** perk raises the bad-roll floor by 3.

### 10.2 Fight Outcomes
KO/TKO (win), Submission (win), Decision Unanimous (win), Decision Split (win), Draw, Loss — Decision, Loss — KO/TKO (health → 0), Loss — Submission.

### 10.3 Post-Fight XP
| Result | XP Distribution |
|---|---|
| Win by KO/TKO | STR 30, CHN 15, SPD 10 |
| Win by Submission | SUB 30, GND 20, WRE 10 |
| Win by Decision | All stats 15, FIQ 20 |
| Loss by KO/TKO | CHN 20, FIQ 15 |
| Loss by other | FIQ 25 |

Multiplied by an outcome modifier: KO/TKO 1.3×, Sub 1.25×, Dec Unanimous 1.1×, Dec Split 1.05×, Draw 1.0×, Loss by Decision 0.8×, Loss by Finish 0.7×. A win in **comeback mode** adds ×1.5.

### 10.4 Iron Earnings
Base purse = the tier's signing fee, scaled by outcome: **Win 100%**, **Draw 50%**, **Loss 70%**. Modifiers on top: higher notoriety tier +5%→+50%; comeback +30%; active **Respect** flag on opponent (and you win) +15%; callout win +25%; missing weight −20%.

### 10.5 Fight Description (round-by-round breakdown)
Every fight produces a **round-by-round event feed** rather than a generic paragraph. It is shown in the right column of the post-fight summary and again in the **career-feed drawer** (§20.4). Both render from the same stored data, so a fight reads identically wherever you open it.

- **What it shows per round:** an intro line (set by the stakes — standard / comeback / nemesis / title / callout), 3–6 timestamped event lines (takedowns, clean and hurt strikes, ground-and-pound, submission attempts, knockdowns, camp triggers, the finish), a compact stat bar (**Strikes · Takedowns · Sub att. · Damage**, player vs opponent, cumulative), a 2-px **momentum bar** (green/red split by damage share), and a **round-winner** label (dominant / ahead / even). A closing **result line** is keyed by outcome × context (e.g. a giant-killer win over a much higher-OVR opponent reads differently to a routine decision).
- **It's derived, not simulated separately.** The fight engine is unchanged — combat is still the same stat-driven round simulation. The description is a faithful, deterministic *retelling* built from what the engine actually produced that round (per-round damage, control, finish, and which camp sessions fired). Strike/takedown/knockdown counts are believable derivations from round damage and control, not a second source of truth — the scorecard remains authoritative for scoring.
- **Deterministic:** the narrative variation for a given fight is seeded by the fight ID, so re-opening a fight never rewrites its story.
- **Camp lines** only appear when a camp session actually fired that round and its match status was Matched or Partial — never for an unmatched session.
- **Applies to both PvE and PvP.** Career fights and Proving Ground fights both generate a breakdown. (Older fights resolved before this system shipped have no breakdown and fall back to the legacy single-line recap.)

---

## 11. Post-Fight Interview & Flags

After every fight (win or loss) the press interviews the fighter. Pick one tone, or skip.

| Tone | Fame | Side Effect |
|---|---|---|
| Humble | +100 | Writes a **Respect** flag on the opponent just fought. |
| Confident | +150 | Pure fame — no flags. |
| Trash Talk | +200 | Pick a same-tier target (±6 OVR, not already beaten); writes a **Beef** flag. |
| Skip | 0 | No reward, no consequence. |

### 11.1 Beef & Respect Flags
Silent contracts with rivals, created by interview tones **or** Podcast segments. **Beef and Respect are mutually exclusive per opponent** — the last stance taken wins.

| Flag | Window | On Win | On Lapse |
|---|---|---|---|
| Beef | 4 fights | +30% fame (grudge) | −150 fame |
| Respect | 6 fights | +15% iron purse | Silent expiry |

Every completed fight decrements unmatched flags. Meeting the flagged opponent — win or lose — consumes the flag (no penalty even on a loss). Lifetime beefs-started drives the **Controversy** / **Serial Beefcake** badges.

---

## 12. Notoriety (Fame)

Career fame score. Sets per-fight iron bonuses and unlocks recognition. Never fully resets — floored at the fighter's peak tier.

### 12.1 Tiers
| Tier | Score Range | Iron Bonus |
|---|---|---|
| Unknown | 0–999 | +0% |
| Prospect | 1,000–4,999 | +5% |
| Rising Star | 5,000–14,999 | +12% |
| Contender | 15,000–39,999 | +22% |
| **Star** | **40,000**–79,999 | +35% |
| Legend | 80,000+ | +50% |

### 12.2 From Fights
| Outcome | Amateur | Regional Pro | National | GCS |
|---|---|---|---|---|
| Win KO/TKO | +80 | +200 | +500 | +1,200 |
| Win Submission | +70 | +175 | +450 | +1,000 |
| Win Unanimous Dec | +40 | +120 | +300 | +700 |
| Win Split Dec | +25 | +80 | +200 | +500 |
| Draw | +10 | +30 | +80 | +200 |
| Loss by Decision | −10 | −30 | −80 | −150 |
| Loss by Finish | −20 | −60 | −150 | −300 |

### 12.3 Bonus Events
Winning a Title Shot +200; Defeating the Nemesis +150; Comeback win +150; First finish in tier +100; Fight of the Night +200; Giant Killer (beat 10+ OVR above) +300; 5/10/20 win streak +100/+250/+500. **Missing weight −200.**

### 12.4 One-Time Milestones
10 wins +150; 25 wins +400; 50 wins +800; 10 KO/TKO wins +300.

### 12.5 Floor, Decay & Freeze
- **Peak Tier Floor:** fame never drops below the floor of the fighter's highest-ever tier.
- **Inactivity Decay:** >20 days without fighting decays fame 1%/day to the floor.
- **Freeze:** after 3 consecutive losses fame is frozen until the next win. Nemesis / Title-shot victory bonuses always apply even while frozen. *(No "Mental Reset" gate — a losing streak freezes fame but never blocks fighting.)*

---

## 13. Sponsorship Contracts

Sign sponsor deals that pay per-fight iron + lump-sum clause bonuses.

### 13.1 Slot Cap by Fame Tier
Unknown 0, Prospect 1, Rising Star 2, Contender 2, Star 3, Legend 4.

### 13.2 How Contracts Work
A pool of **4 sponsor offers refreshes every 7 days**, gated by fame tier. Active contracts pay per-fight iron; completing the clause pays bonus iron + fame and closes successfully; breaking ends with a fame penalty; time-limited clauses expire silently. Dropping costs half the break penalty. Sponsors completed/broken/dropped this week don't reappear until the next rotation (anti-farm). Some contracts also award **Energy Drinks** (`rewardDrinks` 2–4) — see §15.

### 13.3 Clause Types
Win Next N · Finish Next N · Win Any N · Land One KO · No Weight Miss · No Finish Loss.

---

## 14. Events: Fight Card Predictions

The Events tab runs a weekly NPC fight card the player bets on for fame and iron; it resolves automatically at the end of its 7-day window.

- **The card:** 5 fights from non-champion GCS fighters — 2 Prelim (OVR 70–87), 2 Main Card (OVR 88+), 1 Headliner (highest combined-OVR pair).
- **Predictions:** pick a side (A / Draw / B) and a method (KO/TKO, Sub, Decision); locks are final; any subset may be locked.

| Slot | Exact (Winner+Method) | Winner Only | Wrong Winner |
|---|---|---|---|
| Prelim | +100 fame, +200 iron | +30 fame | −20 fame |
| Main Card | +200 fame, +400 iron | +75 fame | −40 fame |
| Headliner | +300 fame, +500 iron | +100 fame | −50 fame |

On resolution, every NPC fighter's record and history update (the GCS roster accumulates real history). A multi-fight reveal modal shows results on the first Events visit after resolution.

---

## 15. The Shop & Premium Items

The Shop sells consumables for cash (iron). A separate premium currency, the **Energy Drink**, is mostly *earned* through play and can also be bought in bundles.

### 15.1 Cash Items
| Item | Effect | Price (Iron) |
|---|---|---|
| Energy Shot | +30 energy, instant | 600 |
| Training Boosters | +X% XP to focus stats for N training sessions | 500–1,900 (by tier) |
| Pre-Fight Supplements | One-fight stat buffs applied in camp | 600–1,150 |

Inventory caps at 99 per item. Boosters consume one charge per training session; supplements apply to the next fight only.

### 15.2 Energy Drinks (premium, +50 energy each)
Earned free through play, or bought in cash/real-money bundles (bundle pricing currently stubbed). **Free-earn sources:**
- **Win streaks:** 5 / 10 / 15 / 20-fight streaks → 1 / 2 / 2 / 3 drinks.
- **Promotions:** each tier promotion → 3 drinks.
- **Sponsor contracts:** select contracts award 2–4 drinks on completion (`rewardDrinks`).

> Design intent: cash items should never be trivially spammable relative to fight
> purses (a buff costs a meaningful fraction of a win), and the premium Energy Drink
> is the "earn it through achievement" reward channel, not a pay-to-win staple.

---

## 16. Media Hub

The **Media** tab is a 5-tab hub for building fame outside the cage.

### 16.1 Podcast (once per calendar day, 5 energy)
Each episode picks **two** segments from the catalog (auto-generates an episode title + podcast name; listener counts scale with fame). **A single target cannot be both trash-talked and respected in the same episode** (beef/respect mutual exclusivity).

| Segment | Reward | Notes |
|---|---|---|
| Recap | +100 fame, +150 iron | After ≥1 completed fight. |
| Breakdown | +200 fame | Technical division analysis. |
| Trash a Rival | +300 fame | Writes a **Beef** flag on a same-tier target. |
| Show Respect | +100 fame | Writes a **Respect** flag on a target. |
| Cryptic | +40 fame | No side effects. |
| Bring On a Guest | +250 fame | Unlocks at Regional Pro+. |

### 16.2 Documentary (once per career)
Unlocks at the **Star** fame tier (**40,000**). A choice-driven retrospective:
**Focus** (Fighter / Underdog / Technician) × **Tone** (+1,500 / +1,800 / +2,200 base fame) × **Timing** (×1.0 / ×1.5 / ×2.0). Fame payout ~1,500–7,400, cash up to ~$8,000, plus the **The Documentary** badge. The Technician focus also grants a 10-session +5% XP booster. A 10-fight deferred-timing fallback prevents the unlock from being permanently missed.

### 16.3 Appearances
One-off media gigs on a 3-instance weekly rotation: **Magazine Cover** (tiered fame 150–1,500), **Podcast Guest** (+350 fame, flag), **Undercard Feature** (armed now, pays on next fight), **Brand Deal Clip** (sponsor-gated cash), **Charity Exhibition** (+200 fame).

### 16.4 Rivalry Board
A live view of all active **Beef** / **Respect** flags and the current **Nemesis**, with their windows and payoffs.

### 16.5 Archive
Read-only history of podcast episodes, documentary, appearances, and post-fight interviews.

---

## 17. Health, Stamina & Injuries

- **Health** 0–100; depletes from fight damage (KO/TKO loss → 0); regenerates +1 HP / 5 min (~8h for a full heal).
- **Stamina** 0–100 (higher with some backstories/conditioning); affected by weight cut, fight activity, exhaustion.

### 17.1 Injuries
| Injury | Source | Penalty | Heals In | Blocks |
|---|---|---|---|---|
| Cut | Fight | None | 2 days | Fighting |
| Bruised Rib | Fight | −10 Max Stamina | 2 days | — |
| Broken Nose | Fight | −3 CHN | 3 days | — |
| Broken Hand | Fight | −20 STR | 6 days | Bag/pad work |
| Sprained Ankle | Sparring | −15 LEG | 5 days | — |
| Torn Ligament | Sparring | −10 STR, −10 LEG | 6 days | Fighting |
| Concussion | KO/TKO or Sub loss | −2 CHN | 4 days | Fighting + sparring |

**Healing model:** every injury ticks down once per 24h and auto-clears — **no permanent dead ends**. The Hospital shows a live countdown. Auto-heal injuries clear free over time (iron can skip the wait); doctor-required injuries (Cut, Broken Nose, Concussion, Torn Ligament) also auto-heal but block fighting/sparring while active, so waiting has a real cost.

### 17.2 New-Fighter Injury Grace
During a fighter's **first 3 fights**, no fight-blocking injury (Concussion, Cut, Torn Ligament) is ever inflicted (fights or sparring). Non-blocking injuries can still occur. After 3 recorded fights the grace expires.

---

## 18. The Hospital

Iron-paid services to skip recovery, fast-clear blocking injuries, or restore HP.

- **Doctor Visit:** clears one doctor-required injury — Cut (10E/200), Broken Nose (10E/400), Concussion (20E/1,500), Torn Ligament (20E/2,000).
- **Skip Recovery:** clears one auto-heal injury — Bruised Rib 600, Sprained Ankle 800, Broken Hand 1,200 (iron only).
- **Health Restoration:** Quick Patch (+25 HP / 250), Recovery Bay (+50 HP / 400), Full Restoration (→100 HP / 700). Cost pro-rates to HP actually delivered.
- **Full Recovery Package:** heals every active injury at a 15% bulk discount (2+ injuries).

No tier gating on any service.

---

## 19. Comeback Mode & The Nemesis System

- **Comeback Mode:** any loss activates it. Next fight's XP ×1.5 and iron +30%; winning earns the **Comeback Kid** badge (once per career) and clears the mode. No "Mental Reset" — a losing streak only freezes fame (§12.5) and activates comeback.
- **Nemesis:** an opponent who beats you becomes your Nemesis (only one at a time). They appear in offers and promise **+150 fame** for the rematch win (even while fame is frozen). Two straight title-shot losses make that champion the Nemesis. Defeating them clears the flag; promotion past a lower-tier Nemesis clears it automatically.

---

## 20. Career Page, Badges, Feed & Octagon Gazette

### 20.1 Career Page
The **Career** tab has two sub-tabs:
- **Feed** — reverse-chronological timeline (see §20.4).
- **Profile** — the player's full profile: the customized banner (same cosmetic banner as the sidebar; no avatar), pinned badges, a "Customize Banner" entry, three cards (Stats / Career / **Championship Belts**), the full **Badge grid**, plus Media Career and PVP History (empty — PVP is not implemented).

The dashboard player-identity card is clickable and deep-links to the Profile sub-tab.

### 20.2 Badges (~49 across 5 categories)
Permanent profile markers. Categories: **Career**, **Championships**, **Style**, **Gym**, **Media**. Locked badges show progress bars where applicable; newly-unlocked badges show a **NEW** corner flag (acknowledged by viewing the Profile — no modal). Examples:
- **Career:** First Blood, 10/25/50 Wins, win streaks, Division Dominator, The Long Game, Veteran.
- **Championships:** Amateur / Regional Pro / National / GCS Contender (non-winnable) / GCS Champion — **derived from promotion tier**; the belts on the Profile mirror these.
- **Style:** Finisher, KO Artist, Sub Hunter, Decision Machine, Iron Chin, Iron Will, Giant Killer, Comeback Kid, Fight of the Night, Perfect Camp, Called It, Nemesis Slayer, beef/respect badges.
- **Gym:** Rank-4 mastery badges (one per gym) **plus training-session milestones — Gym Regular (50), Gym Rat (100), Tireless (250)**, driven by lifetime `careerTrainingSessions`.
- **Media:** On the Mic, Media Star, The Documentary, Controversy, People's Champion, Star Power.

Championship and other state-derivable badges **self-heal** on Profile load (silently), so the Profile and the belts always agree without a migration.

### 20.3 Banner Customizer
Four cosmetic layers — Background (8), Frame (5), Accent Color (7), Pinned Badges (pin up to 3). Pieces unlock by fame tier and milestones. Purely cosmetic.

### 20.4 Career Feed
Reverse-chronological log: fight results, promotions, title eligibility/wins, Nemesis set/cleared, badges earned, sponsor events, callout wins, beef lapses, prediction outcomes, fame milestones.

### 20.5 The Octagon Gazette
A daily newspaper that opens automatically on the first login each day (UTC). Templated headlines recapping career/world events; never on a zero-fight account, nor on subsequent same-day logins. Three zones (Lead 1, Secondary 2, In Brief ≤3). Lead picked by priority: Event Result → First Title-Fight Loss → Title Fight Result → First Loss → Promotion → Rank Entry → Win Streak → Rank Jump → Last Fight Result → Division Spotlight. Purely informational.

---

## 21. Onboarding Tutorial

New accounts run a guided tooltip sequence through the core loop: fighter profile → gym → first training session → request/read a fight offer → camp (Fighter Report, session selection, weight cut) → fight result and fame → rankings → events → hospital. Ends with a completion modal granting a **500-iron signing bonus**. Legacy accounts are marked complete and never see it.

---

## 22. The Proving Ground (PvP)

An asynchronous, click-resolved player-vs-player ladder that runs alongside the PvE career/title path. There is no real-time coordination: you attack a stored opponent, the fight resolves instantly against their **defense gameplan**, and they see the result the next time they log in. The Proving Ground has its own *economy* — its own ladder, currency (Division Points), and seasonal belt — and does **not** touch your PvE rank, tier, or championship. But it is **not** physically independent: a PvP fight uses, and changes, your **one real body** — HP, injuries, and stat XP carry between PvP and PvE in both directions (§22.11).

### 22.1 Entering the Proving Ground
Each PvP fight costs **15 energy** (shared with the career energy bar). You pick an opponent from a short matchmade list, choose a **gameplan**, and fight. Your own record carries a **defense gameplan** that the engine uses whenever someone attacks you while you're offline — a successful defense is how you hold position without logging in. Fights reuse the same pure, stat-driven fight simulator as PvE (no weight variable — combat is decided by the eight stats), so a PvP fight is a fair stat contest, not a coin flip.

### 22.2 Division Points & Divisions
Standing is measured in **Division Points (DP)**. Your **division** is derived purely from your DP (never stored authoritatively) — there are five, by DP floor:

| Division | DP floor | Promotes at |
|---|---|---|
| Prospect | 0 | 300 |
| Contender | 300 | 1,200 |
| Challenger | 1,200 | 2,500 |
| Elite | 2,500 | 5,000 |
| Champion | 5,000 | — (top) |

On a win that crosses your division's promote threshold you **promote**: division advances and DP resets to the new floor (no carry). Divisions never demote mid-season — a loss floors your DP at your current division's floor; the only downward movement is the season-end soft reset (§22.6).

### 22.3 Earning & Losing DP
Base: **win +120**, attacker **loss −55**, defender **loss −28**. A draw is **0**. A defender who repels an attack gains **nothing** (defense holds position, it doesn't farm DP). Win modifiers apply in this order, then clamps:

1. **Belt Holder bonus** +50 (flat) — beating the current belt holder.
2. **Rivalry Resolved** +25 (flat) — the win that settles a rivalry (§22.5).
3. **Bracket bonus** +10% (OVR gap 6–10) or +25% (gap 11–20) — reward for fighting up.
4. **Season twist** ×(1+pct) when the win method matches the active twist (§22.6).
5. **Streak multiplier** ×1.25 once you're on a 3+ win streak.
6. **Repeat penalty** ×0.5 (2nd fight) / ×0.25 (3rd+) against the **same opponent in the same ISO week** — discourages farming one target.

Clamps: a win always grants **at least +1**; a loss never exceeds **−100**; a loss can't drop you below your division floor.

### 22.4 Matchmaking & Gameplans
Matchmaking surfaces up to **5** opponents from your season pool, expanding an OVR window (±5 → ±10 → ±15 → ±20) until it fills, then ranking by DP closeness. Each candidate shows difficulty, any bracket bonus, and belt/rival flags. **Gameplans** reweight your stats for the bout — **five approaches**, each amplifying a stat cluster and paying a cost, with the grappling/counter plans also nudging fight behaviour via the engine's strategy hooks:

| Gameplan | Boosts | Costs | Behaviour |
|---|---|---|---|
| **Striking** | STR · SPD · LEG | CHN | hits harder on the feet |
| **Wrestling** | WRE · GND | CHN | shoots takedowns far more often |
| **Submission** | SUB · GND | CHN (slight) | hunts subs + takedowns |
| **Counter** | WRE · SUB | STR · SPD | takes −10% incoming strike damage |
| **Balanced** | — | — | engine defaults |

**Balance:** the multipliers are deliberately **small** — the fight engine is a damage race where small edges snowball, so gameplan is tuned to a *modest* swing, not a decider. On identical fighters, the right gameplan wins ~51–57% vs a Balanced mirror (validated by Monte-Carlo against the real engine). Every build has an approach that fits its strengths — strikers, wrestlers, and grapplers all have a real choice (the picker flags the one that suits your stats). You pick your attack gameplan per fight; your **defense gameplan** is set once (from the **Defense** tab in the Proving Ground, available any time — not just after you've been attacked) and is used when you're attacked offline. New records default to **Balanced** until changed. (FIQ is deliberately untouched by every gameplan — it has no in-combat effect today; a separate FIQ pass is planned.)

### 22.5 The Belt, Rivalries & Inactivity Decay
- **The Belt:** the #1 Champion-division player (with at least one fight) at season end is crowned belt holder, entering the Hall of Fame and earning the belt reward.
- **Rivalries:** beating the same opponent repeatedly in a season builds a rivalry; the **3rd win resolves it** and pays the +25 rivalry bonus on that fight.
- **Inactivity decay:** going **7 days without a PvP fight** costs **−10 DP** (floored at your division floor; Prospects are exempt). It nudges idle ladders without punishing newcomers.

### 22.6 Seasons, Twists & Rewards
Seasons run **70 days**. Each season carries one **twist** that rewards a style of finish: *Iron Circuit* (standard), *Blood Sport* (KO/sub +25%), *Iron Fist* (KO +30%), *Ground War* (sub +30%), *The Marathon* (decision +20%), *The Contenders* (streak bonus from 3 wins). At season end, every player with at least one fight is paid by their final division; the belt reward **replaces** the Champion reward (no stack):

| Final division | Iron | Fame | Energy drinks | Badge |
|---|---|---|---|---|
| Prospect | 500 | 500 | 0 | — |
| Contender | 1,200 | 1,200 | 0 | — |
| Challenger | 2,500 | 2,500 | 0 | Challenger |
| Elite | 5,000 | 5,000 | 2 | Elite |
| Champion | 10,000 | 10,000 | 5 | Champion |
| **Belt holder** | 15,000 | 15,000 | 7 | Belt |

After payout, a **soft reset** drops each player one tier into the next season (champion→contender, elite→challenger, challenger→contender, contender→prospect, prospect→prospect), DP set to the new floor — so every season is a fresh climb that still rewards last season's standing with a head start. A new season is seeded automatically.

Seasons are controlled by a per-season **config block** (`Season.config`), so behaviour is flippable season to season without code changes — see the Open format below.

### 22.7 Season 1 — The Open (cross-weight-class) format
Normally PvP runs **one season per weight class** (four parallel ladders, four belts). At launch the player pool is too thin to populate four ladders, so **Season 1 is a single "Open" season** flagged `config.crossWeightClass = true`:

- **One merged ladder** across all weight classes, **one belt**, **one reward pass** — the densest possible opponent pool and a single, uniquely prestigious Open belt.
- Fairness is preserved by the existing OVR matchmaking window (the fight engine has no weight variable, so a same-OVR cross-class fight is mechanically identical to a same-class one) plus the bracket bonus for fighting up. No new guardrail.
- Throughout the Open season, opponents' **real weight classes are shown** (opponent cards, ladder, pre-fight, fight result) so cross-class matchups read as intentional.
- **At season end, players redistribute back into their real weight class** for the normal per-weight-class Season 2 (the four-ladder structure resumes), carrying their soft-reset standing. Each record stores the player's real weight class for this purpose.

The flag is **not** hardcoded to Season 1 — `crossWeightClass` can be set on any future season if the population ever needs merging again. Season 2+ default to per-weight-class.

### 22.8 The Fight Result screen
A PvP fight resolves to a result screen led by the **DP swing** (the score), then the outcome + method, opponent line, context pills (streak/rivalry/promotion/belt), a **DP breakdown panel** itemising every modifier, ladder movement (rank before → after), contextual banners (promotion + shield, streak up/broken, rivalry resolved, belt-holder defeated), and a Season-DP progress bar toward the next division. Actions: Fight Again / Back to Ladder.

### 22.9 New-player onboarding
A staged entry path softens the cold start so a newcomer is never farmed or hopelessly behind. Lifetime onboarding state lives on the Fighter (`pvpOnboarding` subdoc); the per-season catch-up window lives on the PVPRecord.

- **Unlock gate.** The Proving Ground is locked until the player has **3 career (PvE) wins**. The nav tab stays visible but shows a locked screen with a `wins/3` progress bar — players know PvP exists before they can enter. Unlock is checked after every PvE fight resolution; it fires once and is permanent. *(Applies in Season 1.)*
- **Placement matches.** A player's **first 3 PvP fights ever** are placement bouts: they run the real fight engine but award **0 DP to both sides**, with no streak, no rivalry, and no repeat-penalty contribution — and the **defender's record is left completely untouched** (placement players can only be attackers; they're hidden from matchmaking as defenders). After fight 3 the player is seeded by their placement record: **3 wins → Contender / 400 DP, 2 → Prospect / 200, 1 → Prospect / 100, 0 → Prospect / 0**. *(Season-1 exception: skipped — Season-1 entrants start Prospect / 0 immediately.)*
- **New Competitor Shield.** Granted once, at placement completion: the player **cannot be challenged for 7 days or until they make their first attack**, whichever comes first (going on offense forfeits the protection). Shielded players still appear on opponent cards with a "Protected" pill but can't be challenged. *(Season-1 exception: not granted.)*
- **Mid-season catch-up.** A player whose record is created **more than 14 days after season start** gets a 7-day window in which **DP gains are ×2** (the final multiplier in the DP chain; gains only, never losses). **Capped: it does not apply once the player reaches Elite or Champion**, so it accelerates a late joiner to mid-ladder without rocketing them into belt contention. *(Season-1 exception: not applied — everyone joins together.)*
- **First-season bonus.** The first time a player completes any PvP season (≥1 fight) they receive a one-time **+500 iron / +100 fame** on top of their normal division rewards. *(Applies in Season 1.)*

**Season-1 exception summary:** unlock gate APPLIES; placement, shield, and catch-up are SKIPPED; first-season bonus APPLIES. Detected via `season.seasonNumber === 1` at record creation.

### 22.10 Browsing the ladder & challenging from a profile
The Ladder tab is a full, filterable standings view, not just a top-N list:

- **Filters.** A division selector (Prospect → Champion, defaulting to the player's own division) and — in a cross-weight (Open) season — a weight-class selector (All / FW / LW / MW / HW, defaulting to All); in a normal per-weight-class season the weight filter is hidden. A **division summary** row shows the live fighter count in each division. All counts and the table respect the active filters; in an Open season the weight filter and the per-row weight-class tag key on each fighter's **real** weight class.
- **Your position** stays pinned above the table regardless of the active filter, showing your rank, DP, record, streak, and progress to the next division (or, for a Champion, your rank among champions and the weeks left in the season).
- **The table** is paginated (20 per page, "Load More") and ranks fighters within the selected division by DP. Rows carry contextual tags (Belt Holder, Rival, You, Protected, streak ×1.25, cross-weight class), highlight the belt holder and your own row, and a "Last Active" column hints at who is at risk of inactivity decay.
- **Profiles & challenges.** Clicking any fighter opens a **read-only** version of their Career Profile (no edit controls). If they're a valid target in the current season, a **Challenge** button there is a shortcut into the pre-fight flow — but it never bypasses matchmaking: it's disabled for protected (new-competitor-shield) fighters and for anyone outside the player's OVR matchmaking range, and hidden for fighters not in the same active season.

### 22.11 Real consequences — HP, injuries & stat XP
A PvP fight resolves with the **same physical and progression consequences as a PvE fight** — there is one body, and it gets hit in both modes. The post-fight consequence logic (HP, injuries, stat XP) lives in **one shared home** that PvE and PvP both call, so the rules are identical by construction.

- **HP.** Each fighter enters the bout at their **real current health** (not a fresh 100) and ends at the engine's result; a KO/submission loss zeros their HP. Health regenerates over time exactly as in PvE. A low-HP fighter is genuinely weaker — and an easy mark on defense.
- **Injuries.** Both fighters roll the **same injury system** as PvE: a KO/sub loss guarantees a Concussion; otherwise a single fight-injury roll (FIQ- and tier-weighted). These are **real injuries** — they appear in the Hospital, heal over time, and a fight-blocking injury gates **both** your PvP fights *and* your PvE career until it heals or you visit the doctor. The new-fighter injury grace (§17.2) still applies.
- **Stat XP.** Both fighters earn post-fight stat XP from the same §10.3 table — so PvP is a real (if uncontrollable, all-stats) progression avenue, including the 96–99 fight-XP-only band.
- **Applied to both fighters, online or offline.** A defender takes full HP loss, injury rolls, and XP even while logged out (their defense-results screen reports what it cost them). The defender is reconciled to their true current state before the fight; a fighter with a fight-blocking injury **cannot be challenged** (shown "Recovering"), which also caps how badly an offline player can be ground down.
- **What's NOT shared.** PvP keeps its own economy — DP, season rewards, and the 15-energy attack cost — and does **not** pay the PvE iron purse, notoriety, or trigger nemesis/comeback. The attacker pays 15 energy; the defender pays no energy.
- **Anti-farm guard.** Stat XP from repeat fights against the same opponent in a week is reduced (×0.5 the 2nd, ×0.25 the 3rd+, mirroring the DP repeat penalty), so trading wins can't farm XP.
- **Exception — placement.** A placement bout (§22.9) is the one fight where the *defender* takes no physical consequences (they never opted in); the attacker still does.

---

## 23. System Interconnections

The core loop: spend energy to train at a gym → training earns XP → XP raises stats → higher stats raise Overall → a higher rating qualifies for better gyms and title shots. Before each fight, run a camp (conditional bonuses) and pick a weight-cut gamble; the fight pays iron, notoriety, and XP.

Notoriety is both a meter and an economy: spent on callouts (forced matchups with full intel), it gates sponsorship slots, and it's earned/lost through fights, event predictions, and media. Beef/Respect flags create grudge and rematch incentives across the division. The Shop and earned Energy Drinks let the player convert iron/achievement into tempo (energy, XP, fight buffs).

The **Proving Ground** (§22) is a parallel economy: the same trained stats and OVR that drive the PvE career also determine PvP matchmaking and fight outcomes, and season-end PvP rewards pay back into the shared currencies (iron, fame, energy drinks, badges) — so ladder climbing feeds the career and vice versa, without either path gating the other.

---

## Appendix A — Player-facing reference (the Library)

The in-game **Library** (`frontend/src/components/library/libraryContent.js`) is the
player-facing source of truth for *how systems work in-product*, kept current per the
**mandatory rule** (CLAUDE.md → "Documentation upkeep"): *after every major change,
update BOTH this GDD and the Library.* This GDD is the *design-intent* source of truth;
the Library is *what the game tells players*.

**`GAME_GUIDE.md` is a read-only, auto-generated export of the Library** — not an
independently-authored doc. After editing `libraryContent.js`, regenerate it with
`node scripts/generateGameGuide.mjs`; never hand-edit the guide. This keeps the
out-of-game guide in permanent sync with the Library and removes the drift risk of a
third hand-maintained copy.

**Doc roles at a glance:**
- `docs/GDD.md` — design intent + balance rationale + roadmap (agent-readable; `Ground-And-Pound-GDD.docx` is the Word authoring original).
- Library (`libraryContent.js`) — single source of truth for player-facing system descriptions.
- `GAME_GUIDE.md` — generated export of the Library for out-of-game reading (regenerate, don't edit).

## Appendix B — Not implemented / roadmap

Ideas from earlier design drafts that are **not** in the game (do not propose against
them as if they exist): Odd Jobs / Notice Board income, equipment + durability, daily
missions, fighter age / retirement (contradicts the no-end-state principle), real-money
subscription.

**PvP (The Proving Ground) is now implemented** — see §22. It introduces a
season-scoped, PvP-only Hall of Fame for belt holders; this does not contradict the
no-end-state principle (the career itself never ends — seasons recur and players
redistribute, they are never retired).
