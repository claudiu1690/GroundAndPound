# Ground & Pound — Game Guide

---

## What Is This Game?

Ground & Pound is a text-based MMA career simulation. You create a fighter, train them at gyms, prepare for fights in a training camp, and fight your way up through five promotion tiers — from unknown amateur to GCS champion. Every decision costs energy. Every fight has consequences. There are no levels — your fighter grows through their stats, and your stats grow through training and fighting.

---

## Creating Your Fighter

When you create a fighter you choose:

- **Weight Class** — Bantamweight (135 lbs), Featherweight (145 lbs), Lightweight (155 lbs), or Welterweight (170 lbs). You stay in this weight class for your career, though aggressive weight cuts carry risk.
- **Fighting Style** — Determines which stats start higher and how your Overall Rating is calculated. There are eight styles: Boxer, Kickboxer, Muay Thai, Wrestler, Brazilian Jiu-Jitsu, Judo, Sambo, and Capoeira. Each has a different stat profile.
- **Backstory** (optional) — A background that gives a small permanent bonus at the start of your career.

### Backstory Bonuses
| Backstory | Bonus |
|---|---|
| Street Fighter | CHN +5, reduced KO chance |
| College Wrestler | WRE +8 |
| Kickboxing Champion | STR +6, LEG +4 |
| Army Veteran | Max Stamina +10 |
| MMA Prodigy | All stats +2 |
| Late Bloomer | Trains slower early but gains +25% XP from all sessions |

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
| SUB | Submission Game | Chains submission attempts from the bottom |
| CHN | Chin | Absorbs damage, rarely stopped by strikes |
| FIQ | Fight IQ | Reads setups, rarely makes tactical mistakes |

Your **Overall Rating** is calculated from all eight stats, weighted by your fighting style. A Boxer gets more credit for STR, SPD, and CHN. A BJJ fighter gets more credit for GND and SUB. Every style has primary stats (weighted 1.2×), secondary stats (1.0×), and off-style stats (0.85×).

---

## Energy

Everything you do costs energy. You have a maximum of 100 energy. It regenerates at 1 point per minute automatically.

| Action | Energy Cost |
|---|---|
| Training sessions | 3–8 (varies by session) |
| Accepting a fight | 10–20 (varies by tier) |
| Rest | 3 |
| Doctor visit | varies by injury |
| Mental Reset | 5 |

If you do not have enough energy for something, you have to wait.

---

## The Promotion Tiers

Your career moves through five tiers based on your Overall Rating. You cannot choose to stay — when your overall passes the threshold, you are promoted.

| Tier | Overall Range | Fights Per Day | Iron per Fight (Signing Fee) |
|---|---|---|---|
| Amateur | 0–30 | 8 | None |
| Regional Pro | 30–48 | 4 | 2,000 |
| National | 45–65 | 2 | 10,000 |
| GCS Contender | 60–75 | 1 | None |
| GCS | 62–95 | 1 | None |

Higher tiers have harder fights, fewer daily attempts, longer training camps, and more severe penalties for showing up unprepared.

---

## Training at the Gym

### Gym Tiers

There are five gym tiers. You can only train at a gym your overall rating qualifies for. Higher-tier gyms unlock higher stat caps and faster XP gains but cost monthly iron fees.

| Tier | Minimum Overall | Stat Cap | XP Speed | Monthly Cost |
|---|---|---|---|---|
| T1 – Local Gym | 0 | 35 | 1.0× | Free |
| T2 – Regional Gym | 33 | 52 | 1.15× | 2,500 iron |
| T3 – National Gym | 48 | 68 | 1.3× | 2,000 iron |
| T4 – Elite Gym | 63 | 82 | 1.5× | 8,000 iron |
| T5 – Apex Gym | 78 | 95 | 1.75× | 25,000 iron |

A gym's stat cap matters — if your STR is already at 52 and you are at a T2 gym, you cannot raise it further until you move to a T3 gym.

### Training Sessions

Each session costs energy and raises specific stats by earning XP.

| Session | Energy | Stats Trained |
|---|---|---|
| Bag Work | 4 | STR |
| Footwork | 4 | SPD |
| Kick Drills | 4 | LEG |
| Pad Work | 5 | STR, SPD |
| Wrestling | 5 | WRE |
| Clinch Work | 5 | WRE, STR |
| BJJ Rolling | 6 | GND, SUB |
| Submission Drilling | 6 | SUB |
| Sparring | 8 | All 8 stats (3% injury risk) |
| Film Study | 3 | FIQ (T3 gym required) |
| Strength & Conditioning | 4 | Raises max stamina |
| Recovery | 3 | Speeds up injury recovery |

### How Stats Level Up

XP accumulates in a bank for each stat. Once you have enough, the stat increases by one point. The more a stat grows, the more XP each additional point costs.

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

Stats 96–99 can only grow from fights. No amount of gym training gets you there.

---

## Gym Quests & Perks

Each gym has a set of quests. Completing a quest unlocks a permanent perk that stays with your fighter for the rest of the career.

| Perk | How to Unlock | What It Does |
|---|---|---|
| Iron Will | Complete enough sessions to pass the Coach's Test | −5% KO probability in every fight |
| Specialist Stat | Train 30 sessions in the gym's specialty area | Your chosen stat trains 10% faster |
| The Grind | Win 20 fights while enrolled at this gym | +500 iron bonus per fight at this gym |
| Apex Regimen | All stats ≥60 and 100 total sessions | +20% XP from every training session |

---

## Fight Offers

When you are ready to fight, you request offers from the promoter. You receive three cards — one Easy, one Even, and one Hard opponent.

| Type | Opponent Strength |
|---|---|
| Easy | 3–5 Overall below you |
| Even | Within 3 Overall |
| Hard | 2–5 Overall above you |

Each card shows the opponent's record, their last three fight results, and a streak badge if they are on a run of two or more consecutive wins or losses.

Accepting a fight costs energy (10–20 depending on your tier). Once accepted, you enter the training camp phase.

---

## Fight Camp

Between accepting a fight and fighting it, you have a training camp. Camp does not improve your stats permanently — it prepares conditional bonuses that activate during the fight when specific situations occur.

### Camp Slots

The number of training sessions you can do in camp is fixed by your tier:

| Tier | Normal Slots | Short Notice Slots |
|---|---|---|
| Amateur | 2 | 1 |
| Regional Pro | 3 | 1 |
| National | 5 | 2 |
| GCS Contender | 8 | 3 |
| GCS | 10 | 4 |

### Camp Sessions

| Session | Energy | Bonus When Triggered | Best Used Against |
|---|---|---|---|
| Takedown Defence | 6 | Sprawl success +25% | Wrestlers, Judoka, Sambo |
| Submission Escapes | 6 | Escape probability +20% | BJJ, Sambo, Submission Hunters |
| Striking Accuracy | 5 | Strike damage +15% | Defensive fighters, Counter Strikers |
| Cardio Push | 5 | Stamina drain −20% when below 70% | Pressure Fighters, high-volume opponents |
| Game Plan Study | 4 | Opponent damage −6% (always active at half strength) | Any opponent — safe general choice |
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

Your camp is graded S through F based on total points earned. This rating is informational — it does not give you a flat stat modifier. It tells you how well you prepared, and it is shown in your post-fight summary.

| Grade | Points | Label |
|---|---|---|
| S | 90–100 | Elite preparation |
| A | 75–89 | Strong preparation |
| B | 55–74 | Good preparation |
| C | 35–54 | Adequate preparation |
| D | 15–34 | Weak preparation |
| F | 0–14 | Poor preparation |

### The Fighter Report

Before you start camp, you receive a scouting report on your opponent. The report classifies what is known about their stats based on reliability:

| Level | Meaning |
|---|---|
| Confirmed | Proven across multiple fights — treat this as fact |
| Suspected | Suggested by 1–2 fights — likely but not certain |
| Unverified | Known stat but insufficient fight evidence |
| Unknown | No data — could be anything |

The report also shows the opponent's style tendency and a warning about their most dangerous weapon.

### Wildcards

Every opponent has a hidden tendency — a middle-tier stat that can unexpectedly boost their performance in a fight. This is never shown in the report. If you happened to prepare a session that counters it, the bonus is neutralised. If you did not, the opponent gets a hidden +15% advantage in that area during the fight.

### Camp Injuries

Sparring carries a 3% injury risk per session. If an injury occurs you must choose:

- **Stop camp**: Lose remaining slots, camp grade drops, but you fight healthy.
- **Push through**: Keep your slots, but the injury penalty carries into the fight.

| Injury | Fight Penalty |
|---|---|
| Bruised Knuckle | STR −10% |
| Twisted Knee | LEG −20%, WRE −10% |
| Rib Strain | Max Stamina −15% |
| Minor Concussion | FIQ −15%, all remaining slots lost, requires doctor visit |
| Eye Cut | SPD −10%, opponent accuracy +5% |

A concussion always forces you to stop camp and requires a doctor visit before you can fight again.

You can remove a session you already logged by clicking a filled camp slot — your energy is refunded.

---

## The Fight

### Weight Cut

Before every fight you choose how aggressively to cut weight:

| Strategy | Stamina Going In | Miss Risk | Bonus |
|---|---|---|---|
| Easy | 100% | 0% | None |
| Moderate | 90% | 5% | +5 max stamina |
| Aggressive | 75% | 20% | +12 max stamina |

Missing weight costs you 20% of your iron purse and −200 notoriety.

### Fight Strategy

You choose one of eight strategies before the fight. Each has natural counters and favoured matchups.

| Strategy | Favoured Against |
|---|---|
| Pressure Fighter | Counter Strikers, low cardio opponents |
| Counter Striker | Pressure Fighters, predictable attackers |
| Takedown Heavy | Pure strikers, low WRE opponents |
| Submission Hunter | Poor SUB defence, tired opponents |
| Ground & Pound | Guard players, submission-light opponents |
| Leg Kick Attrition | High-chin fighters, long fights |
| Clinch Bully | Pure boxers, distance fighters |
| Survival Mode | When significantly outmatched |

### Fight Outcomes

Eight possible results:

- **KO/TKO** (win)
- **Submission** (win)
- **Decision — Unanimous** (win)
- **Decision — Split** (win)
- **Draw**
- **Loss — Decision**
- **Loss — KO/TKO**
- **Loss — Submission**

### Post-Fight XP

You earn XP distributed across stats based on how the fight ended:

| Result | XP Distribution |
|---|---|
| Win by KO/TKO | STR 30, CHN 15, SPD 10 |
| Win by Submission | SUB 30, GND 20, WRE 10 |
| Win by Decision | All stats 15, FIQ 20 |
| Loss by KO/TKO | CHN 20, FIQ 15 |
| Loss by other | FIQ 25 |

XP is then multiplied by an outcome modifier:

| Outcome | Multiplier |
|---|---|
| KO/TKO | 1.3× |
| Submission | 1.25× |
| Decision Unanimous | 1.1× |
| Decision Split | 1.05× |
| Draw | 1.0× |
| Loss by Decision | 0.8× |
| Loss by Finish | 0.7× |

If you are in **comeback mode** when you win, all fight XP is multiplied by an additional 1.5×.

### Iron Earnings

Iron is the game's currency. You earn it from fights.

The base purse is your tier's signing fee. On top of that:

- Win: 100% of purse
- Draw: 50% of purse
- Loss: 70% of purse

Modifiers that increase your iron:
- Higher notoriety tier: +5% to +50% depending on fame level
- Comeback mode: +30%
- The Grind perk at your home gym: +500 flat

If you miss weight, the final amount is cut by 20%.

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

On top of the base reward, certain achievements pay additional flat bonuses:

| Event | Bonus |
|---|---|
| Defeating your Nemesis | +150 |
| Comeback win (after 2+ consecutive losses) | +150 |
| First finish in current promotion tier | +100 |
| Fight of the Night (decision win, opponent below 50% health) | +200 |
| Giant Killer (beat someone 10+ OVR above you) | +300 |
| 5-fight win streak | +100 |
| 10-fight win streak | +250 |
| 20-fight win streak | +500 |
| Title fight win | +500 |
| Title defence | +300 |

### One-Time Milestones

| Milestone | Bonus |
|---|---|
| 10 career wins | +150 |
| 25 career wins | +400 |
| 50 career wins | +800 |
| 10 career KO/TKO wins | +300 |

### The Peak Tier Floor

Your notoriety score can decrease from losses or inactivity — but it can never drop below the floor of your highest-ever tier. Reach Contender once and your score will never fall below 15,000 again.

### Inactivity Decay

If you do not fight for more than 20 consecutive days, your notoriety begins decaying by 1% per day. It stops at the floor.

### Notoriety Freeze

After 3 consecutive losses, your notoriety is frozen. You will not lose or gain notoriety until you win a fight. The one exception is a Nemesis victory — that bonus always applies, even through a freeze.

---

## Health & Stamina

- **Health** runs 0–100. It is depleted during fights by the damage you take. It recovers through Rest (costs 3 energy, restores 25 health).
- **Stamina** also runs 0–100 (or higher with the Army Veteran backstory or conditioning training). It is reduced by fight activity and weight cuts. It recovers through Rest.
- Your starting stamina each fight is affected by your weight cut choice.

---

## Injuries

Injuries happen in camp (sparring) and in fights. They apply penalties to your stats until healed.

- **Minor injuries** heal over time through recovery sessions or rest.
- **Major injuries** block certain training activities until you visit the doctor.
- **Doctor visits** instantly clear an injury and remove all its stat penalties. They cost energy and sometimes iron.
- **Concussions** from fight losses are mandatory doctor visits — you cannot fight again until you go.

---

## Comeback Mode & Mental Reset

### Comeback Mode

Any time you lose a fight, comeback mode activates. While in comeback mode:

- Your next fight's XP is multiplied by 1.5×
- Your iron purse increases by 30%
- If you win, you earn the **Resilience** badge (once per career) and comeback mode clears

### Mental Reset

If you lose three fights in a row:
- A **Mental Reset Required** flag blocks your next fight
- Your notoriety is frozen
- To clear it: spend 5 energy on the Mental Reset activity in your profile
- Once cleared, consecutive losses reset to 0 and notoriety unfreezes

---

## The Nemesis System

If an opponent beats you, they become your **Nemesis**. You can only have one Nemesis at a time — if you lose to someone new, they replace the old one.

Your Nemesis appears in your fight offers, placed in the Easy, Even, or Hard slot that matches their strength relative to you. Their card shows how many times you have lost to them and a bonus: **+150 Notoriety** for winning the rematch.

That +150 bonus is applied even if your notoriety is frozen.

When you beat your Nemesis, the flag is cleared and the bonus is added to your post-fight summary. If you are promoted to a new tier and your Nemesis was in the old tier, they are automatically cleared.

---

## Badges

Badges are permanent markers of career achievements.

| Badge | How to Earn |
|---|---|
| Resilience | Win a fight while in comeback mode |

---

## The Fight Summary

After every fight you see a breakdown of everything that happened:

- The outcome and your updated record
- Health and stamina lost
- Iron earned
- Notoriety gained or lost (with a line-by-line breakdown of every bonus)
- XP gained per stat
- Any stat level-ups
- Injuries sustained
- Your camp performance (grade, which sessions triggered, wildcard result)
- Whether a Nemesis was set or cleared
- Whether you were promoted

---

## Summary of How Everything Connects

You spend **energy** to train. Training earns **XP** which raises **stats**. Higher stats raise your **Overall Rating**. A higher Overall Rating qualifies you for better gyms and eventually promotes you to the next tier.

You spend energy to **accept fights**. Before every fight you run a **training camp** — targeted preparation that sets up conditional bonuses for the fight. You choose a **fight strategy** and a **weight cut**. The fight plays out and you earn **iron** and **notoriety**.

Iron pays for gym memberships and doctor visits. Notoriety increases your iron earnings and tracks your career legacy. Notoriety never fully resets.

Losing has consequences: injuries, comeback mode, and potentially a Nemesis. Three losses in a row triggers a mandatory mental reset. But comeback mode also rewards you — losses are not dead ends, they are setbacks with a path forward.

Every system costs something and gives something back. There are no shortcuts.
