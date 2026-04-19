# Ground & Pound — Game Guide

---

## What Is This Game?

Ground & Pound is a text-based MMA career simulation. You create a fighter, train them at specialty gyms, prepare for fights in a training camp, and fight your way up through five promotion tiers — from unknown amateur to GCS champion. Every decision costs energy. Every fight has consequences. There are no levels — your fighter grows through their stats, and your stats grow through training and fighting.

---

## Creating Your Fighter

When you create a fighter you choose:

- **Weight Class** — Bantamweight (135 lbs), Featherweight (145 lbs), Lightweight (155 lbs), or Welterweight (170 lbs). You stay in this weight class for your career.
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
| Rest | 3 |
| Doctor visit | varies by injury |
| Mental Reset | 5 |

---

## The Promotion Tiers

Your career moves through five tiers. Moving between tiers is no longer fully automatic — some tiers require a **title shot** (see Champions & Title Shots below).

| Tier | Overall Range | Fights Per Day | Signing Fee |
|---|---|---|---|
| Amateur | 0–30 | 8 | None |
| Regional Pro | 30–48 | 4 | 2,000 |
| National | 45–65 | 2 | 10,000 |
| GCS Contender | 60–75 | 1 | None |
| GCS | 62–95 | 1 | None |

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
| Warrior Muay Thai | Grand Kru | Recovery restores +1 extra max stamina |
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
| Recovery | 3 | Reduces injury timers |

Each gym only offers sessions that train its focus stats, plus sparring. The free community gym offers everything at reduced XP.

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

---

## Notoriety (Fame)

Notoriety is your career fame score. It determines how much iron you earn per fight and unlocks storyline recognition. It never fully resets — a floor is set at your peak tier.

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

## Health & Stamina

- **Health** runs 0–100. Depleted by damage in fights. Losing by KO/TKO drops your health to 0. Recovers through Rest (3 energy, +25 health).
- **Stamina** runs 0–100 (or higher with certain backstories or conditioning). Affected by weight cut, fight activity, and exhaustion checks.

---

## Injuries

Injuries happen in camp (sparring) and in fights. They apply penalties to your stats until healed.

- **Minor injuries** heal over time through recovery sessions or rest.
- **Major injuries** block certain training activities until you visit the doctor.
- **Doctor visits** instantly clear an injury. They cost energy and sometimes iron.
- **Concussions** from fight losses are mandatory doctor visits — you cannot fight again until you go.

---

## Comeback Mode & Mental Reset

### Comeback Mode

Any time you lose a fight, comeback mode activates. While in comeback mode:

- Your next fight's XP is multiplied by 1.5×
- Your iron purse increases by 30%
- If you win, you earn the **Resilience** badge (once per career) and comeback clears

### Mental Reset

Losing three fights in a row triggers **Mental Reset Required** — a flag that blocks your next fight. To clear it, spend 5 energy on the Mental Reset activity in your profile. Once cleared, consecutive losses reset to 0 and notoriety unfreezes.

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

## The Career Feed

Your dashboard shows a **Career Feed** — a reverse-chronological log of everything significant that has happened in your career:

- Fight wins, losses, and draws
- Tier promotions
- Title shot eligibility, title wins
- Nemesis set / cleared
- Badges earned
- Mental reset events

This is your career story, told in real time.

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
- **If it was a title fight**: a dedicated championship victory screen with gold styling

---

## Summary of How Everything Connects

You spend **energy** to train at a gym. Training earns **XP** which raises **stats**. Higher stats raise your **Overall Rating**. A higher rating qualifies you for better gyms, and eventually for a **title shot** against your tier's champion.

Before each fight, you run a **training camp** — targeted preparation that sets up conditional bonuses. You choose a **weight cut** gamble. The fight plays out and you earn **iron**, **notoriety**, and **XP**.

At gyms, you earn **ranks** that unlock unique sessions, permanent XP bonuses, and utility perks that follow you across your career.

Beating champions promotes you through the tiers. Losing creates Nemeses, triggers comeback mode, or forces mental resets.

Every system costs something and gives something back. There are no shortcuts — only decisions.
