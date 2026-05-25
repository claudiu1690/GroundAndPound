# Ground & Pound — Game Guide

---

## What Is This Game?

Ground & Pound is a text-based MMA career simulation. You create a fighter, train them at specialty gyms, prepare for fights in a training camp, and fight your way up through five promotion tiers — from unknown amateur to GCS champion. Every decision costs energy. Every fight has consequences. There are no levels — your fighter grows through their stats, and your stats grow through training and fighting.

---

## Creating Your Fighter

When you create a fighter you choose:

- **Weight Class** — Featherweight (145 lbs), Lightweight (155 lbs), Middleweight (185 lbs), or Heavyweight (265 lbs). You stay in this weight class for your career.
- **Fighting Style** — Determines which stats start higher and how your Overall Rating is calculated. Eight styles: Boxer, Kickboxer, Muay Thai, Wrestler, Brazilian Jiu-Jitsu, Judo, Sambo, and Capoeira.
- **Backstory** (optional) — A background that gives a small permanent bonus.

### Backstory Bonuses
| Backstory | Bonus |
|---|---|
| Street Fighter | CHN +5, reduced KO chance |
| College Wrestler | WRE +8 |
| Kickboxing Champion | STR +6, LEG +4 |
| Army Veteran | Max Stamina +10 |
| MMA Prodigy | All stats +2 |
| Late Bloomer | +25% XP from all training sessions |

---

## The Eight Stats

Your fighter has eight combat stats, each rated 1–100.

| Stat | Full Name | What It Does |
|---|---|---|
| STR | Striking Power | Heavy hands, punishing shots |
| SPD | Hand Speed | Fast combinations, hard to time |
| LEG | Kicks | Active leg attacks, targets head and body |
| WRE | Takedown Offence | Shoots early, high takedown success rate |
| GND | Ground Control | Dominant from top position, heavy ground and pound |
| SUB | Submission Game | Chains submission attempts |
| CHN | Chin | Absorbs damage, rarely stopped by strikes |
| FIQ | Fight IQ | Reads setups, rarely makes tactical mistakes |

Your **Overall Rating** is calculated from all eight stats, weighted by your fighting style. Each style has primary stats (weighted 1.2×), secondary stats (1.0×), and off-style stats (0.85×).

---

## Energy

Everything you do costs energy. Maximum is 100. It regenerates at 1 point per minute automatically.

| Action | Energy Cost |
|---|---|
| Training sessions | 3–8 (varies) |
| Accepting a fight | 10–20 (varies by tier) |
| Hospital treatment | 10–20 (varies by injury) — also costs iron |

---

## The Promotion Tiers

Your career moves through five tiers. Moving between tiers is no longer fully automatic — some tiers require a **title shot** (see Champions & Title Shots below).

| Tier | Overall Range | Fights Per Day | Signing Fee |
|---|---|---|---|
| Amateur | 0–30 | 8 | 400 |
| Regional Pro | 30–48 | 4 | 2,000 |
| National | 45–65 | 2 | 10,000 |
| GCS Contender | 60–75 | 1 | 25,000 |
| GCS | 62–95 | 1 | 50,000 |

**Promotion gates:**
- **Amateur → Regional Pro**: Auto-promotes at OVR 30
- **Regional Pro → National**: Must beat the Regional Pro champion (title shot)
- **National → GCS Contender**: Must beat the National champion (title shot)
- **GCS Contender → GCS**: Auto-promotes at OVR 62
- **GCS**: Final tier — defend your belt indefinitely

---

## Training & The Gym System

### How It Works

Training happens at gyms. There is **one free community gym** always available, plus **ten specialty gyms** that require a **weekly iron membership**. You can have only one paid membership active at a time — paying a new gym cancels your previous one. Ranks you earn at a gym persist forever, even if you switch away.

### The Free Gym

**Community MMA Center** — Always free. Trains all stats at 0.6× base XP. No ranks, no progression. It's the safety net when you can't afford a membership.

### Specialty Gyms

Each specialty gym focuses on 2–3 stats and offers faster XP in those areas. Training at a gym earns you rank progress that unlocks permanent rewards.

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

**XP multipliers** are tiered:
- Amateur-tier gyms: 1.0× base, 1.25× on focus stats
- Regional Pro gyms: 1.15× base, 1.4× on focus stats
- National gyms: 1.3× base, 1.5× on focus stats
- Elite Fight Academy: 1.5× on all stats

There are **no stat caps**. Any gym can train any stat to 100 — but you'll do it much faster at the right gym.

### Gym Ranks

Each specialty gym has 4 ranks. You earn them by training sessions and scoring specific types of wins while enrolled.

| Rank | Unlocks |
|---|---|
| 1 | Access to the gym's training sessions (granted on joining) |
| 2 | A unique advanced session only available at this gym |
| 3 | +5% XP to focus stats permanently |
| 4 | A utility perk + permanent badge for your fighter profile |

Wins only count at your **currently active paid gym**, and only if the win type matches the gym's discipline (KO/TKO for striking gyms, Submission for BJJ, Decision for tactical gyms, etc.). Rank 3 and 4 require an iron payment in addition to the training and win thresholds.

### Rank 4 Perks & Badges

Reaching Rank 4 at any gym earns a permanent badge on your fighter profile and a utility perk.

| Gym | Badge | Perk Effect |
|---|---|---|
| Iron Fist Boxing | Champion Boxer | +1 camp slot when fighting a striker |
| Dragon Kickboxing | Grand Master Kickboxer | Cardio Push session costs 1 less energy |
| Warrior Muay Thai | Grand Kru | Conditioning sessions raise Max Stamina by +2 instead of +1 (same 120 cap) |
| Apex Wrestling | Olympic Wrestler | Takedown Defence always at least PARTIAL match |
| Gracie Ground Game | BJJ Black Belt | Submission Escapes gives +5% extra bonus |
| Renzo Combat | Submission Master | Fighter Report shows 1 extra fight log |
| Precision MMA Lab | Fight Scientist | Game Plan Study becomes MATCHED instead of PARTIAL |
| Titan Performance | Titan | Weight cut bad roll floor raised by 3 |
| The War Room | Tactician | 30% chance opponent's wildcard is revealed |
| Elite Fight Academy | Elite Master | +10% fame from all fights |

### Training Sessions

Base sessions available at most gyms:

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
| Film Study | 3 | FIQ |
| Conditioning | 4 | Raises max stamina |

Each gym only offers sessions that train its focus stats, plus sparring. The free community gym offers everything at reduced XP. Injury healing happens passively over time or at the Hospital — there's no in-gym recovery session.

### How Stats Level Up

XP accumulates in a bank for each stat. Once full, the stat increases by one point. The more a stat grows, the more XP each additional point costs.

| Stat Range | XP Per Point |
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
| 96–99 | 8,000 — fight XP only, cannot be trained at a gym |

Stats 96–99 can only grow from fights.

---

## Fight Offers

When you are ready to fight, you request offers from the promoter. You receive three cards — one Easy, one Even, and one Hard opponent. A fourth **Title Shot** card appears when you're eligible (see below).

| Type | Opponent Strength |
|---|---|
| Easy | 3–5 Overall below you |
| Even | Within 3 Overall |
| Hard | 2–5 Overall above you |
| Title Shot | The champion of your current tier |

Accepting a fight costs energy (10–20 depending on tier) and enters the training camp phase.

### Callouts (Fame-Driven Matchmaking)

In the Fight tab, the **📣 Call Out** button lets you spend fame to force a specific opponent into your next Hard offer slot. The roster modal shows opponents in your weight class — same tier (cheaper) and one tier above ("stretch", more expensive).

**Cost formula:**

| Roster | Base | + Per OVR Gap |
|---|---|---|
| Same Tier | 200 fame | +50 each |
| Stretch (+1 Tier) | 800 fame | +75 each |

Capped at 3,000 fame. Minimum 100. You can cancel an active callout for a full fame refund any time before fighting.

**What you get:** the opponent appears in your next Hard slot with a gold border and "📣 Called out" pill, and their **Fighter Report shows full intel** — every stat marked Confirmed, no fog of war.

**On a callout win:**
- **+25% iron purse**
- **+30% fame** (grudge bonus, stacks with all other notoriety modifiers)
- **Callout Win** badge (unlocks the matching banner piece)

Losing a callout burns the fame you spent. No additional penalty.

---

## Champions & Title Shots

Each professional tier (Regional Pro, National, GCS) has a persistent NPC champion per weight class. You cannot promote past these tiers without beating the champion.

### How to Earn a Title Shot

1. Your Overall Rating must reach the next tier's threshold (OVR 45 for National, OVR 60 for GCS Contender, etc.)
2. Once reached, a **pending promotion** is set — but you do not promote yet.
3. You must accumulate **3 wins at your current tier** before the title shot offer appears.
4. The title shot appears as a 4th gold-bordered card in your fight offers.

### The Championship Fight

Champions are tougher than regular opponents:

- They receive a **+5% boost to all stats** during the fight.
- Their **Fighter Report shows only 2 visible fight logs** instead of 5 — less intel, more guessing, more reliance on gut.
- A **wildcard** is still hidden from the report, as always.

Title fights get a dedicated **gold theme** across the entire pipeline — fight offer card, Fighter Report banner, Fight Camp header, Camp Summary, and the post-fight "New Champion" victory screen.

Title fights always run a **full 5-slot training camp** — never short notice.

### Winning a Title

- You dethrone the champion.
- You **promote to the next tier**.
- You earn **+200 notoriety** on top of the normal fight reward.
- You earn a permanent **Champion** badge on your fighter profile.
- A new NPC champion is seeded from the highest-rated remaining opponent in the old tier.

### Losing a Title Shot

- You enter a **2-win cooldown** — the title shot card stays visible but greyed out until you win 2 more fights.
- If the champion beat you twice in a row, they become your **Nemesis**.
- Your pending promotion stays set — you can always try again.

---

## Fight Camp

Between accepting a fight and fighting it, you have a training camp. Camp does not improve your stats permanently — it prepares conditional bonuses that activate during the fight when specific situations occur.

### Camp Slots

| Tier | Normal Slots | Short Notice |
|---|---|---|
| Amateur | 2 | 1 |
| Regional Pro | 3 | 1 |
| National | 3 | 1 |
| GCS Contender | 5 | 2 |
| GCS | 3 | 1 |
| **Title Fight** | **5** | **2** |

### Camp Sessions

| Session | Energy | Bonus When Triggered | Best Used Against |
|---|---|---|---|
| Takedown Defence | 6 | Sprawl success +25% | Wrestlers, Judoka, Sambo |
| Submission Escapes | 6 | Escape probability +20% | BJJ, Sambo, Submission Hunters |
| Striking Accuracy | 5 | Strike damage +15% | Defensive fighters, Counter Strikers |
| Cardio Push | 5 | Stamina drain −20% when below 70% | Pressure Fighters, high-volume opponents |
| Game Plan Study | 4 | Opponent damage −6% (always half-active) | Any opponent — safe general choice |
| Body Shot Focus | 5 | Body damage +30%, opponent stamina drain +15% | High-chin fighters, weak conditioning |
| Clinch Control | 5 | Clinch damage +25% | Kickboxers, Muay Thai, Clinch Bullies |
| Ground & Pound Posture | 6 | GnP damage +20% from top | Guard players, submission-light opponents |
| Sparring (general) | 8 | +3% all stats (always active) — 3% injury risk | Generic fallback — expensive and risky |

### Match Status

Your sessions are rated against what the opponent actually brings:

| Status | Meaning | Bonus Applied |
|---|---|---|
| Matched | Directly counters opponent's game | 100% |
| Partial | Broadly useful but not targeted | 50% |
| Unmatched | Nothing in the opponent's style justifies this | 0% |
| Wrong | Contradicts opponent profile | 0% + penalty |

Game Plan Study always counts as Partial regardless of opponent — it is the safe fallback.

Repeating the same session gives diminishing returns: the second time you do it earns 60% of the value, the third time 30%.

### Camp Rating

Your camp is graded S through F based on total points earned. This rating is informational — it does not give you a flat stat modifier.

| Grade | Points | Label |
|---|---|---|
| S | 90–100 | Elite preparation |
| A | 75–89 | Strong preparation |
| B | 55–74 | Good preparation |
| C | 35–54 | Adequate preparation |
| D | 15–34 | Weak preparation |
| F | 0–14 | Poor preparation |

### The Fighter Report

Before you start camp, you receive a scouting report. The report classifies what is known about the opponent's stats:

| Level | Meaning |
|---|---|
| Confirmed | Proven across multiple fights — treat this as fact |
| Suspected | Suggested by 1–2 fights — likely but not certain |
| Unverified | Known stat but insufficient fight evidence |
| Unknown | No data — could be anything |

Champions show less information — their tape is restricted. Use Game Plan Study and Sparring as safety nets when fighting them.

### Wildcards

Every opponent has a hidden tendency — a middle-tier stat that can unexpectedly boost their performance. This is never shown in the report. If you prepared a session that counters it, the bonus is neutralised. If you did not, the opponent gets a hidden +15% advantage in that area.

The **Tactician** perk (Rank 4 at The War Room) has a 30% chance to reveal the wildcard before the fight.

### Camp Injuries

Sparring carries a 3% injury risk per session. If an injury occurs you must choose:

- **Stop camp**: Lose remaining slots, camp grade drops, fight healthy.
- **Push through**: Keep your slots, but carry the injury penalty into the fight.

| Injury | Fight Penalty |
|---|---|
| Bruised Knuckle | STR −10% |
| Twisted Knee | LEG −20%, WRE −10% |
| Rib Strain | Max Stamina −15% |
| Minor Concussion | FIQ −15%, forces camp stop, requires doctor visit |
| Eye Cut | SPD −10%, opponent accuracy +5% |

You can remove a logged session by clicking its filled slot — your energy is refunded.

---

## The Fight

### Weight Cut

Before every fight you choose a weight cut strategy. The result is a gamble — a random stamina roll with a chance to miss weight.

| Strategy | Stamina Roll | Miss Weight Chance |
|---|---|---|
| Easy | +0 (guaranteed) | 0% |
| Moderate | −5 to +10 (random) | 5% |
| Aggressive | −12 to +18 (random) | 20% |

A good aggressive cut gives you a big stamina boost; a bad one leaves you drained before the fight starts. Missing weight costs 20% of your iron purse. The **Titan** perk (Rank 4 at Titan Performance Center) raises the bad roll floor by 3.

### Fight Outcomes

Eight possible results:

- **KO/TKO** (win) — You drop your opponent
- **Submission** (win) — You lock in a tap
- **Decision — Unanimous** (win) — All judges score it for you
- **Decision — Split** (win) — You take 2 of 3 judges
- **Draw** — No winner
- **Loss — Decision** — Judges score against you
- **Loss — KO/TKO** — You get dropped (health forced to 0)
- **Loss — Submission** — You get tapped

### Post-Fight XP

You earn XP distributed across stats based on how the fight ended:

| Result | XP Distribution |
|---|---|
| Win by KO/TKO | STR 30, CHN 15, SPD 10 |
| Win by Submission | SUB 30, GND 20, WRE 10 |
| Win by Decision | All stats 15, FIQ 20 |
| Loss by KO/TKO | CHN 20, FIQ 15 |
| Loss by other | FIQ 25 |

XP is multiplied by an outcome modifier:

| Outcome | Multiplier |
|---|---|
| KO/TKO | 1.3× |
| Submission | 1.25× |
| Decision Unanimous | 1.1× |
| Decision Split | 1.05× |
| Draw | 1.0× |
| Loss by Decision | 0.8× |
| Loss by Finish | 0.7× |

If you are in **comeback mode** when you win, all fight XP is additionally multiplied by 1.5×.

### Iron Earnings

Iron is the game's currency. The base purse is your tier's signing fee. On top of that:

- Win: 100% of purse
- Draw: 50% of purse
- Loss: 70% of purse

Modifiers:
- Higher notoriety tier: +5% to +50% depending on fame
- Comeback mode: +30%
- Championship Pedigree perk (Elite Fight Academy, Rank 4): +10% fame from all fights (indirectly boosts iron via the notoriety tier)
- Missing weight: −20%
- Active **Respect flag** on opponent (you won): +15% iron
- Callout fight win: +25% iron

---

## Post-Fight Interview

After every fight (win or loss), the press interviews you. Three tones to pick, plus skip:

| Tone | Fame | Side Effect |
|---|---|---|
| 🙇 Humble | +100 | Writes a **Respect flag** on the just-fought opponent. If you face them again within 6 fights and win, that fight pays +15% iron. |
| 🔥 Confident | +150 | Pure fame. No flags, no strings. |
| 📣 Trash Talk | +200 | Pick a target from the same-tier roster (within ±6 OVR, excluding fighters you've already beaten). Writes a **Beef flag** on that fighter. |
| Skip | 0 | Move on. No reward, no consequence. |

The Trash Talk picker only shows fighters you can realistically face in your next few offers. For high-OVR or stretch-tier targets, use the **Callout** system instead — it spends fame but guarantees the matchup.

---

## Beef & Respect Flags

Flags are silent contracts you make with rivals. They're created by:

- **Trash Talk** tone in post-fight interviews → Beef flag
- **Humble** tone in post-fight interviews → Respect flag
- **Division Talk** segments on the Podcast → Trash creates Beef, Respectful creates Respect (see Media Hub)

Active flags appear on offer cards as **🔥 Beef** or **🙇 Respect** pills with a colored border. Hover for the remaining window.

| Flag | Origin | Window | On Win | On Lapse |
|---|---|---|---|---|
| Beef | Trash Talk / Podcast | 4 fights | +30% fame (grudge bonus) | −150 fame |
| Respect | Humble / Podcast | 6 fights | +15% iron purse | Silent expiry |

Every fight you complete decrements the window for unmatched flags. Meeting the flagged opponent — win or lose — consumes the flag (without penalty even on a loss).

---

## Notoriety (Fame)

Notoriety is your career fame score. It determines how much iron you earn per fight and unlocks storyline recognition. It never fully resets — a floor is set at your peak tier.

### Fame Drawer

Your fame tier and score are shown in your fighter profile in the left sidebar. The **★ Fame button in the footer** opens the Fame drawer — a side panel that shows:

- Current tier with progress bar to the next threshold
- Status chips (Frozen, Decay warning, Peak floor)
- **Recent fame events** — every fame change you've earned with reason and timestamp (fight wins, milestones, sponsor bonuses, callout spends, prediction outcomes, etc.)
- Deep links to the Contracts, Events, Media, and Callout features

### Notoriety Tiers

| Tier | Score Range | Iron Bonus |
|---|---|---|
| Unknown | 0–999 | +0% |
| Prospect | 1,000–4,999 | +5% |
| Rising Star | 5,000–14,999 | +12% |
| Contender | 15,000–39,999 | +22% |
| Star | 40,000–79,999 | +35% |
| Legend | 80,000+ | +50% |

### Notoriety from Fights

Base rewards depend on outcome and tier:

| Outcome | Amateur | Regional Pro | National | GCS |
|---|---|---|---|---|
| Win KO/TKO | +80 | +200 | +500 | +1,200 |
| Win Submission | +70 | +175 | +450 | +1,000 |
| Win Unanimous Decision | +40 | +120 | +300 | +700 |
| Win Split Decision | +25 | +80 | +200 | +500 |
| Draw | +10 | +30 | +80 | +200 |
| Loss Decision | −10 | −30 | −80 | −150 |
| Loss by Finish | −20 | −60 | −150 | −300 |

### Bonus Notoriety Events

| Event | Bonus |
|---|---|
| Winning a Title Shot | +200 |
| Defeating your Nemesis | +150 |
| Comeback win (after 2+ consecutive losses) | +150 |
| First finish in current promotion tier | +100 |
| Fight of the Night (decision win, opponent below 50% health) | +200 |
| Giant Killer (beat someone 10+ OVR above you) | +300 |
| 5-fight win streak | +100 |
| 10-fight win streak | +250 |
| 20-fight win streak | +500 |

### One-Time Milestones

| Milestone | Bonus |
|---|---|
| 10 career wins | +150 |
| 25 career wins | +400 |
| 50 career wins | +800 |
| 10 career KO/TKO wins | +300 |

### The Peak Tier Floor

Your notoriety score can decrease from losses or inactivity — but it can never drop below the floor of your highest-ever tier.

### Inactivity Decay

If you do not fight for more than 20 consecutive days, your notoriety begins decaying by 1% per day until it hits the floor.

### Notoriety Freeze

After 3 consecutive losses, your notoriety is frozen. The one exception is a Nemesis or Title Shot victory — those bonuses always apply.

---

## Sponsorship Contracts

The **Contracts tab** lets you sign sponsor deals that pay iron per fight and trigger lump-sum bonuses when you complete their clauses.

### Slot Cap by Fame Tier

| Fame Tier | Max Active Contracts |
|---|---|
| Unknown | 0 |
| Prospect | 1 |
| Rising Star | 2 |
| Contender | 2 |
| Star | 3 |
| Legend | 4 |

### How Contracts Work

A pool of **4 sponsor offers refreshes every 7 days**, gated by your fame tier (Prospect sees Prospect-tier sponsors, Star sees everything up to and including Star-tier).

When you sign one, it goes Active. While Active:

- You earn **per-fight iron** automatically after every fight (win or lose).
- Each contract has a **clause** — e.g. "win your next 2 fights" or "make weight for 3 fights."
- **Clause complete** → bonus iron + fame payout, contract closes successfully.
- **Clause broken** → contract ends with a **fame penalty**.
- **Time-limited clauses** (e.g. "win any 2 within the duration window") expire silently if the window closes without completion.

### Available Clause Types

| Clause | What It Means |
|---|---|
| Win Next N | Win your next N fights consecutively. Any non-win breaks. |
| Finish Next N | Win your next N by KO or Submission. Decision wins or losses break. |
| Win Any N | Win N fights within the contract's duration window. |
| Land One KO | Win at least one fight by KO within the duration window. |
| No Weight Miss | Make weight for N consecutive fights. |
| No Finish Loss | Don't get finished (lose by KO or Sub) for N fights. Decision losses are okay. |

### Drop a Contract

You can drop an active contract any time. Costs **half the break penalty in fame**. Useful when you realize you can't meet the clause and want to free up a slot.

### Anti-Farm Rule

Sponsors you completed, broke, or dropped this week won't reappear in your offer pool until the next weekly rotation.

---

## Events: Fight Card Predictions

The **Events tab** runs a weekly NPC fight card you can bet on for fame and iron. The card resolves automatically at the end of its 7-day window.

### The Card

Every week, the system assembles a 5-fight card from non-champion GCS fighters. Fights can mix weight classes (each individual fight is intra-class).

| Slot | Count | Pool |
|---|---|---|
| Prelim | 2 | Mid-tier GCS (OVR 70–87) |
| Main Card | 2 | Top GCS (OVR 88+) |
| Headliner | 1 | Highest combined OVR pair on the card |

The Events tab presents the card UFC-poster-style: a gold headliner band with both fighters flanking the title block, then a Main Card grid below, then Prelims.

### Predictions

Click any fight card to open the picker:

- Pick a **side** — Fighter A, Draw, or Fighter B
- Pick a **method** — KO/TKO, Submission, or Decision (skipped if you picked Draw)
- **Lock in** — predictions are final once submitted

You can lock any subset of the 5 fights. Each prediction is independent.

### Reward Tiers

| Slot | Exact (Winner + Method) | Winner Only | Wrong Winner |
|---|---|---|---|
| Prelim | +100 fame, +200 iron | +30 fame | −20 fame |
| Main Card | +200 fame, +400 iron | +75 fame | −40 fame |
| Headliner | +300 fame, +500 iron | +100 fame | −50 fame |

A perfect 5/5 card pays around **+1,000 fame + 1,700 iron**. Realistic averages are well below that.

### Card Potential Bar

While picking, the Events tab shows a **Card Potential** bar with your current best-case and worst-case fame totals from your locked picks, plus how much more is on the table from unpicked fights.

### Resolution Reveal

The first time you visit the Events tab after a card resolves, a **multi-fight reveal modal** pops with:

- Each fight's winner + method (KO/SUB/DEC chips)
- Your prediction verdict per fight
- Per-fight payout
- Total fame and iron earned across the card
- A card-grade flavor string ("Perfect Card" / "Sharp Night" / "Rough Night" / "Brutal" etc.)

After dismissal, a slim "Last Card" banner stays visible at the top of the Events tab for context.

### Living Roster

When a card resolves, every NPC fighter's **record and fight history are updated** with the result. Over time, the GCS roster accumulates real history — Fighter Reports for these fighters become more accurate as they fight more cards.

---

## Media Hub

The **Media tab** has three actions, each with its own role.

### Podcast (1 per calendar day, 5 energy)

Podcast unlocks once per calendar day. Resets at midnight. Pick one segment:

| Segment | Reward | Notes |
|---|---|---|
| Recap your last fight | +100 fame, +150 iron | Always available if you've completed at least one fight. Safe option. |
| Division Talk: Respectful | +100 fame | Pick a same-tier opponent. Writes a **Respect flag** on them (6-fight window). |
| Division Talk: Trash Talk | +300 fame | Pick a same-tier opponent. Writes a **Beef flag** (4-fight window, with the −150 lapse penalty). |
| Division Talk: Cryptic | +40 fame | No side effects. |
| Predict Main Event | — | Deep-links to the Events tab to lock a prediction. Rewards apply at card resolution. |

### Documentary (Once per career, unlocks at Star fame tier)

A one-time career retrospective. Pays:

- **+1,500 fame**
- **+2,000 iron**
- The **Documentary** badge → unlocks the **Legacy** banner badge

You'll only ever do this once. Pick the moment.

### Interview Archive

Read-only history of every post-fight interview you've given, color-coded by tone.

---

## Health & Stamina

- **Health** runs 0–100. Depleted by damage in fights. Losing by KO/TKO drops your health to 0. Regenerates passively at **+1 HP per 5 minutes** of real time — a full 0→100 takes about 8 hours, so a player who logs off after a brutal session comes back fresh. Players who want to fight sooner can buy **Health Restoration** packages at the Hospital (see below).
- **Stamina** runs 0–100 (or higher with certain backstories or conditioning). Affected by weight cut, fight activity, and exhaustion checks.

---

## Injuries

Injuries happen in fights and in sparring sessions. They apply penalties to your stats until healed and may block specific actions (fighting, sparring, bag work).

**Every injury heals on its own.** Each one ticks down a recovery timer once per 24h of real time, then clears automatically — no injury is ever a permanent dead end. The Hospital tab shows the live countdown for every active injury (e.g. `3d 12h`).

| Injury | Source | Penalty | Blocks | Heals In |
|---|---|---|---|---|
| Cut | Fight | None | Fighting | 2 days |
| Bruised Rib | Fight | −10 max stamina | — | 2 days |
| Broken Nose | Fight | −3 CHN | — | 3 days |
| Broken Hand | Fight | −20 STR | Bag/pad work | 6 days |
| Sprained Ankle | Sparring | −15 LEG | — | 5 days |
| Torn Ligament | Sparring | −10 STR, −10 LEG | Fighting | 6 days |
| Concussion | KO/TKO/Sub loss (always) | −2 CHN | Fighting + sparring | 4 days |

You can clear an injury early instead of waiting it out:

- **Auto-heal injuries** (Bruised Rib, Sprained Ankle, Broken Hand) — pay iron at the Hospital to skip the wait.
- **Doctor-required injuries** (Cut, Broken Nose, Concussion, Torn Ligament) — a doctor visit (energy + iron) clears them instantly. They still block fighting or sparring while active, so waiting them out has a real cost — but if you can't afford the doctor, they will still heal on their own. No injury can lock you out of the game permanently.

### New-Fighter Grace

During your first **3 fights**, you can never receive a fight-blocking injury (Concussion, Cut, or Torn Ligament) — in a fight or in sparring. A rough debut can't lock a brand-new fighter out of the game before they've built up resources. Non-blocking injuries (e.g. Broken Nose, Bruised Rib) can still happen. After your 3rd fight the grace expires and all injuries apply normally.

---

## The Hospital

The **Hospital tab** is your one-stop medical screen. Iron-paid services to skip recovery time, treat blocking injuries, or restore HP without waiting.

### Services

| Service | What it does | Cost |
|---|---|---|
| **Treatment** | Clears one treatment-required injury (Cut, Broken Nose, Concussion, Torn Ligament). Removes stat penalty immediately. | Energy + iron, varies by injury (see below) |
| **Skip Recovery** | Instantly clears an auto-heal injury — no more waiting days. | Iron only, varies by injury |
| **Health Restoration** | Three packages restore HP without waiting on passive regen. | Iron only |
| **Full Recovery Package** | Heals every active injury in one transaction. 15% bulk discount over individual services. Available when you have 2+ injuries. | Sum of individual costs × 0.85 |

### Treatment costs

| Injury | Energy | Iron |
|---|---|---|
| Cut | 10 | 200 |
| Broken Nose | 10 | 400 |
| Concussion | 20 | 1,500 |
| Torn Ligament | 20 | 2,000 |

### Skip Recovery costs

| Injury | Iron to skip |
|---|---|
| Bruised Rib | 600 |
| Sprained Ankle | 800 |
| Broken Hand | 1,200 |

### Health Restoration packages

| Package | HP delivered | Iron (full) |
|---|---|---|
| Quick Patch | up to +25 HP | 250 |
| Recovery Bay | up to +50 HP | 400 |
| Full Restoration | to 100 HP | 700 |

If a package would heal more HP than you're missing, the iron cost is **pro-rated** to what you actually receive — you never overpay. When two packages would deliver the same HP at different prices, the more expensive one is greyed out so you always click the best deal. All three packages are available at every tier — no level gating.

### When to use the Hospital

- You have a **fight blocked** by a Cut, Concussion, or Torn Ligament and don't want to wait days.
- You finished a war at low HP and want to fight again soon — passive regen takes hours.
- You're stacking sponsor clauses or callouts that require you to fight quickly, and an auto-heal injury (e.g. Sprained Ankle) is dragging on.
- You can ignore the Hospital entirely if you have time — every auto-heal injury clears for free, and HP regenerates passively.

---

## Comeback Mode

Any time you lose a fight, comeback mode activates. While in comeback mode:

- Your next fight's XP is multiplied by 1.5×
- Your iron purse increases by 30%
- If you win, you earn the **Resilience** badge (once per career) and comeback clears

Losing three fights in a row also freezes your notoriety (see Notoriety Freeze above). Your fame unfreezes the next time you win. A losing streak never blocks you from fighting — you can always step back in.

---

## The Nemesis System

If an opponent beats you, they become your **Nemesis**. You can only have one at a time. Your Nemesis appears in your fight offers, slotted to match their strength relative to you. Their card shows how many times you have lost and promises **+150 Notoriety** for the rematch victory.

That +150 applies even if your notoriety is frozen.

If the champion beats you in a title shot twice, they become your Nemesis.

When you defeat your Nemesis, the flag is cleared. If you are promoted and your old Nemesis is in a lower tier, they are automatically cleared.

---

## Badges

Badges are permanent markers earned through career achievements and gym mastery.

| Badge | How to Earn |
|---|---|
| Resilience | Win a fight while in comeback mode |
| Champion | Win a championship title (any tier) |
| Callout Win | Win a fight against an opponent you formally called out (Fight tab) |
| Documentary | Record your career documentary in the Media tab (Star fame tier) |
| Champion Boxer | Reach Rank 4 at Iron Fist Boxing |
| Grand Master Kickboxer | Reach Rank 4 at Dragon Kickboxing |
| Grand Kru | Reach Rank 4 at Warrior Muay Thai |
| Olympic Wrestler | Reach Rank 4 at Apex Wrestling Academy |
| BJJ Black Belt | Reach Rank 4 at Gracie Ground Game |
| Submission Master | Reach Rank 4 at Renzo Combat Systems |
| Fight Scientist | Reach Rank 4 at Precision MMA Lab |
| Titan | Reach Rank 4 at Titan Performance Center |
| Tactician | Reach Rank 4 at The War Room |
| Elite Master | Reach Rank 4 at Elite Fight Academy |

---

## Banner Customizer

Every fighter has a **customizable banner** on their profile. Click the **✎ Customize** button on the profile sidebar to open the editor.

The banner has four customizable layers:

| Layer | Pieces | How They Unlock |
|---|---|---|
| Background | 8 | Fame tier (Slate at start → Holographic at Legend) |
| Frame | 5 | Fame tier + special (Championship frame from winning any belt) |
| Accent Color | 7 | Fame tier (Red/White/Blue at start → Pink at Star) |
| Pinned Badges | 13 (pin up to 3) | Career milestones — first win, 10/25/50 wins, 5/10 KOs, Champion, Resilience, Callout Win, Documentary, fame tier badges |

Locked pieces show their unlock condition on hover. The banner is purely cosmetic — no fight effect — but it appears on your profile and in any future PvP/social context where other players see your fighter.

---

## The Career Feed

Your dashboard shows a **Career Feed** — a reverse-chronological log of everything significant that has happened in your career:

- Fight wins, losses, and draws
- Tier promotions
- Title shot eligibility, title wins
- Nemesis set / cleared
- Badges earned
- Sponsor contracts signed, completed, broken, or dropped
- Callout wins (with bonuses earned)
- Beef flag lapses (with the −150 fame penalty)
- Main event predictions resolved
- Fame milestones and tier-ups

This is your career story, told in real time. The **Fame drawer** (★ Fame button in the footer) offers a focused, fame-only slice of the same activity.

---

## The Octagon Gazette

The **Octagon Gazette** is a daily newspaper that opens automatically the first time you log in each day. It recaps the most relevant events from your career and the wider game world as newspaper headlines — turning the things that happened while you were away into a story.

### When it appears

- On your **first login of each day** (UTC date).
- Not on subsequent logins the same day.
- Not on a brand-new account with zero fights — there's nothing to report yet.

Dismiss it with the **×** or the **Enter the Gym** button to start playing. Tapping the lead story when it's an Event result takes you straight to the Events tab.

### Layout

The paper has three zones, showing **5–6 stories maximum**:

| Zone | Stories | Format |
|---|---|---|
| Lead | 1 | Large headline + short article |
| Secondary | 2 | Medium headline + one-line blurb |
| In Brief | up to 3 | One-line briefs |

If fewer stories qualify, the paper simply shows fewer — it never pads with empty cards.

### The Lead Story

Exactly one story takes the lead, picked by priority — the first match wins:

1. **Event Result** — the weekly fight card's headliner, shown as a fight-result card (matchup + method)
2. **First Loss in a Title Fight** — a composite story when your first-ever loss came with gold on the line
3. **Title Fight Result** — won or lost
4. **First Loss** — your perfect record just took its first blemish
5. **Promotion** — you moved up a division
6. **Rank Entry** — you entered the rankings after your 3rd fight in the tier
7. **Win Streak** — you hit a 5- or 10-fight streak
8. **Rank Jump** — you climbed 5+ spots in one fight
9. **Last Fight Result** — the default recap of your most recent bout
10. **Division Spotlight** — a generic lead when nothing else happened

### Other Stories

Beyond the lead, the Gazette surfaces: fame tier changes, notoriety swings, nemesis set/cleared, sponsorship news, record milestones, gym milestones, beef flag lapses, and losing-streak ("comeback") narratives — assigned to the Secondary and In Brief zones.

### Notes

- Headlines are **templated** — each story type has several pre-written variations, and the paper picks one consistently per day, so it reads identically whether you open it on phone or desktop.
- The Gazette is purely informational. It doesn't grant rewards or change anything — it's the morning paper, not a mechanic.

---

## The Fight Summary

After every fight you see a breakdown of everything that happened:

- Outcome and updated record
- Health and stamina lost
- Iron earned (with weight miss penalty if applicable)
- Notoriety gained or lost (with a line-by-line breakdown)
- XP gained per stat + any stat level-ups
- Injuries sustained
- Camp performance (grade, triggered sessions, wildcard result)
- Weight cut result (+X or −X stamina)
- Nemesis set or cleared
- Tier promotion
- **Sponsorship payouts** (per-fight iron + clause completions/breaks)
- **Callout bonus** (if it was a callout fight)
- **Beef / Respect flag** matches (with their bonus applied) and any flags that lapsed
- **If it was a title fight**: a dedicated championship victory screen with gold styling

The **Post-Fight Interview** prompt appears here too — pick a tone (Humble / Confident / Trash Talk / Skip) before continuing.

---

## Summary of How Everything Connects

You spend **energy** to train at a gym. Training earns **XP** which raises **stats**. Higher stats raise your **Overall Rating**. A higher rating qualifies you for better gyms, and eventually for a **title shot** against your tier's champion.

Before each fight, you run a **training camp** — targeted preparation that sets up conditional bonuses. You choose a **weight cut** gamble. The fight plays out and you earn **iron**, **notoriety**, and **XP**.

After every fight, the **press interview** lets you trade verbal stakes for fame — humbling yourself for a future iron rematch bonus, talking trash to set up a grudge match, or just owning the moment.

At gyms, you earn **ranks** that unlock unique sessions, permanent XP bonuses, and utility perks that follow you across your career.

Beating champions promotes you through the tiers. Losing creates Nemeses and triggers comeback mode.

**Notoriety isn't just a meter** — it's an economy. Spend it on **callouts** to force matchups with full intel. Sign **sponsorship contracts** that pay iron per fight and bigger bonuses for clauses you fulfill. Predict the weekly **fight card** in the Events tab for fame and iron. Record podcasts to build beef and respect flags around the division. Once you're a Star, **commission your career documentary** for a permanent legacy mark.

Every milestone — fights, KOs, championships, callout wins, fame tiers — unlocks a new piece for your **profile banner**, the cosmetic identity layer that follows your fighter across every screen.

Every system costs something and gives something back. There are no shortcuts — only decisions.
