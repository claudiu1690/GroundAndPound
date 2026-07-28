# Ground & Pound — Game Design Document

> **Status:** Living document, synced to the implemented game as of 2026-07-27.
> This is the agent-readable canonical GDD (the game-designer and architect agents
> read this before any proposal). It supersedes the Word original
> `Ground-And-Pound-GDD.docx` (kept for reference/authoring) and the retired
> root-level `gdd_text.txt` / `gdd_extract.xml` (old v2.0 design — deleted).
> When a section here disagrees with the code, **the code wins** — fix this doc.

Text-based MMA career simulation. The player creates a fighter, trains them at
specialty gyms, prepares for fights in a training camp, and competes through five
promotion tiers — from unknown amateur to GCS champion.

**Design pillars**
- Every action costs a resource (energy, cash, or fame) and returns something measurable.
- Progression is stat-driven and continuous — no XP levels, no prestige resets, **no retirement / no end state**.
- Fights are deterministic simulations driven by stats, camp preparation, and weight-cut gambles.
- The player is never permanently locked out: injuries always heal over time, and new fighters are protected from fight-blocking injuries.

---

## 1. Application Layout & Navigation

Single-page web client. Top to bottom: a collapsible **Message Bar**, the **App Body**
(left sidebar + content panel), and a fixed **App Footer**.

- **Left sidebar:** Fighter Profile (banner, energy/health bars, meta panel — cash, fame, rank, class, gym, backstory — badges, stat meters, active injuries), an **Inventory** panel (shown only when the fighter owns shop items), and the nav menu. Nav order groups by intent — *build → compete → manage*: **Home, Training, My Camp, Special Moves, Fight, Career, Proving Ground, Rankings, Contracts, Hospital, Shop, Events, Media, Library**. My Camp sits directly after Training (it is an alternative training venue — see §6.8), and Special Moves sits with them (all three "build your fighter") rather than down among the utility tabs.
- **Footer:** game wordmark, contextual status badges (injury count → Hospital, camp → Fight, Fame → Fame drawer), Sign Out.
- **Overlays:** Training toast stack, Tier-Up / Belt-Won overlays, Fight-block popup (energy / injury), Fame drawer, Octagon Gazette, Onboarding Tutorial, **Fight-Accept Face-Off** (see §10), Fighter Report, Camp Summary, Badge-unlock celebration, Special-Move drop reveal.

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

| Tier | Overall Range | Fight Energy Cost | Base Purse (Cash) |
|---|---|---|---|
| Amateur | 0–30 | 10 | 500 |
| Regional Pro | 30–48 | 15 | 750 |
| National | 45–65 | 18 | 2,200 |
| GCS Contender | 60–75 | 20 | 6,000 |
| GCS | 62–95 | 20 | 12,000 |

Purses scale at a steady **~2–3× per tier** (rather than a sharp early jump) and are
tuned so fight income stays roughly in line with each tier's cash sinks (gym fees,
hospital, shop) — one win funds at most a couple of extra fights' worth of energy
via Energy Shots, so the cash→energy loop can't run away at the upper tiers.

There is **no daily fight cap** — the number of fights per day is limited only by
energy (each fight costs the tier's energy amount above; energy regenerates 1/min).

### 5.1 Promotion Gates
- **Amateur → Regional Pro:** reach OVR 30 (pending promotion), then win **2** fights **while ranked top 5** to earn the **Amateur title shot** vs. the NPC Amateur champion; winning grants the **Amateur Champion** badge and **+75 fame**.
- **Regional Pro → National:** beat the Regional Pro champion (title shot — OVR threshold + top 5 + **3 wins earned while top 5**).
- **National → GCS Contender:** beat the National champion (title shot — OVR threshold + top 5 + **3 wins earned while top 5**).
- **GCS Contender → GCS:** auto-promotes at OVR 62. **The GCS Contender belt is not a winnable title** (no champion at this tier).
- **GCS:** final tier — defend the belt indefinitely. Pro title wins (Regional Pro, National, GCS) grant **+200 fame** + a permanent championship badge.

> Championship badges (Amateur / Regional Pro / National / GCS) are derived from
> promotion tier: reaching a tier proves you won every winnable title below it.

---

## 6. Gym & Training System

One free community gym is always available; **ten** specialty gyms require a weekly
cash membership. Only one paid membership is active at a time (paying a new gym
cancels the previous). **Ranks earned at a gym persist permanently**, even after switching.

> **Two training venues coexist right now.** §6.1–§6.7 describe the **gym system**, which
> is live and unchanged. §6.8–§6.21 describe **My Camp**, the player-owned training camp
> shipped in Phases 0–1 — a second, parallel place to spend training energy, with its own
> screen, its own sessions and its own progression. Both are fully playable; a player may
> use either or both on any given day. **The camp is intended to replace the gyms
> entirely** in a later phase (the gym tab retires, memberships stop being a cost, and the
> camp becomes the only training venue). Until that phase lands, treat every gym rule in
> §6.1–§6.7 as current and additive — nothing about gyms was removed, deprecated or
> nerfed to make room for the camp.

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

Wins count toward ranks only at the **active paid gym**, and only if the win type matches the gym's discipline (KO/TKO for striking gyms, Submission for BJJ, Decision for tactical gyms, etc.). Ranks 3 and 4 require an cash payment on top of the training/win thresholds.

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

### 6.8 My Camp — the player-owned training camp (Phases 0–1)

Every fighter owns exactly **one camp**. Where a gym is somewhere you rent access to, the
camp is *yours*: it has a name, a discipline, a staff of coaches you rank up, and a
building that degrades if you stop showing up. It is a **second training venue that runs
alongside the ten gyms** (see the note at the top of §6) and has its own tab, **My Camp**,
directly after Training in the nav.

The camp is **created lazily on the first visit** to the tab — there is no build step, no
cost and no gate. Creation writes nothing to the fighter document, which is why it can
never damage existing progress.

- **Name** — defaults to `<LastName> Camp`. Renameable at any time: 3–28 characters after
  trimming, profanity-checked, no uniqueness requirement and no cooldown.
- **Discipline focus** — seeded once at creation and **immutable**. It decides which
  archetype the free starting coach is and therefore which drill kit the player begins with.

| Fighting style | Camp focus |
|---|---|
| Boxer, Kickboxer, Muay Thai, Capoeira | Striking |
| Wrestler, Judo | Wrestling |
| Brazilian Jiu-Jitsu, Sambo | BJJ |

Backend naming note: the `camp` prefix already belongs to **Fight Camp** (§9), so every
identifier in this system uses `homeCamp` and the API mounts at `/home-camp`. The two
systems are unrelated — Fight Camp is per-fight, opponent-reactive prep; My Camp is a
permanent training venue.

### 6.9 Camp creation & gym conversion

The same routine that creates a camp for a brand-new player also converts an existing
player's gym history. It runs per player on first read, so there is no big-bang migration.

1. **Head coach** — the fighter's *active* gym converts into the starting coach at the
   **equivalent rank** (a Rank-3 Apex Wrestling player starts with a Rank-3 Wrestling
   Coach). With no active gym, the highest-ranked banked gym is used; ties break on
   sessions. With no gym history at all, the coach starts at Rank 1.
2. **Focus** — taken from the converted gym's discipline, falling back to the style map in
   §6.8. `elite-fight-academy` (all 8 stats) and the free `community-mma` carry no
   discipline signal and always fall back to style.
3. **Discipline familiarity** — every *other* banked gym's sessions and relevant wins are
   credited to that gym's discipline as **banked familiarity**. Multiple gyms in one
   discipline sum. The credit is spent when hiring a market coach in that discipline
   (§6.18).
4. **Never lowers anything** — a converted coach is floored at his own rank's requirements,
   so a migrated player is never below the thresholds for the rank he was handed.

5. **The rank-4 perk is owed, not lost** — conversion writes *nothing* to the fighter, so a
   coach who converts in at Rank 4 does not receive the archetype perk automatically.
   Instead the camp shows it as **claimable** on that coach and the player claims it in one
   free click (§6.14). Nothing is auto-granted by a read.

**Nothing is taken away.** Gym ranks, gym perks and gym badges are read during conversion
and never written, so every badge evaluator and live perk (Strength Reserve, Iron
Conditioning) behaves exactly as before. `fighter.gymRanks` / `fighter.gymPerks` are
permanent, read-only legacy inputs — deleting them would silently zero ten badge evaluators
and kill two live perks.

### 6.10 Camp tier & coach slots

Camp tier is 1–4 and gates two things: how many coaches can be on staff, and the XP
multiplier of the coachless Open Mat session.

| Tier | Coach slots | Coach XP multiplier | Open Mat multiplier | Drop rarity table |
|---|---|---|---|---|
| 1 | 1 | 1.25× | 0.60× | Amateur |
| 2 | 2 | 1.30× | 1.00× | Amateur |
| 3 | 3 | 1.40× | 1.15× | Regional Pro |
| 4 | 4 | 1.50× | 1.30× | National |

The coach multipliers deliberately track the gym focus multipliers (§6.3) so that during
coexistence the camp is never a nerf relative to the player's current gym.

**Effective tier is floored by promotion tier** — `max(stored tier, promotion floor)` —
so career progress can never leave a camp behind: Amateur → 1, **Regional Pro → 3**,
**National / GCS Contender / GCS → 4**. The one *purchasable* step is **renovating Tier
1 → 2** (§6.20); Tiers 3 and 4 come only from the promotion floor. Since Regional Pro
already floors the camp at 3, in practice renovation matters exactly for the Amateur who
wants the second coach slot and the Trainer Market before turning pro.

### 6.11 Coaches & archetypes

A coach is an **individual**: a generated name, an archetype, a **rarity** (Common /
Uncommon / Rare / Legendary), one of twelve **traits** (§6.17), a frozen **weekly wage**
and **hire fee**, a **morale** score (§6.19), a rank (1–4), a session counter and a
relevant-win counter. The free starter coach is the one exception — Common, traitless,
**$0 wage forever** — so the camp's floor never costs anything to keep. Every other coach
is hired from the weekly Trainer Market (§6.16).

| Archetype | Stat cluster | Counts as a "style win" | Rank-4 perk |
|---|---|---|---|
| Striking Coach | STR, SPD, CHN | KO/TKO | Corner Confidence |
| Wrestling Coach | WRE, GND, STR | Decision (unanimous or split) | Mat Returns |
| BJJ Professor | GND, SUB | Submission | Submission Awareness |
| Conditioning Coach | CHN, FIQ | Any win | Iron Conditioning |

The **Conditioning Coach is market-only** (never a starter, hireable from Camp Tier 2) and
carries the camp's only Max Stamina training and only FIQ drill — see §6.12. "Any win"
means all PvE win methods credit him, so he is the easiest coach to feed style wins.

Rank labels are **Cornerman → Coach → Head Coach → Master**. The rank-4 perk is granted
into `fighter.gymPerks` — the *same* store the gym system uses — so a perk can never exist
twice with two different effect texts, and a player who already earned it from the gym
simply keeps it. Roster hard cap is 4 coaches, **one coach per discipline**.

**Rarity decides teaching, not training.** A coach's rarity sets how many Special Moves he
can ever teach (**teach breadth**: Common 1 / Uncommon 2 / Rare 3 / Legendary his whole
discipline pool) and the **rarity he teaches them at** — his own rarity, floored by each
move's own minimum rarity. Teaching itself (granting the moves) is Phase 2; Phase 1
generates and stores each coach's pool and shows it on his market card, so nothing is sold
blind. Rarity also sets his price (§6.17). It does **not** change his drill kit or XP
multiplier — a Legendary trains the same drills at the same rates; you pay for what he can
teach and who he is.

### 6.12 Drills

Each coach carries a fixed **kit of 4 drills**, unlocking at coach ranks **1 / 1 / 2 / 3**.
Index 2 is the **flagship** (highest XP, highest energy, real injury risk, the only
coach drill that can drop a Special Move, and the only one that *costs* Facility
Condition); index 3 is the **utility** drill (cheap, safe, and the biggest condition gain).

| Coach | Drill | Unlock | Energy | Stats | XP base | Injury | Move drop | Condition |
|---|---|---|---|---|---|---|---|---|
| Striking | Pad Work Circuit | R1 | 5 | STR, SPD | 10 | — | — | +2 |
| Striking | Heavy Bag Assault | R1 | 6 | STR | 15 | 2% | — | 0 |
| Striking | **Live Championship Rounds** | R2 | 9 | STR, SPD, CHN | 18 | 6% | 5% | −1 |
| Striking | Chin & Composure Drills | R3 | 4 | CHN | 10 | — | — | +3 |
| Wrestling | Live Wrestling | R1 | 5 | WRE | 12 | 1% | — | +1 |
| Wrestling | Cage Control Drilling | R1 | 6 | WRE, GND | 12 | 2% | — | +1 |
| Wrestling | **Grind-It-Out Rounds** | R2 | 9 | WRE, GND, STR | 18 | 6% | 5% | −1 |
| Wrestling | Mat Return Repetition | R3 | 4 | WRE | 10 | — | — | +2 |
| BJJ | Guard Retention Work | R1 | 4 | GND | 10 | — | — | +2 |
| BJJ | Positional Sparring | R1 | 5 | GND, SUB | 10 | 1% | — | +1 |
| BJJ | **Live Rolling** | R2 | 9 | GND, SUB, WRE | 18 | 5% | 5% | −1 |
| BJJ | Film & Technique Study | R3 | 3 | SUB | 8 | — | — | +3 |
| Conditioning | Strength & Conditioning+ | R1 | 4 | *Max Stamina* | — | — | — | +2 |
| Conditioning | Recovery & Mobility | R1 | 3 | *(condition only)* | — | — | — | **+5** |
| Conditioning | **Grueling Fitness Test** | R2 | 8 | CHN, STR | 16 | 4% | 3% | −1 |
| Conditioning | Veteran Wisdom Sessions | R3 | 4 | FIQ | 10 | — | — | +2 |

The Conditioning kit (Phase 1, market-only coach — §6.11) deliberately breaks the
stat-XP mold twice. **Strength & Conditioning+** raises **Max Stamina** instead of any
stat — the same +1 per session (+2 with the Iron Conditioning perk, capped at 120) as the
gym's Conditioning session, via the same shared routine, and it is the **only Max Stamina
training in the camp**. **Recovery & Mobility** earns no XP at all — it is the cheapest
pure-condition purchase in the game, +5 to the building for 3 energy. Both are honest
statless drills (validated at boot: a statless drill must raise Max Stamina or condition).
**Veteran Wisdom Sessions** is the camp's only FIQ drill. The flagship's 3% move-drop rate
(vs 5% on the combat flagships) reflects its two-stat cluster, and it is bag-family so a
bag-blocking injury gates it — a 4%-injury drill must be blockable.

**Open Mat Sparring** is the fallback session: **always available, never gated, no coach
required** — 6 energy, all 8 stats, XP base 12, 3% injury, **4% move drop**, no condition
change. It runs at the tier's *fallback* multiplier (0.60× at Tier 1 up to 1.30× at Tier 4),
not the coach multiplier, so it is the floor a player without a suitable coach falls back to.

Drills inherit the existing injury blocks by family: `spar` drills are blocked by a
sparring-blocking injury, `bag` drills by a bag-work-blocking injury, `none` drills are
never blocked. Effective injury rate is the drill's own percentage shaved by Fight IQ —
0.1 percentage points per point of FIQ above 10, floored at 30% of the printed rate
(`max(p × 0.3, p − max(0, FIQ − 10) × 0.1pp)`) — and an injury ends the remaining batch with
the unused energy refunded. Batches are capped at 25 sessions per request, matching the gym.

Balance note: the flagship is ~2.0 XP per energy against ~2.5 for the cheap Rank-1
single-stat drills — it is *not* strictly dominant, it buys breadth, the move-drop roll and
a stat-cluster hit in exchange for injury risk and a decaying building. If flagship share
exceeds ~70% of camp sessions, the lever is the flagship's XP base (18 → 16), **not** its
drop odds.

### 6.13 Facility Condition

The camp building has a **Condition** score, 0–100, starting at 100. It is a soft,
never-blocking XP modifier — a low-condition camp always still trains.

| Value | Band | XP multiplier |
|---|---|---|
| 0–19 | Neglected | 0.75× |
| 20–49 | Run down | 0.90× |
| 50–100 | Thriving | 1.00× |

- **Decay:** **−2 per idle UTC day** — a calendar day (UTC) in which the player ran zero
  camp sessions. Any camp session on a day suppresses that day's decay entirely.
- **Catch-up cap:** at most **14 days** are applied in a single catch-up, so a returning
  player loses at most 28 condition, not their whole score.
- **Per-session change:** each drill applies its own condition delta (see §6.12), multiplied
  by the number of sessions completed in the batch. Recovery drills build the building back
  up; flagships wear it down.
- **Applied in two places, once:** a nightly job (03:15 UTC) sweeps stale camps, and every
  camp read applies the same lazy tick. Both key off a stored UTC day key, so running the
  job repeatedly in one day still applies exactly one −2, and a broken job degrades to
  "condition ticks when you visit" rather than to a stuck value.

### 6.14 Coach ranks & promotion

Coaches rank 1 → 4. **Every promotion costs cash, so every promotion is manual** — there is
no auto-rank-up path anywhere in the camp.

| Rank | Sessions with this coach | Style wins | Cash | Unlocks |
|---|---|---|---|---|
| 2 | 12 | 2 | 600 | The flagship drill |
| 3 | 30 | 5 | 2,000 | The utility drill **and +5% training XP with this coach** |
| 4 | 60 | 10 | 5,000 | The archetype's perk (§6.11) |

- **Sessions** count only sessions run *with that coach* — Open Mat does not feed a coach.
- **Style wins** are wins by the coach's own method: KO/TKO for Striking, decisions for
  Wrestling, submissions for BJJ. **PvE only** — Proving Ground results never credit a
  coach.
- Promotion cost is adjusted by the same persona modifier that adjusts gym rank-up cost
  (§16.6), and the displayed price is produced by the same helper that charges it, so the
  quote can never disagree with the bill. A double-click cannot double-charge: the rank is
  re-read and re-checked inside the write.

**Claiming the Rank-4 perk.** Promoting a coach *to* Rank 4 grants the archetype perk as
part of the promotion. A coach who **converted in at Rank 4** from a gym never went through
a promotion, so his perk is offered as a separate, **free** claim on the coach card — the
rank was already earned, the claim just hands over what is owed. The claim is additive and
one-shot: it only ever adds the missing perk id to `fighter.gymPerks`, never removes or
overwrites anything, a perk already held (very common — the source gym granted it at its own
Rank 4) is reported as already held rather than duplicated, and a double-click grants once.
A maxed coach therefore always states one of exactly three truths: perk held, perk
claimable, or this archetype has no perk.

### 6.15 Camp XP, move drops & injuries

A camp session's XP multiplier is:

```
coach drill:  coach multiplier (below)  × condition band × (1 + backstory training mod)
open mat:     tier fallbackXpMult       × condition band × (1 + backstory training mod)

coach multiplier = tier coachXpMult × (1 + 0.05 if coach rank ≥ 3) × (1 + trait XP bonus)
                   … and if the coach's morale is below 30, the BONUS above 1.0 is halved
                   (never the base — a miserable coach is worth less, never worthless)
```

The only trait XP bonus in Phase 1 is the Taskmaster's +10% (§6.17). The morale halving
applies to the coach's own bonus only — condition band and backstory stay outside it. The
condition band is read **once, before the batch**, so all sessions in one click share
one multiplier. Shop supplements apply on top, per affected stat, consuming one charge per
completed session — identical to the gym path. Stat XP thresholds, the 95 training cap and
the great/normal/sluggish session roll are all the shared training maths (§6.7), not a
camp-specific copy. Trait-adjusted drill numbers (energy, injury, drop, condition — §6.17)
are applied in exactly one shared routine consumed by both the display payload and the
training resolver, so the card never advertises a number the session doesn't charge.

**Move drops** follow the per-drill odds in §6.12 rather than the gym's flat rate — see
§26.3. Rarity is weighted by the camp's tier drop table (§6.10), reusing the existing gym
rarity tables. **A coach flagship's drop strongly prefers that coach's own teach pool**
(decision 2026-07-27, superseding Phase 0's no-bias rule): the rarity is rolled first
against the tier table as always, then the move is drawn from the coach's own teach pool
(the moves on his card) when it has a candidate at the rolled rarity, falling back to the
whole catalog only when it doesn't — so the bias can never grant a rarity the roll didn't
earn. **Open Mat is
the unbiased control**: whole catalog, 4%, exactly as in Phase 0, keeping one camp session
directly comparable to the gym path. At most one drop per request.

### 6.16 The Trainer Market (Phase 1)

The market is the camp's only hiring channel — a weekly slate of candidate coaches. It
**opens at effective Camp Tier 2** (renovation §6.20, or the Regional Pro promotion floor)
and runs on the camp economy's single heartbeat: **Monday-aligned weeks** (boundaries at
Monday 00:00 UTC — the same tick that debits wages and runs morale, §6.19, so "market
resets in 4 days" and "next wage in 4 days" always agree).

- **The slate:** **3 candidates** per week — **4** while a Well-Connected coach (§6.17) is
  on the roster. Candidates are rolled once per camp per week, **deterministically** from
  the camp id + week index, and the stored slate is authoritative from then on — there are
  **no rerolls of any kind** (no paid refresh, no fishing by re-reading). What Monday
  brings is what the week has.
- **Candidates expire at the end of the week.** An unhired candidate is gone; a hired one
  is off the slate for everyone else's purposes (his card is removed on hire).
- **Rarity odds:** Common 55% / Uncommon 30% / Rare 12% / Legendary 3%, gated:
  **Rare requires Camp Tier 2**, **Legendary requires Camp Tier 4 AND peak fame ≥ Rising
  Star** (peak fame, not current — a Legendary prospect doesn't vanish because fame
  decayed). Ineligible rarities are **removed and the remaining weights renormalised** —
  never folded into Common — so a Tier-2 camp rolls Common/Uncommon/Rare at 56.7/30.9/12.4,
  not 58/33/12-with-a-dead-3.
- **Composition rules:** at most **2 candidates per discipline** per week, and the slate
  always includes **at least one candidate from a discipline you have no coach in** (when
  any eligible discipline is unstaffed) — the market never shows a wall of coaches you
  can't use.
- **Full disclosure on the card:** every candidate shows his rarity, trait (chip with
  description), hire fee and weekly wage (trait-adjusted, struck-through base when a trait
  discounts it), his complete drill kit with trait-adjusted numbers, his full teach pool
  (moves and the rarity he'd teach them at), and any familiarity credit (§6.18) that would
  apply. Displayed price is charged price — prices are a pure function of rarity + trait,
  with no per-individual jitter.

### 6.17 Coach rarity, traits & economics

**Prices by rarity** (hire fee is one-off; wage is weekly, debited every Monday — §6.19).
Wages **freeze at hire**: the number on the card is the number you pay for as long as he's
on staff, even if the economy is later rebalanced.

| Rarity | Hire fee | Weekly wage | Teach breadth |
|---|---|---|---|
| Common | $500 | $150 | 1 move |
| Uncommon | $1,250 | $300 | 2 moves |
| Rare | $3,000 | $750 | 3 moves |
| Legendary | $5,000 | $2,250 | his whole discipline pool |

A Legendary is deliberately **cheap to sign and expensive to keep** — the $5,000 fee is a
milestone purchase, but the $2,250/week wage is the real question the player answers every
Monday.

**Every market coach carries exactly one of twelve traits** (uniform roll; the starter has
none). A trait's numbers live in exactly one implementation site each, and the payload
always shows trait-adjusted values:

| Trait | Effect |
|---|---|
| Grizzled Vet | −10% weekly wage |
| Journeyman | −50% hire fee |
| Prodigy | −15% rank-up requirements (sessions and wins, rounded up) |
| Taskmaster ⚠ | +10% XP on his sessions · loses 1 morale a week |
| Perfectionist ⚠ | +1pt move-drop odds · +1pt injury risk on his drills |
| Safety-First ⚠ | −2pts injury risk · −1pt move-drop odds on his drills |
| Night Owl | His flagship costs 1 less energy |
| Handyman | +1 Facility Condition on every one of his sessions |
| Locker-Room Leader | +2 morale a week to your other coaches · nobody takes the morale hit when you fire someone while he's in the room |
| Loyal ⚠ | Never quits — morale floor 40 · +10% wage |
| Cornerman | +2 Facility Condition and +2 own morale after every (PvE) fight |
| Well-Connected | The weekly market shows 1 extra candidate |

⚠ = double-edged ("caution" traits — the chip renders amber). Guardrails: a trait's
injury/drop deltas only adjust drills that already carry a non-zero rate (Perfectionist can
never make a safe drill risky, Safety-First can never create a drop channel on a drill that
had none), and energy never drops below 1. Wage/fee multipliers are baked in at candidate
generation; the market card and the debit can therefore never disagree.

### 6.18 Hiring, firing & discipline familiarity

**Hiring** costs the hire fee up front and commits you to the weekly wage. One coach per
discipline; total slots come from camp tier (§6.10). A new hire starts at Rank 1, morale
100. A double-submitted hire charges once — the candidate row is claimed atomically before
any cash moves, and losing that race reports honestly instead of double-billing.

**Discipline familiarity** is the camp's memory of a discipline. It is banked from two
sources: gym conversion (§6.9) and any **Rank-3+ coach who is fired or quits** (banked at
Rank 2's requirement levels — 12 sessions / 2 relevant wins — never lowering an existing
bank). When you hire a coach in a discipline with a bank, the credit is applied to the new
hire **capped at Rank 2's requirements** — one free rank's worth of progress, never an
instant veteran — and the bank is then **spent**. Replacing a fired Head Coach is therefore
cheaper in time than starting cold, which is the design's answer to "firing must hurt but
never trap".

**Firing** a coach costs, deliberately and visibly (the confirm dialog lists every line):
- his **rank and progress are lost forever** (only the familiarity credit above survives);
- **−10 morale to every remaining coach** — unless a Locker-Room Leader is on the roster,
  in which case the whole room is shielded;
- **−15 Facility Condition** (a firing is bad for the building's soul).

The freed slot reopens **immediately** (owner decision, 2026-07-28 — the previous 7-day
hiring cooldown is removed). Churn is still discouraged, just not by a timer: the market
slate is fixed for the week and cannot be rerolled, so firing buys you no new candidates,
and you have already paid the real price in the coach's lost rank, the room's morale and
the building. A lockout on top of that mostly punished players who mis-clicked or changed
their mind, not farmers.

**The camp can never be coachless.** Firing the last coach is refused at every tier, full
stop. The starter coach is fireable like anyone else from Tier 2 on — the guard is "last
coach", not "starter coach".

**Quitting is not firing** (§6.19): a coach who walks out at 0 morale costs no condition,
no morale hit to the room — the weeks of neglect that got him there
were the price. Familiarity is still banked at Rank 3+.

### 6.19 Wages & morale — the weekly tick

Everything on a schedule in the camp shares **one weekly heartbeat**: a Monday 03:30 UTC
job (with a lazy Monday-aligned week index behind it) that debits wages, applies morale,
and processes quits. Per week, per camp:

1. **Wages** — the roster's total weekly wage is debited from cash in one all-or-nothing
   conditional write (never drives the balance negative). Paid or not, the result shows in
   the camp bar (`lastDebit`, unpaid-weeks counter). The starter's $0 wage means a
   one-coach starter camp never pays anything.
2. **Unpaid week** — every coach takes **−5 morale**, and Facility Condition takes
   **−5 × consecutive unpaid weeks** (capped at −20/wk). Paying again resets the counter.
3. **Unused coach** — a coach who ran **zero sessions that week** takes −3 morale (a coach
   hired mid-week is exempt for that week).
4. **Squalor doubles the damage** — if condition was **below 20** at the week's start, all
   the negative morale for that week is **doubled**. Positive morale is never doubled.
5. **Traits** — Taskmaster burns himself −1/wk; a Locker-Room Leader gives every *other*
   coach +2/wk; Loyal is floored at 40 and never quits.
6. **Quits** — a coach at **0 morale quits** (§6.18: no firing side-costs). **The last
   coach never quits** — his morale floors at 1 and the low-morale warning keeps firing.

**Morale consequences before the cliff:** below **70**, a per-coach warning appears in the
camp's Needs strip with the actual cause ("wages went unpaid", "hasn't run a session in
N days"). Below **30**, the coach's **XP bonus is halved** (the bonus over 1.0 — never the
base, §6.15). At **0** he quits. The tuning target: an *absent* player with two coaches
goes 100 → 0 in about 8 weeks (−8/wk, doubling once the building rots) — "months of total
neglect" — while an *active* player who pays wages and runs one session per coach per week
takes zero decay.

**Safety rails:** the weekly job claims each camp with a compare-and-set before touching
cash, so a crash mid-sweep skips a week rather than double-charging; catch-up after an
outage or long absence is capped at **8 weeks** of back-wages; and a camp's first-ever tick
processes no history — migrated players are never retro-charged or retro-decayed.

### 6.20 Renovation & Deep Clean

**Renovation — Tier 1 → 2: $2,000 + 3 career wins.** Unlocks the **second coach slot**
and **opens the Trainer Market** (§6.16). The cost is adjusted by the same persona
rank-discount modifier as gym rank-ups (§16.6), with the displayed price produced by the
helper that charges it. Tiers 3 and 4 are not purchasable — they arrive with the Regional
Pro / National promotion floors (§6.10). Renovation is only offered while the stored tier
equals the effective tier (a promotion that already floored you past a tier means there is
nothing left to buy at that step).

**Deep Clean — $300 for +40 Facility Condition**, any time condition is below full, no
cooldown. Cash-for-condition on demand, priced against the alternative: Recovery &
Mobility buys condition with energy (§6.12); Deep Clean buys it with money when energy is
worth more to you. It is *not* a training session — it never suppresses that day's idle
decay, so it can't be used as a $300 attendance stamp. Not persona-adjusted.

### 6.21 The teach channel (Phase 2)

Promoting a coach hands the player Special Moves from that coach's own frozen
`teachPoolMoveIds`. This is the camp's second move source alongside per-drill drops
(§6.15), and the only one the player can *aim*: the pool is visible on the coach card
from the moment he appears on the market, so a hire is a decision about which moves you
are buying access to.

**Which rank teaches what** — `TEACH_RANK_BY_SLOT`, indexed by pool position:

| Coach rank | Pool slots granted | Notes |
|---|---|---|
| 2 | slot 0 | The first move; every rarity has one |
| 3 | *none* | Rank 3 is the permanent +5% XP node — giving it a move would leave Rank 4 with only the perk |
| 4 | slots 1…n−1 | **All** remaining slots at once |

Pool breadth is the rarity gate, applied once at generation
(`DOMAIN_TEACH_POOLS[domain].slice(0, TEACH_BREADTH_BY_RARITY[rarity])`), so no rarity
check is needed at grant time: Common teaches 1 move, Uncommon 2, Rare 3, Legendary the
full domain pool. A Common coach's Rank 4 therefore teaches **nothing** — his single move
already arrived at Rank 2, and Rank 4 pays him out in the archetype perk instead.

**Rarity of the copy.** `teachRarityFor(coachRarity, move.minRarity)` — the coach's own
rarity, floored by the move's catalogue minimum. A Rare coach hands over Rare copies; he
can never hand over a copy below what the catalogue allows for that move, and never above
his own rarity.

**Granting is idempotent.** `resolveTeachGrants` filters against the coach's stored
`taughtMoveIds` before anything is written, and `grantOrUpgrade` is the single writer of
`fighter.specialMovesOwned`. Re-promoting a coach whose slots are already recorded grants
nothing and moves no cash. Outcomes match the drop channel exactly: **NEW** (added),
**UPGRADE** (owned at a lower rarity — raised in place, never duplicated), **DUPLICATE**
(owned at the same or higher rarity — paid out in cash).

**A migrated Rank-4 coach teaches nothing, ever.** The gym→camp conversion deliberately
writes nothing to the fighter (§6.9), so a converted veteran arrives at Rank 4 with an
empty `taughtMoveIds` and no promotions left to spend. `buildTeachList` derives state from
the coach's **rank** against each slot's requirement rather than from pool position, and
reports those slots as `unavailable` — the screen says "missed", never a countdown to a
rank he already holds. His Rank-4 archetype perk is still owed and is settled separately
by `POST …/claim-perk`.

#### The Conditioning coach's camp-wide passive (2026-07-28)

CONDITIONING is the only archetype whose kit contains **statless drills — 2 of 4**
(`sc_plus`, `recovery_mobility`). Every other archetype's four drills grant permanent stat
XP. Worse, both of his pay out in **capped** resources: Max Stamina stops at 120, Facility
Condition at 100. Once a player topped both meters out, half his kit was dead and there was
no reason left to hold a roster slot for him — a structural problem, not a tuning one, since
his whole identity was maintenance and maintenance has a ceiling.

He now carries a passive that cannot expire:

| His rank | Injury risk reduction, camp-wide |
|---|---|
| 1 | −15% |
| 2 | −20% |
| 3 | −25% |
| 4 | −30% |

Rules, all enforced in `effectiveInjuryRate` (the single home for camp injury math):
- **It applies to EVERY camp drill, including sessions run with another coach.** That
  cross-coach reach is what makes a support slot worth its weekly wage — he pays while you
  train with someone else.
- **Multiplicative, applied after the FIQ reduction.** It shaves dangerous sessions hardest
  and can never manufacture risk on a 0% drill.
- **The 30%-of-nominal floor still binds, and is applied last.** Stacking a Rank-4
  Conditioning coach onto a high-FIQ fighter reaches the existing floor sooner; it never
  buys immunity. "Safer, never immune" holds unchanged.
- **It does not stack** across multiple Conditioning coaches (the roster allows one per
  archetype anyway; `conditioningInjuryReduction` reads the first match so a future rule
  change can't silently start summing).
- **It is surfaced on the CAMP BAR, not only on his card.** `CampState.passives[]` carries
  every active camp-wide passive with the coach providing it. Rendering it solely on his
  coach card meant the one bonus that pays you for training with SOMEONE ELSE was visible
  only while you were looking at him. Each entry carries a `short` label ("-30% injury") so
  the bar never re-parses a number out of the prose `effect` string.

Also fixed alongside it: `sc_plus` is now **blocked** at the Max Stamina cap
(`canTrain: false`, plus a server-side check ahead of `deductBatchEnergy`). It has
`stats: []`, `xpBase: 0`, `dropPct: 0`, so at the cap it delivered literally nothing while
still charging 4 energy — the code already knew (`capHit`) and reported it only afterwards.

#### Legendary masterclass drills

Every Legendary coach carries a fifth drill his domain's `LEGENDARY_EXCLUSIVE_DRILLS`
entry defines — the widest session in the game (four stats, including FIQ, which is
otherwise hard to train), the highest move-drop chance, the highest energy cost, and a
condition cost the building feels. It is **locked until his Rank 4**, shown on the card as
a visible goal from the moment he is hired. Non-Legendary coaches have no such key, and a
request naming one is rejected before any energy is spent.

#### Gym retirement — CLEAN REMOVAL, NO CONVERSION (owner decision, 2026-07-28)

`GYMS_RETIRED` (default **false**) retires the gyms in favour of the camp. When flipped,
the 7 gym endpoints answer `410 gyms_retired` — the 4 `/gyms` routes plus `train`,
`switch-gym` and `rank-up-gym`. The check is a middleware that runs **before** the
controller, so a 410'd training request never reaches `deductBatchEnergy` and costs the
player no energy. The client drops the Training tab, re-points every gym entry point at
the camp, and gym **Side Quests** end (that route degrades to an empty list rather than
410-ing, so a quiet ending never renders as a red error).

**Gym progress is NOT converted.** The owner chose a clean break over a migration:
`scripts/wipeGymData.js` clears `gymRanks`, `gymPerks`, `activeGymId`,
`activeGymPaidUntil` and the gym rank-4 badges from every non-bot fighter. Affected
players are compensated out of band (energy drinks) rather than through an in-place
conversion. `scripts/migrateFightersToHomeCamp.js` is therefore **not** part of the
cutover; it remains only for backfilling camps for players who never opened the screen.

⚠️ **The shared-key rule.** Gym perks and camp perks are the same keys — the camp grants
into `fighter.gymPerks` rather than defining a parallel perk system — and 4 of the 10 gym
perks (`corner_confidence`, `mat_returns`, `submission_awareness`, `iron_conditioning`)
plus 4 of the 10 gym badges (`boxer_rank4`, `wrestling_rank4`, `bjj_rank4`,
`muaythai_rank4`) are also reachable through a camp coach's Rank 4. The wipe discriminates
on `fighter.campRank4Archetypes`, which only the camp ever writes: anything whose archetype
appears there was earned in the camp and is **kept**. The 6 gym-only perks and 6 gym-only
badges always go.

The wipe writes fighter documents and is only reversible through the backup it fsyncs
before its first write; `scripts/restoreGymData.js --from=<backup>` is the tested rollback
(round-trip verified locally). The flag itself is reversible with a restart — while false,
the middleware is a pure `next()`.

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

Cost capped at 3,000 fame, min 100. An active callout can be cancelled for a **full fame refund** before the fight. The called-out opponent appears in the next Hard slot with a gold border and full Fighter Report intel. A callout **win**: +25% cash, +30% fame (grudge), and the **Called It** badge. Losing only burns the spent fame.

---

## 8. Champions & Title Shots

Each pro tier (Regional Pro, National, GCS) has a persistent NPC champion per weight class. You cannot promote past these tiers without beating the champion.

- **Earning a shot:** reach the next tier's OVR threshold → pending promotion set → climb into the **top 5** → win **3 fights while ranked top 5** (2 for Amateur) → title card appears as a 4th gold card. Wins earned *before* you reached the top 5 do **not** count; once banked they are **not** lost if you drop out of the top 5 (they only reset on promotion). The post-loss rematch cooldown is a separate plain 2-win count (any wins, not top-5-gated).
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

### 9.3.1 Rank-4 coach perks that act on the fight camp

Three of the four camp Rank-4 perks (§6.21) are fight-camp effects. They were catalogued,
granted, toasted and badged from the start but **read by nothing until 2026-07-28** — a
player paid $5,000 for the promotion and received no mechanical effect. Now wired:

| Perk (archetype) | Effect | Where |
|---|---|---|
| **Corner Confidence** (STRIKING) | +1 camp slot when the opponent's style is a striker | `createCamp` |
| **Mat Returns** (WRESTLING) | Takedown Defence never scores below **Partial** | `getMatchStatus` |
| **Submission Awareness** (BJJ) | Submission Escapes bonus ×1.05 | `buildSessionBonuses` |

The fourth, **Iron Conditioning** (CONDITIONING), acts on training rather than the fight
camp (+2 Max Stamina per S&C session instead of +1) and was the only one that ever worked.

Three rules govern them:
- **"Striker-style" is `STYLE_TO_DOMAIN[style] === "STRIKING"`** — Boxer, Kickboxer, Muay
  Thai, Capoeira — reusing the map that already picks a starter coach's discipline rather
  than a second hand-maintained list.
- **Mat Returns is a floor, never a cap.** Against a Wrestler, Takedown Defence is already
  Matched (100%); applying Partial there would make the perk a *downgrade*.
- **Submission Awareness multiplies, it does not add.** The +5% rides the session's own
  match-status and diminishing-returns multipliers, so it cannot resurrect an Unmatched
  session that earned nothing.

Perks are **snapshotted onto the camp at creation** (`fightCampModel.perks`), matching how
`maxSlots` is already frozen there. Claiming a perk mid-camp does not retroactively add a
slot or re-score sessions already logged; it applies from the next fight you accept.

### 9.4 Camp Rating (S–F, informational, no flat stat modifier)
S 90–100, A 75–89, B 55–74, C 35–54, D 15–34, F 0–14.

### 9.5 The Fighter Report
Pre-camp scouting classifies each opponent stat: **Confirmed**, **Suspected**, **Unknown**.

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

### 10.0 Accept → Face-Off → Camp
Accepting a fight plays a brief **face-off** overlay before the Fighter Report: you
(blue corner) and the opponent (red corner) slide in from opposite sides, clash on a
"VS", and a **public tale-of-the-tape** staggers in — Overall, Record, Style, weight
Class — then it auto-dismisses into the report (or Skip / Esc / Enter). It is
deliberately **spoiler-safe**: only info already on the offer card is shown; the
opponent's detailed combat stats stay fogged for the player to scout in camp (§9.5).
Cosmetic only — no mechanic. Responsive (L/R on desktop, vertical clash on mobile) and
respects `prefers-reduced-motion`.

### 10.1 Weight Cut
Before every fight the player picks a weight-cut strategy — a stamina gamble with a chance to miss weight.

| Strategy | Stamina Roll | Miss-Weight Chance |
|---|---|---|
| Easy | +0 (guaranteed) | 0% |
| Moderate | −5 to +10 (random) | 5% |
| Aggressive | −12 to +18 (random) | 20% |

**On a missed weight:** the stamina roll is forced **negative-only** (you can never gain stamina *and* miss), the cash purse is cut **−20%**, and you take a **−200 fame penalty**. The Titan **Strength Reserve** perk raises the bad-roll floor by 3.

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

### 10.4 Cash Earnings
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
| Respect | 6 fights | +15% cash purse | Silent expiry |

Every completed fight decrements unmatched flags. Meeting the flagged opponent — win or lose — consumes the flag (no penalty even on a loss). Lifetime beefs-started drives the **Controversy** / **Serial Beefcake** badges.

---

## 12. Notoriety (Fame)

Career fame score. Sets per-fight cash bonuses and unlocks recognition. Never fully resets — floored at the fighter's peak tier.

### 12.1 Tiers
| Tier | Score Range | Cash Bonus |
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

Sign sponsor deals that pay per-fight cash + lump-sum clause bonuses.

### 13.1 Slot Cap by Fame Tier
Unknown 0, Prospect 1, Rising Star 2, Contender 2, Star 3, Legend 4.

### 13.2 How Contracts Work
A pool of **4 sponsor offers refreshes every 7 days**, gated by fame tier. Active contracts pay per-fight cash; completing the clause pays bonus cash + fame and closes successfully; breaking ends with a fame penalty; time-limited clauses expire silently. Dropping costs half the break penalty. Sponsors completed/broken/dropped this week don't reappear until the next rotation (anti-farm). Some contracts also award **Energy Drinks** (`rewardDrinks` 2–4) — see §15.

### 13.3 Clause Types
Win Next N · Finish Next N · Win Any N · Land One KO · No Weight Miss · No Finish Loss.

---

## 14. Events: Fight Card Predictions

The Events tab runs a weekly NPC fight card the player bets on for fame and cash; it resolves automatically at the end of its 7-day window.

- **The card:** 5 fights from non-champion GCS fighters — 2 Prelim (OVR 70–87), 2 Main Card (OVR 88+), 1 Headliner (highest combined-OVR pair).
- **Predictions:** pick a side (A / Draw / B) and a method (KO/TKO, Sub, Decision); locks are final; any subset may be locked.

| Slot | Exact (Winner+Method) | Winner Only | Wrong Winner |
|---|---|---|---|
| Prelim | +100 fame, +200 cash | +30 fame | −20 fame |
| Main Card | +200 fame, +400 cash | +75 fame | −40 fame |
| Headliner | +300 fame, +500 cash | +100 fame | −50 fame |

On resolution, every NPC fighter's record and history update (the GCS roster accumulates real history). A multi-fight reveal modal shows results on the first Events visit after resolution.

---

## 15. The Shop & Premium Items

The Shop sells consumables for cash. A separate premium currency, the **Energy Drink**, is mostly *earned* through play and can also be bought in bundles.

### 15.1 Cash Items
| Item | Effect | Price (Cash) |
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
| Recap | +100 fame, +150 cash | After ≥1 completed fight. |
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

### 16.6 Persona System
A **public character** that emerges from the media choices the player already makes — no new content, no new buttons. It turns "how the crowd sees you" into an ongoing playstyle identity that pays off consistency of character. PvE-only (mirrors Special Moves §26); never touches the Proving Ground.

**Two axes** (persisted per fighter as `persona.x`, `persona.y`, each −100..+100):
- **Hated (−x) ↔ Loved (+x)** — how the crowd feels about you.
- **Loud (−y is Quiet) ↔ Loud (+y)** — how you carry yourself.

**Storyline Heat** = `clamp(round((|x|+|y|)/2), 0, 100)` (derived, never stored). It **scales every modifier** (rewards *and* costs) on a floored curve: **50% strength the moment the archetype is claimed at 25 heat, scaling linearly to 100% at 100 heat** (`heatFrac = 0.5 + 0.5·(heat−25)/75`; a raw `heat/100` curve made low-heat modifiers read as ~1% rounding errors nobody felt). It also **unlocks the signature perk at ≥70%**, and **decays ×0.95 toward center after every PvE fight** — identity needs upkeep or it fades.

**Archetypes** (quadrants; center is modifier-free "**The Unwritten**" — active only past `heat ≥ 25`):

| Archetype | Quadrant | Rewards (full heat) | Costs (full heat) | Signature (≥70%) |
|---|---|---|---|---|
| **The Villain** | Hated+Loud | +15% purses; trash-talk fame ×2; callout fame cost ×0.5; listeners +35% (cosmetic) | sponsor payouts −35%; beef-lapse penalty ×2; respect/charity fame ×0.5; **beef-loss heat drain** (−15/axis toward center) | **Bad Blood** — nemesis + active-Beef fights pay ×1.5 fame & +15% purse (stacks on the +30% grudge base) |
| **The People's Champ** | Loved+Loud | comeback-mode fight bonuses +5%; +1 sponsor slot; +1 appearance-pool slot; listeners +20% | purses only +5%; trash-talk fame ×0.5; upset-loss −150 fame (lose to a lower-rated foe) | **Hometown Hero** — comeback-mode win adds +30% purse (additive) & +250 flat fame |
| **The Boogeyman** | Hated+Quiet | damage taken −2% (shares the OPPONENT_DAMAGE_REDUCTION lane); +8% purses; cryptic fame ×1.5 | listeners −10%; sponsor payouts −20%; loud-action fame ×0.5 | **Ambush** — equipped **Proc** special moves fire ×1.10 (excludes Sprawl Instinct's lane; capped +0.02/move) |
| **The Role Model** | Loved+Quiet | sponsor payouts +10%; gym rank-up cost −10%; hospital bills −15%; beef-lapse/weight-miss fame penalties halved | no purse bonus; heat builds 25% slower; Trash a Rival relies on Breaking Character | **Legacy** — documentary & win-milestone fame ×1.5 |

**Modifier shapes:** Type A additive fraction (`full × heatFrac`), Type B reward multiplier (`1 + (mult−1) × heatFrac`), Type C flat counts (+1 sponsor slot / +1 appearance slot — no fractional scale, unlock in full only at heat ≥70). `heatFrac` uses the floored curve above (0.5 at heat 25 → 1.0 at heat 100), so e.g. a fresh Villain already earns beef fame ×1.5 and +7.5% purses.

**Nudges** come only from existing actions (each carries a `(dx,dy)`): the **post-fight interview** (Humble +6/−6, Confident +6/+6, Trash Talk −8/+8), each **podcast segment** (e.g. Trash a Rival −9/+7, Cryptic −3/−8, Show Respect +7/−5), each **appearance**, and the **documentary** (Focus + Tone summed). Committing to one quadrant reaches ~70% heat by roughly fight 12 (interview-only).

**Breaking Character ("The Turn"):** nothing is ever locked. Below 40% heat an off-brand action is a normal nudge; at **≥40% heat**, a diagonal-opposite-quadrant action pays its fame **×2**, still lands its full effect (Beef flags always write), but lurches the nudge ×1.5 then **shatters heat** (×0.6 toward center), deactivates the signature, and **blanks all persona modifiers for the next fight** (one-fight blackout; x/y/heat still tracked). Heel turns and redemption arcs become player-authored career stories.

**Gating:** heat is capped at ≤50% until Regional Pro (non-destructive), uncapped after. **Feed/Gazette:** being crowned, crossing into signature range, and a Breaking Character event all log a "Persona Edition" story.

**Persona Moments (milestone celebrations):** exactly two modals, matched to the two capability milestones — (1) **"The press has spoken"**: the first time EVER an archetype is claimed (entering it from Unwritten or another quadrant), showing the archetype name/epithet and the live modifier chips that just switched on; gated by `fighter.persona.crownedArchetypes` so re-entry after decay never re-fires it. (2) **Signature unlocked** at ≥70 heat: signature name + payoff + the retention hook (decay drops it below 70). Both are detected from `personaNudge.crownedInfo`/`signatureInfo` attached by `applyNudge` and fire from any of the four nudge sources (podcast / appearance / documentary / post-fight interview); they queue behind fight overlays (belt/tier/banner) and never re-fire on re-activation. Heat ticks, decay, and Breaking Character deliberately get NO modal (Breaking Character keeps its inline warning + result note + feed story).

**Where it surfaces:** a **persona strip** at the top of the Media Hub (octagon map + archetype + epithet + heat bar + live modifiers), nudge chips + a "this moves you → {archetype}" preview on every media/interview action, and modifier reads at purse/fame/sponsor/callout/gym/hospital sites (all blackout-gated, all routed through `personaService`). **Price displays match the charge:** sponsor contract cards, gym rank-up buttons, and hospital bills all show the persona-adjusted number with the base price struck through and an attribution tag (e.g. "The Role Model −10%", via `personaService.priceAdjust`); contract history stays at booked rates.

---

## 17. Health, Stamina & Injuries

- **Health** 0–100; depletes from fight damage (KO/TKO loss → 0); regenerates +1 HP / 5 min (~8h for a full heal).
- **Stamina** 0–100 (higher with some backstories/conditioning); affected by weight cut, fight activity, exhaustion.

### 17.1 Injuries
| Injury | Source | Penalty | Heals In | Blocks |
|---|---|---|---|---|
| Cut | Fight | None | 6 h | Fighting |
| Bruised Rib | Fight | −10 Max Stamina | 6 h | — |
| Broken Nose | Fight | −3 CHN | 9 h | — |
| Broken Hand | Fight | −20 STR | 24 h | Bag/pad work |
| Sprained Ankle | Sparring | −15 LEG | 18 h | — |
| Torn Ligament | Sparring | −10 STR, −10 LEG | 24 h | Fighting |
| Concussion | KO/TKO or Sub loss | −2 CHN | 12 h | Fighting + sparring |

**Healing model:** every injury ticks down by real elapsed hours and auto-clears for **free** — **no permanent dead ends, and the Hospital is never a payment gate**. The Hospital shows a live countdown. Auto-heal injuries clear free over time (cash can skip the wait); doctor-required injuries (Cut, Broken Nose, Concussion, Torn Ligament) also auto-heal on their own but block fighting/sparring while active, so the paid doctor visit only buys back the wait — it's never the *only* way out.

### 17.2 New-Fighter Injury Grace
During a fighter's **first 3 fights**, no fight-blocking injury (Concussion, Cut, Torn Ligament) is ever inflicted (fights or sparring). Non-blocking injuries can still occur. After 3 recorded fights the grace expires.

---

## 18. The Hospital

Cash-paid services to skip recovery, fast-clear blocking injuries, or restore HP.

- **Doctor Visit:** clears one doctor-required injury — Cut (10E/200), Broken Nose (10E/400), Concussion (20E/1,500), Torn Ligament (20E/2,000). **Amateur exception:** the Concussion doctor visit costs **600** (not 1,500) at Amateur tier, so a new player who eats the guaranteed KO-loss concussion isn't priced out of the fast-heal in the fragile early game (it still self-heals free in 12 h regardless).
- **Skip Recovery:** clears one auto-heal injury — Bruised Rib 600, Sprained Ankle 800, Broken Hand 1,200 (cash only).
- **Health Restoration:** Quick Patch (+25 HP / 250), Recovery Bay (+50 HP / 400), Full Restoration (→100 HP / 700). Cost pro-rates to HP actually delivered.
- **Full Recovery Package:** heals every active injury at a 15% bulk discount (2+ injuries).

No tier gating on any service.

---

## 19. Comeback Mode & The Nemesis System

- **Comeback Mode:** any loss activates it. Next fight's XP ×1.5 and cash +30%; winning earns the **Comeback Kid** badge (once per career) and clears the mode. No "Mental Reset" — a losing streak only freezes fame (§12.5) and activates comeback.
- **Nemesis:** an opponent who beats you becomes your Nemesis (only one at a time). They appear in offers and promise **+150 fame** for the rematch win (even while fame is frozen). Two straight title-shot losses make that champion the Nemesis. Defeating them clears the flag; promotion past a lower-tier Nemesis clears it automatically.
- **Dashboard surfacing:** while Comeback Mode is active, the dashboard hero CTA changes to an amber-striped call to action that spells out the live bonuses instead of the generic "pick a fight" prompt — *"Comeback Fight Waiting — your next win pays +30% cash and ×1.5 XP."* If a Nemesis is set, it upgrades to *"Settle the Score — fight {name} for revenge and +150 fame."* It sits just below the title-shot CTA in priority (a belt fight still wins), above regular offers, and a matching fallback nudge appears when no higher-priority nudge applies. The hero payload also exposes `identity.comebackActive` and `identity.nemesisName`. Purely a visibility layer — it changes no numbers.

---

## 20. Career Page, Badges, Feed & Octagon Gazette

### 20.1 Career Page
The **Career** tab has two sub-tabs:
- **Feed** — reverse-chronological timeline (see §20.4).
- **Profile** — the player's full profile: the customized banner (same cosmetic banner as the sidebar; no avatar), pinned badges, a "Customize Banner" entry, three cards (Stats / Career / **Championship Belts**), a read-only **Special Moves loadout strip** (mirrors the fighter's equipped moves next to the belts, deep-links to the Special Moves tab; owner-only, since the moves endpoint is owner-guarded — see §26), the full **Badge grid**, plus Media Career and **PvP History** (your Proving Ground record + recent fights — see §22.13).

The dashboard player-identity card is clickable and deep-links to the Profile sub-tab.

### 20.2 Badges (PvE catalog + synthesized Proving Ground category)
Permanent profile markers. PvE categories: **Career**, **Championships**, **Style**, **Gym**, **Media**, plus a synthesized **Proving Ground** category for PvP badges (§22.12). Locked badges show progress bars where applicable; newly-unlocked badges show a **NEW** corner flag (acknowledged by viewing the Profile — no modal). Examples:
- **Career:** First Blood, 10/25/50 Wins, win streaks, Division Dominator, The Long Game, Veteran.
- **Championships:** Amateur / Regional Pro / National / GCS Contender (non-winnable) / GCS Champion — **derived from promotion tier**; the belts on the Profile mirror these.
- **Style:** Finisher, KO Artist, Sub Hunter, Decision Machine, Iron Chin, Iron Will, Giant Killer, Comeback Kid, Fight of the Night, Perfect Camp, Called It, Nemesis Slayer, beef/respect badges.
- **Gym:** Rank-4 mastery badges (one per gym) **plus training-session milestones — Gym Regular (50), Gym Rat (100), Tireless (250)**, driven by lifetime `careerTrainingSessions`.
- **Media:** On the Mic, Media Star, The Documentary, Controversy, People's Champion, Star Power.
- **Proving Ground:** PvP achievement badges (§22.12) — onboarding, division/streak milestones, giant-kills, belts, defense, rivalry, and seasonal feats.

Championship and other state-derivable badges **self-heal** on Profile load (silently), so the Profile and the belts always agree without a migration.

### 20.3 Banner Customizer
Four cosmetic layers — Background (12), Frame (7), Accent Color (11), Pinned Badges (pin up to 3). Pieces unlock by fame tier, milestones, belts won, and **badges** (`unlockAt.badge`). A badge unlock is honoured across both badge namespaces — the legacy flat `fighter.badges` strings *and* the catalog ids in `fighter.badgesEarned[].badgeId` — so career, gym-rank, and PvP-season badges all count. Purely cosmetic; unlocking a piece grants no stat effect.

**Badge-gated pieces (10).** Backgrounds *Scorched Canvas* (`ko_artist`), *Titanium* (`titan_rank4`), *Gold Leaf* (`champ_gcs`), *Throne Room* (`pvp_belt_first`); accents *Champagne* (`perfect_camp`), *Blood Rival* (`nemesis_slayer`), *Platinum* (`veteran`), *Teal Ice* (`sub_hunter`); frames *Warpath* (`giant_killer`), *Spotlight* (`documentary`).

**Unlock celebration.** When a fight resolves, `fightService.resolveFightAndApply` snapshots the unlocked-piece set **before** the resolve and diffs it **after** all resolve mutations (badges + gym-rank), emitting `newlyUnlockedBannerPieces: Array<{ id, kind, label, unlockBadgeId, badgeName, badgeDescription }>` on the summary (badge name/description resolved via the career + PvP badge catalogs; the whole diff is wrapped in try/catch and defaults to `[]`, so it can never break a resolve). The frontend shows a single **Banner Unlocked** modal listing every piece that fight unlocked (never one modal per piece), with a "Customize Banner →" CTA that deep-links straight into the editor. Because the season PvP belt is awarded off the season-end path (not a PvE fight resolve), the `pvp_belt_first` → *Throne Room* piece unlocks normally in the editor but does not fire this post-fight modal.

**Overlay queue.** The post-fight celebrations share one ordered queue (`App.jsx`), shown one-at-a-time in priority order **Belt Won → Tier Up → Banner Unlock** so the banner pop never buries the bigger moments. Each resolve *replaces* the queue (never appends), and only the head of the queue is ever rendered — 0/1/2/3 simultaneous celebrations from a single fight all resolve cleanly.

### 20.4 Career Feed
Reverse-chronological log: fight results, promotions, title eligibility/wins, Nemesis set/cleared, badges earned, sponsor events, callout wins, beef lapses, prediction outcomes, fame milestones.

### 20.5 The Octagon Gazette
A persistent in-game newspaper — **always available, always current**. It is no longer a daily login popup. Instead it lives as a cream **tile in the home dashboard's 3-up top row** (alongside Rankings and Proving Ground tiles); clicking the tile opens the full broadsheet as a modal overlay. Purely informational + navigational (every story links to the relevant tab and closes the paper).

**Generation & storage.** The paper is composed **server-side and persisted on `player.gazette`**, and **regenerated after every meaningful career-feed event** — not on login. Regeneration is triggered from the single career-feed write chokepoint (`activityLogService.log`) via an allowlist of content-bearing event types (fight win/loss/draw, tier promotion, title won, nemesis set/cleared, badge earned, title-shot eligible, and the PvP win/loss/promotion/belt/rivalry-resolved events). A regeneration failure never breaks the feed write. Content selection is deterministic per issue (seeded RNG keyed by `issueNumber|fighterId`), so re-opening the same issue always reads the same; a new event reseeds and prints a fresh issue.

**Issue history.** Each regeneration increments `issueNumber` (starts at 1; volume rolls every 52 issues), giving every fighter an accumulating paper of record shown in the masthead (Vol./No., edition, "Breaking" label, fighter meta, cash/fame meta).

**Layout.** Masthead → **Lead story** (kicker, headline, deck, byline, a dark *result band* [outcome · method+round · record · camp grade, each omitted when unavailable], 1–4 justified paragraphs with a drop cap, and a pull quote) → **4-item Sidebar** (Rankings, Nemesis, Fight Offers, Proving Ground, Injuries, Gym Mastery, Contracts — filled by priority/eligibility; action items show a "Go →" pill) → **3 Secondary stories** (Camp Report, Gym Milestone, Contracts, Badge, Comeback, Record Milestone, with evergreen fillers) → **In Brief** (4–6 one-liners). Lead is picked by priority: Mental-Reset Notice → Event Result → First Title-Fight Loss → Title Fight Result → First Loss → Promotion → Rank Entry → Win Streak → Rank Jump → Last Fight Result → Division Spotlight.

**Empty state.** Brand-new accounts (no fights, `issueNumber` 0) show "Nothing to report yet. Fight your first match and check back." in both the tile and the modal.

---

## 21. Onboarding Tutorial

New accounts run a guided tooltip sequence through the core loop: fighter profile → gym → first training session → request/read a fight offer → camp (Fighter Report, session selection, weight cut) → fight result and fame → rankings → events → hospital. Ends with a completion modal granting a **$500 signing bonus**. Legacy accounts are marked complete and never see it.

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

| Final division | Cash | Fame | Energy drinks | Badge |
|---|---|---|---|---|
| Prospect | 500 | 500 | 0 | — |
| Contender | 1,200 | 1,200 | 0 | — |
| Challenger | 2,500 | 2,500 | 0 | Challenger |
| Elite | 5,000 | 5,000 | 2 | Elite |
| Champion | 10,000 | 10,000 | 5 | Champion |
| **Belt holder** | 15,000 | 15,000 | 7 | Belt |

After payout, a **soft reset** drops each player one tier into the next season (champion→contender, elite→challenger, challenger→contender, contender→prospect, prospect→prospect), DP set to the new floor — so every season is a fresh climb that still rewards last season's standing with a head start. A new season is seeded automatically.

Seasons are controlled by a per-season **config block** (`Season.config`), so behaviour is flippable season to season without code changes — see the Open format below.

**Between seasons — the pre-season countdown.** When the live season is taken offline and the next is seeded as `upcoming` with a future `startDate`, entering the Proving Ground shows a **pre-season countdown** instead of the ladder: a live `hh:mm:ss` timer to the new season (red, pulsing `mm:ss` in the final hour; "Season opening…" held at zero), the upcoming season's name/twist, the stakes, and a primer for new players. When the timer reaches zero the transition sweep flips the season to `active` and the hub returns automatically (client polls 30s, 5s once at zero — no manual button). **Defense gameplan is editable during the pre-season window:** it persists as a fighter-level default (`fighter.pvpDefenseGameplan`) and seeds your PVPRecord's `defenseGameplan` when the new season's record is created — defaulting to **Balanced** if never set. Setting it during an active season writes both the record and the fighter default (kept in sync).

**Public landing-page season band.** The marketing landing page mirrors the same season state for logged-out visitors via a public, unauthenticated read (`GET /pvp/season/public` → `{ status, seasonNumber, name, startDate, endDate, crossWeightClass, weightClass }`; returns `null` when no season exists). The PVP band is data-driven: an `upcoming` season shows the same live countdown to `startDate` (`H:MM:SS`, `MM:SS` sub-hour, "Opening…" at zero), an `active` season shows "Live Now" with a computed weeks-remaining pill, and a missing/errored fetch falls back to evergreen copy so the page never looks broken. The band polls (30s, 5s near zero) so it ticks down and auto-flips `upcoming → active` without a reload. Presentation only — no player-specific or authenticated data is exposed.

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
- **First-season bonus.** The first time a player completes any PvP season (≥1 fight) they receive a one-time **+500 cash / +100 fame** on top of their normal division rewards. *(Applies in Season 1.)*

**Season-1 exception summary:** unlock gate APPLIES; placement, shield, and catch-up are SKIPPED; first-season bonus APPLIES. Detected via `season.seasonNumber === 1` at record creation.

### 22.10 Browsing the ladder & challenging from a profile
The Ladder tab is **one unified, filterable standings view** — a single ladder, not five separate per-tier boards. The division buttons are *filters* over that one dataset, not navigation to distinct scoreboards:

- **Filters.** A division selector (Prospect → Champion, plus **All**) defaulting to the player's own division, and — in a cross-weight (Open) season — a weight-class selector (All / FW / LW / MW / HW, defaulting to All); in a normal per-weight-class season the weight filter is hidden. A **division summary** row shows the live fighter count in each division. All counts and the table respect the active filters; in an Open season the weight filter and the per-row weight-class tag key on each fighter's **real** weight class.
- **Your position** stays pinned above the table regardless of the active filter, showing your rank, DP, record, streak, and progress to the next division (or, for a Champion, your rank among champions and the weeks left in the season).
- **The table** is paginated (20 per page, "Load More") and ranks fighters by DP within the active filter. Each row carries a coloured **division badge** (Prospect → Champion, using the division colour) and a matching 3px division-coloured left border so tiers read at a glance, plus contextual tags (Belt Holder, Rival, You, Protected, streak ×1.25, cross-weight class); the belt holder, your own row, and rivals get tinted backgrounds. A **Last Active** column hints at who is at risk of inactivity decay.
- **Your Season card** (pinned above the table) shows your **overall rank across all divisions** in the season pool, your DP, record and streak, and a **multi-tier progress track** spanning Prospect → Champion with a marker for where you sit and a "DP to {next division}" callout positioned at the start of the next tier.
- **Profiles & challenges.** Clicking a row opens a **read-only** version of that fighter's Career Profile (no edit controls). If they're a valid target in the current season, a **Challenge** button there is a shortcut into the pre-fight flow — but it never bypasses matchmaking: it's disabled for protected (new-competitor-shield) fighters and for anyone outside the player's OVR matchmaking range, and hidden for fighters not in the same active season.

### 22.11 Real consequences — HP, injuries & stat XP
A PvP fight resolves with the **same physical and progression consequences as a PvE fight** — there is one body, and it gets hit in both modes. The post-fight consequence logic (HP, injuries, stat XP) lives in **one shared home** that PvE and PvP both call, so the rules are identical by construction.

- **HP.** Each fighter enters the bout at their **real current health** (not a fresh 100) and ends at the engine's result; a KO/submission loss zeros their HP. Health regenerates over time exactly as in PvE. A low-HP fighter is genuinely weaker — and an easy mark on defense.
- **Injuries.** Both fighters roll the **same injury system** as PvE: a KO/sub loss guarantees a Concussion; otherwise a single fight-injury roll (FIQ- and tier-weighted). These are **real injuries** — they appear in the Hospital, heal over time, and a fight-blocking injury gates **both** your PvP fights *and* your PvE career until it heals or you visit the doctor. The new-fighter injury grace (§17.2) still applies.
- **Stat XP.** Both fighters earn post-fight stat XP from the same §10.3 table — so PvP is a real (if uncontrollable, all-stats) progression avenue, including the 96–99 fight-XP-only band.
- **Applied to both fighters, online or offline.** A defender takes full HP loss, injury rolls, and XP even while logged out (their defense-results screen reports what it cost them). The defender is reconciled to their true current state before the fight; a fighter with a fight-blocking injury **cannot be challenged** (shown "Recovering"), which also caps how badly an offline player can be ground down.
- **What's NOT shared.** PvP keeps its own economy — DP, season rewards, and the 15-energy attack cost — and does **not** pay the PvE cash purse, notoriety, or trigger nemesis/comeback. The attacker pays 15 energy; the defender pays no energy.
- **Anti-farm guard.** Stat XP from repeat fights against the same opponent in a week is reduced (×0.5 the 2nd, ×0.25 the 3rd+, mirroring the DP repeat penalty), so trading wins can't farm XP.
- **Exception — placement.** A placement bout (§22.9) is the one fight where the *defender* takes no physical consequences (they never opted in); the attacker still does.

### 22.11a Offline-defense notification
Because attacks resolve while you're away, the game surfaces what happened the next time you're around — without auto-clearing before you've actually looked. Any unread defense result (a fight where you were the defender, not yet acknowledged) drives two indicators:
- A small **red dot on the "Proving Ground" nav item** (every nav surface — topbar, sidebar, mobile) whenever you have unread defense results.
- A **summary banner at the top of the Proving Ground Hub**: "⚔ Challenged while offline · N held · N lost · −X DP · You sustained a [injury]." (injury line only when one was sustained; multiple injuries are listed). It links **"View defense report →"**, which opens the **Career feed with the most consequential defense's breakdown drawer auto-opened** (the most recent loss; or, if every defense held, the most recent defense).
The dot and banner **persist until you click "View defense report"** — merely opening the Hub or the Defense tab does not clear them, so a meaningful loss can't be missed. Reads are a peek (no acknowledgement); the click is the only action that marks the results seen. The summary rides the polled fighter payload (`fighter.pvpDefense`), so no extra request is needed for the dot.

### 22.12 Proving Ground badges
Beyond the per-season belt/division badges paid at finalize (§22.6), the Proving Ground awards a catalog of **permanent achievement badges** that live on the Career Profile under a synthesized **Proving Ground** category (§20.2). They are awarded imperatively (idempotent) from two hooks — on PvP fight resolve and at season finalize — and never from PvE events. Placement bouts and draws never award win-gated badges. Batch 1:

- **Onboarding:** First Blood (first PvP win), First Finish (first KO/sub win), Held the Line (first successful offline defense).
- **Division milestones:** reaching Contender / Challenger / Elite / Champion (one-time, lifetime).
- **Streaks:** 3 / 5 / 10 PvP wins in a row.
- **Giant-killing:** Giant Killer (beat an opponent 6–10 OVR above you) and Giant Slayer (11–20 above) — keyed off the bracket bonus, so they reward fighting *up* only.
- **Rivalry & belt-defense:** Settled It (resolve a rivalry), Belt Defender (hold a defense while belt holder).
- **Seasonal (finalize):** Twist Master (win under an active season twist), Belt Holder / Two-Belt Champ / Back-to-Back / Open Champion (the one-and-only Season 1 Open belt) / Flawless Champion (win the belt with zero losses), Podium (top-3 finish), Perfect Season (10+ wins, zero losses).

Batch 1 adds **no new persisted fields** — every condition reads existing fight-doc, record, ladder, or `badgesEarned` data. (Tiered lifetime grind badges — career KO/sub/defense/volume counts — are a planned Batch 2 that needs a lifetime counter subdoc.)

### 22.13 PvP history & records
Every Proving Ground fight is recorded and surfaced in three places:

- **Proving Ground → History tab.** A reverse-chronological log of your PvP fights — both your attacks and the defenses that resolved against you while offline — each row showing outcome + method, the opponent, and the DP swing, with the full round-by-round breakdown openable per fight.
- **Career Profile → PvP History card.** The Profile sub-tab carries a PvP record + recent-fights card (reads `GET /pvp/record/:fighterId`), so your ladder history sits alongside your PvE career on one profile. Viewing another fighter's read-only profile (§22.10) shows their PvP history too.
- **Career Feed.** PvP results also write to the unified career feed (§20.4) as `pvp_*` entries, and those fight rows open the same breakdown drawer as PvE fights — so the Octagon Gazette and feed treat a Proving Ground bout as a first-class career event.

Defense results additionally drive the offline-defense banner + nav dot (§22.11a) until you open the report.

### 22.14 Ladder population (AI fighters) — INTERNAL
**Not player-facing. Deliberately absent from the in-game Library and changelog:** these fighters are indistinguishable from humans by design, and documenting them in-game would defeat their purpose.

A live ladder is the product. A new player who reaches the Proving Ground and finds three names in it churns — so the pool is seeded with **25 account-less AI fighters** (`Fighter.isPvpBot`, `userId: null`) that live on the ladder and fight on their own. They exist to solve the cold start, not to be a mechanic.

- **Distribution — bottom-weighted:** **18 Prospect / 4 Contender / 3 Challenger. Zero Elite, zero Champion, permanently.** New arrivals land at the bottom, so that's where the population has to be. The bottom cluster sits at **OVR 11–18** against a day-one fighter's **OVR ~13–15** — beatable, not free.
- **Never crowns a bot:** a bot's DP is clamped to `BOT_MAX_DP` (`divisionFloor("elite") − 1`, *derived* — never a literal) **before** `applyDpAndDivision`, so it can't enter the promote branch (which discards carry and snaps to the division floor). A bot can therefore never hold the belt, reach Elite/Champion, or take a podium slot. The clamp touches only the bot's own record — a human opponent's DP is never altered.
- **Emergent outcomes, no thumb on the scale:** bots fight through the *same* `resolveFight` humans call, with real OVR-vs-OVR. There is no scripted win rate. They take real HP damage and real injuries, and skip their turn when injured or out of energy — exactly like a human.
- **Fixed for life:** bots bank **zero stat XP** (both attacker and defender paths — they defend far more often than they attack, so missing the defender path would let them drift upward). OVR never grows. Injury penalties still apply and reverse normally.
- **Cadence — the believability core:** each bot fights **once every 30–48h** (per-bot base fixed at seed, ±20% jitter per tick), snapped into its **own UTC hour band** so bots never all fire at the same hour. An hourly BullMQ tick (`pvp-bot-activity`) claims each due bot atomically *before* fighting: a crash yields a **skipped turn** (invisible) rather than a double-fight (a visible anomaly). Exactly one fight per due bot per tick — never bursts.
- **Targeting:** the *unmodified* `pvpMatchmakingService.getOpponents` (same OVR windows humans get), minus protected/recovering candidates, minus **anyone this bot has attacked in the last 7 days** (a guard on the human's *experience*, distinct from the DP repeat-penalty which guards the *economy*), then picked **uniformly at random** — never DP-closest, or every bot would pile onto the same few humans. Bots never retaliate or grudge-target: a bot doesn't know it lost.
- **Bots fight each other too** — keeps the ladder shuffling organically without touching a real player.
- **Integrity:** bots are **excluded from season rewards, badges, and the Hall of Fame** (`finalizeSeason` marks them rewarded and pays nothing) and never evaluate badges for themselves — but the **human opponent's badge evaluation always runs**. Bots **do** decay, **can** become your rival, and soft-reset like anyone.
- **Bot-ness is unspoofable and unexposed:** every bot branch keys off DB-loaded `isPvpBot` inside `runResolution`, never a caller-supplied flag — a crafted request can't obtain bot treatment. `isPvpBot` is stripped in `toPublicFighter` and appears on **no** DTO. *Invariant: never add `isPvpBot` or bot-activity state to any client payload.*
- **Believability rules:** 25 distinct banners drawn only from pieces gated at/below a bot's plausible tier — **never** badge- or belt-gated pieces (a badge-gated banner on a fighter with an empty badge case is the tell). Staggered `nextActivityAt` at seed so 25 bots don't all fire on the first tick.
- **Career-profile coherence:** a bot's read-only profile renders from the *same* Fighter fields a human's does, so every field has to agree with every other one. All of it is **derived from the roster** (`consts/pvpBotRoster.js → deriveBotProfile`), never hand-entered:
  - **Win-method split** by style (`koWins`/`subWins`/`decisionWins`), always summing **exactly** to the stored wins — decisions absorb the rounding remainder. A BJJ bot wins by submission, a wrestler by decision. *(A 22-10 record showing 0/0/0 finishes was the original tell.)*
  - **Stats** use the real per-style `STYLES[style].start` shape a new player is dealt, scaled uniformly until `calculateOverall` reproduces the bot's **existing** OVR exactly. OVR is never recomputed — it is live identity and drives matchmaking. *(8 identical stat bars was the loudest tell: `ProfileStatsCard` draws one bar per stat.)*
  - **Fame** is back-computed from the split against the live `BASE_FIGHT_NOTORIETY` table (decisions blended 70/30 unanimous/split, losses 60/40 decision/finish), floored at 0. `peakTier` is written **explicitly** — `ensureNotorietyShape` only backfills it when falsy and the schema default `"UNKNOWN"` is truthy, so it can never self-heal, and the profile prints `tierLabel` *from peakTier, not score*. `lastEventAt` stays **null** by design: the decay batch only walks non-null rows, so a seeded score never decays and never needs re-seeding.
  - **`promotionTier`** follows the ordinary `PROMOTION_TIERS` OVR band (§5.1) — Regional Pro at OVR ≥ 30 — plus a style-appropriate **gym** and `careerTrainingSessions = fights × 4`.
  - **Badges are never seeded.** `getCareerProfile` runs `badgeService.evaluateBadges(...)` and saves on every profile view, so once the fields above are right the correct badges self-heal for free — including the training-session badges the session count now satisfies.
- **Seeding is convergent, not destructive:** `scripts/seedPvpBots.js` find-or-creates by `{isPvpBot, firstName, lastName}` — re-running is a no-op that heals missing records, drifted banners and the coherence fields above in place (**the convergence is also the migration** — there is no separate backfill script). The heal is **strictly additive**: it never writes `record.wins`, `record.losses`, `overallRating` or `badgesEarned`, because a real player may have fought this bot yesterday. The destructive `--reset` needs two flags plus an interactive confirm, honors `--dry-run`, **refuses outright if any bot fight has a human on the other side**, and never deletes `PVPFight` rows.
- **Known limits:** `MATCHMAKE_COUNT = 5` plus the 7-day cooldown means a bot can exhaust its own candidate list and idle — watch `consecutiveSkips`; the per-WC season rollover scatters 25 bots across 4 pools (~6 each), which sharpens that risk.

---

## 23. System Interconnections

The core loop: spend energy to train at a gym **or at your own camp (§6.8)** → training earns XP → XP raises stats → higher stats raise Overall → a higher rating qualifies for better gyms and title shots. The camp adds its own sub-loop that reads back into the career: PvE wins by your coach's method rank that coach up, a higher-ranked coach unlocks better drills and more XP, promotion tier raises the camp's effective tier, and skipping days degrades Facility Condition and slows everything down. Since Phase 1 the camp is also a standing **cash sink** — hire fees, weekly coach wages, renovation and Deep Clean all draw on fight purses — and coach morale ties the loop together: paying and using your staff weekly is what keeps their XP bonuses whole (§6.19). Before each fight, run a camp (conditional bonuses) and pick a weight-cut gamble; the fight pays cash, notoriety, and XP.

Notoriety is both a meter and an economy: spent on callouts (forced matchups with full intel), it gates sponsorship slots, and it's earned/lost through fights, event predictions, and media. Beef/Respect flags create grudge and rematch incentives across the division. The Shop and earned Energy Drinks let the player convert cash/achievement into tempo (energy, XP, fight buffs).

The **Proving Ground** (§22) is a parallel economy: the same trained stats and OVR that drive the PvE career also determine PvP matchmaking and fight outcomes, and season-end PvP rewards pay back into the shared currencies (cash, fame, energy drinks, badges) — so ladder climbing feeds the career and vice versa, without either path gating the other.

---

## 24. Accounts: Guest Lane, Recovery Codes & Claiming

Two ways into the game, one shared career system. The email-first lane (register with
email + password, verify email) is unchanged. The **guest lane** removes the sign-up
wall entirely: a player picks a fighter (same weight class / style / backstory step as
registration — §2) and is playing seconds later, with **zero feature restrictions**.
A guest is a real account with a real fighter; nothing in the game is gated on having
an email.

### 24.1 Design intent

- **Frictionless first fight.** The strongest onboarding is playing, not form-filling.
  Guests skip email/password and go straight to fighter creation.
- **No second-class citizens.** Guest limits create resentment, not conversions. A
  guest can train, fight, buy, and climb the Proving Ground ladder like anyone else.
- **Nudge, never force.** A persistent in-app banner ("You're playing as a guest —
  secure your account") points at the claim panel in the Account tab. It is never a
  blocking wall.

### 24.2 Session & recovery (two mechanisms)

- **Device token** — a long-lived (365-day) login token on the device gives silent
  auto-resume: close the tab, come back, still logged in.
- **Recovery code** — an optional one-time code (`XXXX-XXXX-XXXX-XXXX`, 16 chars,
  Crockford base32) shown **once** at creation. It is the cross-device / data-loss
  fallback: "Resume with a recovery code" on the landing/login screens logs the guest
  back in anywhere. Only a hash is stored server-side, so it can never be re-shown —
  the Account tab lets a guest **regenerate** a fresh code (60s cooldown), which
  invalidates the old one. Resuming on a new device does not log out other devices.
- A guest who loses the device token *and* never saved a code is unrecoverable — by
  design, accepted trade-off for a passwordless lane.

### 24.3 Claiming (guest → registered)

"Secure your account" in the Account tab attaches an email + password (min 8 chars,
≥1 number) to the guest account. Career, stats, purchases — everything is kept; only
the credentials change. On claim: the recovery code is invalidated (claimed accounts
use the normal password-reset path), other devices are logged out (fresh session),
and the standard email-verification flow takes over from the guest banner.

### 24.4 Inactivity purge

Unclaimed guest accounts (no email ever attached) inactive for **30 days** are
hard-deleted (fighter + account) by a daily sweep. Any authenticated activity
refreshes the clock, so an active guest is never at risk. Claimed accounts are
never purged by this sweep. Rationale: data minimization and keeping rankings free
of abandoned throwaway fighters.

### 24.5 Abuse controls

Guest creation is rate-limited per IP (~5/hour) on top of the general auth limiter;
recovery-code resume is rate-limited per IP (~10/hour) with a generic failure message
(no account-existence oracle). The 80-bit code space makes brute force infeasible.

---

## 25. Versioning & the What's New Changelog

The app has a player-facing version (`MAJOR.MINOR`, e.g. `1.0`) whose single
source of truth is `frontend/src/components/changelog/changelogContent.js`:
the newest entry's `version` **is** the app version. There is no separate
version constant and no backend endpoint — the version ships inside the bundle.

- **Footer button** — "What's New v1.0" in the logged-in footer (and the mobile
  drawer) opens the changelog modal: newest release expanded (highlights carry
  the new features, plus Changed / Fixed / Balance sections), older releases
  collapsed below.
- **Unseen dot** — `localStorage` (`gnp_last_seen_version`, disclosed in the
  Cookie Policy) remembers the last version viewed per device. A newer version
  shows a pulsing dot on the button.
- **Auto-open** — only for releases flagged `major: true`, once, for returning
  players. Never on a first-ever visit (baseline set silently) and never during
  the onboarding tutorial — if a major release lands mid-onboarding, the
  auto-open defers until the tutorial completes. Opening the modal by any means
  marks the version seen.
- **Editorial rules** — 3–5 highlights per release, player language (no ticket
  numbers/internals), and every balance line carries a short "why" (players
  accept changes they understand). Balance-relevant detail belongs in this GDD;
  the changelog is the announcement, the Library is the reference.
- **Release discipline** — bump the version (new entry, newest first) for every
  player-facing deploy; never edit a shipped entry's content without a new
  version, since the unseen badge keys off version equality.

---

## 26. Special Moves

Collectible, named techniques (*Granite Jaw*, *Sprawl Instinct*, *The Finisher*) that
give a **small, permanent in-fight edge** — a fighter-identity layer on top of stats.
Distinct from Fight Camp (§9): camp is *per-fight, opponent-reactive prep*; Special
Moves are *permanent, always-equipped*. **PvE-only** — they do **not** apply in the
Proving Ground (§22), and the PvP resolve path never builds a `moveBonuses` array.

### 26.1 Slots & the passive cap
**3 equip slots**, unlocked by promotion tier (derived from `promotionTier`, not stored):

| Slot | Unlocks at |
|---|---|
| Slot 1 | Amateur |
| Slot 2 | Regional Pro |
| Slot 3 | National |

GCS Contender/GCS add no 4th slot (ceiling 3, mirrors camp slots). Equip/unequip is free
and unrestricted **except while a fight is booked** (`acceptedFightId` set → locked, the
loadout freezes at camp finalize — see §26.5).

**Passive cap (balance rule): at most 2 always-on PASSIVE moves may be equipped at once**
— slot 3 must hold a Proc or Signature. Passives fire every round unconditionally, so three
stacked Legendary passives compound past the balance guardrail on lopsided-stat style
mirrors (Capoeira/BJJ). Capping at 2 forces loadout variety and keeps the worst case in band.

### 26.2 Rarity-scaling model
A move is **one concept** spanning up to four rarities (Common → Uncommon → Rare →
Legendary). A fighter owns each move at their **best-pulled rarity**; the fired value is a
rarity-keyed table lookup. Effect types: **Passive** (always-on), **Proc** (fires on an
existing fight trigger), **Signature** (Rare+ only, one bounded one-shot per fight).

### 26.3 Acquisition, upgrades & duplicates
- **Drop source — gyms:** sparring-family training sessions only, flat **4%** per session.
- **Drop source — My Camp (§6.8): odds are PER DRILL, not flat** (decision 2026-07-27,
  supersedes the flat-4%-everywhere rule for camp sessions only; the gym path is unchanged).
  A camp session's drop chance is a property of the drill you clicked:

  | Camp session | Drop chance |
  |---|---|
  | Rank-1 and Rank-3 coach drills (pad work, drilling, film study, …) | **0%** |
  | Coach flagships — Live Championship Rounds / Grind-It-Out Rounds / Live Rolling | **5%** |
  | Conditioning flagship (ships with the Conditioning coach, §6.12) | **3%** |
  | Open Mat Sparring (the coachless fallback) | **4%** — the control, matching the gym rate |

  Rationale: the flat rate existed because the gym had exactly one sparring family. The camp
  has a graded menu, so the loot roll rides the session that already costs the most energy,
  carries the most injury risk and wears down Facility Condition — the safe cheap drills are
  deliberately worth 0%, so the drop is a reason to take the hard session rather than a
  reason to spam the cheapest click. Open Mat holds the old 4% so the two systems remain
  directly comparable while they coexist.
- **The exact percentages stay internal-only** (decision 2026-07-08): player-facing surfaces
  (gym UI, camp UI, Library) say *"a chance — more rounds, better odds"*, never the number.
  The rarity split IF a drop happens **is** shown (stacked bar per gym tier).
- **Tier weights RARITY, not drop chance** — a better gym, or a higher camp tier, shifts the
  rarity distribution upward (Community can't roll Legendary; top-tier gyms roll it ~15%).
  Camp tiers map onto the same tables: Tier 1–2 → Amateur, Tier 3 → Regional Pro, Tier 4 →
  National.
- **Coach-flagship drops prefer the coach's own pool** (decision 2026-07-27, Camp Phase 1 —
  supersedes Phase 0's "no pool bias"). When a **coach flagship** drill drops a move, the
  rarity is rolled against the tier table first (unchanged), then the concrete move is
  drawn from **that coach's own teach pool** (the moves on his card — already
  breadth-limited by his rarity, so the bias never points at moves he can't teach)
  whenever the pool contains a move available at the rolled rarity, **falling back to the
  whole catalog** only when it doesn't. Ordering guarantees the bias can never inflate rarity — it only narrows *which*
  move arrives, making drops feel authored ("my striking coach dropped me a striking
  move") and previewing the Phase-2 teaching fantasy. **Open Mat Sparring keeps zero bias**
  (whole catalog, 4%) as the unbiased control, directly comparable to the gym path. Gym
  drops are untouched. See `docs/special-moves-spec.md` §4 for the amendment record.
- **Deterministic source — coach teaching (§6.21, Camp Phase 2):** promoting a camp coach
  grants moves from his own teach pool outright — no roll. Rank 2 grants pool slot 0, Rank 3
  grants none, Rank 4 grants every remaining slot at once; pool breadth is set by the coach's
  rarity, so a Common coach teaches one move total and a Legendary teaches his whole domain
  pool. The copy's rarity is the **coach's** rarity floored by the move's catalogue minimum
  (`teachRarityFor`), so this channel is how a player *chooses* a Legendary copy instead of
  waiting for one to roll. Granting is idempotent against the coach's stored `taughtMoveIds`,
  and a coach migrated in at Rank 4 has no promotions left, so he teaches nothing.
- **Upgrade vs duplicate:** a pull of a *strictly higher* rarity than owned **upgrades** the
  move in place (keeps `acquiredAt`); an equal-or-lower pull is a **duplicate → cash**
  (`fighter.iron`): Common 100 / Uncommon 250 / Rare 600 / Legendary 1,500. **Teaching uses
  the identical three outcomes** — one `grantOrUpgrade` is the sole writer of
  `specialMovesOwned`, so a taught move and a dropped move can never diverge.
- **No leveling, no pity timer, no PvP** (all deliberately cut from v1).

### 26.4 The roster (v1 — 12 moves) & balance
Values are per-rarity (C/U/R/L). Passive/Proc reuse existing engine `bonusType` branches;
Signatures use new per-fight, per-move one-shot state. **Numbers below are the post-QA
balance pass** — a Monte-Carlo sweep against the real engine showed the pre-trim values
breached the guardrail (worst single/stacked loadouts 63–74%), so passives were trimmed so
each is ~+3.5 pts single-move, and the passive cap (§26.1) was added. Net result: a full
Legendary loadout is a **smaller swing than a matched Fight Camp**, consistent with the
"flavorful edge, not a replacement power system" principle (§9, §22.4).

A 5th passive concept, **Complete Package** (`ALL_STATS`), was **cut** from v1: the sweep
proved `ALL_STATS` is untunable in this engine — it responds non-monotonically across styles
(≈+7 pts on Boxer but ≈0 on BJJ at the same value, then spiking with a tiny bump), so no
value gives consistent, fair behavior. The roster is intentionally **4 Passive / 5 Proc /
3 Signature**; `ALL_STATS` remains a valid engine branch but is used by no move.

| Move | Type | bonusType | Trigger | C / U / R / L |
|---|---|---|---|---|
| Granite Jaw | Passive | OPPONENT_DAMAGE_REDUCTION | always | .0125/.022/.0375/.05 → **trimmed** .008/.014/.023/.03 |
| Heavy Hands | Passive | STRIKE_DAMAGE | always | **.009/.016/.026/.035** |
| Body Snatcher | Passive | BODY_DAMAGE | always | **.016/.028/.05/.065** |
| Veteran IQ | Passive | OPPONENT_DAMAGE_REDUCTION | always | **.007/.012/.02/.028** (collapse-stacks w/ Granite Jaw) |
| Sprawl Instinct | Proc | SPRAWL_SUCCESS | opp. shoots TD | .05/.09/.14/.18 |
| Never Tap | Proc | ESCAPE_PROBABILITY | opp. sub attempt | .04/.075/.12/.16 |
| Clinch Killer | Proc | CLINCH_DAMAGE | striking exchange | **.035/.06/.10/.14** |
| Second Wind | Proc | STAMINA_DRAIN | stamina < 70% | .04/.07/.12/.16 |
| Mount Reaper | Proc | GNP_DAMAGE | top position | .04/.07/.13/.17 |
| The Finisher | Signature | SIG_FINISHER_STRIKE | opp. HP < 25% | R .08 / L .15 |
| Iron Recovery | Signature | SIG_IRON_RECOVERY | own HP < 25% | R .10 / L .18 |
| Killer Instinct | Signature | SIG_KILLER_INSTINCT | opp. HP < 25% | R .015 / L .035 |

**Collapse rule:** two equipped moves sharing a `bonusType` (e.g. Granite Jaw + Veteran IQ)
**sum** into one effect at the shared engine branch; move values and camp values also **add**.
Signatures never merge — each fires independently, keyed by `moveId`.

**Presentation — Ratings (display-only rebase).** Raw fractions read as "almost nothing"
(0.8%), so the UI presents every move value as an integer **Rating = fraction × 1000**
("+30 Defense Rating" instead of "3% less damage"), with a per-`bonusType` flavored unit
(Defense / Power / Sprawl / Cardio / … Rating), magnitude **pips + scale words** per rarity
(Slight / Solid / Heavy / Brutal), and the exact percentage kept as a parenthetical in the
description. The engine consumes raw fractions only; the ×1000 multiplier is a permanent
presentation contract (changing it would silently inflate every card). Implemented in
`describeMove` (`services/specialMovesService.js`) + `RarityPips` (frontend).

### 26.5 Fight integration & loadout freeze
`buildMoveBonuses` builds a `moveBonuses` array (shaped like camp's `sessionBonuses`),
consumed by extending the existing hand-written branches in `resolveRound()`. To stop a
mid-camp **upgrade** drop from silently changing an already-booked fight, the loadout is
**snapshotted at camp finalize** (mirroring how camp bonuses freeze) and the fight resolves
off that frozen snapshot, not live owned-rarity. Data lives on the fighter
(`specialMovesOwned` / `specialMovesEquipped`); the catalog is code
(`consts/specialMovesCatalog.js`), not a DB collection.

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
